const { test, expect } = require('@playwright/test');

const homeUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';

test('팝업 discovery 홈의 핵심 탐색과 저장, 상세 진입이 동작한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/오늘 진행 중 \d+개/u, { timeout: 15000 });
  await expect(page.locator('#today-discovery .discovery-popup-card').first()).toBeVisible();
  await expect(page.locator('#region-discovery [data-region-filter]')).not.toHaveCount(0);

  const card = page.locator('#today-discovery .discovery-popup-card').first();
  const save = card.locator('[data-home-save]');
  const wasSaved = await save.getAttribute('aria-pressed');
  await save.click();
  await expect(page.locator('#today-discovery [data-home-save]').first()).toHaveAttribute('aria-pressed', wasSaved === 'true' ? 'false' : 'true');

  await page.locator('#today-discovery .discovery-popup-card').first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/open/u);
  await page.locator('#detail-modal [data-close]').click();

  await expect(page.locator('#new-this-week')).toHaveCount(0);
  await expect(page.locator('#all-popups .discovery-popup-card').first()).toBeVisible();
  await expect(page.locator('#all-popups .popup-new-badge').first()).toHaveText('NEW');
  await page.locator('#all-popups [data-section-more]').click();
  await expect(page.locator('#discover-title')).toHaveText('전체 푸드 팝업');
  expect(errors).toEqual([]);
});

test('내 주변은 지역 선택 후 ON/OFF 토글되고 URL과 결과가 복원된다', async ({ page }) => {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
  await page.locator('.popup-quick-actions [data-popup-quick="nearby"]').click();
  await expect(page.locator('#nearby-region-picker')).toBeVisible();
  const region = await page.locator('#nearby-region option').last().getAttribute('value');
  await page.locator('#nearby-region').selectOption(region);
  await page.locator('#nearby-apply').click();
  await expect(page.locator('#discover-title')).toContainText(region);
  const nearbyToggle = page.locator('.popup-quick-actions [data-popup-quick="nearby"]');
  await expect(nearbyToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(nearbyToggle).toHaveClass(/md-button--primary/u);
  await expect(page).toHaveURL(new RegExp(`nearby=${encodeURIComponent(region)}`, 'u'));
  const filteredSummary = await page.locator('#result-summary').textContent();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#active-popup-count')).toContainText(/\d+개/u, { timeout: 15000 });
  await expect(page.locator('.popup-quick-actions [data-popup-quick="nearby"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.popup-quick-actions [data-popup-quick="nearby"]').click();
  await expect(page.locator('.popup-quick-actions [data-popup-quick="nearby"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/nearby=/u);
  await expect(page.locator('#discover-title')).toHaveText('전체 푸드 팝업');
  await expect(page.locator('#result-summary')).not.toHaveText(filteredSummary);
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

for (const width of [320, 375, 390, 768, 1440]) {
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
