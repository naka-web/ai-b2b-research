"use client";

import { FormEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";

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

type Company = {
  id: string;
  placeId?: string;
  name: string;
  primaryCategory?: string;
  categories?: string[];
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  openNow?: boolean;
  openingHours?: string[];
  hitKeywords: string[];
};

type PlacesPayload = {
  companies: Company[];
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
  "Google Maps URL": string;
  "ヒットした検索ワード": string;
};

export default function Home() {
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

  const searchSummary = useMemo(() => {
    return [
      searchSetKey ? searchSets[searchSetKey].label : keyword.trim() || "企業",
      industry || "指定なし",
      region || "地域未選択",
    ]
      .filter(Boolean)
      .join(" / ");
  }, [industry, keyword, region, searchSetKey]);

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
    resetSalesEmail();

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
        const companiesWithHitKeyword = payload.companies.map((company) => ({
          ...company,
          hitKeywords: [searchKeyword.trim() || "企業"],
        }));

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

        additionalCompanies = mergeCompanies(
          additionalCompanies,
          payload.companies.map((company) => ({
            ...company,
            hitKeywords: [hitKeyword],
          })),
        );
        const searchIndex = updatedSearches.indexOf(activeSearch);
        updatedSearches[searchIndex] = {
          ...activeSearch,
          nextPageToken: payload.nextPageToken,
        };
      }

      setCompanies((currentCompanies) =>
        mergeCompanies(currentCompanies, additionalCompanies),
      );
      setActiveSearches(updatedSearches);
      setHasNextPage(
        updatedSearches.some((search) => Boolean(search.nextPageToken)),
      );
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

  function escapeCsvValue(value: string | undefined) {
    return `"${(value || "").replaceAll("\"", "\"\"")}"`;
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
      "Google Maps URL": company.googleMapsUri || "",
      "ヒットした検索ワード": company.hitKeywords.join(" / "),
    }));
  }

  function handleExportCsv() {
    if (selectedCompanies.length === 0) {
      return;
    }

    const headers = [
      "会社名",
      "住所",
      "電話番号",
      "公式サイトURL",
      "Google Maps URL",
      "ヒットした検索ワード",
    ] as const;
    const rows = getExportRows().map((company) =>
      headers.map((header) => company[header]),
    );
    const csvBody = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csvBody}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `companies_${getExportDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleExportExcel() {
    if (selectedCompanies.length === 0) {
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(getExportRows(), {
      header: [
        "会社名",
        "住所",
        "電話番号",
        "公式サイトURL",
        "Google Maps URL",
        "ヒットした検索ワード",
      ],
    });
    worksheet["!cols"] = [
      { wch: 30 },
      { wch: 50 },
      { wch: 18 },
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

          <button
            type="submit"
            disabled={isLoading}
            className="h-12 rounded-md bg-slate-950 px-6 text-base font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "検索中..." : "検索"}
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
                {companies.length}件 / 次ページ
                {hasNextPage ? "あり" : "なし"}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <p className="text-sm font-semibold text-teal-700">
                  {selectedCompanyCount}件選択中
                </p>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={selectedCompanies.length === 0}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  CSV出力
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={selectedCompanies.length === 0}
                  className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Excel出力
                </button>
              </div>
            </div>
          </div>

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
                  {regionScope || region}
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
            {companies.map((company) => {
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
                  </div>
                </article>
              );
            })}
          </div>

          {!isLoading && searched && !error && companies.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              条件に合う企業が見つかりませんでした。
            </p>
          ) : null}

          {searched && hasNextPage ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
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
