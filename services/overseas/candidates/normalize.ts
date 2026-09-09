import { canonicalWebsite, domainKey, normalizedName } from '../deduplication';
import type { CandidateType, UsaCandidate } from './types';

export function candidateTypeFromEvidence(text: string, hsCode = ''): CandidateType {
  if (/\bmatcha\b|抹茶/i.test(text)) return 'matcha_direct';
  if (/\bgreen[ -]tea\b/i.test(text) || ['090210', '090220'].includes(hsCode.replace(/\D/g, ''))) return 'green_tea_candidate';
  return 'unconfirmed';
}

export function candidateWebsite(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = canonicalWebsite(value);
    const host = domainKey(url);
    // Directory/social/marketplace pages are sources, not official company website candidates.
    if (['facebook.com', 'instagram.com', 'linkedin.com', 'yelp.com', 'google.com', 'amazon.com', 'alibaba.com', 'importyeti.com', 'importgenius.com', 'volza.com', 'tradeatlas.com'].some(d => host === d || host.endsWith('.' + d))) return '';
    return url;
  } catch { return ''; }
}

export function deduplicateCandidates(rows: UsaCandidate[]) {
  const candidates: UsaCandidate[] = [];
  let duplicatesRemoved = 0;
  for (const row of rows) {
    const name = normalizedName(row.companyName);
    const location = normalizedName(row.location);
    const host = row.candidateOfficialUrl ? domainKey(row.candidateOfficialUrl) : '';
    const existing = candidates.find(c => {
      if (c.country !== row.country || !name || normalizedName(c.companyName) !== name) return false;
      const otherLocation = normalizedName(c.location);
      const otherHost = c.candidateOfficialUrl ? domainKey(c.candidateOfficialUrl) : '';
      if (location && otherLocation && location !== otherLocation) return false;
      if (host && otherHost && host !== otherHost) return false;
      // Same source record, or an exact name + domain + location match. No domain-only merges.
      return (c.sourceName === row.sourceName && c.id === row.id) ||
        Boolean(host && otherHost === host && location && otherLocation === location);
    });
    if (!existing) { candidates.push({ ...row, evidence: [...row.evidence], attributions: [...row.attributions] }); continue; }
    duplicatesRemoved++;
    for (const e of row.evidence) if (!existing.evidence.some(old => JSON.stringify(old) === JSON.stringify(e))) existing.evidence.push(e);
    for (const a of row.attributions) if (!existing.attributions.some(old => old.name === a.name && old.url === a.url)) existing.attributions.push(a);
    existing.location ||= row.location;
    existing.candidateOfficialUrl ||= row.candidateOfficialUrl;
    const ranks: CandidateType[] = ['unconfirmed', 'green_tea_candidate', 'matcha_direct'];
    if (ranks.indexOf(row.candidateType) > ranks.indexOf(existing.candidateType)) existing.candidateType = row.candidateType;
  }
  return { candidates, duplicatesRemoved };
}
