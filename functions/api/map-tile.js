const TILE_CACHE_SECONDS = 60 * 60 * 24 * 30;
const error = (message, status) => new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const z = Number(url.searchParams.get('z'));
  const x = Number(url.searchParams.get('x'));
  const y = Number(url.searchParams.get('y'));
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return error('잘못된 지도 타일 좌표입니다.', 400);
  if (!context.env.VWORLD_API_KEY) return error('지도 API가 연결되지 않았습니다.', 503);
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/map-tile?z=${z}&x=${x}&y=${y}&cache=v1`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const upstream = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(context.env.VWORLD_API_KEY)}/Base/${z}/${y}/${x}.png`);
  if (!upstream.ok) return error('지도 타일을 불러오지 못했습니다.', upstream.status);
  const response = new Response(upstream.body, { headers: { 'content-type': upstream.headers.get('content-type') || 'image/png', 'cache-control': `public, max-age=${TILE_CACHE_SECONDS}`, 'access-control-allow-origin': '*' } });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
