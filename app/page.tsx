"use client";

import { FormEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  createPendingEnrichment,
  type Company,
  type CompanyEnrichment,
  type FinalAssessment,
} from "@/services/companyResearchTypes";
import type { FdaCompany, FdaSearchResponse } from "@/services/fdaTypes";

const industries = [
  "歯科",
  "SaaS",
  "製造業",
  "人材",
  "物流",
  "金融",
  "小売",
  "ヘルスケア",
];

const regions = [
  "札幌",
  "東京",
  "福岡",
];

const searchSets = {
  matchaDomesticTrading: {
    label: "抹茶を扱う国内商社",
    keywords: [
      "抹茶 商社",
      "抹茶 卸売",
      "抹茶 業務用",
      "抹茶 原料 卸",
      "抹茶 法人向け",
    ],
  },
} as const;

type SearchSetKey = "" | keyof typeof searchSets;

type PlacesPayload = {
  companies: Array<
    Omit<
      Company,
      | "hitKeywords"
      | "publicEmails"
      | "suitability"
      | "suitabilityScore"
      | "suitabilityReasons"
      | "evidenceUrls"
      | "enrichmentStatus"
      | "retrievalStatus"
      | "matchaHandlingStatus"
      | "matchaHandlingType"
      | "matchaHandlingReasons"
      | "matchaEvidenceUrls"
      | "b2bSuitability"
      | "b2bReasons"
      | "b2bEvidenceUrls"
      | "b2bBusinessTypes"
      | "finalAssessment"
      | "scoreBreakdown"
    >
  >;
  query: string;
  regionScope: string;
  nextPageToken: string | null;
  hasNextPage: boolean;
};

type SearchValues = {
  keyword: string;
  region: string;
  industry: string;
};

type ActiveSearch = {
  searchValues: SearchValues;
  nextPageToken: string | null;
};

type SalesProposal = {
  assumedChallenges: string;
  salesAngle: string;
  firstProposal: string;
  callTalkExample: string;
};

type SalesEmail = {
  subject: string;
  body: string;
};

type ExportCompanyRow = {
  会社名: string;
  住所: string;
  電話番号: string;
  "公式サイトURL": string;
  "問い合わせフォームURL": string;
  "公開メールアドレス": string;
  適合度: string;
  判定スコア: number;
  判定理由: string;
  "判定根拠URL": string;
  "抹茶取扱状況": string;
  "抹茶取扱種別": string;
  "抹茶取扱理由": string;
  "抹茶取扱根拠URL": string;
  "BtoB適合度": string;
  "BtoB取引種別": string;
  "BtoB判定理由": string;
  "BtoB根拠URL": string;
  "最終判定": string;
  "Google Maps URL": string;
  "ヒットした検索ワード": string;
};

export default function Home() {
  const [searchSource, setSearchSource] = useState<"google" | "fda">("google");
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("");
  const [industry, setIndustry] = useState("");
  const [searchSetKey, setSearchSetKey] = useState<SearchSetKey>("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [regionScope, setRegionScope] = useState("");
  const [activeSearches, setActiveSearches] = useState<ActiveSearch[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [isGeneratingSalesEmail, setIsGeneratingSalesEmail] = useState(false);
  const [salesEmail, setSalesEmail] = useState<SalesEmail | null>(null);
  const [salesEmailError, setSalesEmailError] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState("");
  const [suitabilityFilter, setSuitabilityFilter] = useState<"すべて" | FinalAssessment>(
    "すべて",
  );
  const [sortBySuitability, setSortBySuitability] = useState(true);
  const [fdaCompanies, setFdaCompanies] = useState<FdaCompany[]>([]);
  const [selectedFdaCompanyIds, setSelectedFdaCompanyIds] = useState<string[]>([]);
  const [fdaPriority, setFdaPriority] = useState<"all" | "1" | "2" | "3">("all");
  const [excludeChina, setExcludeChina] = useState(true);
  const [fdaRecordCount, setFdaRecordCount] = useState(0);
  const [isResearchingFda, setIsResearchingFda] = useState(false);
  const [fdaResearchScope, setFdaResearchScope] = useState<"test" | "all">("test");
  const [fdaResearchDataType, setFdaResearchDataType] = useState<"Import Refusal" | "Food Recall">("Import Refusal");
  const [fdaSourceCounts, setFdaSourceCounts] = useState<FdaSearchResponse["sourceCounts"]>({
    "Import Refusal": 0,
    "Food Recall": 0,
  });
  const [importRefusalMatchCounts, setImportRefusalMatchCounts] = useState<FdaSearchResponse["importRefusalMatchCounts"]>({
    keyword: 0,
    product_code: 0,
    "keyword+product_code": 0,
  });

  const searchSummary = useMemo(() => {
    if (searchSource === "fda") return "FDA公開記録の茶関連企業候補";
    return [
      searchSetKey ? searchSets[searchSetKey].label : keyword.trim() || "企業",
      industry || "指定なし",
      region || "地域未選択",
    ]
      .filter(Boolean)
      .join(" / ");
  }, [industry, keyword, region, searchSetKey, searchSource]);

  const selectedCompanyCount = useMemo(() => {
    const visibleCompanyIds = new Set(companies.map((company) => company.id));

    return selectedCompanyIds.filter((companyId) =>
      visibleCompanyIds.has(companyId),
    ).length;
  }, [companies, selectedCompanyIds]);

  const selectedCompanies = useMemo(() => {
    const selectedIds = new Set(selectedCompanyIds);

    return companies.filter((company) => selectedIds.has(company.id));
  }, [companies, selectedCompanyIds]);
  const selectedFdaCompanies = useMemo(() => {
    const selectedIds = new Set(selectedFdaCompanyIds);
    return fdaCompanies.filter((company) => selectedIds.has(company.id));
  }, [fdaCompanies, selectedFdaCompanyIds]);
  const fdaWebSummary = useMemo(() => {
    const researched = fdaCompanies.filter((company) => company.matchaStatus);
    return {
      total: researched.length,
      websites: researched.filter((company) => company.officialWebsite).length,
      confirmed: researched.filter((company) => company.matchaStatus === "confirmed").length,
      greenTeaOnly: researched.filter((company) => company.matchaStatus === "green_tea_only").length,
      processedOnly: researched.filter((company) => company.matchaStatus === "processed_matcha_product_only").length,
      unconfirmed: researched.filter((company) => company.matchaStatus === "unconfirmed").length,
    };
  }, [fdaCompanies]);

  const visibleCompanies = useMemo(() => {
    const levelOrder: Record<FinalAssessment, number> = {
      高: 3,
      中: 2,
      要確認: 1,
      低: 0,
    };
    const filtered =
      suitabilityFilter === "すべて"
        ? companies
        : companies.filter((company) => company.suitability === suitabilityFilter);

    if (!sortBySuitability) return filtered;
    return [...filtered].sort(
      (first, second) =>
        levelOrder[second.suitability] - levelOrder[first.suitability] ||
        second.suitabilityScore - first.suitabilityScore,
    );
  }, [companies, sortBySuitability, suitabilityFilter]);

  async function fetchPlaces(searchValues: SearchValues, pageToken?: string) {
    const params = new URLSearchParams(searchValues);

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(`/api/places?${params.toString()}`);
    const payload = (await response.json()) as Partial<PlacesPayload> & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "企業データの取得に失敗しました。");
    }

    return payload as PlacesPayload;
  }

  function addPendingEnrichment(
    company: PlacesPayload["companies"][number],
    hitKeyword: string,
  ): Company {
    return {
      ...company,
      ...createPendingEnrichment(),
      hitKeywords: [hitKeyword],
    };
  }

  async function enrichCompanyResults(targetCompanies: Company[]) {
    if (targetCompanies.length === 0) return;

    const batchSize = 8;
    const targetIds = new Set(targetCompanies.map((company) => company.id));
    setIsEnriching(true);
    setEnrichmentError("");
    setCompanies((currentCompanies) =>
      currentCompanies.map((company) =>
        targetIds.has(company.id)
          ? { ...company, enrichmentStatus: "調査中" }
          : company,
      ),
    );

    const failedIds = new Set<string>();
    const errors: string[] = [];

    for (let start = 0; start < targetCompanies.length; start += batchSize) {
      const batch = targetCompanies.slice(start, start + batchSize);
      try {
        const response = await fetch("/api/company-enrichment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companies: batch.map((company) => ({
              id: company.id,
              name: company.name,
              website: company.website,
              primaryCategory: company.primaryCategory,
              categories: company.categories,
            })),
          }),
        });
        const payload = (await response.json()) as {
          results?: CompanyEnrichment[];
          error?: string;
        };

        if (!response.ok || !payload.results) {
          throw new Error(payload.error || "公式サイトの調査に失敗しました。");
        }

        const resultsById = new Map(payload.results.map((result) => [result.id, result]));
        const mergeResult = (company: Company) => {
          const result = resultsById.get(company.id);
          return result ? { ...company, ...result } : company;
        };
        setCompanies((currentCompanies) => currentCompanies.map(mergeResult));
        setSelectedCompany((currentCompany) =>
          currentCompany ? mergeResult(currentCompany) : null,
        );
      } catch (caught) {
        batch.forEach((company) => failedIds.add(company.id));
        errors.push(
          caught instanceof Error ? caught.message : "公式サイトの調査に失敗しました。",
        );
      }
    }

    if (failedIds.size > 0) {
      setCompanies((currentCompanies) =>
        currentCompanies.map((company) =>
          failedIds.has(company.id)
            ? {
                ...company,
                enrichmentStatus: "取得失敗",
                retrievalStatus: "取得失敗",
                suitability: "要確認",
                suitabilityScore: 0,
                suitabilityReasons: [
                  "補完APIに接続できず、公式サイトを確認できませんでした",
                ],
                matchaHandlingStatus: "未確認",
                matchaHandlingType: "不明",
                matchaHandlingReasons: ["補完APIに接続できませんでした"],
                matchaEvidenceUrls: [],
                b2bSuitability: "判定不能",
                b2bReasons: ["補完APIに接続できませんでした"],
                b2bEvidenceUrls: [],
                b2bBusinessTypes: [],
                finalAssessment: "要確認",
                scoreBreakdown: [],
              }
            : company,
        ),
      );
      setEnrichmentError([...new Set(errors)].join(" / "));
    }
    setIsEnriching(false);
  }

  function mergeCompanies(
    currentCompanies: Company[],
    incomingCompanies: Company[],
  ) {
    const mergedCompanies = [...currentCompanies];

    incomingCompanies.forEach((company) => {
      const existingIndex = mergedCompanies.findIndex((currentCompany) =>
        isSameCompany(currentCompany, company),
      );

      if (existingIndex === -1) {
        mergedCompanies.push(company);
        return;
      }

      const existingCompany = mergedCompanies[existingIndex];
      mergedCompanies[existingIndex] = {
        ...company,
        ...existingCompany,
        hitKeywords: Array.from(
          new Set([
            ...existingCompany.hitKeywords,
            ...company.hitKeywords,
          ]),
        ),
      };
    });

    return mergedCompanies;
  }

  function normalizeDedupValue(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeUrl(value: string) {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }

  function normalizePhone(value: string) {
    return value.replace(/\D/g, "");
  }

  function isSameCompany(first: Company, second: Company) {
    if (first.placeId && second.placeId) {
      return first.placeId === second.placeId;
    }

    const sameAddress =
      normalizeDedupValue(first.address) === normalizeDedupValue(second.address);

    if (!sameAddress) {
      return false;
    }

    const sameWebsite = Boolean(
      first.website &&
        second.website &&
        normalizeUrl(first.website) === normalizeUrl(second.website),
    );
    const samePhone = Boolean(
      first.phone &&
        second.phone &&
        normalizePhone(first.phone) === normalizePhone(second.phone),
    );
    const sameName =
      normalizeDedupValue(first.name) === normalizeDedupValue(second.name);

    return sameWebsite || samePhone || sameName;
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setSearched(true);
    setHasNextPage(false);
    setResolvedQuery("");
    setRegionScope("");
    setSelectedCompany(null);
    setSelectedCompanyIds([]);
    setEnrichmentError("");
    resetSalesEmail();

    if (searchSource === "fda") {
      setCompanies([]);
      setSelectedCompany(null);
      setSelectedFdaCompanyIds([]);
      try {
        const params = new URLSearchParams({
          priority: fdaPriority,
          excludeChina: String(excludeChina),
        });
        const response = await fetch(`/api/fda?${params.toString()}`);
        const payload = await response.json() as Partial<FdaSearchResponse> & { error?: string };
        if (!response.ok || !payload.companies) {
          throw new Error(payload.error || "FDA公開情報の取得に失敗しました。");
        }
        setFdaCompanies(payload.companies);
        setFdaRecordCount(payload.recordCount ?? 0);
        setFdaSourceCounts(payload.sourceCounts ?? { "Import Refusal": 0, "Food Recall": 0 });
        setImportRefusalMatchCounts(payload.importRefusalMatchCounts ?? { keyword: 0, product_code: 0, "keyword+product_code": 0 });
        setResolvedQuery("FDA茶関連候補（Import Refusal / Food Recall）");
        setRegionScope(fdaPriority === "all" ? "全対象国" : `優先度${fdaPriority}`);
        if (payload.warnings?.length) setError(payload.warnings.join(" / "));
      } catch (caught) {
        setFdaCompanies([]);
        setFdaRecordCount(0);
        setError(caught instanceof Error ? caught.message : "FDA公開情報の取得に失敗しました。");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setFdaCompanies([]);

    const formData = new FormData(event.currentTarget);
    const searchValues = {
      keyword: String(formData.get("keyword") || ""),
      region: String(formData.get("region") || ""),
      industry: String(formData.get("industry") || ""),
    };
    const selectedSearchSetKey = String(
      formData.get("searchSet") || "",
    ) as SearchSetKey;
    setKeyword(searchValues.keyword);
    setRegion(searchValues.region);
    setIndustry(searchValues.industry);
    setSearchSetKey(selectedSearchSetKey);

    if (!searchValues.region) {
      setCompanies([]);
      setHasNextPage(false);
      setActiveSearches([]);
      setError("地域を選択してください");
      setIsLoading(false);
      return;
    }

    try {
      const searchKeywords = selectedSearchSetKey
        ? [...searchSets[selectedSearchSetKey].keywords]
        : [searchValues.keyword];
      let mergedCompanies: Company[] = [];
      const completedSearches: ActiveSearch[] = [];
      const resolvedQueries: string[] = [];
      let resolvedRegionScope = "";

      for (const searchKeyword of searchKeywords) {
        const currentSearchValues = {
          ...searchValues,
          keyword: searchKeyword,
        };
        const payload = await fetchPlaces(currentSearchValues);
        const companiesWithHitKeyword = payload.companies.map((company) =>
          addPendingEnrichment(company, searchKeyword.trim() || "企業"),
        );

        mergedCompanies = mergeCompanies(
          mergedCompanies,
          companiesWithHitKeyword,
        );
        completedSearches.push({
          searchValues: currentSearchValues,
          nextPageToken: payload.nextPageToken,
        });
        resolvedQueries.push(payload.query);
        resolvedRegionScope = payload.regionScope;
      }

      setActiveSearches(completedSearches);
      setCompanies(mergedCompanies);
      setHasNextPage(
        completedSearches.some((search) => Boolean(search.nextPageToken)),
      );
      setResolvedQuery(resolvedQueries.join(" / "));
      setRegionScope(resolvedRegionScope);
      setIsLoading(false);
      await enrichCompanyResults(mergedCompanies);
    } catch (caught) {
      setCompanies([]);
      setHasNextPage(false);
      setActiveSearches([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "企業データの取得に失敗しました。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadMore() {
    const searchesWithNextPage = activeSearches.filter(
      (search) => search.nextPageToken,
    );

    if (searchesWithNextPage.length === 0) {
      return;
    }

    setIsLoadingMore(true);
    setError("");

    try {
      let additionalCompanies: Company[] = [];
      const updatedSearches = [...activeSearches];

      for (const activeSearch of searchesWithNextPage) {
        const payload = await fetchPlaces(
          activeSearch.searchValues,
          activeSearch.nextPageToken || undefined,
        );
        const hitKeyword = activeSearch.searchValues.keyword.trim() || "企業";

        const mappedCompanies = payload.companies.map((company) =>
          addPendingEnrichment(company, hitKeyword),
        );
        additionalCompanies = mergeCompanies(
          additionalCompanies,
          mappedCompanies,
        );
        const searchIndex = updatedSearches.indexOf(activeSearch);
        updatedSearches[searchIndex] = {
          ...activeSearch,
          nextPageToken: payload.nextPageToken,
        };
      }

      const newCompanies = additionalCompanies.filter(
        (company) =>
          !companies.some((currentCompany) => isSameCompany(currentCompany, company)),
      );
      setCompanies((currentCompanies) => mergeCompanies(currentCompanies, additionalCompanies));
      setActiveSearches(updatedSearches);
      setHasNextPage(
        updatedSearches.some((search) => Boolean(search.nextPageToken)),
      );
      await enrichCompanyResults(newCompanies);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "追加データの取得に失敗しました。",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  function buildSummary(company: Company) {
    const categoryText = company.primaryCategory
      ? `${company.primaryCategory}として登録されています。`
      : company.categories?.length
        ? `${company.categories.slice(0, 3).join("、")}に関連する事業者です。`
        : "";
    const ratingText = company.rating
      ? `Google上の評価は${company.rating}で、口コミ件数は${company.reviewCount ?? 0}件です。`
      : "Google上の評価情報は未取得です。";
    const contactText = company.website
      ? "Webサイトが確認できるため、営業前の事前調査や問い合わせ導線の確認に使えます。"
      : "Webサイトは未取得のため、Google Mapsや電話番号から追加確認するのがよさそうです。";

    return `${company.name}は${company.address}に所在する事業者です。${categoryText}${ratingText}${contactText}`;
  }

  function buildSalesProposal(company: Company): SalesProposal {
    const category =
      company.primaryCategory || company.categories?.[0] || "地域事業";
    const contactRoute = company.website
      ? "Webサイトの内容を確認したうえで、問い合わせフォーム経由の初回接点を作れます。"
      : "Webサイト情報がないため、電話またはGoogle Maps経由で受付窓口を確認するのが現実的です。";

    return {
      assumedChallenges: `${category}では、集客導線の整備、問い合わせ対応、既存顧客との関係維持が営業上の論点になりやすいです。公開情報だけでは個別課題は断定せず、まず現状確認から入るのが適しています。`,
      salesAngle: `${company.name}様の所在地・口コミ・Webサイトなどの公開情報を踏まえ、問い合わせ増加や業務効率化につながる改善ポイントをご提案できる可能性があります。`,
      firstProposal: `初回はサービス紹介よりも、${company.name}の現在の集客導線や問い合わせ対応について15分ほど情報交換する提案が自然です。`,
      callTalkExample: `${company.name} ご担当者様に、地域のお客様からの問い合わせ導線について情報提供のご連絡です、と伝えると会話を始めやすいです。${contactRoute}`,
    };
  }

  function resetSalesEmail() {
    setIsGeneratingSalesEmail(false);
    setSalesEmail(null);
    setSalesEmailError("");
  }

  function handleSelectCompany(company: Company) {
    setSelectedCompany(company);
    resetSalesEmail();
  }

  function toggleCompanySelection(companyId: string) {
    setSelectedCompanyIds((currentIds) =>
      currentIds.includes(companyId)
        ? currentIds.filter((currentId) => currentId !== companyId)
        : [...currentIds, companyId],
    );
  }

  function toggleFdaCompanySelection(companyId: string) {
    setSelectedFdaCompanyIds((currentIds) =>
      currentIds.includes(companyId)
        ? currentIds.filter((currentId) => currentId !== companyId)
        : [...currentIds, companyId],
    );
  }

  async function handleFdaWebResearch() {
    const sourceCompanies = fdaCompanies.filter((company) =>
      company.records.some((record) => record.dataType === fdaResearchDataType),
    );
    const targets = fdaResearchScope === "all" ? sourceCompanies : selectedFdaCompanies.slice(0, 10);
    if (!targets.length) return;
    setIsResearchingFda(true);
    setError("");
    try {
      const response = await fetch("/api/fda/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: targets }),
      });
      const payload = await response.json() as { results?: Array<Partial<FdaCompany> & { id: string }>; error?: string };
      if (!response.ok || !payload.results) throw new Error(payload.error || "FDA候補のWeb調査に失敗しました。");
      const updates = new Map(payload.results.map((result) => [result.id, result]));
      setFdaCompanies((current) => current.map((company) => ({ ...company, ...updates.get(company.id) })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FDA候補のWeb調査に失敗しました。");
    } finally {
      setIsResearchingFda(false);
    }
  }

  function escapeCsvValue(value: string | number | undefined) {
    return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  }

  function getExportDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function getExportRows(): ExportCompanyRow[] {
    return selectedCompanies.map((company) => ({
      会社名: company.name,
      住所: company.address,
      電話番号: company.phone || "",
      "公式サイトURL": company.website || "",
      "問い合わせフォームURL": company.contactFormUrl || "",
      "公開メールアドレス": company.publicEmails.join(" / "),
      適合度: company.suitability,
      判定スコア: company.suitabilityScore,
      判定理由: company.suitabilityReasons.join(" / "),
      "判定根拠URL": company.evidenceUrls.join(" / "),
      "抹茶取扱状況": company.matchaHandlingStatus,
      "抹茶取扱種別": company.matchaHandlingType,
      "抹茶取扱理由": company.matchaHandlingReasons.join(" / "),
      "抹茶取扱根拠URL": company.matchaEvidenceUrls.join(" / "),
      "BtoB適合度": company.b2bSuitability,
      "BtoB取引種別": company.b2bBusinessTypes.join(" / "),
      "BtoB判定理由": company.b2bReasons.join(" / "),
      "BtoB根拠URL": company.b2bEvidenceUrls.join(" / "),
      "最終判定": company.finalAssessment,
      "Google Maps URL": company.googleMapsUri || "",
      "ヒットした検索ワード": company.hitKeywords.join(" / "),
    }));
  }

  function handleExportCsv() {
    if (searchSource === "fda") {
      if (!selectedFdaCompanies.length) return;
      const headers = [
        "企業名", "国", "所在地", "検索ソース", "FDAデータ種別", "FDA製品説明",
        "FDA製品コード", "FDA製品コード説明", "ヒット方法", "FDA事象", "FDA日付", "FDA根拠", "FDA識別子", "ヒット語", "ヒット理由",
        "公式サイト", "公式サイト特定方法", "公式サイト確度", "公式サイト判定根拠", "matchaStatus", "matchaEvidence", "matchaEvidenceUrl",
      ];
      const rows = selectedFdaCompanies.flatMap((company) => company.records.map((record) => [
        company.name, company.country, company.address, "FDA", record.dataType, record.productDescription,
        record.productCode || "", record.productCodeDescription || "", record.hitMethod || "keyword", record.event, record.date || "", record.evidenceUrl,
        record.identifier || company.identifiers.join(" / "), record.hitTerms.join(" / "), record.hitReasons.join(" / "),
        company.officialWebsite || "", company.officialWebsiteMethod || "", company.officialWebsiteConfidence || "", company.officialWebsiteReason || "",
        company.matchaStatus || "unconfirmed", company.matchaEvidence || "", company.matchaEvidenceUrl || "",
      ]));
      downloadCsv(headers, rows, "fda_companies");
      return;
    }
    if (selectedCompanies.length === 0) {
      return;
    }

    const headers = [
      "会社名",
      "住所",
      "電話番号",
      "公式サイトURL",
      "問い合わせフォームURL",
      "公開メールアドレス",
      "適合度",
      "判定スコア",
      "判定理由",
      "判定根拠URL",
      "抹茶取扱状況",
      "抹茶取扱種別",
      "抹茶取扱理由",
      "抹茶取扱根拠URL",
      "BtoB適合度",
      "BtoB取引種別",
      "BtoB判定理由",
      "BtoB根拠URL",
      "最終判定",
      "Google Maps URL",
      "ヒットした検索ワード",
    ] as const;
    const rows = getExportRows().map((company) =>
      headers.map((header) => company[header]),
    );
    downloadCsv([...headers], rows, "companies");
  }

  function downloadCsv(headers: readonly string[], rows: Array<Array<string | number>>, filename: string) {
    const csvBody = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csvBody}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${filename}_${getExportDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    if (searchSource === "fda") {
      if (!selectedFdaCompanies.length) return;
      const rows = selectedFdaCompanies.flatMap((company) => company.records.map((record) => ({
        企業名: company.name,
        国: company.country,
        所在地: company.address,
        検索ソース: "FDA",
        "FDAデータ種別": record.dataType,
        "FDA製品説明": record.productDescription,
        "FDA製品コード": record.productCode || "",
        "FDA製品コード説明": record.productCodeDescription || "",
        "ヒット方法": record.hitMethod || "keyword",
        "FDA事象": record.event,
        "FDA日付": record.date || "",
        "FDA根拠": record.evidenceUrl,
        "FDA識別子": record.identifier || company.identifiers.join(" / "),
        ヒット語: record.hitTerms.join(" / "),
        ヒット理由: record.hitReasons.join(" / "),
        公式サイト: company.officialWebsite || "",
        公式サイト特定方法: company.officialWebsiteMethod || "",
        公式サイト確度: company.officialWebsiteConfidence || "",
        公式サイト判定根拠: company.officialWebsiteReason || "",
        matchaStatus: company.matchaStatus || "unconfirmed",
        matchaEvidence: company.matchaEvidence || "",
        matchaEvidenceUrl: company.matchaEvidenceUrl || "",
      })));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 50 }, { wch: 12 }, { wch: 18 }, { wch: 80 }, { wch: 18 }, { wch: 80 }, { wch: 14 }, { wch: 70 }, { wch: 28 }, { wch: 30 }, { wch: 80 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "FDA企業候補");
      XLSX.writeFile(workbook, `fda_companies_${getExportDateString()}.xlsx`, { compression: true });
      return;
    }
    if (selectedCompanies.length === 0) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(getExportRows(), {
      header: [
        "会社名",
        "住所",
        "電話番号",
        "公式サイトURL",
        "問い合わせフォームURL",
        "公開メールアドレス",
        "適合度",
        "判定スコア",
        "判定理由",
        "判定根拠URL",
        "抹茶取扱状況",
        "抹茶取扱種別",
        "抹茶取扱理由",
        "抹茶取扱根拠URL",
        "BtoB適合度",
        "BtoB取引種別",
        "BtoB判定理由",
        "BtoB根拠URL",
        "最終判定",
        "Google Maps URL",
        "ヒットした検索ワード",
      ],
    });
    worksheet["!cols"] = [
      { wch: 30 },
      { wch: 50 },
      { wch: 18 },
      { wch: 70 },
      { wch: 16 },
      { wch: 24 },
      { wch: 80 },
      { wch: 70 },
      { wch: 16 },
      { wch: 30 },
      { wch: 80 },
      { wch: 70 },
      { wch: 16 },
      { wch: 70 },
      { wch: 40 },
      { wch: 12 },
      { wch: 12 },
      { wch: 80 },
      { wch: 70 },
      { wch: 70 },
      { wch: 45 },
    ];
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "企業一覧");
    XLSX.writeFile(workbook, `companies_${getExportDateString()}.xlsx`, {
      compression: true,
    });
  }

  async function handleGenerateSalesEmail() {
    if (!selectedCompany || isGeneratingSalesEmail) {
      return;
    }

    const aiSummary = buildSummary(selectedCompany);
    const salesProposal = buildSalesProposal(selectedCompany);

    setIsGeneratingSalesEmail(true);
    setSalesEmail(null);
    setSalesEmailError("");

    try {
      const response = await fetch("/api/sales-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company: selectedCompany,
          aiSummary,
          salesProposal,
        }),
      });
      const data = (await response.json()) as Partial<SalesEmail> & {
        error?: string;
      };

      if (!response.ok || !data.subject || !data.body) {
        throw new Error(data.error || "営業メールの生成に失敗しました。");
      }

      setSalesEmail({
        subject: data.subject,
        body: data.body,
      });
    } catch (caught) {
      setSalesEmailError(
        caught instanceof Error
          ? caught.message
          : "営業メールの生成に失敗しました。",
      );
    } finally {
      setIsGeneratingSalesEmail(false);
    }
  }

  if (selectedCompany) {
    const salesProposal = buildSalesProposal(selectedCompany);
    const detailRows = [
      { label: "住所", value: selectedCompany.address },
      {
        label: "業種・カテゴリ",
        value:
          selectedCompany.categories && selectedCompany.categories.length > 0
            ? selectedCompany.categories.join("、")
            : "情報なし",
      },
      {
        label: "評価",
        value: selectedCompany.rating
          ? `${selectedCompany.rating}${selectedCompany.reviewCount ? ` (${selectedCompany.reviewCount}件)` : ""}`
          : "情報なし",
      },
      {
        label: "口コミ件数",
        value:
          typeof selectedCompany.reviewCount === "number"
            ? `${selectedCompany.reviewCount}件`
            : "情報なし",
      },
      { label: "電話番号", value: selectedCompany.phone || "情報なし" },
      {
        label: "問い合わせフォームURL",
        value: selectedCompany.contactFormUrl || "情報なし",
      },
      {
        label: "公開メールアドレス",
        value: selectedCompany.publicEmails.join(" / ") || "情報なし",
      },
      {
        label: "抹茶取扱状況",
        value: selectedCompany.matchaHandlingStatus,
      },
      {
        label: "抹茶取扱種別",
        value: selectedCompany.matchaHandlingType,
      },
      {
        label: "抹茶取扱理由",
        value: selectedCompany.matchaHandlingReasons.join(" / ") || "情報なし",
      },
      {
        label: "BtoB適合度",
        value: selectedCompany.b2bSuitability,
      },
      {
        label: "BtoB取引種別",
        value: selectedCompany.b2bBusinessTypes.join(" / ") || "不明",
      },
      {
        label: "BtoB判定理由",
        value: selectedCompany.b2bReasons.join(" / ") || "情報なし",
      },
      {
        label: "最終判定",
        value: `${selectedCompany.finalAssessment}（総合スコア ${selectedCompany.suitabilityScore}点）`,
      },
      {
        label: "スコア内訳",
        value: selectedCompany.scoreBreakdown.join(" / ") || "情報なし",
      },
      {
        label: "ヒットした検索ワード",
        value: selectedCompany.hitKeywords.join(" / ") || "情報なし",
      },
      {
        label: "営業状態",
        value: selectedCompany.businessStatus || "情報なし",
      },
      {
        label: "現在営業中",
        value:
          typeof selectedCompany.openNow === "boolean"
            ? selectedCompany.openNow
              ? "営業中"
              : "営業時間外"
            : "情報なし",
      },
    ];

    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <div className="mx-auto w-full max-w-4xl">
          <button
            type="button"
            onClick={() => setSelectedCompany(null)}
            className="mb-6 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            一覧へ戻る
          </button>

          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium text-slate-500">
                企業詳細
              </p>
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
                {selectedCompany.name}
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {selectedCompany.address}
              </p>
            </div>

            <section className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <h2 className="mb-2 text-base font-semibold text-slate-950">
                AI要約
              </h2>
              <p className="text-sm leading-6 text-slate-700">
                {buildSummary(selectedCompany)}
              </p>
            </section>

            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-slate-950">
                企業情報
              </h2>
              <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                {detailRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <dt className="font-medium text-slate-800">
                      {row.label}
                    </dt>
                    <dd className="mt-1 break-words">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-slate-950">
                抹茶取扱根拠URL
              </h2>
              {selectedCompany.matchaEvidenceUrls.length > 0 ? (
                <ul className="grid gap-2 rounded-md border border-slate-200 p-4 text-sm">
                  {selectedCompany.matchaEvidenceUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-medium text-teal-700 hover:text-teal-900"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
                  抹茶取扱の根拠ページを確認できませんでした。
                </p>
              )}
            </section>

            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-slate-950">
                BtoB根拠URL
              </h2>
              {selectedCompany.b2bEvidenceUrls.length > 0 ? (
                <ul className="grid gap-2 rounded-md border border-slate-200 p-4 text-sm">
                  {selectedCompany.b2bEvidenceUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-medium text-teal-700 hover:text-teal-900"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
                  BtoB判定の根拠ページを確認できませんでした。
                </p>
              )}
            </section>

            <section className="mb-6">
              <h2 className="mb-3 text-base font-semibold text-slate-950">
                営業時間
              </h2>
              {selectedCompany.openingHours &&
              selectedCompany.openingHours.length > 0 ? (
                <ul className="rounded-md border border-slate-200 p-4 text-sm leading-7 text-slate-600">
                  {selectedCompany.openingHours.map((hours) => (
                    <li key={hours}>{hours}</li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
                  情報なし
                </p>
              )}
            </section>

            <section className="mb-6 rounded-md border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold text-slate-950">
                AI営業提案
              </h2>
              <div className="grid gap-3 text-sm text-slate-600">
                <div>
                  <h3 className="font-medium text-slate-800">想定課題</h3>
                  <p className="mt-1 leading-6">
                    {salesProposal.assumedChallenges}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">営業切り口</h3>
                  <p className="mt-1 leading-6">{salesProposal.salesAngle}</p>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">初回提案文</h3>
                  <p className="mt-1 leading-6">
                    {salesProposal.firstProposal}
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold text-slate-950">
                  AI営業メール
                </h2>
                <button
                  type="button"
                  onClick={handleGenerateSalesEmail}
                  disabled={isGeneratingSalesEmail}
                  className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isGeneratingSalesEmail
                    ? "生成中..."
                    : salesEmail
                      ? "再生成"
                      : "営業メールを生成"}
                </button>
              </div>
              {salesEmailError ? (
                <p className="mb-3 text-sm font-medium text-rose-700">
                  {salesEmailError}
                </p>
              ) : null}
              {salesEmail ? (
                <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <h3 className="font-semibold text-slate-950">件名</h3>
                  <p className="mt-2 leading-6">{salesEmail.subject}</p>
                  <h3 className="mt-5 font-semibold text-slate-950">本文</h3>
                  <p className="mt-2 whitespace-pre-line leading-7">
                    {salesEmail.body}
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  AI要約と公開情報をもとに、初回営業メールのたたき台を生成します。
                </p>
              )}
            </section>

            <div className="flex flex-wrap gap-3">
              {selectedCompany.googleMapsUri ? (
                <a
                  href={selectedCompany.googleMapsUri}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-slate-50"
                >
                  Google Maps
                </a>
              ) : null}
              {selectedCompany.website ? (
                <a
                  href={selectedCompany.website}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-slate-50"
                >
                  Webサイト
                </a>
              ) : null}
              {selectedCompany.contactFormUrl ? (
                <a
                  href={selectedCompany.contactFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-slate-50"
                >
                  問い合わせフォーム
                </a>
              ) : null}
            </div>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <p className="mb-2 text-sm font-medium text-slate-500">
            BtoB Sales Research Assistant
          </p>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
            AI企業リサーチ
          </h1>
        </div>

        <form
          onSubmit={handleSearch}
          className="grid gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_0.8fr_0.8fr_auto] lg:items-end"
        >
          <div>
            <label htmlFor="searchSource" className="mb-2 block text-sm font-medium text-slate-700">
              検索ソース
            </label>
            <select
              id="searchSource"
              value={searchSource}
              onChange={(event) => {
                setSearchSource(event.target.value as "google" | "fda");
                setSelectedCompany(null);
                setError("");
              }}
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900"
            >
              <option value="google">Google Places</option>
              <option value="fda">FDA</option>
            </select>
          </div>

          {searchSource === "google" ? <>
          <div>
            <label
              htmlFor="keyword"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              検索キーワード
            </label>
            <input
              id="keyword"
              name="keyword"
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              disabled={Boolean(searchSetKey)}
              placeholder="例: 営業DX、採用強化、クラウド移行"
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="searchSet"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              検索セット
            </label>
            <select
              id="searchSet"
              name="searchSet"
              value={searchSetKey}
              onChange={(event) =>
                setSearchSetKey(event.target.value as SearchSetKey)
              }
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">使用しない</option>
              {Object.entries(searchSets).map(([key, searchSet]) => (
                <option key={key} value={key}>
                  {searchSet.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="region"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              地域
            </label>
            <select
              id="region"
              name="region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">地域を選択してください</option>
              {regions.map((regionItem) => (
                <option key={regionItem} value={regionItem}>
                  {regionItem}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="industry"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              業種
            </label>
            <select
              id="industry"
              name="industry"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">指定なし</option>
              {industries.map((industryItem) => (
                <option key={industryItem} value={industryItem}>
                  {industryItem}
                </option>
              ))}
            </select>
          </div>

          </> : <>
            <div>
              <label htmlFor="fdaPriority" className="mb-2 block text-sm font-medium text-slate-700">
                国の優先度
              </label>
              <select
                id="fdaPriority"
                value={fdaPriority}
                onChange={(event) => setFdaPriority(event.target.value as "all" | "1" | "2" | "3")}
                className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900"
              >
                <option value="all">すべて</option>
                <option value="1">優先1（USA・EU）</option>
                <option value="2">優先2（タイ・韓国・台湾）</option>
                <option value="3">優先3（インド・ベトナム）</option>
              </select>
            </div>
            <label className="flex h-12 items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={excludeChina}
                onChange={(event) => setExcludeChina(event.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              中国を除外
            </label>
          </>}

          <button
            type="submit"
            disabled={isLoading || isEnriching}
            className="h-12 rounded-md bg-slate-950 px-6 text-base font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "検索中..." : isEnriching ? "公式サイト調査中..." : "検索"}
          </button>
        </form>

        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">検索条件</p>
              <h2 className="text-xl font-semibold text-slate-950">
                {searchSummary}
              </h2>
            </div>
            <div className="flex flex-col gap-1 sm:items-end">
              <p className="text-sm font-semibold text-slate-600">
                {searchSource === "fda"
                  ? `${fdaCompanies.length}社 / ${fdaRecordCount}記録`
                  : `${companies.length}件 / 次ページ${hasNextPage ? "あり" : "なし"}`}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <p className="text-sm font-semibold text-teal-700">
                  {searchSource === "fda" ? selectedFdaCompanies.length : selectedCompanyCount}件選択中
                </p>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={searchSource === "fda" ? selectedFdaCompanies.length === 0 : selectedCompanies.length === 0}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  CSV出力
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={searchSource === "fda" ? selectedFdaCompanies.length === 0 : selectedCompanies.length === 0}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Excel出力
                </button>
              </div>
            </div>
          </div>

          {searchSource === "google" ? <div className="mb-4 flex flex-wrap items-end gap-4 rounded-md border border-slate-200 bg-white p-4">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              最終判定で絞り込み
              <select
                value={suitabilityFilter}
                onChange={(event) =>
                  setSuitabilityFilter(event.target.value as "すべて" | FinalAssessment)
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3"
              >
                <option value="すべて">すべて</option>
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="要確認">要確認</option>
                <option value="低">低</option>
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={sortBySuitability}
                onChange={(event) => setSortBySuitability(event.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              最終判定の高い順
            </label>
            {isEnriching ? (
              <p className="text-sm font-semibold text-teal-700">
                公式サイトを調査中…（検索結果は先に利用できます）
              </p>
            ) : null}
          </div> : (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              FDA公開記録に登場した候補です。FDA承認・FDA適合・現在違反中を意味しません。
              Import Refusal {fdaSourceCounts["Import Refusal"]}件 / Food Recall {fdaSourceCounts["Food Recall"]}件
              <span className="ml-2">（Import Refusal: 文字列のみ {importRefusalMatchCounts.keyword} / Product Codeのみ {importRefusalMatchCounts.product_code} / 両方 {importRefusalMatchCounts["keyword+product_code"]}）</span>
              <button
                type="button"
                onClick={handleFdaWebResearch}
                disabled={isResearchingFda || (fdaResearchScope === "test" && selectedFdaCompanies.length === 0)}
                className="ml-3 rounded-md border border-amber-400 bg-white px-3 py-1 font-semibold disabled:opacity-50"
              >
                {isResearchingFda ? "Web調査中…" : "FDA候補をWeb調査"}
              </button>
              <select
                value={fdaResearchScope}
                onChange={(event) => setFdaResearchScope(event.target.value as "test" | "all")}
                disabled={isResearchingFda}
                className="ml-2 rounded-md border border-amber-400 bg-white px-2 py-1"
                aria-label="FDA Web調査範囲"
              >
                <option value="test">テスト：選択した最大10社</option>
                <option value="all">全件調査：選択データ種別の全候補</option>
              </select>
              <select
                value={fdaResearchDataType}
                onChange={(event) => setFdaResearchDataType(event.target.value as "Import Refusal" | "Food Recall")}
                disabled={isResearchingFda}
                className="ml-2 rounded-md border border-amber-400 bg-white px-2 py-1"
                aria-label="FDA Web調査データ種別"
              >
                <option value="Import Refusal">Import Refusal</option>
                <option value="Food Recall">Food Recall</option>
              </select>
              {fdaWebSummary.total ? (
                <span className="ml-2">
                  Web調査 {fdaWebSummary.total}社 / 公式サイト {fdaWebSummary.websites} / confirmed {fdaWebSummary.confirmed} / green tea only {fdaWebSummary.greenTeaOnly} / processed only {fdaWebSummary.processedOnly} / unconfirmed {fdaWebSummary.unconfirmed}
                </span>
              ) : null}
            </div>
          )}

          {enrichmentError ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {enrichmentError} Google Placesの検索結果は保持されています。
            </div>
          ) : null}

          {searched ? (
            <div className="mb-4 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p>
                検索クエリ:{" "}
                <span className="font-semibold text-slate-900">
                  {resolvedQuery || searchSummary}
                </span>
              </p>
              <p>
                地域範囲:{" "}
                <span className="font-semibold text-slate-900">
                  {regionScope || (searchSource === "google" ? region : "全対象国")}
                </span>
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3">
            {searchSource === "fda" ? fdaCompanies.map((company) => {
              const isSelected = selectedFdaCompanyIds.includes(company.id);
              return (
                <article key={company.id} className={`rounded-lg border bg-white p-5 shadow-sm ${isSelected ? "border-teal-300 ring-1 ring-teal-100" : "border-slate-200"}`}>
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFdaCompanySelection(company.id)}
                      aria-label={`${company.name}を選択`}
                      className="mt-1 h-5 w-5 accent-teal-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-950">{company.name}</h3>
                        {company.priority ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">優先{company.priority}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{company.address || "所在地未取得"}</p>
                      <p className="mt-1 text-xs text-slate-500">国: {company.country}（{company.countryBasis === "manufacturer/origin" ? "製造者・原産国" : "recalling firm所在地"}）</p>
                      <p className="mt-2 text-sm text-slate-700">ヒット語: {company.hitTerms.join(" / ")}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{company.hitReasons[0]}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        matcha判定: {company.matchaStatus || "未調査"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{company.matchaEvidence || "Web調査未実施"}</p>
                      {company.officialWebsite ? <a href={company.officialWebsite} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-teal-700">公式サイト候補（{company.officialWebsiteMethod === "web_search" ? "Web検索" : "Google Places"} / {company.officialWebsiteConfidence}）</a> : null}
                      {company.matchaEvidenceUrl ? <a href={company.matchaEvidenceUrl} target="_blank" rel="noreferrer" className="ml-3 mt-1 inline-block text-xs font-semibold text-teal-700">抹茶根拠</a> : null}
                      <div className="mt-4 grid gap-3">
                        {company.records.map((record) => (
                          <div key={record.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                            <p className="font-semibold text-slate-900">{record.dataType} / {record.date || "日付不明"}</p>
                            <p className="mt-1 text-slate-700">{record.productDescription}</p>
                            <p className="mt-1 text-xs text-slate-500">製品コード: {record.productCode || "なし"} / 識別子: {record.identifier || "なし"}</p>
                            {record.dataType === "Import Refusal" ? <p className="mt-1 text-xs text-slate-500">ヒット方法: {record.hitMethod} / コード説明: {record.productCodeDescription || "なし"}</p> : null}
                            <p className="mt-2 text-xs leading-5 text-slate-600">FDA上の事象: {record.event || "詳細なし"}</p>
                            <a href={record.evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-teal-700 hover:text-teal-900">FDA根拠</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            }) : visibleCompanies.map((company) => {
              const isSelected = selectedCompanyIds.includes(company.id);

              return (
                <article
                  key={company.id}
                  onClick={() => handleSelectCompany(company)}
                  className={`grid cursor-pointer grid-cols-[auto_1fr] gap-4 rounded-lg border bg-white p-5 shadow-sm transition hover:border-slate-300 lg:grid-cols-[auto_1.4fr_1fr_auto] lg:items-center ${
                    isSelected
                      ? "border-teal-300 ring-1 ring-teal-100"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start pt-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCompanySelection(company.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${company.name}を選択`}
                      className="h-5 w-5 rounded border-slate-300 text-teal-700 accent-teal-700 focus:ring-2 focus:ring-teal-200"
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">
                      {company.name}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {company.address}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      ヒットした検索ワード: {company.hitKeywords.join(" / ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold ${
                          company.suitability === "高"
                            ? "bg-emerald-100 text-emerald-800"
                            : company.suitability === "中"
                              ? "bg-amber-100 text-amber-800"
                              : company.suitability === "低"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        最終判定: {company.finalAssessment}（{company.suitabilityScore}点）
                      </span>
                      <span className="text-slate-500">
                        {company.enrichmentStatus}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      抹茶取扱: {company.matchaHandlingStatus} / BtoB: {company.b2bSuitability}
                    </p>
                  </div>

                  <dl className="col-start-2 grid gap-1 text-sm text-slate-600 lg:col-auto">
                    {company.rating ? (
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-800">評価</dt>
                        <dd>
                          {company.rating}
                          {company.reviewCount
                            ? ` (${company.reviewCount}件)`
                            : ""}
                        </dd>
                      </div>
                    ) : null}
                    {company.phone ? (
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-800">電話</dt>
                        <dd>{company.phone}</dd>
                      </div>
                    ) : null}
                    {company.businessStatus ? (
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-800">状態</dt>
                        <dd>{company.businessStatus}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="col-start-2 flex flex-wrap gap-3 lg:col-auto lg:justify-end">
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Webサイト
                      </a>
                    ) : null}
                    {company.googleMapsUri ? (
                      <a
                        href={company.googleMapsUri}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Google Maps
                      </a>
                    ) : null}
                    {company.contactFormUrl ? (
                      <a
                        href={company.contactFormUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-900"
                      >
                        問い合わせ
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {!isLoading && searched && !error
            && (searchSource === "fda" ? fdaCompanies.length === 0 : companies.length === 0) ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              条件に合う企業が見つかりませんでした。
            </p>
          ) : null}

          {searchSource === "google" && searched && hasNextPage ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore || isEnriching}
                className="h-11 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {isLoadingMore ? "読み込み中..." : "さらに読み込む"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
