const GOOGLE_TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';

const json = (data, status = 200, cache = 'public, max-age=86400') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache }
  });

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = (url.searchParams.get('name') || '').trim();
  const address = (url.searchParams.get('address') || '').trim();
  if (!name || !address) return json({ error: 'name과 address가 필요합니다.' }, 400, 'no-store');
  if (!context.env.GOOGLE_PLACES_API_KEY) {
    return json({ error: 'GOOGLE_PLACES_API_KEY가 연결되지 않았습니다.' }, 503, 'no-store');
  }

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/restaurant?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

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
  if (!response.ok) return json({ error: '장소 제공자 응답 오류' }, response.status, 'no-store');

  const data = await response.json();
  const place = data.places?.[0];
  if (!place) return json({ found: false }, 404);
  const photoName = place.photos?.[0]?.name;
  const priceRange = place.priceRange
    ? [place.priceRange.startPrice?.units, place.priceRange.endPrice?.units].filter(Boolean).map(Number).map(value => `${value.toLocaleString('ko-KR')}원`).join(' ~ ')
    : null;
  const result = {
    found: true,
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
  const outgoing = json(result);
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}
