import type { Country, OverseasCompany, ResearchStatus, ScreeningStatus, TradeRole, TradeSourceEvidence } from '../types';
export type CandidateType = 'matcha_direct' | 'green_tea_candidate' | 'unconfirmed';
export type CandidateProviderKind = 'google_places' | 'hs_trade_data';
export type CandidateWebsiteStatus = 'not_searched' | 'candidate_found' | 'verified' | 'ambiguous' | 'not_found' | 'fetch_failed';
export type CandidateWebsiteIdentityEvidence = { url: string | null; text: string };
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
  country: Country;
  location: string;
  candidateOfficialUrl: string;
  candidateWebsiteStatus: CandidateWebsiteStatus;
  candidateWebsiteReason: string;
  candidateWebsiteIdentityEvidence: CandidateWebsiteIdentityEvidence | null;
  candidateWebsiteMatchaStatus: 'matcha_found' | 'processed_only' | 'unconfirmed';
  provider: CandidateProviderKind;
  sourceType: 'places_api' | 'web_search_api' | 'trade_api' | 'trade_manual' | 'public_data';
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
  tradeEvidence: TradeSourceEvidence[];
};
export type TradeCandidate = {
  id: string; companyName: string; country: Country; role: TradeRole; source: string;
  sourceUrl: string | null; hsCode: '090210' | '090220'; productDescription: string;
  originCountry: string | null; supplierName: string | null; importerName: string | null;
  exporterName: string | null; shipmentDate: string | null; quantity: string | null;
  unit: string | null; billOfLading: string | null; rawEvidence: string | null;
  officialWebsite: string | null; researchStatus: ResearchStatus;
  candidateWebsiteStatus: CandidateWebsiteStatus; candidateWebsiteReason: string;
};
export type TradeScreeningRecord = {
  candidateId: string; companyName: string; country: Country;
  candidateOfficialUrl: string; candidateWebsiteStatus: CandidateWebsiteStatus; candidateWebsiteReason: string;
  candidateWebsiteIdentityEvidence: CandidateWebsiteIdentityEvidence | null; candidateWebsiteMatchaStatus: 'matcha_found' | 'processed_only' | 'unconfirmed';
  screeningStatus: ScreeningStatus; isQualifiedLead: boolean; screenedAt: string; screeningVersion: string;
  tradeEvidence: TradeSourceEvidence[]; companyId: string | null;
};
export type TradeScreeningOutcome = { candidate: UsaCandidate; record: TradeScreeningRecord; company: OverseasCompany | null };
export type WebsiteCandidateMatch = { url: string; placeName: string; location: string; nameSimilarity: number; sourceUrl: string };
export type CandidateWebsiteLookupResult = {
  candidateWebsiteUrl: string | null; candidateWebsiteStatus: CandidateWebsiteStatus;
  reason: string;
  identityEvidence: CandidateWebsiteIdentityEvidence | null; matchaStatus: 'matcha_found' | 'processed_only' | 'unconfirmed';
};
export type CandidateSearchConditions = {
  country: Country;
  keywords: string[];
  // Only providers supporting trade data consume these filters. HS alone is not matcha evidence.
  hsCodes?: string[];
  productTerms?: string[];
  limit: number;
};
export type CandidateProvider = {
  id: string;
  name: string;
  kind: CandidateProviderKind;
  search(conditions: CandidateSearchConditions): Promise<CandidateSearchResult>;
};
export type CandidateImportProvider = {
  id: string;
  name: string;
  kind: CandidateProviderKind;
  importCsv(csv: string): CandidateSearchResult;
};
export type CandidateSearchResult = {
  candidates: UsaCandidate[];
  apiRequests: number;
  duplicatesRemoved: number;
  warnings: string[];
  cacheHit: boolean;
  incomplete: boolean;
};
