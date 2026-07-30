const VWORLD_ADDRESS = 'https://api.vworld.kr/req/address';
const VWORLD_DATA = 'https://api.vworld.kr/req/data';
const CACHE_SECONDS = 60 * 60 * 24 * 30;

const json = (data, status = 200, cache = `public, max-age=${CACHE_SECONDS}`) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'access-control-allow-origin': '*'
    }
  });

const cleanAddress = value => String(value || '')
  .normalize('NFKC')
  .split(',')[0]
  .replace(/\s*\([^)]*\)\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const vworldHeaders = domain => ({
  accept: 'application/json',
  origin: `https://${domain}`,
  referer: `https://${domain}/`,
  'user-agent': 'Mozilla/5.0 (compatible; Mukdang/1.0; +https://mukdang.com)'
});

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const address = cleanAddress(url.searchParams.get('address'));
  if (!address) return json({ error: 'address가 필요합니다.' }, 400, 'no-store');
  if (!context.env.VWORLD_API_KEY) {
    return json({ error: 'VWORLD_API_KEY가 연결되지 않았습니다.' }, 503, 'no-store');
  }

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/building?address=${encodeURIComponent(address)}&cache=v1`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const vworldDomain = context.env.VWORLD_DOMAIN || 'mukdang.com';
    const point = await geocode(address, context.env.VWORLD_API_KEY, vworldDomain);
    if (!point) return json({ found: false, reason: 'geocode' }, 404, 'public, max-age=86400');
    const feature = await findBuilding(point, context.env.VWORLD_API_KEY, vworldDomain);
    if (!feature) return json({ found: false, point, reason: 'building' }, 404, 'public, max-age=86400');

    const properties = feature.properties || {};
    const result = {
      found: true,
      point,
      geometry: feature.geometry,
      building: {
        name: pick(properties, ['bld_nm', 'bild_nm', '건물명']),
        use: pick(properties, ['bld_us', 'bld_us_nm', 'main_prpos_code_nm', '건축물용도명']),
        structure: pick(properties, ['bld_strct', 'strct_nm', '건축물구조명']),
        areaM2: number(pick(properties, ['bld_ar', 'bldg_ar', '건축물면적'])),
        totalAreaM2: number(pick(properties, ['totar', 'tot_area', '연면적'])),
        landAreaM2: number(pick(properties, ['plat_area', '대지면적'])),
        heightM: number(pick(properties, ['bld_hg', 'height', '건물높이'])),
        floorsAbove: number(pick(properties, ['grnd_flr', 'ground_flr', '지상층수'])),
        floorsBelow: number(pick(properties, ['und_flr', 'underground_flr', '지하층수'])),
        approvalDate: pick(properties, ['use_aprv_ymd', 'useapr_day', '사용승인일자'])
      },
      source: 'VWorld GIS건물통합정보'
    };
    const outgoing = json(result);
    context.waitUntil(cache.put(cacheKey, outgoing.clone()));
    return outgoing;
  } catch (error) {
    return json({ error: 'VWorld 조회에 실패했습니다.', detail: String(error?.message || error) }, 502, 'no-store');
  }
}

async function geocode(address, key, domain) {
  let lastError = '';
  for (const type of ['road', 'parcel']) {
    const params = new URLSearchParams({
      service: 'address',
      request: 'getCoord',
      version: '2.0',
      crs: 'EPSG:4326',
      address,
      refine: 'true',
      simple: 'false',
      format: 'json',
      type,
      key,
      domain
    });
    const response = await fetch(`${VWORLD_ADDRESS}?${params}`, { headers: vworldHeaders(domain) });
    if (!response.ok) {
      lastError = `HTTP ${response.status}`;
      continue;
    }
    const data = await response.json();
    const point = data?.response?.result?.point;
    if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
      return { x: Number(point.x), y: Number(point.y) };
    }
    const status = data?.response?.status;
    const error = data?.response?.error;
    if (status === 'ERROR' || error) {
      lastError = [error?.code, error?.text].filter(Boolean).join(': ') || 'ERROR';
    }
  }
  if (lastError) throw new Error(`VWorld geocode: ${lastError}`);
  return null;
}

async function findBuilding(point, key, domain) {
  for (const buffer of [3, 12, 30]) {
    const params = new URLSearchParams({
      service: 'data',
      request: 'GetFeature',
      data: 'LT_C_BLDGINFO',
      key,
      domain,
      format: 'json',
      crs: 'EPSG:4326',
      geomFilter: `POINT(${point.x} ${point.y})`,
      buffer: String(buffer),
      size: '10',
      page: '1'
    });
    const response = await fetch(`${VWORLD_DATA}?${params}`, { headers: vworldHeaders(domain) });
    if (!response.ok) continue;
    const data = await response.json();
    const features = data?.response?.result?.featureCollection?.features || [];
    if (features.length) return nearest(features, point);
  }
  return null;
}

function nearest(features, point) {
  return features
    .map(feature => ({ feature, distance: centroidDistance(feature.geometry, point) }))
    .sort((left, right) => left.distance - right.distance)[0]?.feature || null;
}

function centroidDistance(geometry, point) {
  const coordinates = geometry?.type === 'MultiPolygon'
    ? geometry.coordinates?.flat(2)
    : geometry?.coordinates?.flat(1);
  if (!coordinates?.length) return Number.POSITIVE_INFINITY;
  const valid = coordinates.filter(pair => Array.isArray(pair) && pair.length >= 2);
  if (!valid.length) return Number.POSITIVE_INFINITY;
  const center = valid.reduce((sum, pair) => [sum[0] + Number(pair[0]), sum[1] + Number(pair[1])], [0, 0])
    .map(value => value / valid.length);
  return Math.hypot(center[0] - point.x, center[1] - point.y);
}

function pick(properties, names) {
  const entries = Object.entries(properties);
  for (const name of names) {
    const exact = properties[name];
    if (exact !== undefined && exact !== null && exact !== '') return exact;
    const matched = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (matched && matched[1] !== '') return matched[1];
  }
  return null;
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
