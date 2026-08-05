import { detailFields, parseBatch3VenuePayload, SourceStructureChangedError } from '../parsers/batch3-venue-parser.mjs';

const ALLOWED_HOST = 'www.timessquare.co.kr';
const CANDIDATE = /\/(?:event|events|promotion|popup|news|culture|magazine)(?:\/|\?|$)/iu;
const EXCLUDED = /(?:privacy|policy|terms|login|member|store|brand|floor|parking)/iu;

export function parseSitemapDocument(xml, sourceUrl) {
  const text = String(xml || '');
  const type = /<sitemapindex\b/iu.test(text) ? 'index' : /<urlset\b/iu.test(text) ? 'urlset' : 'unknown';
  if (type === 'unknown') throw new SourceStructureChangedError('times-square', 'sitemapindex/urlset 루트가 없습니다');
  const urls = [];
  for (const match of text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)) {
    try {
      const url = new URL(match[1].replace(/&amp;/giu, '&'), sourceUrl);
      if (url.protocol === 'https:' && url.hostname === ALLOWED_HOST) urls.push(url.href);
    } catch {}
  }
  return { type, urls: [...new Set(urls)] };
}

export async function collectTimesSquareSitemap({ fetchText, today, maxSitemaps = 80, maxCandidateUrls = 120 }) {
  const queue = ['https://www.timessquare.co.kr/sitemap.xml'];
  const visited = new Set();
  const candidates = new Set();
  const adapterRejections = {};
  let urlsetCount = 0;
  while (queue.length && visited.size < maxSitemaps) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    let parsed;
    try {
      parsed = parseSitemapDocument(await fetchText(url), url);
    } catch (error) {
      if (url === 'https://www.timessquare.co.kr/sitemap.xml') throw error;
      const reason = error instanceof SourceStructureChangedError ? 'child_sitemap_structure_changed' : 'child_sitemap_fetch_failed';
      adapterRejections[reason] = (adapterRejections[reason] || 0) + 1;
      continue;
    }
    if (parsed.type === 'index') {
      for (const child of parsed.urls) if (!visited.has(child) && queue.length < maxSitemaps) queue.push(child);
    } else {
      urlsetCount += 1;
      for (const detailUrl of parsed.urls) if (CANDIDATE.test(detailUrl) && !EXCLUDED.test(detailUrl) && candidates.size < maxCandidateUrls) candidates.add(detailUrl);
    }
  }
  const items = [];
  for (const sourceUrl of candidates) {
    const detail = detailFields(await fetchText(sourceUrl), sourceUrl);
    const sourceItemId = new URL(sourceUrl).searchParams.get('id') || new URL(sourceUrl).pathname.replace(/\/+$/u, '').split('/').at(-1);
    items.push({ sourceItemId, ...detail, sourceUrl, venue: '타임스퀘어', branch: '타임스퀘어', address: '서울특별시 영등포구 영중로 15' });
  }
  const result = parseBatch3VenuePayload({ sourceId: 'times-square', sourceName: '타임스퀘어 공식 사이트맵', venue: '타임스퀘어', venueType: '쇼핑몰', items, fetchedCount: visited.size + candidates.size }, { today });
  for (const [reason, count] of Object.entries(adapterRejections)) result.stats.rejectionReasons[reason] = count;
  if (!urlsetCount) result.sourceHealth = { status: 'source_structure_changed', message: 'sitemap index의 유효한 일반 sitemap이 없음', checkedAt: new Date().toISOString() };
  return result;
}
