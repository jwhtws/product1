import { createHash } from 'node:crypto';
import { parsePopupVenuePayload, SourceStructureChangedError } from '../parsers/popup-venue-parser.mjs';
import {
  discoveryAttempt, inspectOfficialDocument, officialUrl, recoveryMetadata
} from '../lib/official-source-discovery.mjs';

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
    detailPattern: /\/(?:store|event|program|news|display|contents?)\//u,
    seedUrls: [],
    fallbackUrls: ['https://www.amoremall.com/kr/ko/store/display?storeCode=001'],
    discoveryUrls: ['https://www.amoremall.com/robots.txt', 'https://www.amoremall.com/sitemap.xml'],
    allowedHosts: ['amore-seongsu.com', 'amoremall.com']
  },
  {
    id: 'ktng-sangsangmadang', name: 'KT&G 상상마당', venue: 'KT&G 상상마당', region: '전국',
    eventUrl: 'https://www.sangsangmadang.com/', marker: /상상마당/u,
    detailPattern: /\/(?:display|event|program|search)\/(?:detail\/\d+|[^?#]+)/u,
    seedUrls: ['https://www.sangsangmadang.com/display/detail/3099'],
    fallbackUrls: ['https://www.sangsangmadang.com/display', 'https://www.sangsangmadang.com/search?query=%ED%8C%9D%EC%97%85'],
    discoveryUrls: ['https://www.sangsangmadang.com/robots.txt', 'https://www.sangsangmadang.com/sitemap.xml'],
    allowedHosts: ['sangsangmadang.com']
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

function sourceItemId(sourceUrl) {
  const url = new URL(sourceUrl);
  const explicit = url.searchParams.get('idx') || url.searchParams.get('bIdx') || url.searchParams.get('contentId');
  return explicit || createHash('sha256').update(url.href).digest('hex').slice(0, 16);
}

export function extractPopupVenueItem(html, sourceUrl, { allowedHosts = [new URL(sourceUrl).hostname] } = {}) {
  const title = titleFrom(html);
  const description = clean(html);
  const dates = dateRange(description);
  const inspection = inspectOfficialDocument(html, sourceUrl, { allowedHosts });
  const menus = inspection.menuCandidates.map(menu => ({ ...menu, sourceUrl, sourceName: new URL(sourceUrl).hostname }));
  return {
    sourceItemId: sourceItemId(sourceUrl),
    title,
    description,
    startDate: dates?.startDate || '',
    endDate: dates?.endDate || '',
    sourceUrl,
    imageUrl: inspection.imageCandidates[0] || null,
    officialImageUrls: inspection.imageCandidates.slice(0, 12),
    menus,
    inspection
  };
}

function discoverDetailUrls(html, config) {
  const allowedHosts = config.allowedHosts || [new URL(config.eventUrl).hostname];
  const urls = new Set(config.seedUrls.map(value => officialUrl(value, config.eventUrl, allowedHosts)).filter(Boolean));
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const url = officialUrl(match[1], config.eventUrl, allowedHosts);
    if (url && config.detailPattern.test(url) && DISCOVERY_SIGNAL.test(`${clean(match[2])} ${url}`)) urls.add(url);
  }
  for (const match of String(html).matchAll(/["'](?:detailUrl|eventUrl|href|link|url)["']\s*:\s*["']([^"']+)["']/giu)) {
    const url = officialUrl(match[1], config.eventUrl, allowedHosts);
    const context = clean(String(html).slice(Math.max(0, match.index - 500), match.index + 500));
    if (url && config.detailPattern.test(url) && DISCOVERY_SIGNAL.test(`${context} ${url}`)) urls.add(url);
  }
  for (const match of String(html).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)) {
    const url = officialUrl(match[1], config.eventUrl, allowedHosts);
    if (url && config.detailPattern.test(url) && DISCOVERY_SIGNAL.test(url)) urls.add(url);
  }
  return [...urls].slice(0, 30);
}

export async function collectPopupVenue(config, { fetchHtml, fetchPage, today }) {
  if (config.suspendedReason) {
    return {
      rows: [],
      stats: { discoveredCount: 0, fetchedCount: 0, rejectionReasons: {}, duplicateSourceItemCount: 0 },
      sourceHealth: { status: 'unverified', message: config.suspendedReason, checkedAt: new Date().toISOString() }
    };
  }
  const allowedHosts = config.allowedHosts || [new URL(config.eventUrl).hostname];
  const paths = [...new Set([config.eventUrl, ...(config.fallbackUrls || []), ...(config.discoveryUrls || [])])];
  const attempts = [];
  const inspections = [];
  const documents = new Map();
  const load = async (url, method) => {
    try {
      const result = fetchPage ? await fetchPage(url) : { text: await fetchHtml(url), response: null, diagnostic: {} };
      const html = String(result.text || '');
      const inspection = inspectOfficialDocument(html, result.response?.url || url, { allowedHosts });
      documents.set(url, html); inspections.push(inspection);
      attempts.push(discoveryAttempt({ method, url, status: inspection.hasPopupSignal || inspection.detailUrls.length ? 'success' : 'empty', response: result.response, itemsFound: inspection.detailUrls.length, detail: { ...result.diagnostic, responseSize: Buffer.byteLength(html) } }));
      return html;
    } catch (error) {
      attempts.push(discoveryAttempt({ method, url, status: error?.name === 'BlockPageError' ? 'blocked' : 'failed', errorType: error?.errorType || error?.name || 'request_failed', detail: { ...error, timeout: Boolean(error?.timeout), retryCount: error?.retryCount || 0 } }));
      return '';
    }
  };
  for (const [index, url] of paths.entries()) {
    const method = index === 0 ? 'official_list_html' : /robots\.txt(?:\?|$)/iu.test(url) ? 'robots'
      : /sitemap/iu.test(url) ? 'sitemap' : 'official_fallback_html';
    await load(url, method);
  }
  const discoveredResources = [];
  for (const [url, html] of documents) {
    const inspection = inspectOfficialDocument(html, url, { allowedHosts });
    for (const candidate of inspection.apiCandidates.slice(0, 5)) discoveredResources.push({ url: candidate.url, method: 'official_api' });
    for (const candidate of inspection.sitemapCandidates.slice(0, 5)) discoveredResources.push({ url: candidate, method: 'sitemap' });
    for (const match of html.matchAll(/^\s*Sitemap:\s*(\S+)/gimu)) {
      const candidate = officialUrl(match[1], url, allowedHosts);
      if (candidate) discoveredResources.push({ url: candidate, method: 'sitemap' });
    }
  }
  for (const resource of [...new Map(discoveredResources.map(item => [item.url, item])).values()].slice(0, 10)) {
    if (!documents.has(resource.url)) await load(resource.url, resource.method);
  }
  const detailUrls = new Set(config.seedUrls.map(value => officialUrl(value, config.eventUrl, allowedHosts)).filter(Boolean));
  for (const [url, html] of documents) {
    for (const detailUrl of discoverDetailUrls(html, { ...config, eventUrl: url })) detailUrls.add(detailUrl);
    const inspection = inspectOfficialDocument(html, url, { allowedHosts });
    for (const detailUrl of inspection.detailUrls) if (config.detailPattern.test(detailUrl)) detailUrls.add(detailUrl);
  }
  const items = [];
  for (const url of detailUrls) {
    const html = documents.get(url) || await load(url, 'official_detail_html');
    if (!html) continue;
    const item = extractPopupVenueItem(html, url, { allowedHosts });
    inspections.push(item.inspection);
    items.push(item);
  }
  const parsed = parsePopupVenuePayload({
    sourceId: config.id,
    sourceName: config.name,
    venue: config.venue,
    region: config.region,
    items
  }, { today });
  const recovery = recoveryMetadata({
    sourceId: config.id, primaryPath: config.eventUrl, fallbackPaths: [...paths.slice(1), ...discoveredResources.map(item => item.url)], attempts,
    rows: parsed.rows, detailPagesChecked: detailUrls.size, inspection: inspections
  });
  return {
    ...parsed,
    sourceHealth: {
      ...parsed.sourceHealth, ...recovery,
      status: recovery.finalStatus,
      message: parsed.rows.length ? `${parsed.rows.length}건 파싱${recovery.recovered ? ' · fallback 복구' : ''}` : '공식 대체 경로 확인 후도 존재 여부 미확정'
    }
  };
}

export function createBatch3Collectors(options) {
  return BATCH3_POPUP_VENUES.map(config => [
    `팝업 전문 공간 · ${config.name}`,
    () => collectPopupVenue(config, options)
  ]);
}
