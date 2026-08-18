const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

const homeUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';
const siteFeed = JSON.parse(readFileSync('data/popups.json', 'utf8'));
const readyPattern = /\d+개\s*진행\s*중/u;

test('팝업 discovery 홈의 핵심 탐색과 저장, 상세 진입이 동작한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero-slogan')).toHaveText('오늘 갈 푸드팝업');
  await expect(page.locator('.hero-description')).toContainText('전국 푸드팝업을가장 빠르게 찾는 곳');
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  await expect(page.locator('input[type="search"]:visible')).toHaveCount(1);
  expect(await page.locator('.popup-discovery-hero').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(510);
  await expect(page.locator('#today-discovery .discovery-popup-card').first()).toBeVisible();
  await expect(page.locator('#today-discovery h2')).toHaveText("Editor's Pick");
  const firstEditorCard = page.locator('#today-discovery .discovery-popup-card').first();
  const firstEditorId = await firstEditorCard.getAttribute('data-home-popup-id');
  const firstEditorPopup = siteFeed.popups.find(row => row.id === firstEditorId);
  const expectedEditorImage = firstEditorPopup.image || firstEditorPopup.imageUrl;
  if (expectedEditorImage) await expect(firstEditorCard.locator('img')).toHaveAttribute('src', expectedEditorImage);
  await expect(firstEditorCard.locator('.popup-region-badge')).toHaveText(/서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도/u);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const cutoff = new Date(`${today}T00:00:00+09:00`);
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const editorStartDates = await page.locator('#today-discovery .discovery-popup-card').evaluateAll((cards, feed) => cards.map(card => {
    const popup = feed.popups.find(row => row.id === card.dataset.homePopupId);
    return popup?.startDate;
  }), siteFeed);
  const isRecent = date => date >= cutoffDate && date <= today;
  const firstOlder = editorStartDates.findIndex(date => !isRecent(date));
  if (firstOlder >= 0) expect(editorStartDates.slice(firstOlder).some(isRecent)).toBe(false);
  const recentDates = editorStartDates.filter(isRecent);
  expect(recentDates).toEqual([...recentDates].sort((a, b) => b.localeCompare(a)));
  await expect(page.locator('#region-discovery, #category-discovery')).toHaveCount(0);
  await expect(page.locator('#popup-map')).toBeVisible();
  await expect(page.locator('#nearby-popups')).toHaveCount(0);

  const card = page.locator('#today-discovery .discovery-popup-card').first();
  const save = card.locator('[data-home-save]');
  const wasSaved = await save.getAttribute('aria-pressed');
  await save.click();
  await expect(page.locator('#today-discovery [data-home-save]').first()).toHaveAttribute('aria-pressed', wasSaved === 'true' ? 'false' : 'true');

  await page.locator('#today-discovery .discovery-popup-card').first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  await page.locator('#detail-modal [data-close]').click();

  await expect(page.locator('#new-this-week, #retailer-discovery, #brand-discovery, #department-discovery, #all-popups')).toHaveCount(0);
  await expect(page.locator('#today-discovery .popup-new-badge').first()).toHaveText('NEW');
  await page.locator('.popup-quick-actions [data-popup-quick="calendar"]').click();
  await expect(page.locator('#discover-title')).toHaveText('전체 푸드 팝업');
  await expect(page.locator('#restaurant-grid .popup-card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('내 주변은 지역 선택 후 ON/OFF 토글되고 URL과 결과가 복원된다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
  const allSummary = await page.locator('#result-summary').textContent();
  await expect(page.locator('#nearby-popups')).toHaveCount(0);
  await page.locator('.popup-quick-actions [data-popup-quick="nearby"]').click();
  await expect(page.locator('#nearby-region-picker')).toBeVisible();
  const region = await page.locator('#nearby-region option').last().getAttribute('value');
  await page.locator('#nearby-region').selectOption(region);
  await page.locator('#nearby-apply').click();
  await expect(page.locator('#nearby-popups')).toBeVisible();
  await expect(page.locator('#nearby-popups h2')).toHaveText('내 주변 팝업');
  await expect(page.locator('#discover-title')).toHaveText('전체 푸드 팝업');
  await expect(page.locator('#result-summary')).toHaveText(allSummary);
  const nearbyToggle = page.locator('.popup-quick-actions [data-popup-quick="nearby"]');
  await expect(nearbyToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(nearbyToggle).toHaveClass(/md-button--primary/u);
  await expect(page).toHaveURL(new RegExp(`nearby=${encodeURIComponent(region)}`, 'u'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
  await expect(page.locator('.popup-quick-actions [data-popup-quick="nearby"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#nearby-popups')).toBeVisible();
  await page.locator('.popup-quick-actions [data-popup-quick="nearby"]').click();
  await expect(page.locator('.popup-quick-actions [data-popup-quick="nearby"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/nearby=/u);
  await expect(page.locator('#discover-title')).toHaveText('전체 푸드 팝업');
  await expect(page.locator('#nearby-popups')).toHaveCount(0);
});

test('내 주변 지역 선택창은 버튼을 다시 누르면 닫힌다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
  const nearbyToggle = page.locator('.popup-quick-actions [data-popup-quick="nearby"]');
  await nearbyToggle.click();
  await expect(page.locator('#nearby-region-picker')).toBeVisible();
  await nearbyToggle.click();
  await expect(page.locator('#nearby-region-picker')).toBeHidden();
  await expect(nearbyToggle).toHaveAttribute('aria-pressed', 'false');
});

test('위치 권한이 이미 허용되면 가까운 지역 섹션을 자동 노출한다', async ({ context, page }) => {
  await context.grantPermissions(['geolocation'], { origin: new URL(homeUrl).origin });
  await context.setGeolocation({ latitude: 35.8714, longitude: 128.6014 });
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nearby-popups h2')).toHaveText('내 주변 팝업', { timeout: 15000 });
  await expect(page.locator('#nearby-popups .md-section-header p')).toContainText('대구', { timeout: 15000 });
  await expect(page.locator('#nearby-popups .discovery-popup-card').first()).toBeVisible();
});

test('지역과 카테고리 탐색 대신 실제 팝업 지도를 제공한다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  await expect(page.locator('#region-discovery, #category-discovery')).toHaveCount(0);
  await expect(page.locator('#popup-map-section h2')).toHaveText('푸드팝업 지도');
  await expect(page.locator('#popup-map')).toBeVisible();
  await expect(page.locator('#popup-map')).toHaveClass(/leaflet-container/u, { timeout: 15000 });
  await expect(page.locator('#popup-map .popup-location-marker').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#popup-map .leaflet-control-layers')).toHaveCount(0);
  await expect(page.locator('#popup-map .leaflet-control-scale')).toBeVisible();
  await expect(page.locator('#popup-map .popup-map-overview-control')).toHaveText('전국 보기');
  await expect(page.locator('#popup-map .leaflet-tile')).toHaveCount(0);
  expect(await page.locator('#popup-map .transit-line').count()).toBeGreaterThan(100);
  await expect(page.locator('#popup-map .transit-line-label').first()).toBeVisible();
  await expect(page.locator('#popup-map .popup-map-error')).toHaveCount(0);
});

test('Hero 검색은 자동완성과 기존 팝업 목록 검색을 유지한다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  const name = (await page.locator('#today-discovery .discovery-popup-card h3').first().textContent()).trim();
  await page.locator('#search-input').fill(name);
  await expect(page.locator('#suggestions button').first()).toBeVisible();
  await page.locator('#search-button').click();
  await expect(page.locator('#restaurant-grid .popup-card').filter({ hasText: name }).first()).toBeVisible();
});

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`${width}px에서 홈 레이아웃이 화면 밖으로 넘치지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('#today-discovery .discovery-popup-card').first()).toBeVisible();
    if (width < 768) await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
    else await expect(page.locator('.mobile-bottom-nav')).not.toBeVisible();
  });
}

test('Home은 단일 site-feed를 한 번만 읽고 Feed 필드로 카드를 렌더링한다', async ({ page }) => {
  const feedRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/data/popups.json')) feedRequests.push(request.url());
  });
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  expect(feedRequests).toHaveLength(1);
  expect(new URL(feedRequests[0]).origin).toBe(new URL(homeUrl).origin);

  const firstCard = page.locator('#today-discovery .discovery-popup-card').first();
  const id = await firstCard.getAttribute('data-home-popup-id');
  const feedRow = siteFeed.popups.find(row => row.id === id);
  expect(feedRow).toBeTruthy();
  await expect(firstCard.locator('.popup-card-brand')).toHaveText(feedRow.brand);
  await expect(firstCard.locator('h3')).toHaveText(feedRow.title);
  await expect(firstCard.locator('.popup-card-venue')).toHaveText(feedRow.venue);
  await expect(firstCard.locator('img')).toHaveAttribute('width', '560');
  await expect(page.locator('#today-discovery img').nth(1)).toHaveAttribute('loading', 'lazy');
});

test('오늘 종료는 종료일이 오늘인 Feed 행만 노출하고 지도는 활성 팝업을 입력으로 사용한다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const endingIds = new Set(siteFeed.popups.filter(row => row.endDate === today).map(row => row.id));
  const renderedEndingIds = await page.locator('#ending-today [data-home-popup-id]').evaluateAll(cards => cards.map(card => card.dataset.homePopupId));
  expect(renderedEndingIds.length).toBeGreaterThan(0);
  expect(renderedEndingIds.every(id => endingIds.has(id))).toBe(true);

  await expect(page.locator('#popup-map-section')).toBeVisible();
  await expect(page.locator('#region-discovery, #category-discovery')).toHaveCount(0);
});

test('Home 주요 제어는 ARIA, 키보드 포커스와 44px 터치 영역을 제공한다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  const controls = page.locator('.popup-quick-actions button, .discovery-taxonomy button, .section-more, .popup-save');
  const sizes = await controls.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(sizes.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
  await expect(page.locator('[data-popup-quick="nearby"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#today-discovery .popup-save').first()).toHaveAttribute('aria-label', /저장/u);

  const card = page.locator('#today-discovery .discovery-popup-card').first();
  await card.focus();
  expect(await card.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none');
  await card.press('Enter');
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
});

test('오늘 종료가 없으면 섹션을 숨기고 Feed가 비면 Premium Empty State를 표시한다', async ({ page }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let rows = siteFeed.popups.map(row => ({ ...row, endDate: row.endDate === today ? '2099-12-31' : row.endDate }));
  await page.route(/\/data\/popups\.json/u, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ updatedAt: siteFeed.updatedAt, popups: rows })
  }));
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  await expect(page.locator('#ending-today')).toHaveCount(0);

  rows = [];
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.home-premium-empty')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.home-premium-empty')).toContainText('새로운 푸드팝업을 확인하고 있어요');
});

test('1024px 노트북에서는 큰 카드 가로 탐색과 단순 헤더를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(readyPattern, { timeout: 15000 });
  await expect(page.locator('.desktop-discovery-nav')).not.toBeVisible();
  await expect(page.locator('#today-discovery .discovery-popup-card')).toHaveCount(8);
  const rail = await page.locator('#today-discovery .popup-card-rail').evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(rail.scrollWidth).toBeGreaterThan(rail.clientWidth);
  await page.locator('#menu-toggle').click();
  await expect(page.locator('#header-nav')).toBeVisible();
});
