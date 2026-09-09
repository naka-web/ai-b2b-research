export type CandidateType = 'matcha_direct' | 'green_tea_candidate' | 'unconfirmed';
export type CandidateEvidence = {
  sourceUrl: string;
  sourceName: string;
  matchedKeyword: string;
  quote: string;
};
// A discovery record has no assessment, Japanese-origin flag, or confirmed B2B flag.
export type UsaCandidate = {
  id: string;
  companyName: string;
  country: 'US';
  location: string;
  candidateOfficialUrl: string;
  sourceType: 'places_api' | 'web_search_api' | 'trade_api' | 'public_data';
  sourceName: string;
  sourceUrl: string;
  matchedKeyword: string;
  hsCode: string;
  productDescription: string;
  tradeDirection: string;
  supplierName: string;
  evidence: CandidateEvidence[];
  candidateType: CandidateType;
  attributions: { name: string; url: string }[];
};
export type CandidateSearchConditions = {
  country: 'US';
  keywords: string[];
  // Only providers supporting trade data consume these filters. HS alone is not matcha evidence.
  hsCodes?: string[];
  productTerms?: string[];
  limit: number;
};
export type CandidateProvider = {
  id: string;
  name: string;
  search(conditions: CandidateSearchConditions): Promise<CandidateSearchResult>;
};
export type CandidateSearchResult = {
  candidates: UsaCandidate[];
  apiRequests: number;
  duplicatesRemoved: number;
  warnings: string[];
  cacheHit: boolean;
  incomplete: boolean;
};
