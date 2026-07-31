const { test, expect } = require('@playwright/test');

test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`));

  await page.goto(process.env.TEST_BASE_URL || 'https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').pressSequentially('고수경', { delay: 80 });
  const startedAt = Date.now();
  await page.locator('#search-button').click();
  await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 5000 });
  console.log('ELAPSED_MS', Date.now() - startedAt);
  console.log('SUMMARY', await page.locator('#result-summary').textContent());
  console.log('STATE', await page.locator('#app-state').textContent());
  console.log('CARDS', await page.locator('.restaurant-card h3').allTextContents());
  console.log('CARD_COUNT', await page.locator('.restaurant-card').count());
  await page.locator('.restaurant-card').filter({ hasText: '고수경샤브칼국수' }).first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/);
  console.log('DETAIL', await page.locator('#modal-content').innerText());
  await expect(page.locator('.permit-highlight')).toBeVisible();
  await expect(page.locator('.permit-highlight')).toContainText('21년 영업 중');
  await expect(page.locator('.permit-highlight')).toContainText('2004년 9월 30일');
  await expect(page.locator('#modal-content')).toContainText('공공 인허가 기록 확인');
  await expect(page.locator('.restaurant-card').first().locator('.tenure-badge')).toContainText('21년 영업 중');
  console.log('ERRORS', errors);
  await expect(page.locator('#result-summary')).not.toContainText('0곳');
  expect(errors).toEqual([]);
});

test('상호 중간 단어와 지점명으로도 공공데이터 식당을 찾는다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'https://product1-84t.pages.dev/', { waitUntil: 'domcontentloaded' });
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
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.locator('#search-input').fill(example.query);
    await page.locator('#search-button').click();
    await expect(page.locator('.restaurant-card').filter({ hasText: example.expected }).first())
      .toBeVisible({ timeout: 15000 });
  });
}

test('인허가일이 없는 실제 장소도 숨기지 않고 재확인 상태를 표시한다', async ({ page }) => {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
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
  await expect(page.locator('#modal-content')).toContainText('운영 기간');
  await expect(page.locator('#modal-content .popup-detail-cover')).toBeVisible();
  await expect(page.locator('#modal-content .site-plan')).toHaveCount(0);
});
