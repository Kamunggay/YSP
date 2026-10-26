import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { loadContract } from '../../contracts/transport/validation/operation-examples.mjs';

const { api, ajv } = await loadContract();

const origin = process.env.YSP_TEST_ORIGIN;
const browserOrigin = process.env.YSP_TEST_BROWSER_ORIGIN ?? origin;
const container = process.env.YSP_TEST_CONTAINER;
assert.ok(origin, 'Set YSP_TEST_ORIGIN to the disposable gateway origin');

class Browser {
  cookies = new Map();
  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const requestHeaders = { Accept: 'application/json', Origin: browserOrigin,
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers };
    for (const key of Object.keys(requestHeaders)) if (requestHeaders[key] === null) delete requestHeaders[key];
    const response = await fetch(origin + path, {
      method, redirect: 'error',
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, ...value] = cookie.split(';')[0].split('=');
      this.cookies.set(name, value.join('='));
    }
    const contractPath = path === '/csrf-cookie' ? path : path.replace('/api/v1', '');
    const operation = api.paths[contractPath]?.[method.toLowerCase()];
    if (operation && operation.responses[response.status]) {
      const schema = operation.responses[response.status].content?.['application/json']?.schema;
      if (schema) {
        const validate = ajv.compile(schema);
        assert.ok(validate(await response.clone().json()), JSON.stringify(validate.errors));
      }
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    return response;
  }
}

async function createIdentity(email, password) {
  assert.ok(container, 'Set YSP_TEST_CONTAINER to the disposable backend container');
  const child = spawn('docker', ['exec', '-i', container, 'script', '-qec',
    'php artisan identity:create --no-ansi', '/dev/null']);
  let output = '';
  const answers = [['Display name', 'Synthetic officer'], ['Email', email],
    ['Password', password], ['Confirm password', password]];
  let next = 0;
  const timer = setTimeout(() => child.kill(), 60000);
  child.stdout.on('data', data => {
    output += data.toString();
    if (next < answers.length && output.includes(answers[next][0])) {
      const answer = answers[next++][1];
      // Let the terminal disable echo after emitting the hidden-input prompt.
      setTimeout(() => child.stdin.write(answer + '\n'), 150);
    }
  });
  child.stderr.on('data', data => { output += data.toString(); });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  clearTimeout(timer);
  assert.equal(code, 0, output.replaceAll(password, '[redacted]'));
  assert.ok(!output.includes(password), 'Secret must never echo in a terminal');
  assert.match(output, /Identity created: [1-9][0-9]*/);
  return output.match(/Identity created: ([1-9][0-9]*)/)[1];
}

async function signedInBrowser(label) {
  const email = `${label}-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const id = await createIdentity(email, password);
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
  return { browser, id, email, password };
}

function arrangeState(action, id) {
  const result = spawnSync('docker', ['exec', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/session-state.php', action, id], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Fixture applied');
}

test('root CSRF initializer issues host-only loopback cookies and a bodyless no-store 204', async () => {
  const browser = new Browser();
  const response = await browser.request('/csrf-cookie');
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-type'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const cookies = response.headers.getSetCookie();
  for (const name of ['ysp_session', 'XSRF-TOKEN']) {
    const cookie = cookies.find(value => value.startsWith(name + '='));
    assert.ok(cookie, name);
    assert.match(cookie, /path=\//i);
    assert.match(cookie, /samesite=lax/i);
    assert.doesNotMatch(cookie, /domain=|; secure/i);
    assert.equal(/httponly/i.test(cookie), name === 'ysp_session');
  }
});

test('origin rejection precedes CSRF and malformed credentials', async () => {
  const browser = new Browser();
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: {}, headers: { Origin: 'https://sibling.invalid', 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: 'origin_forbidden', message: 'This request is not permitted.' });
});

test('same-origin Fetch Metadata never bypasses the mandatory CSRF header', async () => {
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: {}, headers: { 'Sec-Fetch-Site': 'same-origin' },
  });
  assert.equal(response.status, 419);
  assert.deepEqual(await response.json(), { code: 'csrf_mismatch', message: 'Refresh CSRF before a reviewed new attempt.' });
});

test('restricted identity CLI accepts hidden credentials without granting authority', async () => {
  await createIdentity(`cli-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
});

test('CLI-created identity signs in with no MFA or provider authority fabricated', async () => {
  const email = `signin-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const id = await createIdentity(email, password);
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email: email.toUpperCase(), password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
  const expected = { state: 'authenticated', user: { id, display_name: 'Synthetic officer' },
    mfa: { status: 'not_required' }, provider_destinations: [] };
  assert.deepEqual(await response.json(), expected);
});

test('bootstrap reads the actual cookie-backed identity and CSRF initialization preserves it', async () => {
  const browser = new Browser();
  const initial = await browser.request('/api/v1/session');
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), { state: 'signed_out' });
  const email = `bootstrap-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const id = await createIdentity(email, password);
  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const signedIn = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password }, headers: { 'X-XSRF-TOKEN': token },
  });
  assert.equal(signedIn.status, 200);
  const expected = await signedIn.json();
  assert.equal(expected.user.id, id);
  await browser.request('/csrf-cookie');
  const restored = await browser.request('/api/v1/session');
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), expected);
});

test('logout invalidates a replayed session and rotates CSRF with a bodyless 204', async () => {
  const { browser } = await signedInBrowser('logout');
  const replay = new Browser();
  replay.cookies = new Map(browser.cookies);
  const oldToken = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const response = await browser.request('/api/v1/session/sign-out', {
    method: 'POST', headers: { 'X-XSRF-TOKEN': oldToken },
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-type'), null);
  assert.deepEqual(await (await replay.request('/api/v1/session')).json(), { state: 'signed_out' });
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), { state: 'signed_out' });
  const stale = await browser.request('/api/v1/session/sign-out', {
    method: 'POST', headers: { 'X-XSRF-TOKEN': oldToken },
  });
  assert.equal(stale.status, 419);
});

test('five failed passwords throttle before shape checks while origin and CSRF still win', async () => {
  const browser = new Browser();
  const email = `missing-${Date.now()}@example.test`;
  await browser.request('/csrf-cookie');
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) };
  for (let attempt = 0; attempt < 5; attempt++) {
    const failed = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email, password: 'incorrect' }, headers,
    });
    assert.equal(failed.status, 401);
    assert.deepEqual(await failed.json(), { code: 'invalid_credentials', message: 'Unable to sign in.' });
  }
  const throttled = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email }, headers,
  });
  assert.equal(throttled.status, 429);
  assert.match(throttled.headers.get('retry-after'), /^[1-9][0-9]*$/);
  const csrf = await browser.request('/api/v1/session/sign-in', { method: 'POST', body: { email } });
  assert.equal(csrf.status, 419);
  const originFailure = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email }, headers: { Origin: 'null' },
  });
  assert.equal(originFailure.status, 403);
});

test('bootstrap revokes disabled and changed-auth-version sessions using current identity', async () => {
  for (const action of ['disable', 'auth-version']) {
    const { browser, id } = await signedInBrowser(action);
    arrangeState(action, id);
    const response = await browser.request('/api/v1/session');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { state: 'signed_out' });
  }
});

test('active cookies cannot extend the eight-hour absolute or thirty-minute idle expiry', async () => {
  for (const action of ['absolute-expired', 'idle-expired']) {
    const { browser, id } = await signedInBrowser(action);
    arrangeState(action, id);
    await browser.request('/csrf-cookie');
    const response = await browser.request('/api/v1/session');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { state: 'signed_out' });
  }
});

test('new provider administration authority forces restricted enrollment before identity disclosure', async () => {
  const { browser, id } = await signedInBrowser('provider');
  arrangeState('provider', id);
  const response = await browser.request('/api/v1/session');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'mfa_enrollment_required' });
});

test('MFA considers effective privileged grants across chapters rather than requester-only authority', async () => {
  const { browser, id } = await signedInBrowser('cross-chapter');
  arrangeState('requester', id);
  const requester = await browser.request('/api/v1/session');
  assert.equal((await requester.json()).mfa.status, 'not_required');
  arrangeState('head', id);
  const privileged = await browser.request('/api/v1/session');
  assert.deepEqual(await privileged.json(), { state: 'mfa_enrollment_required' });
});

test('confirmed factor produces a stable five-minute restricted challenge without fabricating verification', async () => {
  const { browser, id, email, password } = await signedInBrowser('challenge');
  arrangeState('provider', id);
  arrangeState('confirmed-factor', id);
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
  const pending = await response.json();
  assert.equal(pending.state, 'mfa_challenge_required');
  assert.match(pending.challenge.id, /^chl_[A-Za-z0-9_-]{32,96}$/);
  const remaining = Date.parse(pending.challenge.expires_at) - Date.now();
  assert.ok(remaining > 290000 && remaining <= 301000);
  await browser.request('/csrf-cookie');
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), pending);
});

test('origin fallback and competing token sources obey the exact-origin AND token policy', async () => {
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const cases = [
    [{ Origin: origin + '/' }, undefined, 403],
    [{ 'Sec-Fetch-Site': 'same-site' }, undefined, 403],
    [{ Origin: '', Referer: origin + '/page' }, undefined, 403],
    [{ Origin: null }, undefined, 403],
    [{ Origin: null, Referer: origin + '/page', 'X-XSRF-TOKEN': token }, undefined, 422],
    [{ Origin: null, 'Sec-Fetch-Site': 'same-origin', 'X-XSRF-TOKEN': token }, undefined, 422],
    [{ 'X-XSRF-TOKEN': token, 'X-CSRF-TOKEN': token }, undefined, 419],
    [{ 'X-XSRF-TOKEN': token }, { _token: null }, 419],
    [{ 'X-XSRF-TOKEN': 'malformed' }, undefined, 419],
    [{ 'X-XSRF-TOKEN': token }, undefined, 422],
  ];
  for (const [headers, body = {}, status] of cases) {
    const response = await browser.request('/api/v1/session/sign-in', { method: 'POST', body, headers });
    assert.equal(response.status, status, JSON.stringify(headers));
  }
});

test('production cookies are Secure, host-only and preserve the distinct HttpOnly rules',
  { skip: process.env.YSP_TEST_PROFILE !== 'production' }, async () => {
  const response = await new Browser().request('/csrf-cookie');
  assert.equal(response.status, 204);
  for (const name of ['ysp_session', 'XSRF-TOKEN']) {
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(name + '='));
    assert.ok(cookie);
    assert.match(cookie, /; secure/i);
    assert.doesNotMatch(cookie, /domain=/i);
    assert.equal(/httponly/i.test(cookie), name === 'ysp_session');
  }
});

test('IP throttle bounds malformed attempts and permits requests after its fifteen-minute window', async () => {
  arrangeState('clear-throttles', '1');
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) };
  for (let i = 0; i < 60; i++) {
    const response = await browser.request('/api/v1/session/sign-in', { method: 'POST', body: {}, headers });
    assert.equal(response.status, 422);
  }
  const blocked = await browser.request('/api/v1/session/sign-in', { method: 'POST', body: {}, headers });
  assert.equal(blocked.status, 429);
  arrangeState('expire-throttles', '1');
  const refreshed = await browser.request('/api/v1/session/sign-in', { method: 'POST', body: {}, headers });
  assert.equal(refreshed.status, 422);
});

test('identity creation refuses piped secrets and password shell options', () => {
  const password = 'Synthetic-never-echo-this-47!';
  for (const args of [['--no-interaction'], [`--password=${password}`]]) {
    const result = spawnSync('docker', ['exec', '-i', container, 'php', 'artisan', 'identity:create', ...args],
      { encoding: 'utf8', input: password + '\n' });
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes(password));
  }
});

test('storage outage gives a typed no-store 503 after the origin guard',
  { skip: process.env.YSP_TEST_PROFILE !== 'unavailable' }, async () => {
  const response = await new Browser().request('/csrf-cookie');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'unavailable', message: 'The session service is unavailable.' });
});
