'use client';
import { useEffect, useState } from 'react';
import { createTradeDataProvider } from '@/services/overseas/candidates/tradeData';
import { screenTradeCandidateBatch } from '@/services/overseas/candidates/screening';
import { loadTradeScreenings, saveTradeScreening } from '@/services/overseas/clientStore';
import type { CandidateSearchResult, TradeScreeningRecord, UsaCandidate } from '@/services/overseas/candidates/types';
import type { OverseasCompany, ScreeningStatus } from '@/services/overseas/types';

const provider = createTradeDataProvider();
const external = { target: '_blank', rel: 'noopener noreferrer' };
const header = 'companyName,country,hsCode,productDescription,source,role,sourceUrl,originCountry,supplierName,importerName,exporterName,shipmentDate,quantity,unit,billOfLading,rawEvidence,officialWebsite';
const labels = { matcha_direct: 'matcha高シグナル（未確認）', green_tea_candidate: '緑茶候補（抹茶未確認）', unconfirmed: '未確認' };
const screeningLabels: Record<ScreeningStatus, string> = {
  matcha_confirmed: '抹茶確認済み', matcha_related_processed_only: '加工品のみ', green_tea_only: '緑茶のみ',
  no_matcha_found: '抹茶根拠なし', ambiguous: '要確認', not_found: '公式サイトなし', fetch_failed: '取得失敗', pending: '未処理',
};
type Filter = 'all' | 'confirmed' | 'processed' | 'green' | 'review' | 'failed';

export default function TradeCandidateImport({ disabled, onSelect, companies, onScreened }: {
  disabled: boolean; onSelect: (candidate: UsaCandidate) => void; companies: OverseasCompany[]; onScreened: (company: OverseasCompany) => Promise<OverseasCompany>;
}) {
  const [csv, setCsv] = useState(''); const [result, setResult] = useState<CandidateSearchResult | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [lookupIds, setLookupIds] = useState<Set<string>>(new Set()); const [batchBusy, setBatchBusy] = useState(false);
  const [screenings, setScreenings] = useState<Map<string, TradeScreeningRecord>>(new Map());
  const [filter, setFilter] = useState<Filter>('all'); const [batchSummary, setBatchSummary] = useState<Partial<Record<ScreeningStatus, number>> | null>(null);
  useEffect(() => { loadTradeScreenings().then(rows => setScreenings(new Map(rows.map(row => [row.candidateId, row])))).catch(() => setError('一括スクリーニング履歴を読み込めませんでした。')); }, []);
  function ingest() {
    setError(''); setMessage('');
    try {
      const next = provider.importCsv(csv);
      next.candidates = next.candidates.map(candidate => { const saved = screenings.get(candidate.id); return saved ? { ...candidate,
        candidateOfficialUrl: saved.candidateOfficialUrl, candidateWebsiteStatus: saved.candidateWebsiteStatus,
        candidateWebsiteReason: saved.candidateWebsiteReason, candidateWebsiteIdentityEvidence: saved.candidateWebsiteIdentityEvidence,
        candidateWebsiteMatchaStatus: saved.candidateWebsiteMatchaStatus } : candidate; });
      setResult(next); setBatchSummary(null); setMessage(`${next.candidates.length}件を画面内に取り込みました。外部APIへの送信はありません。保存済みscreening結果がある候補は復元しました。`);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'CSVを確認してください。'); }
  }
  const needsLookup = (candidate: UsaCandidate) => candidate.candidateWebsiteStatus === 'not_searched' ||
    (candidate.candidateWebsiteStatus === 'candidate_found' && candidate.candidateWebsiteReason.startsWith('CSV記載URL'));
  async function lookup(candidate: UsaCandidate, signal?: AbortSignal) {
    setLookupIds(old => new Set(old).add(candidate.id)); setError('');
    try {
      const response = await fetch('/api/overseas/candidate-website', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: candidate.companyName, country: candidate.country, candidateWebsiteUrl: candidate.candidateOfficialUrl || null }), cache: 'no-store', signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '公式サイト候補検索に失敗しました。');
      const updated = { ...candidate, candidateOfficialUrl: data.candidateWebsiteUrl || '', candidateWebsiteStatus: data.candidateWebsiteStatus,
        candidateWebsiteReason: data.reason, candidateWebsiteIdentityEvidence: data.identityEvidence, candidateWebsiteMatchaStatus: data.matchaStatus } as UsaCandidate;
      setResult(old => old ? { ...old, candidates: old.candidates.map(row => row.id === candidate.id ? updated : row) } : old);
      return updated;
    } catch (e) {
      const reason = e instanceof Error ? e.message : '公式サイト候補検索に失敗しました。';
      const updated = { ...candidate, candidateWebsiteStatus: 'fetch_failed' as const, candidateWebsiteReason: reason };
      setResult(old => old ? { ...old, candidates: old.candidates.map(row => row.id === candidate.id ? updated : row) } : old);
      return updated;
    } finally { setLookupIds(old => { const next = new Set(old); next.delete(candidate.id); return next; }); }
  }
  async function lookupBatch() {
    if (!result || batchBusy) return;
    const targets = result.candidates.filter(needsLookup).slice(0, 10); if (!targets.length) { setMessage('未検索の候補はありません。'); return; }
    setBatchBusy(true); setMessage(`${targets.length}件の公式サイト候補を検索しています（同時2件）。`);
    let next = 0; async function worker() { while (next < targets.length) await lookup(targets[next++]); }
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, worker));
    setBatchBusy(false); setMessage(`${targets.length}件の公式サイト候補検索を完了しました。完了状態は自動再検索しません。`);
  }
  async function screenBatch() {
    if (!result || batchBusy) return;
    setBatchBusy(true); setError(''); setBatchSummary(null); setMessage('HS / Trade候補を一括スクリーニングしています（最大10件・同時2件）。');
    try {
      const batch = await screenTradeCandidateBatch(result.candidates, {
        existing: screenings,
        lookup,
        research: async (candidate, signal) => {
          const response = await fetch('/api/overseas/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal,
            body: JSON.stringify({ id: candidate.id, name: candidate.companyName, country: candidate.country, website: candidate.candidateOfficialUrl, discoveryEvidence: candidate.tradeEvidence, screening: true }) });
          const data = await response.json(); if (!response.ok || !data.company) throw new Error(data.error || '公式サイト調査に失敗しました。');
          return data.company as OverseasCompany;
        },
        save: async outcome => {
          const company = outcome.company ? await onScreened(outcome.company) : null;
          const record = { ...outcome.record, companyId: company?.id || null };
          outcome.company = company; outcome.record = record;
          await saveTradeScreening(record);
          setScreenings(old => new Map(old).set(record.candidateId, record));
        },
      });
      setResult(old => old ? { ...old, candidates: old.candidates.map(candidate => batch.outcomes.find(outcome => outcome.candidate.id === candidate.id)?.candidate || candidate) } : old);
      setBatchSummary(batch.counts); setMessage(batch.processed ? `${batch.processed}件の一括スクリーニングを完了しました。最終状態の候補は自動再処理しません。` : '未処理の候補はありません。');
    } catch (e) { setError(e instanceof Error ? e.message : '一括スクリーニングに失敗しました。'); }
    finally { setBatchBusy(false); }
  }
  const filterMatch = (status: ScreeningStatus) => filter === 'all' ||
    (filter === 'confirmed' && status === 'matcha_confirmed') || (filter === 'processed' && status === 'matcha_related_processed_only') ||
    (filter === 'green' && status === 'green_tea_only') || (filter === 'failed' && status === 'fetch_failed') ||
    (filter === 'review' && ['pending', 'ambiguous', 'not_found', 'no_matcha_found'].includes(status));
  const displayed = result?.candidates.filter(candidate => filterMatch(screenings.get(candidate.id)?.screeningStatus || 'pending')) || [];
  return <section aria-label="HS Trade Data候補取り込み" className="space-y-4 rounded-xl border border-amber-200 bg-white p-5">
    <h2 className="text-xl font-semibold">HS / Trade Data候補</h2>
    <p className="text-sm text-slate-600">HS 090210 / 090220の手動・CSV候補を取り込みます。HSコード、原産国、consigneeという役割だけでは抹茶・importer・最終購入者を確定しません。</p>
    <label className="block text-sm font-medium">CSVを貼り付けて手動入力<textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} maxLength={200000}
      placeholder={`${header}\nExample Matcha Importer,USA,090220,JAPANESE MATCHA GREEN TEA,trade_test,consignee,,,,,,,,,,,https://example.invalid/`}
      className="mt-2 block w-full rounded border border-slate-300 p-2 font-mono text-xs" /></label>
    <div className="flex flex-wrap items-center gap-3">
      <label className="rounded border border-slate-400 px-4 py-2 text-sm">CSVファイルを選択<input type="file" accept=".csv,text/csv" className="ml-3 text-xs" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 200_000) { setError('CSVは200,000バイト以下にしてください。'); return; }
        setCsv(await file.text()); setError(''); setMessage('ファイルを読み込みました。「候補を取り込む」を押してください。');
      }} /></label>
      <button type="button" disabled={disabled || !csv.trim()} onClick={ingest} className="rounded bg-amber-700 px-5 py-2 text-white disabled:opacity-50">候補を取り込む</button>
    </div>
    <details className="text-xs text-slate-600"><summary className="cursor-pointer">CSV列を確認</summary><p className="mt-2 break-all">{header}</p><p className="mt-1">必須: companyName / country / hsCode / productDescription / source。officialWebsiteが未入力の候補は保持・表示できますが、公式サイト調査へは渡せません。</p></details>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}<p role="status" className="text-sm text-amber-900">{message}</p>
    {result && <><div className="flex flex-wrap items-center gap-3"><button type="button" disabled={disabled || batchBusy || !result.candidates.some(candidate => !screenings.has(candidate.id))} onClick={screenBatch} className="rounded bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-40">{batchBusy ? '一括スクリーニング中…' : '一括スクリーニング（最大10件）'}</button><button type="button" disabled={disabled || batchBusy || !result.candidates.some(needsLookup)} onClick={lookupBatch} className="rounded border border-amber-700 px-4 py-2 text-sm disabled:opacity-40">未確認候補のURL探索のみ（最大10件）</button><label className="text-sm">絞り込み <select value={filter} onChange={event => setFilter(event.target.value as Filter)} className="ml-2 rounded border p-2"><option value="all">全件</option><option value="confirmed">抹茶確認済み</option><option value="processed">加工品のみ</option><option value="green">緑茶のみ</option><option value="review">要確認</option><option value="failed">取得失敗</option></select></label></div>
      {batchSummary && <div className="rounded bg-amber-50 p-3 text-sm"><strong>一括処理結果</strong><p className="mt-1">処理件数: {Object.values(batchSummary).reduce((sum, count) => sum + (count || 0), 0)} / {Object.entries(batchSummary).map(([status, count]) => `${status}: ${count}`).join(' / ')}</p></div>}
      <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1600px] text-left">
      <caption className="p-3 text-left">HS / Trade Data候補一覧 — 元根拠は公式サイト調査後も保持されます</caption>
      <thead className="bg-slate-100 text-sm"><tr>{['企業名・国','HS / 商品説明','役割・原産国','取得元','取引情報','公式サイト候補','候補種別','スクリーニング結果','調査'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
      <tbody>{displayed.map((candidate, index) => { const trade = candidate.tradeEvidence[0]; const screening = screenings.get(candidate.id); const company = companies.find(item => item.id === screening?.companyId); const product = company?.products.find(item => item.kind !== '未確認'); const productEvidence = company?.evidence.find(item => product?.evidenceIds.includes(item.id)); const japanese = company?.evidenceSummaries.find(item => item.id === `official:${productEvidence?.id}`)?.japaneseSummary; const b2b = company?.evidence.find(item => company.b2bEvidenceIds.includes(item.id)); return <tr key={`${candidate.id}:${index}`}>
        <td className="border-t p-3 text-sm">{candidate.companyName}<br/><span className="text-xs">{candidate.country}</span></td>
        <td className="border-t p-3 text-sm"><strong>{trade.hsCode}</strong><br/>{trade.productDescription}</td>
        <td className="border-t p-3 text-sm">{trade.role}<br/><span className="text-xs">原産国: {trade.originCountry || 'unknown'}</span></td>
        <td className="border-t p-3 text-sm">{trade.source}{trade.sourceUrl && <><br/><a {...external} className="break-all underline" href={trade.sourceUrl}>元データを開く</a></>}</td>
        <td className="border-t p-3 text-xs">Supplier: {trade.supplierName || 'unknown'}<br/>Importer: {trade.importerName || 'unknown'}<br/>Exporter: {trade.exporterName || 'unknown'}<br/>出荷日: {trade.shipmentDate || 'unknown'}<br/>B/L: {trade.billOfLading || 'unknown'}</td>
        <td className="border-t p-3 text-sm">{candidate.candidateOfficialUrl ? <a {...external} className="break-all underline" href={candidate.candidateOfficialUrl}>{candidate.candidateOfficialUrl}</a> : 'unknown'}<p className="mt-1 font-semibold">{candidate.candidateWebsiteStatus}</p><p className="mt-1 text-xs">{candidate.candidateWebsiteReason || '未検索'}</p>{candidate.candidateWebsiteIdentityEvidence && <blockquote className="mt-1 border-l-2 pl-2 text-xs">{candidate.candidateWebsiteIdentityEvidence.text}</blockquote>}<p className="mt-1 text-xs">事前抹茶確認: {candidate.candidateWebsiteMatchaStatus}</p></td>
        <td className="border-t p-3 text-sm">{labels[candidate.candidateType]}</td>
        <td className="border-t p-3 text-sm"><strong>{screeningLabels[screening?.screeningStatus || 'pending']}</strong><p className="text-xs">有力候補: {screening?.isQualifiedLead ? 'はい' : 'いいえ'}</p>{screening?.screenedAt && <p className="text-xs">{new Date(screening.screenedAt).toLocaleString('ja-JP')}</p>}{productEvidence ? <><blockquote className="mt-2 border-l-2 pl-2 text-xs">{productEvidence.quote}</blockquote><a {...external} className="break-all text-xs underline" href={productEvidence.url}>{productEvidence.url}</a></> : <p className="mt-2 text-xs">抹茶根拠: 未確認</p>}{japanese && <p className="mt-2 text-xs">日本語要約: {japanese}</p>}{company && <p className="mt-2 text-xs">B2B: {b2b?.quote || '未確認'}<br/>属性: {company.companyRoles.map(role => role.role).join(' / ')}<br/>email: {company.emails.join(' / ') || '未確認'}<br/>form: {company.contactFormUrl || '未確認'}</p>}</td>
        <td className="border-t p-3 text-sm"><button type="button" disabled={disabled || batchBusy || lookupIds.has(candidate.id) || !needsLookup(candidate)} onClick={() => lookup(candidate)} className="mb-2 whitespace-nowrap rounded border px-3 py-2 disabled:opacity-40">{lookupIds.has(candidate.id) ? '検索中…' : '公式サイト候補を検索'}</button><br/><button type="button" disabled={disabled || candidate.candidateWebsiteStatus !== 'verified'} onClick={() => onSelect(candidate)} className="whitespace-nowrap rounded border border-amber-700 px-3 py-2 disabled:opacity-40">この企業を調査</button>{candidate.candidateWebsiteStatus !== 'verified' && <p className="mt-1 text-xs">identity未確認</p>}</td>
      </tr>; })}</tbody>
    </table></div></>}
  </section>;
}
