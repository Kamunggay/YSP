import { afterEach, expect, test, vi } from 'vitest';
import { checkHealth } from './health';

afterEach(() => vi.unstubAllGlobals());

test('reports connectivity only for the real health response contract', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('{"status":"ok","database":"ok"}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(checkHealth(new AbortController().signal)).resolves.toEqual({ status: 'connected' });
  expect(fetcher).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ cache: 'no-store', redirect: 'error' }));
});

test.each([
  new Response('{"status":"unavailable","database":"unavailable"}', { status: 503 }),
  new Response('{"status":"ok","database":"unavailable"}', { status: 200 }),
  new Response('{"status":"ok","database":"ok","password":"must-not-be-displayed"}', { status: 200 }),
  new Response('<html>Proxy failure with internal detail</html>', { status: 502 }),
])('rejects unavailable or unexpected health payloads safely', async (response) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
  await expect(checkHealth(new AbortController().signal)).resolves.toEqual({ status: 'unavailable' });
});

test('normalizes network failure without returning exception details', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('sensitive network detail')));
  await expect(checkHealth(new AbortController().signal)).resolves.toEqual({ status: 'unavailable' });
});
