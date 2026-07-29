const NAVER_LOCAL_SEARCH = 'https://openapi.naver.com/v1/search/local.json';
const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';
const FOOD_CATEGORY = /음식점|한식|중식|일식|양식|분식|카페|디저트|베이커리|술집|치킨|피자|햄버거|육류|고기|해산물|생선|국수|만두|요리/;
const ONE_DAY = 60 * 60 * 24;

const json = (data, status = 200, cache = `public, max-age=${ONE_DAY}`) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache }
  });
const stripHtml = value => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') || '').normalize('NFKC').trim().slice(0, 60);
  if (query.length < 2) return json({ results: [] }, 200, 'no-store');

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/search?q=${encodeURIComponent(query)}&cache=v1`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let results = [];
  let provider = '';
  if (context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const response = await fetch(`${NAVER_LOCAL_SEARCH}?query=${encodeURIComponent(query)}&display=10&sort=random`, {
      headers: {
        'X-Naver-Client-Id': context.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': context.env.NAVER_CLIENT_SECRET
      }
    });
    if (response.ok) {
      const data = await response.json();
      results = (data.items || []).filter(item => FOOD_CATEGORY.test(item.category || '')).map(item => ({
        id: `naver-${item.mapx || ''}-${item.mapy || ''}`,
        name: stripHtml(item.title),
        category: item.category || '음식점',
        address: item.roadAddress || item.address || '',
        phone: item.telephone || '',
        permitDate: '',
        permitDateSource: '',
        placeDataSource: '네이버 지역검색',
        placeSourceUrl: item.link || ''
      }));
      provider = 'naver';
    }
  }

  if (!results.length && context.env.GOOGLE_PLACES_API_KEY) {
    const response = await fetch(GOOGLE_TEXT_SEARCH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': context.env.GOOGLE_PLACES_API_KEY,
        'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.googleMapsUri'
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'ko', regionCode: 'KR', maxResultCount: 10 })
    });
    if (response.ok) {
      const data = await response.json();
      results = (data.places || []).map(place => ({
        id: `google-${place.id}`,
        name: place.displayName?.text || query,
        category: place.primaryTypeDisplayName?.text || '음식점',
        address: place.formattedAddress || '',
        phone: place.nationalPhoneNumber || '',
        permitDate: '',
        permitDateSource: '',
        placeDataSource: 'Google Places',
        placeSourceUrl: place.googleMapsUri || ''
      }));
      provider = 'google';
    }
  }

  const outgoing = json({ provider, results });
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}
