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
  await page.locator(`[name="clothing-mode"][value="${mode}"]`).check();
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
  await page.locator('[name="clothing-mode"][value="full"]').check();
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

test('completion refreshes an exhausted allowance without hiding the generated image', async ({ page }) => {
  let submitted = false;
  page.on('request', request => {
    if (request.url().endsWith('/api/jobs') && request.method() === 'POST') submitted = true;
  });
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    if (submitted) config.models.forEach(model => { model.ready = false; model.reason = 'demo-budget-closed'; });
    await route.fulfill({ response, json: config });
  });
  await prepare(page);
  await page.locator('#select-mai').check();
  await page.locator('#generate').click();
  await expect(page.locator('#mai-result')).toBeVisible();
  await expect(page.locator('#connection')).toContainText('현재 생성을 사용할 수 없습니다');
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#mai-download')).toBeVisible();
});

test('mode segments work with arrows and reduced motion disables the loading animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  const upper = page.locator('[name="clothing-mode"][value="upper"]');
  await upper.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mode')).toHaveValue('lower');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mode')).toHaveValue('full');
  await expect(page.getByRole('radio', { name: '풀세트(상의+하의)' })).toBeChecked();
  await page.locator('#mai-result').evaluate(image => image.closest('.stage').dataset.state = 'running');
  expect(await page.locator('#mai-empty').evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('none');
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

test('a rejected session cookie stays on login and explains how to recover', async ({ page }) => {
  await page.route('**/api/session', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    const headers = response.headers();
    delete headers['set-cookie'];
    await page.context().clearCookies();
    await route.fulfill({ status: response.status(), headers, body: await response.body() });
  });
  await page.goto('/');
  await page.locator('#username').fill('test'); await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await expect(page.locator('#unlock')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#login-error')).toContainText('새 브라우저 탭');
});

test('sample galleries use fetched bytes, require each full-set reference and never submit on selection', async ({ page }) => {
  const bytes = await sharp({ create: { width: 30, height: 50, channels: 3, background: '#67856a' } }).png().toBuffer();
  const items = ['person', 'upper', 'lower'].flatMap(category => [1, 2].map(index => ({
    id: `${category}-${index}`, category, label: `${category} ${index}`, src: `/samples/${category}-${index}.png`,
    attribution: 'Synthetic browser-test fixture', supportsModes: category === 'person' && index === 2 ? ['upper'] : ['upper', 'lower', 'full']
  })));
  await page.route('**/samples/manifest.json', route => route.fulfill({ json: { items } }));
  await page.route(/\/samples\/(?:person|upper|lower)-[12]\.png$/, route => route.fulfill({ body: bytes, contentType: 'image/png' }));
  let requests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/jobs') && request.method() === 'POST') requests++; });
  await page.goto('/');
  await page.locator('#username').fill('test');
  await page.locator('#password').fill('test');
  await page.locator('#password').press('Enter');
  await page.locator('[name="clothing-mode"][value="full"]').check();
  await expect(page.locator('#person-samples button')).toHaveCount(2);
  await page.locator('#person-samples button').first().click();
  await page.locator('#upper-samples button').last().click();
  await page.locator('#select-mai').check();
  await page.locator('#consent').check();
  await expect(page.locator('#generate')).toBeDisabled();
  await page.locator('#lower-samples button').first().click();
  await expect(page.locator('#generate')).toBeEnabled();
  await expect(page.locator('#before')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#upper-preview')).toBeVisible();
  await expect(page.locator('#lower-preview')).toBeVisible();
  expect(requests).toBe(0);
  const pending = page.waitForRequest(request => request.url().endsWith('/api/jobs') && request.method() === 'POST');
  await page.locator('#generate').click();
  const request = await pending;
  const form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': request.headers()['content-type'] }, body: request.postDataBuffer() }).formData();
  for (const role of ['person', 'upper', 'lower']) expect(Buffer.from(await form.get(role).arrayBuffer())).toEqual(bytes);
  expect(form.get('models')).toBe('["mai"]');
  await expect(page.locator('#status')).toContainText('완성');
  await page.locator('#clear').click();
  await expect(page.locator('.sample[aria-pressed=true]')).toHaveCount(0);
  await page.locator('[name="clothing-mode"][value="upper"]').check();
  await page.locator('#person-samples button').last().click();
  await expect(page.locator('#person-samples button').last()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[name="clothing-mode"][value="full"]').check();
  await expect(page.locator('#person-samples button').last()).toBeDisabled();
  await expect(page.locator('#mode-guidance')).toContainText('상의용');
  await expect(page.locator('#generate')).toBeDisabled();
});
