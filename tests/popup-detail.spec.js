const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';
const feed = JSON.parse(readFileSync('data/popups.json', 'utf8'));
const date = offset => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const seed = feed.popups[0];
const popup = (id, overrides = {}) => ({
  ...seed,
  id,
  name: `상세 테스트 ${id}`,
  title: `상세 테스트 ${id}`,
  brand: '테스트 브랜드',
  venue: 'AK플라자 수원점',
  branch: 'AK플라자 수원점',
  address: '경기도 수원시 팔달구 덕영대로 924',
  region: '서울특별시',
  category: 'food-popup',
  startDate: date(-1),
  endDate: date(3),
  status: 'ongoing',
  dDay: 3,
  isNew: false,
  isEndingSoon: false,
  menus: [{ name: '테스트 메뉴', price: '5,000원' }],
  menuItems: ['테스트 메뉴'],
  editorialDescription: '공식 자료를 교차 확인해 작성한 **테스트 브랜드** 소개글이다.',
  officialImageUrls: seed.imageUrl ? [seed.imageUrl] : [],
  ...overrides
});
const fixtures = [
  popup('active-new', { isNew: true }),
  popup('active-related', { venue: '다른 장소', address: '서울특별시 마포구 테스트로 2' }),
  popup('regional-map', { venue: '부산 테스트 행사장', branch: '부산 테스트 행사장', address: '부산광역시 부산진구 중앙대로 672', latitude: null, longitude: null }),
  popup('upcoming', { brand: '예정 브랜드', startDate: date(3), endDate: date(8), status: 'upcoming', dDay: 3 }),
  popup('ended', { brand: '테스트 브랜드', startDate: date(-8), endDate: date(-1), status: 'ended', dDay: -1 }),
  popup('missing', { brand: '빈 상태 브랜드', image: '', imageUrl: '', officialImageUrls: [], imageSource: 'official-image-unavailable', menus: [], menuItems: [], address: '', sourceUrl: '', officialUrl: '' })
];

async function openFixture(page, id) {
  await page.locator('#search-input').fill(`상세 테스트 ${id}`);
  await page.locator('#search-button').click();
  const card = page.locator(`[data-popup-id="${id}"]`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  return card;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedPopup = data; } });
  });
  await page.route(/\/data\/popups(?:-public)?\.json/u, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...feed, updatedAt: new Date().toISOString(), popups: fixtures })
  }));
  await page.route(/(?:\/data\/popup-editorials\.json|\/api\/popup-editorials)/u, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ editorials: Object.fromEntries(fixtures.map(item => [item.id, { description: item.editorialDescription }])) })
  }));
  await page.route(/\/api\/geocode/u, route => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get('query')) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ found: false }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ latitude: 35.1796, longitude: 129.0756, provider: 'test', label: '부산 테스트 행사장' }) });
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
});

test('상세 구조, 날짜 상태, 저장·공유·관련 팝업·오류 신고가 연결된다', async ({ page }) => {
  const card = await openFixture(page, 'active-new');
  await expect(page.locator('#detail-title')).toBeFocused();
  await expect(page.locator('.popup-detail-state')).toHaveText('진행 중');
  await expect(page.locator('.popup-detail-badges')).toContainText(/D-|오늘 종료/u);
  await expect(page.locator('.popup-detail-new')).toHaveText('NEW');
  expect(await page.locator('.popup-detail-summary dt').evaluateAll(labels => labels.map(label => label.firstChild.textContent))).toEqual(['장소·지점', '기간', '주소']);
  await expect(page.locator('.popup-primary-actions').getByText('길찾기', { exact: true })).toHaveAttribute('target', '_blank');
  await expect(page.locator('.popup-primary-actions').getByText('공식 정보', { exact: true })).toHaveAttribute('rel', /noopener noreferrer/u);
  await expect(page.locator('.popup-detail-location')).toBeVisible();
  await expect(page.locator('#popup-detail-map')).toHaveClass(/leaflet-container/u, { timeout: 15000 });
  const detailMapSize = await page.locator('#popup-detail-map').boundingBox();
  expect(detailMapSize.height).toBeGreaterThanOrEqual(198);
  expect(detailMapSize.width).toBeGreaterThan(250);
  await expect(page.locator('#popup-detail-map .leaflet-control-zoom')).toBeVisible();
  await expect(page.locator('#popup-detail-map')).toHaveClass(/leaflet-grab/u);
  await expect(page.locator('.official-food-photo-grid img').first()).toHaveAttribute('loading', 'lazy');
  await expect(page.locator('.popup-editorial .popup-editorial-description')).toHaveText(/테스트 브랜드 소개글/u);
  await expect(page.locator('.popup-editorial .popup-editorial-description strong')).toHaveText('테스트 브랜드');
  expect(await page.locator('#related-popups .discovery-popup-card').count()).toBeLessThanOrEqual(6);
  await expect(page.locator('#related-popups')).toBeVisible();

  await page.locator('.popup-primary-actions [data-popup-save]').click();
  await expect(page.locator('[data-popup-save="active-new"]')).toHaveCount(2);
  expect(await page.locator('[data-popup-save="active-new"]').evaluateAll(buttons => buttons.every(button => button.getAttribute('aria-pressed') === 'true'))).toBe(true);
  await expect(page.locator('[data-search-save="active-new"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#saved-count')).toHaveText('1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('meokdang-saved')))).toEqual(['popup:active-new']);

  await page.locator('#popup-share').click();
  expect(await page.evaluate(() => window.__sharedPopup?.text)).toContain('상세 테스트 active-new');
  await page.locator('[data-popup-report]').click();
  await expect(page.locator('#panel-modal')).toHaveClass(/open/u);
  await expect(page.locator('#panel-modal [name="팝업ID"]')).toHaveValue('active-new');
  await expect(page.locator('#panel-modal [name="신고사유"] option')).toHaveCount(6);

  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-modal')).not.toHaveClass(/open/u);
  await expect(card).toBeFocused();
});

test('등록 좌표가 없는 서울 외 주소도 지오코딩해 상세 지도를 표시한다', async ({ page }) => {
  await openFixture(page, 'regional-map');
  await expect(page.locator('#popup-detail-map')).toHaveClass(/leaflet-container/u, { timeout: 15000 });
  await expect(page.locator('#popup-detail-map .popup-detail-location-marker')).toBeVisible();
});

test('예정·종료·빈 상태와 뒤로가기 focus 복귀를 처리한다', async ({ page }) => {
  let card = await openFixture(page, 'upcoming');
  await expect(page.locator('.popup-detail-state')).toHaveText('오픈 예정');
  await expect(page.locator('.popup-detail-badges')).toContainText('오픈 D-');
  await expect(page.locator('.popup-detail-new')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#detail-modal')).not.toHaveClass(/open/u);
  await expect(card).toBeFocused();

  await openFixture(page, 'ended');
  await expect(page.locator('.popup-detail-state')).toHaveText('종료');
  await expect(page.locator('.popup-detail-badges')).toContainText('종료됨');
  await expect(page.locator('.popup-ended-actions')).toContainText('현재 진행 중인 비슷한 팝업 보기');
  await expect(page.locator('[data-all-popups]')).toBeVisible();
  await page.keyboard.press('Escape');

  await openFixture(page, 'missing');
  await expect(page.locator('.popup-detail-image-empty')).toContainText('공식 대표 이미지 미공개');
  await expect(page.locator('.popup-menu-empty')).toHaveText('메뉴는 공식 공지에서 확인해 주세요.');
  await expect(page.locator('.official-food-photos')).toHaveCount(0);
  await expect(page.locator('.popup-editorial .popup-editorial-description')).toHaveText(/테스트 브랜드 소개글/u);
  await expect(page.locator('.popup-primary-actions').getByText('길찾기', { exact: true })).toBeDisabled();
  await expect(page.locator('.popup-primary-actions').getByText('공식 정보', { exact: true })).toHaveCount(0);
});

test('390px 모바일 고정 CTA는 44px 이상이고 리뷰 입력 중 숨겨진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, 'active-new');
  const mobileCta = page.locator('.popup-mobile-cta');
  await expect(mobileCta).toBeVisible();
  const ctaBox = await mobileCta.boundingBox();
  expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(844);
  expect(ctaBox.y).toBeGreaterThan(700);
  await mobileCta.locator('a,button').first().click({ trial: true });
  const sizes = await mobileCta.locator('a,button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
  expect(sizes.every(height => height >= 44)).toBe(true);
  await page.locator('#review-form textarea').focus();
  await expect(mobileCta).toBeHidden();
  await page.locator('#detail-title').focus();
  await expect(mobileCta).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
