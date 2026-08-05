import { createHash } from 'node:crypto';
import { parseBrandNewsroomPayload, SourceStructureChangedError } from '../parsers/brand-newsroom-parser.mjs';

export const BATCH4_BRAND_SOURCES = Object.freeze([
  {
    id: 'cj-cheiljedang-newsroom', name: 'CJ제일제당 뉴스룸', brand: 'CJ제일제당',
    eventUrl: 'https://newsroom.cj.net/', marker: /CJ NEWSROOM/iu,
    detailPattern: /^\/(?!category\/|in-the-news\/|medialibrary\/|our-company\/|contact-us\/|terms-of-use\/|privacy-notice\/|cookies-notice\/?$)[^/?#]+\/?$/u,
    contentMarker: /CJ제일제당|CheilJedang/iu
  },
  {
    id: 'samyang-foods-newsroom', name: '삼양식품 미디어', brand: '삼양식품',
    eventUrl: 'https://www.samyangfoods.com/kor/publicity/press/list.do', marker: /삼양소식|전체뉴스/u,
    detailPattern: /^\/kor\/publicity\/press\/view\.do/u, onclickView: true
  },
  {
    id: 'orion-newsroom', name: '오리온 뉴스룸', brand: '오리온',
    eventUrl: 'https://www.orionworld.com/board/list/87', marker: /보도자료/u,
    detailPattern: /^\/board\/view\/87/u
  },
  {
    id: 'ediya-news', name: '이디야커피 뉴스', brand: '이디야커피',
    eventUrl: 'https://www.ediya.com/contents/notice.html', marker: /EDIYA COFFEE|공지사항/u,
    detailPattern: /^\/contents\/(?:notice|event)\.html\?.*\bbbs_section=view\b/u
  },
  {
    id: 'pulmuone-newsroom', name: '풀무원 뉴스룸', brand: '풀무원',
    eventUrl: 'https://news.pulmuone.co.kr/pulmuone/newsroom/listPulmuone.do?menu=311', marker: /풀무원뉴스|기업뉴스/u,
    detailPattern: /^\/pulmuone\/newsroom\/viewNewsroom\.do/u
  },
  {
    id: 'kyochon-news', name: '교촌치킨 소식', brand: '교촌치킨',
    eventUrl: 'https://www.kyochonfnb.com/prcenter/news.do', marker: /STORY|홍보센터/u,
    detailPattern: /^\/prcenter\/view_news\.do/u
  },
  {
    id: 'ottogi-newsroom', name: '오뚜기 뉴스룸', brand: '오뚜기', kind: 'otoki-api',
    eventUrl: 'https://www.otoki.com/pr/news',
    apiUrl: 'https://www.otoki.com/pr/otgnews_list_json?sword=%ED%8C%9D%EC%97%85&pageIndex=1'
  },
  {
    id: 'gongcha-news', name: '공차코리아 이벤트', brand: '공차', kind: 'gongcha-list',
    eventUrl: 'https://www.gong-cha.co.kr/brand/content/eventlist?keyword=%ED%8C%9D%EC%97%85&page=1&scroll=y',
    marker: /Event\s*&\s*Notice|이벤트/iu
  },
  {
    id: 'dongwon-fnb-news', name: '동원F&B 뉴스', brand: '동원F&B',
    eventUrl: 'https://www.dongwonfnb.com/services/Customer/News/News_List', marker: /뉴스\s*&\s*공지사항|새로운 소식/iu,
    detailPattern: /^\/services\/Customer\/News\/News_View\?contentno=\d+$/u,
    listRequest: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'pageno=1&categoryD1=&period=&startdt=&enddt=&keyword=%ED%8C%9D%EC%97%85'
    }
  }
]);

const decode = value => String(value || '')
  .replace(/&nbsp;?|&#160;?/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&quot;|&#34;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&lt;/giu, '<')
  .replace(/&gt;/giu, '>');
const clean = value => decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const POPUP = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?)/iu;

function officialUrl(value, config) {
  try {
    const url = new URL(decode(value), config.eventUrl);
    const expected = new URL(config.eventUrl).hostname.replace(/^www\./u, '');
    return url.protocol === 'https:' && url.hostname.replace(/^www\./u, '') === expected ? url : null;
  } catch { return null; }
}

export function discoverBrandDetailUrls(html, config) {
  const urls = new Set();
  for (const match of String(html).matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const context = clean(`${match[1]} ${match[3]} ${match[4]}`);
    if (!POPUP.test(context)) continue;
    const url = officialUrl(match[2], config);
    if (url && config.detailPattern.test(`${url.pathname}${url.search}`)) urls.add(url.href);
  }
  for (const block of String(html).matchAll(/<(?:li|article|tr)\b[^>]*>[\s\S]*?<\/(?:li|article|tr)>/giu)) {
    if (!POPUP.test(clean(block[0]))) continue;
    const href = block[0].match(/href=["']([^"']+)["']/iu)?.[1];
    const url = href && officialUrl(href, config);
    if (url && config.detailPattern.test(`${url.pathname}${url.search}`)) urls.add(url.href);
  }
  if (config.onclickView) {
    for (const match of String(html).matchAll(/<a\b[^>]*onclick=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/giu)) {
      const sequence = match[2].match(/fnView\([^,]+,\s*(\d+)\)/u)?.[1];
      if (!sequence || !POPUP.test(clean(match[3]))) continue;
      const url = new URL(`./view.do?seq=${sequence}`, config.eventUrl);
      urls.add(url.href);
    }
  }
  return [...urls].slice(0, 20);
}

function referenceDate(value) {
  const match = String(value || '').match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/u);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
}

function dateRange(value, reference = '') {
  const text = clean(value).replace(/[()]/gu, ' ');
  const match = text.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*일)?[^\d]{0,24}(?:~|∼|〜|–|—|부터|to)[^\d]{0,24}(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/iu);
  if (match) {
    let endYear = match[4] || match[1];
    if (!match[4] && Number(match[5]) < Number(match[2])) endYear = String(Number(match[1]) + 1);
    return {
      startDate: `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`,
      endDate: `${endYear}-${String(match[5]).padStart(2, '0')}-${String(match[6]).padStart(2, '0')}`
    };
  }
  const base = referenceDate(reference);
  if (!base) return null;
  const year = Number(base.slice(0, 4));
  const partial = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*부터[^\d]{0,24}(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?\s*까지/iu);
  if (partial) {
    const endMonth = Number(partial[3] || partial[1]);
    const endYear = endMonth < Number(partial[1]) ? year + 1 : year;
    return {
      startDate: `${year}-${String(partial[1]).padStart(2, '0')}-${String(partial[2]).padStart(2, '0')}`,
      endDate: `${endYear}-${String(endMonth).padStart(2, '0')}-${String(partial[4]).padStart(2, '0')}`
    };
  }
  const endOnly = text.match(/(?:오는\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*까지/iu);
  if (endOnly) {
    let endYear = year;
    if (Number(endOnly[1]) < Number(base.slice(5, 7))) endYear += 1;
    return { startDate: base, endDate: `${endYear}-${String(endOnly[1]).padStart(2, '0')}-${String(endOnly[2]).padStart(2, '0')}` };
  }
  const dayOnly = text.match(/(?:오는\s*)?(\d{1,2})\s*일?\s*까지/iu);
  return dayOnly ? { startDate: base, endDate: `${base.slice(0, 8)}${String(dayOnly[1]).padStart(2, '0')}` } : null;
}

function meta(html, key) {
  return decode(html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'iu'))?.[1]
    || html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'iu'))?.[1]);
}

function sourceItemId(sourceUrl) {
  const url = new URL(sourceUrl);
  for (const key of ['id', 'seq', 'boardno', 'idx', 'storyEsgUid']) {
    if (url.searchParams.get(key)) return url.searchParams.get(key);
  }
  return createHash('sha256').update(url.href).digest('hex').slice(0, 16);
}

export function extractBrandNewsItem(html, sourceUrl, config) {
  const description = clean(html);
  const title = clean(meta(html, 'og:title')
    || html.match(/<span\b[^>]*class=["'][^"']*boardTit[^"']*["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1]
    || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]
    || html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/iu)?.[1]
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]);
  const publishedAt = clean(html.match(/<span\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1]);
  const dates = dateRange(description, publishedAt);
  const venue = clean(description.match(/(?:장소|위치|운영\s*장소)\s*[:：]\s*([^|·]{2,80}?)(?=\s+(?:기간|일시|운영|주소|문의)\s*[:：]|$)/u)?.[1]
    || description.match(/에\s*위치한\s*([^,.]{2,50}?)(?:에서|에\s)/u)?.[1]
    || description.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|일본)\s*[^,.]{1,65}?)(?:에서|에 위치한[^,.]{0,20}?에서)/u)?.[1]);
  const address = clean(description.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣\s\d-]{4,80}(?:로|길)\s*\d+(?:-\d+)?)/u)?.[1]);
  const rawImage = meta(html, 'og:image');
  let imageUrl = null;
  try { imageUrl = rawImage ? new URL(rawImage, sourceUrl).href : null; } catch {}
  return {
    sourceItemId: sourceItemId(sourceUrl), title, brand: config.brand, description,
    brandVerified: config.contentMarker ? config.contentMarker.test(description) : true,
    venue, address: address || venue, startDate: dates?.startDate || '', endDate: dates?.endDate || '',
    sourceUrl, imageUrl
  };
}

function otokiVenue(description) {
  return clean(description.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s*[^,.]{1,70}?)(?:에서|내\s*[^,.]{0,25}?팝업\s*매장에서)/u)?.[1]
    || description.match(/(?:복합\s*식문화\s*공간|복합문화공간)\s*[‘'"]([^’'"]+)[’'"]/u)?.[1]);
}

function otokiItem(item, config) {
  const description = clean(item.boardContent);
  const dates = dateRange(description, item.regDate);
  const sourceUrl = new URL(`/pr/news-detail?page=1&idx=${encodeURIComponent(item.idx)}`, config.eventUrl).href;
  let imageUrl = null;
  try { imageUrl = item.listImagePath ? new URL(item.listImagePath, config.eventUrl).href : null; } catch {}
  return {
    sourceItemId: String(item.idx || ''), title: clean(item.boardTitle), brand: config.brand,
    description, brandVerified: /오뚜기|OTOKI/iu.test(description), venue: otokiVenue(description),
    address: otokiVenue(description), startDate: dates?.startDate || '', endDate: dates?.endDate || '',
    sourceUrl, imageUrl
  };
}

export async function collectOtokiNewsroom(config, { fetchJson, today }) {
  if (typeof fetchJson !== 'function') throw new TypeError('오뚜기 collector에 fetchJson이 필요합니다');
  const first = await fetchJson(config.apiUrl);
  if (Number(first?.code) !== 0 || !Array.isArray(first?.data) || !Number.isFinite(Number(first?.itemsCount))) {
    throw new SourceStructureChangedError(config.id, '공식 뉴스 JSON 필수 구조가 없습니다');
  }
  const pages = [first];
  const pageCount = Math.min(5, Math.ceil(Number(first.itemsCount) / Math.max(1, first.data.length)));
  for (let page = 2; page <= pageCount; page += 1) {
    const url = new URL(config.apiUrl);
    url.searchParams.set('pageIndex', String(page));
    const payload = await fetchJson(url.href);
    if (Number(payload?.code) !== 0 || !Array.isArray(payload?.data)) {
      throw new SourceStructureChangedError(config.id, `공식 뉴스 JSON ${page}페이지 구조가 없습니다`);
    }
    pages.push(payload);
  }
  const items = pages.flatMap(payload => payload.data).map(item => otokiItem(item, config));
  const result = parseBrandNewsroomPayload({ sourceId: config.id, sourceName: config.name, brand: config.brand, items }, { today });
  result.stats.fetchedCount = pages.length;
  return result;
}

export function extractGongchaItems(html, config) {
  const text = clean(html);
  if (!config.marker.test(text) || !/class=["'][^"']*event-list/u.test(String(html))) {
    throw new SourceStructureChangedError(config.id, '공식 이벤트 목록 식별자가 없습니다');
  }
  const items = [];
  for (const block of String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)) {
    const title = clean(block[1].match(/<p\b[^>]*class=["'][^"']*t1[^"']*["'][^>]*>([\s\S]*?)<\/p>/iu)?.[1]);
    if (!POPUP.test(title)) continue;
    const dates = dateRange(clean(block[1]));
    const branchMatches = [...title.matchAll(/([가-힣A-Za-z0-9]+점)(?=\s|$)/giu)];
    const venue = clean(branchMatches.at(-1)?.[1] || title.match(/([가-힣A-Za-z0-9]+)\s*팝업/iu)?.[1]);
    const rawImage = block[1].match(/<img\b[^>]*src=["']([^"']+)["']/iu)?.[1];
    let imageUrl = null;
    try { imageUrl = rawImage ? new URL(rawImage, config.eventUrl).href : null; } catch {}
    const sourceItemId = createHash('sha256').update(`${title}|${dates?.startDate || ''}|${dates?.endDate || ''}`).digest('hex').slice(0, 16);
    items.push({
      sourceItemId, title, brand: config.brand, description: `${title} 공차 커피 음료`, brandVerified: true,
      venue, address: venue, startDate: dates?.startDate || '', endDate: dates?.endDate || '',
      sourceUrl: `${config.eventUrl}#event-${sourceItemId}`, imageUrl
    });
  }
  return items;
}

export async function collectGongchaEvents(config, { fetchHtml, today }) {
  const html = await fetchHtml(config.eventUrl);
  const items = extractGongchaItems(html, config);
  const result = parseBrandNewsroomPayload({ sourceId: config.id, sourceName: config.name, brand: config.brand, items }, { today });
  result.stats.fetchedCount = 1;
  return result;
}

export async function collectBrandNewsroom(config, { fetchHtml, today }) {
  const listHtml = await fetchHtml(config.eventUrl, config.listRequest);
  if (!config.marker.test(clean(listHtml))) {
    throw new SourceStructureChangedError(config.id, '공식 뉴스 목록 식별자가 없습니다');
  }
  const detailUrls = discoverBrandDetailUrls(listHtml, config);
  const items = [];
  for (const url of detailUrls) items.push(extractBrandNewsItem(await fetchHtml(url), url, config));
  const result = parseBrandNewsroomPayload({
    sourceId: config.id, sourceName: config.name, brand: config.brand, items
  }, { today });
  result.stats.fetchedCount = 1 + detailUrls.length;
  return result;
}

export function createBatch4BrandCollectors(options) {
  return BATCH4_BRAND_SOURCES.map(config => [
    `브랜드 공식 · ${config.name}`,
    () => config.kind === 'otoki-api' ? collectOtokiNewsroom(config, options)
      : config.kind === 'gongcha-list' ? collectGongchaEvents(config, options)
        : collectBrandNewsroom(config, options)
  ]);
}
