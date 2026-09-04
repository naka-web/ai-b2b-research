import { NextResponse } from "next/server";
import { researchFdaCompanies } from "@/services/fdaWebResearchService";
import type { FdaCompany } from "@/services/fdaTypes";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { companies?: FdaCompany[] };
    if (!Array.isArray(payload.companies) || !payload.companies.length) {
      return NextResponse.json({ error: "調査対象のFDA企業を選択してください。" }, { status: 400 });
    }
    if (payload.companies.length > 50) {
      return NextResponse.json({ error: "1回に調査できるFDA企業は50社までです。" }, { status: 400 });
    }
    const companies = payload.companies.filter((company) =>
      company && typeof company.id === "string" && typeof company.name === "string" && Array.isArray(company.records),
    );
    if (companies.length !== payload.companies.length) {
      return NextResponse.json({ error: "FDA企業データが不正です。" }, { status: 400 });
    }
    return NextResponse.json({ results: await researchFdaCompanies(companies) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FDA web research] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
