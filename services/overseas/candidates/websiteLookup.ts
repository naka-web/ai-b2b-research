import { candidateWebsite } from './normalize';
import type { CandidateWebsiteLookupResult, WebsiteCandidateMatch } from './types';
import type { OverseasCompany } from '../types';

type LookupInput = { companyName: string; candidateWebsiteUrl?: string | null };
type Verify = (url: string) => Promise<OverseasCompany>;
type Find = () => Promise<WebsiteCandidateMatch[]>;

const result = (candidateWebsiteStatus: CandidateWebsiteLookupResult['candidateWebsiteStatus'], candidateWebsiteUrl: string | null,
  reason: string, identityEvidence: CandidateWebsiteLookupResult['identityEvidence'] = null,
  matchaStatus: CandidateWebsiteLookupResult['matchaStatus'] = 'unconfirmed'): CandidateWebsiteLookupResult =>
  ({ candidateWebsiteUrl, candidateWebsiteStatus, reason, identityEvidence, matchaStatus });

export async function resolveTradeCandidateWebsite(input: LookupInput, find: Find, verify: Verify): Promise<CandidateWebsiteLookupResult> {
  const supplied = Boolean(input.candidateWebsiteUrl);
  let url = supplied ? candidateWebsite(input.candidateWebsiteUrl) : '';
  let best: WebsiteCandidateMatch | undefined;
  if (supplied && !url) return result('not_found', null, '記載URLは第三者サイト、SNS、ディレクトリ、または公式サイト候補にできないURLです。');
  if (!url) {
    let candidates: WebsiteCandidateMatch[];
    try { candidates = await find(); }
    catch { return result('fetch_failed', null, '公式サイト候補検索の応答を取得できませんでした。'); }
    best = candidates[0];
    if (!best) return result('not_found', null, '対象国で企業名に対応する公式サイト候補を確認できませんでした。');
    url = best.url;
    if (best.nameSimilarity < 0.55) return result('ambiguous', url, `候補は見つかりましたが、Google Places上の企業名一致度が${Math.round(best.nameSimilarity * 100)}%のため要確認です。`);
    const second = candidates[1];
    if (second && second.nameSimilarity >= 0.55 && best.nameSimilarity - second.nameSimilarity < 0.12)
      return result('ambiguous', url, '企業名が近い公式サイト候補が複数あり、一意に選べませんでした。');
  }
  let researched: OverseasCompany;
  try { researched = await verify(url); }
  catch { return result('fetch_failed', url, '候補URLの公開HTMLを取得できず、identityを確認できませんでした。'); }
  const matchaStatus = researched.products.some(product => product.kind === '抹茶原料・茶商品') ? 'matcha_found' :
    researched.products.some(product => product.kind === '加工品') ? 'processed_only' : 'unconfirmed';
  if (!researched.pages.length) return result('fetch_failed', url, researched.warnings[0] || '候補URLから確認可能な公開HTMLを取得できませんでした。', null, matchaStatus);
  const identity = researched.evidence.find(evidence => evidence.field === 'identity');
  if (researched.identityConfirmed) return result('verified', url,
    best ? `企業名一致度${Math.round(best.nameSimilarity * 100)}%に加え、既存identity判定で対象企業・国を確認しました。` : '記載URLを既存identity判定で対象企業・国と確認しました。',
    { url: identity?.url || url, text: identity?.quote || researched.address || `${input.companyName}の対象国所在地を確認` }, matchaStatus);
  if (supplied) return result('ambiguous', url, '記載URLは取得できましたが、既存identity判定で会社名・対象国所在地の一致を確認できませんでした。', null, matchaStatus);
  return result('candidate_found', url, `Google Placesで企業名${Math.round((best?.nameSimilarity || 0) * 100)}%一致の候補URLを取得しましたが、サイト本文から対象企業・国を十分確認できませんでした。`, null, matchaStatus);
}
