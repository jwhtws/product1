const { test, expect } = require('@playwright/test');

test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    if (/static\.cloudflareinsights\.com|cdn\.jsdelivr\.net/u.test(request.url())) return;
    errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`);
  });

  await page.goto(process.env.TEST_DEPLOY_BASE_URL || 'https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '식당' }).click();
  await page.locator('#search-input').pressSequentially('고수경', { delay: 80 });
  const startedAt = Date.now();
  await page.locator('#search-button').click();
  const target = page.locator('.restaurant-card').filter({ hasText: '고수경샤브칼국수' }).filter({ has: page.locator('.tenure-badge').filter({ hasText: '21년 영업 중' }) }).first();
  await expect(target).toBeVisible({ timeout: 5000 });
  console.log('ELAPSED_MS', Date.now() - startedAt);
  console.log('SUMMARY', await page.locator('#result-summary').textContent());
  console.log('STATE', await page.locator('#app-state').textContent());
  console.log('CARDS', await page.locator('.restaurant-card h3').allTextContents());
  console.log('CARD_COUNT', await page.locator('.restaurant-card').count());
  await target.click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/);
  console.log('DETAIL', await page.locator('#modal-content').innerText());
  await expect(page.locator('.permit-highlight')).toBeVisible();
  await expect(page.locator('.permit-highlight')).toContainText('21년 영업 중');
  await expect(page.locator('.permit-highlight')).toContainText('2004년 9월 30일');
  await expect(page.locator('#modal-content')).toContainText('공공 인허가 기록 확인');
  await expect(target.locator('.tenure-badge')).toContainText('21년 영업 중');
  console.log('ERRORS', errors);
  await expect(page.locator('#result-summary')).not.toContainText('0곳');
  expect(errors).toEqual([]);
});

test('상호 중간 단어와 지점명으로도 공공데이터 식당을 찾는다', async ({ page }) => {
  await page.goto(process.env.TEST_DEPLOY_BASE_URL || 'https://product1-84t.pages.dev/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '식당' }).click();
  await page.locator('#search-input').fill('황토장어 본점');
  await page.locator('#search-button').click();
  const target = page.locator('.restaurant-card').filter({ hasText: '효천황토장어' }).first();
  await expect(target).toBeVisible({ timeout: 10000 });
  await expect(target).toContainText('경기도 의왕시 능안길 2');
  await expect(page.locator('body')).not.toContainText('AI 대표 이미지');
  await target.click();
  await expect(page.locator('#modal-content')).toContainText('효천황토장어');
  await expect(page.locator('#modal-content')).toContainText('2014년 2월 26일');
});

for (const example of [
  { query: '또치', expected: '신도림테크노마트 10층 50호' },
  { query: '미진', expected: '광화문 미진' }
]) {
  test(`두 글자 상호 검색: ${example.query} → ${example.expected}`, async ({ page }) => {
    await page.goto(process.env.TEST_DEPLOY_BASE_URL || 'https://product1-84t.pages.dev/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '식당' }).click();
    await page.locator('#search-input').fill(example.query);
    await page.locator('#search-button').click();
    await expect(page.locator('.restaurant-card').filter({ hasText: example.expected }).first())
      .toBeVisible({ timeout: 15000 });
  });
}

test('인허가일이 없는 실제 장소도 숨기지 않고 재확인 상태를 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_DEPLOY_BASE_URL || 'https://product1-84t.pages.dev/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '식당' }).click();
  await page.locator('#search-input').fill('또치');
  await page.locator('#search-button').click();
  const target = page.locator('.restaurant-card').filter({ hasText: '신도림테크노마트 10층 50호' }).first();
  await expect(target).toContainText('인허가일 확인 중');
  await target.click();
  await expect(page.locator('.permit-highlight')).toContainText('공공 원장에 없음');
  await expect(page.locator('.permit-highlight')).toContainText('매일 재확인');
});

test('뒤로가기는 사이트를 나가지 않고 이전 화면 단계만 닫는다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  const appUrl = page.url();

  await page.locator('[data-search-mode="restaurant"]').click();
  await page.goBack();
  await expect(page.locator('[data-search-mode="popup"]')).toHaveClass(/active/);

  await page.goBack();
  await expect(page).toHaveURL(appUrl);
  await expect(page.locator('[data-search-mode="popup"]')).toHaveClass(/active/);
});

test('푸드 팝업은 썸네일 카드에서 상세 페이지로 이동한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  const popup = page.locator('.popup-card').first();
  await expect(popup).toBeVisible();
  await popup.click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/);
  await expect(page.locator('#modal-content')).toContainText('메뉴');
  await expect(page.locator('#modal-content')).toContainText('리뷰');
  await expect(page.locator('#modal-content')).toContainText('도로명주소');
  await expect(page.locator('#modal-content')).toContainText('영업일자');
  await expect(page.locator('.popup-detail-right > section').filter({ hasText: '메뉴' }).first()).toBeVisible();
  await expect(page.locator('.popup-detail-right > section').filter({ hasText: '리뷰' }).first()).toBeVisible();
  await expect(page.locator('#modal-content .popup-detail-cover')).toBeVisible();
  await expect(page.locator('#modal-content .site-plan')).toHaveCount(0);
});

test('팝업 사진과 이름 클릭은 동일한 상세 화면을 연다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  const card = page.locator('.popup-card').first();
  const expectedName = (await card.locator('h3').textContent()).trim();

  await card.locator('.listing-photo').click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  await expect(page.locator('#detail-title')).toHaveText(expectedName);
  await page.locator('#detail-modal [data-close]').click();

  await card.locator('h3 a').click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  await expect(page.locator('#detail-title')).toHaveText(expectedName);
  await expect(page).toHaveURL(/\/$/u);
});

test('종료일이 지난 팝업은 카드와 상세 화면에 종료로 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  for (let pageIndex = 0; pageIndex < 10 && await page.locator('.popup-card.popup-ended').count() === 0; pageIndex += 1) {
    const next = page.locator('[data-popup-page="1"]');
    if (!await next.isEnabled()) break;
    await next.click();
  }
  const endedPopup = page.locator('.popup-card.popup-ended').first();
  await expect(endedPopup).toBeVisible();
  await expect(endedPopup.locator('.popup-status')).toHaveText('종료');
  await endedPopup.click();
  await expect(page.locator('.popup-detail-status.popup-ended strong')).toHaveText('종료');
  await expect(page.locator('#result-summary')).toContainText(/종료\s+\d+/u);
});

test('종료된 팝업은 모든 정렬에서 영업 중 팝업 뒤로 배치한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  for (const sort of ['food', 'status', 'ending', 'newest', 'start']) {
    await page.locator('#popup-sort-filter').selectOption(sort);
    await expect(page.locator('.popup-card')).toHaveCount(24);
    await expect(page.locator('.popup-card.popup-ended')).toHaveCount(0);
  }
});

test('팝업 카드에서 시·도 지역을 굵고 명확하게 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  const badge = page.locator('.popup-card .popup-region-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/(특별시|광역시|특별자치도|경기도|충청북도)/u);
  const typography = await badge.evaluate(element => {
    const style = getComputedStyle(element);
    return { fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) };
  });
  expect(typography.fontSize).toBeGreaterThanOrEqual(13);
  expect(typography.fontWeight).toBeGreaterThanOrEqual(800);
});

test('공식 상세 페이지의 대표메뉴와 가격을 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  const popup = page.locator('.popup-card').filter({ hasText: '3층 다락빵' }).first();
  await expect(popup).toBeVisible({ timeout: 15000 });
  await popup.click();
  await expect(page.locator('.popup-menu-section')).toContainText('초코칩 씬쿠키');
  await expect(page.locator('.popup-menu-section')).toContainText('3,300원');
});

test('카드형 공식 상품도 메뉴와 가격으로 변환한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  await page.locator('#search-input').fill('우베리');
  await page.locator('#search-button').click();
  const popup = page.locator('.popup-card').filter({ hasText: '우베리상하이모찌' }).first();
  await expect(popup).toBeVisible({ timeout: 15000 });
  await popup.click();
  await expect(page.locator('.popup-menu-section')).toContainText('우베리 피스타치오 모찌');
  await expect(page.locator('.popup-menu-section')).toContainText('11,900원');
});

test('성북당 공식 상세의 모든 상품 블록을 합쳐 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  await page.locator('#search-input').fill('성북당');
  await page.locator('#search-button').click();
  await page.locator('.popup-card').filter({ hasText: '성북당 십원빵' }).click();
  const menu = page.locator('.popup-menu-section');
  for (const item of ['불닭/갈릭', '오리지널 치즈', '팥', '옥수수 치즈']) await expect(menu).toContainText(item);
  await expect(menu.locator('li')).toHaveCount(4);
});

test('롯데 팝업은 사진과 대표 품목을 비워두지 않는다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').fill('글라쇼');
  await page.locator('#search-button').click();
  const popup = page.locator('.popup-card').filter({ hasText: '글라쇼 수제 아이스크림' });
  await expect(popup.locator('.listing-photo')).toHaveAttribute('style', /background-image:url\(['"]?(?:https:\/\/|assets\/food\/)/u);
  await popup.click();
  await expect(page.locator('.popup-menu-section')).toContainText('아이스크림');
  await expect(page.locator('.popup-menu-section li').first()).toBeVisible();
});

test('롯데 공식 링크는 공식 상세 또는 표시 지점 검색으로 연결된다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').fill('너구리베이글');
  await page.locator('#search-button').click();
  await page.locator('.popup-card').filter({ hasText: '너구리베이글' }).click();
  const official = page.locator('.detail-actions a.primary');
  const href = await official.getAttribute('href');
  expect(href).toMatch(/\/shpgnews\/shpgnewsDetail\?shpgNewsNo=SNM\d+|cstrCd=0028.*searchTerm=%EB%84%88%EA%B5%AC%EB%A6%AC%EB%B2%A0%EC%9D%B4%EA%B8%80/u);
  await expect(page.locator('#modal-content')).toContainText('롯데백화점 건대스타시티점');
});

test('모바일에서 푸드 팝업 필터를 열고 적용한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#popup-filters')).not.toBeVisible();
  await page.locator('#filter-toggle').click();
  await expect(page.locator('#popup-filters')).toBeVisible();
  await expect(page.locator('#filter-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#popup-food-filter').selectOption('bakery');
  await expect(page.locator('.popup-card').first()).toBeVisible();
});

test('상세 화면은 이전 스크롤 위치와 무관하게 맨 위에서 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#search-button')).toBeEnabled({ timeout: 15000 });
  await page.locator('.popup-card').first().click();
  const modal = page.locator('#detail-modal .modal');
  await modal.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.locator('#detail-modal [data-close]').click();
  await page.locator('.popup-card').nth(1).click();
  await expect.poll(() => modal.evaluate(element => element.scrollTop)).toBe(0);
});
