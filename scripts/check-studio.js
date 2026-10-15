import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const origin = process.argv[2];
const url = new URL(origin);
assert.ok(url.protocol === 'https:' || url.hostname === '127.0.0.1');
const directory = resolve('.local-deploy', 'studio-preview');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const failures = [];
let submissions = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => failures.push(error.name));
  page.on('response', response => {
    if (response.status() >= 400 && response.request().method() === 'GET') failures.push(`http-${response.status()}`);
  });
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/api/jobs')) submissions++;
  });
  assert.equal((await page.request.get(`${origin}/healthz`, { timeout: 90_000 })).status(), 200);
  assert.equal((await page.request.get(`${origin}/api/samples/manifest`)).status(), 401);
  assert.equal((await page.request.get(`${origin}/api/samples/viton-person-00690_00.jpg`)).status(), 401);
  assert.equal((await page.request.post(`${origin}/api/jobs`, {
    headers: { origin, 'x-studio-request': '1' }
  })).status(), 401);
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.locator('#unlock')).toBeVisible();
  await expect(page.locator('#unlock img, #unlock a')).toHaveCount(0);
  await page.screenshot({ path: resolve(directory, 'login-desktop.png'), fullPage: true });
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('wrong');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#login-error')).toContainText('확인');
  await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.sample')).toHaveCount(14);
  await expect(page.locator('#connection')).toContainText('피팅 준비 완료');
  const config = await (await page.request.get(`${origin}/api/config`)).json();
  assert.ok(config.authenticated && config.models.every(model => model.ready));
  const cookies = await page.context().cookies(origin);
  assert.ok(cookies.some(cookie => cookie.name === 'studio' &&
    cookie.secure === (url.protocol === 'https:') && cookie.httpOnly && cookie.sameSite === 'Strict'));
  const upload = { name: 'synthetic-ui-check.png', mimeType: 'image/png',
    buffer: await sharp({ create: { width: 32, height: 64, channels: 3, background: '#b5b9cb' } }).png().toBuffer() };
  for (const mode of ['upper', 'lower', 'full']) {
    await page.locator(`[name="clothing-mode"][value="${mode}"]`).check();
    if (mode !== 'upper') {
      await expect(page.locator('#person-samples')).toBeHidden();
      await expect(page.locator('#person-guidance')).toContainText('전신 사진을 업로드');
      if (mode === 'lower') await expect(page.locator('#generate')).toBeDisabled();
      await page.locator('#person').setInputFiles(upload);
      await page.locator('#lower').setInputFiles(upload);
    }
    for (const [role, id] of [...(mode === 'upper' ? [['person', 'viton-person-00690_00']] : []),
      ...(mode !== 'lower' ? [['upper', 'viton-upper-00259_00']] : [])]) {
      const button = page.locator(`#${role}-samples [data-id="${id}"]`);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }
    await page.locator('#select-sunburst').check();
    await page.locator('#select-mai').uncheck();
    await page.locator('#consent').check();
    await expect(page.locator('#generate')).toBeEnabled();
    await page.locator('#select-sunburst').uncheck();
    await page.locator('#select-mai').check();
    await expect(page.locator('#generate')).toBeEnabled();
    await page.locator('#select-sunburst').check();
    await expect(page.locator('#generate')).toBeEnabled();
  }
  await page.locator('[name="clothing-mode"][value="upper"]').check();
  await page.locator('#person-samples [data-id="viton-person-00690_00"]').click();
  await page.screenshot({ path: resolve(directory, 'studio-desktop.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(directory, 'studio-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await writeFile(resolve(directory, 'visible-copy.txt'), await page.locator('body').innerText());
  await page.locator('#logout').click();
  await expect(page.locator('#unlock')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  await page.screenshot({ path: resolve(directory, 'login-mobile.png'), fullPage: true });
  assert.equal(submissions, 0);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ health: 200, freshLogin: true, ordinarySessionReady: true, samples: 14,
    modes: 3, independentModels: true, secureCookie: true, logout: true, newImageCalls: 0, browserErrors: failures,
    screenshots: directory }));
} finally {
  await browser.close();
}
