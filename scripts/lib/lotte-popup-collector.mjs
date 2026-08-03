const storeCodes = new Map([
  ['롯데백화점 본점', '0001'], ['롯데백화점 노원점', '0022'],
  ['롯데백화점 센텀시티점', '0027'], ['롯데백화점 건대스타시티점', '0028'],
  ['롯데백화점 안산점', '0336'], ['롯데아울렛 청주점', '0342'],
  ['롯데백화점 인천점', '0344'], ['롯데백화점 동탄점', '0399']
]);

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
  return uniqueMenus(menus);
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
  let cursor = 0;
  async function worker() {
   while (cursor < rows.length) {
    const [id, name, venue, startDate, endDate, rawSourceUrl] = rows[cursor++];
    let searchUrl = rawSourceUrl;
    if (/\/search\/searchResult/iu.test(searchUrl) && storeCodes.has(venue)) {
      const url = new URL(searchUrl);
      url.searchParams.set('cstrCd', storeCodes.get(venue));
      url.searchParams.set('searchTerm', clean(name));
      searchUrl = url.href;
    }
    const old = previousById.get(id);
    let sourceUrl = searchUrl;
    let imageUrl = old?.imageSource === 'official-detail' ? old.imageUrl : '';
    let officialImageUrls = Array.isArray(old?.officialImageUrls) ? old.officialImageUrls : (imageUrl ? [imageUrl] : []);
    let menus = knownMenus.get(id) || (old?.menuSource === 'official-detail' ? old.menus : []);
    let menuSource = knownMenus.has(id) ? 'official-search-result' : (menus.length ? 'official-detail' : '');
    try {
      const response = await fetchLotte(searchUrl);
      if (response.ok) {
        let searchHtml = await response.text();
        let detailHtml = /\/shpgnews\/shpgnewsDetail/iu.test(searchUrl) ? searchHtml : '';
        if (!detailHtml) {
          let newsId = matchingNewsId(searchHtml, name, normalizedText, decodeHtml);
          if (!newsId && /\/search\/searchResult/iu.test(searchUrl)) {
            for (const term of searchTerms(name, clean).slice(1)) {
              try {
                const fallbackUrl = new URL(searchUrl);
                fallbackUrl.searchParams.set('searchTerm', term);
                const fallbackResponse = await fetchLotte(fallbackUrl.href);
                if (!fallbackResponse.ok) continue;
                const fallbackHtml = await fallbackResponse.text();
                newsId = matchingNewsId(fallbackHtml, term, normalizedText, decodeHtml);
                if (newsId) {
                  searchHtml = fallbackHtml;
                  simplifiedSearchMatched += 1;
                  break;
                }
              } catch {}
            }
          }
          if (newsId) {
            sourceUrl = `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${newsId}`;
            const detailResponse = await fetchLotte(sourceUrl);
            if (detailResponse.ok) {
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
              }
            }
          }
        }
        // Search pages contain many unrelated cards. Only a validated,
        // single-event detail page may contribute an image.
        const foundImages = detailHtml ? officialImages(detailHtml, sourceUrl, decodeHtml) : [];
        const foundImage = foundImages[0] || '';
        if (detailHtml) {
          detailMatched += 1;
          // Prefer the image published by this single-event detail page. Lotte
          // may reuse an older SNM asset id for the same brand.
          const newsId = new URL(sourceUrl).searchParams.get('shpgNewsNo') || '';
          const oldMatchesDetail = newsId && String(imageUrl || '').includes(`/${newsId}/`);
          imageUrl = foundImage || (oldMatchesDetail ? imageUrl : '');
          if (foundImages.length) officialImageUrls = foundImages;
        }
        else if (foundImage) imageUrl = foundImage;
        if (imageUrl) imageMatched += 1;
        if (detailHtml) {
          const foundMenus = detailMenus(detailHtml, decodeHtml, clean, uniqueMenus);
          if (foundMenus.length) { menus = foundMenus; menuSource = 'official-detail'; }
        }
        verified += 1;
      }
    } catch (error) {
      console.warn(`롯데 전용 수집 ${name} 보존 처리: ${error.message}`);
    }
    results.push({
      id, name, venue, venueType: /아울렛|몰/u.test(venue) ? '쇼핑몰' : '백화점', address: venue,
      startDate, endDate, imageUrl: imageUrl || null,
      ...(officialImageUrls.length ? { officialImageUrls } : {}),
      imageSource: imageUrl ? 'official-detail' : 'official-image-unavailable',
      sourceName: '롯데쇼핑 공식 행사', sourceUrl, sourceGrade: 'official-search',
      firstSeenAt: old?.firstSeenAt || today, lastSeenAt: today,
      ...(menus.length ? { menus, menuSource } : {})
    });
   }
  }
  const concurrency = fast ? 16 : 8;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  console.log(`롯데 전용 수집기: ${rows.length}건 · 공식 응답 ${verified}건 · 축약 검색 적중 ${simplifiedSearchMatched}건 · 상세 연결 ${detailMatched}건 · 공식 사진 ${imageMatched}건 · 사진 미제공 ${rows.length - imageMatched}건`);
  return results;
}
