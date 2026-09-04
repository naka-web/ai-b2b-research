import "server-only";

import { unzipSync } from "fflate";
import { FDA_TEA_PRODUCT_CODE_RULES, FDA_TEA_SEARCH_TERMS } from "@/services/fdaProductTerms";
import type { FdaCompany, FdaDataType, FdaRecord, FdaSearchResponse } from "@/services/fdaTypes";

const IMPORT_REFUSAL_ZIP_URL =
  "https://www.accessdata.fda.gov/scripts/ImportRefusals/downloads/Import_Refusal_2024-present.zip";
const IMPORT_REFUSAL_REPORT_URL =
  "https://www.accessdata.fda.gov/scripts/ImportRefusals/index.cfm";
const OPENFDA_URL = "https://api.fda.gov/food/enforcement.json";
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_RESULTS_PER_TERM = 100;

const priorityOneCountries = new Set([
  "US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA",
  "AUSTRIA", "BELGIUM", "BULGARIA", "CROATIA", "CYPRUS", "CZECH REPUBLIC", "CZECHIA",
  "DENMARK", "ESTONIA", "FINLAND", "FRANCE", "GERMANY", "GREECE", "HUNGARY", "IRELAND",
  "ITALY", "LATVIA", "LITHUANIA", "LUXEMBOURG", "MALTA", "NETHERLANDS", "POLAND",
  "PORTUGAL", "ROMANIA", "SLOVAKIA", "SLOVENIA", "SPAIN", "SWEDEN",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);
const priorityTwoCountries = new Set([
  "TH", "THAILAND", "KR", "SOUTH KOREA", "KOREA (THE REPUBLIC OF)", "REPUBLIC OF KOREA",
  "TW", "TAIWAN",
]);
const priorityThreeCountries = new Set(["IN", "INDIA", "VN", "VIETNAM", "VIET NAM"]);
const chinaCountries = new Set(["CN", "CHINA", "PEOPLE'S REPUBLIC OF CHINA", "CHINA (MAINLAND)"]);

type FdaSearchOptions = {
  excludeChina?: boolean;
  priority?: "all" | "1" | "2" | "3";
  dataTypes?: FdaDataType[];
};

type OpenFdaFoodEnforcement = {
  event_id?: string;
  recall_number?: string;
  recalling_firm?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  country?: string;
  product_description?: string;
  product_code?: string;
  reason_for_recall?: string;
  report_date?: string;
  distribution_pattern?: string;
  classification?: string;
  status?: string;
};

let refusalCache: { expiresAt: number; records: FdaRecord[] } | undefined;

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function hitDetails(...values: Array<[string, string | undefined]>) {
  const terms = new Set<string>();
  const reasons = new Set<string>();
  for (const [field, rawValue] of values) {
    const value = rawValue ?? "";
    const normalized = value.toLowerCase();
    for (const term of FDA_TEA_SEARCH_TERMS) {
      if (!normalized.includes(term.toLowerCase())) continue;
      terms.add(term);
      const excerpt = value.replace(/\s+/g, " ").slice(0, 180);
      reasons.add(`${field} に "${term}" を確認: ${excerpt}`);
    }
  }
  return { hitTerms: [...terms], hitReasons: [...reasons] };
}

function productCodeHit(productCode: string | undefined) {
  const normalized = (productCode ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const rule = FDA_TEA_PRODUCT_CODE_RULES.find((candidate) => candidate.pattern.test(normalized));
  return rule && normalized ? { matchedProductCode: normalized, description: rule.description } : undefined;
}

function fullAddress(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

async function fetchOfficial(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-B2B-Research/1.0 (FDA public-data research)" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`FDA request failed: HTTP ${response.status} (${url})`);
  return response;
}

async function importRefusalRecords() {
  if (refusalCache && refusalCache.expiresAt > Date.now()) return refusalCache.records;
  const archive = unzipSync(new Uint8Array(await (await fetchOfficial(IMPORT_REFUSAL_ZIP_URL)).arrayBuffer()));
  const chargesFile = Object.entries(archive).find(([name]) => /ACT_SECTION_CHARGES\.csv$/i.test(name));
  const entriesFile = Object.entries(archive).find(([name]) => /REFUSAL_ENTRY.*\.csv$/i.test(name));
  if (!entriesFile) throw new Error("FDA Import Refusal CSV was not found in the official archive.");
  const decoder = new TextDecoder("utf-8");
  const chargeRows = chargesFile ? parseCsv(decoder.decode(chargesFile[1])) : [];
  const chargeMap = new Map(chargeRows.map((row) => [row.ASC_ID, row.CHRG_STMNT_TEXT || row.SCTN_NAME]));
  const records = parseCsv(decoder.decode(entriesFile[1])).flatMap((row): FdaRecord[] => {
    const hits = hitDetails(["PRDCT_CODE_DESC_TEXT", row.PRDCT_CODE_DESC_TEXT]);
    const codeHit = productCodeHit(row.PRODUCT_CODE);
    if (!hits.hitTerms.length && !codeHit) return [];
    const hitMethod = hits.hitTerms.length
      ? (codeHit ? "keyword+product_code" : "keyword")
      : "product_code";
    const hitReasons = [...hits.hitReasons];
    if (codeHit) {
      hitReasons.push(`PRODUCT_CODE ${codeHit.matchedProductCode} が ${codeHit.description} に一致（茶関連FDA候補。抹茶の確定ではありません）`);
    }
    const charge = row.REFUSAL_CHARGES.split(/\s*,\s*/).map((id) => chargeMap.get(id) || id).filter(Boolean).join(" / ");
    const identifier = [row.ENTRY_NUM, row.RFRNC_DOC_ID, row.LINE_NUM, row.LINE_SFX_ID].filter(Boolean).join("/");
    const evidenceUrl = new URL(IMPORT_REFUSAL_REPORT_URL);
    evidenceUrl.searchParams.set("DocId", row.RFRNC_DOC_ID);
    evidenceUrl.searchParams.set("EntryId", row.ENTRY_NUM);
    evidenceUrl.searchParams.set("LineId", row.LINE_NUM);
    evidenceUrl.searchParams.set("action", "facades.detail");
    return [{
      id: `refusal:${identifier || row.MFG_FIRM_FEI_NUM}:${row.REFUSAL_DATE}`,
      dataType: "Import Refusal",
      companyName: row.LGL_NAME || "Unknown manufacturer",
      fei: row.MFG_FIRM_FEI_NUM || undefined,
      address: fullAddress([row.LINE1_ADRS, row.LINE2_ADRS, row.CITY_NAME, row.PROVINCE_STATE, row.ISO_CNTRY_CODE]),
      city: row.CITY_NAME || undefined,
      state: row.PROVINCE_STATE || undefined,
      country: row.ISO_CNTRY_CODE || "Unknown",
      countryBasis: "manufacturer/origin",
      productCode: row.PRODUCT_CODE || undefined,
      matchedProductCode: codeHit?.matchedProductCode,
      productCodeDescription: row.PRDCT_CODE_DESC_TEXT || codeHit?.description,
      productDescription: row.PRDCT_CODE_DESC_TEXT || "No description",
      event: charge || "Import refused by FDA",
      date: row.REFUSAL_DATE || undefined,
      evidenceUrl: evidenceUrl.toString(),
      identifier: identifier || row.MFG_FIRM_FEI_NUM || undefined,
      hitTerms: hits.hitTerms,
      hitReasons,
      hitMethod,
    }];
  });
  refusalCache = { records, expiresAt: Date.now() + CACHE_MS };
  return records;
}

function escapeOpenFdaTerm(term: string) {
  return `"${term.replaceAll('"', "")}"`;
}

async function foodRecallRecords() {
  const apiKey = process.env.OPENFDA_API_KEY?.trim();
  const responses = await Promise.all(FDA_TEA_SEARCH_TERMS.map(async (term) => {
    const url = new URL(OPENFDA_URL);
    if (apiKey) url.searchParams.set("api_key", apiKey);
    url.searchParams.set("search", `product_description:${escapeOpenFdaTerm(term)}`);
    url.searchParams.set("limit", String(MAX_RESULTS_PER_TERM));
    try {
      const response = await fetchOfficial(url.toString());
      const payload = await response.json() as { results?: OpenFdaFoodEnforcement[] };
      return payload.results ?? [];
    } catch (error) {
      if (error instanceof Error && error.message.includes("HTTP 404")) return [];
      throw error;
    }
  }));
  const records = new Map<string, FdaRecord>();
  for (const result of responses.flat()) {
    const hits = hitDetails(["product_description", result.product_description], ["product_code", result.product_code]);
    if (!hits.hitTerms.length) continue;
    const identifier = result.recall_number || result.event_id;
    const id = `recall:${identifier || `${result.recalling_firm}:${result.report_date}`}`;
    const existing = records.get(id);
    if (existing) {
      existing.hitTerms = [...new Set([...existing.hitTerms, ...hits.hitTerms])];
      existing.hitReasons = [...new Set([...existing.hitReasons, ...hits.hitReasons])];
      continue;
    }
    records.set(id, {
      id,
      dataType: "Food Recall",
      companyName: result.recalling_firm || "Unknown recalling firm",
      address: fullAddress([result.address_1, result.address_2, result.city, result.state, result.country]),
      city: result.city,
      state: result.state,
      country: result.country || "Unknown",
      countryBasis: "recalling firm",
      productCode: result.product_code,
      productDescription: result.product_description || "No description",
      event: [result.classification, result.status, result.reason_for_recall].filter(Boolean).join(" / "),
      date: result.report_date,
      evidenceUrl: `${OPENFDA_URL}?search=recall_number:${encodeURIComponent(`"${result.recall_number || ""}"`)}`,
      identifier,
      distributionPattern: result.distribution_pattern,
      hitTerms: hits.hitTerms,
      hitReasons: hits.hitReasons,
    });
  }
  return [...records.values()];
}

function normalizeCompanyName(value: string) {
  return value.toLowerCase().normalize("NFKC")
    .replace(/\b(?:incorporated|inc|limited|ltd|llc|corp(?:oration)?|company|co)\b\.?/g, "")
    .replace(/[^a-z0-9\p{L}]+/gu, " ").trim();
}

function countryPriority(country: string): 1 | 2 | 3 | null {
  const value = country.trim().toUpperCase();
  if (priorityOneCountries.has(value)) return 1;
  if (priorityTwoCountries.has(value)) return 2;
  if (priorityThreeCountries.has(value)) return 3;
  return null;
}

function aggregateCompanies(records: FdaRecord[]) {
  const companies = new Map<string, FdaCompany>();
  for (const record of records) {
    const key = record.fei
      ? `fei:${record.fei}`
      : `company:${normalizeCompanyName(record.companyName)}:${record.country.toUpperCase()}:${record.address.toLowerCase()}`;
    const company = companies.get(key);
    if (company) {
      company.records.push(record);
      company.identifiers = [...new Set([...company.identifiers, record.fei, record.identifier].filter(Boolean) as string[])];
      company.hitTerms = [...new Set([...company.hitTerms, ...record.hitTerms])];
      company.hitReasons = [...new Set([...company.hitReasons, ...record.hitReasons])];
    } else {
      companies.set(key, {
        id: key,
        name: record.companyName,
        country: record.country,
        countryBasis: record.countryBasis,
        address: record.address,
        priority: countryPriority(record.country),
        identifiers: [record.fei, record.identifier].filter(Boolean) as string[],
        hitTerms: record.hitTerms,
        hitReasons: record.hitReasons,
        records: [record],
      });
    }
  }
  return [...companies.values()].sort((a, b) =>
    (a.priority ?? 9) - (b.priority ?? 9) || a.name.localeCompare(b.name),
  );
}

export async function searchFdaCompanies(options: FdaSearchOptions = {}): Promise<FdaSearchResponse> {
  const dataTypes = new Set(options.dataTypes?.length ? options.dataTypes : ["Import Refusal", "Food Recall"]);
  const warnings: string[] = [];
  const records: FdaRecord[] = [];
  const load = async (type: FdaDataType, loader: () => Promise<FdaRecord[]>) => {
    if (!dataTypes.has(type)) return;
    try {
      records.push(...await loader());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FDA ${type}] ${message}`);
      warnings.push(`${type} の取得に失敗しました。`);
    }
  };
  await Promise.all([load("Import Refusal", importRefusalRecords), load("Food Recall", foodRecallRecords)]);
  const filtered = records.filter((record) => {
    const country = record.country.trim().toUpperCase();
    if (options.excludeChina !== false && chinaCountries.has(country)) return false;
    const priority = countryPriority(record.country);
    return !options.priority || options.priority === "all" || priority === Number(options.priority);
  });
  return {
    companies: aggregateCompanies(filtered),
    recordCount: filtered.length,
    sourceCounts: {
      "Import Refusal": filtered.filter((record) => record.dataType === "Import Refusal").length,
      "Food Recall": filtered.filter((record) => record.dataType === "Food Recall").length,
    },
    importRefusalMatchCounts: {
      keyword: filtered.filter((record) => record.dataType === "Import Refusal" && record.hitMethod === "keyword").length,
      product_code: filtered.filter((record) => record.dataType === "Import Refusal" && record.hitMethod === "product_code").length,
      "keyword+product_code": filtered.filter((record) => record.dataType === "Import Refusal" && record.hitMethod === "keyword+product_code").length,
    },
    warnings,
  };
}
