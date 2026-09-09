export type Country = 'US' | 'FR' | 'DE';
export type ResearchStatus = '未調査' | '調査中' | '確認待ち' | '完了';
export type Relationship = '商品掲載メーカー' | 'グループ製造元' | 'Supplier関係確認' | '個別取引確認' | '未確認';
export type Evidence = { id: string; field: string; url: string; quote: string; checkedAt: string; source: 'official_website' };
export type Product = {
  id: string; name: string; url: string; kind: '抹茶原料・茶商品' | '加工品' | '未確認';
  origin: 'JP' | 'CN' | 'OTHER' | '未確認'; region: string | null;
  processing: string | null; evidenceIds: string[];
};
export type Supplier = { name: string; relationship: Relationship; productId: string | null; evidenceIds: string[] };
export type PageSnapshot = { url: string; html: string; fetchedAt: string };
export type ResearchInput = { id: string; name: string; country: Country; website: string };
export type OverseasCompany = ResearchInput & {
  legalName: string | null; address: string | null; identityConfirmed: boolean;
  phones: string[]; emails: string[]; contactFormUrl: string | null;
  products: Product[]; suppliers: Supplier[]; b2bEvidenceIds: string[]; evidence: Evidence[];
  assessment: 'A' | 'B' | 'C' | null; reasons: string[]; status: ResearchStatus;
  checkedAt: string | null; warnings: string[]; pages: PageSnapshot[];
  requests: number; cacheHits: number; ruleVersion: string; source: 'manual';
};
export function pendingCompany(input: ResearchInput): OverseasCompany {
  return { ...input, legalName: null, address: null, identityConfirmed: false, phones: [], emails: [], contactFormUrl: null,
    products: [], suppliers: [], b2bEvidenceIds: [], evidence: [], assessment: null, reasons: [], status: '未調査',
    checkedAt: null, warnings: [], pages: [], requests: 0, cacheHits: 0, ruleVersion: '1', source: 'manual' };
}
