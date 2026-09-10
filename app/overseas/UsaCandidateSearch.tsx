'use client';
import { useRef, useState } from 'react';
import { MAX_CANDIDATES, MAX_KEYWORDS } from '@/services/overseas/candidates/conditions';
import type { CandidateSearchResult, UsaCandidate } from '@/services/overseas/candidates/types';
import { countryProfiles } from '@/services/overseas/countryProfiles';
import type { Country } from '@/services/overseas/types';
const external = { target: '_blank', rel: 'noopener noreferrer' };
const labels = { matcha_direct: '抹茶の記載あり', green_tea_candidate: '緑茶候補', unconfirmed: '未確認' };
export default function UsaCandidateSearch({ disabled, onSelect }: { disabled: boolean; onSelect: (candidate: UsaCandidate) => void }) {
  const [country, setCountry] = useState<Country>('US');
  const profile = countryProfiles[country];
  const [keywords, setKeywords] = useState<string[]>(countryProfiles.US.candidateSearch.defaults);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [result, setResult] = useState<CandidateSearchResult | null>(null);
  const [displayedKey, setDisplayedKey] = useState('');
  const [searchedKeywords, setSearchedKeywords] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function search() {
    if (lock.current || !keywords.length) return;
    setError('');
    const key = JSON.stringify({ country, keywords: [...keywords].sort() });
    if (key === displayedKey && result && !result.incomplete) { setMessage('同一条件の表示済み結果を利用しました。追加APIリクエストは0回です。'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/overseas/candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, keywords, limit: MAX_CANDIDATES }), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '候補検索に失敗しました。');
      setResult(data); setDisplayedKey(key); setSearchedKeywords([...keywords]);
      setMessage('候補を表示しました。企業サイト調査はまだ実行していません。');
    } catch (e) { setError(e instanceof Error ? e.message : '候補は未確認です。'); }
    finally { lock.current = false; setBusy(false); }
  }
  const cell = 'border-t border-slate-200 px-3 py-3 align-top text-sm';
  return <section aria-label="海外候補検索" className="space-y-4 rounded-xl border border-sky-200 bg-white p-5">
    <h2 className="text-xl font-semibold">海外候補検索</h2>
    <p className="text-sm text-slate-600">Google Placesから{profile.label}所在地のある企業・事業所候補を探します。検索一致だけでは日本産・B2B・A/B/Cを確定しません。公式サイト候補も未確認です。</p>
    <label className="block text-sm font-medium">候補検索の対象国<select disabled={busy || disabled} value={country} onChange={e => {
      const next = e.target.value as Country;
      setCountry(next); setKeywords(countryProfiles[next].candidateSearch.defaults);
      setResult(null); setDisplayedKey(''); setSearchedKeywords([]); setError(''); setMessage('');
    }} className="ml-3 rounded border border-slate-300 p-2">{(Object.keys(countryProfiles) as Country[]).map(code => <option key={code} value={code}>{countryProfiles[code].label}</option>)}</select></label>
    <fieldset disabled={busy || disabled} className="flex flex-wrap gap-x-5 gap-y-2">
      <legend className="mb-2 text-sm font-medium">検索語（最大{MAX_KEYWORDS}個・各10件・合計最大{MAX_CANDIDATES}候補）</legend>
      {profile.candidateSearch.keywords.map(keyword => <label key={keyword} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={keywords.includes(keyword)} disabled={!keywords.includes(keyword) && keywords.length >= MAX_KEYWORDS}
        onChange={e => setKeywords(old => e.target.checked ? [...old, keyword] : old.filter(k => k !== keyword))} />{keyword}</label>)}
    </fieldset>
    <button type="button" onClick={search} disabled={busy || disabled || !keywords.length} className="rounded bg-sky-800 px-5 py-2 text-white disabled:opacity-50">{busy ? '候補検索中…' : `${profile.label}候補を検索`}</button>
    <p className="text-xs text-slate-600">候補情報は表示中の画面内のみで扱い、ファイル・IndexedDB・サーバーキャッシュには保存しません。同一条件は表示済み結果を利用します。再読み込み後は再検索が必要です。</p>
    <p className="text-xs text-slate-600">候補検索には <a {...external} className="underline" href="https://maps.google.com/help/terms_maps.html">Google Mapsの利用規約</a> と <a {...external} className="underline" href="https://policies.google.com/privacy">Googleのプライバシーポリシー</a> が適用されます。検索語をGoogleに送信します。</p>
    {error && <p role="alert" className="text-sm text-red-800">{error} 取得できない候補は未確認です。{result ? '下の一覧は前回の検索結果です。' : ''}</p>}
    <p role="status" className="text-sm text-sky-900">{message}</p>
    {result && <>
      <p className="text-sm">表示中の検索語: {searchedKeywords.join(' / ')}</p>
      <p className="text-sm">{result.candidates.length}候補 ／ matcha_direct: {result.candidates.filter(c => c.candidateType === 'matcha_direct').length} ／ green_tea_candidate: {result.candidates.filter(c => c.candidateType === 'green_tea_candidate').length} ／ unconfirmed: {result.candidates.filter(c => c.candidateType === 'unconfirmed').length}<br/>この結果の取得時: API {result.apiRequests}回・重複除外{result.duplicatesRemoved}件</p>
      {result.warnings.map(w => <p key={w} className="text-sm text-amber-800">{w}</p>)}
      {result.incomplete && <p className="text-sm text-amber-800">検索は未完了です。30秒後に検索ボタンを押すと再試行できます。自動再試行はしません。</p>}
      <div className="overflow-x-auto rounded border border-slate-200"><table className="w-full min-w-[1100px] text-left">
        <caption className="p-3 text-left">{profile.label}候補一覧 — 商品・法人・B2Bの最終確認は公式サイト調査で行います</caption>
        <thead className="bg-slate-100 text-sm"><tr>{['企業名','所在地','公式サイト候補','候補種別','発見元','根拠','調査'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{result.candidates.map((c, i) => <tr key={`${c.id}:${i}`}>
          <td className={cell}>{c.companyName || '未確認'}</td><td className={cell}>{c.location || '未確認'}</td>
          <td className={cell}>{c.candidateOfficialUrl ? <a {...external} className="break-all text-sky-800 underline" href={c.candidateOfficialUrl}>{c.candidateOfficialUrl}</a> : '未確認'}</td>
          <td className={cell}>{labels[c.candidateType]}<br/><span className="text-xs text-slate-500">{c.candidateType}</span></td>
          <td className={cell}><span translate="no" className="whitespace-nowrap font-normal text-[#5e5e5e]">Google Maps</span>{c.sourceUrl && <><br/><a {...external} className="underline" href={c.sourceUrl}>発見元を開く</a></>}{c.attributions.map((a,j) => <p key={j}>{a.url ? <a {...external} className="underline" href={a.url}>{a.name}</a> : a.name}</p>)}</td>
          <td className={`${cell} max-w-sm`}><details><summary className="cursor-pointer">検索元の記載（{c.evidence.length}件）</summary>{c.evidence.map((e,j) => <blockquote key={j} className="mt-2 border-l-2 pl-2">{e.quote}<p className="text-xs text-slate-500">検索語: {e.matchedKeyword}</p></blockquote>)}</details></td>
          <td className={cell}><button type="button" disabled={disabled || busy || !c.companyName || !c.candidateOfficialUrl} className="whitespace-nowrap rounded border border-sky-700 px-3 py-2 text-sky-900 disabled:opacity-40" onClick={() => onSelect(c)}>この企業を調査</button><p className="mt-1 text-xs text-slate-500">{c.candidateOfficialUrl ? '下の入力欄へ渡します' : '公式サイトURL未確認'}</p></td>
        </tr>)}{!result.candidates.length && <tr><td colSpan={7} className="p-6 text-center">候補を取得できませんでした。取扱なしという判定ではありません。</td></tr>}</tbody>
      </table></div>
    </>}
  </section>;
}
