import type { ResearchInput } from './types';
export function canonicalWebsite(input: string) {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('http / https の公式サイトURLを入力してください');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}
export function domainKey(input: string) { return new URL(input).hostname.toLowerCase().replace(/^www\./, ''); }
export function normalizedName(name: string) { return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
// Domain duplicates are prevented at intake, never silently merged as legal entities.
export function findDuplicate(companies: ResearchInput[], candidate: ResearchInput) {
  return companies.find(c => domainKey(c.website) === domainKey(candidate.website) ||
    (c.country === candidate.country && normalizedName(c.name) === normalizedName(candidate.name)));
}
