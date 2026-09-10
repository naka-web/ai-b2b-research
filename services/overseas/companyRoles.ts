import { load } from 'cheerio';
import { domainKey, normalizedName } from './deduplication';
import type { CompanyRole, CompanyRoleEvidence, PageSnapshot, ResearchInput } from './types';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const definitions: [Exclude<CompanyRole, 'unknown'>, RegExp][] = [
  ['importer', /\b(?:importer[s]?|import(?:s|ing)?|importateur[s]?|importons|importieren|importiert|Importeur[e]?|importeren|importeert)\b/i],
  ['distributor', /\b(?:distributor[s]?|distribut(?:e|es|ing|ion)|distributeur[s]?|distribuons|distribueren|verdeler[s]?)\b|Vertriebspartner/i],
  ['wholesaler', /\b(?:wholesal(?:e|er|ers)|grossiste[s]?|groothandel|Großhandel|Grosshandel|Großhändler|Grosshändler)\b/i],
  ['supplier', /\b(?:supplier[s]?|suppl(?:y|ies|ying)|fournisseur[s]?|fournissons|liefern|beliefert|Lieferant(?:en)?|leverancier[s]?|leveren)\b/i],
  ['retailer', /\b(?:retailer[s]?|retail store|Einzelhändler|Einzelhandel|détaillant|detailhandel)\b/i],
  ['ecommerce', /\b(?:online[ -](?:shop|store)|e-commerce|webshop|boutique en ligne|Onlineshop)\b/i],
  ['cafe_or_shop', /(?<![\p{L}])(?:caf[eé]s?|coffee shop|tea shop|tea room|teahouse|salon de th[eé]|Teeladen|theewinkel)(?![\p{L}])/iu],
  ['manufacturer', /\b(?:manufacturer[s]?|manufactur(?:e|es|ing)|fabricant[s]?|fabriquons|Hersteller|herstellen|produzieren|fabrikant|produceren)\b/i],
];
const negative = /\b(?:not|no|never|don't|doesn't|cannot|kein\w*|nicht|pas|sans|geen|niet)\b|\b(?:looking for|searching for|seeking|how to|guide to|recherchons|used to|formerly|previously)\b/i;
const firstPerson = /\b(?:we|our|nous|notre|nos|wir|unser\w*|wij|we|onze|ons)\b/i;
const assertion = /\b(?:we\s+(?:(?:directly|also|proudly)\s+)*(?:are|import\w*|distribut\w*|suppl\w*|manufactur\w*|sell|offer|provide|feature|pride ourselves on offering|operate|run|produce|speciali[sz]e in)|our\s+(?:company|business|online|webshop|shop|caf[eé]|tea shop|wholesale)|nous\s+(?:sommes|importons|distribuons|fournissons|fabriquons|proposons)|notre\s+(?:entreprise|société|boutique)|wir\s+(?:sind|importieren|liefern|produzieren|betreiben|bieten)|unser\w*\s+(?:Unternehmen|Onlineshop|Großhandel)|(?:wij|we)\s+(?:zijn|importeren|leveren|produceren|bieden)|onze\s+(?:groothandel|webshop|winkel|onderneming))\b/i;

export function companyRoles(input: ResearchInput, page: PageSnapshot): CompanyRoleEvidence[] {
  if (domainKey(page.url) !== domainKey(input.website) || /\b(?:blogs?|news|reviews?|testimonials?)\b/i.test(new URL(page.url).pathname)) return [];
  const $ = load(page.html);
  $('script,style,noscript,nav,header,footer,form,blockquote,q,[role="navigation"],[itemprop="review"],.review,.reviews,.testimonial,.testimonials').remove();
  const firstName = input.name.split('|')[0].trim();
  const host = domainKey(input.website);
  const name = normalizedName((normalizedName(firstName) === normalizedName(host) ? host.split('.')[0] : firstName).replace(/\b(?:GmbH|Inc|LLC|Ltd|B\.V\.)\b/gi, ''));
  const findings: CompanyRoleEvidence[] = [];
  const blocks = $('p,li,dd,td,h1,h2,h3,div').filter((_, el) => !$(el).find('p,li,dd,td,h1,h2,h3,div').length)
    .map((_, el) => clean($(el).text())).get().filter(t => t.length >= 12 && t.length <= 1200);
  for (const block of blocks) {
    for (const text of block.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/u)) {
      if (negative.test(text) || /\b(?:our|your)\s+(?:(?:wholesale|tea|matcha|B2B|business|foodservice)\s+)*(?:suppliers?|distributors?|importers?|manufacturers?|customers?|partners?)\b/i.test(text)) continue;
      const subject = /^(?:The\s+)?(.{3,100}?)\s+(?:is|are|est|ist|zijn)\b/i.exec(text)?.[1];
      const named = !!subject && [name, normalizedName(host.split('.')[0])].some(n => n.length >= 4 && normalizedName(subject) === n);
      const self = assertion.test(text) || named;
      const descriptor = text.length < 220 && /^(?:(?:your|a|an|the|leading|official|specialist|specialized|trusted|premium|Japanese|organic|tea|matcha|wholesale|global|European|US-based|U\.S\.-based)\s+)*(?:importer|distributor|wholesale supplier|wholesaler|manufacturer)\b/i.test(text);
      if (!self && !descriptor) continue;
      const claimStart = named || descriptor ? 0 : assertion.exec(text)?.index || 0;
      for (const [role, pattern] of definitions) {
        const match = pattern.exec(text);
        if (!match || match.index < claimStart) continue;
        // Customer audiences and suppliers of this business are not the business's own role.
        const prefix = text.slice(claimStart, match.index);
        if (/\b(?:to|for|from|with|by|serving|serves|including|aux|pour|von|für|aan|voor)\b[^.!?;]{0,65}$/i.test(prefix)) continue;
        if (/\b(?:suppl(?:y|ies)|sell|serve|support|help|offer)\b[^.!?;]{0,65}$/i.test(prefix) && !['supplier', 'wholesaler'].includes(role)) continue;
        if ((role === 'importer' || role === 'distributor' || role === 'manufacturer') && firstPerson.test(text) && !self) continue;
        const evidenceText = text.length <= 420 ? text : text.slice(Math.max(0, match.index - 160), match.index + 240);
        if (!findings.some(f => f.role === role)) findings.push({ role, evidenceUrl: page.url, evidenceText });
      }
      // Supplying trade clients establishes wholesale activity, not importing/distribution.
      if (self && /matcha|\b(?:tea|th[eé]|tee)\b/i.test(text) && /\b(?:suppl(?:y|ies)|sell|offer|provide|fournissons|liefern|leveren)\b/i.test(text) && /\b(?:B2B|foodservice|bulk|wholesale (?:account|customers)|business customers|horeca|professionnels)\b/i.test(text) && !findings.some(f => f.role === 'wholesaler')) {
        findings.push({ role: 'wholesaler', evidenceUrl: page.url, evidenceText: text.slice(0, 420) });
      }
    }
  }
  return findings;
}
