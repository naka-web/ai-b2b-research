import { isCountry } from '@/services/overseas/countryProfiles';
import { findCompanyWebsiteCandidates } from '@/services/overseas/candidates/googlePlaces';
import { resolveTradeCandidateWebsite } from '@/services/overseas/candidates/websiteLookup';
import { research } from '@/services/overseas/siteResearch';

export const runtime = 'nodejs';
export const maxDuration = 60;
let active = 0;
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '同じサイトから実行してください。' }, { status: 403, headers });
  if (active >= 2) return Response.json({ error: '公式サイト候補検索は同時に2件までです。' }, { status: 429, headers });
  try {
    const text = await request.text(); if (text.length > 3500) return Response.json({ error: '入力が大きすぎます。' }, { status: 413, headers });
    const input = JSON.parse(text) as Record<string, unknown>;
    if (typeof input.companyName !== 'string' || !input.companyName.trim() || input.companyName.length > 200 || !isCountry(input.country) ||
      (input.candidateWebsiteUrl !== undefined && input.candidateWebsiteUrl !== null && (typeof input.candidateWebsiteUrl !== 'string' || input.candidateWebsiteUrl.length > 2000)))
      return Response.json({ error: '企業名・国・候補URLを確認してください。' }, { status: 400, headers });
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey && !input.candidateWebsiteUrl) return Response.json({ error: 'Google Places APIキー未設定です。' }, { status: 503, headers });
    active++;
    try {
      const companyName = input.companyName.trim(); const country = input.country;
      const value = await resolveTradeCandidateWebsite(
        { companyName, candidateWebsiteUrl: typeof input.candidateWebsiteUrl === 'string' ? input.candidateWebsiteUrl : null },
        () => findCompanyWebsiteCandidates(apiKey!, { companyName, country }),
        url => research({ id: `website-check:${crypto.randomUUID()}`, name: companyName, country, website: url }),
      );
      return Response.json(value, { headers });
    } finally { active--; }
  } catch { return Response.json({ error: '公式サイト候補検索に失敗しました。' }, { status: 400, headers }); }
}
