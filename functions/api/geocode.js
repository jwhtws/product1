const VWORLD_ADDRESS = 'https://api.vworld.kr/req/address';
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const json = (data, status = 200, cache = `public, max-age=${CACHE_SECONDS}`) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, 'access-control-allow-origin': '*' } });
const cleanAddress = value => String(value || '').normalize('NFKC').split('·')[0].split(',')[0].replace(/\s*\([^)]*\)\s*/gu, ' ').replace(/\s+/gu, ' ').trim();

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const address = cleanAddress(requestUrl.searchParams.get('address'));
  const name = String(requestUrl.searchParams.get('name') || '').trim();
  if (!address) return json({ error: 'address가 필요합니다.' }, 400, 'no-store');
  if (!context.env.VWORLD_API_KEY) return json({ error: '지도 API가 연결되지 않았습니다.' }, 503, 'no-store');
  const cache = caches.default;
  const cacheKey = new Request(`${requestUrl.origin}/api/geocode?address=${encodeURIComponent(address)}&name=${encodeURIComponent(name)}&cache=v2`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const domain = context.env.VWORLD_DOMAIN || 'mukdang.com';
  for (const type of ['road', 'parcel']) {
    const params = new URLSearchParams({ service: 'address', request: 'getCoord', version: '2.0', crs: 'EPSG:4326', address, refine: 'true', simple: 'false', format: 'json', type, key: context.env.VWORLD_API_KEY, domain });
    const response = await fetch(`${VWORLD_ADDRESS}?${params}`, { headers: { accept: 'application/json', origin: `https://${domain}`, referer: `https://${domain}/` } });
    if (!response.ok) continue;
    const point = (await response.json())?.response?.result?.point;
    if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) continue;
    const outgoing = json({ latitude: Number(point.y), longitude: Number(point.x), provider: 'VWorld' });
    context.waitUntil(cache.put(cacheKey, outgoing.clone()));
    return outgoing;
  }
  if (context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(name || address)}&display=5`, { headers: { 'X-Naver-Client-Id': context.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': context.env.NAVER_CLIENT_SECRET } });
    if (response.ok) {
      const item = (await response.json()).items?.find(row => row.mapx && row.mapy);
      const longitude = Number(item?.mapx) / 10000000;
      const latitude = Number(item?.mapy) / 10000000;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const outgoing = json({ latitude, longitude, provider: 'Naver Local' });
        context.waitUntil(cache.put(cacheKey, outgoing.clone()));
        return outgoing;
      }
    }
  }
  return json({ found: false }, 404, 'public, max-age=86400');
}
