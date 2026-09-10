import { countryProfiles, isCountry } from '../countryProfiles';
import type { Country, ResearchInput, TradeRole, TradeSourceEvidence } from '../types';
import { candidateTypeFromEvidence, candidateWebsite, deduplicateCandidates } from './normalize';
import type { CandidateImportProvider, TradeCandidate, UsaCandidate } from './types';

const HS_CODES = new Set(['090210', '090220']);
const ROLES = new Set<TradeRole>(['importer', 'consignee', 'exporter', 'supplier', 'buyer', 'unknown']);
const MAX_ROWS = 100;
const aliases: Record<string, Country> = {
  usa: 'US', 'united states': 'US', us: 'US', germany: 'DE', de: 'DE', france: 'FR', fr: 'FR',
  netherlands: 'NL', nl: 'NL', thailand: 'TH', th: 'TH', 'south korea': 'KR', kr: 'KR',
  taiwan: 'TW', tw: 'TW', india: 'IN', in: 'IN', vietnam: 'VN', 'viet nam': 'VN', vn: 'VN',
};

function parseCsv(csv: string) {
  if (!csv.trim() || csv.length > 200_000) throw new Error('CSVは1〜200,000文字で入力してください。');
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (char !== '\r') value += char;
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  row.push(value); rows.push(row);
  return rows.filter(fields => fields.some(field => field.trim()));
}

function text(value: unknown, max = 200) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw new Error(`項目が${max}文字を超えています。`);
  return result;
}
function nullable(value: unknown, max = 500) { return text(value, max) || null; }
function safeUrl(value: unknown) {
  const raw = text(value, 2000); if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new Error('sourceUrlは公開http / https URLを指定してください。'); }
}
function country(value: unknown) {
  const raw = text(value, 80); const upper = raw.toUpperCase();
  if (isCountry(upper)) return upper;
  const found = aliases[raw.toLocaleLowerCase('en-US')] || (Object.keys(countryProfiles) as Country[]).find(code => countryProfiles[code].label.toLowerCase() === raw.toLowerCase());
  if (!found) throw new Error(`対象外の国です: ${raw || '未入力'}`);
  return found;
}

export function tradeCandidateToEvidence(candidate: TradeCandidate): TradeSourceEvidence {
  return {
    provider: 'hs_trade_data', source: candidate.source, sourceUrl: candidate.sourceUrl,
    hsCode: candidate.hsCode, productDescription: candidate.productDescription,
    originCountry: candidate.originCountry, role: candidate.role, supplierName: candidate.supplierName,
    importerName: candidate.importerName, exporterName: candidate.exporterName,
    shipmentDate: candidate.shipmentDate, quantity: candidate.quantity, unit: candidate.unit,
    billOfLading: candidate.billOfLading, rawEvidence: candidate.rawEvidence,
  };
}

export function normalizeTradeSourceEvidence(value: unknown): TradeSourceEvidence {
  if (!value || typeof value !== 'object') throw new Error('HS / Trade根拠を確認してください。');
  const item = value as Record<string, unknown>;
  if (item.provider !== 'hs_trade_data') throw new Error('HS / Trade providerを確認してください。');
  const source = text(item.source, 100); const productDescription = text(item.productDescription, 1000);
  const hsCode = text(item.hsCode).replace(/\D/g, ''); const role = text(item.role || 'unknown').toLowerCase() as TradeRole;
  if (!source || !productDescription || !HS_CODES.has(hsCode) || !ROLES.has(role)) throw new Error('HS / Trade根拠の必須項目を確認してください。');
  return { provider: 'hs_trade_data', source, sourceUrl: safeUrl(item.sourceUrl), hsCode: hsCode as TradeSourceEvidence['hsCode'],
    productDescription, originCountry: nullable(item.originCountry), role, supplierName: nullable(item.supplierName),
    importerName: nullable(item.importerName), exporterName: nullable(item.exporterName), shipmentDate: nullable(item.shipmentDate, 80),
    quantity: nullable(item.quantity, 80), unit: nullable(item.unit, 80), billOfLading: nullable(item.billOfLading), rawEvidence: nullable(item.rawEvidence, 2000) };
}

export function tradeCandidateToCandidate(candidate: TradeCandidate): UsaCandidate {
  const sourceUrl = candidate.sourceUrl || '';
  const evidence = tradeCandidateToEvidence(candidate);
  return {
    id: candidate.id, companyName: candidate.companyName, country: candidate.country, location: '',
    candidateOfficialUrl: candidate.officialWebsite || '', provider: 'hs_trade_data', sourceType: 'trade_manual',
    candidateWebsiteStatus: candidate.candidateWebsiteStatus,
    candidateWebsiteReason: candidate.candidateWebsiteReason, candidateWebsiteIdentityEvidence: null,
    candidateWebsiteMatchaStatus: 'unconfirmed',
    sourceName: candidate.source, sourceUrl, matchedKeyword: candidate.productDescription,
    hsCode: candidate.hsCode, productDescription: candidate.productDescription,
    tradeDirection: candidate.role, supplierName: candidate.supplierName || '',
    evidence: [{ sourceUrl, sourceName: candidate.source, matchedKeyword: candidate.productDescription,
      quote: candidate.rawEvidence || `${candidate.hsCode} — ${candidate.productDescription}` }],
    candidateType: candidateTypeFromEvidence(candidate.productDescription, candidate.hsCode),
    attributions: [], tradeEvidence: [evidence],
  };
}

export function tradeCandidateToResearchInput(candidate: TradeCandidate, id: string): ResearchInput | null {
  if (!candidate.officialWebsite) return null;
  return { id, name: candidate.companyName, country: candidate.country, website: candidate.officialWebsite, discoveryEvidence: [tradeCandidateToEvidence(candidate)] };
}

export function parseTradeCsv(csv: string): TradeCandidate[] {
  const rows = parseCsv(csv); if (rows.length < 2) throw new Error('ヘッダーと1件以上のデータ行が必要です。');
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  const required = ['companyName', 'country', 'hsCode', 'productDescription', 'source'];
  for (const name of required) if (!headers.includes(name)) throw new Error(`必須列がありません: ${name}`);
  const dataRows = rows.slice(1); if (dataRows.length > MAX_ROWS) throw new Error(`一度に取り込める候補は${MAX_ROWS}件までです。`);
  return dataRows.map((fields, index): TradeCandidate => {
    const item = Object.fromEntries(headers.map((header, i) => [header, fields[i] ?? '']));
    try {
      const companyName = text(item.companyName); const source = text(item.source, 100);
      const productDescription = text(item.productDescription, 1000);
      if (!companyName || !source || !productDescription) throw new Error('companyName / productDescription / sourceは必須です。');
      const hsCode = text(item.hsCode).replace(/\D/g, '');
      if (!HS_CODES.has(hsCode)) throw new Error('hsCodeは090210または090220を指定してください。');
      const roleText = text(item.role || 'unknown').toLowerCase() as TradeRole;
      if (!ROLES.has(roleText)) throw new Error('roleを確認してください。');
      const websiteText = text(item.officialWebsite, 2000);
      const countryCode = country(item.country);
      return {
        id: `hs-trade:${source}:${countryCode}:${companyName.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}`, companyName, country: countryCode, role: roleText,
        source, sourceUrl: safeUrl(item.sourceUrl), hsCode: hsCode as TradeCandidate['hsCode'], productDescription,
        originCountry: nullable(item.originCountry), supplierName: nullable(item.supplierName), importerName: nullable(item.importerName),
        exporterName: nullable(item.exporterName), shipmentDate: nullable(item.shipmentDate, 80), quantity: nullable(item.quantity, 80),
        unit: nullable(item.unit, 80), billOfLading: nullable(item.billOfLading), rawEvidence: nullable(item.rawEvidence, 2000),
        officialWebsite: websiteText ? candidateWebsite(websiteText) || (() => { throw new Error('officialWebsiteは公式サイト候補URLを指定してください。'); })() : null,
        researchStatus: '未調査', candidateWebsiteStatus: websiteText ? 'candidate_found' : 'not_searched',
        candidateWebsiteReason: websiteText ? 'CSV記載URL（公式サイト同一性は未確認）' : '',
      };
    } catch (error) { throw new Error(`${index + 2}行目: ${error instanceof Error ? error.message : '入力を確認してください。'}`); }
  });
}

export function importTradeCsv(csv: string) {
  const tradeCandidates = parseTradeCsv(csv);
  const merged = deduplicateCandidates(tradeCandidates.map(tradeCandidateToCandidate));
  return { candidates: merged.candidates, apiRequests: 0, duplicatesRemoved: merged.duplicatesRemoved,
    warnings: [] as string[], cacheHit: false, incomplete: false };
}

export function createTradeDataProvider(): CandidateImportProvider {
  return { id: 'hs-trade-manual', name: 'HS / Trade Data（手動・CSV）', kind: 'hs_trade_data', importCsv: importTradeCsv };
}
