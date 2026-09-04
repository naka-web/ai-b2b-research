import { NextRequest, NextResponse } from "next/server";
import { searchFdaCompanies } from "@/services/fdaService";
import type { FdaDataType } from "@/services/fdaTypes";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const priorityValue = searchParams.get("priority");
  const priority = priorityValue === "1" || priorityValue === "2" || priorityValue === "3"
    ? priorityValue
    : "all";
  const requestedTypes = searchParams.getAll("dataType")
    .filter((value): value is FdaDataType => value === "Import Refusal" || value === "Food Recall");
  try {
    const result = await searchFdaCompanies({
      excludeChina: searchParams.get("excludeChina") !== "false",
      priority,
      dataTypes: requestedTypes,
    });
    if (result.warnings.length && !result.companies.length) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FDA search] ${message}`);
    return NextResponse.json({ error: "FDA公開情報の取得に失敗しました。" }, { status: 502 });
  }
}
