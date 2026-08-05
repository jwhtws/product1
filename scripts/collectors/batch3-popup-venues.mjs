import { createHash } from 'node:crypto';
import { parsePopupVenuePayload, SourceStructureChangedError } from '../parsers/popup-venue-parser.mjs';

export const BATCH3_POPUP_VENUES = Object.freeze([
  {
    id: 'culture-station-seoul-284', name: '문화역서울284', venue: '문화역서울284', region: '서울특별시',
    eventUrl: 'https://www.seoul284.org/', marker: /문화역서울284/u,
    detailPattern: /\/program\/view\//u,
    seedUrls: ['https://www.seoul284.org/program/view/category/319/state/2/menu/328?idx=372']
  },
  {
    id: 'oil-tank-culture-park', name: '문화비축기지', venue: '문화비축기지', region: '서울특별시',
    eventUrl: 'https://parks.seoul.go.kr/content.do?key=2604300014', marker: /문화비축기지/u,
    detailPattern: /\/story\/news\/detailView\.do/u,
    seedUrls: ['https://parks.seoul.go.kr/story/news/detailView.do?bIdx=3328']
  },
  {
    id: 'nodeul-island', name: '노들섬', venue: '노들섬', region: '서울특별시',
    eventUrl: 'https://nodeul.org/program/', marker: /노들섬/u,
    detailPattern: /nodeul\.org\/(?:program\/|[^?#]+푸드[^?#]*\/)/u,
    seedUrls: ['https://nodeul.org/%EB%85%B8%EB%93%A4%EC%84%AC-%ED%91%B8%EB%93%9C%ED%8A%B8%EB%9F%AD-%EC%9A%B4%EC%98%81-%EC%95%88%EB%82%B42026%EB%85%84-58%EC%9B%94/']
  },
  {
    id: 'piknic', name: '피크닉', venue: '피크닉', region: '서울특별시',
    eventUrl: 'https://www.piknic.kr/home/', marker: /Piknic|피크닉/iu,
    detailPattern: /piknic\.kr\/(?:exhibition|program|event)\//iu,
    seedUrls: []
  },
  {
    id: 'amore-seongsu', name: '아모레성수', venue: '아모레성수', region: '서울특별시',
    eventUrl: 'https://www.amore-seongsu.com/', marker: /아모레성수/u,
    detailPattern: /\/store\/(?:news|display)/u,
    seedUrls: []
  },
  {
    id: 'ktng-sangsangmadang', name: 'KT&G 상상마당', venue: 'KT&G 상상마당', region: '전국',
    eventUrl: 'https://www.sangsangmadang.com/', marker: /상상마당/u,
    detailPattern: /\/display\/detail\/\d+/u,
    seedUrls: ['https://www.sangsangmadang.com/display/detail/3099']
  },
  {
    id: 'hyundai-card-storage', name: '현대카드 STORAGE', venue: '현대카드 STORAGE', region: '서울특별시',
    eventUrl: 'https://dive.hyundaicard.com/web/culture/culture.hdc?curatorId=7&filterPlaceSpace=7', marker: /STORAGE|스토리지/iu,
    detailPattern: /\/web\/content\/contentView\.hdc/u,
    seedUrls: [],
    suspendedReason: '공식 공간이 리노베이션 임시 휴관 중이며 실행 환경에서 공식 도메인의 구형 TLS를 검증할 수 없음'
  },
  {
    id: 'seoul-forest-community-center', name: '서울숲 커뮤니티센터', venue: '서울숲 커뮤니티센터', region: '서울특별시',
    eventUrl: 'https://seoulforest.or.kr/', marker: /서울숲/u,
    detailPattern: /seoulforest\.or\.kr\/(?:event|program|\d{4}\/\d{2})/u,
    seedUrls: []
  }
]);

const decode = value => String(value || '')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&quot;|&#34;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&lt;/giu, '<')
  .replace(/&gt;/giu, '>');
const clean = value => decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const DISCOVERY_SIGNAL = /(팝업|POP[\s-]*UP|푸드|먹거리|디저트|베이커리|커피|카페|음료|마켓)/iu;

function titleFrom(html) {
  return clean(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/iu)?.[1]
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/iu)?.[1]
    || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]);
}

function dateRange(text) {
  const normalized = clean(text).replace(/[()]/gu, ' ');
  const match = normalized.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?[^\d]{0,20}(?:~|∼|〜|–|—|부터|to)[^\d]{0,20}(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/iu);
  if (!match) return null;
  const startYear = match[1];
  let endYear = match[4] || startYear;
  if (!match[4] && Number(match[5]) < Number(match[2])) endYear = String(Number(startYear) + 1);
  return {
    startDate: `${startYear}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`,
    endDate: `${endYear}-${String(match[5]).padStart(2, '0')}-${String(match[6]).padStart(2, '0')}`
  };
}

function imageFrom(html, sourceUrl) {
  const raw = decode(html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/iu)?.[1] || '');
  try { return raw ? new URL(raw, sourceUrl).href : null; } catch { return null; }
}

function sourceItemId(sourceUrl) {
  const url = new URL(sourceUrl);
  const explicit = url.searchParams.get('idx') || url.searchParams.get('bIdx') || url.searchParams.get('contentId');
  return explicit || createHash('sha256').update(url.href).digest('hex').slice(0, 16);
}

export function extractPopupVenueItem(html, sourceUrl) {
  const title = titleFrom(html);
  const description = clean(html);
  const dates = dateRange(description);
  return {
    sourceItemId: sourceItemId(sourceUrl),
    title,
    description,
    startDate: dates?.startDate || '',
    endDate: dates?.endDate || '',
    sourceUrl,
    imageUrl: imageFrom(html, sourceUrl)
  };
}

function discoverDetailUrls(html, config) {
  const officialHost = new URL(config.eventUrl).hostname.replace(/^www\./u, '');
  const isOfficial = value => {
    try { return new URL(value, config.eventUrl).hostname.replace(/^www\./u, '') === officialHost; } catch { return false; }
  };
  const urls = new Set(config.seedUrls.filter(isOfficial));
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    try {
      const url = new URL(decode(match[1]), config.eventUrl);
      if (url.protocol === 'https:' && isOfficial(url.href) && config.detailPattern.test(url.href) && DISCOVERY_SIGNAL.test(clean(match[2]))) urls.add(url.href);
    } catch {}
  }
  return [...urls].slice(0, 30);
}

export async function collectPopupVenue(config, { fetchHtml, today }) {
  if (config.suspendedReason) {
    return {
      rows: [],
      stats: { discoveredCount: 0, fetchedCount: 0, rejectionReasons: {}, duplicateSourceItemCount: 0 },
      sourceHealth: { status: 'unverified', message: config.suspendedReason, checkedAt: new Date().toISOString() }
    };
  }
  const indexHtml = await fetchHtml(config.eventUrl);
  if (!config.marker.test(clean(indexHtml))) {
    throw new SourceStructureChangedError(config.id, '공식 목록 페이지 식별자가 없습니다');
  }
  const detailUrls = discoverDetailUrls(indexHtml, config);
  const items = [];
  for (const url of detailUrls) {
    const html = url === config.eventUrl ? indexHtml : await fetchHtml(url);
    items.push(extractPopupVenueItem(html, url));
  }
  return parsePopupVenuePayload({
    sourceId: config.id,
    sourceName: config.name,
    venue: config.venue,
    region: config.region,
    items
  }, { today });
}

export function createBatch3Collectors(options) {
  return BATCH3_POPUP_VENUES.map(config => [
    `팝업 전문 공간 · ${config.name}`,
    () => collectPopupVenue(config, options)
  ]);
}
