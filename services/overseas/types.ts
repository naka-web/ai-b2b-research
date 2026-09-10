export type Country = 'US' | 'FR' | 'DE' | 'NL' | 'TH' | 'KR' | 'TW' | 'IN' | 'VN' | 'IT' | 'ES' | 'BE' | 'AT' | 'PL' | 'IE' | 'PT' | 'LU' | 'DK' | 'SE' | 'FI' | 'CZ' | 'SK' | 'HU' | 'SI' | 'HR' | 'RO' | 'BG' | 'GR' | 'CY' | 'MT' | 'LT' | 'LV' | 'EE';
export type ResearchStatus = '未調査' | '調査中' | '確認待ち' | '完了';
export type ScreeningStatus = 'matcha_confirmed' | 'matcha_related_processed_only' | 'green_tea_only' | 'no_matcha_found' | 'ambiguous' | 'not_found' | 'fetch_failed' | 'pending';
export type ContactStatus = 'email_found' | 'form_found' | 'email_and_form_found' | 'not_found' | 'fetch_failed';
export type CompanyRole = 'importer' | 'distributor' | 'wholesaler' | 'supplier' | 'retailer' | 'ecommerce' | 'cafe_or_shop' | 'manufacturer' | 'unknown';
export type CompanyRoleEvidence = { role: CompanyRole; evidenceUrl: string | null; evidenceText: string | null };
export type TradeRole = 'importer' | 'consignee' | 'exporter' | 'supplier' | 'buyer' | 'unknown';
export type TradeSourceEvidence = {
  provider: 'hs_trade_data'; source: string; sourceUrl: string | null; hsCode: '090210' | '090220';
  productDescription: string; originCountry: string | null; role: TradeRole;
  supplierName: string | null; importerName: string | null; exporterName: string | null;
  shipmentDate: string | null; quantity: string | null; unit: string | null;
  billOfLading: string | null; rawEvidence: string | null;
};
export type Relationship = '商品掲載メーカー' | 'グループ製造元' | 'Supplier関係確認' | '個別取引確認' | '未確認';
export type Evidence = { id: string; field: string; url: string; quote: string; checkedAt: string; source: 'official_website' };
export type EvidenceSummaryCategory = 'matcha' | 'matcha_product' | 'japanese_origin' | 'other_origin' | 'importer' | 'distributor' | 'wholesaler' | 'supplier' | 'b2b' | 'contact' | 'company_identity' | 'trade_source' | 'unknown';
export type EvidenceSummary = {
  id: string; category: EvidenceSummaryCategory; originalText: string; japaneseSummary: string | null;
  sourceUrl: string | null; sourceLanguage: string; confidence: 'high' | 'medium' | 'low' | null;
  status: 'confirmed' | 'unconfirmed' | 'review_required' | 'fetch_failed';
  summaryStatus: 'generated' | 'not_generated' | 'fetch_failed';
};
export type Product = {
  id: string; name: string; url: string; kind: '抹茶原料・茶商品' | '加工品' | '未確認';
  origin: 'JP' | 'CN' | 'OTHER' | '未確認'; region: string | null;
  processing: string | null; evidenceIds: string[];
};
export type Supplier = { name: string; relationship: Relationship; productId: string | null; evidenceIds: string[] };
export type PageSnapshot = { url: string; html: string; fetchedAt: string };
export type ResearchInput = { id: string; name: string; country: Country; website: string; discoveryEvidence?: TradeSourceEvidence[] };
export type OverseasCompany = ResearchInput & {
  legalName: string | null; address: string | null; identityConfirmed: boolean;
  phones: string[]; emails: string[]; email: string | null; contactFormUrl: string | null; contactStatus: ContactStatus;
  companyRoles: CompanyRoleEvidence[];
  products: Product[]; suppliers: Supplier[]; b2bEvidenceIds: string[]; evidence: Evidence[];
  evidenceSummaries: EvidenceSummary[]; evidenceSummaryRequests: number; evidenceSummaryVersion: string | null;
  screeningStatus: ScreeningStatus; isQualifiedLead: boolean; screenedAt: string | null; screeningVersion: string | null;
  assessment: 'A' | 'B' | 'C' | null; reasons: string[]; status: ResearchStatus;
  checkedAt: string | null; warnings: string[]; pages: PageSnapshot[];
  requests: number; cacheHits: number; ruleVersion: string; source: 'manual';
};
export function pendingCompany(input: ResearchInput): OverseasCompany {
  return { ...input, legalName: null, address: null, identityConfirmed: false, phones: [], emails: [], email: null, contactFormUrl: null, contactStatus: 'not_found',
    companyRoles: [{ role: 'unknown', evidenceUrl: null, evidenceText: null }],
    products: [], suppliers: [], b2bEvidenceIds: [], evidence: [], evidenceSummaries: [], evidenceSummaryRequests: 0, evidenceSummaryVersion: null,
    screeningStatus: 'pending', isQualifiedLead: false, screenedAt: null, screeningVersion: null, assessment: null, reasons: [], status: '未調査',
    checkedAt: null, warnings: [], pages: [], requests: 0, cacheHits: 0, ruleVersion: '2', source: 'manual' };
}
