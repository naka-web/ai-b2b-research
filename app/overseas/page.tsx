'use client';
import Link from 'next/link';
import UsaCandidateSearch from './UsaCandidateSearch';
import TradeCandidateImport from './TradeCandidateImport';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UsaCandidate } from '@/services/overseas/candidates/types';
import { countryProfiles } from '@/services/overseas/countryProfiles';
import { canonicalWebsite, findDuplicate } from '@/services/overseas/deduplication';
import { loadCompanies, saveCompany } from '@/services/overseas/clientStore';
import { pendingCompany, type Country, type OverseasCompany } from '@/services/overseas/types';
const external = { target: '_blank', rel: 'noopener noreferrer' };
export default function OverseasPage() {
  const transientIds = useRef(new Set<string>());
  const [candidateInput, setCandidateInput] = useState<UsaCandidate | null>(null);
  const manualForm = useRef<HTMLFormElement>(null);
  const [companies, setCompanies] = useState<OverseasCompany[]>([]);
  const [country, setCountry] = useState<Country>('US'); const [name, setName] = useState(''); const [website, setWebsite] = useState('');
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState<string | null>(null); const lock = useRef(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { let cancelled = false;
    loadCompanies().then(async rows => {
      const recovered = rows.map(c => c.status === '調査中' ? { ...c, status: '確認待ち' as const, warnings: [...c.warnings, '前回の調査が中断しました。保存ページを再利用して再開できます。'] } : c);
      for (const c of recovered) if (rows.find(r => r.id === c.id)?.status === '調査中') await saveCompany(c);
      if (!cancelled) { setCompanies(recovered); setReady(true); }
    }).catch(() => { if (!cancelled) setError('ローカル保存を開けません。ブラウザのストレージ設定を確認してください。'); });
    return () => { cancelled = true; };
  }, []);
  async function persist(c: OverseasCompany) { if (!transientIds.current.has(c.id)) await saveCompany(c); setCompanies(rows => { const found = rows.some(r => r.id === c.id); return found ? rows.map(r => r.id === c.id ? c : r) : [...rows, c]; }); }
  async function persistScreened(c: OverseasCompany) {
    const duplicate = findDuplicate(companies, c);
    if (!duplicate || duplicate.id === c.id) { await persist(c); return c; }
    const discoveryEvidence = [...(duplicate.discoveryEvidence || [])];
    for (const evidence of c.discoveryEvidence || []) if (!discoveryEvidence.some(old => JSON.stringify(old) === JSON.stringify(evidence))) discoveryEvidence.push(evidence);
    const merged = { ...c, id: duplicate.id, discoveryEvidence };
    await persist(merged); return merged;
  }
  async function run(c: OverseasCompany, refresh = false) {
    if (lock.current) return; lock.current = true; setBusy(c.id); setError(''); setMessage(''); setSelected(c.id);
    try {
      if (!refresh && c.ruleVersion === '2' && c.evidenceSummaryVersion === '1' && c.status === '完了' && c.checkedAt && Date.now() - Date.parse(c.checkedAt) < 30 * 86400_000) { setMessage('30日以内の保存済み結果を表示しました。外部リクエストは実行していません。'); return; }
      await persist({ ...c, status: '調査中' });
      const response = await fetch('/api/overseas/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, name: c.name, country: c.country, website: c.website, discoveryEvidence: c.discoveryEvidence, refresh }) });
      const data = await response.json(); if (!response.ok || !data.company) throw new Error(data.error || '調査に失敗しました');
      await persist(data.company); setMessage(`${transientIds.current.has(c.id) ? '調査結果を画面内に表示しました（候補由来のため永続保存なし）。' : '調査結果を保存しました。'}外部HTTP ${data.company.requests}回／キャッシュ利用 ${data.company.cacheHits}回`);
    } catch (e) {
      const text = e instanceof Error ? e.message : '調査に失敗しました'; setError(text);
      try { await persist({ ...c, status: '確認待ち', contactStatus: c.emails.length || c.contactFormUrl ? c.contactStatus : 'fetch_failed', warnings: [...c.warnings, text] }); } catch { setError(`${text}。ローカル保存にも失敗しました。`); }
    } finally { lock.current = false; setBusy(null); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!ready || lock.current) return; setError(''); setMessage('');
    try {
      const candidate = pendingCompany({ id: crypto.randomUUID(), name: name.trim(), country, website: canonicalWebsite(website), discoveryEvidence: candidateInput?.tradeEvidence });
      const duplicate = findDuplicate(companies, candidate);
      if (duplicate) {
        if (candidate.discoveryEvidence?.length) {
          const discoveryEvidence = [...(duplicate.discoveryEvidence || [])];
          for (const evidence of candidate.discoveryEvidence) if (!discoveryEvidence.some(old => JSON.stringify(old) === JSON.stringify(evidence))) discoveryEvidence.push(evidence);
          transientIds.current.delete(duplicate.id); await persist({ ...duplicate, discoveryEvidence });
        }
        setSelected(duplicate.id); setMessage(`「${duplicate.name}」と同じ企業名またはドメインです。重複追加せず既存結果を表示しました。異なるHS / Trade元根拠は既存結果へ保持しました。`); return;
      }
      if (candidateInput?.provider === 'google_places') transientIds.current.add(candidate.id);
      await persist(candidate); await run(candidate);
    } catch (e) { setError(e instanceof Error ? e.message : '入力を確認してください'); }
  }
  function selectCandidate(candidate: UsaCandidate) {
    setCountry(candidate.country); setName(candidate.companyName); setWebsite(candidate.candidateOfficialUrl); setCandidateInput(candidate);
    setError(''); setMessage('候補を入力欄に渡しました。企業名・URLを確認して「調査開始」を押してください。');
    manualForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    manualForm.current?.querySelector('input')?.focus({ preventScroll: true });
  }
  const current = companies.find(c => c.id === selected);
  const summaryFor = (id: string) => current?.evidenceSummaries?.find(summary => summary.id === id);
  const evidenceStatus = { confirmed: '確認済み', unconfirmed: '未確認', review_required: '要確認', fetch_failed: '取得失敗' } as const;
  const summaryStatus = { generated: '日本語要約あり', not_generated: '日本語要約未生成', fetch_failed: '日本語要約取得失敗' } as const;
  const cell = 'px-3 py-3 align-top border-t border-slate-200 text-sm';
  return <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <Link className="text-sm text-emerald-800 underline" href="/">← 国内検索・FDAへ</Link>
      <header><p className="text-sm font-semibold text-emerald-700">海外企業調査 · 手動入力MVP</p><h1 className="mt-2 text-3xl font-semibold">抹茶関連の海外企業</h1><p className="mt-3 text-sm text-slate-600">公式サイトの公開HTMLを必要な範囲で確認します。日本産・Supplier名は必須条件ではありません。判定処理には検索・Places・生成AI APIを使わず、日本語要約だけを確認補助として生成します。取得制限や読めないページは確認待ちになります。</p></header>
      <UsaCandidateSearch disabled={!!busy || !ready} onSelect={selectCandidate} />
      <TradeCandidateImport disabled={!!busy || !ready} onSelect={selectCandidate} companies={companies} onScreened={persistScreened} />
      <h2 className="text-xl font-semibold">手動入力・選択した企業の調査</h2>
      {candidateInput && <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm"><p>{candidateInput.provider === 'google_places' ? 'Google Mapsの候補から入力しています。この調査結果は画面内のみで、再読み込みすると消えます。' : 'HS / Trade Data候補から入力しています。元の取引根拠は公式サイト調査後も結果に保持されます。'}</p><button type="button" disabled={!!busy} className="mt-2 underline" onClick={() => { setCandidateInput(null); setName(''); setWebsite(''); }}>候補入力をクリアして手入力に戻る</button></div>}
      <form ref={manualForm} onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-[160px_1fr_2fr_auto]">
        <label className="text-sm font-medium">対象国<select value={country} onChange={e => setCountry(e.target.value as Country)} className="mt-2 block w-full rounded border border-slate-300 p-2">{Object.entries(countryProfiles).map(([code, p]) => <option key={code} value={code}>{p.label}</option>)}</select></label>
        <label className="text-sm font-medium">企業名<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="AIYA Europe" className="mt-2 block w-full rounded border border-slate-300 p-2" /></label>
        <label className="text-sm font-medium">公式サイトURL<input required type="url" maxLength={2000} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" className="mt-2 block w-full rounded border border-slate-300 p-2" /></label>
        <button disabled={!ready || !!busy} className="self-end rounded bg-emerald-800 px-5 py-2 text-white disabled:opacity-50">{busy ? '調査中…' : '調査開始'}</button>
      </form>
      <p className="text-xs text-slate-600">手入力およびHS / Trade候補の結果・根拠・取得ページはこのブラウザに保存されます。Google Maps候補からの調査は画面内のみです。再開時は保存ページを優先します。サーバーのページキャッシュは最大120件・30日（OS一時領域のため削除される場合があります）。各社最大8 HTTP要求、HTMLのみ。</p>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-emerald-800">{message || (!ready ? '保存結果を読み込み中…' : `${companies.length}社を表示中（うち保存済み${companies.filter(c => !transientIds.current.has(c.id)).length}社）`)}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1350px] text-left"><caption className="p-4 text-left font-semibold">調査結果</caption><thead className="bg-slate-100 text-xs"><tr>{['企業名','国','所在地','公式サイト','抹茶取扱い','日本産','B2B根拠','Supplier','Screening','A/B/C','調査状態','根拠'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>
        {companies.map(c => <tr key={c.id} className={selected === c.id ? 'bg-emerald-50' : ''}>
          <td className={cell}><button className="font-semibold underline" onClick={() => setSelected(c.id)}>{c.name}</button>{transientIds.current.has(c.id) && <p className="text-xs text-sky-800">Google Maps候補・画面内のみ</p>}{c.discoveryEvidence?.length ? <p className="text-xs text-amber-800">HS / Trade根拠あり</p> : null}{c.legalName && <p className="mt-1 text-xs">{c.legalName}</p>}</td>
          <td className={cell}>{countryProfiles[c.country].label}</td><td className={cell}>{c.address || '未確認'}</td><td className={cell}><a {...external} className="text-emerald-800 underline" href={c.website}>公式サイト</a></td>
          <td className={cell}>{c.products.some(p => p.kind === '抹茶原料・茶商品') ? '原料・茶商品確認' : c.products.some(p => p.kind === '加工品') ? '加工品のみ' : '未確認'}</td>
          <td className={cell}>{c.products.some(p => p.origin === 'JP' && p.kind === '抹茶原料・茶商品') ? '確認済み' : c.products.some(p => p.origin === 'CN' || p.origin === 'OTHER') ? '他国産あり／日本産未確認' : '未確認'}</td>
          <td className={cell}>{c.b2bEvidenceIds.length ? c.evidence.find(e => e.id === c.b2bEvidenceIds[0])?.quote : '未確認'}</td><td className={cell}>{c.suppliers.length ? c.suppliers.map(s => `${s.name}（${s.relationship}）`).join(' / ') : '未確認'}</td><td className={cell}>{c.screeningStatus || 'pending'}<br/><span className="text-xs">有力候補: {c.isQualifiedLead ? 'はい' : 'いいえ'}</span></td>
          <td className={cell}><strong>{c.assessment || '—'}</strong></td><td className={cell}>{c.status}</td><td className={cell}><button className="underline" onClick={() => setSelected(c.id)}>{c.evidence.length}件を確認</button></td>
        </tr>)}
        {!companies.length && <tr><td colSpan={12} className="p-10 text-center text-slate-500">企業名と公式サイトを入力して調査を開始してください。</td></tr>}
      </tbody></table></div>
      {current && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" aria-label="企業の根拠詳細">
        <h2 className="text-xl font-semibold">{current.name} · 根拠詳細</h2><p className="text-sm">{current.reasons.join(' ')} 確認日: {current.checkedAt ? new Date(current.checkedAt).toLocaleString('ja-JP') : '未確認'}</p>{current.screeningVersion && <p className="rounded bg-amber-50 p-3 text-sm"><strong>Screening: {current.screeningStatus}</strong> / 有力候補: {current.isQualifiedLead ? 'はい' : 'いいえ'} / 実施日時: {current.screenedAt ? new Date(current.screenedAt).toLocaleString('ja-JP') : '未確認'}</p>}
        <div className="flex flex-wrap gap-3"><button disabled={!!busy} onClick={() => run(current)} className="rounded border px-4 py-2 disabled:opacity-50">保存結果を利用して再開</button><button disabled={!!busy} onClick={() => run(current, true)} className="rounded border px-4 py-2 disabled:opacity-50">最新ページを再取得（最大8要求）</button></div>
        <p className="text-sm">電話: {current.phones.join(' / ') || '未確認'}<br/>公開メール: {current.emails.join(' / ') || '未確認'}<br/>問い合わせフォーム: {current.contactFormUrl ? <a {...external} className="underline" href={current.contactFormUrl}>{current.contactFormUrl}</a> : '未確認'}</p>
        <p className="text-sm">連絡先取得状態: {current.contactStatus || '未確認（再調査してください）'}</p>
        <h3 className="font-semibold">企業属性・根拠</h3>
        <ul className="space-y-2 text-sm">{(current.companyRoles || [{ role: 'unknown', evidenceUrl: null, evidenceText: null }]).map(role => <li key={role.role} className="rounded bg-slate-50 p-3"><strong>{role.role}</strong>{role.evidenceText && <blockquote className="my-1">{role.evidenceText}</blockquote>}{role.evidenceUrl && <a {...external} className="break-all underline" href={role.evidenceUrl}>{role.evidenceUrl}</a>}</li>)}</ul>
        {current.discoveryEvidence?.length ? <><h3 className="font-semibold">HS / Trade Data元根拠</h3><ul className="space-y-3 text-sm">{current.discoveryEvidence.map((trade, index) => { const summary = summaryFor(`trade:${index}`); return <li key={`${trade.source}:${trade.billOfLading || index}`} className="rounded bg-amber-50 p-3"><strong>{trade.source} · HS {trade.hsCode}</strong><p className="mt-1 text-xs font-semibold">{summary ? evidenceStatus[summary.status] : '要確認'} · {summary ? summaryStatus[summary.summaryStatus] : '日本語要約未生成'}</p><p className="mt-2 font-medium">原文・元データ</p><blockquote className="whitespace-pre-wrap">{summary?.originalText || trade.rawEvidence || trade.productDescription}</blockquote><p className="mt-2 font-medium">日本語要約</p><p>{summary?.japaneseSummary || '未生成'}</p><p className="mt-1 text-xs">role: {trade.role} / 原産国: {trade.originCountry || 'unknown'} / 出荷日: {trade.shipmentDate || 'unknown'} / B/L: {trade.billOfLading || 'unknown'}</p>{trade.sourceUrl && <a {...external} className="break-all underline" href={trade.sourceUrl}>{trade.sourceUrl}</a>}</li>; })}</ul></> : null}
        {current.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-800">{current.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>}
        <h3 className="font-semibold">商品ごとの原産地</h3>{current.products.length ? <ul className="space-y-2 text-sm">{current.products.map(p => <li key={p.id} className="rounded bg-slate-50 p-3"><a {...external} className="underline" href={p.url}>{p.name}</a> — {p.kind} / 原産地: {p.origin} / 日本の産地: {p.region || '未確認'} / 海外加工: {p.processing || '未確認'}<br/>根拠: {p.evidenceIds.join(', ')}</li>)}</ul> : <p className="text-sm">未確認</p>}
        <h3 className="font-semibold">原文・日本語要約・根拠URL</h3><p className="text-xs text-slate-500">日本語要約API: {current.evidenceSummaryRequests || 0}回。要約は確認補助であり、判定には使用しません。email・電話番号は上の連絡先欄に原文のまま表示します。</p><ul className="space-y-3 text-sm">{current.evidence.filter(e => !['email', 'phone'].includes(e.field)).map(e => { const summary = summaryFor(`official:${e.id}`); return <li key={e.id} className="border-l-2 border-emerald-700 pl-3"><p className="text-xs text-slate-500">{e.id} · {summary?.category || e.field} · {new Date(e.checkedAt).toLocaleDateString('ja-JP')} · {summary ? evidenceStatus[summary.status] : '未確認'} · {summary ? summaryStatus[summary.summaryStatus] : '日本語要約未生成'}</p><p className="mt-1 font-medium">原文</p><blockquote className="whitespace-pre-wrap break-words">{summary?.originalText || e.quote}</blockquote><p className="mt-2 font-medium">日本語要約</p><p>{summary?.japaneseSummary || '未生成'}</p>{summary?.sourceLanguage && <p className="text-xs text-slate-500">原文言語: {summary.sourceLanguage} / 確信度: {summary.confidence || '未確認'}</p>}<a {...external} href={summary?.sourceUrl || e.url} className="break-all text-emerald-800 underline">{summary?.sourceUrl || e.url}</a></li>; })}</ul>
      </section>}
    </div>
  </main>;
}
