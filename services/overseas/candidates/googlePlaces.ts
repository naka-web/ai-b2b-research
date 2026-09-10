import { countryProfiles, isCountry } from '../countryProfiles';
import type { Country } from '../types';
import { candidateTypeFromEvidence, candidateWebsite, deduplicateCandidates } from './normalize';
import { companyNameSimilarity } from '../deduplication';
import { MAX_CANDIDATES, MAX_KEYWORDS } from './conditions';
import type { CandidateProvider, CandidateSearchConditions, CandidateSearchResult, UsaCandidate, WebsiteCandidateMatch } from './types';

export type PlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { shortText?: string; types?: string[] }[];
  websiteUri?: string;
  googleMapsUri?: string;
  attributions?: { provider?: string; providerUri?: string }[];
};
export function placeToCandidate(place: PlaceResult, keyword: string, country: Country = 'US'): UsaCandidate | null {
  // regionCode biases the search; only the returned country component establishes the selected country.
  if (!place.addressComponents?.some(c => c.types?.includes('country') && c.shortText === country)) return null;
  const name = place.displayName?.text?.trim() || '';
  if (!place.id || !name) return null;
  const location = place.formattedAddress || '';
  const sourceUrl = safeSourceUrl(place.googleMapsUri);
  const quote = [name, location].filter(Boolean).join(' — ');
  return {
    id: `google-places:${place.id}`, companyName: name, country, location, provider: 'google_places',
    candidateOfficialUrl: candidateWebsite(place.websiteUri),
    candidateWebsiteStatus: candidateWebsite(place.websiteUri) ? 'candidate_found' : 'not_searched',
    candidateWebsiteReason: candidateWebsite(place.websiteUri) ? 'Google Places登録URL（公式サイト同一性は未確認）' : '',
    candidateWebsiteIdentityEvidence: null, candidateWebsiteMatchaStatus: 'unconfirmed', sourceType: 'places_api',
    sourceName: 'Google Maps', sourceUrl, matchedKeyword: keyword,
    hsCode: '', productDescription: '', tradeDirection: '', supplierName: '',
    evidence: [{ sourceUrl, sourceName: 'Google Maps', matchedKeyword: keyword, quote }],
    // A query hit is not product evidence. Places offers no product description in this request.
    candidateType: candidateTypeFromEvidence(name),
    attributions: (place.attributions || []).map(a => ({ name: a.provider || '', url: safeSourceUrl(a.providerUri) })),
    tradeEvidence: [],
  };
}
export async function findCompanyWebsiteCandidates(apiKey: string, input: { companyName: string; country: Country }, request: typeof fetch = fetch): Promise<WebsiteCandidateMatch[]> {
  const profile = countryProfiles[input.country];
  const response = await request('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.websiteUri,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: `${input.companyName} ${profile.candidateSearch.placeName} official website`, regionCode: input.country, languageCode: 'en', pageSize: 5 }),
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google Places: HTTP ${response.status}`);
  const payload = await response.json() as { places?: PlaceResult[] };
  if (payload.places !== undefined && !Array.isArray(payload.places)) throw new Error('Google Placesの応答形式を確認できません。');
  const matches = new Map<string, WebsiteCandidateMatch>();
  for (const place of payload.places || []) {
    if (!place.addressComponents?.some(component => component.types?.includes('country') && component.shortText === input.country)) continue;
    const url = candidateWebsite(place.websiteUri); const placeName = place.displayName?.text?.trim() || '';
    if (!url || !placeName) continue;
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const match = { url, placeName, location: place.formattedAddress || '', nameSimilarity: companyNameSimilarity(input.companyName, placeName), sourceUrl: safeSourceUrl(place.googleMapsUri) };
    const old = matches.get(host); if (!old || match.nameSimilarity > old.nameSimilarity) matches.set(host, match);
  }
  return [...matches.values()].sort((a, b) => b.nameSimilarity - a.nameSimilarity).slice(0, 5);
}
function safeSourceUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.toString() : ''; } catch { return ''; }
}
export function normalizeConditions(value: unknown): CandidateSearchConditions {
  if (!value || typeof value !== 'object') throw new Error('検索条件を確認してください。');
  const input = value as Record<string, unknown>;
  if (!isCountry(input.country) || !Array.isArray(input.keywords) || !input.keywords.length || input.keywords.length > MAX_KEYWORDS ||
      input.keywords.some(k => typeof k !== 'string' || !countryProfiles[input.country as Country].candidateSearch.keywords.includes(k))) throw new Error('選択国の検索語を1〜3個選択してください。');
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > MAX_CANDIDATES)) throw new Error('候補件数は1〜30件です。');
  if (input.hsCodes !== undefined || input.productTerms !== undefined) throw new Error('現在の取得元はHS・貿易データ検索に対応していません。');
  return { country: input.country, keywords: [...new Set(input.keywords as string[])].sort(), limit: Number(input.limit || MAX_CANDIDATES) };
}
export function createGooglePlacesProvider(apiKey: string, request: typeof fetch = fetch): CandidateProvider {
  return {
    id: 'google-places', name: 'Google Maps / Places API (New)', kind: 'google_places',
    async search(input) {
      const conditions = normalizeConditions(input);
      const profile = countryProfiles[conditions.country];
      const result: CandidateSearchResult = { candidates: [], apiRequests: 0, duplicatesRemoved: 0, warnings: [], cacheHit: false, incomplete: false };
      if (!apiKey) { result.incomplete = true; result.warnings.push('Google Places APIキー未設定のため候補は未確認です。'); return result; }
      const rows: UsaCandidate[] = [];
      let excluded = 0;
      for (const keyword of conditions.keywords) {
        try {
          result.apiRequests++;
          const response = await request('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST', headers: {
              'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.websiteUri,places.googleMapsUri,places.attributions',
            },
            body: JSON.stringify({ textQuery: `${keyword} in ${profile.candidateSearch.placeName}`, regionCode: profile.candidateSearch.regionCode, languageCode: 'en', pageSize: Math.min(10, conditions.limit) }),
            cache: 'no-store', signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) { result.incomplete = true; result.warnings.push(`Google Places API: HTTP ${response.status}。追加検索・再試行を停止しました。未取得分は未確認です。`); break; }
          const payload = await response.json() as { places?: PlaceResult[] };
          if (payload.places !== undefined && !Array.isArray(payload.places)) throw new Error('invalid response');
          for (const place of (payload.places || []).slice(0, 10)) {
            const candidate = placeToCandidate(place, keyword, conditions.country);
            if (candidate) rows.push(candidate); else excluded++;
          }
          if (deduplicateCandidates(rows).candidates.length >= conditions.limit) break;
        } catch {
          result.incomplete = true;
          result.warnings.push('Google Places APIの応答を確認できませんでした。追加検索・再試行を停止しました。'); break;
        }
      }
      const merged = deduplicateCandidates(rows);
      result.candidates = merged.candidates.slice(0, conditions.limit);
      result.duplicatesRemoved = merged.duplicatesRemoved;
      if (excluded) result.warnings.push(`${profile.label}所在地・企業名を確認できない検索結果${excluded}件を除外しました。`);
      return result;
    },
  };
}
