import { NextResponse } from "next/server";
import { companyService } from "@/services/companyService";
import { CompanySearchParams } from "@/services/companyTypes";

export async function POST(request: Request) {
  try {
    const params = (await request.json()) as CompanySearchParams;
    const companies = await companyService.searchCompanies(params);

    return NextResponse.json({ companies });
  } catch {
    return NextResponse.json(
      { error: "Failed to search companies." },
      { status: 500 },
    );
  }
}
