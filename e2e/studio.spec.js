import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function prepare(page) {
  const buffer = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const file = { name: 'synthetic-test.png', mimeType: 'image/png', buffer };
  await page.goto('/');
  await page.locator('#person').setInputFiles(file);
  await page.locator('#garment').setInputFiles(file);
  await page.locator('#consent').check();
}

test('explicit selection, ordered inputs, real response preview and clearing', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await prepare(page);
  await expect(page.locator('#generate')).toBeDisabled();
  await page.locator('input[value=mai]').check();
  const response = page.waitForResponse(res => res.url().endsWith('/api/jobs') && res.request().method() === 'POST');
  await page.locator('#generate').click();
  expect(Object.keys((await (await response).json()).results)).toEqual(['mai']);
  await expect(page.locator('#after')).toBeVisible();
  await expect(page.locator('#after-label')).toContainText('MAI');
  await expect(page.locator('#result-tabs button')).toHaveCount(1);
  await expect(page.locator('#status')).toContainText('생성 완료');
  await expect(page.locator('#download')).toBeVisible();
  await page.locator('#clear').click();
  await expect(page.locator('#before')).toBeHidden();
  await expect(page.locator('#after')).toBeHidden();
  await expect(page.locator('#generate')).toBeDisabled();
  expect(failures).toEqual([]);
});

test('two model results compare without triggering another generation', async ({ page }) => {
  let calls = 0;
  page.on('request', req => { if (req.url().endsWith('/api/jobs') && req.method() === 'POST') calls++; });
  await prepare(page);
  await page.locator('input[value=sunburst]').check();
  await page.locator('input[value=mai]').check();
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('생성 완료');
  await page.locator('#compare').click();
  await expect(page.locator('#extra')).toBeVisible();
  await page.locator('#result-tabs button[data-model=mai]').click();
  await expect(page.locator('#after-label')).toContainText('MAI');
  expect(calls).toBe(1);
  await page.locator('#clear').click();
});

test('mobile upload and clear during generation leave no stale result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('input[value=sunburst]').check();
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('호출 중');
  await page.locator('#clear').click();
  await page.waitForTimeout(1800);
  await expect(page.locator('#after')).toBeHidden();
  await expect(page.locator('#status')).toContainText('비웠습니다');
  await expect(page.locator('#generate')).toBeDisabled();
});

test('disconnected model settings do not enable generation or imply successful results', async ({ page }) => {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.models.forEach(model => { model.ready = false; model.reason = 'inference-disabled'; });
    await route.fulfill({ response, json: config });
  });
  await prepare(page);
  await expect(page.locator('#connection')).toContainText('미연결');
  await expect(page.locator('input[value=sunburst]')).toBeDisabled();
  await expect(page.locator('input[value=mai]')).toBeDisabled();
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#after')).toBeHidden();
});
