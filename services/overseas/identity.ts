import { load } from 'cheerio';
import { domainKey, normalizedName } from './deduplication';
import type { Country, PageSnapshot, ResearchInput } from './types';

const countryTerms: Record<Country, string> = {
  US: '(?:U\\.?S\\.?(?:A\\.?)?|United States(?: of America)?)',
  DE: '(?:Germany|Deutschland)',
  FR: 'France',
};
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Supplement full-address identity checks with explicit first-party location statements.
// A domain/name match only binds the speaker; it never establishes a country by itself.
export function officialSelfIdentity(input: ResearchInput, page: PageSnapshot): { country: Country; quote: string }[] {
  if (domainKey(page.url) !== domainKey(input.website)) return [];
  const $ = load(page.html);
  const pageContext = `${new URL(page.url).pathname} ${$('h1').first().text()}`;
  if (/\b(?:blogs?|news|reviews?|testimonials?)\b/i.test(pageContext)) return [];
  $('script,style,noscript,blockquote,q,[itemprop="review"],.review,.reviews,.testimonial,.testimonials').remove();
  const firstName = input.name.split(/\s*[|｜]\s*/)[0].trim();
  const host = domainKey(input.website);
  const name = normalizedName(firstName) === normalizedName(host) ? host.split('.')[0] : firstName;
  if (normalizedName(name).length < 3) return [];
  const namePattern = name.split(/[\s.,&()\-]+/).filter(Boolean).map(escape).join('[\\s.,&()\\-]*');
  const named = new RegExp(`^${namePattern}(?=\\s|[,.:]|$)`, 'i');
  const brandText = `${$('title').text()} ${$('h1').first().text()} ${$('header').text()} ${$('meta[property="og:site_name"]').attr('content') || ''}`;
  const branded = new RegExp(`(?:^|[^\\p{L}\\p{N}])${namePattern}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(brandText);
  const companyPage = new URL(page.url).pathname === '/' || /about|contact|company|legal|terms|privacy|impressum|kontakt|mentions|policies/i.test(pageContext);
  const quotes = new Set<string>();
  $('p,li,address,footer,div').each((_, el) => {
    // Leaf blocks avoid borrowing a supplier's location from a neighboring section.
    if ($(el).find('p,li,address,footer,div,blockquote,q').length) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length <= 1200) quotes.add(text);
  });
  const findings: { country: Country; quote: string }[] = [];
  for (const quote of quotes) {
    for (const sentence of quote.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      if (/\b(?:not|never|formerly|previously|no longer|nicht|kein\w*|pas)\b/i.test(sentence)) continue;
      let claim = '';
      if (named.test(sentence)) claim = sentence.replace(named, '').replace(/^\s*[,.:]?\s*/, '');
      else if (branded && companyPage && /^(?:we\b|our (?:company|business|headquarters)\b)/i.test(sentence)) claim = sentence;
      else if (branded && companyPage && new RegExp(`^At ${namePattern},\\s+we\\b`, 'i').test(sentence)) claim = sentence.replace(new RegExp(`^At ${namePattern},\\s+`, 'i'), '');
      if (!claim) continue;
      claim = claim.replace(/^(?:we|our (?:company|business|headquarters))\s+/i, '').replace(/^(?:is|are|operates as)\s+/i, '');
      const noun = '(?:(?:wholesale|matcha|tea|green tea|B2B)\\s+){0,3}(?:company|business|supplier|wholesaler|distributor|importer)';
      for (const country of Object.keys(countryTerms) as Country[]) {
        const place = countryTerms[country];
        const countryBased = new RegExp(`^(?:a[n]?\\s+)?${place}[\\s\\-–‑]+based(?:\\s+${noun}\\b|(?=[.,;]|$))`, 'i');
        const countryCompany = new RegExp(`^(?:a[n]?\\s+)?${place}\\s+company\\b`, 'i');
        const located = new RegExp(`^(?:(?:a[n]?\\s+)?${noun}\\s+)?(?:based|headquartered|located)\\s+in\\s+(?:the\\s+)?(?:[\\p{L} ]{2,45},\\s*){0,2}${place}(?=[\\s,.;]|$)`, 'iu');
        const serving = new RegExp(`^serv(?:e|ing)\\s+from\\s+(?:the\\s+)?(?:[\\p{L} ]{2,45},\\s*){0,2}${place}(?=[\\s,.;]|$)`, 'iu');
        if (countryBased.test(claim) || countryCompany.test(claim) || located.test(claim) || serving.test(claim)) {
          if (!findings.some(f => f.country === country && f.quote === sentence)) findings.push({ country, quote: sentence });
        }
      }
    }
  }
  return findings;
}
