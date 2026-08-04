const { test, expect } = require('@playwright/test');

const showcaseUrl = `${process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'}component-showcase/`;

test('디자인 시스템 쇼케이스의 테마와 공통 컴포넌트가 동작한다', async ({ page }) => {
  await page.goto(showcaseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible();
  await expect(page.locator('.md-card')).toHaveCount(6);

  const theme = page.locator('#theme-toggle');
  await theme.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme).toHaveAttribute('aria-pressed', 'true');

  await page.locator('[data-modal-open="demo-modal"]').click();
  await expect(page.locator('#demo-modal')).toBeVisible();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.locator('#demo-modal')).not.toBeVisible();

  await page.locator('#toast-button').click();
  await expect(page.getByRole('status').filter({ hasText: '저장 목록에 추가했어요.' })).toBeVisible();
});

test('모바일에서도 모든 주요 제어가 44px 이상이다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(showcaseUrl, { waitUntil: 'domcontentloaded' });
  for (const selector of ['.md-button--primary', '.md-chip', '.md-tab', '.md-bottom-nav a']) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
