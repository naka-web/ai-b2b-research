import { NextResponse } from "next/server";

type CompanyPayload = {
  name?: string;
  industry?: string;
  region?: string;
  employees?: number;
  business?: string;
  challenge?: string;
  proposedService?: string;
};

type SalesProposal = {
  assumedChallenges: string;
  salesAngle: string;
  firstProposal: string;
  callTalkExample: string;
};

type SummarizeResult = {
  summary: string;
  salesProposal: SalesProposal;
};

function extractOutputText(response: unknown) {
  if (
    typeof response === "object" &&
    response !== null &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  if (
    typeof response === "object" &&
    response !== null &&
    "output" in response &&
    Array.isArray(response.output)
  ) {
    return response.output
      .flatMap((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "content" in item &&
          Array.isArray(item.content)
        ) {
          return item.content;
        }

        return [];
      })
      .map((content) => {
        if (
          typeof content === "object" &&
          content !== null &&
          "text" in content &&
          typeof content.text === "string"
        ) {
          return content.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function parseSummarizeResult(text: string): SummarizeResult | null {
  try {
    const parsed = JSON.parse(text) as Partial<SummarizeResult>;

    if (
      typeof parsed.summary === "string" &&
      typeof parsed.salesProposal === "object" &&
      parsed.salesProposal !== null &&
      typeof parsed.salesProposal.assumedChallenges === "string" &&
      typeof parsed.salesProposal.salesAngle === "string" &&
      typeof parsed.salesProposal.firstProposal === "string" &&
      typeof parsed.salesProposal.callTalkExample === "string"
    ) {
      return {
        summary: parsed.summary,
        salesProposal: {
          assumedChallenges: parsed.salesProposal.assumedChallenges,
          salesAngle: parsed.salesProposal.salesAngle,
          firstProposal: parsed.salesProposal.firstProposal,
          callTalkExample: parsed.salesProposal.callTalkExample,
        },
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const company = (await request.json()) as CompanyPayload;
    const requiredFields: Array<keyof CompanyPayload> = [
      "name",
      "industry",
      "region",
      "employees",
      "business",
      "challenge",
      "proposedService",
    ];

    const hasMissingField = requiredFields.some((field) => !company[field]);

    if (hasMissingField) {
      return NextResponse.json(
        { error: "Required company fields are missing." },
        { status: 400 },
      );
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "developer",
            content:
              "あなたはBtoB営業担当者向けの企業リサーチアシスタントです。入力された企業情報だけを使い、日本語で簡潔に要約と営業提案を作成してください。事実と推測を混同せず、推測は想定として表現してください。出力は必ずJSONのみで、Markdownやコードフェンスは含めないでください。",
          },
          {
            role: "user",
            content: `以下の企業情報を営業担当者向けに要約し、営業提案を作成してください。

企業名: ${company.name}
業種: ${company.industry}
地域: ${company.region}
従業員数: ${company.employees}名
事業内容: ${company.business}
課題: ${company.challenge}
提案できるサービス: ${company.proposedService}

出力JSON形式:
{
  "summary": "企業概要、強みや課題、提案候補を含む営業担当者向けの要約文",
  "salesProposal": {
    "assumedChallenges": "想定課題",
    "salesAngle": "営業切り口",
    "firstProposal": "初回提案文",
    "callTalkExample": "架電トーク例"
  }
}`,
          },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      return NextResponse.json(
        { error: "OpenAI API request failed." },
        { status: 502 },
      );
    }

    const data = await openAiResponse.json();
    const outputText = extractOutputText(data);
    const result = parseSummarizeResult(outputText);

    if (!result) {
      return NextResponse.json(
        { error: "OpenAI API returned an invalid summary." },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate summary." },
      { status: 500 },
    );
  }
}
