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
export function companyNameSimilarity(expected: string, actual: string) {
  const simplify = (value: string) => value.toLowerCase().normalize('NFKC')
    .replace(/\b(?:incorporated|inc|limited|ltd|llc|corp(?:oration)?|company|co|sarl|gmbh|plc)\b\.?/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const left = simplify(expected), right = simplify(actual); if (!left || !right) return 0;
  if (left === right) return 1; if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(' ').filter(token => token.length > 1));
  const rightTokens = new Set(right.split(' ').filter(token => token.length > 1));
  const overlap = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}
// Domain duplicates are prevented at intake, never silently merged as legal entities.
export function findDuplicate<T extends ResearchInput>(companies: T[], candidate: ResearchInput): T | undefined {
  return companies.find(c => domainKey(c.website) === domainKey(candidate.website) ||
    (c.country === candidate.country && normalizedName(c.name) === normalizedName(candidate.name)));
}
