export type BtoBSuitabilityLevel = "高" | "中" | "低" | "判定不能";
export type MatchaHandlingStatus = "確認済み" | "未確認" | "取扱なし";
export type MatchaHandlingType =
  | "業務用抹茶"
  | "抹茶原料"
  | "抹茶そのもの／茶商品"
  | "抹茶OEM"
  | "抹茶加工品"
  | "抹茶使用商品のみ"
  | "不明";
export type FinalAssessment = "高" | "中" | "要確認" | "低";

export type EnrichmentStatus = "未調査" | "調査中" | "完了" | "取得失敗";
export type RetrievalStatus =
  | "未取得"
  | "通常取得成功"
  | "JS描画取得成功"
  | "取得失敗"
  | "アクセス拒否"
  | "タイムアウト";

export type Company = {
  id: string;
  placeId?: string;
  name: string;
  primaryCategory?: string;
  categories?: string[];
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  openNow?: boolean;
  openingHours?: string[];
  hitKeywords: string[];
  contactFormUrl?: string;
  publicEmails: string[];
  suitability: FinalAssessment;
  suitabilityScore: number;
  suitabilityReasons: string[];
  evidenceUrls: string[];
  matchaHandlingStatus: MatchaHandlingStatus;
  matchaHandlingType: MatchaHandlingType;
  matchaHandlingReasons: string[];
  matchaEvidenceUrls: string[];
  b2bSuitability: BtoBSuitabilityLevel;
  b2bReasons: string[];
  b2bEvidenceUrls: string[];
  b2bBusinessTypes: string[];
  finalAssessment: FinalAssessment;
  scoreBreakdown: string[];
  enrichmentStatus: EnrichmentStatus;
  retrievalStatus: RetrievalStatus;
};

export type CompanyEnrichment = Pick<
  Company,
  | "id"
  | "contactFormUrl"
  | "publicEmails"
  | "suitability"
  | "suitabilityScore"
  | "suitabilityReasons"
  | "evidenceUrls"
  | "matchaHandlingStatus"
  | "matchaHandlingType"
  | "matchaHandlingReasons"
  | "matchaEvidenceUrls"
  | "b2bSuitability"
  | "b2bReasons"
  | "b2bEvidenceUrls"
  | "b2bBusinessTypes"
  | "finalAssessment"
  | "scoreBreakdown"
  | "enrichmentStatus"
  | "retrievalStatus"
>;

export type CompanyEnrichmentCandidate = Pick<
  Company,
  "id" | "name" | "website" | "primaryCategory" | "categories"
>;

export function createPendingEnrichment(): Omit<CompanyEnrichment, "id"> {
  return {
    contactFormUrl: undefined,
    publicEmails: [],
    suitability: "要確認",
    suitabilityScore: 0,
    suitabilityReasons: ["公式サイトを未調査です"],
    evidenceUrls: [],
    matchaHandlingStatus: "未確認",
    matchaHandlingType: "不明",
    matchaHandlingReasons: ["公式サイトを未調査です"],
    matchaEvidenceUrls: [],
    b2bSuitability: "判定不能",
    b2bReasons: ["公式サイトを未調査です"],
    b2bEvidenceUrls: [],
    b2bBusinessTypes: [],
    finalAssessment: "要確認",
    scoreBreakdown: [],
    enrichmentStatus: "未調査",
    retrievalStatus: "未取得",
  };
}
