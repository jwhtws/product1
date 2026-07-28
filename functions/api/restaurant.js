const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';
const NAVER_LOCAL_SEARCH = 'https://openapi.naver.com/v1/search/local.json';
const NAVER_IMAGE_SEARCH = 'https://openapi.naver.com/v1/search/image';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const json = (data, status = 200, cache = `public, max-age=${THIRTY_DAYS}`) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache }
  });

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const address = (url.searchParams.get('address') || '').trim();
  if (!name || !address) return json({ error: 'name과 address가 필요합니다.' }, 400, 'no-store');
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/restaurant?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}&cache=v2`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const result = await fetchNaverPlace(context, name, address);
    if (result) {
      const outgoing = json(result, 200, result.photoUrl ? `public, max-age=${THIRTY_DAYS}` : 'public, max-age=86400');
      context.waitUntil(cache.put(cacheKey, outgoing.clone()));
      return outgoing;
    }
    if (!context.env.GOOGLE_PLACES_API_KEY) return json({ found: false, provider: 'naver' }, 404);
  }
  if (!context.env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 연결되지 않았습니다.' }, 503, 'no-store');
  }

  const result = await fetchGooglePlace(context, name, address);
  if (!result) return json({ found: false }, 404);
  const outgoing = json(result);
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}

const stripHtml = value => String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .trim();
const key = value => stripHtml(value).toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const addressCore = value => String(value || '').replace(/\s+/g, '').slice(0, 18);
const locality = value => {
  const tokens = String(value || '').split(/\s+/).filter(Boolean);
  const end = tokens.slice(0, 4).findLastIndex(token => /[시군구]$/.test(token));
  return tokens.slice(0, end >= 0 ? end + 1 : 2).join(' ');
};
const addressTokens = value => new Set(String(value || '')
  .normalize('NFKC')
  .replace(/[(),]/g, ' ')
  .split(/\s+/)
  .map(token => token.replace(/[^\p{L}\p{N}-]/gu, ''))
  .filter(Boolean));
const addressScore = (left, right) => {
  const leftTokens = addressTokens(left), rightTokens = addressTokens(right);
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += token.length >= 3 ? 2 : 1;
  return overlap;
};

async function fetchNaverPlace(context, name, address) {
  const headers = {
    'X-Naver-Client-Id': context.env.NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': context.env.NAVER_CLIENT_SECRET
  };
  const nameKey = key(name);
  const queries = [...new Set([`${name} ${locality(address)}`, name])];
  const items = [];
  for (const query of queries) {
    const localUrl = `${NAVER_LOCAL_SEARCH}?query=${encodeURIComponent(query)}&display=5&sort=random`;
    const localResponse = await fetch(localUrl, { headers });
    if (!localResponse.ok) continue;
    const localData = await localResponse.json();
    items.push(...(localData.items || []));
    if (items.some(item => key(item.title) === nameKey && addressScore(item.roadAddress || item.address, address) >= 5)) break;
  }
  const uniqueItems = [...new Map(items.map(item => [`${key(item.title)}|${key(item.roadAddress || item.address)}`, item])).values()];
  const candidates = uniqueItems.map(item => {
    const title = stripHtml(item.title);
    const titleKey = key(title);
    const candidateAddress = item.roadAddress || item.address || '';
    let score = titleKey === nameKey ? 100 : titleKey.includes(nameKey) || nameKey.includes(titleKey) ? 70 : 0;
    const overlap = addressScore(candidateAddress, address);
    if (addressCore(candidateAddress) === addressCore(address)) score += 100;
    else if (overlap >= 7) score += 80;
    else if (overlap >= 4) score += 45;
    return { item, title, score, overlap };
  }).sort((left, right) => right.score - left.score);
  const match = candidates[0];
  const foodCategory = /음식점|한식|중식|일식|양식|분식|카페|디저트|베이커리|술집|치킨|피자|햄버거|육류|고기|해산물|생선|국수|만두|요리/;
  if (!match || match.score < 115 || match.overlap < 4 || !foodCategory.test(match.item.category || '')) return null;

  const matchedAddress = match.item.roadAddress || match.item.address || address;
  const district = matchedAddress.split(/\s+/).slice(0, 3).join(' ');
  const imageQuery = `${match.title} ${district} 음식점`;
  let image = null;
  for (const filter of ['large', 'all']) {
    const imageResponse = await fetch(`${NAVER_IMAGE_SEARCH}?query=${encodeURIComponent(imageQuery)}&display=10&sort=sim&filter=${filter}`, { headers });
    if (!imageResponse.ok) continue;
    const imageData = await imageResponse.json();
    image = (imageData.items || []).find(item => {
      const titleKey = key(item.title);
      return titleKey.includes(nameKey) || nameKey.includes(titleKey);
    }) || imageData.items?.[0] || null;
    if (image) break;
  }
  return {
    found: true,
    provider: 'naver',
    displayName: match.title,
    formattedAddress: matchedAddress,
    photoUrl: image?.thumbnail || image?.link || null,
    photoSource: image?.link || null,
    photoSourceTitle: stripHtml(image?.title),
    category: match.item.category,
    naverPlaceUrl: match.item.link || `https://map.naver.com/p/search/${encodeURIComponent(matchedAddress)}`,
    priceLevel: null,
    priceRange: null,
    hours: [],
    phone: match.item.telephone || null,
    businessStatus: null,
    dineIn: null,
    goodForGroups: null,
    outdoorSeating: null,
    reservable: null
  };
}

async function fetchGooglePlace(context, name, address) {
  const response = await fetch(GOOGLE_TEXT_SEARCH, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': context.env.GOOGLE_PLACES_API_KEY,
      'x-goog-fieldmask': [
        'places.id', 'places.displayName', 'places.formattedAddress', 'places.photos',
        'places.priceLevel', 'places.priceRange', 'places.regularOpeningHours',
        'places.nationalPhoneNumber', 'places.websiteUri', 'places.googleMapsUri',
        'places.businessStatus', 'places.dineIn', 'places.goodForGroups',
        'places.outdoorSeating', 'places.reservable'
      ].join(',')
    },
    body: JSON.stringify({ textQuery: `${name} ${address}`, languageCode: 'ko', regionCode: 'KR', maxResultCount: 1 })
  });
  if (!response.ok) return null;

  const data = await response.json();
  const place = data.places?.[0];
  if (!place) return null;
  const photoName = place.photos?.[0]?.name;
  const priceRange = place.priceRange
    ? [place.priceRange.startPrice?.units, place.priceRange.endPrice?.units].filter(Boolean).map(Number).map(value => `${value.toLocaleString('ko-KR')}원`).join(' ~ ')
    : null;
  return {
    found: true,
    provider: 'google',
    placeId: place.id,
    displayName: place.displayName?.text,
    formattedAddress: place.formattedAddress,
    photoUrl: photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null,
    priceLevel: place.priceLevel?.replace('PRICE_LEVEL_', '').toLowerCase(),
    priceRange,
    hours: place.regularOpeningHours?.weekdayDescriptions || [],
    phone: place.nationalPhoneNumber,
    websiteUri: place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    businessStatus: place.businessStatus,
    dineIn: place.dineIn,
    goodForGroups: place.goodForGroups,
    outdoorSeating: place.outdoorSeating,
    reservable: place.reservable
  };
}
