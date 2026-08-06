import { createHash } from 'node:crypto';
import { extractOfficialMenuCandidates } from './popup-content-quality.mjs';

export const DISCOVERY_STATUSES = Object.freeze([
  'success_with_items', 'verified_empty', 'recovered', 'request_failed', 'blocked',
  'structure_changed', 'parse_failed', 'search_incomplete', 'unresolved'
]);

const SIGNAL = /(팝업|POP[\s-]*UP|푸드|먹거리|디저트|베이커리|커피|카페|음료|마켓|F&B)/iu;
const DETAIL_PATH = /(?:event|events|promotion|program|display|news|popup|culture|magazine|board|article|contents?|story)/iu;
const IMAGE_ATTRIBUTE = /(?:src|data-src|data-original|data-lazy-src|poster)=["']([^"']+)["']/giu;
const JSON_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu;
const API_LITERAL = /(?:fetch\s*\(|axios(?:\.(?:get|post|request))?\s*\(|(?:apiUrl|apiEndpoint|endpoint|requestUrl)\s*[:=]\s*)\s*["'`]([^"'`]+)["'`]/giu;
const SECRET_KEY = /(token|secret|key|api[-_]?key|authorization|cookie|session|password|credential)/iu;

const decode = value => String(value || '').replace(/&amp;/giu, '&').replace(/&quot;|&#34;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/\\\//gu, '/');
const clean = value => decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const uniq = values => [...new Set(values.filter(Boolean))];

export function sanitizeDiscoveryUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    for (const key of [...url.searchParams.keys()]) if (SECRET_KEY.test(key)) url.searchParams.set(key, '[REDACTED]');
    url.username = ''; url.password = '';
    return url.href;
  } catch { return ''; }
}

export function officialUrl(value, baseUrl, allowedHosts = []) {
  try {
    const url = new URL(decode(value), baseUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const allowed = allowedHosts.map(item => String(item).toLowerCase().replace(/^www\./u, ''));
    if (!['http:', 'https:'].includes(url.protocol) || !allowed.some(item => host === item || host.endsWith(`.${item}`))) return '';
    if ([...url.searchParams.keys()].some(key => SECRET_KEY.test(key))) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}

function walkJson(value, path, output, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    if (value.length && value.some(item => item && typeof item === 'object')) output.arrays.push({ path, length: value.length });
    value.slice(0, 500).forEach((item, index) => walkJson(item, `${path}[${index}]`, output, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  const text = clean(`${value.name || value.title || value.subject || ''} ${value.description || value.content || ''}`);
  if (SIGNAL.test(text)) output.popupObjects += 1;
  for (const [key, child] of Object.entries(value)) walkJson(child, `${path}.${key}`, output, depth + 1);
}

function parsedJson(raw) {
  const text = String(raw || '').trim().replace(/^<!--|-->$/gu, '').replace(/;\s*$/u, '');
  try { return JSON.parse(text); } catch { return null; }
}

function scriptMethod(attributes, body) {
  if (/id=["']__NEXT_DATA__["']/iu.test(attributes)) return 'next_data';
  if (/type=["']application\/ld\+json["']/iu.test(attributes)) return 'json_ld';
  if (/type=["']application\/json["']/iu.test(attributes)) return 'embedded_json';
  if (/__NUXT__/u.test(body)) return 'nuxt_state';
  if (/__(?:INITIAL|APOLLO|PRELOADED|REDUX)_STATE__/u.test(body)) return 'initial_state';
  return '';
}

export function inspectOfficialDocument(html, sourceUrl, { allowedHosts = [new URL(sourceUrl).hostname] } = {}) {
  const source = String(html || '');
  const structuredData = [];
  for (const match of source.matchAll(JSON_SCRIPT)) {
    const method = scriptMethod(match[1], match[2]);
    if (!method) continue;
    let payload = parsedJson(match[2]);
    if (!payload && ['nuxt_state', 'initial_state'].includes(method)) {
      const assignment = match[2].match(/=\s*([\[{][\s\S]*[\]}])\s*;?\s*$/u)?.[1];
      payload = parsedJson(assignment);
    }
    const summary = { arrays: [], popupObjects: 0 };
    if (payload) walkJson(payload, '$', summary);
    structuredData.push({ method, parsed: Boolean(payload), arrayPaths: summary.arrays.slice(0, 30), popupCandidates: summary.popupObjects });
  }
  const resolve = value => officialUrl(value, sourceUrl, allowedHosts);
  const apiCandidates = [];
  for (const match of source.matchAll(API_LITERAL)) {
    const url = resolve(match[1]);
    if (!url || /(?:analytics|doubleclick|google-analytics|facebook|pixel|tracking|advert)/iu.test(url)) continue;
    apiCandidates.push({ url, method: /\.post|method\s*:\s*["']POST/iu.test(match[0]) ? 'POST' : 'GET', responseType: /json/iu.test(match[0]) ? 'json' : 'unknown', arrayPath: null, pagination: null, authRequired: false, popupCandidates: null });
  }
  const sitemapCandidates = [];
  for (const match of source.matchAll(/(?:<loc>\s*|sitemap\s*:\s*)(https?:\/\/[^<\s]+)/giu)) {
    const url = resolve(match[1]); if (url) sitemapCandidates.push(url);
  }
  const detailUrls = [];
  for (const match of source.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const url = resolve(match[1]);
    if (url && (DETAIL_PATH.test(new URL(url).pathname) || SIGNAL.test(clean(match[2]))) && SIGNAL.test(`${clean(match[2])} ${url}`)) detailUrls.push(url);
  }
  const imageCandidates = [];
  const imagePatterns = [
    /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)/giu,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/giu,
    IMAGE_ATTRIBUTE,
    /<source\b[^>]*srcset=["']([^"']+)/giu,
    /background(?:-image)?\s*:\s*url\(["']?([^"')]+)/giu,
    /["'](?:image|imageUrl|imgUrl|pcImgUrl|mobileImgUrl|thumbnail)["']\s*:\s*["']([^"']+)/giu
  ];
  for (const pattern of imagePatterns) for (const match of source.matchAll(pattern)) {
    for (const candidate of decode(match[1]).split(',').map(item => item.trim().split(/\s+/u)[0])) {
      const url = resolve(candidate);
      if (url && !/(?:logo|icon|placeholder|loading|spinner|tracking|pixel)/iu.test(url)) imageCandidates.push(url);
    }
  }
  const menus = extractOfficialMenuCandidates(source, { sourceUrl, sourceName: new URL(sourceUrl).hostname });
  const canonical = officialUrl(source.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/iu)?.[1] || '', sourceUrl, allowedHosts);
  const title = clean(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]);
  const javascriptRendered = structuredData.some(item => ['next_data', 'nuxt_state', 'initial_state'].includes(item.method))
    || /<div\b[^>]+id=["'](?:__next|app|root)["'][^>]*>\s*<\/div>/iu.test(source);
  return {
    title, canonical, structuredData,
    apiCandidates: uniq(apiCandidates.map(item => JSON.stringify(item))).map(value => JSON.parse(value)),
    sitemapCandidates: uniq(sitemapCandidates), detailUrls: uniq(detailUrls).slice(0, 50),
    imageCandidates: uniq(imageCandidates).slice(0, 50), menuCandidates: menus.slice(0, 30),
    javascriptRendered, hasPopupSignal: SIGNAL.test(clean(source)), responseTextLength: Buffer.byteLength(source)
  };
}

export function discoveryAttempt({ method, url, status, response, itemsFound = 0, errorType = null, detail = {} }) {
  return {
    method, url: sanitizeDiscoveryUrl(url), finalUrl: sanitizeDiscoveryUrl(response?.url || detail.finalUrl || url),
    status, httpStatus: response?.status ?? detail.httpStatus ?? null,
    contentType: response?.headers?.get?.('content-type') || detail.contentType || null,
    responseSize: detail.responseSize ?? (Number(response?.headers?.get?.('content-length') || 0) || null),
    timeout: Boolean(detail.timeout), retryCount: Number(detail.retryCount || response?.requestMeta?.retryCount || 0),
    blockedPageDetected: Boolean(detail.blockedPageDetected), itemsFound, errorType,
    occurredAt: detail.occurredAt || new Date().toISOString()
  };
}

export function recoveryMetadata({ sourceId, primaryPath, fallbackPaths = [], attempts = [], rows = [], detailPagesChecked = 0, inspection = [], verifiedEmptyEvidence = false }) {
  const sanitizedPrimary = sanitizeDiscoveryUrl(primaryPath);
  const primarySuccessful = attempts.find(attempt => attempt.url === sanitizedPrimary && attempt.status === 'success' && attempt.itemsFound > 0);
  const successful = primarySuccessful || attempts.find(attempt => attempt.status === 'success' && attempt.itemsFound > 0);
  const recovered = Boolean(rows.length && !primarySuccessful && successful && successful.url !== sanitizedPrimary);
  const unresolvedAttempt = attempts.some(attempt => ['failed', 'blocked', 'structure_changed'].includes(attempt.status));
  const verifiedEmpty = verifiedEmptyEvidence && attempts.length > 0
    && attempts.every(attempt => !['failed', 'blocked', 'structure_changed', 'parse_failed'].includes(attempt.status));
  const parseFailure = attempts.some(attempt => attempt.status === 'parse_failed');
  const allBlocked = attempts.length > 0 && attempts.every(attempt => attempt.status === 'blocked');
  const allRequestFailed = attempts.length > 0 && attempts.every(attempt => attempt.status === 'failed');
  const allStructureChanged = attempts.length > 0 && attempts.every(attempt => attempt.status === 'structure_changed');
  const finalStatus = rows.length ? (recovered ? 'recovered' : 'success_with_items')
    : parseFailure ? 'parse_failed' : verifiedEmpty ? 'verified_empty' : allBlocked ? 'blocked'
      : allRequestFailed ? 'request_failed' : allStructureChanged ? 'structure_changed'
      : unresolvedAttempt ? 'unresolved' : 'search_incomplete';
  return {
    sourceId, primaryPath: sanitizedPrimary,
    fallbackPathsTried: uniq(fallbackPaths.map(sanitizeDiscoveryUrl)),
    recoveredPath: recovered ? successful.url : null, recovered,
    recoveryReason: recovered ? 'primary_path_failed_or_empty_fallback_succeeded' : null,
    discoveryAttempts: attempts, discoveredCount: rows.length, detailPagesChecked,
    imageCandidatesFound: inspection.reduce((sum, item) => sum + (item.imageCandidates?.length || 0), 0),
    menuCandidatesFound: inspection.reduce((sum, item) => sum + (item.menuCandidates?.length || 0), 0),
    finalStatus
  };
}

export function stableDiscoveryId(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}
