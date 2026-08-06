import { extractOfficialMenuCandidates } from './popup-content-quality.mjs';
import { discoveryAttempt } from './official-source-discovery.mjs';

const storeCodes = new Map([
  ['롯데백화점 본점', '0001'], ['롯데백화점 노원점', '0022'],
  ['롯데백화점 센텀시티점', '0027'], ['롯데백화점 건대스타시티점', '0028'],
  ['롯데백화점 광복점', '0333'],
  ['롯데백화점 안산점', '0336'], ['롯데아울렛 청주점', '0342'],
  ['롯데백화점 인천점', '0344'], ['롯데백화점 동탄점', '0399']
]);

const lottePopupWords = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?)/iu;
const lotteFoodWords = /(꽈배기|술빵|모찌|떡|절미|빵|베이커리|베이글|제과|페스츄리|디저트|케이크|쿠키|초콜릿|아이스크림|젤라또|도넛|마카롱|푸딩|타르트|약과|한과|오란다|구움과자|과일|복숭아|감자|요거트|미숫가루|카페|커피|로스터리|홍닝차|티룸|음료|주스|맥주|와인|막걸리|포장마차|분식|김밥|라면|국수|냉면|만두|스시|초밥|야끼|타코|닭|치킨|고기|육회|곱창|족발|해산물|오징어|건어물|반찬|김치|식품|푸드|F&B|FNB|맛집|셰프|요리|농산|수산|축산)/iu;
const lotteNonHumanFood = /(반려|펫|강아지|고양이|사료)/u;
const lotteSeedStores = new Map([['0333', '광복점']]);

const knownMenus = new Map([
  ['lotte:main:glaceau', [{ name: '프리미엄 수제 아이스크림', price: '' }]]
]);

export function officialImages(html, baseUrl, decodeHtml) {
  const source = String(html || '').replace(/\\u002F/giu, '/').replace(/\\\//gu, '/');
  const candidates = [
    ...[...source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/giu)].map(match => match[1]),
    ...[...source.matchAll(/["'](?:imageUrl|imgUrl|imgPath|pcImgUrl|mblImgUrl|shpgNewsImgUrl|dtlImgUrl)["']\s*:\s*["']([^"']+)/giu)].map(match => match[1]),
    ...[...source.matchAll(/<img[^>]+(?:data-src|data-original|src)=["']([^"']+)/giu)].map(match => match[1]),
    ...[...source.matchAll(/<(?:img|source)[^>]+srcset=["']([^"']+)/giu)].flatMap(match => match[1].split(',').map(value => value.trim().split(/\s+/u)[0])),
    ...[...source.matchAll(/(?:background(?:-image)?\s*:|url\()\s*(?:url\()?\s*["']?([^"')\s]+\.(?:jpe?g|png|webp)(?:\?[^"')\s]*)?)/giu)].map(match => match[1]),
    ...[...source.matchAll(/https?:\\?\/\\?\/[^"'<>\s)]+\.(?:jpe?g|png|webp)(?:\?[^"'<>\s)]*)?/giu)].map(match => match[0])
  ];
  const expectedNewsId = new URL(baseUrl).searchParams.get('shpgNewsNo') || '';
  const resolvedCandidates = [];
  for (const candidate of candidates) {
    const value = decodeHtml(candidate).replace(/&amp;/giu, '&');
    if (!value || /(?:logo|icon|spinner|loading|blank|default\.png|qr|arrow|button|appicon|metatag)/iu.test(value)) continue;
    try {
      const resolved = new URL(value, baseUrl).href;
      if (/minfo\.lotteshopping\.com\/content\/news\//iu.test(resolved)) resolvedCandidates.push(resolved);
      else if (/\.(?:jpe?g|png|webp)(?:\?|$)/iu.test(resolved)) resolvedCandidates.push(resolved);
    } catch {}
  }
  const unique = [...new Set(resolvedCandidates)];
  if (expectedNewsId) {
    const official = unique.filter(url => /minfo\.lotteshopping\.com\/content\/news\//iu.test(url));
    const exact = official.filter(url => url.includes(`/${expectedNewsId}/`));
    // Lotte legitimately reuses an older shopping-news asset when publishing
    // a new detail page for the same brand. A detail page represents exactly
    // one event, so its first official news asset is safe even when the asset
    // path contains the older SNM id. This fallback must not be used on the
    // multi-event search page below.
    return [...new Set([...exact, ...official])].slice(0, 12);
  }
  return unique.slice(0, 12);
}

export function officialImage(html, baseUrl, decodeHtml) {
  return officialImages(html, baseUrl, decodeHtml)[0] || '';
}

function htmlLines(value, decodeHtml, clean) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:a|article|div|dl|dt|dd|h[1-6]|li|p|section|span|strong)>/giu, '\n')
    .split(/\r?\n/u)
    .map(line => decodeHtml(line))
    .map(clean)
    .filter(Boolean);
}

function lotteDateRange(value, today) {
  const match = String(value || '').match(/(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?(?:\([^)]+\))?\s*(?:~|∼|〜|–|—|-|부터|to)\s*(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?/iu);
  if (!match) return null;
  const reference = new Date(`${today}T00:00:00+09:00`);
  const startMonth = Number(match[2]);
  const endMonth = Number(match[5]);
  let startYear = Number(match[1]) || reference.getFullYear();
  if (!match[1] && reference.getMonth() + 1 <= 2 && startMonth >= 11) startYear -= 1;
  const endYear = Number(match[4]) || (endMonth < startMonth ? startYear + 1 : startYear);
  return {
    startDate: `${startYear}-${String(startMonth).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`,
    endDate: `${endYear}-${String(endMonth).padStart(2, '0')}-${String(match[6]).padStart(2, '0')}`
  };
}

function lotteVenue(lines, fallbackName = '') {
  const location = lines.find(line => /(?:백화점|프리미엄\s*아울렛|아울렛|롯데몰|쇼핑몰|타임빌라스)\s*[^\n]{1,40}?점/u.test(line)) || '';
  const match = location.match(/(백화점|프리미엄\s*아울렛|아울렛|롯데몰|쇼핑몰|타임빌라스)\s*([가-힣A-Za-z0-9&·\s]+?점)(?:\s|$)/u);
  if (match) {
    const type = match[1].replace(/\s+/gu, '');
    const branch = match[2].replace(/\s+/gu, ' ');
    if (type === '백화점') return `롯데백화점 ${branch}`;
    if (type === '프리미엄아울렛') return `롯데프리미엄아울렛 ${branch}`;
    if (type === '아울렛') return `롯데아울렛 ${branch}`;
    if (type === '롯데몰') return `롯데몰 ${branch}`;
    if (type === '타임빌라스') return `롯데타임빌라스 ${branch}`;
  }
  const branch = String(fallbackName || '').replace(/^(?:롯데)?(?:백화점|프리미엄아울렛|아울렛|몰|쇼핑몰)\s*/u, '').trim();
  return branch ? `롯데백화점 ${branch}` : '';
}

function nearestResultBlock(html, index) {
  const source = String(html || '');
  for (const tag of ['li', 'article', 'a']) {
    const open = source.lastIndexOf(`<${tag}`, index);
    const close = open >= 0 ? source.indexOf(`</${tag}>`, index) : -1;
    if (open >= 0 && close >= index && close - open <= 12_000) return source.slice(open, close + tag.length + 3);
  }
  return source.slice(Math.max(0, index - 1_500), Math.min(source.length, index + 3_500));
}

function stableLotteKey(value) {
  let hash = 2_166_136_261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function parseLotteStoreLinks(html, { decodeHtml, clean }) {
  const stores = new Map(lotteSeedStores);
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']*cstrCd=(\d{4})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const name = decodeHtml(match[3]).replace(/^(?:백화점|프리미엄\s*아울렛|아울렛|롯데몰|쇼핑몰|타임빌라스)\s*/u, '').trim();
    if (name && name.length <= 40) stores.set(match[2], clean(name));
  }
  return [...stores].map(([code, name]) => ({ code, name }));
}

export function parseLotteSearchResults(html, { storeCode, storeName, today, decodeHtml, clean }) {
  const source = String(html || '').replace(/\\u002F/giu, '/').replace(/\\\//gu, '/');
  const rows = [];
  const seen = new Set();
  const candidates = [
    ...source.matchAll(/SNM\d{10,}/gu),
    ...source.matchAll(new RegExp(lottePopupWords.source, 'giu'))
  ].sort((a, b) => a.index - b.index);
  for (const match of candidates) {
    const block = nearestResultBlock(source, match.index);
    const newsId = block.match(/SNM\d{10,}/u)?.[0] || '';
    const lines = htmlLines(block, decodeHtml, clean);
    const searchable = lines.join(' ');
    const dates = lotteDateRange(searchable, today);
    if (!dates || !lottePopupWords.test(searchable) || !lotteFoodWords.test(searchable) || lotteNonHumanFood.test(searchable)) continue;
    const venue = lotteVenue(lines, storeName);
    if (!venue) continue;
    const dateLineIndex = lines.findIndex(line => lotteDateRange(line, today));
    const titleCandidates = lines.slice(0, dateLineIndex >= 0 ? dateLineIndex : lines.length)
      .filter(line => !/^(?:쇼핑뉴스|행사 종료|상세보기|자세히 보기)$/u.test(line))
      .filter(line => !/(?:백화점|아울렛|롯데몰|쇼핑몰|타임빌라스)\s*[^\n]{1,40}?점/u.test(line));
    const name = titleCandidates.find(line => lottePopupWords.test(line) && lotteFoodWords.test(line))
      || titleCandidates.find(line => lottePopupWords.test(line))
      || titleCandidates.find(line => lotteFoodWords.test(line))
      || '';
    if (!name) continue;
    const fingerprint = `${storeCode}|${name}|${dates.startDate}|${dates.endDate}|${venue}`;
    if (seen.has(newsId || fingerprint)) continue;
    seen.add(newsId || fingerprint);
    const fallbackKey = stableLotteKey(fingerprint);
    const sourceUrl = newsId
      ? `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${newsId}`
      : `https://m.lotteshopping.com/search/searchResult?cstrCd=${storeCode}&searchTerm=${encodeURIComponent(name)}`;
    const officialImageUrls = officialImages(block, sourceUrl, decodeHtml);
    rows.push({
      id: `lotte:discovered:${storeCode}:${newsId || fallbackKey}`,
      name,
      venue,
      venueType: /아울렛|몰|타임빌라스/u.test(venue) ? '쇼핑몰' : '백화점',
      address: venue,
      ...dates,
      imageUrl: officialImageUrls[0] || null,
      ...(officialImageUrls.length ? { officialImageUrls } : {}),
      imageSource: officialImageUrls.length ? 'official-search-result' : 'official-image-unavailable',
      sourceName: '롯데쇼핑 공식 행사',
      sourceUrl,
      sourceGrade: 'official-search',
      firstSeenAt: today,
      lastSeenAt: today,
      contentSearch: {
        checkedOfficialList: true,
        checkedOfficialDetail: false,
        checkedEmbeddedData: true,
        checkedOfficialImages: true,
        checkedOperatorSearch: true,
        checkedBrandOfficialSources: false,
        checkedUrls: [sourceUrl],
        checkedMethods: ['official_list_html', 'embedded_json_scan', 'official_image_candidate_scan', 'operator_internal_search'],
        imageCandidatesFound: officialImageUrls.length,
        menuCandidatesFound: 0,
        priceCandidatesFound: 0,
        descriptionCandidatesFound: lines.length ? 1 : 0,
        status: officialImageUrls.length ? 'review_required' : 'search_incomplete',
        evidence: officialImageUrls.map(imageUrl => ({
          sourceUrl, sourceName: '롯데쇼핑 공식 행사', contentType: 'official_list',
          extractedField: 'officialImageUrls', selector: 'search result card image', imageUrl,
          capturedAt: new Date().toISOString()
        })),
        failureReasons: ['brand_official_sources_not_checked'],
        checkedAt: new Date().toISOString()
      }
    });
  }
  return rows;
}

export async function discoverLottePopups({ today, fetchResilient, clean, decodeHtml, fast = false }) {
  const requestSeconds = fast ? 6 : 12;
  const fetchSearch = url => fetchResilient(url, { attempts: 1, timeoutMs: requestSeconds * 1_000, curlMaxTime: requestSeconds });
  // Lotte's literal popup search can lag behind the branch's general shopping
  // news result. Query the current branch feed and apply our own strict
  // popup/food filters so newly published cards are not missed.
  const searchUrl = (code) => `https://m.lotteshopping.com/search/searchResult?cstrCd=${code}&searchTerm=-`;
  const seedCode = '0333';
  const seedResponse = await fetchSearch(searchUrl(seedCode));
  if (!seedResponse.ok) throw new Error(`롯데 광복점 쇼핑뉴스 응답 ${seedResponse.status}`);
  const seedHtml = await seedResponse.text();
  const stores = parseLotteStoreLinks(seedHtml, { decodeHtml, clean });
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < stores.length) {
      const store = stores[cursor++];
      try {
        const html = store.code === seedCode ? seedHtml : await (async () => {
          const response = await fetchSearch(searchUrl(store.code));
          return response.ok ? response.text() : '';
        })();
        if (html) results.push(...parseLotteSearchResults(await html, { storeCode: store.code, storeName: store.name, today, decodeHtml, clean }));
      } catch (error) {
        console.warn(`롯데 ${store.name} 쇼핑뉴스 발견 보존 처리: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(fast ? 12 : 6, stores.length) }, () => worker()));
  console.log(`롯데 쇼핑뉴스 자동 발견: 공식 지점 ${stores.length}곳 · 푸드 팝업 ${results.length}건`);
  return results;
}

function detailMenus(html, decodeHtml, clean, uniqueMenus) {
  const lines = String(html || '').replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/giu, '\n').split(/\r?\n/u)
    .map(decodeHtml).map(clean).filter(Boolean);
  const menus = [];
  for (let index = 0; index < lines.length; index += 1) {
    const price = lines[index].match(/^([\d,]+)\s*원$/u)?.[0];
    if (!price) continue;
    const name = lines.slice(Math.max(0, index - 6), index).reverse().find(line =>
      line.length >= 2 && line.length <= 60
      && !/^(?:Image|쇼핑뉴스|브랜드명|제품명|가격|행사 종료)$/iu.test(line)
      && !/^\([^)]*(?:kg|g|ml|l)\)$/iu.test(line)
      && !/^#|^\d{1,2}\.\d{1,2}/u.test(line));
    if (name) menus.push({ name, price: price.replace(/\s+/gu, '') });
  }
  return uniqueMenus([
    ...menus,
    ...extractOfficialMenuCandidates(html).map(menu => ({
      name: menu.name, price: menu.price, evidenceType: menu.evidenceType
    }))
  ]);
}

function matchingNewsId(html, name, normalizedText, decodeHtml) {
  const key = normalizedText(name);
  const compactKey = key.slice(0, Math.min(8, key.length));
  const matches = [...String(html || '').matchAll(/SNM\d{10,}/gu)];
  for (const match of matches) {
    // Keep the context inside one result card. A wider window can mix the
    // searched brand title with an adjacent card's news id.
    const context = decodeHtml(html.slice(Math.max(0, match.index - 700), match.index + 700));
    if (compactKey && normalizedText(context).includes(compactKey)) return match[0];
  }
  return '';
}

function searchTerms(name, clean) {
  const full = clean(name);
  const brand = clean(full.split(/[\s·&/+()[\]-]+/u)[0]);
  const compact = clean(full.replace(/[·&/+()[\]-]/gu, ' '));
  return [...new Set([full, brand, compact].filter(term => term.length >= 2))];
}

export async function collectLottePopups({ rows, previous, today, fetchResilient, clean, decodeHtml, uniqueMenus, normalizedText, fast = false }) {
  const requestSeconds = fast ? 5 : 12;
  const fetchLotte = url => fetchResilient(url, { attempts: 1, timeoutMs: requestSeconds * 1_000, curlMaxTime: requestSeconds });
  const previousById = new Map(previous.map(row => [row.id, row]));
  const results = [];
  let verified = 0;
  let detailMatched = 0;
  let imageMatched = 0;
  let simplifiedSearchMatched = 0;
  let officialItemsFound = 0;
  const discoveryAttempts = [];
  let cursor = 0;
  async function worker() {
   while (cursor < rows.length) {
    const input = rows[cursor++];
    const normalizedInput = Array.isArray(input)
      ? { id: input[0], name: input[1], venue: input[2], startDate: input[3], endDate: input[4], sourceUrl: input[5] }
      : input;
    const { id, name, venue, startDate, endDate } = normalizedInput;
    const rawSourceUrl = normalizedInput.sourceUrl;
    let searchUrl = rawSourceUrl;
    if (/\/search\/searchResult/iu.test(searchUrl) && storeCodes.has(venue)) {
      const url = new URL(searchUrl);
      url.searchParams.set('cstrCd', storeCodes.get(venue));
      url.searchParams.set('searchTerm', clean(name));
      searchUrl = url.href;
    }
    const old = previousById.get(id);
    let sourceUrl = searchUrl;
    let imageUrl = normalizedInput.imageUrl || (old?.imageSource === 'official-detail' ? old.imageUrl : '');
    let officialImageUrls = Array.isArray(normalizedInput.officialImageUrls)
      ? normalizedInput.officialImageUrls
      : Array.isArray(old?.officialImageUrls) ? old.officialImageUrls : (imageUrl ? [imageUrl] : []);
    let imageSource = normalizedInput.imageSource || (imageUrl ? 'official-detail' : 'official-image-unavailable');
    let menus = knownMenus.get(id) || (old?.menuSource === 'official-detail' ? old.menus : []);
    let menuSource = knownMenus.has(id) ? 'official-search-result' : (menus.length ? 'official-detail' : '');
    const checkedAt = new Date().toISOString();
    const checkedUrls = [];
    const checkedMethods = ['official_list_html', 'operator_internal_search'];
    const evidence = [];
    const failureReasons = [];
    let checkedOfficialList = false;
    let checkedOfficialDetail = false;
    let checkedEmbeddedData = false;
    let checkedOfficialImages = false;
    let parserFailureReason = '';
    try {
      let detailHtml = '';
      let newsId = '';
      let lastSearchError = null;
      const directDetail = /\/shpgnews\/shpgnewsDetail/iu.test(searchUrl);
      const candidates = directDetail ? [{ url: searchUrl, term: name }]
        : searchTerms(name, clean).map((term, index) => {
          const candidate = new URL(searchUrl);
          candidate.searchParams.set('searchTerm', term);
          return { url: candidate.href, term, fallback: index > 0 };
        });
      for (const candidate of candidates) {
        checkedUrls.push(candidate.url);
        const method = candidate.fallback ? 'operator_internal_search_fallback' : 'operator_internal_search';
        try {
          const response = await fetchLotte(candidate.url);
          if (!response.ok) {
            discoveryAttempts.push(discoveryAttempt({ method, url: candidate.url, status: response.status === 403 ? 'blocked' : 'failed', response, errorType: `http_${response.status}`, detail: response.requestMeta || {} }));
            continue;
          }
          checkedOfficialList = true;
          checkedEmbeddedData = true;
          checkedMethods.push('embedded_json_scan');
          const candidateHtml = await response.text();
          if (directDetail) {
            detailHtml = candidateHtml;
            checkedOfficialDetail = true;
            officialItemsFound += 1;
            discoveryAttempts.push(discoveryAttempt({ method: 'official_detail_html', url: candidate.url, status: 'success', response, itemsFound: 1, detail: response.requestMeta || {} }));
            break;
          }
          newsId = matchingNewsId(candidateHtml, candidate.term, normalizedText, decodeHtml);
          discoveryAttempts.push(discoveryAttempt({ method, url: candidate.url, status: newsId ? 'success' : 'empty', response, itemsFound: newsId ? 1 : 0, detail: response.requestMeta || {} }));
          if (newsId) {
            officialItemsFound += 1;
            if (candidate.fallback) simplifiedSearchMatched += 1;
            break;
          }
        } catch (error) {
          lastSearchError = error;
          discoveryAttempts.push(discoveryAttempt({ method, url: candidate.url, status: error?.name === 'BlockPageError' ? 'blocked' : 'failed', errorType: error?.errorType || error?.name || 'request_failed', detail: { ...error, timeout: Boolean(error?.timeout), retryCount: error?.retryCount || 0 } }));
        }
      }
      if (!checkedOfficialList && lastSearchError) throw lastSearchError;
      if (newsId) {
        sourceUrl = `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${newsId}`;
        checkedUrls.push(sourceUrl);
        try {
          const detailResponse = await fetchLotte(sourceUrl);
          discoveryAttempts.push(discoveryAttempt({ method: 'official_detail_html', url: sourceUrl, status: detailResponse.ok ? 'success' : (detailResponse.status === 403 ? 'blocked' : 'failed'), response: detailResponse, itemsFound: detailResponse.ok ? 1 : 0, errorType: detailResponse.ok ? null : `http_${detailResponse.status}`, detail: detailResponse.requestMeta || {} }));
          if (detailResponse.ok) {
            checkedOfficialDetail = true;
            const candidateDetailHtml = await detailResponse.text();
            const brand = searchTerms(name, clean)[1] || searchTerms(name, clean)[0];
            if (brand && normalizedText(candidateDetailHtml).includes(normalizedText(brand))) {
              detailHtml = candidateDetailHtml;
            } else {
              // Reject and erase an image retained from a previously
              // mis-associated detail page (for example 밀빛 → 톰포드).
              sourceUrl = searchUrl;
              imageUrl = '';
              officialImageUrls = [];
              failureReasons.push('official_detail_brand_conflict');
            }
          }
        } catch (error) {
          discoveryAttempts.push(discoveryAttempt({ method: 'official_detail_html', url: sourceUrl, status: error?.name === 'BlockPageError' ? 'blocked' : 'failed', errorType: error?.errorType || error?.name || 'request_failed', detail: { ...error, timeout: Boolean(error?.timeout), retryCount: error?.retryCount || 0 } }));
          failureReasons.push('official_detail_request_failed');
        }
      }
      if (checkedOfficialList) {
        // Search pages contain many unrelated cards. Only a validated,
        // single-event detail page may contribute an image.
        const foundImages = detailHtml ? officialImages(detailHtml, sourceUrl, decodeHtml) : [];
        if (detailHtml) {
          checkedOfficialImages = true;
          checkedMethods.push('official_detail_html', 'official_detail_embedded_json', 'official_image_candidate_scan');
        }
        const foundImage = foundImages[0] || '';
        if (detailHtml) {
          detailMatched += 1;
          // Prefer the image published by this single-event detail page. Lotte
          // may reuse an older SNM asset id for the same brand.
          const newsId = new URL(sourceUrl).searchParams.get('shpgNewsNo') || '';
          const oldMatchesDetail = newsId && String(imageUrl || '').includes(`/${newsId}/`);
          imageUrl = foundImage || (oldMatchesDetail ? imageUrl : '');
          if (foundImage || oldMatchesDetail) imageSource = 'official-detail';
          if (foundImages.length) officialImageUrls = foundImages;
          for (const candidate of foundImages) evidence.push({
            sourceUrl, sourceName: '롯데쇼핑 공식 행사', contentType: 'official_detail',
            extractedField: 'officialImageUrls', selector: 'og:image|embedded JSON|img|srcset|background-image',
            imageUrl: candidate, capturedAt: checkedAt
          });
        }
        else if (foundImage) imageUrl = foundImage;
        if (imageUrl) imageMatched += 1;
        if (detailHtml) {
          const foundMenus = detailMenus(detailHtml, decodeHtml, clean, uniqueMenus);
          if (foundMenus.length) {
            menus = foundMenus;
            menuSource = 'official-detail';
            for (const menu of foundMenus) evidence.push({
              sourceUrl, sourceName: '롯데쇼핑 공식 행사', contentType: 'official_detail',
              extractedField: 'menus', selector: 'detail text price line and nearest product name', capturedAt: checkedAt
            });
          } else if (/[\d,]+\s*원/u.test(detailHtml)) {
            parserFailureReason = 'price_text_detected_menu_parse_empty';
            failureReasons.push(parserFailureReason);
          }
        }
        verified += 1;
      }
    } catch (error) {
      console.warn(`롯데 전용 수집 ${name} 보존 처리: ${error.message}`);
      failureReasons.push('official_list_request_failed');
    }
    if (!checkedOfficialDetail) failureReasons.push('official_detail_not_identified');
    if (!checkedOfficialImages) failureReasons.push('official_detail_images_not_checked');
    failureReasons.push('brand_official_sources_not_checked');
    results.push({
      id, name, venue, venueType: /아울렛|몰/u.test(venue) ? '쇼핑몰' : '백화점', address: venue,
      startDate, endDate, imageUrl: imageUrl || null,
      ...(officialImageUrls.length ? { officialImageUrls } : {}),
      imageSource: imageUrl ? imageSource : 'official-image-unavailable',
      sourceName: '롯데쇼핑 공식 행사', sourceUrl, sourceGrade: 'official-search',
      firstSeenAt: old?.firstSeenAt || today, lastSeenAt: today,
      ...(menus.length ? { menus, menuSource } : {}),
      ...(parserFailureReason ? { parserFailureReason } : {}),
      contentSearch: {
        checkedOfficialList,
        checkedOfficialDetail,
        checkedEmbeddedData,
        checkedOfficialImages,
        checkedOperatorSearch: checkedOfficialList,
        checkedBrandOfficialSources: false,
        checkedUrls: [...new Set(checkedUrls)],
        checkedMethods: [...new Set(checkedMethods)],
        imageCandidatesFound: officialImageUrls.length,
        menuCandidatesFound: menus.length,
        priceCandidatesFound: menus.filter(menu => clean(menu.price)).length,
        descriptionCandidatesFound: 0,
        status: parserFailureReason ? 'parse_failed' : (imageUrl && menus.length ? 'found' : 'search_incomplete'),
        evidence,
        failureReasons: [...new Set(failureReasons)],
        checkedAt
      }
    });
   }
  }
  const concurrency = fast ? 16 : 8;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  console.log(`롯데 전용 수집기: ${rows.length}건 · 공식 응답 ${verified}건 · 축약 검색 적중 ${simplifiedSearchMatched}건 · 상세 연결 ${detailMatched}건 · 공식 사진 ${imageMatched}건 · 사진 미제공 ${rows.length - imageMatched}건`);
  const unresolved = discoveryAttempts.some(attempt => ['failed', 'blocked'].includes(attempt.status));
  const finalStatus = officialItemsFound ? (simplifiedSearchMatched ? 'recovered' : 'success_with_items')
    : unresolved ? 'unresolved' : 'search_incomplete';
  Object.defineProperty(results, 'sourceHealth', { value: {
    sourceId: 'lotte-department-outlet-mall',
    primaryPath: 'https://m.lotteshopping.com/search/searchResult?cstrCd=0333&searchTerm=-',
    fallbackPathsTried: [...new Set(discoveryAttempts.filter(attempt => attempt.method !== 'operator_internal_search').map(attempt => attempt.url))],
    recoveredPath: simplifiedSearchMatched ? discoveryAttempts.find(attempt => attempt.method === 'operator_internal_search_fallback' && attempt.status === 'success' && attempt.itemsFound > 0)?.url || null : null,
    recovered: simplifiedSearchMatched > 0,
    recoveryReason: simplifiedSearchMatched ? 'full_search_term_missed_simplified_official_search_succeeded' : null,
    discoveryAttempts: discoveryAttempts.slice(0, 300),
    discoveredCount: officialItemsFound,
    detailPagesChecked: detailMatched,
    imageCandidatesFound: results.reduce((sum, row) => sum + (row.officialImageUrls?.length || 0), 0),
    menuCandidatesFound: results.reduce((sum, row) => sum + (row.menus?.length || 0), 0),
    finalStatus,
    status: finalStatus,
    message: officialItemsFound ? `${officialItemsFound}건 공식 행사 확인${simplifiedSearchMatched ? ` · ${simplifiedSearchMatched}건 fallback 복구` : ''}`
      : unresolved ? '공식 검색 및 상세 경로 응답 미확인' : '공식 응답은 받았지만 현재 행사 존재 여부 미확정'
  }, enumerable: false });
  return results;
}
