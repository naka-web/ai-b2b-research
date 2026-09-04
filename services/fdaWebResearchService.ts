import "server-only";

import { inspectWebsiteForFdaMatcha } from "@/services/companyEnrichmentService";
import type { FdaCompany, FdaWebResearchResult } from "@/services/fdaTypes";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const WEB_SEARCH_URL = "https://html.duckduckgo.com/html/";
const MAX_COMPANIES = 50;
const companyResearchCache = new Map<string, Promise<FdaWebResearchResult>>();
const websiteMatchaCache = new Map<string, ReturnType<typeof inspectWebsiteForFdaMatcha>>();
const excludedHosts = [
  "amazon.", "facebook.com", "instagram.com", "linkedin.com", "rakuten.",
  "tiktok.com", "wikipedia.org", "x.com", "yelp.", "youtube.com", "bloomberg.com",
  "crunchbase.com", "dnb.com", "zoominfo.com", "pitchbook.com", "companieshouse.gov.uk",
  "reuters.com", "forbes.com", "marketscreener.com", "glassdoor.", "indeed.com",
  "hungryfoody.com",
];

type Place = {
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFKC")
    .replace(/\b(?:incorporated|inc|limited|ltd|llc|corp(?:oration)?|company|co|sarl|gmbh|plc)\b\.?/g, "")
    .replace(/[^a-z0-9\p{L}]+/gu, " ").trim();
}

function nameSimilarity(expected: string, actual: string) {
  const left = normalizeName(expected);
  const right = normalizeName(actual);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 1));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size, 1);
}

function acceptableWebsite(value: string | undefined) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return !excludedHosts.some((excluded) => host.includes(excluded));
  } catch {
    return false;
  }
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function domainSimilarity(companyName: string, url: string) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "").split(".")[0];
  const tokens = normalizeName(companyName).split(" ").filter((token) => token.length >= 3);
  return tokens.some((token) => host.includes(token) || token.includes(host)) ? 1 : 0;
}

async function webSearch(query: string) {
  const url = new URL(WEB_SEARCH_URL);
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-B2B-Research/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Web search failed: HTTP ${response.status}`);
  const html = await response.text();
  const results: Array<{ url: string; title: string }> = [];
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const redirect = decodeHtml(match[1]);
    const parsed = new URL(redirect, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg") || parsed.toString();
    if (!acceptableWebsite(target)) continue;
    results.push({ url: target, title: decodeHtml(match[2]) });
    if (results.length >= 6) break;
  }
  return results;
}

async function verifyWebCandidate(company: FdaCompany, candidate: { url: string; title: string }) {
  try {
    const response = await fetch(candidate.url, {
      headers: { Accept: "text/html", "User-Agent": "AI-B2B-Research/1.0 (official website verification)" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return undefined;
    const finalUrl = response.url;
    if (!acceptableWebsite(finalUrl)) return undefined;
    const text = decodeHtml((await response.text()).slice(0, 750_000)).toLowerCase().normalize("NFKC");
    const nameScore = nameSimilarity(company.name, candidate.title);
    const domainScore = domainSimilarity(company.name, finalUrl);
    const companyTokens = normalizeName(company.name).split(" ").filter((token) => token.length >= 3);
    const bodyMatches = companyTokens.filter((token) => text.includes(token)).length / Math.max(companyTokens.length, 1);
    const city = company.records.find((record) => record.city)?.city?.toLowerCase();
    const locationMatch = Boolean(city && text.includes(city));
    const corporateContext = /copyright|about us|company profile|corporate|our company|legal notice/.test(text);
    const score = nameScore * 0.35 + domainScore * 0.25 + bodyMatches * 0.25 + (locationMatch ? 0.1 : 0) + (corporateContext ? 0.05 : 0);
    const thirdPartyListingPath = /\/(?:brands?|collections?|merchants?|vendors?|reviews?)\//i.test(new URL(finalUrl).pathname);
    const eligible = Boolean(domainScore || (corporateContext && !thirdPartyListingPath));
    return { url: finalUrl, score, nameScore, domainScore, bodyMatches, locationMatch, corporateContext, eligible };
  } catch {
    return undefined;
  }
}

async function locateWebsiteByWebSearch(company: FdaCompany) {
  const countryName = company.country;
  const queries = [
    `"${company.name}" ${countryName} official website`,
    `${normalizeName(company.name)} ${countryName} official`,
  ];
  const candidates = new Map<string, { url: string; title: string }>();
  for (const query of queries) {
    for (const candidate of await webSearch(query)) {
      const host = new URL(candidate.url).hostname.replace(/^www\./, "");
      if (!candidates.has(host)) candidates.set(host, candidate);
    }
    if (candidates.size >= 4) break;
  }
  const verified = (await Promise.all([...candidates.values()].slice(0, 4).map((candidate) => verifyWebCandidate(company, candidate))))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.score - a.score);
  const best = verified[0];
  if (!best || best.score < 0.55) {
    return { confidence: "low" as const, reason: "Web検索候補はありましたが、企業名・ドメイン・会社情報の一致根拠が不足" };
  }
  const confidence = best.score >= 0.78 ? "high" as const : "medium" as const;
  return {
    website: best.url,
    confidence,
    method: "web_search" as const,
    reason: `Web検索後に企業名${Math.round(best.nameScore * 100)}%・ドメイン${best.domainScore ? "一致" : "不一致"}・本文${Math.round(best.bodyMatches * 100)}%${best.locationMatch ? "・所在地一致" : ""}${best.corporateContext ? "・会社情報あり" : ""}を確認`,
  };
}

async function locateOfficialWebsite(company: FdaCompany) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return { reason: "Google Places APIキーが未設定のため公式サイト未確認" };
  const response = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: [company.name, company.address, company.country].filter(Boolean).join(" "),
      languageCode: "en",
      pageSize: 5,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google Places website lookup failed: HTTP ${response.status}`);
  const payload = await response.json() as { places?: Place[] };
  const ranked = (payload.places ?? [])
    .filter((place) => acceptableWebsite(place.websiteUri))
    .map((place) => ({ place, similarity: nameSimilarity(company.name, place.displayName?.text ?? "") }))
    .sort((a, b) => b.similarity - a.similarity);
  const best = ranked[0];
  if (!best || best.similarity < 0.6) return { reason: "企業名・所在地に十分一致する公式サイト候補を確認できませんでした" };
  const city = company.records.find((record) => record.city)?.city;
  const locationMatches = Boolean(city && best.place.formattedAddress?.toLowerCase().includes(city.toLowerCase()));
  const confidence = best.similarity >= 0.9 && locationMatches ? "high" : "medium";
  return {
    website: best.place.websiteUri,
    confidence: confidence as "high" | "medium",
    method: "google_places" as const,
    reason: `Google Placesの企業名一致度${Math.round(best.similarity * 100)}%${locationMatches ? "、所在地一致" : ""}。登録Webサイトを公式候補として採用`,
  };
}

async function researchCompany(company: FdaCompany): Promise<FdaWebResearchResult> {
  try {
    const placesResult = await locateOfficialWebsite(company);
    const official = placesResult.website ? placesResult : await locateWebsiteByWebSearch(company);
    if (!official.website) {
      return { id: company.id, officialWebsiteConfidence: official.confidence, officialWebsiteReason: official.reason, matchaStatus: "unconfirmed", matchaEvidence: "公式サイト未確認" };
    }
    try {
      const websiteKey = official.website.trim().replace(/\/+$/, "").toLowerCase();
      let matchaPromise = websiteMatchaCache.get(websiteKey);
      if (!matchaPromise) {
        matchaPromise = inspectWebsiteForFdaMatcha(official.website);
        websiteMatchaCache.set(websiteKey, matchaPromise);
      }
      const matcha = await matchaPromise;
      return {
        id: company.id,
        officialWebsite: official.website,
        officialWebsiteConfidence: official.confidence,
        officialWebsiteMethod: official.method,
        officialWebsiteReason: official.reason,
        matchaStatus: matcha.status,
        matchaEvidence: matcha.evidence,
        matchaEvidenceUrl: matcha.evidenceUrl,
      };
    } catch {
      return {
        id: company.id,
        officialWebsite: official.website,
        officialWebsiteConfidence: official.confidence,
        officialWebsiteMethod: official.method,
        officialWebsiteReason: official.reason,
        matchaStatus: "unconfirmed",
        matchaEvidence: "公式サイトへアクセスできず、茶・抹茶取扱を確認できませんでした。",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FDA web research] ${company.name}: ${message}`);
    return { id: company.id, officialWebsiteReason: "公式サイト検索に失敗しました", matchaStatus: "unconfirmed", matchaEvidence: "Web調査失敗" };
  }
}

export async function researchFdaCompanies(companies: FdaCompany[]) {
  if (companies.length > MAX_COMPANIES) throw new Error(`1回に調査できる企業は${MAX_COMPANIES}社までです。`);
  const results: FdaWebResearchResult[] = [];
  let next = 0;
  async function cachedResult(company: FdaCompany) {
    const fei = company.records.find((record) => record.fei)?.fei;
    const identityKey = `identity:${normalizeName(company.name)}:${company.country.toLowerCase()}`;
    const locationKey = `${identityKey}:${company.address.toLowerCase()}`;
    const feiKey = fei ? `fei:${fei}` : undefined;
    let pending = (feiKey ? companyResearchCache.get(feiKey) : undefined)
      || companyResearchCache.get(locationKey)
      || companyResearchCache.get(identityKey);
    if (!pending) {
      pending = researchCompany(company);
    }
    if (feiKey) companyResearchCache.set(feiKey, pending);
    companyResearchCache.set(locationKey, pending);
    companyResearchCache.set(identityKey, pending);
    return { ...(await pending), id: company.id };
  }
  async function worker() {
    while (next < companies.length) results.push(await cachedResult(companies[next++]));
  }
  await Promise.all(Array.from({ length: Math.min(3, companies.length) }, worker));
  return results;
}
