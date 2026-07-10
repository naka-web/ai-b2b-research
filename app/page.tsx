"use client";

import { FormEvent, useMemo, useState } from "react";

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

type Company = {
  id: string;
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

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("");
  const [industry, setIndustry] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [regionScope, setRegionScope] = useState("");
  const [activeSearch, setActiveSearch] = useState<SearchValues | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isGeneratingSalesEmail, setIsGeneratingSalesEmail] = useState(false);
  const [salesEmail, setSalesEmail] = useState<SalesEmail | null>(null);
  const [salesEmailError, setSalesEmailError] = useState("");

  const searchSummary = useMemo(() => {
    return [
      keyword.trim() || "企業",
      industry || "指定なし",
      region || "地域未選択",
    ]
      .filter(Boolean)
      .join(" / ");
  }, [industry, keyword, region]);

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
    const seenIds = new Set(currentCompanies.map((company) => company.id));
    const uniqueIncoming = incomingCompanies.filter((company) => {
      if (seenIds.has(company.id)) {
        return false;
      }
      seenIds.add(company.id);
      return true;
    });

    return [...currentCompanies, ...uniqueIncoming];
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setSearched(true);
    setNextPageToken(null);
    setHasNextPage(false);
    setResolvedQuery("");
    setRegionScope("");
    setSelectedCompany(null);
    resetSalesEmail();

    const formData = new FormData(event.currentTarget);
    const searchValues = {
      keyword: String(formData.get("keyword") || ""),
      region: String(formData.get("region") || ""),
      industry: String(formData.get("industry") || ""),
    };
    setKeyword(searchValues.keyword);
    setRegion(searchValues.region);
    setIndustry(searchValues.industry);

    if (!searchValues.region) {
      setCompanies([]);
      setNextPageToken(null);
      setHasNextPage(false);
      setActiveSearch(null);
      setError("地域を選択してください");
      setIsLoading(false);
      return;
    }

    try {
      const payload = await fetchPlaces(searchValues);
      setActiveSearch(searchValues);
      setCompanies(payload.companies);
      setNextPageToken(payload.nextPageToken);
      setHasNextPage(payload.hasNextPage);
      setResolvedQuery(payload.query);
      setRegionScope(payload.regionScope);
    } catch (caught) {
      setCompanies([]);
      setNextPageToken(null);
      setHasNextPage(false);
      setActiveSearch(null);
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
    if (!nextPageToken || !activeSearch) {
      return;
    }

    setIsLoadingMore(true);
    setError("");

    try {
      const payload = await fetchPlaces(activeSearch, nextPageToken);
      setCompanies((currentCompanies) =>
        mergeCompanies(currentCompanies, payload.companies),
      );
      setNextPageToken(payload.nextPageToken);
      setHasNextPage(payload.hasNextPage);
      setResolvedQuery(payload.query);
      setRegionScope(payload.regionScope);
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
          className="grid gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end"
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
              placeholder="例: 営業DX、採用強化、クラウド移行"
              className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            />
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
            <p className="text-sm font-semibold text-slate-600">
              {companies.length}件 / 次ページ
              {hasNextPage ? "あり" : "なし"}
            </p>
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
            {companies.map((company) => (
              <article
                key={company.id}
                onClick={() => handleSelectCompany(company)}
                className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1.4fr_1fr_auto] lg:items-center"
              >
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {company.name}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {company.address}
                  </p>
                </div>

                <dl className="grid gap-1 text-sm text-slate-600">
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

                <div className="flex flex-wrap gap-3 lg:justify-end">
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
            ))}
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
