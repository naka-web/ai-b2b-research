import type { OverseasCompany, ScreeningStatus } from '../types';
import type { CandidateWebsiteStatus, TradeScreeningOutcome, TradeScreeningRecord, UsaCandidate } from './types';

export const SCREENING_VERSION = '1';
export const MAX_SCREENING_BATCH = 10;
export const SCREENING_CONCURRENCY = 2;

const finalStatuses = new Set<ScreeningStatus>([
  'matcha_confirmed', 'matcha_related_processed_only', 'green_tea_only', 'no_matcha_found', 'ambiguous', 'not_found', 'fetch_failed',
]);

export function screeningStatusFromWebsite(status: CandidateWebsiteStatus): ScreeningStatus {
  if (status === 'not_found') return 'not_found';
  if (status === 'fetch_failed') return 'fetch_failed';
  if (status === 'ambiguous' || status === 'candidate_found') return 'ambiguous';
  return 'pending';
}

function officialPageText(company: OverseasCompany) {
  return company.pages.map(page => page.html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')).join(' ');
}

export function screeningStatusFromCompany(company: OverseasCompany): ScreeningStatus {
  if (company.products.some(product => product.kind === '抹茶原料・茶商品')) return 'matcha_confirmed';
  if (company.products.some(product => product.kind === '加工品')) return 'matcha_related_processed_only';
  if (!company.pages.length) return 'fetch_failed';
  if (company.warnings.length) return 'ambiguous';
  const text = officialPageText(company);
  if (/\bgreen\s+tea\b|gr[üu]ner\s+tee|th[ée]\s+vert|녹차|ชาเขียว|trà\s+xanh|綠茶|绿茶|हरी\s+चाय/i.test(text)) return 'green_tea_only';
  return 'no_matcha_found';
}

export function applyScreening(company: OverseasCompany, now = new Date().toISOString()): OverseasCompany {
  const screeningStatus = screeningStatusFromCompany(company);
  return { ...company, screeningStatus, isQualifiedLead: screeningStatus === 'matcha_confirmed', screenedAt: now, screeningVersion: SCREENING_VERSION };
}

function makeRecord(candidate: UsaCandidate, status: ScreeningStatus, company: OverseasCompany | null, now: string): TradeScreeningRecord {
  return {
    candidateId: candidate.id, companyName: candidate.companyName, country: candidate.country,
    candidateOfficialUrl: candidate.candidateOfficialUrl, candidateWebsiteStatus: candidate.candidateWebsiteStatus,
    candidateWebsiteReason: candidate.candidateWebsiteReason, candidateWebsiteIdentityEvidence: candidate.candidateWebsiteIdentityEvidence,
    candidateWebsiteMatchaStatus: candidate.candidateWebsiteMatchaStatus, screeningStatus: status,
    isQualifiedLead: status === 'matcha_confirmed', screenedAt: now, screeningVersion: SCREENING_VERSION,
    tradeEvidence: candidate.tradeEvidence, companyId: company?.id || null,
  };
}

type BatchOptions = {
  existing: ReadonlyMap<string, TradeScreeningRecord>;
  lookup: (candidate: UsaCandidate, signal: AbortSignal) => Promise<UsaCandidate>;
  research: (candidate: UsaCandidate, signal: AbortSignal) => Promise<OverseasCompany>;
  save: (outcome: TradeScreeningOutcome) => Promise<void>;
  timeoutMs?: number;
  now?: () => string;
};

export async function screenTradeCandidateBatch(candidates: UsaCandidate[], options: BatchOptions) {
  const targets = candidates.filter(candidate => candidate.provider === 'hs_trade_data' &&
    !finalStatuses.has(options.existing.get(candidate.id)?.screeningStatus || 'pending')).slice(0, MAX_SCREENING_BATCH);
  const outcomes: TradeScreeningOutcome[] = []; let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const original = targets[cursor++]; let candidate = original; let company: OverseasCompany | null = null;
      const signal = AbortSignal.timeout(options.timeoutMs || 60_000);
      try {
        if (candidate.candidateWebsiteStatus === 'not_searched' ||
          (candidate.candidateWebsiteStatus === 'candidate_found' && candidate.candidateWebsiteReason.startsWith('CSV記載URL')))
          candidate = await options.lookup(candidate, signal);
        let status = screeningStatusFromWebsite(candidate.candidateWebsiteStatus);
        if (candidate.candidateWebsiteStatus === 'verified') {
          company = applyScreening(await options.research(candidate, signal), options.now?.());
          status = company.screeningStatus;
        }
        const outcome = { candidate, company, record: makeRecord(candidate, status, company, options.now?.() || new Date().toISOString()) };
        await options.save(outcome); outcomes.push(outcome);
      } catch (error) {
        candidate = { ...candidate, candidateWebsiteStatus: 'fetch_failed', candidateWebsiteReason: error instanceof Error ? error.message : '一括スクリーニングに失敗しました。' };
        const outcome = { candidate, company: null, record: makeRecord(candidate, 'fetch_failed', null, options.now?.() || new Date().toISOString()) };
        try { await options.save(outcome); } catch { /* Preserve batch progress even if one local write fails. */ }
        outcomes.push(outcome);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCREENING_CONCURRENCY, targets.length) }, worker));
  const counts = Object.fromEntries(outcomes.map(outcome => outcome.record.screeningStatus)
    .map(status => [status, outcomes.filter(outcome => outcome.record.screeningStatus === status).length])) as Partial<Record<ScreeningStatus, number>>;
  return { processed: outcomes.length, outcomes, counts };
}
