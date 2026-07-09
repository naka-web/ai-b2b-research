"use client";

import { FormEvent, useState } from "react";
import { companySearchOptions } from "@/services/companySearchOptions";
import { Company, CompanySearchParams } from "@/services/companyTypes";

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

const { industries, regions } = companySearchOptions;

export default function Home() {
  const [hasSearched, setHasSearched] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [salesProposal, setSalesProposal] = useState<SalesProposal | null>(
    null,
  );
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isGeneratingSalesEmail, setIsGeneratingSalesEmail] = useState(false);
  const [salesEmail, setSalesEmail] = useState<SalesEmail | null>(null);
  const [salesEmailError, setSalesEmailError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const employeesValue = formData.get("employees")?.toString() ?? "";
    const parsedMinEmployees = employeesValue ? Number(employeesValue) : NaN;
    const searchParams: CompanySearchParams = {
      keyword: formData.get("keyword")?.toString(),
      region: formData.get("region")?.toString(),
      industry: formData.get("industry")?.toString(),
      minEmployees: Number.isFinite(parsedMinEmployees)
        ? parsedMinEmployees
        : undefined,
    };
    const response = await fetch("/api/companies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchParams),
    });
    const data = (await response.json()) as { companies?: Company[] };
    const results = response.ok ? data.companies ?? [] : [];

    setCompanies(results);
    setHasSearched(true);
    setSelectedCompany(null);
    setIsGeneratingSummary(false);
    setAiSummary(null);
    setSalesProposal(null);
    setSummaryError(null);
    setIsGeneratingSalesEmail(false);
    setSalesEmail(null);
    setSalesEmailError(null);
  }

  function handleBackToList() {
    setSelectedCompany(null);
    setIsGeneratingSummary(false);
    setAiSummary(null);
    setSalesProposal(null);
    setSummaryError(null);
    setIsGeneratingSalesEmail(false);
    setSalesEmail(null);
    setSalesEmailError(null);
  }

  function handleSelectCompany(companyId: string) {
    const company =
      companies.find((currentCompany) => currentCompany.id === companyId) ??
      null;

    setSelectedCompany(company);
    setIsGeneratingSummary(false);
    setAiSummary(null);
    setSalesProposal(null);
    setSummaryError(null);
    setIsGeneratingSalesEmail(false);
    setSalesEmail(null);
    setSalesEmailError(null);
  }

  async function handleGenerateSummary() {
    if (!selectedCompany || isGeneratingSummary) {
      return;
    }

    setIsGeneratingSummary(true);
    setAiSummary(null);
    setSalesProposal(null);
    setSummaryError(null);
    setSalesEmail(null);
    setSalesEmailError(null);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: selectedCompany.name,
          industry: selectedCompany.industry,
          region: selectedCompany.region,
          employees: selectedCompany.employees,
          business: selectedCompany.business,
          challenge: selectedCompany.challenge,
          proposedService: selectedCompany.proposedService,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary.");
      }

      const data = (await response.json()) as {
        summary?: string;
        salesProposal?: SalesProposal;
      };

      if (!data.summary || !data.salesProposal) {
        throw new Error("Summary is empty.");
      }

      setAiSummary(data.summary);
      setSalesProposal(data.salesProposal);
    } catch {
      setSummaryError("AI要約の生成に失敗しました");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  async function handleGenerateSalesEmail() {
    if (
      !selectedCompany ||
      !aiSummary ||
      !salesProposal ||
      isGeneratingSalesEmail
    ) {
      return;
    }

    setIsGeneratingSalesEmail(true);
    setSalesEmail(null);
    setSalesEmailError(null);

    try {
      const response = await fetch("/api/sales-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company: {
            name: selectedCompany.name,
            industry: selectedCompany.industry,
            region: selectedCompany.region,
            employees: selectedCompany.employees,
            business: selectedCompany.business,
            challenge: selectedCompany.challenge,
            proposedService: selectedCompany.proposedService,
          },
          aiSummary,
          salesProposal,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate sales email.");
      }

      const data = (await response.json()) as Partial<SalesEmail>;

      if (!data.subject || !data.body) {
        throw new Error("Sales email is empty.");
      }

      setSalesEmail({
        subject: data.subject,
        body: data.body,
      });
    } catch {
      setSalesEmailError("営業メールの生成に失敗しました");
    } finally {
      setIsGeneratingSalesEmail(false);
    }
  }

  if (selectedCompany) {
    return (
      <main className="min-h-screen bg-white px-6 py-12 text-slate-900">
        <div className="mx-auto w-full max-w-3xl">
          <button
            type="button"
            onClick={handleBackToList}
            className="mb-5 h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            一覧に戻る
          </button>

          <section className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            <div className="border-b border-slate-200 pb-6">
              <p className="mb-2 text-sm font-medium text-slate-500">
                企業詳細
              </p>
              <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
                {selectedCompany.name}
              </h1>
            </div>

            <dl className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">業種</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">
                  {selectedCompany.industry}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">地域</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">
                  {selectedCompany.region}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">
                  従業員数
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-950">
                  {selectedCompany.employees}名
                </dd>
              </div>
            </dl>

            <div className="mt-8 space-y-6">
              <section>
                <h2 className="text-sm font-semibold text-slate-950">
                  事業内容
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedCompany.business}
                </p>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-slate-950">課題</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedCompany.challenge}
                </p>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-slate-950">
                  提案できるサービス
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedCompany.proposedService}
                </p>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-slate-950">
                  情報ソース
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedCompany.sourceLinks.map((sourceLink) => (
                    <a
                      key={sourceLink.type}
                      href={sourceLink.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {sourceLink.label}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {sourceLink.url}
                      </p>
                    </a>
                  ))}
                </div>
              </section>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-8">
              {isGeneratingSummary ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-medium text-slate-700">
                    AIが分析中です...
                  </p>
                </div>
              ) : aiSummary && salesProposal ? (
                <div>
                  <section>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-lg font-semibold text-slate-950">
                        AI要約
                      </h2>
                      <button
                        type="button"
                        onClick={handleGenerateSummary}
                        className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        再生成
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                      <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                        {aiSummary}
                      </p>
                    </div>
                  </section>

                  <section className="mt-6">
                    <h2 className="mb-4 text-lg font-semibold text-slate-950">
                      AI営業提案
                    </h2>

                    <div className="grid gap-4">
                      <div className="rounded-lg border border-slate-200 bg-white p-5">
                        <h3 className="text-sm font-semibold text-slate-950">
                          想定課題
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {salesProposal.assumedChallenges}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-5">
                        <h3 className="text-sm font-semibold text-slate-950">
                          営業切り口
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {salesProposal.salesAngle}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-5">
                        <h3 className="text-sm font-semibold text-slate-950">
                          初回提案文
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {salesProposal.firstProposal}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-5">
                        <h3 className="text-sm font-semibold text-slate-950">
                          架電トーク例
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {salesProposal.callTalkExample}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="mt-6 border-t border-slate-200 pt-6">
                    <h2 className="mb-4 text-lg font-semibold text-slate-950">
                      AI営業メール
                    </h2>

                    {isGeneratingSalesEmail ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-medium text-slate-700">
                          営業メールを作成中です...
                        </p>
                      </div>
                    ) : salesEmail ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-950">
                            件名
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {salesEmail.subject}
                          </p>
                        </div>

                        <div className="mt-5">
                          <h3 className="text-sm font-semibold text-slate-950">
                            本文
                          </h3>
                          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                            {salesEmail.body}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={handleGenerateSalesEmail}
                          className="h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
                        >
                          営業メールを生成
                        </button>
                        {salesEmailError ? (
                          <p className="mt-3 text-sm font-medium text-red-600">
                            {salesEmailError}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                    className="h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    AI要約を生成
                  </button>
                  {summaryError ? (
                    <p className="mt-3 text-sm font-medium text-red-600">
                      {summaryError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col justify-center">
        <section className="w-full rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <p className="mb-2 text-sm font-medium text-slate-500">
              BtoB Sales Research Assistant
            </p>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
              AI企業リサーチ
            </h1>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
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
                placeholder="例: 営業DX、採用強化、クラウド移行"
                className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-3">
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
                  defaultValue="全国"
                  className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  {regions.map((region) => (
                    <option key={region} value={region}>
                      {region}
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
                  defaultValue=""
                  className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">指定なし</option>
                  {industries.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="employees"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  従業員数以上
                </label>
                <input
                  id="employees"
                  name="employees"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="例: 100"
                  className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <button
              type="submit"
              className="h-12 w-full rounded-md bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
            >
              検索
            </button>
          </form>
        </section>

        {hasSearched ? (
          <section className="mt-6 w-full">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  企業一覧
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  条件に一致した候補企業 {companies.length}件
                </p>
              </div>
            </div>

            {companies.length > 0 ? (
              <div className="space-y-3">
                {companies.map((company) => (
                  <button
                    key={company.name}
                    type="button"
                    onClick={() => handleSelectCompany(company.id)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          {company.name}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {company.description}
                        </p>
                      </div>

                      <dl className="grid shrink-0 grid-cols-3 gap-3 text-sm md:w-72">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            業種
                          </dt>
                          <dd className="mt-1 font-medium text-slate-900">
                            {company.industry}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            地域
                          </dt>
                          <dd className="mt-1 font-medium text-slate-900">
                            {company.region}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            従業員数
                          </dt>
                          <dd className="mt-1 font-medium text-slate-900">
                            {company.employees}名
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-slate-600">
                  条件に合う企業が見つかりませんでした
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
