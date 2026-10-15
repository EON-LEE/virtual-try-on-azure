import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function prepare(page, mode = 'upper') {
  const buffer = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const file = { name: 'synthetic-test.png', mimeType: 'image/png', buffer };
  await page.goto('/');
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('test');
  await page.locator('#unlock-form button').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#mode').selectOption(mode);
  await page.locator('#person').setInputFiles(file);
  if (mode !== 'lower') await page.locator('#upper').setInputFiles(file);
  if (mode !== 'upper') await page.locator('#lower').setInputFiles(file);
  await page.locator('#consent').check();
}

for (const mode of ['upper', 'lower', 'full']) {
  test(`${mode}: explicit selection, four columns, zoom and manual evaluation`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', cause => errors.push(cause.message));
    await prepare(page, mode);
    await expect(page.locator('#generate')).toBeDisabled();
    await page.locator('#select-mai').check();
    await expect(page.locator('#call-note')).toContainText('1회');
    const response = page.waitForResponse(res => res.url().endsWith('/api/jobs') && res.request().method() === 'POST');
    await page.locator('#generate').click();
    const job = await (await response).json();
    expect(job.mode).toBe(mode);
    expect(Object.keys(job.results)).toEqual(['mai']);
    await expect(page.locator('#mai-result')).toBeVisible();
    await expect(page.locator('#sunburst-result')).toBeHidden();
    await expect(page.locator('#status')).toContainText('완성');
    await expect(page.locator('#preview-grid > article')).toHaveCount(4);
    await page.locator('.result-cell').last().locator('summary').click();
    await expect(page.locator('#mai-verdict')).toHaveValue('');
    await page.locator('#mai-verdict').selectOption({ label: '수정 필요' });
    await page.locator('#mai-notes').fill('피부 색상과 로고가 달라 보임 · 수동 관찰');
    await page.locator('[data-zoom=mai-result]').click();
    await expect(page.locator('#zoom')).toBeVisible();
    await expect(page.locator('#zoom-image')).toHaveAttribute('src', /^blob:/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#zoom')).not.toBeVisible();
    await page.locator('#clear').click();
    await expect(page.locator('#before')).toBeHidden();
    await expect(page.locator('#mai-result')).toBeHidden();
    await expect(page.locator('#mai-notes')).toHaveValue('');
    expect(errors).toEqual([]);
  });
}

test('both models cost two calls; full mode requires both references', async ({ page }) => {
  await prepare(page);
  await page.locator('#mode').selectOption('full');
  await page.locator('#select-sunburst').check();
  await page.locator('#select-mai').check();
  await expect(page.locator('#generate')).toBeDisabled();
  const buffer = await sharp({ create: { width: 16, height: 24, channels: 3, background: '#ab5678' } }).png().toBuffer();
  await page.locator('#lower').setInputFiles({ name: 'lower.png', mimeType: 'image/png', buffer });
  await expect(page.locator('#call-note')).toContainText('2회');
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('완성');
  await expect(page.locator('#sunburst-result')).toBeVisible();
  await expect(page.locator('#mai-result')).toBeVisible();
  await page.locator('#clear').click();
});

test('mobile full references and clear during generation leave no stale output', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, 'full');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#select-sunburst').check();
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('만드는 중');
  await page.locator('#clear').click();
  await page.waitForTimeout(1800);
  await expect(page.locator('#sunburst-result')).toBeHidden();
  await expect(page.locator('#status')).toContainText('비웠습니다');
});

test('disabled settings cannot trigger generation', async ({ page }) => {
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.models.forEach(model => { model.ready = false; model.reason = 'inference-disabled'; });
    await route.fulfill({ response, json: config });
  });
  await prepare(page);
  await expect(page.locator('#connection')).toContainText('사용할 수 없습니다');
  await page.locator('#select-sunburst').check();
  await page.locator('#select-mai').check();
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#generate')).toBeDisabled();
});

test('login is separate, keyboard accessible and logout invalidates the session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('wrong');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#login-error')).toContainText('확인');
  await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#workspace')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#unlock')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  expect((await page.request.get('/api/config')).status()).toBe(200);
  expect((await (await page.request.get('/api/config')).json()).authenticated).toBe(false);
});
