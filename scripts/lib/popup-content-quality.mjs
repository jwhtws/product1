const DAY_MS = 86_400_000;

export const CONTENT_SEARCH_STATUSES = Object.freeze([
  'found', 'not_published_by_source', 'search_incomplete', 'parse_failed', 'review_required'
]);
export const PUBLISH_STATUSES = Object.freeze(['published', 'review_required', 'rejected']);
export const QUALITY_REASONS = Object.freeze([
  'missing_valid_image', 'missing_menu', 'missing_official_url', 'missing_dates',
  'missing_venue', 'broken_image', 'search_incomplete', 'parse_failed',
  'low_confidence_ocr', 'conflicting_sources', 'other'
]);
export const REQUIRED_SEARCH_CHECKS = Object.freeze([
  'checkedOfficialList', 'checkedOfficialDetail', 'checkedEmbeddedData',
  'checkedOfficialImages', 'checkedOperatorSearch', 'checkedBrandOfficialSources'
]);

const clean = value => String(value ?? '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
const uniq = values => [...new Set(values.map(clean).filter(Boolean))];
const normalizeKey = value => clean(value).normalize('NFKC').replace(/[\s·.,()[\]{}'"`~!@#$%^&*+_=|:;?<>/\\-]/gu, '').toLowerCase();

export function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function validIsoDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(clean(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calculatePopupStatus(row, today = seoulDate()) {
  const startDate = clean(row?.startDate);
  const endDate = clean(row?.endDate);
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate) return 'review_required';
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'ended';
  return 'ongoing';
}

export function completeSearchEvidence(search) {
  return REQUIRED_SEARCH_CHECKS.every(field => search?.[field] === true);
}

function safeUrl(value) {
  try {
    const url = new URL(clean(value));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|secret|key|api[-_]?key|authorization|cookie|session|password|credential)/iu.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    url.username = '';
    url.password = '';
    return url.href;
  } catch { return ''; }
}

function normalizedEvidence(evidence, checkedAt) {
  if (!evidence || typeof evidence !== 'object') return null;
  const sourceUrl = safeUrl(evidence.sourceUrl);
  const imageUrl = safeUrl(evidence.imageUrl);
  const value = {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(clean(evidence.sourceName) ? { sourceName: clean(evidence.sourceName) } : {}),
    ...(clean(evidence.contentType) ? { contentType: clean(evidence.contentType) } : {}),
    ...(clean(evidence.extractedField) ? { extractedField: clean(evidence.extractedField) } : {}),
    ...(clean(evidence.selector) ? { selector: clean(evidence.selector) } : {}),
    ...(clean(evidence.jsonPath) ? { jsonPath: clean(evidence.jsonPath) } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    capturedAt: clean(evidence.capturedAt) || checkedAt
  };
  return Object.keys(value).length > 1 ? value : null;
}

export function normalizeContentSearch(row, { checkedAt = new Date().toISOString() } = {}) {
  const input = row?.contentSearch && typeof row.contentSearch === 'object' ? row.contentSearch : {};
  const evidence = (Array.isArray(input.evidence) ? input.evidence : [])
    .map(item => normalizedEvidence(item, checkedAt)).filter(Boolean);
  const checkedUrls = uniq([
    ...(Array.isArray(input.checkedUrls) ? input.checkedUrls.map(safeUrl) : []),
    safeUrl(row?.sourceUrl || row?.officialUrl),
    ...evidence.flatMap(item => [item.sourceUrl, item.imageUrl])
  ]);
  const output = {
    ...Object.fromEntries(REQUIRED_SEARCH_CHECKS.map(field => [field, input[field] === true])),
    checkedUrls,
    checkedMethods: uniq(Array.isArray(input.checkedMethods) ? input.checkedMethods : []),
    imageCandidatesFound: Math.max(0, Number(input.imageCandidatesFound || 0)),
    menuCandidatesFound: Math.max(0, Number(input.menuCandidatesFound || 0)),
    priceCandidatesFound: Math.max(0, Number(input.priceCandidatesFound || 0)),
    descriptionCandidatesFound: Math.max(0, Number(input.descriptionCandidatesFound || 0)),
    status: CONTENT_SEARCH_STATUSES.includes(input.status) ? input.status : 'review_required',
    evidence,
    failureReasons: uniq([
      ...(Array.isArray(input.failureReasons) ? input.failureReasons : []),
      clean(row?.parserFailureReason)
    ]),
    checkedAt: clean(input.checkedAt) || checkedAt
  };
  return output;
}

export function imageUrlReason(value) {
  const url = safeUrl(value);
  if (!url || !/^https:\/\//u.test(url)) return 'invalid_url';
  if (/(?:placeholder|placehold|no[-_]?image|image[-_]?none|default[-_]?image|dummy|blank|spacer|tracking|pixel|logo(?:[._/-]|$)|favicon|appicon|spinner|loading)/iu.test(url)) return 'placeholder_or_logo';
  return '';
}

function imageDimensions(bytes, contentType = '') {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && /gif/iu.test(contentType) && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    const kind = bytes.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (kind === 'VP8L' && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

async function limitedBody(response, limit = 262_144) {
  if (!response.body?.getReader) return Buffer.from(await response.arrayBuffer()).subarray(0, limit);
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    parts.push(chunk.subarray(0, limit - total));
    total += Math.min(chunk.length, limit - total);
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(parts);
}

export async function probeOfficialImage(url, {
  fetchImpl = fetch, minWidth = 200, minHeight = 200, timeoutMs = 12_000
} = {}) {
  const reason = imageUrlReason(url);
  if (reason) return { status: 'invalid', reason, checkedAt: new Date().toISOString() };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif', Range: 'bytes=0-262143' }
    });
    const contentType = clean(response.headers.get('content-type')).split(';')[0].toLowerCase();
    if (!response.ok) return { status: 'invalid', reason: `http_${response.status}`, checkedAt: new Date().toISOString() };
    if (!contentType.startsWith('image/')) return { status: 'invalid', reason: 'invalid_content_type', contentType, checkedAt: new Date().toISOString() };
    const bytes = await limitedBody(response);
    const dimensions = imageDimensions(bytes, contentType);
    if (!dimensions) return { status: 'review_required', reason: 'dimensions_unreadable', contentType, checkedAt: new Date().toISOString() };
    if (dimensions.width <= 1 || dimensions.height <= 1) return { status: 'invalid', reason: 'tracking_pixel', contentType, ...dimensions, checkedAt: new Date().toISOString() };
    if (dimensions.width < minWidth || dimensions.height < minHeight) return { status: 'invalid', reason: 'below_minimum_dimensions', contentType, ...dimensions, checkedAt: new Date().toISOString() };
    return { status: 'valid', contentType, ...dimensions, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { status: 'invalid', reason: error?.name === 'AbortError' ? 'timeout' : 'request_failed', checkedAt: new Date().toISOString() };
  } finally { clearTimeout(timer); }
}

function normalizedPrice(menu) {
  const priceText = clean(menu?.priceText || menu?.price);
  if (!priceText || /미공개/u.test(priceText)) return { price: null, priceText: priceText || '가격 미공개' };
  const numeric = Number(priceText.replace(/[^\d]/gu, ''));
  return { price: Number.isFinite(numeric) ? numeric : null, priceText };
}

export function normalizeOfficialMenus(row) {
  const titleKey = normalizeKey(row?.title || row?.name);
  const source = clean(row?.menuSource);
  const values = Array.isArray(row?.menus) && row.menus.length ? row.menus : (Array.isArray(row?.menuItems) ? row.menuItems : []);
  const output = [];
  for (const value of values) {
    const menu = typeof value === 'string' ? { name: value } : (value || {});
    const name = clean(menu.name || menu.title);
    if (!name) continue;
    const nameKey = normalizeKey(name);
    const copiedTitle = nameKey && nameKey === titleKey;
    const explicitEvidence = clean(menu.evidenceType || source);
    const { price, priceText } = normalizedPrice(menu);
    if (copiedTitle && (!explicitEvidence || explicitEvidence === 'official-event-text' || price === null)) continue;
    if (/^(?:디저트|음식|식품|푸드|메뉴|상품)\s*(?:판매|팝업)?$/u.test(name)) continue;
    const normalized = {
      name, price, priceText,
      description: clean(menu.description), imageUrl: safeUrl(menu.imageUrl),
      sourceUrl: safeUrl(menu.sourceUrl || row.sourceUrl || row.officialUrl),
      sourceName: clean(menu.sourceName || row.sourceName),
      evidenceType: clean(menu.evidenceType || ({
        'official-detail': 'html', 'official-search-result': 'html', 'official-image': 'official_image'
      }[source] || source || '')),
      ...(menu.ocr ? { ocr: menu.ocr } : {})
    };
    const key = `${normalizeKey(name)}|${priceText}`;
    if (!output.some(item => item._key === key)) output.push({ ...normalized, _key: key });
  }
  return output.map(({ _key, ...menu }) => menu);
}

function decodedText(value) {
  return clean(String(value || '')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&').replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<').replace(/&gt;/giu, '>'));
}

export function extractOfficialMenuCandidates(html, {
  sourceUrl = '', sourceName = '', capturedAt = new Date().toISOString()
} = {}) {
  const candidates = [];
  const push = (name, price, evidenceType, selector) => {
    const cleanedName = decodedText(name);
    const cleanedPrice = clean(price);
    if (cleanedName.length < 2 || cleanedName.length > 100 || !/[\d,]+\s*(?:원|KRW|₩)/iu.test(cleanedPrice)) return;
    candidates.push({
      name: cleanedName, price: cleanedPrice, sourceUrl: safeUrl(sourceUrl), sourceName: clean(sourceName),
      evidenceType, evidence: { sourceUrl: safeUrl(sourceUrl), sourceName: clean(sourceName), contentType: evidenceType,
        extractedField: 'menus', selector, capturedAt }
    });
  };

  for (const match of String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const root = JSON.parse(match[1]);
      const walk = (value, path = '$', inMenuContext = false) => {
        if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`, inMenuContext));
        if (!value || typeof value !== 'object') return;
        const type = clean(value['@type']).toLowerCase();
        const contextual = inMenuContext || /(?:menuitem|product|offer)/u.test(type);
        const name = value.name || value.title;
        const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers;
        const price = value.priceText || value.price || offer?.priceText || offer?.price;
        const currency = value.priceCurrency || offer?.priceCurrency;
        if (contextual && name && price !== undefined) push(name, `${price}${currency === 'KRW' ? '원' : ''}`, 'embedded_json', path);
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`, contextual || /^(?:menu|menus|menuItems|products|items|offers)$/iu.test(key));
        }
      };
      walk(root);
    } catch {}
  }

  for (const match of String(html || '').matchAll(/<(?:tr|li)\b[^>]*(?:class=["'][^"']*(?:menu|product|item)[^"']*["'])?[^>]*>([\s\S]*?)<\/(?:tr|li)>/giu)) {
    const text = decodedText(match[1].replace(/<br\s*\/?\s*>/giu, '\n').replace(/<\/t[dh]>/giu, '\n'));
    const price = text.match(/[\d,]+\s*(?:원|KRW|₩)/iu)?.[0];
    if (!price) continue;
    const name = text.split(price)[0].split(/\n/u).map(clean).filter(Boolean).at(-1);
    push(name, price, 'html', 'tr|li menu/product block');
  }
  const seen = new Set();
  return candidates.filter(menu => {
    const key = `${normalizeKey(menu.name)}|${menu.price}`;
    return key && !seen.has(key) && seen.add(key);
  });
}

function hasUsefulDescription(row) {
  return clean(row.description).length >= 40 || Boolean(clean(row.openingHours)) || Boolean(clean(row.address) && clean(row.address) !== clean(row.venue));
}

export function evaluatePopupContent(row, {
  today = seoulDate(), checkedAt = new Date().toISOString(), imageValidation
} = {}) {
  const search = normalizeContentSearch(row, { checkedAt });
  const menuCandidates = normalizeOfficialMenus(row);
  const menus = menuCandidates.filter(menu => !menu.ocr || menu.ocr.status === 'verified');
  const hero = clean(row.image || row.imageUrl || row.officialImageUrls?.[0]);
  const validation = imageValidation || row.imageValidation || {
    status: imageUrlReason(hero) ? 'invalid' : 'review_required',
    reason: imageUrlReason(hero) || 'not_http_verified', checkedAt
  };
  const validImage = Boolean(hero) && validation.status === 'valid';
  const validMenu = menus.length > 0;
  const ocrLow = menuCandidates.some(menu => menu.ocr && menu.ocr.status !== 'verified');
  const parserFailed = Boolean(clean(row.parserFailureReason)) || search.status === 'parse_failed';
  const complete = completeSearchEvidence(search);
  const qualityReasons = (Array.isArray(row.qualityReasons) ? row.qualityReasons : [])
    .filter(reason => QUALITY_REASONS.includes(reason));
  if (search.failureReasons.includes('official_detail_brand_conflict')) qualityReasons.push('conflicting_sources');
  if (!safeUrl(row.officialUrl || row.sourceUrl)) qualityReasons.push('missing_official_url');
  if (!validIsoDate(row.startDate) || !validIsoDate(row.endDate) || row.endDate < row.startDate) qualityReasons.push('missing_dates');
  if (!clean(row.venue)) qualityReasons.push('missing_venue');
  if (parserFailed) qualityReasons.push('parse_failed');
  if (ocrLow && !validMenu) qualityReasons.push('low_confidence_ocr');
  if (!validImage) {
    if (validation.status === 'invalid' && hero) qualityReasons.push('broken_image');
    if (complete && !parserFailed) qualityReasons.push('missing_valid_image');
    else if (!parserFailed) qualityReasons.push('search_incomplete');
  }
  if (!validMenu) {
    if (complete && !parserFailed) qualityReasons.push('missing_menu');
    else if (!parserFailed) qualityReasons.push('search_incomplete');
  }
  const uniqueReasons = uniq(qualityReasons);
  const requiredComplete = !uniqueReasons.some(reason => [
    'missing_official_url', 'missing_dates', 'missing_venue', 'broken_image',
    'missing_valid_image', 'missing_menu', 'search_incomplete', 'parse_failed', 'low_confidence_ocr'
  ].includes(reason));
  const contentQuality = requiredComplete ? (hasUsefulDescription(row) ? 'A' : 'B') : 'C';
  const rejected = !['official', 'official-search'].includes(row.sourceGrade) || /(?:fixture|example\.com|테스트)/iu.test(`${row.id} ${row.sourceUrl}`);
  const publishStatus = rejected ? 'rejected' : contentQuality === 'C' ? 'review_required' : 'published';
  if (validImage && validMenu) search.status = 'found';
  else if (parserFailed) search.status = 'parse_failed';
  else if (complete) search.status = 'not_published_by_source';
  else search.status = 'search_incomplete';
  search.imageCandidatesFound = Math.max(search.imageCandidatesFound, hero ? 1 : 0, Array.isArray(row.officialImageUrls) ? row.officialImageUrls.length : 0);
  search.menuCandidatesFound = Math.max(search.menuCandidatesFound, menus.length);
  search.priceCandidatesFound = Math.max(search.priceCandidatesFound, menus.filter(menu => menu.price !== null).length);
  return {
    ...row,
    status: calculatePopupStatus(row, today),
    menus,
    menuItems: menus.map(menu => menu.name),
    imageValidation: validation,
    contentQuality,
    publishStatus,
    qualityReasons: uniqueReasons.length ? uniqueReasons : [],
    lastContentCheckedAt: checkedAt,
    contentSearch: search,
    imageCandidates: uniq([hero, ...(Array.isArray(row.officialImageUrls) ? row.officialImageUrls : [])]).slice(0, 12),
    menuCandidates,
    ocrStatus: ocrLow ? (validMenu ? 'partially_verified' : 'review_required') : menus.some(menu => menu.ocr?.status === 'verified') ? 'verified' : 'not_used'
  };
}

function countBy(rows, predicate) { return rows.filter(predicate).length; }

export function contentAuditStats(rows, { previousRows = [], today = seoulDate() } = {}) {
  const previous = new Map(previousRows.map(row => [row.id, row]));
  const total = {
    totalCollected: rows.length,
    publishedCount: countBy(rows, row => row.publishStatus === 'published'),
    reviewRequiredCount: countBy(rows, row => row.publishStatus === 'review_required'),
    rejectedCount: countBy(rows, row => row.publishStatus === 'rejected'),
    validImageCount: countBy(rows, row => row.imageValidation?.status === 'valid'),
    missingImageCount: countBy(rows, row => row.imageValidation?.status !== 'valid'),
    menuCompleteCount: countBy(rows, row => row.menus?.length > 0),
    missingMenuCount: countBy(rows, row => !row.menus?.length),
    priceKnownCount: countBy(rows, row => row.menus?.some(menu => menu.price !== null)),
    descriptionCompleteCount: countBy(rows, hasUsefulDescription),
    searchIncompleteCount: countBy(rows, row => row.contentSearch?.status === 'search_incomplete'),
    parseFailedCount: countBy(rows, row => row.contentSearch?.status === 'parse_failed'),
    notPublishedBySourceCount: countBy(rows, row => row.contentSearch?.status === 'not_published_by_source'),
    upcomingCount: countBy(rows, row => row.status === 'upcoming'),
    ongoingCount: countBy(rows, row => row.status === 'ongoing'),
    endedCount: countBy(rows, row => row.status === 'ended'),
    newlyPublishedCount: countBy(rows, row => row.publishStatus === 'published'
      && (!previous.has(row.id) || previous.get(row.id)?.publishStatus === 'review_required')),
    newlyEndedCount: countBy(rows, row => row.status === 'ended'
      && previous.has(row.id) && previous.get(row.id)?.status !== 'ended'),
    qualityDistribution: Object.fromEntries(['A', 'B', 'C'].map(quality => [quality, countBy(rows, row => row.contentQuality === quality)])),
    asOfDate: today
  };
  const bySource = {};
  for (const sourceName of uniq(rows.map(row => row.sourceName))) {
    const sourceRows = rows.filter(row => row.sourceName === sourceName);
    const rate = predicate => sourceRows.length ? Number((countBy(sourceRows, predicate) / sourceRows.length).toFixed(4)) : 0;
    const reasons = {};
    for (const row of sourceRows) for (const reason of row.qualityReasons || []) reasons[reason] = (reasons[reason] || 0) + 1;
    bySource[sourceName] = {
      totalCollected: sourceRows.length,
      imageCompletenessRate: rate(row => row.imageValidation?.status === 'valid'),
      menuCompletenessRate: rate(row => row.menus?.length > 0),
      priceCompletenessRate: rate(row => row.menus?.some(menu => menu.price !== null)),
      publishRate: rate(row => row.publishStatus === 'published'),
      searchIncompleteRate: rate(row => row.contentSearch?.status === 'search_incomplete'),
      parseFailureRate: rate(row => row.contentSearch?.status === 'parse_failed'),
      reviewRequiredReasons: reasons
    };
  }
  return { total, bySource };
}

export async function auditPopupRows(rows, {
  today = seoulDate(), checkedAt = new Date().toISOString(), fetchImpl = fetch,
  verifyImages = true, concurrency = 4, previousRows = []
} = {}) {
  const urls = uniq(rows.map(row => row.image || row.imageUrl || row.officialImageUrls?.[0])).filter(url => !imageUrlReason(url));
  const validations = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      validations.set(url, verifyImages
        ? await probeOfficialImage(url, { fetchImpl })
        : { status: 'review_required', reason: 'not_http_verified', checkedAt });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, () => worker()));
  const evaluated = rows.map(row => {
    const hero = clean(row.image || row.imageUrl || row.officialImageUrls?.[0]);
    return evaluatePopupContent(row, {
      today, checkedAt,
      imageValidation: validations.get(hero) || { status: 'invalid', reason: imageUrlReason(hero) || 'missing_image', checkedAt }
    });
  });
  return { rows: evaluated, stats: contentAuditStats(evaluated, { previousRows, today }) };
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
