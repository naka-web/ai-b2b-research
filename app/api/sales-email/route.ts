import { NextResponse } from "next/server";

type Company = {
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
  primaryCategory?: string;
  categories?: string[];
  rating?: number;
  reviewCount?: number;
  businessStatus?: string;
};

type SalesProposal = {
  assumedChallenges?: string;
  salesAngle?: string;
  firstProposal?: string;
  callTalkExample?: string;
};

type SalesEmailPayload = {
  company?: Company;
  aiSummary?: string;
  salesProposal?: SalesProposal;
};

function buildSalesEmail(payload: SalesEmailPayload) {
  const company = payload.company;

  if (!company?.name || !payload.aiSummary || !payload.salesProposal) {
    return null;
  }

  const category =
    company.primaryCategory || company.categories?.[0] || "貴社事業";
  const reviewText =
    typeof company.reviewCount === "number"
      ? `Google上では${company.reviewCount}件の口コミが確認でき、地域のお客様との接点を大切にされている印象を受けました。`
      : "公開情報を拝見し、地域のお客様との接点づくりを大切にされている印象を受けました。";
  const websiteText = company.website
    ? "Webサイトの内容も踏まえると、問い合わせ導線や情報発信の面で改善余地を一緒に整理できるのではないかと感じております。"
    : "Webサイト情報は確認できなかったため、まずは現在の集客や問い合わせ対応の状況を伺えればと思っております。";
  const proposalText =
    payload.salesProposal.salesAngle ||
    "所在地・口コミ・Webサイトなどの公開情報をもとに分析し、問い合わせ増加や業務効率化につながる改善ポイントをご提案できればと考えております。";

  return {
    subject: `${company.name}様の集客・問い合わせ導線について`,
    body: `ご担当者様

突然のご連絡失礼いたします。
株式会社サンプルの営業担当です。

${company.name}様の公開情報を拝見し、${category}としての情報発信や問い合わせ導線についてご連絡いたしました。
${reviewText}
${websiteText}

${proposalText}

もし差し支えなければ、15〜30分ほど情報交換のお時間をいただけないでしょうか。
貴社の状況を伺ったうえで、まずは参考情報としてお話しできれば幸いです。

何卒よろしくお願いいたします。

株式会社サンプル
営業担当`,
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SalesEmailPayload;
    const result = buildSalesEmail(payload);

    if (!result) {
      return NextResponse.json(
        { error: "営業メール生成に必要な企業情報が不足しています。" },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "営業メールの生成に失敗しました。" },
      { status: 500 },
    );
  }
}
