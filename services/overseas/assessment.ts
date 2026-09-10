import type { OverseasCompany } from './types';
export function assess(company: OverseasCompany): Pick<OverseasCompany, 'assessment' | 'status' | 'reasons'> {
  const raw = company.products.filter(p => p.kind === '抹茶原料・茶商品');
  if (!company.pages.length) return { assessment: null, status: '確認待ち', reasons: ['公式本文を取得できませんでした。取扱なしとは判定しません。'] };
  if (!company.products.length) return { assessment: null, status: '確認待ち', reasons: ['取得したページでは抹茶商品の根拠を確定できませんでした。'] };
  if (!raw.length && company.products.some(p => p.kind === '未確認')) return { assessment: null, status: '確認待ち', reasons: ['抹茶商品の種類を確定できませんでした。'] };
  if (!raw.length) return { assessment: 'C', status: '完了', reasons: ['確認できたのは抹茶加工品のみです。'] };
  if (company.identityConfirmed && company.b2bEvidenceIds.length) return { assessment: 'A', status: '完了', reasons: ['会社主体・対象国所在地、抹茶、当該企業のB2B供給を公式本文で確認しました。原産地・Supplier名は必須条件ではありません。'] };
  const retailOnly = company.evidence.some(e => e.field === 'retailOnly');
  if (retailOnly && !company.b2bEvidenceIds.length) return { assessment: 'C', status: '完了', reasons: ['小売・カフェのみの営業という明示的根拠があります。'] };
  return { assessment: 'B', status: '確認待ち', reasons: [
    ...(!company.identityConfirmed ? ['会社主体または対象国所在地が未確認です。'] : []),
    ...(!company.b2bEvidenceIds.length ? ['当該企業の抹茶・茶に関するB2B供給根拠が不足しています。'] : []),
  ] };
}
