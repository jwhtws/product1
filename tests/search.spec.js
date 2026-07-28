const { test, expect } = require('playwright/test');

test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  await page.locator('#search-input').fill('고수경');
  await page.locator('#search-button').click();
  await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#result-summary')).toContainText('2곳');
  expect(errors).toEqual([]);
});
