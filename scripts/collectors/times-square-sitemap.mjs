import { detailFields, parseBatch3VenuePayload, SourceStructureChangedError } from '../parsers/batch3-venue-parser.mjs';
import { discoveryAttempt, inspectOfficialDocument, officialUrl, recoveryMetadata, stableDiscoveryId } from '../lib/official-source-discovery.mjs';

const ALLOWED_HOSTS = ['timessquare.co.kr'];
const ROOT = 'https://www.timessquare.co.kr/';
const PRIMARY_SITEMAP = `${ROOT}sitemap.xml`;
const ROBOTS = `${ROOT}robots.txt`;
const LIFERAY_EVENT_SITEMAP = `${PRIMARY_SITEMAP}?p_l_id=894&layoutUuid=event`;
const CANDIDATE = /\/(?:event|events|promotion|popup|news|culture|magazine)(?:\/|\?|$)/iu;
const EXCLUDED = /(?:privacy|policy|terms|login|member|store|brand|floor|parking)/iu;
export const isCandidateUrl = value => {
  try { const { pathname } = new URL(value); return CANDIDATE.test(pathname) && !EXCLUDED.test(pathname); }
  catch { return false; }
};

export function parseSitemapDocument(xml, sourceUrl) {
  const text = String(xml || '');
  const type = /<sitemapindex\b/iu.test(text) ? 'index' : /<urlset\b/iu.test(text) ? 'urlset' : 'unknown';
  if (type === 'unknown') throw new SourceStructureChangedError('times-square', 'sitemapindex/urlset 루트가 없습니다');
  const urls = [];
  for (const match of text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)) {
    const url = officialUrl(match[1].replace(/&amp;/giu, '&'), sourceUrl, ALLOWED_HOSTS);
    if (url) urls.push(url);
  }
  return { type, urls: [...new Set(urls)] };
}

export async function collectTimesSquareSitemap({ fetchText, fetchPage, today, maxSitemaps = 80, maxCandidateUrls = 120 }) {
  const attempts = [];
  const inspections = [];
  const adapterRejections = {};
  const loaded = new Map();
  const load = async (url, method) => {
    if (loaded.has(url)) return loaded.get(url);
    try {
      const xmlResource = method === 'sitemap' || method === 'robots';
      const result = fetchPage ? await fetchPage(url, xmlResource ? { headers: {
        accept: 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5',
        'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)'
      } } : {}) : { text: await fetchText(url), response: null, diagnostic: {} };
      const value = { text: result.text, response: result.response, diagnostic: result.diagnostic || {} };
      loaded.set(url, value);
      return value;
    } catch (error) {
      attempts.push(discoveryAttempt({ method, url, status: error?.name === 'BlockPageError' ? 'blocked' : 'failed', errorType: error?.errorType || error?.name || 'request_failed', detail: { ...error, timeout: Boolean(error?.timeout), retryCount: error?.retryCount || 0 } }));
      loaded.set(url, null);
      return null;
    }
  };

  // Root HTML is inspected first for an official JSON API or embedded state.
  const root = await load(ROOT, 'official_list_html');
  const candidates = new Set();
  const sitemapQueue = [PRIMARY_SITEMAP];
  if (root) {
    const inspection = inspectOfficialDocument(root.text, ROOT, { allowedHosts: ALLOWED_HOSTS });
    inspections.push(inspection);
    attempts.push(discoveryAttempt({ method: inspection.structuredData.length ? 'embedded_json' : 'official_list_html', url: ROOT, status: inspection.hasPopupSignal || inspection.detailUrls.length ? 'success' : 'empty', response: root.response, itemsFound: inspection.detailUrls.length, detail: { ...root.diagnostic, responseSize: Buffer.byteLength(root.text) } }));
    for (const url of inspection.detailUrls) if (isCandidateUrl(url)) candidates.add(url);
    for (const url of inspection.sitemapCandidates) sitemapQueue.push(url);
    for (const api of inspection.apiCandidates.slice(0, 10)) {
      const resource = await load(api.url, 'official_api');
      if (!resource) continue;
      const apiInspection = inspectOfficialDocument(resource.text, api.url, { allowedHosts: ALLOWED_HOSTS });
      inspections.push(apiInspection);
      attempts.push(discoveryAttempt({ method: 'official_api', url: api.url, status: apiInspection.hasPopupSignal ? 'success' : 'empty', response: resource.response, itemsFound: apiInspection.detailUrls.length, detail: { ...resource.diagnostic, responseSize: Buffer.byteLength(resource.text) } }));
      for (const url of apiInspection.detailUrls) if (isCandidateUrl(url)) candidates.add(url);
    }
  }

  const robots = await load(ROBOTS, 'robots');
  if (robots) {
    const urls = [...robots.text.matchAll(/^\s*Sitemap:\s*(\S+)/gimu)].map(match => officialUrl(match[1], ROBOTS, ALLOWED_HOSTS)).filter(Boolean);
    sitemapQueue.push(...urls);
    attempts.push(discoveryAttempt({ method: 'robots', url: ROBOTS, status: 'success', response: robots.response, itemsFound: urls.length, detail: { ...robots.diagnostic, responseSize: Buffer.byteLength(robots.text) } }));
  }
  sitemapQueue.push(LIFERAY_EVENT_SITEMAP);

  const visited = new Set();
  let validUrlsets = 0;
  while (sitemapQueue.length && visited.size < maxSitemaps) {
    const url = sitemapQueue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const resource = await load(url, 'sitemap');
    if (!resource) continue;
    try {
      const parsed = parseSitemapDocument(resource.text, url);
      attempts.push(discoveryAttempt({ method: 'sitemap', url, status: 'success', response: resource.response, itemsFound: parsed.urls.length, detail: { ...resource.diagnostic, responseSize: Buffer.byteLength(resource.text) } }));
      if (parsed.type === 'index') {
        for (const child of parsed.urls) if (!visited.has(child)) sitemapQueue.push(child);
      } else {
        validUrlsets += 1;
        for (const detailUrl of parsed.urls) if (isCandidateUrl(detailUrl) && candidates.size < maxCandidateUrls) candidates.add(detailUrl);
      }
    } catch (error) {
      attempts.push(discoveryAttempt({ method: 'sitemap', url, status: 'structure_changed', response: resource.response, errorType: error.name, detail: { ...resource.diagnostic, responseSize: Buffer.byteLength(resource.text) } }));
      adapterRejections.sitemap_structure_changed = (adapterRejections.sitemap_structure_changed || 0) + 1;
    }
  }

  const items = [];
  for (const sourceUrl of [...candidates].slice(0, maxCandidateUrls)) {
    const detail = await load(sourceUrl, 'official_detail_html');
    if (!detail) continue;
    const inspection = inspectOfficialDocument(detail.text, sourceUrl, { allowedHosts: ALLOWED_HOSTS });
    inspections.push(inspection);
    const fields = detailFields(detail.text, sourceUrl);
    const hasRequired = Boolean(fields.title && fields.startDate);
    attempts.push(discoveryAttempt({ method: 'official_detail_html', url: sourceUrl, status: hasRequired ? 'success' : (inspection.hasPopupSignal ? 'parse_failed' : 'empty'), response: detail.response, itemsFound: hasRequired ? 1 : 0, errorType: hasRequired ? null : (inspection.hasPopupSignal ? 'required_fields_not_extracted' : null), detail: { ...detail.diagnostic, responseSize: Buffer.byteLength(detail.text) } }));
    items.push({
      sourceItemId: new URL(sourceUrl).searchParams.get('id') || new URL(sourceUrl).pathname.replace(/\/+$/u, '').split('/').at(-1) || stableDiscoveryId(sourceUrl),
      ...fields, sourceUrl, venue: '타임스퀘어', branch: '타임스퀘어', address: '서울특별시 영등포구 영중로 15',
      imageUrl: inspection.imageCandidates[0] || fields.imageUrl,
      officialImageUrls: inspection.imageCandidates.slice(0, 12), menus: inspection.menuCandidates
    });
  }
  const parsed = parseBatch3VenuePayload({ sourceId: 'times-square', sourceName: '타임스퀘어 공식 사이트', venue: '타임스퀘어', venueType: '쇼핑몰', items, fetchedCount: loaded.size }, { today });
  for (const [reason, count] of Object.entries(adapterRejections)) parsed.stats.rejectionReasons[reason] = count;
  const hasVerifiedEmptyEvidence = !parsed.rows.length && validUrlsets > 0 && !candidates.size
    && attempts.every(attempt => !['failed', 'blocked', 'structure_changed', 'parse_failed'].includes(attempt.status));
  const recovery = recoveryMetadata({ sourceId: 'times-square', primaryPath: PRIMARY_SITEMAP, fallbackPaths: [ROOT, ROBOTS, LIFERAY_EVENT_SITEMAP, ...visited].filter(url => url !== PRIMARY_SITEMAP), attempts, rows: parsed.rows, detailPagesChecked: candidates.size, inspection: inspections, verifiedEmptyEvidence: hasVerifiedEmptyEvidence });
  return { ...parsed, sourceHealth: { ...parsed.sourceHealth, ...recovery, candidateUrls: [...candidates], status: recovery.finalStatus, message: parsed.rows.length ? `${parsed.rows.length}건 파싱${recovery.recovered ? ' · fallback 복구' : ''}` : recovery.finalStatus === 'verified_empty' ? '공식 목록과 sitemap에 현재 행사 없음' : '공식 대체 경로 확인 후도 존재 여부 미확정' } };
}
