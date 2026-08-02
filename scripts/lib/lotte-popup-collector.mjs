const storeCodes = new Map([
  ['롯데백화점 본점', '0001'], ['롯데백화점 노원점', '0022'],
  ['롯데백화점 센텀시티점', '0027'], ['롯데백화점 건대스타시티점', '0028'],
  ['롯데백화점 안산점', '0336'], ['롯데아울렛 청주점', '0342'],
  ['롯데백화점 인천점', '0344'], ['롯데백화점 동탄점', '0399']
]);

const knownMenus = new Map([
  ['lotte:main:glaceau', [{ name: '프리미엄 수제 아이스크림', price: '' }]]
]);

function officialImage(html, baseUrl, decodeHtml) {
  const source = String(html || '').replace(/\\u002F/giu, '/').replace(/\\\//gu, '/');
  const candidates = [
    ...[...source.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/giu)].map(match => match[1]),
    ...[...source.matchAll(/["'](?:imageUrl|imgUrl|imgPath|pcImgUrl|mblImgUrl|shpgNewsImgUrl|dtlImgUrl)["']\s*:\s*["']([^"']+)/giu)].map(match => match[1]),
    ...[...source.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)/giu)].map(match => match[1])
  ];
  for (const candidate of candidates) {
    const value = decodeHtml(candidate).replace(/&amp;/giu, '&');
    if (!value || /(?:logo|icon|spinner|loading|blank|default\.png|qr|arrow|button|appicon|metatag)/iu.test(value)) continue;
    try {
      const resolved = new URL(value, baseUrl).href;
      if (/minfo\.lotteshopping\.com\/content\/news\//iu.test(resolved)) return resolved;
      if (/\.(?:jpe?g|png|webp)(?:\?|$)/iu.test(resolved)) return resolved;
    } catch {}
  }
  return '';
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
    const context = decodeHtml(html.slice(Math.max(0, match.index - 2600), match.index + 2600));
    if (compactKey && normalizedText(context).includes(compactKey)) return match[0];
  }
  return matches.length === 1 ? matches[0][0] : '';
}

export async function collectLottePopups({ rows, previous, today, fetchResilient, clean, decodeHtml, uniqueMenus, normalizedText }) {
  const previousById = new Map(previous.map(row => [row.id, row]));
  const results = [];
  let verified = 0;
  for (const [id, name, venue, startDate, endDate, rawSourceUrl] of rows) {
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
    let menus = knownMenus.get(id) || (old?.menuSource === 'official-detail' ? old.menus : []);
    let menuSource = knownMenus.has(id) ? 'official-search-result' : (menus.length ? 'official-detail' : '');
    try {
      const response = await fetchResilient(searchUrl);
      if (response.ok) {
        const searchHtml = await response.text();
        let detailHtml = /\/shpgnews\/shpgnewsDetail/iu.test(searchUrl) ? searchHtml : '';
        if (!detailHtml) {
          const newsId = matchingNewsId(searchHtml, name, normalizedText, decodeHtml);
          if (newsId) {
            sourceUrl = `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${newsId}`;
            const detailResponse = await fetchResilient(sourceUrl);
            if (detailResponse.ok) detailHtml = await detailResponse.text();
          }
        }
        const foundImage = officialImage(detailHtml || searchHtml, sourceUrl, decodeHtml);
        if (foundImage) imageUrl = foundImage;
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
      imageSource: imageUrl ? 'official-detail' : 'official-image-unavailable',
      sourceName: '롯데쇼핑 공식 행사', sourceUrl, sourceGrade: 'official-search',
      firstSeenAt: old?.firstSeenAt || today, lastSeenAt: today,
      ...(menus.length ? { menus, menuSource } : {})
    });
  }
  console.log(`롯데 전용 수집기: ${rows.length}건 중 공식 페이지 ${verified}건 응답`);
  return results;
}
