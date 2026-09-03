import { NextResponse } from "next/server";
import { enrichCompanies } from "@/services/companyEnrichmentService";
import type { CompanyEnrichmentCandidate } from "@/services/companyResearchTypes";

export const maxDuration = 60;

const MAX_COMPANIES_PER_REQUEST = 8;

function isCandidate(value: unknown): value is CompanyEnrichmentCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CompanyEnrichmentCandidate>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    (candidate.website === undefined || typeof candidate.website === "string")
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { companies?: unknown };
    if (!Array.isArray(payload.companies)) {
      return NextResponse.json({ error: "企業一覧が必要です。" }, { status: 400 });
    }
    if (payload.companies.length > MAX_COMPANIES_PER_REQUEST) {
      return NextResponse.json(
        { error: `1回に調査できる企業は${MAX_COMPANIES_PER_REQUEST}件までです。` },
        { status: 400 },
      );
    }

    const candidates = payload.companies
      .filter(isCandidate)
      .map((company) => ({
        id: company.id,
        name: company.name,
        website: company.website,
        primaryCategory: company.primaryCategory,
        categories: company.categories,
      }));

    if (candidates.length === 0 && payload.companies.length > 0) {
      return NextResponse.json({ error: "企業データが不正です。" }, { status: 400 });
    }

    return NextResponse.json({ results: await enrichCompanies(candidates) });
  } catch {
    return NextResponse.json(
      { error: "公式サイトの調査処理に失敗しました。" },
      { status: 500 },
    );
  }
}
