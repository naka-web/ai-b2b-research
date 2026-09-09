import { isCountry } from '@/services/overseas/countryProfiles';
import { canonicalWebsite } from '@/services/overseas/deduplication';
import { research } from '@/services/overseas/siteResearch';
export const runtime = 'nodejs';
export const maxDuration = 60;
let running = false;
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '同じサイトから実行してください' }, { status: 403 });
  if (running) return Response.json({ error: '海外調査を実行中です。終了後に再試行してください' }, { status: 429 });
  try {
    const body = await request.text(); if (body.length > 6000) return Response.json({ error: '入力が大きすぎます' }, { status: 413 });
    const input = JSON.parse(body);
    if (typeof input.id !== 'string' || input.id.length > 100 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || !isCountry(input.country) || typeof input.website !== 'string' || input.website.length > 2000) return Response.json({ error: '企業名・国・URLを確認してください' }, { status: 400 });
    const website = canonicalWebsite(input.website);
    running = true;
    try { return Response.json({ company: await research({ id: input.id, name: input.name.trim(), country: input.country, website }, input.refresh === true) }); }
    finally { running = false; }
  } catch { return Response.json({ error: '入力形式またはURLを確認してください' }, { status: 400 }); }
}
