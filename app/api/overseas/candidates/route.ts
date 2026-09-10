import { createGooglePlacesProvider, normalizeConditions } from '@/services/overseas/candidates/googlePlaces';
export const runtime = 'nodejs';
export const maxDuration = 30;
// No Places content is cached on disk or on the server. Only request control state is retained.
let running = false;
let nextSearchAt = 0;
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: '同じサイトから実行してください。' }, { status: 403, headers });
  let conditions;
  try {
    const text = await request.text();
    if (text.length > 2000) return Response.json({ error: '検索条件が大きすぎます。' }, { status: 413, headers });
    conditions = normalizeConditions(JSON.parse(text));
  } catch { return Response.json({ error: '選択国の検索語を1〜3個選択してください。件数上限は30件です。' }, { status: 400, headers }); }
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return Response.json({ error: 'Google Places APIキー未設定です。候補は未確認です。' }, { status: 503, headers });
  if (running || Date.now() < nextSearchAt) return Response.json({ error: '連続検索を抑制しています。表示済み候補を利用するか、30秒後にお試しください。' }, { status: 429, headers: { ...headers, 'Retry-After': '30' } });
  running = true;
  nextSearchAt = Date.now() + 30_000;
  try { return Response.json(await createGooglePlacesProvider(key).search(conditions), { headers }); }
  finally { running = false; }
}
