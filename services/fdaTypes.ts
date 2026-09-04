export type FdaDataType = "Import Refusal" | "Food Recall";
export type FdaCountryBasis = "manufacturer/origin" | "recalling firm";
export type FdaHitMethod = "keyword" | "product_code" | "keyword+product_code";
export type FdaMatchaStatus =
  | "confirmed"
  | "green_tea_only"
  | "processed_matcha_product_only"
  | "unconfirmed";

export type FdaRecord = {
  id: string;
  dataType: FdaDataType;
  companyName: string;
  fei?: string;
  address: string;
  city?: string;
  state?: string;
  country: string;
  countryBasis: FdaCountryBasis;
  productCode?: string;
  matchedProductCode?: string;
  productCodeDescription?: string;
  productDescription: string;
  event: string;
  date?: string;
  evidenceUrl: string;
  identifier?: string;
  distributionPattern?: string;
  hitTerms: string[];
  hitReasons: string[];
  hitMethod?: FdaHitMethod;
};

export type FdaCompany = {
  id: string;
  name: string;
  country: string;
  countryBasis: FdaCountryBasis;
  address: string;
  priority: 1 | 2 | 3 | null;
  identifiers: string[];
  hitTerms: string[];
  hitReasons: string[];
  records: FdaRecord[];
  officialWebsite?: string;
  officialWebsiteConfidence?: "high" | "medium" | "low";
  officialWebsiteMethod?: "google_places" | "web_search";
  officialWebsiteReason?: string;
  matchaStatus?: FdaMatchaStatus;
  matchaEvidence?: string;
  matchaEvidenceUrl?: string;
};

export type FdaWebResearchResult = Pick<
  FdaCompany,
  | "id"
  | "officialWebsite"
  | "officialWebsiteConfidence"
  | "officialWebsiteMethod"
  | "officialWebsiteReason"
  | "matchaStatus"
  | "matchaEvidence"
  | "matchaEvidenceUrl"
>;

export type FdaSearchResponse = {
  companies: FdaCompany[];
  recordCount: number;
  sourceCounts: Record<FdaDataType, number>;
  importRefusalMatchCounts: Record<FdaHitMethod, number>;
  warnings: string[];
};
