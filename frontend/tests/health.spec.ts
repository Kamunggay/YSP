import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('checks the real API and database through the browser origin', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  const unavailable = process.env['YSP_EXPECT_HEALTH'] === '503';
  await expect(page.getByRole('heading', { name: unavailable ? 'Connection unavailable' : 'Connection ready' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Local setup only. Business operations are not available yet.')).toBeVisible();
  const health = await page.request.get('/api/v1/health');
  expect(health.status()).toBe(unavailable ? 503 : 200);
  expect(await health.json()).toEqual(unavailable
    ? { status: 'unavailable', database: 'unavailable' }
    : { status: 'ok', database: 'ok' });
  expect(health.headers()['cache-control']).toContain('no-store');
  expect(requests.some((url) => new URL(url).pathname === '/api/v1/health')).toBe(true);
  expect(requests.every((url) => new URL(url).origin === new URL(baseURL ?? '').origin)).toBe(true);
  const missingApi = await page.request.get('/api/v1/missing', { headers: { Accept: 'application/json' } });
  expect(missingApi.headers()['content-type']).toContain('application/json');
  expect(missingApi.status()).not.toBe(200);
});

test('shows pending honestly and recovers through a user initiated check', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/health', async (route) => {
    await gate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unavailable","database":"unavailable"}' });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Checking connection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Connection ready' })).not.toBeVisible();
  release?.();
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await page.unroute('**/api/v1/health');
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'Connection ready' })).toBeVisible();
});

test('bounds a stalled health request and offers a safe retry', async ({ page }) => {
  await page.route('**/api/v1/health', () => { /* Deliberately stalled external boundary. */ });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Checking connection' })).toBeVisible();
  // AbortSignal.timeout uses active browser time rather than JavaScript timers.
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
});

test('does not show unexpected response or network error details', async ({ page }) => {
  await page.route('**/api/v1/health', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>sensitive-internal-detail</html>' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sensitive-internal-detail');
  await page.unroute('**/api/v1/health');
  await page.route('**/api/v1/health', (route) => route.abort());
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('heading', { name: 'Connection unavailable' })).toBeVisible();
});

test('supports mobile layout, keyboard retry and accessible status text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connection ready' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Check again' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Connection ready' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('mobile.png') });
});
