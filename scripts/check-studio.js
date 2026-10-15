import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.argv[2];
assert.equal(new URL(origin).protocol, 'https:');
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
  assert.equal((await page.request.get(`${origin}/healthz`)).status(), 200);
  assert.equal((await page.request.post(`${origin}/api/jobs`, {
    headers: { origin, 'x-studio-request': '1' }
  })).status(), 401);
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.locator('#unlock')).toBeVisible();
  await page.screenshot({ path: resolve(directory, 'login-desktop.png'), fullPage: true });
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('wrong');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#login-error')).toContainText('확인');
  await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.sample')).toHaveCount(10);
  await expect(page.locator('#connection')).toContainText('피팅 준비 완료');
  const config = await (await page.request.get(`${origin}/api/config`)).json();
  assert.ok(config.authenticated && config.models.every(model => model.ready));
  const cookies = await page.context().cookies(origin);
  assert.ok(cookies.some(cookie => cookie.name === 'studio' && cookie.secure && cookie.httpOnly && cookie.sameSite === 'Strict'));
  for (const mode of ['upper', 'lower', 'full']) {
    await page.locator(`[name="clothing-mode"][value="${mode}"]`).check();
    for (const [role, id] of [['person', 'person-tracks'], ...(mode !== 'lower' ? [['upper', 'upper-polo']] : []),
      ...(mode !== 'upper' ? [['lower', 'lower-jeans']] : [])]) {
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
    if (mode !== 'upper') await expect(page.locator('#person-samples [data-id="person-seated"]')).toBeDisabled();
  }
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
  console.log(JSON.stringify({ health: 200, freshLogin: true, ordinarySessionReady: true, samples: 10,
    modes: 3, independentModels: true, secureCookie: true, logout: true, newImageCalls: 0, browserErrors: failures,
    screenshots: directory }));
} finally {
  await browser.close();
}
