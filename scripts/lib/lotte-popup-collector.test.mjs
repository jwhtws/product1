import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectLottePopups,
  discoverLottePopups,
  officialImages,
  parseLotteSearchResults,
  parseLotteShoppingInfoResults,
  parseLotteStoreLinks
} from './lotte-popup-collector.mjs';

const clean = value => String(value || '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
const decodeHtml = value => clean(String(value || '')
  .replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;/gu, "'")
  .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>'));
const uniqueMenus = menus => menus;
const normalizedText = value => clean(value).replace(/\s+/gu, '').toLowerCase();

test('롯데 PC 쇼핑정보에서 해당 지점의 예정 식품 팝업만 수집한다', () => {
  const html = `
    <li><strong>[동경생초코파이] Pop-Up</strong><p>백화점 안산점 본관 B1 특설행사장</p><span>8.21(금) ~ 8.27(목)</span></li>
    <li><strong>[미샤] 신상품 Pop-Up</strong><p>백화점 안산점 3F</p><span>8.20 ~ 8.23</span></li>
    <li><strong>[손정옥] 언양불고기 Pop-Up</strong><p>백화점 잠실점 B1</p><span>8.21 ~ 8.27</span></li>`;
  const rows = parseLotteShoppingInfoResults(html, {
    storeCode: '0336', storeName: '안산점', storeType: '백화점', today: '2026-08-17', decodeHtml, clean
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '[동경생초코파이] Pop-Up');
  assert.equal(rows[0].venue, '롯데백화점 안산점');
  assert.equal(rows[0].startDate, '2026-08-21');
  assert.match(rows[0].sourceUrl, /cstrCd=0336/u);
});

const card = ({ newsId = '', title, venue, dates, image = '' }) => `
  <li class="shopping-news-card">
    <a href="${newsId ? `/shpgnews/shpgnewsDetail?shpgNewsNo=${newsId}` : '#'}">
      ${image ? `<img src="${image}" alt="">` : ''}
      <span>쇼핑뉴스</span>
      <strong>${title}</strong>
      <p>${venue}</p>
      <span>${dates}</span>
    </a>
  </li>`;

test('공식 대표이미지는 og·embedded JSON·lazy-load·CSS 후보를 중복 없이 추출한다', () => {
  const id = 'SNM00000000000559999';
  const base = `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${id}`;
  const root = `https://minfo.lotteshopping.com/content/news/202608/${id}`;
  const html = `
    <meta property="og:image" content="${root}/hero.jpg">
    <script>window.__DATA__={"imageUrl":"${root}/gallery.png"}</script>
    <img data-src="${root}/lazy.webp"><div style="background-image:url('${root}/poster.jpg')"></div>
    <img src="${root}/hero.jpg"><img src="/assets/logo.png">`;
  assert.deepEqual(officialImages(html, base, decodeHtml), [
    `${root}/hero.jpg`, `${root}/gallery.png`, `${root}/lazy.webp`, `${root}/poster.jpg`
  ]);
});

test('롯데 공식 지점 링크에서 광복점 seed와 다른 지점을 함께 발견한다', () => {
  const html = `
    <a href="/search/searchResult?cstrCd=0005&amp;searchTerm=팝업">백화점 부산본점</a>
    <a href="/search/searchResult?cstrCd=0027&amp;searchTerm=팝업"><span>센텀시티점</span></a>`;
  assert.deepEqual(parseLotteStoreLinks(html, { decodeHtml, clean }), [
    { code: '0333', name: '광복점' },
    { code: '0005', name: '부산본점' },
    { code: '0027', name: '센텀시티점' }
  ]);
});

test('롯데 검색 결과에서 푸드 팝업만 날짜·지점·공식 이미지와 함께 파싱한다', () => {
  const foodId = 'SNM00000000000550001';
  const html = [
    card({
      newsId: foodId,
      title: '[파닭파닭] Pop-Up Open',
      venue: '백화점 광복점 B1 행사장',
      dates: '8.3(월) ~ 8.9(일)',
      image: `https://minfo.lotteshopping.com/content/news/202608/${foodId}/food.jpeg`
    }),
    card({ newsId: 'SNM00000000000550004', title: '[퐁신당] Pop-Up', venue: '백화점 광복점 B1 식품관 행사장', dates: '8.3(월) ~ 8.9(일)' }),
    card({ newsId: 'SNM00000000000550002', title: '[시슬리] 패션 Pop-Up', venue: '백화점 광복점 3F', dates: '8.1(토) ~ 8.31(월)' }),
    card({ newsId: 'SNM00000000000550003', title: '펫 카페 팝업', venue: '백화점 광복점 9F', dates: '8.1(토) ~ 8.31(월)' })
  ].join('\n');
  const rows = parseLotteSearchResults(html, {
    storeCode: '0333', storeName: '광복점', today: '2026-08-05', decodeHtml, clean
  });
  assert.equal(rows.length, 2);
  const { contentSearch, ...firstRow } = rows[0];
  assert.deepEqual(firstRow, {
    id: `lotte:discovered:0333:${foodId}`,
    name: '[파닭파닭] Pop-Up Open',
    venue: '롯데백화점 광복점',
    venueType: '백화점',
    address: '롯데백화점 광복점',
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    imageUrl: `https://minfo.lotteshopping.com/content/news/202608/${foodId}/food.jpeg`,
    officialImageUrls: [`https://minfo.lotteshopping.com/content/news/202608/${foodId}/food.jpeg`],
    imageSource: 'official-search-result',
    sourceName: '롯데쇼핑 공식 행사',
    sourceUrl: `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${foodId}`,
    sourceGrade: 'official-search',
    firstSeenAt: '2026-08-05',
    lastSeenAt: '2026-08-05'
  });
  assert.equal(contentSearch.checkedOfficialList, true);
  assert.equal(contentSearch.checkedOfficialDetail, false);
  assert.equal(contentSearch.checkedBrandOfficialSources, false);
  assert.equal(contentSearch.imageCandidatesFound, 1);
  assert.equal(rows[1].name, '[퐁신당] Pop-Up');
  assert.equal(rows[1].venue, '롯데백화점 광복점');
});

test('롯데 검색 onclick 속성에서 HTML 대신 실제 팝업명을 추출한다', () => {
  const newsId = 'SNM00000000000552552';
  const html = `<li>${newsId} onclick="ga4.event('click_event', 'MO_통합검색', '통합검색_검색후_쇼핑정보', '1', '[떡볶이시대]맛있는 분식 Pop-Up'); lddi.App.callAppScheme('a0240', 'detail');"><p>롯데백화점 동탄점 B1 식품관</p><span>8.12 ~ 8.18</span></li>`;
  const rows = parseLotteSearchResults(html, {
    storeCode: '0399', storeName: '동탄점', today: '2026-08-12', decodeHtml, clean
  });
  assert.equal(rows[0]?.name, '[떡볶이시대]맛있는 분식 Pop-Up');
  assert.doesNotMatch(rows[0]?.name || '', /onclick|ga4\.event/iu);
});

test('상세 SNM ID가 없는 공식 검색 카드도 안정적인 ID와 검색 링크로 보존한다', () => {
  const html = card({
    title: '[라이프컬처] Pop-Up',
    venue: '백화점 광복점 B1 식품관 행사장',
    dates: '7.24(금) ~ 8.6(목)'
  });
  const first = parseLotteSearchResults(html, {
    storeCode: '0333', storeName: '광복점', today: '2026-08-05', decodeHtml, clean
  });
  const second = parseLotteSearchResults(html, {
    storeCode: '0333', storeName: '광복점', today: '2026-08-05', decodeHtml, clean
  });
  assert.equal(first.length, 1);
  assert.match(first[0].id, /^lotte:discovered:0333:[a-z0-9]+$/u);
  assert.equal(first[0].id, second[0].id);
  assert.equal(first[0].name, '[라이프컬처] Pop-Up');
  assert.equal(new URL(first[0].sourceUrl).searchParams.get('cstrCd'), '0333');
  assert.equal(new URL(first[0].sourceUrl).searchParams.get('searchTerm'), '[라이프컬처] Pop-Up');
});

test('롯데 자동 발견은 광복점을 포함해 공식 페이지에 노출된 지점을 순회한다', async () => {
  const gwangbokId = 'SNM00000000000550011';
  const busanId = 'SNM00000000000550012';
  const seedHtml = `
    <nav><a href="/search/searchResult?cstrCd=0005&amp;searchTerm=팝업">부산본점</a></nav>
    ${card({ newsId: gwangbokId, title: '파닭파닭 치킨 팝업', venue: '백화점 광복점 B1 행사장', dates: '8.3(월) ~ 8.9(일)' })}`;
  const busanHtml = card({ newsId: busanId, title: '수제맥주 Pop-Up', venue: '백화점 부산본점 B1 행사장', dates: '8.1(토) ~ 8.31(월)' });
  const requested = [];
  const fetchResilient = async url => {
    requested.push(url);
    return new Response(url.includes('cstrCd=0333') ? seedHtml : busanHtml, { status: 200 });
  };
  const rows = await discoverLottePopups({ today: '2026-08-05', fetchResilient, clean, decodeHtml, fast: true });
  assert.deepEqual(new Set(rows.map(row => row.venue)), new Set(['롯데백화점 광복점', '롯데백화점 부산본점']));
  assert.equal(requested.filter(url => url.includes('cstrCd=0333')).length, 1);
  assert.equal(requested.filter(url => url.includes('cstrCd=0005')).length, 1);
});

test('광복점 수동 안전망 검색도 공식 지점 코드 0333으로 교정한다', async () => {
  const requested = [];
  const fetchResilient = async url => {
    requested.push(url);
    return new Response('<html></html>', { status: 200 });
  };
  const rows = await collectLottePopups({
    rows: [[
      'lotte:gwangbok:manual', '파닭파닭 치킨 팝업', '롯데백화점 광복점',
      '2026-08-03', '2026-08-09', 'https://m.lotteshopping.com/search/searchResult?cstrCd=0001&searchTerm=POP-UP'
    ]],
    previous: [], today: '2026-08-05', fetchResilient, clean, decodeHtml, uniqueMenus, normalizedText, fast: true
  });
  assert.equal(rows.length, 1);
  assert.equal(new URL(requested[0]).searchParams.get('cstrCd'), '0333');
  assert.equal(rows[0].contentSearch.checkedOfficialList, true);
  assert.equal(rows[0].contentSearch.checkedOfficialDetail, false);
  assert.equal(rows[0].contentSearch.checkedBrandOfficialSources, false);
  assert.equal(rows[0].contentSearch.status, 'search_incomplete');
  assert.ok(rows[0].contentSearch.checkedMethods.includes('operator_internal_search'));
});

test('광복점 퐁신당은 전체 검색 미적중 후 브랜드 검색·상세에서 공식 이미지와 메뉴를 복구한다', async () => {
  const newsId='SNM00000000000557777';
  const hero=`https://minfo.lotteshopping.com/content/news/202608/${newsId}/hero.jpg`;
  const requested=[];
  const fetchResilient=async url=>{
    requested.push(url);
    const parsed=new URL(url);
    if(parsed.pathname.includes('shpgnewsDetail')) return new Response(`<html><meta property="og:image" content="${hero}"><h1>퐁신당 Pop-Up</h1><p>롯데백화점 광복점 2026.07.24 ~ 2026.08.06</p><li class="menu-item">퐁신 카스테라 8,000원</li></html>`,{status:200});
    if(parsed.searchParams.get('searchTerm')==='퐁신당') return new Response(card({newsId,title:'퐁신당 Pop-Up',venue:'백화점 광복점 B1 식품관',dates:'7.24 ~ 8.6'}),{status:200});
    return new Response('<html><title>검색 결과</title></html>',{status:200});
  };
  const rows=await collectLottePopups({
    rows:[['lotte:gwangbok:pongsindang','퐁신당 Pop-Up','롯데백화점 광복점','2026-07-24','2026-08-06','https://m.lotteshopping.com/search/searchResult?cstrCd=0333&searchTerm=-']],
    previous:[],today:'2026-08-05',fetchResilient,clean,decodeHtml,uniqueMenus,normalizedText,fast:true
  });
  assert.equal(rows[0].imageUrl,hero);
  assert.equal(rows[0].menus[0].name,'퐁신 카스테라');
  assert.equal(rows[0].menus[0].price,'8,000원');
  assert.equal(rows[0].contentSearch.checkedOfficialDetail,true);
  assert.equal(rows.sourceHealth.finalStatus,'recovered');
  assert.ok(requested.some(url=>new URL(url).searchParams.get('searchTerm')==='퐁신당'));
});
