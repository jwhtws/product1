const VWORLD_ADDRESS = 'https://api.vworld.kr/req/address';
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const json = (data, status = 200, cache = `public, max-age=${CACHE_SECONDS}`) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache, 'access-control-allow-origin': '*' } });
export const cleanAddress = value => String(value || '').normalize('NFKC').split('·')[0].replace(/\s*\([^)]*\)\s*/gu, ' ').split(',')[0].replace(/\s+/gu, ' ').trim();
const cleanText = value => String(value || '').replace(/<[^>]*>/gu, '').normalize('NFKC').replace(/[^가-힣a-z0-9]/giu, '').toLowerCase();
const addressTokens = value => String(value || '').normalize('NFKC').replace(/[(),·]/gu, ' ').split(/\s+/u).filter(token => token.length >= 2);
const venueAliases = new Map([
  ['롯데백화점 군산점', '롯데몰 군산점'],
  ['롯데백화점 은평점', '롯데몰 은평점'],
  ['롯데백화점 수지점', '롯데몰 수지점'],
  ['롯데백화점 광교점', '롯데아울렛 광교점']
]);

export function selectNaverItem(items, name, address) {
  const expectedName = cleanText(venueAliases.get(name) || name);
  const expectedTokens = addressTokens(address);
  const expectedRegion = expectedTokens[0] || '';
  const ranked = (items || []).filter(item => item?.mapx && item?.mapy).map(item => {
    const candidateName = cleanText(item.title);
    const candidateAddress = `${item.roadAddress || ''} ${item.address || ''}`;
    const overlap = expectedTokens.filter(token => candidateAddress.includes(token)).length;
    const nameExact = Boolean(expectedName && candidateName === expectedName);
    const nameMatch = Boolean(expectedName && (candidateName.includes(expectedName) || expectedName.includes(candidateName)));
    const regionMismatch = expectedRegion && /(?:특별시|광역시|특별자치|도|시|군|구)$/u.test(expectedRegion) && !candidateAddress.includes(expectedRegion);
    return { item, score: Number(nameExact) * 200 + Number(nameMatch) * 100 + overlap * 20 - Number(regionMismatch) * 300, nameMatch, overlap, regionMismatch };
  }).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  return best && !best.regionMismatch && (best.nameMatch || best.overlap >= 2) ? best.item : null;
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const address = cleanAddress(requestUrl.searchParams.get('address'));
  const name = String(requestUrl.searchParams.get('name') || '').trim();
  const query = String(requestUrl.searchParams.get('query') || '').trim();
  if (!address && !query) return json({ error: 'address 또는 query가 필요합니다.' }, 400, 'no-store');
  if (!context.env.VWORLD_API_KEY && !context.env.NAVER_CLIENT_ID) return json({ error: '지도 API가 연결되지 않았습니다.' }, 503, 'no-store');
  const cache = caches.default;
  const cacheKey = new Request(`${requestUrl.origin}/api/geocode?address=${encodeURIComponent(address)}&name=${encodeURIComponent(name)}&query=${encodeURIComponent(query)}&cache=v4`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const domain = context.env.VWORLD_DOMAIN || 'mukdang.com';
  if (query && context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`, { headers: { 'X-Naver-Client-Id': context.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': context.env.NAVER_CLIENT_SECRET } });
    if (response.ok) {
      const item = ((await response.json()).items || []).find(candidate => candidate?.mapx && candidate?.mapy);
      const longitude = Number(item?.mapx) / 10000000;
      const latitude = Number(item?.mapy) / 10000000;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const outgoing = json({ latitude, longitude, provider: 'Naver Local', label: String(item.title || query).replace(/<[^>]*>/gu, ''), address: item.roadAddress || item.address || '' });
        context.waitUntil(cache.put(cacheKey, outgoing.clone()));
        return outgoing;
      }
    }
  }
  if (!context.env.VWORLD_API_KEY) return json({ found: false }, 404, 'public, max-age=86400');
  const lookupAddress = address || cleanAddress(query);
  for (const type of ['ROAD', 'PARCEL']) {
    const params = new URLSearchParams({ service: 'address', request: 'getCoord', version: '2.0', crs: 'EPSG:4326', address: lookupAddress, refine: 'true', simple: 'false', format: 'json', type, key: context.env.VWORLD_API_KEY, domain });
    const response = await fetch(`${VWORLD_ADDRESS}?${params}`, { headers: { accept: 'application/json', origin: `https://${domain}`, referer: `https://${domain}/` } });
    if (!response.ok) continue;
    const point = (await response.json())?.response?.result?.point;
    if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) continue;
    const outgoing = json({ latitude: Number(point.y), longitude: Number(point.x), provider: 'VWorld' });
    context.waitUntil(cache.put(cacheKey, outgoing.clone()));
    return outgoing;
  }
  if (context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const searchName = venueAliases.get(name) || name;
    const queries = [...new Set([`${searchName} ${address}`, searchName, address].filter(Boolean))];
    const items = [];
    for (const query of queries) {
      const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`, { headers: { 'X-Naver-Client-Id': context.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': context.env.NAVER_CLIENT_SECRET } });
      if (response.ok) items.push(...((await response.json()).items || []));
    }
    const item = selectNaverItem(items, name, address);
    if (item) {
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
