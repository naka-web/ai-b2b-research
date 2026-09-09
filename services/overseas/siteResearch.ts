import { readPageCache, writePageCache } from './pageCache';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import { canonicalWebsite, domainKey } from './deduplication';
import { countryProfiles } from './countryProfiles';
import { extract } from './extraction';
import type { PageSnapshot, ResearchInput } from './types';
const TTL = 30 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; body: string; type: string; status: number; location?: string }>();
const UA = 'MatchaResearch';
export function publicAddress(address: string) {
  try { const parsed = ipaddr.process(address); return parsed.range() === 'unicast'; } catch { return false; }
}
export function robotsAllowed(text: string, path: string) {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] }; let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(); const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') { if (hasRules) { groups.push(current); current = { agents: [], rules: [] }; hasRules = false; } current.agents.push(value.toLowerCase()); }
    else if (key === 'allow' || key === 'disallow') { hasRules = true; if (value) current.rules.push({ allow: key === 'allow', path: value }); }
  }
  groups.push(current);
  const specific = groups.filter(g => g.agents.some(a => a !== '*' && UA.toLowerCase().includes(a)));
  const selected = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  const matches = selected.flatMap(g => g.rules).filter(r => {
    const pattern = r.path.split('*').map(p => p.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*');
    try { return new RegExp(`^${pattern}`).test(path); } catch { return false; }
  }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}
async function wire(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('取得対象外のURLです');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('ローカル・非公開ネットワークへのアクセスはできません');
  // Pin the validated address; a second DNS lookup cannot redirect the socket to a private network.
  const pinned = addresses[0];
  return await new Promise<{ body: string; status: number; type: string; location?: string }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      family: pinned.family,
      headers: { 'User-Agent': `${UA}/1.0 (public company research)`, Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 750_000) { const error = new Error('ページ容量上限を超えました'); reject(error); response.destroy(); req.destroy(error); } else chunks.push(chunk); });
      response.on('aborted', () => reject(new Error('ページ取得が中断されました')));
      response.on('error', reject);
      response.on('end', () => { const type = String(response.headers['content-type'] || ''); const bytes = Buffer.concat(chunks); let body: string;
        try { body = new TextDecoder(type.match(/charset=["']?([^;"'\s]+)/i)?.[1] || 'utf-8').decode(bytes); } catch { body = bytes.toString('utf-8'); }
        resolve({ body, status: response.statusCode || 500, type, location: response.headers.location }); });
    });
    const timer = setTimeout(() => req.destroy(new Error('ページ取得がタイムアウトしました')), 5000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
}
export async function research(input: ResearchInput, refresh = false) {
  const pages: PageSnapshot[] = []; const warnings: string[] = []; let requests = 0, cacheHits = 0;
  const started = Date.now(); const origin = new URL(input.website).origin; const host = domainKey(input.website);
  const visited = new Set<string>(); let blocked = false;
  async function get(url: string) {
    const old = cache.get(url) || await readPageCache(url); if (!refresh && old && Date.now() - old.at < TTL) { cacheHits++; return old; }
    if (requests >= 8 || Date.now() - started > 40_000) throw new Error('取得予算の上限に達しました');
    requests++; const value = { ...await wire(new URL(url)), at: Date.now() };
    if ([200, 404].includes(value.status)) { if (cache.size >= 120) cache.delete(cache.keys().next().value!); cache.set(url, value); await writePageCache(url, value); }
    return value;
  }
  const robotsByOrigin = new Map<string, string>();
  async function robotsFor(origin: string) {
    if (robotsByOrigin.has(origin)) return robotsByOrigin.get(origin)!;
    let url = `${origin}/robots.txt`;
    const origins = new Set<string>();
    for (let redirects = 0; redirects <= 2; redirects++) {
      if (domainKey(url) !== host) throw new Error('別ドメインへの移動は手動確認が必要です');
      // Reuse only origins whose actual /robots.txt participated in this chain.
      const target = new URL(url);
      if (target.pathname === '/robots.txt' && !target.search) origins.add(target.origin);
      const r = await get(url);
      if (r.status >= 300 && r.status < 400 && r.location) {
        url = canonicalWebsite(new URL(r.location, url).toString());
        continue;
      }
      if (r.status !== 200 && r.status !== 404 && r.status !== 410) throw new Error(`robots.txtの取得を確認できません（HTTP ${r.status}）`);
      const robots = r.status === 200 ? r.body : '';
      robotsByOrigin.set(origin, robots);
      for (const checkedOrigin of origins) robotsByOrigin.set(checkedOrigin, robots);
      return robots;
    }
    throw new Error('robots.txtのリダイレクト上限です');
  }
  try {
    await robotsFor(origin);
  } catch (e) { blocked = true; warnings.push(e instanceof Error ? e.message : '取得可否を確認できません'); }
  async function page(url: string) {
    for (let redirects = 0; redirects <= 2; redirects++) {
      const u = new URL(url);
      if (domainKey(url) !== host) throw new Error('別ドメインへの移動は手動確認が必要です');
      const robots = await robotsFor(u.origin);
      if (!robotsAllowed(robots, u.pathname + u.search)) throw new Error('robots.txtによりこのページの取得は制限されています');
      const r = await get(url);
      if ([401, 403, 429].includes(r.status)) { blocked = true; throw new Error(`アクセス制限（HTTP ${r.status}）。回避せず停止しました`); }
      if (r.status >= 300 && r.status < 400 && r.location) { url = canonicalWebsite(new URL(r.location, url).toString()); continue; }
      if (r.status !== 200 || !/text\/html|application\/xhtml/i.test(r.type)) throw new Error(`HTMLを取得できません（HTTP ${r.status}）`);
      return { url, html: r.body, fetchedAt: new Date(r.at).toISOString() };
    }
    throw new Error('リダイレクト上限です');
  }
  const queue: { url: string; score: number }[] = [{ url: input.website, score: 200 }];
  const enqueue = (snapshot: PageSnapshot) => {
    const $ = load(snapshot.html);
    $('a[href]').each((_, el) => {
      try {
        const url = canonicalWebsite(new URL($(el).attr('href')!, snapshot.url).toString());
        if (domainKey(url) !== host || /\.(?:pdf|zip|jpg|png|svg|mp4|xml)$/i.test(new URL(url).pathname) || /logout|login|cart|checkout|account|search\?/i.test(url)) return;
        const label = `${$(el).text()} ${url}`;
        const score = /terms|conditions|nutzungsbedingungen|conditions-generales/i.test(label) ? 150 :
          countryProfiles[input.country].legal.test(label) ? 120 : /wholesale|B2B|Großhandel|grosshandel|grossiste|professionnel/i.test(label) ? 100 : /matcha|抹茶/i.test(label) ? 90 : /product|produit|sortiment|about|contact|kontakt/i.test(label) ? 50 : 0;
        if (score && !visited.has(url) && !queue.some(q => q.url === url)) queue.push({ url, score });
      } catch { /* invalid link */ }
    });
  };
  while (!blocked && queue.length && pages.length < 6 && Date.now() - started < 42_000) {
    const known = extract(input, pages);
    const priority = (q: { url: string; score: number }) => q.score === 120 && known.identityConfirmed ? q.score - 100 : q.score;
    queue.sort((a, b) => priority(b) - priority(a)); const next = queue.shift()!; if (visited.has(next.url)) continue; visited.add(next.url);
    try {
      const snapshot = await page(next.url); if (pages.some(p => p.url === snapshot.url)) continue;
      const text = load(snapshot.html)('body').text();
      if (/(?:scraping|crawling|automated (?:access|collection)).{0,100}(?:prohibited|forbidden|not permitted)|(?:prohibit|forbid|do not permit).{0,100}(?:scraping|crawling|automated)|automatisiert.{0,80}(?:untersagt|verboten)|(?:collecte|extraction) automatis[eé]e.{0,80}interdite/i.test(text)) { blocked = true; warnings.push('自動取得禁止の記載を検出しました。手動確認してください。'); break; }
      pages.push(snapshot); visited.add(snapshot.url); enqueue(snapshot);

      const current = extract(input, pages);
      if (current.assessment === 'A' && (current.emails.length || current.contactFormUrl) && !queue.some(q => q.score >= 120)) break;
    } catch (e) { warnings.push(e instanceof Error ? e.message : 'ページ取得に失敗しました'); if (requests >= 8) break; }
  }
  const result = extract(input, pages); result.requests = requests; result.cacheHits = cacheHits; result.warnings.push(...warnings);
  if (blocked || (warnings.length && result.assessment !== 'A')) result.status = '確認待ち';
  if ((blocked || warnings.length) && result.assessment === 'C') {
    result.assessment = null;
    result.reasons = ['一部ページを取得できないため、C判定を確定せず確認待ちにしました。取得済みの商品・根拠を確認してください。'];
  }
  return result;
}
