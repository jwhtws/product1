const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';
const siteFeed = JSON.parse(readFileSync('data/popups.json', 'utf8'));
const ready = page => expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });

test('site-feed 검색 필드와 고정 Search V2 결과가 연결된다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const popup = siteFeed.popups.find(row => row.status === 'ongoing' && row.title && row.brand && row.venue && row.branch && row.region && row.category && row.tags?.length);
  expect(popup).toBeTruthy();
  for (const query of [popup.title, popup.brand, popup.venue, popup.branch, popup.region, popup.category, popup.tags[0]]) {
    await page.locator('#popup-search-input').fill(query);
    await page.locator('#popup-search-input').press('Enter');
    await expect(page.locator('.popup-card').first()).toBeVisible();
    await expect(page.locator('#result-summary')).not.toContainText(/^0건/u);
  }
  const dockPosition = await page.locator('#popup-search-v2').evaluate(element => getComputedStyle(element).position);
  expect(dockPosition).toBe('sticky');
  await expect(page.locator('#popup-search-input')).toHaveAttribute('placeholder', '브랜드, 장소, 지역 검색');
  expect(errors).toEqual([]);
});

test('자동완성은 유형을 표시하고 8개 이하로 키보드 선택된다', async ({ page }) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const input = page.locator('#popup-search-input');
  await input.fill('서');
  const options = page.locator('#popup-search-suggestions [role="option"]');
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeLessThanOrEqual(8);
  await expect(options.first().locator('small')).toContainText(/브랜드|장소|지역|카테고리/u);
  await input.press('ArrowDown');
  const selected = page.locator('#popup-search-suggestions [aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const selectedLabel = await selected.locator('span').textContent();
  await input.press('Enter');
  await expect(input).toHaveValue(selectedLabel);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('최근 검색은 구조화 레코드로 10개만 브라우저에 보관된다', async ({ page }) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await ready(page);
  for (let index = 0; index < 11; index += 1) {
    await page.locator('#popup-search-input').fill(`검색어${index}`);
    await page.locator('#popup-search-submit').click();
  }
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem('meokdang-popup-recent-searches')));
  expect(recent).toHaveLength(10);
  expect(recent[0]).toMatchObject({ query: '검색어10', type: 'query' });
  expect(recent[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('#popup-recent-searches button')).toHaveCount(10);
  await expect(page.locator('#popup-popular-searches button').first()).toBeVisible();
});

test('지역·카테고리·상태·NEW·내 주변 필터와 네 정렬을 조합한다', async ({ page }) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const activeNew = siteFeed.popups.find(row => row.status === 'ongoing' && row.isNew);
  expect(activeNew).toBeTruthy();
  await page.locator('#popup-region-filter').selectOption(activeNew.region);
  await expect(page.locator('#popup-status-filter, #popup-ending-filter, #popup-new-filter, #popup-nearby-filter')).toHaveCount(0);
  await expect(page.locator('.popup-card').first()).toBeVisible();
  for (const sort of ['recommend', 'newest', 'ending', 'ended', 'upcoming', 'name']) {
    await page.locator('#popup-sort-filter').selectOption(sort);
    await expect(page.locator('.popup-card').first()).toBeVisible();
  }
  for (const category of ['dessert', 'bakery', 'meal', 'cafe', 'alcohol', 'snack']) {
    await page.locator('#popup-food-filter').selectOption(category);
    if (await page.locator('.popup-card').count()) break;
  }
  await expect(page.locator('#popup-food-filter')).not.toHaveValue('');
});

test('검색 없음 상태는 추천 행동을 제공하고 검색 중 추가 fetch가 없다', async ({ page }) => {
  const searchRequests = [];
  page.on('request', request => {
    if (/data\/popups\.json|restaurants\/search-pages|\/api\/search\?q=/u.test(request.url())) searchRequests.push(request.url());
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await ready(page);
  const baseline = searchRequests.length;
  await page.locator('#popup-search-input').fill('존재하지않는검색어987654321');
  await page.locator('#popup-search-submit').click();
  await expect(page.locator('.popup-search-empty')).toBeVisible();
  await expect(page.locator('[data-popup-empty-query]').first()).toBeVisible();
  await expect(page.locator('[data-popup-empty-focus="region"]')).toBeVisible();
  await expect(page.locator('[data-popup-empty-focus="category"]')).toBeVisible();
  await page.locator('#popup-search-input').fill('서울');
  await page.waitForTimeout(250);
  expect(searchRequests).toHaveLength(baseline);
  expect(searchRequests.filter(url => /data\/popups\.json/u.test(url))).toHaveLength(1);
});

for (const viewport of [
  { width: 320, height: 720 }, { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 768, height: 900 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }
]) {
  test(`${viewport.width}px에서 검색·필터가 접근 가능한 크기로 표시된다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.locator('#popup-search-v2').scrollIntoViewIfNeeded();
    await expect(page.locator('#popup-search-input')).toBeVisible();
    const submit = await page.locator('#popup-search-submit').boundingBox();
    expect(submit.height).toBeGreaterThanOrEqual(44);
    if (viewport.width <= 850) {
      await expect(page.locator('#popup-filters')).toBeVisible();
      await expect(page.locator('#filter-toggle')).not.toBeVisible();
    }
  });
}
