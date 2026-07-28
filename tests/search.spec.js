const { test, expect } = require('@playwright/test');

test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', request => errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`));

  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').pressSequentially('고수경', { delay: 80 });
  const startedAt = Date.now();
  await page.locator('#search-button').click();
  await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 5000 });
  console.log('ELAPSED_MS', Date.now() - startedAt);
  console.log('SUMMARY', await page.locator('#result-summary').textContent());
  console.log('STATE', await page.locator('#app-state').textContent());
  console.log('CARDS', await page.locator('.restaurant-card h3').allTextContents());
  console.log('CARD_COUNT', await page.locator('.restaurant-card').count());
  console.log('ERRORS', errors);
  await expect(page.locator('#result-summary')).not.toContainText('0곳');
  expect(errors).toEqual([]);
});
