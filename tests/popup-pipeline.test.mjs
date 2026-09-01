import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('일일 workflow가 한국시간 06:20에 단일 실행되고 실패를 알린다', async () => {
  const workflow = await readFile('.github/workflows/food-popup-refresh.yml', 'utf8');
  assert.match(workflow, /cron:\s*"20 21 \* \* \*"/u);
  assert.match(workflow, /cron:\s*"20 22 \* \* \*"/u);
  assert.equal((workflow.match(/cron:/gu) || []).length, 2);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /group:\s*food-popup-refresh/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /run: node scripts\/refresh-popup-site-feed\.mjs/u);
  assert.match(workflow, /git add[^\n]*data\/popups-public\.json/u);
  assert.match(workflow, /git add[^\n]*data\/food-popups\/run-report\.json/u);
  assert.doesNotMatch(workflow, /refresh-popup-site-feed\.mjs --strict/u);
  assert.match(workflow, /audit:data-sources/u);
  assert.match(workflow, /seo:build/u);
  assert.match(workflow, /verify-popup-deployment\.mjs/u);
  assert.match(workflow, /if:\s*failure\(\)/u);
  assert.match(workflow, /issues\.create/u);
});

test('Shinsegae card thumbnails take priority over detail banners and stale local copies', async () => {
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  assert.match(collector, /const imagePath = String\(card\.imgUrl2 \|\| card\.imgUrl1 \|\| ''\)/u);
  assert.match(collector, /const imageUrl = cardImageUrl \|\| detailImages\[0\] \|\| ''/u);
  assert.match(collector, /officialImageUrls: \[\.\.\.new Set\(\[cardImageUrl, \.\.\.detailImages\]/u);
  assert.match(collector, /old\?\.imageOriginalUrl === normalized\.imageUrl/u);
  assert.match(collector, /imageOriginalUrl: normalized\.imageUrl/u);
});

test('collector 실패·0건·급감에서 기존 사용자 feed를 원자적으로 보존한다', async () => {
  const refresh = await readFile('scripts/refresh-popup-site-feed.mjs', 'utf8');
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  assert.match(refresh, /candidatePath/u);
  assert.match(refresh, /maxPublishDrop/u);
  assert.match(refresh, /rename\(candidatePath, outputPath\)/u);
  assert.match(refresh, /기존 공개 feed의 날짜 상태만 갱신/u);
  assert.match(refresh, /기존 공개 feed를 오늘 날짜 기준으로 배포/u);
  assert.match(refresh, /buildPopupSiteFeed\(\{ inputPath: outputPath, outputPath: candidatePath, reportPath \}\)/u);
  assert.match(collector, /기존 데이터 보존/u);
  assert.match(collector, /공식 수집 결과 급감 보호/u);
  assert.match(collector, /retainedPrevious/u);
});

test('Home·Search·Detail은 같은 운영 feed와 ID를 사용하고 fixture는 포함하지 않는다', async () => {
  const [app, seo, payload, publicPayload, rawFeed, publicFeed] = await Promise.all([
    readFile('app.js', 'utf8'), readFile('scripts/build-seo-pages.mjs', 'utf8'),
    readFile('data/popups.json', 'utf8').then(JSON.parse),
    readFile('data/popups-public.json', 'utf8').then(JSON.parse),
    readFile('data/popups.json', 'utf8'), readFile('data/popups-public.json', 'utf8')
  ]);
  assert.match(app, /new URL\('data\/popups-public\.json\?v=20260901-mobile-critical-path-1', location\.href\)/u);
  assert.doesNotMatch(app, /fetch\(popupFeedUrl, \{ cache: 'no-store' \}\)/u);
  assert.ok(app.indexOf("fetch('https://product2-ezo.pages.dev/api/popup-editorials'") > app.indexOf('resolveReady();'));
  assert.doesNotMatch(await readFile('index.html', 'utf8'), /vendor\/leaflet\/leaflet\.css/u);
  assert.match(app, /data-popup-map-styles/u);
  assert.match(app, /state\.popups = Array\.isArray\(popupData\.popups\)/u);
  assert.match(app, /state\.popups\.find\(item => item\.id ===/u);
  assert.match(seo, /readFileSync\('data\/popups\.json'/u);
  assert.ok(payload.popups.every(row => !/(?:fixture|example\.com|테스트)/iu.test(`${row.id} ${row.sourceUrl}`)));
  const published = payload.popups.filter(row => !row.publishStatus || row.publishStatus === 'published');
  assert.deepEqual(publicPayload.popups.map(row => row.id), published.map(row => row.id));
  assert.ok(publicPayload.popups.every(row => !('contentSearch' in row) && !('menuCandidates' in row) && !('imageCandidates' in row)));
  assert.ok(publicPayload.popups.every(row => Array.isArray(row.menus) && Array.isArray(row.officialImageUrls)));
  assert.ok(Buffer.byteLength(publicFeed) < Buffer.byteLength(rawFeed) * 0.35);
});

test('홈 추천은 최근 7일 시작을 최우선으로 하면서 출처를 고루 노출하고 오늘 종료를 정확히 비교한다', async () => {
  const [app, styles, home] = await Promise.all([readFile('app.js', 'utf8'), readFile('styles.css', 'utf8'), readFile('index.html', 'utf8')]);
  assert.match(app, /editorPickCutoff\.setDate\(editorPickCutoff\.getDate\(\) - 6\)/u);
  assert.match(app, /Number\(recentEditorPickStart\(b\)\) - Number\(recentEditorPickStart\(a\)\)/u);
  assert.match(app, /b\.startDate\.localeCompare\(a\.startDate\)/u);
  assert.match(app, /state\.popups\.filter\(popup => popupStatus\(popup\)\.key === 'active'\)/u);
  assert.match(app, /\$\('#popup-search-v2'\)\.hidden = true/u);
  assert.match(app, /hiddenPopupIds\.has\(popup\.id\)/u);
  assert.match(app, /new Set\(rankedEditorPicks\.filter\(recentEditorPickStart\)\.map\(popup => popup\.startDate\)\)/u);
  assert.match(app, /discoveryRail\('today-discovery', "Editor's Pick"/u);
  assert.match(app, /function popupThumbnailUrl\(popup\)/u);
  assert.match(app, /const imageUrl = popupThumbnailUrl\(popup\)/u);
  assert.match(app, /<div class="popup-region-badge">\$\{escapeHtml\(popupLocationLabel\(popup\)\)\}<\/div>/u);
  assert.match(app, /function renderPopupMap\(rows\)/u);
  assert.match(app, /vendor\/leaflet\/leaflet\.js/u);
  assert.doesNotMatch(app, /unpkg\.com\/leaflet/u);
  assert.doesNotMatch(app, /basemaps\.cartocdn\.com\/rastertiles\/voyager/u);
  assert.doesNotMatch(app, /L\.maplibreGL/u);
  assert.doesNotMatch(app, /vendor\/maplibre\/liberty-style\.json/u);
  assert.match(app, /tile\.openstreetmap\.org/u);
  assert.doesNotMatch(app, /World_Street_Map\/MapServer\/tile/u);
  assert.doesNotMatch(app, /World_Light_Gray_Base/u);
  assert.match(app, /maxNativeZoom: 19/u);
  assert.match(app, /maxZoom: 19/u);
  assert.match(app, /L\.tileLayer/u);
  assert.doesNotMatch(app, /data\/korea-transit-lines\.geojson/u);
  assert.doesNotMatch(app, /L\.geoJSON\(transitData/u);
  assert.doesNotMatch(app, /transit-station-label/u);
  assert.doesNotMatch(styles, /popup-location-marker>span:after/u);
  assert.match(app, /popupCount > 1/u);
  assert.match(app, /popup-location-marker-count/u);
  assert.match(app, /bindTooltip\(escapeHtml\(venueName\)/u);
  assert.match(styles, /white-space:nowrap!important/u);
  assert.doesNotMatch(app, /\['subway', 'commuter'\]\.includes\(feature\.properties\?\.kind\)/u);
  assert.doesNotMatch(app, /const placeLabels = \[/u);
  assert.doesNotMatch(app, /L\.control\.layers/u);
  assert.match(app, /L\.control\.scale/u);
  assert.doesNotMatch(app, /const capitalMarkers = markers\.filter/u);
  assert.match(app, /fitBounds\(allMarkerBounds, \{ maxZoom: 8 \}\)/u);
  assert.match(app, /function loadPopupMapLibrary\(\)/u);
  assert.doesNotMatch(app, /fallbackPoint/u);
  assert.match(app, /const key = mapVenueName\(popup\) \|\| popup\.address/u);
  assert.doesNotMatch(app, /\.values\(\)\]\.slice\(0, 40\)/u);
  assert.match(home, /<title>먹당 \| 전국 푸드팝업 일정·위치·지도<\/title>/u);
  assert.match(home, /<meta property="og:site_name" content="먹당">/u);
  assert.match(home, /"@type":"WebSite"[\s\S]*"name":"먹당"[\s\S]*"alternateName":\["먹당 푸드팝업","Mukdang","mukdang.com"\]/u);
  assert.match(home, />먹당<span> · 푸드팝업<\/span><\/a>/u);
  assert.doesNotMatch(home, />맛집 찾기<\/a>/u);
  assert.match(home, /"@type":"CollectionPage"[\s\S]*"about":\["푸드팝업","디저트 팝업스토어","백화점 팝업 일정"\]/u);
  assert.match(app, /\$\{rows\.length\}개 팝업 · \$\{markers\.length\}곳/u);
  assert.match(app, /\/api\/geocode\?address=.*&name=/u);
  assert.match(app, /\/api\/geocode\?query=/u);
  assert.match(app, /popupDistanceKm\(popup\) <= 15/u);
  assert.match(app, /popup\.latitude !== null[\s\S]*popup\.longitude !== null/u);
  assert.doesNotMatch(app, /id="region-discovery"/u);
  assert.doesNotMatch(app, /id="category-discovery"/u);
  assert.doesNotMatch(app, /const imageUrl = popup\.image \|\| fallbackImages/u);
  assert.match(app, /popup\.endDate === today/u);
  assert.doesNotMatch(app, /popupQuickFilter !== 'ending-today' \|\| popup\.isEndingSoon === true/u);
  assert.doesNotMatch(styles, /popup-card-rail>\.discovery-popup-card:nth-child\(n\+5\)\{display:none\}/u);
});

test('main 푸시는 사용자 사이트 product1만 배포해 운영콘솔을 덮어쓰지 않는다', async () => {
  const workflow = await readFile('.github/workflows/cloudflare-pages-deploy.yml', 'utf8');
  assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/u);
  assert.match(workflow, /pages deploy \. --project-name=product1 --branch=main/u);
  assert.doesNotMatch(workflow, /pages deploy \. --project-name=product2/u);
  assert.match(workflow, /verify-popup-deployment\.mjs --url=https:\/\/mukdang\.com/u);
  assert.doesNotMatch(workflow, /verify-popup-deployment\.mjs --url=https:\/\/product2-ezo\.pages\.dev/u);
});

test('종료 팝업도 운영 feed와 SEO 생성 대상에 보존한다', async () => {
  const [payload, seo] = await Promise.all([
    readFile('data/popups.json', 'utf8').then(JSON.parse),
    readFile('scripts/build-seo-pages.mjs', 'utf8')
  ]);
  assert.ok(payload.popups.some(row => row.status === 'ended'));
  assert.match(seo, /for \(const popup of detailPopups\)/u);
  assert.match(seo, /popupDetailLinks/u);
});

test('AK 수원점 이미지형 복합 행사를 개별 푸드팝업으로 분리한다', async () => {
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  for (const brand of ['더데일리브레드', '이스터서울', '카운팅스타', '앵그리포테이토', '청23', '버터앤츄']) {
    assert.match(collector, new RegExp(brand, 'u'));
  }
  assert.match(collector, /board\/event\/view\?store=02&seq=3378/u);
  assert.match(collector, /for \(const \[brand, menuName\] of event\.brands\)/u);
});

test('갤러리아 광교 이미지형 G.LAB 일정을 개별 푸드팝업으로 분리한다', async () => {
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  for (const brand of ['오이스', '조선 가마솥 옥수수', '미트충전소', '전주떡집']) {
    assert.match(collector, new RegExp(brand, 'u'));
  }
  assert.match(collector, /G0821_18\.jpg/u);
  assert.match(collector, /\['NEWOPENING_POPUP', 'PRODUCT_EVENT'\]/u);
});

test('일일 예약이 누락되면 독립 감시 workflow가 운영 피드를 확인하고 재실행한다', async () => {
  const watchdog = await readFile('.github/workflows/food-popup-refresh-watchdog.yml', 'utf8');
  assert.match(watchdog, /cron:\s*"20 23 \* \* \*"/u);
  assert.match(watchdog, /cron:\s*"20 0 \* \* \*"/u);
  assert.match(watchdog, /Asia\/Seoul/u);
  assert.match(watchdog, /popups-public\.json\?watchdog=/u);
  assert.match(watchdog, /if: steps\.freshness\.outputs\.fresh != 'true'/u);
  assert.match(watchdog, /gh workflow run food-popup-refresh\.yml --ref main -f scope=all/u);
});

test('갤러리아 전 지점의 복합 식품 일정은 브랜드별 팝업으로 분리한다', async () => {
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  for (const brand of ['고드니', '아티초크라보', '팡뮤제', '에밀리츄러스', '감자당', '김씨네타코', '산체', '간식채널']) {
    assert.match(collector, new RegExp(brand, 'u'));
  }
  assert.match(collector, /galleriaSplitSourceIds/u);
  assert.match(collector, /split_composite_parent/u);
  assert.match(collector, /luxuryhall:c86469/u);
  assert.match(collector, /timeworld:c86376/u);
});

test('더현대 대구는 공식 검색 카드만 쓰고 테이블웨어 팝업을 제외한다', async () => {
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  assert.doesNotMatch(collector, /blog\.naver\.com|verified-field|현장 방문 기록/u);
  assert.match(collector, /hyundaiNonFoodSourceIds = new Set\(\['E4602608498344'\]\)/u);
  for (const seed of ['쫀득네모네', '너로다', '밀크번', '브루클린', '미담', '브라더']) {
    assert.match(collector, new RegExp(seed, 'u'));
  }
});
