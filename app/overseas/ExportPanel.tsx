'use client';
import { useEffect, useMemo, useState } from 'react';
import { loadTradeScreenings } from '@/services/overseas/clientStore';
import { buildExportPackage, createDeliveryCsv, exportFilename, type ExportCountry, type ExportScope } from '@/services/overseas/exportData';
import { countryProfiles } from '@/services/overseas/countryProfiles';
import type { TradeScreeningRecord } from '@/services/overseas/candidates/types';
import type { OverseasCompany } from '@/services/overseas/types';

function download(contents: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type })); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export default function ExportPanel({ companies, disabled }: { companies: OverseasCompany[]; disabled: boolean }) {
  const [scope, setScope] = useState<ExportScope>('all'); const [country, setCountry] = useState<ExportCountry>('all');
  const [screenings, setScreenings] = useState<TradeScreeningRecord[]>([]); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  useEffect(() => { loadTradeScreenings().then(setScreenings).catch(() => setError('screening履歴を読み込めません。企業データのみで出力します。')); }, []);
  const data = useMemo(() => buildExportPackage(companies, screenings, scope, country), [companies, screenings, scope, country]);
  async function latestData() {
    try { const latest = await loadTradeScreenings(); setScreenings(latest); return buildExportPackage(companies, latest, scope, country); }
    catch { return data; }
  }
  async function excel() {
    if (!data.count || busy) return; setBusy(true); setError('');
    try { const current = await latestData(); const { createDeliveryWorkbook } = await import('@/services/overseas/exportWorkbook'); const bytes = createDeliveryWorkbook(current);
      download(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', exportFilename('xlsx', country)); setMessage(`${current.count}社のExcelを出力しました。`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Excel出力に失敗しました。'); } finally { setBusy(false); }
  }
  async function csv() {
    if (!data.count || busy) return; setBusy(true); setError(''); const current = await latestData();
    download(createDeliveryCsv(current), 'text/csv;charset=utf-8', exportFilename('csv', country)); setMessage(`${current.count}社のCSVを出力しました。`); setBusy(false);
  }
  return <section aria-label="クライアント納品用出力" className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5">
    <div><h2 className="text-xl font-semibold">クライアント納品用 Excel / CSV</h2><p className="mt-1 text-sm text-slate-600">保存済み・画面内の調査結果を出力します。未確認、取得失敗、明確な根拠なしは区別して表示します。</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">出力対象<select value={scope} onChange={event => setScope(event.target.value as ExportScope)} className="mt-2 block rounded border border-slate-300 p-2"><option value="all">全件</option><option value="matcha_confirmed">抹茶確認済み</option><option value="qualified">有力候補のみ</option><option value="include_review">有力候補＋要確認</option></select></label>
      <label className="text-sm font-medium">国・地域<select value={country} onChange={event => setCountry(event.target.value as ExportCountry)} className="mt-2 block rounded border border-slate-300 p-2"><option value="all">全対象国</option><option value="EU">EU</option>{Object.entries(countryProfiles).map(([code, profile]) => <option key={code} value={code}>{profile.label}</option>)}</select></label>
      <button type="button" disabled={disabled || busy || !data.count} onClick={excel} className="rounded bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Excel生成中…' : 'Excel出力'}</button>
      <button type="button" disabled={disabled || busy || !data.count} onClick={csv} className="rounded border border-emerald-800 px-4 py-2 text-sm disabled:opacity-40">CSV出力</button>
      <span className="pb-2 text-sm text-slate-600">対象 {data.count}社</span>
    </div>
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
