import { isCountry } from '@/services/overseas/countryProfiles';
import { canonicalWebsite } from '@/services/overseas/deduplication';
import { normalizeTradeSourceEvidence } from '@/services/overseas/candidates/tradeData';
import { research } from '@/services/overseas/siteResearch';
import { generateEvidenceSummaries } from '@/services/overseas/evidenceSummary';
import { applyScreening } from '@/services/overseas/candidates/screening';
export const runtime = 'nodejs';
export const maxDuration = 60;
let active = 0;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '同じサイトから実行してください' }, { status: 403 });
  if (active >= 2) return Response.json({ error: '海外調査は同時に2件までです。終了後に再試行してください' }, { status: 429 });
  try {
    const body = await request.text(); if (body.length > 20_000) return Response.json({ error: '入力が大きすぎます' }, { status: 413 });
    const input = JSON.parse(body);
    if (typeof input.id !== 'string' || input.id.length > 100 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || !isCountry(input.country) || typeof input.website !== 'string' || input.website.length > 2000) return Response.json({ error: '企業名・国・URLを確認してください' }, { status: 400 });
    const website = canonicalWebsite(input.website);
    const discoveryEvidence = input.discoveryEvidence === undefined ? undefined :
      Array.isArray(input.discoveryEvidence) && input.discoveryEvidence.length <= 20 ? input.discoveryEvidence.map(normalizeTradeSourceEvidence) : (() => { throw new Error('HS / Trade根拠を確認してください'); })();
    active++;
    try {
      let company = await research({ id: input.id, name: input.name.trim(), country: input.country, website, discoveryEvidence }, input.refresh === true);
      const generated = await generateEvidenceSummaries(company, { apiKey: process.env.OPENAI_API_KEY });
      company.evidenceSummaries = generated.summaries; company.evidenceSummaryRequests = generated.apiRequests; company.evidenceSummaryVersion = '1';
      if (input.screening === true) company = applyScreening(company);
      return Response.json({ company });
    }
    finally { active--; }
  } catch { return Response.json({ error: '入力形式またはURLを確認してください' }, { status: 400 }); }
}
