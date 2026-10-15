import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2];
const recordPath = new URL('../.local-deploy/live-smoke-approval.json', import.meta.url);
const record = JSON.parse(await readFile(recordPath, 'utf8'));
assert.equal(record.origin, origin);
assert.equal(record.attempts, 6);
assert.equal(record.started, false, 'This approval was already started; do not retry.');
assert.ok(Date.parse(record.expiresAt) > Date.now());
record.started = true;
await writeFile(recordPath, JSON.stringify(record));
const directory = new URL('../.local-deploy/live-smoke/', import.meta.url);
await mkdir(directory, { recursive: true });
const operator = (await readFile(new URL('../.local-deploy/demo-operator-token.txt', import.meta.url), 'utf8')).trim();
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const results = [];
let keepalive;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('.sample')).toHaveCount(10);
  const operatorHeaders = { origin, 'x-studio-request': '1', 'x-operator-token': operator };
  const challenge = await page.request.post(`${origin}/api/operator/state`, { headers: operatorHeaders, data: {} });
  assert.equal(challenge.status(), 200);
  const state = await challenge.json();
  assert.equal(state.activated, false);
  const activation = await page.request.post(`${origin}/api/operator/activate`, { headers: operatorHeaders,
    data: { nonce: state.nonce, allowance: 6, expiresAt: record.expiresAt, sessionOnly: true } });
  assert.equal(activation.status(), 200);
  keepalive = setInterval(() => {
    void page.request.get(`${origin}/healthz`, { timeout: 20_000 }).catch(error => {
      errors.push(`keepalive-${error.name}`);
    });
  }, 30_000);
  for (const mode of ['upper', 'lower', 'full']) {
    if (results.length) await page.waitForTimeout(61_000);
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await expect(page.locator('#workspace')).toBeVisible();
    await page.locator(`[name="clothing-mode"][value="${mode}"]`).check();
    for (const [role, id] of [['person', 'person-tracks'], ...(mode !== 'lower' ? [['upper', 'upper-polo']] : []),
      ...(mode !== 'upper' ? [['lower', 'lower-jeans']] : [])]) {
      const button = page.locator(`#${role}-samples [data-id="${id}"]`);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toBeEnabled();
    }
    await page.locator('#select-sunburst').check();
    await page.locator('#select-mai').check();
    await page.locator('#consent').check();
    await expect(page.locator('#generate')).toBeEnabled();
    const submission = page.waitForResponse(response => response.url().endsWith('/api/jobs') && response.request().method() === 'POST', { timeout: 40_000 });
    const start = Date.now();
    await page.locator('#generate').click();
    const response = await submission;
    assert.equal(response.status(), 202);
    const submitted = await response.json();
    assert.deepEqual(Object.keys(submitted.results).sort(), ['mai', 'sunburst']);
    let job = submitted;
    const deadline = Date.now() + 240_000;
    while (job.status === 'running' && Date.now() < deadline) {
      await page.waitForTimeout(2000);
      const poll = await page.request.get(`${origin}/api/jobs/${job.id}`);
      assert.equal(poll.status(), 200);
      job = await poll.json();
    }
    assert.notEqual(job.status, 'running', 'Completion unknown; no resubmission allowed.');
    for (const model of ['sunburst', 'mai']) {
      const result = job.results[model];
      const entry = { mode, model, status: result.status, durationMs: result.durationMs, error: result.error?.code || null };
      if (result.status === 'succeeded') {
        await expect(page.locator(`#${model}-result`)).toBeVisible({ timeout: 15_000 });
        await page.locator(`[data-zoom="${model}-result"]`).click();
        await expect(page.locator('#zoom')).toBeVisible();
        await page.keyboard.press('Escape');
        const download = page.waitForEvent('download');
        await page.locator(`#${model}-download`).click();
        await (await download).saveAs(fileURLToPath(new URL(`${mode}-${model}.png`, directory)));
        entry.zoom = true;
        entry.download = true;
      }
      results.push(entry);
    }
    await page.screenshot({ path: fileURLToPath(new URL(`${mode}.png`, directory)), fullPage: true });
    await writeFile(new URL('results.json', directory), JSON.stringify({ results, elapsedLastModeMs: Date.now() - start, browserErrors: errors }, null, 2));
    console.log(JSON.stringify({ mode, results: results.filter(result => result.mode === mode) }));
  }
  const finalResponse = await page.request.post(`${origin}/api/operator/state`, { headers: operatorHeaders, data: {} });
  assert.equal(finalResponse.status(), 200);
  const final = await finalResponse.json();
  assert.equal(final.remaining, 0);
  assert.equal(final.open, false);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#connection')).toContainText('현재 생성을 사용할 수 없습니다');
  await page.locator('#logout').click();
  await expect(page.locator('#unlock')).toBeVisible();
  await writeFile(new URL('results.json', directory), JSON.stringify({ results, browserErrors: errors,
    attempts: 6, retries: 0, remaining: 0, gateClosed: true, completedAt: new Date().toISOString() }, null, 2));
} finally {
  clearInterval(keepalive);
  await browser.close();
}
