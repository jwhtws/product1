import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('일일 workflow가 한국시간 06:20에 단일 실행되고 실패를 알린다', async () => {
  const workflow = await readFile('.github/workflows/food-popup-refresh.yml', 'utf8');
  assert.match(workflow, /cron:\s*"20 21 \* \* \*"/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /group:\s*food-popup-refresh/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /run: node scripts\/refresh-popup-site-feed\.mjs/u);
  assert.doesNotMatch(workflow, /refresh-popup-site-feed\.mjs --strict/u);
  assert.match(workflow, /audit:data-sources/u);
  assert.match(workflow, /seo:build/u);
  assert.match(workflow, /verify-popup-deployment\.mjs/u);
  assert.match(workflow, /if:\s*failure\(\)/u);
  assert.match(workflow, /issues\.create/u);
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
  const [app, seo, payload] = await Promise.all([
    readFile('app.js', 'utf8'), readFile('scripts/build-seo-pages.mjs', 'utf8'),
    readFile('data/popups.json', 'utf8').then(JSON.parse)
  ]);
  assert.match(app, /new URL\('data\/popups\.json', location\.href\)/u);
  assert.match(app, /state\.popups = Array\.isArray\(popupData\.popups\)/u);
  assert.match(app, /state\.popups\.find\(item => item\.id ===/u);
  assert.match(seo, /readFileSync\('data\/popups\.json'/u);
  assert.ok(payload.popups.every(row => !/(?:fixture|example\.com|테스트)/iu.test(`${row.id} ${row.sourceUrl}`)));
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
  assert.match(app, /basemaps\.cartocdn\.com\/rastertiles\/voyager/u);
  assert.match(app, /detailedTiles\.on\('tileerror'/u);
  assert.match(app, /tile\.openstreetmap\.org/u);
  assert.match(app, /tile\.memomaps\.de\/tilegen/u);
  assert.match(app, /'대중교통 지도': transitTiles/u);
  assert.match(app, /L\.control\.scale/u);
  assert.match(app, /function loadPopupMapLibrary\(\)/u);
  assert.doesNotMatch(app, /fallbackPoint/u);
  assert.match(app, /const key = mapVenueName\(popup\) \|\| popup\.address/u);
  assert.doesNotMatch(app, /\.values\(\)\]\.slice\(0, 40\)/u);
  assert.doesNotMatch(app, /bindTooltip\(/u);
  assert.match(home, /<title>먹당 \| 전국 푸드팝업 일정·위치·지도<\/title>/u);
  assert.match(home, /<meta property="og:site_name" content="먹당">/u);
  assert.match(home, /"@type":"WebSite"[\s\S]*"name":"먹당"[\s\S]*"alternateName":\["먹당 푸드팝업","Mukdang","mukdang.com"\]/u);
  assert.match(home, />먹당<span> · 푸드팝업<\/span><\/a>/u);
  assert.doesNotMatch(home, />맛집 찾기<\/a>/u);
  assert.match(home, /"@type":"CollectionPage"[\s\S]*"about":\["푸드팝업","디저트 팝업스토어","백화점 팝업 일정"\]/u);
  assert.match(app, /\$\{rows\.length\}개 팝업 · \$\{markers\.length\}곳/u);
  assert.match(app, /\/api\/geocode\?address=.*&name=/u);
  assert.match(app, /popup\.latitude !== null[\s\S]*popup\.longitude !== null/u);
  assert.doesNotMatch(app, /id="region-discovery"/u);
  assert.doesNotMatch(app, /id="category-discovery"/u);
  assert.doesNotMatch(app, /const imageUrl = popup\.image \|\| fallbackImages/u);
  assert.match(app, /popup\.endDate === today/u);
  assert.doesNotMatch(app, /popupQuickFilter !== 'ending-today' \|\| popup\.isEndingSoon === true/u);
  assert.doesNotMatch(styles, /popup-card-rail>\.discovery-popup-card:nth-child\(n\+5\)\{display:none\}/u);
});

test('main 푸시는 Cloudflare Pages product1만 배포해 운영콘솔을 덮어쓰지 않는다', async () => {
  const workflow = await readFile('.github/workflows/cloudflare-pages-deploy.yml', 'utf8');
  assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/u);
  assert.match(workflow, /WRANGLER_OAUTH_CONFIG/u);
  assert.match(workflow, /project:[\s\S]*product1/u);
  assert.doesNotMatch(workflow, /project:[\s\S]*product2/u);
  assert.match(workflow, /pages deploy \. --project-name=\$\{\{ matrix\.project \}\} --branch=main/u);
  assert.match(workflow, /verify-popup-deployment\.mjs --url=https:\/\/mukdang\.com/u);
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
