import { createOpenAiJson } from '../openaiResponses';
import type { Evidence, EvidenceSummary, EvidenceSummaryCategory, OverseasCompany, TradeSourceEvidence } from './types';

const MAX_SUMMARIES = 20;
const cache = new Map<string, Pick<EvidenceSummary, 'japaneseSummary' | 'sourceLanguage' | 'confidence'>>();
const roleCategories = new Set<EvidenceSummaryCategory>(['importer', 'distributor', 'wholesaler', 'supplier']);

function category(evidence: Evidence, company: OverseasCompany): EvidenceSummaryCategory {
  if (evidence.field === 'identity') return 'company_identity';
  if (evidence.field === 'b2b') return 'b2b';
  if (evidence.field === 'supplier' || evidence.field === 'manufacturer') return 'supplier';
  if (evidence.field === 'contactForm') return 'contact';
  if (evidence.field.startsWith('role:')) {
    const role = evidence.field.slice(5);
    if (role === 'manufacturer') return 'supplier';
    return roleCategories.has(role as EvidenceSummaryCategory) ? role as EvidenceSummaryCategory : 'unknown';
  }
  if (evidence.field === 'origin') {
    const product = company.products.find(item => item.evidenceIds.includes(evidence.id));
    return product?.origin === 'JP' ? 'japanese_origin' : product?.origin === 'CN' || product?.origin === 'OTHER' ? 'other_origin' : 'unknown';
  }
  if (evidence.field === 'product') {
    const product = company.products.find(item => item.evidenceIds.includes(evidence.id));
    return product?.kind === '抹茶原料・茶商品' ? 'matcha_product' : 'matcha';
  }
  return 'unknown';
}

function tradeOriginal(trade: TradeSourceEvidence) {
  return [`source: ${trade.source}`, `hsCode: ${trade.hsCode}`, `productDescription: ${trade.productDescription}`, `role: ${trade.role}`,
    trade.originCountry ? `originCountry: ${trade.originCountry}` : '', trade.shipmentDate ? `shipmentDate: ${trade.shipmentDate}` : '', trade.billOfLading ? `billOfLading: ${trade.billOfLading}` : '', trade.rawEvidence || ''].filter(Boolean).join(' / ').slice(0, 1200);
}
function tradeJapanese(trade: TradeSourceEvidence) {
  const roles: Record<TradeSourceEvidence['role'], string> = { importer: '輸入企業候補', consignee: '荷受人候補', exporter: '輸出企業候補', supplier: '供給企業候補', buyer: '買い手候補', unknown: '役割未確認の企業候補' };
  const product = /\bmatcha\b|抹茶/i.test(trade.productDescription) ? `商品説明に「${trade.productDescription}」を含む抹茶関連の高シグナル候補` : `HS${trade.hsCode}（商品説明: ${trade.productDescription}）の${roles[trade.role]}`;
  return `${trade.source}上で、${product}として確認。${/\bmatcha\b|抹茶/i.test(trade.productDescription) ? '企業属性と抹茶取扱いは未確認。' : '抹茶取扱いは未確認。'}`;
}

export function collectEvidenceSummaries(company: OverseasCompany): EvidenceSummary[] {
  const rows: EvidenceSummary[] = [];
  for (const evidence of company.evidence) {
    if (['email', 'phone'].includes(evidence.field) || !evidence.quote.trim()) continue;
    const originalText = evidence.quote.trim();
    if (rows.some(row => row.originalText === originalText)) continue;
    rows.push({ id: `official:${evidence.id}`, category: category(evidence, company), originalText, japaneseSummary: null,
      sourceUrl: evidence.url, sourceLanguage: 'unknown', confidence: null, status: evidence.field === 'retailOnly' ? 'review_required' : 'confirmed', summaryStatus: 'not_generated' });
    if (rows.length >= MAX_SUMMARIES) break;
  }
  for (const [index, trade] of (company.discoveryEvidence || []).entries()) {
    if (rows.length >= MAX_SUMMARIES) break;
    const originalText = tradeOriginal(trade); if (rows.some(row => row.originalText === originalText)) continue;
    rows.push({ id: `trade:${index}`, category: 'trade_source', originalText, japaneseSummary: tradeJapanese(trade), sourceUrl: trade.sourceUrl,
      sourceLanguage: 'structured_data', confidence: 'high', status: 'review_required', summaryStatus: 'generated' });
  }
  return rows;
}

function addsUnsupportedRole(original: string, summary: string, categoryName: EvidenceSummaryCategory) {
  if (roleCategories.has(categoryName)) return false;
  const originalRole = /\b(?:importer|imports?|distributor|distributes?|wholesaler|wholesale|supplier|supplies)\b|輸入|卸売|供給|importateur|grossiste|Importeur|Großhandel/i.test(original);
  return !originalRole && /輸入(?:業者|企業)|販売代理店|卸売(?:業者|企業)|供給(?:業者|企業)/.test(summary);
}
function changesProtectedMeaning(original: string, summary: string) {
  if (/matcha[- ]flavou?red|matcha[- ]inspired/i.test(original) && !/風味|フレーバー|着想|インスパイア/.test(summary)) return true;
  if (/Japanese[- ]style/i.test(original) && /日本産|日本製|日本から/.test(summary)) return true;
  return false;
}
function localEnglishFallback(row: EvidenceSummary) {
  const text = row.originalText;
  if (row.category === 'b2b' && /customi[sz]ed programs? suited to the individual needs of our wholesale clients/i.test(text)) return '卸売顧客の個別ニーズに合わせたプログラムを提供している。';
  if (row.category === 'b2b' && /wholesale clients? can apply for our trade program/i.test(text)) return '卸売顧客が取引プログラムに申し込める。';
  if (row.category === 'b2b' && /wholesale pricing for business customers/i.test(text)) return '法人顧客向けの卸売価格を提供している。';
  if (row.category === 'b2b' && /offer tasting samples? for our wholesale customers/i.test(text)) return /nominal charge/i.test(text) ? '卸売顧客向けに有料の試飲サンプルを提供している。' : '卸売顧客向けに試飲サンプルを提供している。';
  if (row.category === 'wholesaler' && /join our wholesale/i.test(text)) return '卸売向けプログラムへの参加を案内している。';
  return null;
}

export async function generateEvidenceSummaries(company: OverseasCompany, options: { apiKey?: string; request?: typeof fetch } = {}) {
  const rows = collectEvidenceSummaries(company); const pending = rows.filter(row => row.category !== 'trade_source');
  for (const row of pending) {
    const saved = cache.get(row.originalText); if (saved) Object.assign(row, saved, { summaryStatus: 'generated' as const });
    else {
      const fallback = localEnglishFallback(row);
      if (fallback) Object.assign(row, { japaneseSummary: fallback, sourceLanguage: 'en', confidence: 'high' as const, summaryStatus: 'generated' as const });
    }
  }
  const missing = pending.filter(row => !row.japaneseSummary);
  if (!missing.length) return { summaries: rows, apiRequests: 0 };
  if (!options.apiKey) return { summaries: rows, apiRequests: 0 };
  try {
    const payload = await createOpenAiJson({ apiKey: options.apiKey, request: options.request, timeoutMs: 10_000, schemaName: 'evidence_summaries',
      schema: { type: 'object', additionalProperties: false, required: ['summaries'], properties: { summaries: { type: 'array', maxItems: MAX_SUMMARIES,
        items: { type: 'object', additionalProperties: false, required: ['id','japaneseSummary','sourceLanguage','confidence'], properties: {
          id: { type: 'string' }, japaneseSummary: { type: 'string', maxLength: 180 }, sourceLanguage: { type: 'string', maxLength: 30 }, confidence: { type: 'string', enum: ['high','medium','low'] },
        } } } } },
      developer: '公開情報の根拠文を日本語で短く忠実に要約する。原文にない企業属性、商品、原産国、断定を追加しない。may/can/appears等の弱さを維持する。matcha-flavored/inspiredは抹茶そのものと書かず、Japanese-styleは日本産と書かない。importer/distributor/wholesaler/supplierは原文に明記された場合だけ使う。JSONスキーマどおり返す。',
      user: JSON.stringify({ task: '各項目を1文の日本語に要約', evidence: missing.map(row => ({ id: row.id, category: row.category, originalText: row.originalText.slice(0, 900) })) }),
    }) as { summaries?: { id?: unknown; japaneseSummary?: unknown; sourceLanguage?: unknown; confidence?: unknown }[] };
    for (const item of payload.summaries || []) {
      const row = missing.find(candidate => candidate.id === item.id); if (!row || typeof item.japaneseSummary !== 'string' || !item.japaneseSummary.trim() || item.japaneseSummary.length > 180) continue;
      const confidence = ['high','medium','low'].includes(String(item.confidence)) ? item.confidence as 'high' | 'medium' | 'low' : null;
      const summary = item.japaneseSummary.trim(); if (addsUnsupportedRole(row.originalText, summary, row.category) || changesProtectedMeaning(row.originalText, summary)) continue;
      Object.assign(row, { japaneseSummary: summary, sourceLanguage: typeof item.sourceLanguage === 'string' ? item.sourceLanguage.slice(0, 30) : 'unknown', confidence, summaryStatus: 'generated' as const });
      cache.set(row.originalText, { japaneseSummary: row.japaneseSummary, sourceLanguage: row.sourceLanguage, confidence: row.confidence });
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
    }
    return { summaries: rows, apiRequests: 1 };
  } catch {
    for (const row of missing) row.summaryStatus = 'fetch_failed';
    return { summaries: rows, apiRequests: 1 };
  }
}
