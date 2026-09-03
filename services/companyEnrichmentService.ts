import "server-only";

import { lookup } from "node:dns/promises";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { isIP } from "node:net";
import { promisify } from "node:util";
import type {
  BtoBSuitabilityLevel,
  CompanyEnrichment,
  CompanyEnrichmentCandidate,
  FinalAssessment,
  MatchaHandlingStatus,
  MatchaHandlingType,
} from "@/services/companyResearchTypes";

const MAX_PAGES_PER_COMPANY = 8;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const BROWSER_TIMEOUT_MS = 8_000;
const execFileAsync = promisify(execFile);

const b2bPositiveSignals = [
  ["業務用抹茶", 26], ["抹茶原料", 24], ["抹茶卸", 24],
  ["食品メーカー向け", 20], ["飲食店向け", 20], ["製菓向け", 20],
  ["法人向け", 18], ["食品卸", 18], ["茶卸", 18], ["卸売", 16],
  ["販売代理", 15], ["BtoB", 15], ["原材料", 13], ["商社", 13],
  ["問屋", 13], ["業務用", 13], ["OEM", 13], ["仕入れ", 11],
  ["供給", 11], ["PB", 11], ["輸出", 10], ["輸入", 10],
  ["原料", 9], ["卸", 8],
] as const;
const b2bNegativeSignals = [
  "個人向け通販のみ", "店舗販売のみ", "小売専門", "スイーツ店",
  "体験施設", "観光施設", "喫茶店", "レストラン", "カフェ",
] as const;
const b2bContextSignals = ["向け", "業務用", "卸", "法人", "供給", "仕入れ"];
const veryStrongSignals = [
  ["業務用抹茶", /業務用.{0,12}抹茶|抹茶.{0,12}業務用/i, 45],
  ["抹茶の卸・問屋", /抹茶.{0,20}(卸売|卸|問屋)|(卸売|卸|問屋).{0,20}抹茶/i, 45],
  ["法人向け抹茶", /法人向け.{0,20}抹茶|抹茶.{0,20}法人向け/i, 45],
  ["製菓・飲食店向け抹茶", /(製菓用|製菓向け|飲食店向け|カフェ向け).{0,20}抹茶|抹茶.{0,20}(製菓用|製菓向け|飲食店向け|カフェ向け)/i, 45],
  ["抹茶原料", /抹茶原料|抹茶.{0,12}(原料用|供給)|(?:原料用|供給).{0,12}抹茶/i, 40],
  ["抹茶OEM", /抹茶.{0,20}oem|oem.{0,20}抹茶/i, 45],
  ["卸問屋", /卸問屋/i, 35],
  ["OEM供給", /oem.{0,20}供給|供給.{0,20}oem/i, 30],
] as const;
const directMatchaBtoBSignals = [
  ["業務用抹茶", /業務用.{0,16}抹茶|抹茶.{0,16}業務用/i],
  ["抹茶卸・問屋", /抹茶.{0,20}(卸売|卸|問屋)|(?:卸売|卸|問屋).{0,20}抹茶/i],
  ["法人向け抹茶", /法人向け.{0,20}抹茶|抹茶.{0,20}法人向け/i],
  ["抹茶原料供給", /抹茶原料|抹茶.{0,20}供給|供給.{0,20}抹茶/i],
  ["用途別抹茶", /(?:製菓用|飲料用|飲食店向け|食品メーカー向け|製菓メーカー向け).{0,20}抹茶|抹茶.{0,20}(?:製菓用|飲料用|飲食店向け|食品メーカー向け|製菓メーカー向け)/i],
  ["抹茶OEM・PB", /抹茶.{0,20}(?:oem|pb)|(?:oem|pb).{0,20}抹茶/i],
  ["抹茶バルク販売", /抹茶.{0,20}バルク|バルク.{0,20}抹茶/i],
  ["抹茶輸出", /抹茶.{0,20}輸出|輸出.{0,20}抹茶/i],
] as const;
const businessSignals = [
  "法人向け", "業務用", "卸売", "business", "wholesale", "oem",
  "事業内容", "事業案内", "会社概要", "企業情報",
] as const;
const productSignals = [
  "抹茶", "matcha", "商品一覧", "商品紹介", "オンラインストア",
  "オンラインショップ", "通販", "shop", "store", "products", "product",
  "items", "item", "categories", "category", "製品一覧", "カテゴリ一覧",
  "業務用商品", "原料商品", "茶商品", "日本茶", "tea",
] as const;
const priorityProductSignals = [
  "商品", "商品案内", "商品紹介", "製品", "syouhin",
  "products", "product", "item", "shop",
] as const;
const searchSignals = ["サイト内検索", "search", "商品検索"] as const;
const contactSignals = [
  "法人お問い合わせ", "業務用お問い合わせ", "お問い合わせ", "問い合わせ",
  "資料請求", "contact us", "contact", "inquiry",
] as const;
const excludedHosts = [
  "amazon.co.jp", "amazon.com", "rakuten.co.jp", "rakuten.com",
  "shopping.yahoo.co.jp", "facebook.com", "instagram.com", "twitter.com",
  "x.com", "youtube.com",
] as const;
const excludedFiles = /\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|json|mov|mp3|mp4|pdf|png|pptx?|svg|webm|webp|xlsx?|xml|zip)(?:$|\?)/i;

type PageLink = {
  url: string;
  label: string;
  score: number;
  allowsExternalStore: boolean;
};
type PageSnapshot = {
  url: string;
  title: string;
  headings: string;
  text: string;
  html: string;
  links: PageLink[];
};

type FetchMethod = "normal" | "browser";

class PageFetchError extends Error {
  constructor(message: string, readonly status: "取得失敗" | "アクセス拒否" | "タイムアウト") {
    super(message);
  }
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<img\b[^>]*?alt\s*=\s*["']([^"']*)["'][^>]*>/gi, " $1 ")
      .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}
function normalizeHostname(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}
function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
  if (value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (!value.includes(".")) return false;
  const octets = value.split(".").map(Number);
  return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

async function assertSafeUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("Unsupported connection details");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Local address");
  if (isIP(hostname) && isPrivateAddress(hostname)) throw new Error("Private address");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Non-public address");
}

function getCharset(response: Response, bytes: Uint8Array) {
  const header = response.headers.get("content-type")?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  const preview = new TextDecoder("ascii").decode(bytes.slice(0, 4096));
  const meta = preview.match(/charset\s*=\s*["']?([^;"'\s/>]+)/i)?.[1];
  return (header || meta || "utf-8").replace(/^shift-jis$/i, "shift_jis");
}

async function readHtml(response: Response) {
  if (Number(response.headers.get("content-length") || 0) > MAX_HTML_BYTES) throw new Error("Response too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder(getCharset(response, bytes)).decode(bytes);
}

function hasMeaningfulContent(html: string) {
  const text = htmlToText(html);
  if (text.length < 80) return false;
  const withoutJsNotice = text
    .replace(/(?:please )?enable javascript(?: to (?:run|view|continue).*)?/gi, "")
    .replace(/javascriptを(?:有効|オン)にしてください/g, "")
    .trim();
  return withoutJsNotice.length >= 80;
}

async function chromeExecutable() {
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* try the next known executable */ }
  }
  throw new PageFetchError("Headless browser is unavailable", "取得失敗");
}

async function fetchRenderedHtml(input: string) {
  const url = new URL(input);
  await assertSafeUrl(url);
  try {
    const { stdout } = await execFileAsync(await chromeExecutable(), [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--dump-dom", "--virtual-time-budget=5000", url.toString(),
    ], { timeout: BROWSER_TIMEOUT_MS, maxBuffer: MAX_HTML_BYTES });
    if (!hasMeaningfulContent(stdout)) throw new PageFetchError("Rendered page has no meaningful content", "取得失敗");
    return { html: stdout, url: url.toString(), method: "browser" as FetchMethod };
  } catch (error) {
    if (error instanceof PageFetchError) throw error;
    const timedOut = error instanceof Error && /timed out|timeout|etimedout/i.test(error.message);
    throw new PageFetchError("Headless browser failed", timedOut ? "タイムアウト" : "取得失敗");
  }
}

async function fetchHtmlNormally(input: string) {
  let url = new URL(input);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertSafeUrl(url);
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "AI-B2B-Research/1.0 (public company information crawler)",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect without location");
        url = new URL(location, url);
        continue;
      }
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new PageFetchError(`HTTP ${response.status}`, "アクセス拒否");
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("Not HTML");
      const html = await readHtml(response);
      if (!hasMeaningfulContent(html)) throw new PageFetchError("HTML has no meaningful content", "取得失敗");
      return { html, url: url.toString(), method: "normal" as FetchMethod };
    }
    throw new Error("Too many redirects");
  } catch (error) {
    if (error instanceof PageFetchError) throw error;
    const timedOut = error instanceof Error && /timeout|aborted/i.test(error.message);
    throw new PageFetchError("Normal HTML fetch failed", timedOut ? "タイムアウト" : "取得失敗");
  }
}

async function fetchHtml(input: string, allowBrowserFallback = false) {
  try {
    return await fetchHtmlNormally(input);
  } catch (normalError) {
    if (!allowBrowserFallback) throw normalError;
    return fetchRenderedHtml(input);
  }
}

function excludedHost(hostname: string) {
  const host = normalizeHostname(hostname);
  return excludedHosts.some((item) => host === item || host.endsWith(`.${item}`));
}
function linkScore(input: string) {
  const text = normalizeText(input);
  let score = 0;
  if (text.includes("抹茶") || text.includes("matcha")) score += 320;
  if (searchSignals.some((term) => text.includes(term))) score += 240;
  if (businessSignals.some((term) => text.includes(term))) score += 220;
  if (["category", "カテゴリ", "日本茶", "tea"].some((term) => text.includes(term))) score += 180;
  if (productSignals.some((term) => text.includes(term))) score += 140;
  if (priorityProductSignals.some((term) => text.includes(term))) score += 180;
  if (contactSignals.some((term) => text.includes(term))) score += 90;
  return score;
}

function searchFormLinks(html: string, pageUrl: string): PageLink[] {
  const links: PageLink[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const method = match[1].match(/method\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase() || "get";
    if (method !== "get") continue;
    const action = match[1].match(/action\s*=\s*["']([^"']+)["']/i)?.[1] || pageUrl;
    const names = [...match[2].matchAll(/<input\b[^>]*name\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((input) => input[1]);
    const keywordName = names.find((name) => /^(q|query|keyword|search|searchword)$/i.test(name));
    if (!keywordName) continue;
    try {
      const url = new URL(decodeHtml(action), pageUrl);
      url.searchParams.set(keywordName, "抹茶");
      links.push({ url: url.toString(), label: "サイト内検索 抹茶", score: 400, allowsExternalStore: false });
    } catch { /* malformed form action */ }
  }
  return links;
}

function pageLinks(html: string, pageUrl: string): PageLink[] {
  const page = new URL(pageUrl);
  const links: PageLink[] = [];
  for (const match of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), page);
      url.hash = "";
      if (!["http:", "https:"].includes(url.protocol) || excludedFiles.test(url.pathname)) continue;
      const label = htmlToText(match[2]);
      const sameHost = normalizeHostname(page.hostname) === normalizeHostname(url.hostname);
      const storeLink = [...productSignals, ...priorityProductSignals]
        .some((term) => normalizeText(`${label} ${url}`).includes(term));
      const allowsExternalStore = !sameHost && storeLink && !excludedHost(url.hostname);
      if (!sameHost && !allowsExternalStore) continue;
      const score = linkScore(`${label} ${url}`);
      if (score) links.push({ url: url.toString(), label, score, allowsExternalStore });
    } catch { /* malformed link */ }
  }
  return [...links, ...searchFormLinks(html, pageUrl)];
}

function parsePage(html: string, url: string): PageSnapshot {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const headings = [...html.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map((match) => htmlToText(match[1])).join(" ");
  return { url, title: htmlToText(title), headings, text: htmlToText(html), html, links: pageLinks(html, url) };
}

function emailsFrom(pages: PageSnapshot[]) {
  const emails = new Set<string>();
  const pattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  for (const page of pages) {
    const mailtos = [...decodeHtml(page.html).matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)/gi)].map((match) => match[1]);
    for (const match of `${page.text} ${mailtos.join(" ")}`.matchAll(pattern)) {
      const email = match[0].toLowerCase().replace(/[),.;:]+$/, "");
      if (!email.includes("example.") && !/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) emails.add(email);
    }
  }
  return [...emails].slice(0, 10);
}

function hasContactForm(page: PageSnapshot) {
  const form = /<form\b[\s\S]*?<\/form>/i.test(page.html);
  const controls = /<(input|textarea|select)\b/i.test(page.html);
  const submit = /<(button|input)\b[^>]*type\s*=\s*["']?submit/i.test(page.html) || /<button\b[^>]*>[\s\S]{0,200}?(送信|確認|submit)/i.test(page.html);
  const embedded = /<iframe\b[^>]+src\s*=\s*["'][^"']*(form|contact|inquiry)/i.test(page.html);
  return (form && controls && submit) || embedded;
}
function contactUrlFrom(pages: PageSnapshot[]) {
  return pages.filter(hasContactForm).map((page) => ({
    url: page.url,
    score: contactSignals.filter((term) => normalizeText(`${page.title} ${page.url} ${page.text.slice(0, 2000)}`).includes(term)).length,
  })).filter(({ score }) => score).sort((a, b) => b.score - a.score)[0]?.url;
}

function containsSignal(text: string, term: string) {
  const normalized = term.toLowerCase();
  return /^[a-z0-9]+$/i.test(term)
    ? new RegExp(`(^|[^a-z0-9])${normalized}([^a-z0-9]|$)`, "i").test(text)
    : text.includes(normalized);
}
function protectedNegativeContext(text: string, signal: string) {
  let index = text.indexOf(signal);
  while (index >= 0) {
    const context = text.slice(Math.max(0, index - 50), index + signal.length + 50);
    if (b2bContextSignals.some((term) => context.includes(term))) return true;
    index = text.indexOf(signal, index + signal.length);
  }
  return false;
}

function signalHasNearbyContext(text: string, signal: string, contextTerms: string[]) {
  let index = text.indexOf(signal);
  while (index >= 0) {
    const context = text.slice(Math.max(0, index - 60), index + signal.length + 60);
    if (contextTerms.some((term) => context.includes(term))) return true;
    index = text.indexOf(signal, index + signal.length);
  }
  return false;
}

function assessBtoB(pages: PageSnapshot[]) {
  const matches = new Map<string, { weight: number; urls: Set<string> }>();
  const veryStrongMatches = new Map<string, { weight: number; urls: Set<string> }>();
  const negatives = new Map<string, Set<string>>();
  for (const page of pages) {
    const text = normalizeText(`${page.title} ${page.headings} ${page.text}`);
    for (const [label, pattern, weight] of veryStrongSignals) {
      if (!pattern.test(text)) continue;
      const match = veryStrongMatches.get(label) ?? { weight, urls: new Set<string>() };
      match.urls.add(page.url);
      veryStrongMatches.set(label, match);
    }
    for (const [term, weight] of b2bPositiveSignals) {
      if (!containsSignal(text, term)) continue;
      if (
        (term === "原料" || term === "原材料") &&
        !signalHasNearbyContext(text, term, ["業務用", "供給", "卸", "oem", "メーカー向け"])
      ) {
        continue;
      }
      if (
        term === "法人向け" &&
        signalHasNearbyContext(text, term, ["ギフト", "記念品", "贈答", "大量注文", "お菓子"])
      ) {
        continue;
      }
      const match = matches.get(term) ?? { weight, urls: new Set<string>() };
      match.urls.add(page.url);
      matches.set(term, match);
    }
    for (const term of b2bNegativeSignals) {
      if (!text.includes(term) || protectedNegativeContext(text, term)) continue;
      const urls = negatives.get(term) ?? new Set<string>();
      urls.add(page.url);
      negatives.set(term, urls);
    }
  }
  const veryStrongScore = Math.min(
    70,
    [...veryStrongMatches.values()].reduce((sum, match) => sum + match.weight, 0),
  );
  const regularScore = [...matches.values()].reduce((sum, match) => sum + match.weight, 0);
  const positive = Math.min(100, veryStrongScore + regularScore);
  const negativeScore = Math.min(matches.size ? 12 : 35, negatives.size * 8);
  const score = positive;
  let suitability: BtoBSuitabilityLevel =
    matches.size === 0 && veryStrongMatches.size === 0 && negatives.size === 0
      ? "判定不能"
      : "低";
  if (veryStrongMatches.size > 0 || (score >= 45 && matches.size >= 2)) suitability = "高";
  else if (score >= 20 && matches.size) suitability = "中";
  const reasons = matches.size || veryStrongMatches.size
    ? [
        veryStrongMatches.size
          ? `非常に強い法人取引の記載を確認: ${[...veryStrongMatches.keys()].join("、")}`
          : `法人取引に関する記載を確認: ${[...matches.keys()].slice(0, 10).join("、")}`,
      ]
    : ["商社・卸・問屋・業務用など法人取引の記載を確認できず"];
  if (veryStrongMatches.size && matches.size) {
    reasons.push(`その他の法人取引語: ${[...matches.keys()].slice(0, 10).join("、")}`);
  }
  if (negatives.size) reasons.push(`消費者向け業態の記載も確認: ${[...negatives.keys()].join("、")}`);
  const urls = new Set<string>();
  veryStrongMatches.forEach((match) => match.urls.forEach((url) => urls.add(url)));
  matches.forEach((match) => match.urls.forEach((url) => urls.add(url)));
  negatives.forEach((values) => values.forEach((url) => urls.add(url)));
  const evidenceLabels = [
    ...veryStrongMatches.keys(),
    ...[...matches.keys()].filter((label) => !veryStrongMatches.has(label)),
  ];
  const businessTypes = [
    ...(evidenceLabels.some((label) => /業務用|飲食店向け|食品メーカー向け/.test(label))
      ? ["原料・業務用取引"]
      : []),
    ...(evidenceLabels.some((label) => /卸|問屋|商社/.test(label)) ? ["卸・問屋"] : []),
    ...(evidenceLabels.some((label) => /OEM|PB/i.test(label)) ? ["OEM・PB"] : []),
    ...(evidenceLabels.some((label) => /輸出/.test(label)) ? ["輸出"] : []),
    ...(pages.some((page) => /法人.{0,12}(ギフト|記念品|贈答|大量注文)|(?:ギフト|記念品|贈答|大量注文).{0,12}法人/.test(normalizeText(page.text)))
      ? ["法人ギフト・まとめ買い"]
      : []),
  ];
  return {
    suitability,
    score,
    positiveScore: positive,
    negativeScore,
    reasons,
    urls: [...urls],
    evidenceLabels,
    businessTypes,
  };
}

function assessDirectMatchaBtoB(pages: PageSnapshot[]) {
  const labels = new Set<string>();
  const urls = new Set<string>();
  for (const page of pages) {
    const text = normalizeText(`${page.title} ${page.headings} ${page.text}`);
    for (const [label, pattern] of directMatchaBtoBSignals) {
      if (!pattern.test(text)) continue;
      labels.add(label);
      urls.add(page.url);
    }
  }
  return {
    labels: [...labels],
    urls: [...urls],
    score: labels.size ? Math.min(50, 35 + (labels.size - 1) * 5) : 0,
  };
}

function strongMatchaPage(page: PageSnapshot) {
  const heading = normalizeText(`${page.title} ${page.headings}`);
  const url = normalizeText(page.url);
  const editorial = /\/(news|blog|column|press|topics?)\b/.test(url);
  if (editorial) return false;
  if (heading.includes("抹茶") || heading.includes("matcha")) return true;
  if ((url.includes("matcha") || url.includes(encodeURIComponent("抹茶").toLowerCase())) && !editorial) return true;
  const matchaLink = page.links.some((link) => {
    const label = normalizeText(link.label);
    return label.includes("抹茶") || label.includes("matcha");
  });
  const productContext = [...productSignals, ...priorityProductSignals]
    .some((term) => normalizeText(`${page.title} ${page.headings} ${page.url}`).includes(term));
  return matchaLink && productContext && !editorial;
}

function assessMatcha(pages: PageSnapshot[]) {
  const mentions = pages.filter((page) =>
    /抹茶|matcha/i.test(normalizeText(`${page.title} ${page.headings} ${page.text}`)),
  );
  const pageText = (page: PageSnapshot) =>
    normalizeText(
      `${page.title} ${page.headings} ${page.text} ${page.links.map((link) => link.label).join(" ")}`,
    );
  const isEditorialPage = (page: PageSnapshot) =>
    /\/(news|blog|column|press|topics?|archives?)\b/i.test(normalizeText(page.url));
  const patterns: Array<{
    type: MatchaHandlingType;
    pattern: RegExp;
    score: number;
  }> = [
    {
      type: "抹茶OEM",
      pattern: /抹茶.{0,25}(oem|pb|受託製造)|(?:oem|pb|受託製造).{0,25}抹茶/i,
      score: 50,
    },
    {
      type: "業務用抹茶",
      pattern:
        /業務用.{0,20}抹茶|抹茶.{0,20}(業務用|製菓用|飲料用|飲食店向け|食品メーカー向け|バルク販売)/i,
      score: 50,
    },
    {
      type: "抹茶原料",
      pattern: /抹茶原料|抹茶.{0,20}(粉末|供給|卸売|卸|問屋|輸出)|(?:原料用|粉末|供給|卸売|卸|問屋).{0,20}抹茶/i,
      score: 50,
    },
  ];

  for (const classification of patterns) {
    const evidence = mentions.filter(
      (page) => !isEditorialPage(page) && classification.pattern.test(pageText(page)),
    );
    if (evidence.length) {
      return {
        status: "確認済み" as MatchaHandlingStatus,
        type: classification.type,
        reasons: [`${classification.type}を示す商品・業務ページの記載を確認`],
        urls: [...new Set(evidence.map((page) => page.url))],
        score: classification.score,
      };
    }
  }

  const finishedProductPattern =
    /抹茶.{0,24}(味|風味|使用|入り|ドーナツ|ベーグル|パン|クッキー|チョコ|ケーキ|アイス|ラングドシャ|菓子|スイーツ|ドリンク|ラテ|プリン|バウム|ロール|サンド|クリーム|あん|餡)|(?:ドーナツ|ベーグル|パン|クッキー|チョコ|ケーキ|アイス|ラングドシャ|菓子|スイーツ|ドリンク|ラテ|プリン|バウム|ロール|サンド|クリーム|あん|餡).{0,24}抹茶/i;
  const finishedProducts = mentions.filter((page) => finishedProductPattern.test(pageText(page)));
  const standaloneTeaPattern =
    /抹茶.{0,20}(缶|粉末茶|茶葉|薄茶|濃茶|石臼挽き|商品一覧|商品カテゴリ|カテゴリ一覧|宇治|有機)|(?:缶|粉末茶|茶葉|薄茶|濃茶|石臼挽き|商品一覧|商品カテゴリ|カテゴリ一覧|宇治|有機).{0,20}抹茶|(?:抹茶カテゴリ|抹茶の商品(?:一覧|カテゴリ))/i;
  const standaloneTeaListPattern =
    /(?:煎茶|芽茶|粉茶|玉露|ほうじ茶|ウーロン茶).{0,24}抹茶|抹茶.{0,24}(?:煎茶|芽茶|粉茶|玉露|ほうじ茶|ウーロン茶)/i;
  const dedicatedMatchaCategory = (page: PageSnapshot) => {
    const title = normalizeText(page.title);
    const headings = normalizeText(page.headings);
    const url = normalizeText(page.url);
    const matchaAsPrimaryHeading = /^(?:抹茶|matcha)(?:\s|[|｜:：\-]|$)/i.test(title)
      || /^(?:抹茶|matcha)(?:\s|[|｜:：\-]|$)/i.test(headings);
    const categoryUrl = /\/(?:category|categories|collection|collections|products?|items?|shop)\/[^?#]*matcha(?:[/?#]|$)/i.test(url);
    const standaloneProductNames = page.links.filter((link) => {
      const label = normalizeText(link.label);
      return /(?:宇治|西尾|有機|オーガニック|[一-龠々ヶ]{2,})抹茶(?:\s|$)/i.test(label)
        && !finishedProductPattern.test(label);
    }).length;
    return matchaAsPrimaryHeading || categoryUrl || standaloneProductNames >= 2;
  };
  const standaloneProducts = mentions.filter(
    (page) =>
      !isEditorialPage(page) &&
      (strongMatchaPage(page) || priorityProductSignals.some((term) =>
        normalizeText(`${page.title} ${page.headings} ${page.url}`).includes(term),
      )) &&
      (dedicatedMatchaCategory(page)
        || standaloneTeaListPattern.test(pageText(page))
        || (standaloneTeaPattern.test(pageText(page)) && !finishedProductPattern.test(pageText(page)))),
  );
  const noHandling = pages.filter((page) =>
    /(抹茶.{0,20}(取扱|取り扱い|販売).{0,10}(なし|終了)|抹茶は.{0,20}扱っておりません)/.test(
      normalizeText(page.text),
    ),
  );

  if (standaloneProducts.length) {
    return {
      status: "確認済み" as MatchaHandlingStatus,
      type: "抹茶そのもの／茶商品" as MatchaHandlingType,
      reasons: ["抹茶そのもの、または茶商品としての商品・カテゴリ掲載を確認"],
      urls: [...new Set(standaloneProducts.map((page) => page.url))],
      score: 25,
    };
  }
  if (finishedProducts.length) {
    return {
      status: "確認済み" as MatchaHandlingStatus,
      type: "抹茶使用商品のみ" as MatchaHandlingType,
      reasons: [
        "抹茶を使用した菓子・飲料等のみ確認。業務用抹茶・抹茶原料の根拠は確認できず",
      ],
      urls: [...new Set(finishedProducts.map((page) => page.url))],
      score: 6,
    };
  }
  if (noHandling.length) {
    return {
      status: "取扱なし" as MatchaHandlingStatus,
      type: "不明" as MatchaHandlingType,
      reasons: ["公式サイトに抹茶の取扱終了または取扱なしの明示を確認"],
      urls: noHandling.map((page) => page.url),
      score: 0,
    };
  }
  return {
    status: "未確認" as MatchaHandlingStatus,
    type: (mentions.length ? "抹茶加工品" : "不明") as MatchaHandlingType,
    reasons: [
      mentions.length
        ? "抹茶への言及はあるものの、取扱種別を特定できませんでした"
        : "確認したページで抹茶取扱の根拠を確認できませんでした",
    ],
    urls: mentions.map((page) => page.url),
    score: mentions.length ? 3 : 0,
  };
}

function finalAssessment(matcha: MatchaHandlingStatus, b2b: BtoBSuitabilityLevel): FinalAssessment {
  if (matcha === "取扱なし") return "低";
  if (matcha === "確認済み") {
    if (b2b === "高" || b2b === "中") return "高";
    if (b2b === "低") return "中";
    return "要確認";
  }
  if (b2b === "低") return "低";
  return "要確認";
}

function finalAssessmentForType(
  matchaStatus: MatchaHandlingStatus,
  matchaType: MatchaHandlingType,
  b2b: BtoBSuitabilityLevel,
): FinalAssessment {
  if (matchaStatus === "取扱なし") return "低";
  if (matchaType === "抹茶使用商品のみ" || matchaType === "抹茶加工品") return "低";
  if (matchaType === "抹茶そのもの／茶商品") {
    if (b2b === "高") return "高";
    if (b2b === "中") return "中";
    return "要確認";
  }
  return finalAssessment(matchaStatus, b2b);
}

async function inspectWebsite(website: string) {
  const first = await fetchHtml(website, true);
  const firstPage = parsePage(first.html, first.url);
  const pages = [firstPage];
  const visited = new Set([firstPage.url]);
  const trustedHosts = new Set([normalizeHostname(new URL(firstPage.url).hostname)]);
  const queue = [...firstPage.links];

  const siteRoot = new URL("/", firstPage.url).toString();
  if (siteRoot !== firstPage.url) {
    visited.add(siteRoot);
    try {
      const response = await fetchHtml(siteRoot);
      visited.add(response.url);
      const rootPage = parsePage(response.html, response.url);
      pages.push(rootPage);
      queue.push(...rootPage.links);
    } catch { /* the supplied page can still be assessed */ }
  }

  if (assessMatcha(pages).status !== "確認済み") {
    const priorityProductLinks = queue
      .filter((link) =>
        priorityProductSignals.some((term) =>
          normalizeText(`${link.label} ${link.url}`).includes(term),
        ),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    for (const productLink of priorityProductLinks) {
      if (assessMatcha(pages).status === "確認済み") break;
      if (visited.has(productLink.url)) continue;
      visited.add(productLink.url);
      try {
        const response = await fetchHtml(productLink.url);
        visited.add(response.url);
        const productPage = parsePage(response.html, response.url);
        pages.push(productPage);
        queue.push(...productPage.links);
      } catch { /* continue with the next prioritized product page */ }
    }
  }

  const firstBusinessLinks = queue
    .filter((link) =>
      businessSignals.some((term) => normalizeText(`${link.label} ${link.url}`).includes(term)),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const pagesBeforeBusiness = pages.length;
  for (const businessLink of firstBusinessLinks) {
    if (pages.length > pagesBeforeBusiness) break;
    if (visited.has(businessLink.url)) continue;
    visited.add(businessLink.url);
    try {
      const response = await fetchHtml(businessLink.url);
      visited.add(response.url);
      const businessPage = parsePage(response.html, response.url);
      pages.push(businessPage);
      queue.push(...businessPage.links);
    } catch { /* continue with product and contact discovery */ }
  }

  while (pages.length < MAX_PAGES_PER_COMPANY && queue.length) {
    const matchaFound = assessMatcha(pages).status === "確認済み";
    const b2bFound = assessBtoB(pages).suitability === "高";
    const contactFound = Boolean(contactUrlFrom(pages));
    if (matchaFound && b2bFound && contactFound) break;
    const purposeScore = (link: PageLink) => {
      const text = normalizeText(`${link.label} ${link.url}`);
      let score = link.score;
      if (!matchaFound && productSignals.some((term) => text.includes(term))) score += 500;
      if (!b2bFound && businessSignals.some((term) => text.includes(term))) score += 500;
      if (!contactFound && contactSignals.some((term) => text.includes(term))) score += 350;
      return score;
    };
    queue.sort((a, b) => purposeScore(b) - purposeScore(a));
    const link = queue.shift();
    if (!link || visited.has(link.url)) continue;
    const hostname = normalizeHostname(new URL(link.url).hostname);
    if (!trustedHosts.has(hostname)) {
      if (!link.allowsExternalStore || excludedHost(hostname)) continue;
      trustedHosts.add(hostname);
    }
    visited.add(link.url);
    try {
      const response = await fetchHtml(link.url);
      if (visited.has(response.url) && response.url !== link.url) continue;
      visited.add(response.url);
      const page = parsePage(response.html, response.url);
      pages.push(page);
      for (const child of page.links) {
        const childHost = normalizeHostname(new URL(child.url).hostname);
        if (trustedHosts.has(childHost) || child.allowsExternalStore) queue.push(child);
      }
    } catch { /* continue with other pages */ }
  }
  return {
    pages,
    retrievalStatus: first.method === "browser" ? "JS描画取得成功" as const : "通常取得成功" as const,
  };
}

function unavailable(
  id: string,
  reason: string,
  retrievalStatus: CompanyEnrichment["retrievalStatus"] = "取得失敗",
): CompanyEnrichment {
  return {
    id, publicEmails: [], suitability: "要確認", suitabilityScore: 0,
    suitabilityReasons: [reason], evidenceUrls: [],
    matchaHandlingStatus: "未確認", matchaHandlingReasons: [reason], matchaEvidenceUrls: [],
    matchaHandlingType: "不明",
    b2bSuitability: "判定不能", b2bReasons: [reason], b2bEvidenceUrls: [], b2bBusinessTypes: [],
    finalAssessment: "要確認", scoreBreakdown: [], enrichmentStatus: "取得失敗", retrievalStatus,
  };
}

export async function enrichCompany(company: CompanyEnrichmentCandidate): Promise<CompanyEnrichment> {
  if (!company.website) return unavailable(company.id, "Google Placesに公式サイトURLが登録されていません");
  try {
    const { pages, retrievalStatus } = await inspectWebsite(company.website);
    const matcha = assessMatcha(pages);
    const b2b = assessBtoB(pages);
    const direct = assessDirectMatchaBtoB(pages);
    const processedOnly = matcha.type === "抹茶使用商品のみ" || matcha.type === "抹茶加工品";
    const clearMatcha = matcha.status === "確認済み" && !processedOnly;
    const matchaContribution = processedOnly ? Math.min(5, matcha.score) : Math.min(30, matcha.score);
    const baseBtoBContribution = b2b.suitability === "高" ? 30 : b2b.suitability === "中" ? 18 : b2b.evidenceLabels.length ? 8 : 0;
    const b2bContribution = processedOnly ? Math.min(5, baseBtoBContribution) : baseBtoBContribution;
    const directContribution = clearMatcha
      ? Math.min(direct.score, 100 - matchaContribution - b2bContribution)
      : 0;
    const combinationEligible = clearMatcha
      && ["抹茶そのもの／茶商品", "抹茶原料", "業務用抹茶"].includes(matcha.type)
      && b2b.evidenceLabels.some((label) => /商社|卸|問屋/.test(label));
    const directlyLinked = direct.labels.some((label) =>
      /業務用抹茶|抹茶卸・問屋|法人向け抹茶|抹茶原料供給/.test(label),
    );
    const combinationContribution = combinationEligible ? (directlyLinked ? 30 : 25) : 0;
    const totalScore = Math.min(100, matchaContribution + b2bContribution + directContribution + combinationContribution);
    let final: FinalAssessment;
    if (processedOnly) final = "低";
    else if (clearMatcha && (directContribution >= 35 || (combinationContribution >= 25 && totalScore >= 65) || (b2b.suitability === "高" && totalScore >= 65))) final = "高";
    else if (clearMatcha && (b2b.suitability === "中" || b2b.suitability === "高")) final = "中";
    else if (clearMatcha || b2b.suitability === "高") final = "要確認";
    else final = "低";
    const matchaReason = `抹茶証拠: ${matcha.reasons.join("、")}`;
    const b2bReason = `BtoB証拠: ${b2b.reasons.join("、")}`;
    const directReason = direct.labels.length
      ? `直接証拠: ${direct.labels.join("、")}`
      : "直接証拠: 抹茶とBtoBを直接結び付ける記載は未確認";
    return {
      id: company.id,
      contactFormUrl: contactUrlFrom(pages),
      publicEmails: emailsFrom(pages),
      suitability: final,
      suitabilityScore: totalScore,
      suitabilityReasons: [matchaReason, b2bReason, directReason],
      evidenceUrls: [...new Set([...matcha.urls, ...b2b.urls, ...direct.urls])],
      matchaHandlingStatus: matcha.status,
      matchaHandlingType: matcha.type,
      matchaHandlingReasons: matcha.reasons,
      matchaEvidenceUrls: matcha.urls,
      b2bSuitability: b2b.suitability,
      b2bReasons: b2b.reasons,
      b2bEvidenceUrls: b2b.urls,
      b2bBusinessTypes: b2b.businessTypes,
      finalAssessment: final,
      scoreBreakdown: [
        ...(matchaContribution
          ? [`抹茶取扱証拠 +${matchaContribution}`]
          : []),
        ...(b2bContribution
          ? [`BtoB証拠（${b2b.evidenceLabels.slice(0, 8).join("、")}） +${b2bContribution}`]
          : []),
        ...(directContribution
          ? [`抹茶×BtoB直接証拠（${direct.labels.join("、")}） +${directContribution}`]
          : []),
        ...(combinationContribution
          ? [`抹茶商品×商社・卸・問屋証拠の組み合わせ +${combinationContribution}`]
          : []),
      ],
      enrichmentStatus: "完了",
      retrievalStatus,
    };
  } catch (error) {
    const retrievalStatus = error instanceof PageFetchError ? error.status : "取得失敗";
    return unavailable(company.id, "公式サイトへアクセスできず、公開情報を確認できませんでした", retrievalStatus);
  }
}

export async function enrichCompanies(companies: CompanyEnrichmentCandidate[], concurrency = 4) {
  const results: CompanyEnrichment[] = [];
  const cached = new Map<string, Promise<CompanyEnrichment>>();
  let nextIndex = 0;
  async function resultFor(company: CompanyEnrichmentCandidate) {
    if (!company.website) return enrichCompany(company);
    const key = company.website.trim().replace(/\/+$/, "").toLowerCase();
    const existing = cached.get(key);
    if (existing) return { ...(await existing), id: company.id };
    const pending = enrichCompany(company);
    cached.set(key, pending);
    return pending;
  }
  async function worker() {
    while (nextIndex < companies.length) {
      const company = companies[nextIndex++];
      results.push(await resultFor(company));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, companies.length) }, worker));
  return results;
}
