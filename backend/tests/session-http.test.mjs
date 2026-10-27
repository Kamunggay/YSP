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

async function runIdentityCli(answers) {
  assert.ok(container, 'Set YSP_TEST_CONTAINER to the disposable backend container');
  const child = spawn('docker', ['exec', '-i', container, 'script', '-qec',
    'php artisan identity:create --no-ansi', '/dev/null']);
  let output = '';
  let next = 0;
  const timer = setTimeout(() => child.kill(), 60000);
  child.stdout.on('data', data => {
    output += data.toString();
    if (next < answers.length && output.includes(answers[next][0])) {
      const answer = answers[next++][1];
      setTimeout(() => child.stdin.write(answer + '\n'), 150);
    }
  });
  child.stderr.on('data', data => { output += data.toString(); });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  clearTimeout(timer);
  return { code, output };
}

async function createIdentity(email, password) {
  const answers = [['Operator audit reference', 'Synthetic operator / test terminal record'], ['Display name', 'Synthetic officer'], ['Email', email],
    ['Password', password], ['Confirm password', password]];
  const { code, output } = await runIdentityCli(answers);
  assert.equal(code, 0, output.replaceAll(password, '[redacted]'));
  assert.ok(!output.includes(password), 'Secret must never echo in a terminal');
  assert.match(output, /Operator audit reference/);
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

function mysqlSetup(sql) {
  const result = spawnSync('docker', ['exec', '-i', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
    'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot ysp_local'], { encoding: 'utf8', input: sql });
  assert.equal(result.status, 0, result.stderr);
}

function assertCookies(response, { secure }) {
  const cookies = response.headers.getSetCookie();
  for (const name of ['ysp_session', 'XSRF-TOKEN']) {
    const cookie = cookies.find(value => value.startsWith(name + '='));
    assert.ok(cookie, `Expected cookie ${name} to be emitted`);
    assert.match(cookie, /path=\//i);
    assert.match(cookie, /samesite=lax/i);
    assert.doesNotMatch(cookie, /domain=/i);
    if (secure) {
      assert.match(cookie, /;\s*secure/i);
    } else {
      assert.doesNotMatch(cookie, /;\s*secure/i);
    }
    assert.equal(/httponly/i.test(cookie), name === 'ysp_session');
  }
}

test('root CSRF initializer issues host-only loopback cookies and a bodyless no-store 204', async () => {
  const browser = new Browser();
  const response = await browser.request('/csrf-cookie');
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-type'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assertCookies(response, { secure: false });
});

test('loopback cookies on sign-in and sign-out enforce host-only, Lax, and HttpOnly separation without Secure', async () => {
  const email = `cookies-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  await createIdentity(email, password);

  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));

  const signInRes = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': token },
  });
  assert.equal(signInRes.status, 200);
  assertCookies(signInRes, { secure: false });

  const signOutToken = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const signOutRes = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': signOutToken },
  });
  assert.equal(signOutRes.status, 204);
  assertCookies(signOutRes, { secure: false });
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

test('CLI identity history rejects ordinary runtime UPDATE and DELETE without changing its attribution', async () => {
  const id = await createIdentity(`history-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const result = spawnSync('docker', ['exec', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/identity-history.php', id], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const [name, passed] of Object.entries(JSON.parse(result.stdout))) assert.equal(passed, true, name);
});

test('CLI audit failure rolls back the identity and permits a later explicit creation', async () => {
  const email = `rollback-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  mysqlSetup("CREATE TRIGGER test_reject_identity_audit BEFORE INSERT ON global_security_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic audit failure'");
  try {
    const result = await runIdentityCli([
      ['Operator audit reference', 'Synthetic rollback probe'], ['Display name', 'Synthetic officer'],
      ['Email', email], ['Password', password], ['Confirm password', password],
    ]);
    assert.equal(result.code, 1);
    assert.ok(!result.output.includes(password));
    assert.doesNotMatch(result.output, /Identity created:/);
    const response = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email, password },
      headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
    });
    assert.equal(response.status, 401);
  } finally {
    mysqlSetup('DROP TRIGGER test_reject_identity_audit');
  }
  await createIdentity(email, password);
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
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

test('sign-in rotates session ID and CSRF token, invalidating prior pre-auth tokens', async () => {
  const email = `rotate-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  await createIdentity(email, password);

  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const preSession = browser.cookies.get('ysp_session');
  const preToken = browser.cookies.get('XSRF-TOKEN');
  assert.ok(preSession && preToken);

  const signedIn = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(preToken) },
  });
  assert.equal(signedIn.status, 200);

  const postSession = browser.cookies.get('ysp_session');
  const postToken = browser.cookies.get('XSRF-TOKEN');
  assert.notEqual(preSession, postSession);
  assert.notEqual(preToken, postToken);

  const replayPreSession = new Browser();
  replayPreSession.cookies.set('ysp_session', preSession);
  const replayRes = await replayPreSession.request('/api/v1/session');
  assert.equal(replayRes.status, 200);
  assert.deepEqual(await replayRes.json(), { state: 'signed_out' });

  const staleCsrfRes = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(preToken) },
  });
  assert.equal(staleCsrfRes.status, 419);
});

test('escalating authority to privileged MFA regenerates session ID and CSRF token', async () => {
  const { browser, id } = await signedInBrowser('rotate-mfa');
  const preSession = browser.cookies.get('ysp_session');
  const preToken = browser.cookies.get('XSRF-TOKEN');

  arrangeState('provider', id);
  const mfaRes = await browser.request('/api/v1/session');
  assert.equal(mfaRes.status, 200);
  assert.deepEqual(await mfaRes.json(), { state: 'mfa_enrollment_required' });

  const postSession = browser.cookies.get('ysp_session');
  const postToken = browser.cookies.get('XSRF-TOKEN');
  assert.notEqual(preSession, postSession);
  assert.notEqual(preToken, postToken);
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

test('sign-out enforces origin and CSRF precedence before session destruction', async () => {
  const { browser } = await signedInBrowser('signout-precedence');
  const validToken = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));

  const originBlocked = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { Origin: 'https://malicious.invalid', 'X-XSRF-TOKEN': validToken },
  });
  assert.equal(originBlocked.status, 403);
  assert.deepEqual(await originBlocked.json(), { code: 'origin_forbidden', message: 'This request is not permitted.' });

  const stillAuth1 = await browser.request('/api/v1/session');
  assert.equal(stillAuth1.status, 200);
  assert.equal((await stillAuth1.json()).state, 'authenticated');

  const csrfBlocked = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': 'invalid-token' },
  });
  assert.equal(csrfBlocked.status, 419);
  assert.deepEqual(await csrfBlocked.json(), { code: 'csrf_mismatch', message: 'Refresh CSRF before a reviewed new attempt.' });

  const stillAuth2 = await browser.request('/api/v1/session');
  assert.equal(stillAuth2.status, 200);
  assert.equal((await stillAuth2.json()).state, 'authenticated');

  const validSignOut = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': validToken },
  });
  assert.equal(validSignOut.status, 204);
  assert.equal(await validSignOut.text(), '');

  const signedOut = await browser.request('/api/v1/session');
  assert.equal(signedOut.status, 200);
  assert.deepEqual(await signedOut.json(), { state: 'signed_out' });
});

test('sign-out when already signed out succeeds with bodyless 204', async () => {
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const response = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': token },
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  const snapshot = await browser.request('/api/v1/session');
  assert.equal(snapshot.status, 200);
  assert.deepEqual(await snapshot.json(), { state: 'signed_out' });
});

test('five failed passwords throttle before shape checks while origin and CSRF still win', async () => {
  arrangeState('clear-throttles', '1');
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
    const subsequent = await browser.request('/api/v1/session');
    assert.equal(subsequent.status, 200);
    assert.deepEqual(await subsequent.json(), { state: 'signed_out' });
  }
});

test('pending challenge preserves fixed expiry and revokes to signed_out upon idle expiry', async () => {
  const { browser, id, email, password } = await signedInBrowser('challenge-expiry');
  arrangeState('provider', id);
  arrangeState('confirmed-factor', id);
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
  const pending = await response.json();
  assert.equal(pending.state, 'mfa_challenge_required');
  const initialExpiresAt = pending.challenge.expires_at;

  const repeated = await browser.request('/api/v1/session');
  assert.equal((await repeated.json()).challenge.expires_at, initialExpiresAt);

  arrangeState('idle-expired', id);
  const expired = await browser.request('/api/v1/session');
  assert.equal(expired.status, 200);
  assert.deepEqual(await expired.json(), { state: 'signed_out' });
});

test('new provider administration authority forces restricted enrollment before identity disclosure', async () => {
  const { browser, id } = await signedInBrowser('provider');
  arrangeState('provider', id);
  const response = await browser.request('/api/v1/session');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'mfa_enrollment_required' });
});

test('all six defined privileged duty roles require MFA enrollment while non-privileged requester does not', async () => {
  const privilegedRoles = ['CHAPTER_HEAD', 'FINANCE', 'RF_APPROVER', 'SALES_REVIEWER', 'BUDGET_APPROVER', 'INDEPENDENT_REVIEWER'];
  for (const role of privilegedRoles) {
    const { browser, id } = await signedInBrowser(`role-${role.toLowerCase()}`);
    arrangeState(`duty:${role}`, id);
    const response = await browser.request('/api/v1/session');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { state: 'mfa_enrollment_required' });
  }

  const { browser: reqBrowser, id: reqId } = await signedInBrowser('requester-only');
  arrangeState('duty:COMMITTEE_REQUESTER', reqId);
  const reqResponse = await reqBrowser.request('/api/v1/session');
  assert.equal(reqResponse.status, 200);
  const snap = await reqResponse.json();
  assert.equal(snap.state, 'authenticated');
  assert.equal(snap.mfa.status, 'not_required');
});

test('revoked, expired, future, and disabled authority grants do not enforce privileged MFA', async () => {
  const inactiveConditions = [
    'duty-revoked:CHAPTER_HEAD',
    'duty-expired:CHAPTER_HEAD',
    'duty-future:CHAPTER_HEAD',
    'membership-disabled:CHAPTER_HEAD',
    'membership-revoked:CHAPTER_HEAD',
    'provider-revoked',
    'provider-expired',
    'provider-future',
  ];
  for (const condition of inactiveConditions) {
    const { browser, id } = await signedInBrowser('authority-bounds');
    arrangeState(condition, id);
    const response = await browser.request('/api/v1/session');
    assert.equal(response.status, 200);
    const snap = await response.json();
    assert.equal(snap.state, 'authenticated', `${condition} should not force MFA`);
    assert.equal(snap.mfa.status, 'not_required', `${condition} should not require MFA`);
  }
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
    [{ Origin: browserOrigin + '/' }, undefined, 403],
    [{ 'Sec-Fetch-Site': 'same-site' }, undefined, 403],
    [{ Origin: '', Referer: browserOrigin + '/page' }, undefined, 403],
    [{ Origin: null }, undefined, 403],
    [{ Origin: null, Referer: browserOrigin + '/page', 'X-XSRF-TOKEN': token }, undefined, 422],
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

test('production cookies across CSRF, sign-in, and sign-out are Secure, host-only and preserve distinct HttpOnly rules',
  { skip: process.env.YSP_TEST_PROFILE !== 'production' }, async () => {
  const browser = new Browser();
  const csrfRes = await browser.request('/csrf-cookie');
  assert.equal(csrfRes.status, 204);
  assertCookies(csrfRes, { secure: true });

  const email = `prod-cookies-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  await createIdentity(email, password);

  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const signInRes = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': token },
  });
  assert.equal(signInRes.status, 200);
  assertCookies(signInRes, { secure: true });

  const signOutToken = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const signOutRes = await browser.request('/api/v1/session/sign-out', {
    method: 'POST',
    headers: { 'X-XSRF-TOKEN': signOutToken },
  });
  assert.equal(signOutRes.status, 204);
  assertCookies(signOutRes, { secure: true });
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

test('stopped backend returns session-contract failures for all four foundation operations and preserves health semantics',
  { skip: process.env.YSP_TEST_PROFILE !== 'backend-unavailable' }, async () => {
  for (const [path, method] of [
    ['/csrf-cookie', 'GET'], ['/api/v1/session', 'GET'],
    ['/api/v1/session/sign-in', 'POST'], ['/api/v1/session/sign-out', 'POST'],
  ]) {
    const response = await new Browser().request(path, { method });
    assert.equal(response.status, 503, path);
    assert.deepEqual(await response.json(), { code: 'unavailable', message: 'The session service is unavailable.' });
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(response.headers.getSetCookie(), [], 'An unavailable backend cannot issue session cookies');
  }
  const health = await fetch(origin + '/api/v1/health');
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: 'unavailable', database: 'unavailable' });
  assert.deepEqual(health.headers.getSetCookie(), []);
});

test('identity CLI and session JSON preserve unsigned IDs above the PHP integer range', async () => {
  mysqlSetup('ALTER TABLE users AUTO_INCREMENT = 9223372036854775808');
  const { browser, id } = await signedInBrowser('unsigned-id');
  assert.ok(BigInt(id) > 9223372036854775807n);
  const response = await browser.request('/api/v1/session');
  assert.equal((await response.json()).user.id, id);
});

test('MySQL-backed session survives a backend restart with the same browser cookies', async () => {
  const { browser, id } = await signedInBrowser('restart');
  const before = new Map(browser.cookies);
  const restart = spawnSync('docker', ['restart', container], { encoding: 'utf8', timeout: 30000 });
  assert.equal(restart.status, 0, restart.stderr);
  let response;
  for (let i = 0; i < 30; i++) {
    response = await browser.request('/api/v1/session');
    if (response.status === 200) break;
    assert.equal(response.status, 503);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, id);
  const replay = new Browser();
  replay.cookies = before;
  assert.equal((await (await replay.request('/api/v1/session')).json()).user.id, id);
});

test('email normalization in sign-in throttling groups case-insensitive variants into the same throttle bucket', async () => {
  arrangeState('clear-throttles', '1');
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) };
  const base = `norm-${Date.now()}@example.test`;
  const variants = [
    base.toUpperCase(),
    base.toLowerCase(),
    base.charAt(0).toUpperCase() + base.slice(1),
    base.replace('example', 'EXAMPLE'),
  ];
  for (const email of variants) {
    const failed = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email, password: 'wrong' }, headers,
    });
    assert.equal(failed.status, 401);
  }
  const fifth = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email: base, password: 'wrong' }, headers,
  });
  assert.equal(fifth.status, 401);
  const throttled = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email: base.toUpperCase(), password: 'wrong' }, headers,
  });
  assert.equal(throttled.status, 429);
  assert.match(throttled.headers.get('retry-after'), /^[1-9][0-9]*$/);
});

test('nonexistent and disabled accounts throttle identically to active accounts without leaking account existence', async () => {
  arrangeState('clear-throttles', '1');
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) };
  const ghostEmail = `ghost-${Date.now()}@example.test`;
  for (let i = 0; i < 5; i++) {
    const res = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email: ghostEmail, password: 'wrong' }, headers,
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { code: 'invalid_credentials', message: 'Unable to sign in.' });
  }
  const ghostThrottled = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email: ghostEmail, password: 'wrong' }, headers,
  });
  assert.equal(ghostThrottled.status, 429);

  arrangeState('clear-throttles', '1');
  const disabledEmail = `disabled-auth-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const id = await createIdentity(disabledEmail, password);
  arrangeState('disable', id);

  for (let i = 0; i < 5; i++) {
    const res = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email: disabledEmail, password }, headers,
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { code: 'invalid_credentials', message: 'Unable to sign in.' });
  }
  const disabledThrottled = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email: disabledEmail, password }, headers,
  });
  assert.equal(disabledThrottled.status, 429);
});

test('identity-throttled requests still consume the additional IP attempt allowance', async () => {
  arrangeState('clear-throttles', '1');
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const headers = { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) };
  const email = `exhausted-${Date.now()}@example.test`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await browser.request('/api/v1/session/sign-in', {
      method: 'POST', body: { email, password: 'incorrect' }, headers,
    });
    assert.equal(response.status, attempt < 5 ? 401 : 429);
  }
  const differentIdentity = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: {}, headers,
  });
  assert.equal(differentIdentity.status, 429);
  arrangeState('clear-throttles', '1');
});

test('overlapping MySQL sign-in transactions enforce the last password attempt exactly once', async () => {
  arrangeState('clear-throttles', '1');
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const token = decodeURIComponent(browser.cookies.get('XSRF-TOKEN'));
  const email = `concurrent-throttle-${Date.now()}@example.test`;
  const attempt = () =>
    browser.request('/api/v1/session/sign-in', {
      method: 'POST',
      body: { email, password: 'incorrect-password' },
      headers: { 'X-XSRF-TOKEN': token },
    });
  for (let i = 0; i < 4; i++) assert.equal((await attempt()).status, 401);
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/session-concurrency.php']);
  let timer;
  let pending;
  let waiting = 0;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Throttle lock barrier timed out')), 5000);
      holder.on('error', reject);
      holder.on('exit', code => reject(new Error(`Throttle holder exited: ${code}`)));
      holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    });
    clearTimeout(timer);
    pending = Promise.all([attempt(), attempt()]);
    for (let i = 0; i < 30; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT w.REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON w.REQUESTING_ENGINE_LOCK_ID=l.ENGINE_LOCK_ID WHERE l.OBJECT_NAME=\'session_throttles\'"'], { encoding: 'utf8' });
      assert.equal(probe.status, 0, probe.stderr);
      waiting = Number(probe.stdout.trim());
      if (waiting >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } finally {
    clearTimeout(timer);
    holder.stdin.end('\n');
  }
  const responses = await pending;
  assert.ok(waiting >= 2, `Require two overlapping server transactions; saw ${waiting} throttle waiters`);
  assert.deepEqual(responses.map(r => r.status).sort(), [401, 429]);
  for (const res of responses.filter(r => r.status === 429)) {
    assert.match(res.headers.get('retry-after'), /^[1-9][0-9]*$/);
  }
  arrangeState('clear-throttles', '1');
});

test('concurrent CLI identity creation for identical email isolates transactions and enforces unique key constraint', async () => {
  const email = `concurrent-cli-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const standardAnswers = [
    ['Operator audit reference', 'Synthetic operator'],
    ['Display name', 'Synthetic officer'],
    ['Email', email],
    ['Password', password],
    ['Confirm password', password],
  ];
  const [res1, res2] = await Promise.all([
    runIdentityCli(standardAnswers),
    runIdentityCli(standardAnswers),
  ]);
  const codes = [res1.code, res2.code].sort();
  assert.deepEqual(codes, [0, 1], 'Exactly one process should succeed (0) and one should fail (1)');
  assert.ok(!res1.output.includes(password) && !res2.output.includes(password), 'Secrets must never echo');
});

test('CLI input validation rejects invalid inputs and out-of-range passwords without disclosing secrets', async () => {
  const cases = [
    {
      name: 'empty operator reference',
      answers: [
        ['Operator audit reference', '   '],
      ],
      expectedError: 'A technical operator identity or terminal audit reference is required.',
    },
    {
      name: 'invalid email',
      answers: [
        ['Operator audit reference', 'Valid op'],
        ['Display name', 'Valid name'],
        ['Email', 'not-a-valid-email'],
      ],
      expectedError: 'Check the display name and email.',
    },
    {
      name: 'password too short',
      answers: [
        ['Operator audit reference', 'Valid op'],
        ['Display name', 'Valid name'],
        ['Email', 'valid@example.test'],
        ['Password', 'short'],
        ['Confirm password', 'short'],
      ],
      expectedError: 'Passwords must match and contain 12 to 72 bytes.',
    },
    {
      name: 'password mismatch',
      answers: [
        ['Operator audit reference', 'Valid op'],
        ['Display name', 'Valid name'],
        ['Email', 'valid@example.test'],
        ['Password', 'Secret-Password-12!'],
        ['Confirm password', 'Secret-Password-99!'],
      ],
      expectedError: 'Passwords must match and contain 12 to 72 bytes.',
    },
  ];
  for (const c of cases) {
    const res = await runIdentityCli(c.answers);
    assert.equal(res.code, 1, `Expected failure for ${c.name}`);
    assert.ok(res.output.includes(c.expectedError), `Expected output to include "${c.expectedError}" for ${c.name}`);
    for (const [, secret] of c.answers.filter(([k]) => k.includes('Password'))) {
      assert.ok(!res.output.includes(secret), `Secret leaked in ${c.name}`);
    }
  }
});
