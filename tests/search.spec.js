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
