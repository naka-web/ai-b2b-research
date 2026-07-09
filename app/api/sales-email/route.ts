import { NextResponse } from "next/server";

type SalesProposal = {
  assumedChallenges?: string;
  salesAngle?: string;
  firstProposal?: string;
  callTalkExample?: string;
};

type SalesEmailPayload = {
  company?: {
    name?: string;
    industry?: string;
    region?: string;
    employees?: number;
    business?: string;
    challenge?: string;
    proposedService?: string;
  };
  aiSummary?: string;
  salesProposal?: SalesProposal;
};

type SalesEmailResult = {
  subject: string;
  body: string;
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

function parseSalesEmailResult(text: string): SalesEmailResult | null {
  try {
    const parsed = JSON.parse(text) as Partial<SalesEmailResult>;

    if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
      return {
        subject: parsed.subject,
        body: parsed.body,
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

    const payload = (await request.json()) as SalesEmailPayload;
    const company = payload.company;

    if (
      !company?.name ||
      !company.industry ||
      !company.region ||
      !company.business ||
      !company.challenge ||
      !company.proposedService ||
      !payload.aiSummary ||
      !payload.salesProposal
    ) {
      return NextResponse.json(
        { error: "Required sales email fields are missing." },
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
              "あなたはBtoB営業メールの作成に強い営業支援アシスタントです。入力された企業情報、AI要約、AI営業提案だけを使い、丁寧で自然な初回営業メールを日本語で作成してください。宛名は必ず「ご担当者様」にしてください。出力は必ずJSONのみで、Markdownやコードフェンスは含めないでください。",
          },
          {
            role: "user",
            content: `以下の情報をもとに、BtoB向けの初回営業メールを作成してください。

企業名: ${company.name}
業種: ${company.industry}
地域: ${company.region}
従業員数: ${company.employees ?? "不明"}名
事業内容: ${company.business}
課題: ${company.challenge}
提案できるサービス: ${company.proposedService}

AI要約:
${payload.aiSummary}

AI営業提案:
想定課題: ${payload.salesProposal.assumedChallenges ?? ""}
営業切り口: ${payload.salesProposal.salesAngle ?? ""}
初回提案文: ${payload.salesProposal.firstProposal ?? ""}
架電トーク例: ${payload.salesProposal.callTalkExample ?? ""}

条件:
- 件名は短く具体的にしてください
- 本文は「ご担当者様」から始めてください
- 丁寧なBtoB営業メールにしてください
- 押し売り感を避け、15〜30分の情報交換を自然に打診してください
- 署名は「株式会社サンプル 営業担当」で構いません

出力JSON形式:
{
  "subject": "件名",
  "body": "本文"
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
    const result = parseSalesEmailResult(outputText);

    if (!result) {
      return NextResponse.json(
        { error: "OpenAI API returned an invalid sales email." },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate sales email." },
      { status: 500 },
    );
  }
}
