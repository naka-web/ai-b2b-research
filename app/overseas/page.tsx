'use client';
import Link from 'next/link';
import UsaCandidateSearch from './UsaCandidateSearch';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { countryProfiles } from '@/services/overseas/countryProfiles';
import { canonicalWebsite, findDuplicate } from '@/services/overseas/deduplication';
import { loadCompanies, saveCompany } from '@/services/overseas/clientStore';
import { pendingCompany, type Country, type OverseasCompany } from '@/services/overseas/types';
const external = { target: '_blank', rel: 'noopener noreferrer' };
export default function OverseasPage() {
  const transientIds = useRef(new Set<string>());
  const [candidateInput, setCandidateInput] = useState(false);
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
  async function run(c: OverseasCompany, refresh = false) {
    if (lock.current) return; lock.current = true; setBusy(c.id); setError(''); setMessage(''); setSelected(c.id);
    try {
      if (!refresh && c.status === '完了' && c.checkedAt && Date.now() - Date.parse(c.checkedAt) < 30 * 86400_000) { setMessage('30日以内の保存済み結果を表示しました。外部リクエストは実行していません。'); return; }
      await persist({ ...c, status: '調査中' });
      const response = await fetch('/api/overseas/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, name: c.name, country: c.country, website: c.website, refresh }) });
      const data = await response.json(); if (!response.ok || !data.company) throw new Error(data.error || '調査に失敗しました');
      await persist(data.company); setMessage(`${transientIds.current.has(c.id) ? '調査結果を画面内に表示しました（候補由来のため永続保存なし）。' : '調査結果を保存しました。'}外部HTTP ${data.company.requests}回／キャッシュ利用 ${data.company.cacheHits}回`);
    } catch (e) {
      const text = e instanceof Error ? e.message : '調査に失敗しました'; setError(text);
      try { await persist({ ...c, status: '確認待ち', warnings: [...c.warnings, text] }); } catch { setError(`${text}。ローカル保存にも失敗しました。`); }
    } finally { lock.current = false; setBusy(null); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!ready || lock.current) return; setError(''); setMessage('');
    try {
      const candidate = pendingCompany({ id: crypto.randomUUID(), name: name.trim(), country, website: canonicalWebsite(website) });
      const duplicate = findDuplicate(companies, candidate);
      if (duplicate) { setSelected(duplicate.id); setMessage(`「${duplicate.name}」と同じ企業名またはドメインです。重複追加せず既存結果を表示しました。別法人を同一法人として統合はしていません。`); return; }
      if (candidateInput) transientIds.current.add(candidate.id);
      await persist(candidate); await run(candidate);
    } catch (e) { setError(e instanceof Error ? e.message : '入力を確認してください'); }
  }
  const current = companies.find(c => c.id === selected);
  const cell = 'px-3 py-3 align-top border-t border-slate-200 text-sm';
  return <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <Link className="text-sm text-emerald-800 underline" href="/">← 国内検索・FDAへ</Link>
      <header><p className="text-sm font-semibold text-emerald-700">海外企業調査 · 手動入力MVP</p><h1 className="mt-2 text-3xl font-semibold">日本産抹茶の海外B2B企業</h1><p className="mt-3 text-sm text-slate-600">公式サイトの公開HTMLを必要な範囲で確認します。公式サイト調査では検索・Places・生成AI APIは使いません。取得制限や読めないページは確認待ちになります。</p></header>
      <UsaCandidateSearch disabled={!!busy || !ready} onSelect={candidate => {
        setCountry('US'); setName(candidate.companyName); setWebsite(candidate.candidateOfficialUrl); setCandidateInput(true);
        setError(''); setMessage('候補を入力欄に渡しました。企業名・URLを確認して「調査開始」を押してください。');
        manualForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        manualForm.current?.querySelector('input')?.focus({ preventScroll: true });
      }} />
      <h2 className="text-xl font-semibold">手動入力・選択した企業の調査</h2>
      {candidateInput && <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm"><p>Google Mapsの候補から入力しています。この調査結果は画面内のみで、再読み込みすると消えます。</p><button type="button" disabled={!!busy} className="mt-2 underline" onClick={() => { setCandidateInput(false); setName(''); setWebsite(''); }}>候補入力をクリアして手入力に戻る</button></div>}
      <form ref={manualForm} onSubmit={submit} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-[160px_1fr_2fr_auto]">
        <label className="text-sm font-medium">対象国<select value={country} onChange={e => setCountry(e.target.value as Country)} className="mt-2 block w-full rounded border border-slate-300 p-2">{Object.entries(countryProfiles).map(([code, p]) => <option key={code} value={code}>{p.label}</option>)}</select></label>
        <label className="text-sm font-medium">企業名<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="AIYA Europe" className="mt-2 block w-full rounded border border-slate-300 p-2" /></label>
        <label className="text-sm font-medium">公式サイトURL<input required type="url" maxLength={2000} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" className="mt-2 block w-full rounded border border-slate-300 p-2" /></label>
        <button disabled={!ready || !!busy} className="self-end rounded bg-emerald-800 px-5 py-2 text-white disabled:opacity-50">{busy ? '調査中…' : '調査開始'}</button>
      </form>
      <p className="text-xs text-slate-600">手入力の結果・根拠・取得ページはこのブラウザに保存されます。Google Maps候補からの調査は画面内のみです。再開時は保存ページを優先します。サーバーのページキャッシュは最大120件・30日（OS一時領域のため削除される場合があります）。各社最大8 HTTP要求、HTMLのみ。</p>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-emerald-800">{message || (!ready ? '保存結果を読み込み中…' : `${companies.length}社を表示中（うち保存済み${companies.filter(c => !transientIds.current.has(c.id)).length}社）`)}</p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1250px] text-left"><caption className="p-4 text-left font-semibold">調査結果</caption><thead className="bg-slate-100 text-xs"><tr>{['企業名','国','所在地','公式サイト','抹茶取扱い','日本産','B2B根拠','Supplier','A/B/C','調査状態','根拠'].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>
        {companies.map(c => <tr key={c.id} className={selected === c.id ? 'bg-emerald-50' : ''}>
          <td className={cell}><button className="font-semibold underline" onClick={() => setSelected(c.id)}>{c.name}</button>{transientIds.current.has(c.id) && <p className="text-xs text-sky-800">Google Maps候補・画面内のみ</p>}{c.legalName && <p className="mt-1 text-xs">{c.legalName}</p>}</td>
          <td className={cell}>{countryProfiles[c.country].label}</td><td className={cell}>{c.address || '未確認'}</td><td className={cell}><a {...external} className="text-emerald-800 underline" href={c.website}>公式サイト</a></td>
          <td className={cell}>{c.products.some(p => p.kind === '抹茶原料・茶商品') ? '原料・茶商品確認' : c.products.some(p => p.kind === '加工品') ? '加工品のみ' : '未確認'}</td>
          <td className={cell}>{c.products.some(p => p.origin === 'JP' && p.kind === '抹茶原料・茶商品') ? '確認済み' : c.products.some(p => p.origin === 'CN' || p.origin === 'OTHER') ? '他国産あり／日本産未確認' : '未確認'}</td>
          <td className={cell}>{c.b2bEvidenceIds.length ? c.evidence.find(e => e.id === c.b2bEvidenceIds[0])?.quote : '未確認'}</td><td className={cell}>{c.suppliers.length ? c.suppliers.map(s => `${s.name}（${s.relationship}）`).join(' / ') : '未確認'}</td>
          <td className={cell}><strong>{c.assessment || '—'}</strong></td><td className={cell}>{c.status}</td><td className={cell}><button className="underline" onClick={() => setSelected(c.id)}>{c.evidence.length}件を確認</button></td>
        </tr>)}
        {!companies.length && <tr><td colSpan={11} className="p-10 text-center text-slate-500">企業名と公式サイトを入力して調査を開始してください。</td></tr>}
      </tbody></table></div>
      {current && <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" aria-label="企業の根拠詳細">
        <h2 className="text-xl font-semibold">{current.name} · 根拠詳細</h2><p className="text-sm">{current.reasons.join(' ')} 確認日: {current.checkedAt ? new Date(current.checkedAt).toLocaleString('ja-JP') : '未確認'}</p>
        <div className="flex flex-wrap gap-3"><button disabled={!!busy} onClick={() => run(current)} className="rounded border px-4 py-2 disabled:opacity-50">保存結果を利用して再開</button><button disabled={!!busy} onClick={() => run(current, true)} className="rounded border px-4 py-2 disabled:opacity-50">最新ページを再取得（最大8要求）</button></div>
        <p className="text-sm">電話: {current.phones.join(' / ') || '未確認'}<br/>公開メール: {current.emails.join(' / ') || '未確認'}<br/>問い合わせフォーム: {current.contactFormUrl ? <a {...external} className="underline" href={current.contactFormUrl}>{current.contactFormUrl}</a> : '未確認'}</p>
        {current.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-800">{current.warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>}
        <h3 className="font-semibold">商品ごとの原産地</h3>{current.products.length ? <ul className="space-y-2 text-sm">{current.products.map(p => <li key={p.id} className="rounded bg-slate-50 p-3"><a {...external} className="underline" href={p.url}>{p.name}</a> — {p.kind} / 原産地: {p.origin} / 日本の産地: {p.region || '未確認'} / 海外加工: {p.processing || '未確認'}<br/>根拠: {p.evidenceIds.join(', ')}</li>)}</ul> : <p className="text-sm">未確認</p>}
        <h3 className="font-semibold">原文・根拠URL</h3><ul className="space-y-3 text-sm">{current.evidence.map(e => <li key={e.id} className="border-l-2 border-emerald-700 pl-3"><p className="text-xs text-slate-500">{e.id} · {e.field} · {new Date(e.checkedAt).toLocaleDateString('ja-JP')}</p><blockquote className="my-1 whitespace-pre-wrap break-words">{e.quote}</blockquote><a {...external} href={e.url} className="break-all text-emerald-800 underline">{e.url}</a></li>)}</ul>
      </section>}
    </div>
  </main>;
}
