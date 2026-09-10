import { countryProfiles } from './countryProfiles';
import { findDuplicate } from './deduplication';
import type { TradeScreeningRecord } from './candidates/types';
import type { Evidence, EvidenceSummary, OverseasCompany, ScreeningStatus } from './types';

export type ExportScope = 'all' | 'matcha_confirmed' | 'qualified' | 'include_review';
export type ExportCountry = 'all' | 'EU' | keyof typeof countryProfiles;
export type ExportCell = string | number | boolean | Date | null;
export type ExportTable = { headers: string[]; rows: ExportCell[][] };
export type ExportPackage = { delivery: ExportTable; internal: ExportTable; evidence: ExportTable; count: number };

export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export const DELIVERY_HEADERS = [
  'No.', '国', '会社名', '住所', '公式サイト', 'メール', '問い合わせフォームURL', '電話番号', 'Instagram',
  '企業属性', '抹茶取扱状況', 'B2B状況', 'Import / Export区分', '日本産確認', '日本メーカー・仕入先',
  'HSコード', '商品説明', 'FDA / Trade / その他公開情報', '出典URL', '備考',
];

export const INTERNAL_HEADERS = [
  'internal id', 'companyName', 'country', 'location', 'officialWebsite', 'candidateWebsiteStatus',
  'identityStatus', 'identity evidence URL', 'identity evidence text', 'matchaStatus', 'raw matcha / processed matcha区分',
  'JapaneseOriginStatus', 'B2B status', 'companyRoles', 'email', 'contactFormUrl', 'phone', 'contactStatus',
  'screeningStatus', 'isQualifiedLead', 'A/B/C', 'screenedAt', 'source', 'HS code', 'productDescription',
  'trade role', 'originCountry', 'supplierName', 'importerName', 'exporterName', 'shipmentDate', 'quantity', 'unit',
  'B/L', 'FDA関連情報', 'evidence URL', 'original evidence text', 'Japanese summary', 'research status', 'notes',
];

export const EVIDENCE_HEADERS = [
  'internal id', '会社名', '国', '根拠種別', 'カテゴリ', '出典名', '出典URL', '原文・元データ', '日本語要約',
  '確認状態', '確認日時', 'HSコード', '商品説明', 'trade role', '原産国', 'B/L',
];

type ExportGroup = { company: OverseasCompany; sourceIds: string[] };

const unique = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter(item => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; });
};

function completeness(company: OverseasCompany) {
  return Number(company.identityConfirmed) * 20 + company.evidence.length * 3 + company.evidenceSummaries.length * 2 +
    company.products.length * 4 + (company.discoveryEvidence?.length || 0) * 3 + company.emails.length * 2 + company.phones.length +
    Number(Boolean(company.contactFormUrl)) * 2 + Number(company.status === '完了') * 5;
}

function mergeCompanies(left: OverseasCompany, right: OverseasCompany): OverseasCompany {
  const primary = completeness(right) > completeness(left) ? right : left;
  const secondary = primary === left ? right : left;
  const emails = unique([...primary.emails, ...secondary.emails, ...(primary.email ? [primary.email] : []), ...(secondary.email ? [secondary.email] : [])], value => value.toLowerCase());
  const phones = unique([...primary.phones, ...secondary.phones], value => value.replace(/\D/g, ''));
  return {
    ...primary,
    legalName: primary.legalName || secondary.legalName,
    address: primary.address || secondary.address,
    identityConfirmed: primary.identityConfirmed || secondary.identityConfirmed,
    phones,
    emails,
    email: emails[0] || null,
    contactFormUrl: primary.contactFormUrl || secondary.contactFormUrl,
    companyRoles: unique([...primary.companyRoles, ...secondary.companyRoles], item => `${item.role}|${item.evidenceUrl || ''}|${item.evidenceText || ''}`),
    products: unique([...primary.products, ...secondary.products], item => `${item.url}|${item.name}|${item.kind}`),
    suppliers: unique([...primary.suppliers, ...secondary.suppliers], item => `${item.name}|${item.relationship}|${item.productId || ''}`),
    b2bEvidenceIds: unique([...primary.b2bEvidenceIds, ...secondary.b2bEvidenceIds], String),
    evidence: unique([...primary.evidence, ...secondary.evidence], item => `${item.field}|${item.url}|${item.quote}`),
    evidenceSummaries: unique([...primary.evidenceSummaries, ...secondary.evidenceSummaries], item => `${item.category}|${item.sourceUrl || ''}|${item.originalText}`),
    discoveryEvidence: unique([...(primary.discoveryEvidence || []), ...(secondary.discoveryEvidence || [])], item => JSON.stringify(item)),
    warnings: unique([...primary.warnings, ...secondary.warnings], String),
    reasons: unique([...primary.reasons, ...secondary.reasons], String),
  };
}

export function deduplicateForExport(companies: OverseasCompany[]): ExportGroup[] {
  const groups: ExportGroup[] = [];
  for (const company of companies) {
    const duplicate = findDuplicate(groups.map(group => group.company), company);
    if (!duplicate) { groups.push({ company, sourceIds: [company.id] }); continue; }
    const group = groups.find(item => item.company === duplicate)!;
    group.company = mergeCompanies(group.company, company);
    group.sourceIds = unique([...group.sourceIds, company.id], String);
  }
  return groups;
}

function scopeMatches(company: OverseasCompany, scope: ExportScope) {
  if (scope === 'all') return true;
  if (scope === 'matcha_confirmed') return company.screeningStatus === 'matcha_confirmed';
  if (scope === 'qualified') return company.isQualifiedLead;
  return company.isQualifiedLead || ['pending', 'ambiguous', 'not_found', 'fetch_failed'].includes(company.screeningStatus);
}

function countryMatches(company: OverseasCompany, country: ExportCountry) {
  return country === 'all' || (country === 'EU' ? EU_COUNTRIES.has(company.country) : company.country === country);
}

export function filterCompaniesForExport(companies: OverseasCompany[], scope: ExportScope, country: ExportCountry) {
  return deduplicateForExport(companies).filter(group => scopeMatches(group.company, scope) && countryMatches(group.company, country));
}

const missing = (failed = false) => failed ? '取得失敗' : '未確認';
const lines = (values: Array<string | null | undefined>) => unique(values.filter((value): value is string => Boolean(value?.trim())).map(value => value.trim()), String).join('\n');
const dateCell = (value: string | null | undefined): Date | string | null => {
  if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed;
};
const roles = (company: OverseasCompany) => lines(company.companyRoles.filter(item => item.role !== 'unknown').map(item => item.role)) || '未確認';
const officialEvidence = (company: OverseasCompany) => company.evidence || [];
const tradeEvidence = (company: OverseasCompany) => company.discoveryEvidence || [];
const summaries = (company: OverseasCompany) => company.evidenceSummaries || [];

export function matchaDisplay(status: ScreeningStatus) {
  return ({
    matcha_confirmed: '抹茶確認済み',
    matcha_related_processed_only: '加工品のみ（原料抹茶未確認）',
    green_tea_only: '緑茶のみ（抹茶未確認）',
    no_matcha_found: '抹茶根拠なし',
    ambiguous: '要確認',
    not_found: '公式サイト未発見（抹茶未確認）',
    fetch_failed: '取得失敗',
    pending: '未確認',
  } as const)[status];
}

function japaneseOrigin(company: OverseasCompany) {
  if (company.products.some(product => product.kind === '抹茶原料・茶商品' && product.origin === 'JP')) return '日本産確認済み';
  if (company.products.some(product => product.origin === 'CN' || product.origin === 'OTHER')) return '他国産あり／日本産未確認';
  return '未確認';
}

function productType(company: OverseasCompany) {
  const raw = company.products.some(product => product.kind === '抹茶原料・茶商品');
  const processed = company.products.some(product => product.kind === '加工品');
  return raw && processed ? 'raw_matcha / processed_matcha' : raw ? 'raw_matcha' : processed ? 'processed_matcha' : '未確認';
}

function b2bStatus(company: OverseasCompany) {
  if (company.b2bEvidenceIds.length) return '確認済み';
  return missing(company.screeningStatus === 'fetch_failed');
}

function contactValue(value: string, company: OverseasCompany) {
  return value || missing(company.contactStatus === 'fetch_failed');
}

function importExport(company: OverseasCompany) {
  const official = company.companyRoles.filter(item => ['importer', 'distributor', 'wholesaler', 'supplier'].includes(item.role)).map(item => `公式サイト確認: ${item.role}`);
  const trade = tradeEvidence(company).map(item => `Trade記録上: ${item.role}`);
  return lines([...official, ...trade]) || '未確認';
}

function sources(company: OverseasCompany) {
  return lines([
    ...tradeEvidence(company).map(item => `Trade: ${item.source} / HS ${item.hsCode} / role ${item.role}${item.billOfLading ? ` / B/L ${item.billOfLading}` : ''}`),
    ...(officialEvidence(company).length ? ['公式サイト公開情報'] : []),
  ]) || '未確認';
}

function sourceUrls(company: OverseasCompany) {
  return lines([company.website, ...tradeEvidence(company).map(item => item.sourceUrl), ...officialEvidence(company).map(item => item.url)]);
}

function screeningFor(group: ExportGroup, records: TradeScreeningRecord[]) {
  return records.find(record => record.companyId && group.sourceIds.includes(record.companyId)) ||
    records.find(record => record.country === group.company.country && record.candidateOfficialUrl === group.company.website);
}

function identityEvidence(company: OverseasCompany) {
  return officialEvidence(company).filter(item => item.field === 'identity');
}

function summaryForEvidence(company: OverseasCompany, evidence: Evidence) {
  return summaries(company).find(summary => summary.id === `official:${evidence.id}`) ||
    summaries(company).find(summary => summary.sourceUrl === evidence.url && summary.originalText === evidence.quote);
}

function tradeSummary(company: OverseasCompany, index: number, sourceUrl: string | null): EvidenceSummary | undefined {
  return summaries(company).find(summary => summary.id === `trade:${index}`) ||
    summaries(company).find(summary => summary.category === 'trade_source' && summary.sourceUrl === sourceUrl);
}

function deliveryRow(company: OverseasCompany, index: number): ExportCell[] {
  const suppliers = japaneseOrigin(company) === '日本産確認済み'
    ? lines(company.suppliers.map(item => `${item.name}（${item.relationship}）`)) || '未確認' : '未確認';
  return [
    index + 1, countryProfiles[company.country].label, company.legalName || company.name, company.address || '未確認', company.website,
    contactValue(lines(company.emails.length ? company.emails : company.email ? [company.email] : []), company),
    contactValue(company.contactFormUrl || '', company), contactValue(lines(company.phones), company), '未確認', roles(company),
    matchaDisplay(company.screeningStatus), b2bStatus(company), importExport(company), japaneseOrigin(company), suppliers,
    lines(tradeEvidence(company).map(item => item.hsCode)) || '', lines(tradeEvidence(company).map(item => item.productDescription)) || '',
    sources(company), sourceUrls(company), lines([...company.reasons, ...company.warnings]) || '',
  ];
}

function internalRow(group: ExportGroup, records: TradeScreeningRecord[]): ExportCell[] {
  const company = group.company; const screening = screeningFor(group, records); const identity = identityEvidence(company);
  const trade = tradeEvidence(company); const allSummaries = summaries(company);
  return [
    company.id, company.name, countryProfiles[company.country].label, company.address || '未確認', company.website,
    screening?.candidateWebsiteStatus || '未確認', company.identityConfirmed ? 'confirmed' : 'unconfirmed',
    lines([screening?.candidateWebsiteIdentityEvidence?.url, ...identity.map(item => item.url)]) || '未確認',
    lines([screening?.candidateWebsiteIdentityEvidence?.text, ...identity.map(item => item.quote)]) || '未確認',
    company.screeningStatus, productType(company), japaneseOrigin(company), company.b2bEvidenceIds.length ? 'confirmed' : 'unconfirmed', roles(company),
    contactValue(lines(company.emails), company), contactValue(company.contactFormUrl || '', company), contactValue(lines(company.phones), company),
    company.contactStatus, company.screeningStatus, company.isQualifiedLead, company.assessment || '未確認',
    dateCell(company.screenedAt), lines(['manual', ...trade.map(item => item.source)]),
    lines(trade.map(item => item.hsCode)), lines(trade.map(item => item.productDescription)), lines(trade.map(item => item.role)),
    lines(trade.map(item => item.originCountry)), lines(trade.map(item => item.supplierName)), lines(trade.map(item => item.importerName)),
    lines(trade.map(item => item.exporterName)), lines(trade.map(item => item.shipmentDate)), lines(trade.map(item => item.quantity)),
    lines(trade.map(item => item.unit)), lines(trade.map(item => item.billOfLading)), '', sourceUrls(company),
    lines([...officialEvidence(company).map(item => item.quote), ...trade.map(item => item.rawEvidence || item.productDescription)]),
    lines(allSummaries.map(item => item.japaneseSummary)), company.status, lines([...company.reasons, ...company.warnings]),
  ];
}

function evidenceRows(company: OverseasCompany): ExportCell[][] {
  const official = officialEvidence(company).map(evidence => { const summary = summaryForEvidence(company, evidence); return [
    company.id, company.name, countryProfiles[company.country].label, 'official_website', summary?.category || evidence.field,
    '公式サイト', evidence.url, evidence.quote, summary?.japaneseSummary || '未生成', summary?.status || '未確認',
    dateCell(evidence.checkedAt), '', '', '', '', '',
  ] as ExportCell[]; });
  const trade = tradeEvidence(company).map((evidence, index) => { const summary = tradeSummary(company, index, evidence.sourceUrl); return [
    company.id, company.name, countryProfiles[company.country].label, 'hs_trade_data', 'trade_source', evidence.source,
    evidence.sourceUrl || '', evidence.rawEvidence || evidence.productDescription, summary?.japaneseSummary || '未生成',
    summary?.status || '未確認', dateCell(evidence.shipmentDate), evidence.hsCode,
    evidence.productDescription, evidence.role, evidence.originCountry || '', evidence.billOfLading || '',
  ] as ExportCell[]; });
  return [...official, ...trade];
}

export function buildExportPackage(companies: OverseasCompany[], records: TradeScreeningRecord[] = [], scope: ExportScope = 'all', country: ExportCountry = 'all'): ExportPackage {
  const groups = filterCompaniesForExport(companies, scope, country);
  return {
    delivery: { headers: DELIVERY_HEADERS, rows: groups.map((group, index) => deliveryRow(group.company, index)) },
    internal: { headers: INTERNAL_HEADERS, rows: groups.map(group => internalRow(group, records)) },
    evidence: { headers: EVIDENCE_HEADERS, rows: groups.flatMap(group => evidenceRows(group.company)) },
    count: groups.length,
  };
}

function csvSafe(value: ExportCell) {
  let text = value instanceof Date ? formatDate(value) : value === null ? '' : String(value);
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createDeliveryCsv(data: ExportPackage) {
  return `\uFEFF${[data.delivery.headers, ...data.delivery.rows].map(row => row.map(csvSafe).join(',')).join('\r\n')}`;
}

export function formatDate(value: Date) {
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function exportFilename(extension: 'xlsx' | 'csv', country: ExportCountry, now = new Date()) {
  const day = formatDate(now).slice(0, 10);
  const suffix = country === 'all' ? '' : `_${country}`;
  return `matcha_company_list${suffix}_${day}.${extension}`;
}
