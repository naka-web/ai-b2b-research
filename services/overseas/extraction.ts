import { load } from 'cheerio';
import { countryProfiles } from './countryProfiles';
import { normalizedName } from './deduplication';
import { assess } from './assessment';
import { officialSelfIdentity } from './identity';
import { confirmedContactForm, contactStatus } from './contact';
import { companyRoles } from './companyRoles';
import { pendingCompany, type PageSnapshot, type ResearchInput, type Product, type Relationship } from './types';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const matcha = /\bmatcha\b|抹茶/i;
const powder = /matcha\s*(?:powder|tea|pur|bio|premium|ceremonial|culinary)|(?:organic|japanese|japan|ceremonial|culinary|pure|bio)\s+matcha|matcha.{0,25}(?:poudre|pulver|100\s*%|aus Japan|japonais)|抹茶(?:原料|粉末)?/i;
const processed = /\b(?:cookies?|cakes?|chocolat\w*|ice cream|mochi|latte mix|latte blend|biscuits?|glace|bonbons?|eiscreme|kekse|cosmetics?)\b|菓子|アイス|ラテミックス/i;
const b2b = /\b(?:wholesale[rs]?|importer|distributor|foodservice|B2B|bulk supply|grossiste|importateur|distributeur|professionnels|restauration|Großhandel|Grosshandel|Großhändler|Importeur|Gastronomie)\b/i;
const originJP = /\bJapanese\s+(?:organic\s+|green\s+tea\s+)?matcha\b|\bJapan\s+(?:organic\s+|ceremonial\s+)?matcha\b|matcha\s+japonais|matcha.{0,30}\baus\s+Japan|(?:origin|origine|herkunft|ursprung|grown|produced|sourced|imported|cultivated).{0,35}\bJapan\b|\bJapan\b.{0,15}(?:origin|origine)|日本産|国産抹茶/i;
const originCN = /\bChinese\s+matcha|\bChina\s+matcha|matcha\s+chinois|matcha.{0,25}aus\s+China|(?:origin|origine|herkunft|grown|produced).{0,35}\bChina\b|中国産/i;
const originOther = /(?:origin|origine|herkunft|grown|produced).{0,25}(?:Korea|Vietnam|Thailand)|(?:Korean|Vietnamese)\s+matcha/i;
const regionPattern = /\b(?:Uji|Kyoto|Kagoshima|Nishio|Aichi|Shizuoka|Yame|Miyazaki|Kirishima|Nara|Mie|Fukuoka)\b|宇治|京都|鹿児島|西尾|愛知|静岡|八女|宮崎/gi;
function safeLink(href: string, base: string) { try { const u = new URL(href, base); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; } }
export function extract(input: ResearchInput, pages: PageSnapshot[]) {
  const result = pendingCompany(input); result.pages = pages; result.checkedAt = new Date().toISOString();
  const add = (field: string, quote: string, page: PageSnapshot) => {
    const existing = result.evidence.find(e => e.field === field && e.url === page.url && e.quote === clean(quote).slice(0, 650));
    if (existing) return existing.id;
    const id = `e${result.evidence.length + 1}`;
    result.evidence.push({ id, field, quote: clean(quote).slice(0, 650), url: page.url, checkedAt: page.fetchedAt, source: 'official_website' }); return id;
  };
  const legalNames = new Set<string>();
  const selfCountries = new Set<string>();
  for (const page of pages) {
    const form = confirmedContactForm(page, input.website);
    if (form && !result.contactFormUrl) { result.contactFormUrl = form.url; add('contactForm', form.quote, page); }
    for (const finding of companyRoles(input, page)) {
      result.companyRoles = result.companyRoles.filter(r => r.role !== 'unknown');
      if (!result.companyRoles.some(r => r.role === finding.role)) {
        result.companyRoles.push(finding);
        add(`role:${finding.role}`, finding.evidenceText!, page);
      }
    }
    for (const finding of officialSelfIdentity(input, page)) {
      selfCountries.add(finding.country);
      if (finding.country === input.country) { result.identityConfirmed = true; add('identity', finding.quote, page); }
    }
    const $ = load(page.html);
    const structured: Record<string, unknown>[] = [];
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; structured.push(o); Object.values(o).filter(x => x && typeof x === 'object').forEach(walk); } };
    $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text())); } catch { /* malformed schema is not evidence */ } });
    $('script,style,noscript,svg').remove();
    $('br').replaceWith('\n'); $('p,div,li,h1,h2,h3,h4,tr,address').append('\n');
    const text = $('body').text(); const lines = text.split(/\n+/).map(clean).filter(Boolean);
    const identityPage = countryProfiles[input.country].legal.test(`${page.url} ${$('title').text()} ${$('h1').text()}`);
    const needle = normalizedName(input.name.replace(/\b(gmbh|inc|llc|ltd|sas|sarl|co)\b/gi, ''));
    const nameMatches = needle.length > 2 && normalizedName(text).includes(needle);
    for (const o of structured) {
      const type = String(o['@type'] || '');
      if (/Organization|Corporation|LocalBusiness|Store/.test(type) && typeof o.name === 'string' && nameMatches) {
        const a = o.address as Record<string, unknown> | undefined;
        if (a && typeof a === 'object') {
          const countryValue = typeof a.addressCountry === 'object' ? (a.addressCountry as Record<string, unknown>)?.name : a.addressCountry;
          const country = String(countryValue || '');
          if (country === input.country || countryProfiles[input.country].country.test(country)) {
            const address = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, country].filter(v => typeof v === 'string').join(', ');
            if (a.streetAddress && a.addressLocality) { result.address = address; result.legalName = String(o.legalName || o.name); legalNames.add(result.legalName); result.identityConfirmed = true; add('identity', `${result.legalName}: ${address}`, page); }
          }
        }
      }
    }
    if (identityPage && nameMatches) {
      const legalLine = lines.find(l => l.length < 200 && /\b(?:GmbH|GbR|UG\b|Inc\.?|LLC|Ltd\.?|SARL|SAS\b|SASU|S\.A\.)/.test(l) && (normalizedName(l).includes(needle) || needle.includes(normalizedName(l))));
      const namedLine = legalLine || lines.find(l => l.length < 140 && normalizedName(l).includes(needle));
      const postalIndex = lines.findIndex(l => input.country === 'US' ? /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(l) : input.country === 'NL' ? /\b\d{4}\s?[A-Z]{2}\s+[\p{L}]/u.test(l) : /\b\d{5}\s+[\p{L}]/u.test(l));
      if (namedLine && postalIndex >= 0) {
        const address = lines.slice(Math.max(0, postalIndex - 1), postalIndex + 3).join(', ');
        if (countryProfiles[input.country].country.test(address) || (input.country === 'US' && /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\s+\d{5}\b/.test(address))) {
          result.legalName = namedLine; result.address = address; result.identityConfirmed = true; if (legalLine) legalNames.add(legalLine); add('identity', `${namedLine}: ${address}`, page);
        }
      }
    }
    const emails = new Set([...(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []), ...$('a[href^="mailto:"]').map((_, e) => $(e).attr('href')!.slice(7).split('?')[0]).get()]);
    for (const email of emails) if (!result.emails.includes(email) && (email.toLowerCase().endsWith('@' + new URL(page.url).hostname.replace(/^www\./, '')) || /gmail\.com|outlook\.com|yahoo\.com|gmx\.de|web\.de/i.test(email))) { result.emails.push(email); add('email', email, page); }
    const phones = [...$('a[href^="tel:"]').filter((_, e) => !/fax|^F:/i.test($(e).parent().text())).map((_, e) => $(e).attr('href')!.slice(4)).get(), ...lines.filter(l => /^(?:Tel(?:ephone|efon)?\.?|Phone|Tél(?:éphone)?\.?|T:)\s*[:.]?/i.test(l)).map(l => l.replace(/^[^\d+]+/, ''))];
    for (const phone of phones) { const p = phone.slice(0, 70); if ((p.match(/\d/g) || []).length >= 7 && !result.phones.some(old => old.replace(/\(0\)/g, '').replace(/\D/g, '') === p.replace(/\(0\)/g, '').replace(/\D/g, ''))) { result.phones.push(p); add('phone', p, page); } }
    // Keep individual product cards/heading sections separate; never apply a site's Japan mention to every product.
    const scopes: { title: string; text: string; url: string; explicitProduct?: boolean }[] = [];
    for (const o of structured) if (String(o['@type']).includes('Product') && typeof o.name === 'string') {
      const co = o.countryOfOrigin; const origin = typeof co === 'string' ? co : co && typeof co === 'object' ? String((co as Record<string, unknown>).name || '') : '';
      scopes.push({ title: o.name, text: `${o.name}. ${typeof o.description === 'string' ? o.description : ''}${origin ? `. Origin: ${origin === 'JP' ? 'Japan' : origin === 'CN' ? 'China' : origin}` : ''}`, url: safeLink(String(o.url || page.url), page.url) || page.url, explicitProduct: true });
      const maker = o.manufacturer as Record<string, unknown> | undefined;
      if (maker && typeof maker.name === 'string' && matcha.test(o.name)) {
        const country = JSON.stringify(maker.address || '');
        if (/Japan|日本|"JP"/i.test(country)) result.suppliers.push({ name: maker.name, relationship: '商品掲載メーカー', productId: null, evidenceIds: [add('manufacturer', `${o.name}: manufacturer ${maker.name}, ${country}`, page)] });
      }
    }
    $('[itemtype*="Product"],.product-card,.product-item,li.product,[data-product-id]').each((_, el) => { const t = clean($(el).text()); if (t.length < 3000) scopes.push({ title: clean($(el).find('h1,h2,h3,h4').first().text()) || t.slice(0, 110), text: t, url: safeLink($(el).find('a[href]').first().attr('href') || page.url, page.url) || page.url, explicitProduct: true }); });
    const main = $('main').length ? $('main').clone() : $('body').clone(); main.find('nav,header,footer,form').remove();
    main.find('h1,h2,h3,h4').each((_, el) => { $(el).before('\nSECTION_START\n'); });
    for (const segment of main.text().split('SECTION_START')) {
      const parts = segment.split(/\n+/).map(clean).filter(Boolean); const t = clean(segment);
      if (t && t.length <= 3000) scopes.push({ title: parts[0] || $('title').text(), text: t, url: page.url });
    }
    for (const scope of scopes) {
      const t = scope.text; if (!matcha.test(t)) continue;
      const productTitle = matcha.test(scope.title);
      const kind: Product['kind'] = processed.test(scope.title) ? '加工品' : powder.test(t) && !/(?:whisk|bowl|chasen|茶筅|茶碗)/i.test(scope.title) ? '抹茶原料・茶商品' : '未確認';
      if (!productTitle && !scope.explicitProduct && !b2b.test(scope.title)) continue;
      if (kind === '未確認') continue;
      // Style, inspiration and quality describe a comparison, not product origin.
      // Remove only the qualified phrase so independent origin statements still count.
      const originText = t
        .replace(/\binspired\s+by\s+Japanese\s+(?:organic\s+|green\s+tea\s+)?matcha\b/gi, '')
        .replace(/Japanese[\s-]+(?:(?:organic\s+|green\s+tea\s+)?matcha[\s-]+)?(?:style|inspired|quality|tradition\w*)\b/gi, '')
        .replace(/\bnot\s+(?:(?:grown|produced|sourced|imported|cultivated)\s+)(?:in|from)\s+Japan\b/gi, '')
        .replace(/(?:not|nicht|pas|non).{0,12}(?:from Japan|Japanese|japonais)/gi, '');
      const jp = originJP.test(originText), cn = originCN.test(originText), other = originOther.test(originText);
      const origin = jp && !cn && !other ? 'JP' : cn && !jp && !other ? 'CN' : other && !jp && !cn ? 'OTHER' : '未確認';
      const existing = result.products.find(p => p.url === scope.url && p.name === scope.title);
      if (!existing && result.products.length < 30) {
        const id = `p${result.products.length + 1}`;
        result.products.push({ id, name: scope.title.slice(0, 180), url: scope.url, kind, origin,
          region: origin === 'JP' ? [...new Set(t.match(regionPattern) || [])].join(', ') || null : null,
          processing: /(?:milled|ground|packaged|packed|vermahlen|verpackt).{0,35}(?:Germany|Deutschland|France|USA)/i.exec(t)?.[0] || null,
          evidenceIds: [add('product', t, page), ...(origin !== '未確認' ? [add('origin', (() => { const m = (origin === 'JP' ? originJP : origin === 'CN' ? originCN : originOther).exec(originText); const index = m?.index || 0; return `${scope.title}: ${originText.slice(Math.max(0, index - 70), index + 350)}`; })(), page)] : [])] });
      }
    }
    // Read bounded paragraphs rather than a flattened whole-page keyword score.
    $('nav,header,footer,[role="navigation"],.menu,.navigation').remove();
    const paragraphs = $('p,li,dd,td').map((_, el) => clean($(el).text())).get().filter(t => t.length > 35 && t.length < 1200);
    for (const t of paragraphs) {
      if (b2b.test(t) && /matcha|\btea\b|\bth[eé]\b|\btee\b/i.test(t) &&
        /(?:we|our|nous|notre|wir|unser\w*).{0,100}(?:supply|suppl|sell|offer|import|distribut|wholesale|fourn|propos|bieten|liefer)|(?:wholesale|Großhandel|B2B).{0,45}(?:supply|sales|verkauf|liefern)|(?:bietet|beliefert|supports|supplies|offers).{0,100}(?:B2B|wholesale|Großhandel|foodservice|professionell)/i.test(t) &&
        !/\b(?:not|no|kein\w*|nicht|pas|sans)\b.{0,35}(?:wholesale|B2B|Großhandel|grossiste)|\b(?:looking for|searching for|how to|guide to|recherchons)\b/i.test(t)) {
        result.b2bEvidenceIds.push(add('b2b', t, page));
      }
      if (/(?:retail only|only.{0,12}retail|do not.{0,12}wholesale|kein.{0,10}Großhandel|nur.{0,10}Einzelhandel|vente.{0,12}uniquement.{0,10}particuliers)/i.test(t)) add('retailOnly', t, page);
      // Explicit named relationships only. Generic "direct from Japan" never creates a supplier.
      const relation = /(?:supplier|manufacturer|fabricant|fournisseur|Lieferant|Hersteller)\s*[:：]\s*([^.;\n]{3,100})/i.exec(t);
      if (relation && matcha.test(t) && !/miso|soy sauce|sojasauce/i.test(t) && (/(?:Japanese|日本の)\s*(?:supplier|manufacturer|fabricant|fournisseur)/i.test(t) || /(?:\(|,)\s*(?:Japan|日本|JP)\b/i.test(relation[1]))) {
        const name = relation[1].replace(/\s*\([^)]*\).*$/, '').replace(/,?\s*(?:Japan|日本).*$/i, '').trim();
        if (name && !/^(?:in |from |aus |Japan|日本|unknown|未確認)/i.test(name)) {
          const relationship: Relationship = /(?:BOL|bill of lading|shipment ID|invoice number)\s*[:#]/i.test(t) && /importer\s*:/i.test(t) ? '個別取引確認' :
            /(?:our group|group manufacturer|group company|unserer Gruppe)/i.test(t) ? 'グループ製造元' :
            /(?:we (?:buy|purchase|source|import).{0,35}from|our supplier|notre fournisseur|unser Lieferant)/i.test(t) ? 'Supplier関係確認' : '商品掲載メーカー';
          if (!result.suppliers.some(s => s.name === name && s.relationship === relationship)) result.suppliers.push({ name, relationship, productId: null, evidenceIds: [add('supplier', t, page)] });
        }
      }
    }
  }
  if (legalNames.size > 1) { result.identityConfirmed = false; result.warnings.push('複数の法人名候補があります。会社主体の対応を確認してください。'); }
  if (selfCountries.size > 1 || (selfCountries.size && !selfCountries.has(input.country))) {
    result.identityConfirmed = false;
    result.warnings.push('会社自身の拠点記述が対象国と矛盾するか、複数国にまたがっています。会社主体を確認してください。');
  }
  result.email = result.emails[0] || null;
  result.contactStatus = contactStatus(result.emails, result.contactFormUrl, !pages.length);
  Object.assign(result, assess(result));
  return result;
}
