import { candidateTypeFromEvidence, candidateWebsite, deduplicateCandidates } from './normalize';
import { MAX_CANDIDATES, MAX_KEYWORDS, USA_KEYWORDS } from './conditions';
import type { CandidateProvider, CandidateSearchConditions, CandidateSearchResult, UsaCandidate } from './types';

export type PlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { shortText?: string; types?: string[] }[];
  websiteUri?: string;
  googleMapsUri?: string;
  attributions?: { provider?: string; providerUri?: string }[];
};
export function placeToCandidate(place: PlaceResult, keyword: string): UsaCandidate | null {
  // regionCode biases the search; only the returned country component establishes US location.
  if (!place.addressComponents?.some(c => c.types?.includes('country') && c.shortText === 'US')) return null;
  const name = place.displayName?.text?.trim() || '';
  if (!place.id || !name) return null;
  const location = place.formattedAddress || '';
  const sourceUrl = safeSourceUrl(place.googleMapsUri);
  const quote = [name, location].filter(Boolean).join(' — ');
  return {
    id: `google-places:${place.id}`, companyName: name, country: 'US', location,
    candidateOfficialUrl: candidateWebsite(place.websiteUri), sourceType: 'places_api',
    sourceName: 'Google Maps', sourceUrl, matchedKeyword: keyword,
    hsCode: '', productDescription: '', tradeDirection: '', supplierName: '',
    evidence: [{ sourceUrl, sourceName: 'Google Maps', matchedKeyword: keyword, quote }],
    // A query hit is not product evidence. Places offers no product description in this request.
    candidateType: candidateTypeFromEvidence(name),
    attributions: (place.attributions || []).map(a => ({ name: a.provider || '', url: safeSourceUrl(a.providerUri) })),
  };
}
function safeSourceUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.toString() : ''; } catch { return ''; }
}
export function normalizeConditions(value: unknown): CandidateSearchConditions {
  if (!value || typeof value !== 'object') throw new Error('検索条件を確認してください。');
  const input = value as Record<string, unknown>;
  if (input.country !== 'US' || !Array.isArray(input.keywords) || !input.keywords.length || input.keywords.length > MAX_KEYWORDS ||
      input.keywords.some(k => typeof k !== 'string' || !(USA_KEYWORDS as readonly string[]).includes(k))) throw new Error('USAの検索語を1〜3個選択してください。');
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > MAX_CANDIDATES)) throw new Error('候補件数は1〜30件です。');
  if (input.hsCodes !== undefined || input.productTerms !== undefined) throw new Error('現在の取得元はHS・貿易データ検索に対応していません。');
  return { country: 'US', keywords: [...new Set(input.keywords as string[])].sort(), limit: Number(input.limit || MAX_CANDIDATES) };
}
export function createGooglePlacesProvider(apiKey: string, request: typeof fetch = fetch): CandidateProvider {
  return {
    id: 'google-places', name: 'Google Maps / Places API (New)',
    async search(input) {
      const conditions = normalizeConditions(input);
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
            body: JSON.stringify({ textQuery: `${keyword} in United States`, regionCode: 'US', languageCode: 'en', pageSize: Math.min(10, conditions.limit) }),
            cache: 'no-store', signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) { result.incomplete = true; result.warnings.push(`Google Places API: HTTP ${response.status}。追加検索・再試行を停止しました。未取得分は未確認です。`); break; }
          const payload = await response.json() as { places?: PlaceResult[] };
          if (payload.places !== undefined && !Array.isArray(payload.places)) throw new Error('invalid response');
          for (const place of (payload.places || []).slice(0, 10)) {
            const candidate = placeToCandidate(place, keyword);
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
      if (excluded) result.warnings.push(`USA所在地・企業名を確認できない検索結果${excluded}件を除外しました。`);
      return result;
    },
  };
}
