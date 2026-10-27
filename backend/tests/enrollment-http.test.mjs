import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(this.worker ? { 'X-Test-Worker': this.worker } : {}), ...headers };
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

const enrollmentPath = '/api/v1/session/mfa/enrollment';
const post = (browser, path, body) => browser.request(path, { method: 'POST', body,
  headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) } });

// Independent RFC 6238 client; production uses OTPHP.
function authenticatorCode(secret, timestamp = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

async function preparedOfficer(label) {
  const officer = await signedInBrowser(label);
  arrangeState('head', officer.id);
  assert.deepEqual(await (await officer.browser.request('/api/v1/session')).json(), { state: 'mfa_enrollment_required' });
  const response = await post(officer.browser, enrollmentPath, { intent: 'begin' });
  assert.equal(response.status, 200);
  return { ...officer, prepared: await response.json() };
}

function storageProbe(action, id, input = {}) {
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/enrollment-state.php', action, id], { encoding: 'utf8', input: JSON.stringify(input) });
  assert.equal(result.status, 0, result.stderr);
  const assertions = JSON.parse(result.stdout);
  for (const [name, passed] of Object.entries(assertions)) assert.equal(passed, true, name);
}

function mysqlFault(sql) {
  const result = spawnSync('docker', ['exec', '-i', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
    'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot ysp_local'], { encoding: 'utf8', input: sql });
  assert.equal(result.status, 0, result.stderr);
}

test('officer confirms authenticator once, rotates credentials and bootstraps without secret readback', async () => {
  const { browser, id, prepared } = await preparedOfficer('enroll');
  const oldCookies = new Map(browser.cookies);
  const { enrollment } = prepared;
  assert.ok(Date.parse(enrollment.expires_at) - Date.now() <= 600000);
  assert.ok(Date.parse(enrollment.expires_at) - Date.now() > 590000);
  assert.equal(new URL(enrollment.setup_uri).searchParams.get('secret'), enrollment.manual_key);
  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };
  const response = await post(browser, enrollmentPath + '/confirm', proof);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.session.state, 'authenticated');
  assert.equal(result.session.mfa.status, 'verified');
  assert.deepEqual(result.session.provider_destinations, []);
  assert.equal(result.recovery_codes.codes.length, 10);
  assert.equal(new Set(result.recovery_codes.codes).size, 10);
  for (const code of result.recovery_codes.codes) assert.match(code, /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
  assert.notEqual(browser.cookies.get('XSRF-TOKEN'), oldCookies.get('XSRF-TOKEN'));
  const stale = new Browser();
  stale.cookies = oldCookies;
  assert.deepEqual(await (await stale.request('/api/v1/session')).json(), { state: 'signed_out' });
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), result.session);
  assert.equal((await post(browser, enrollmentPath + '/confirm', proof)).status, 409);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 409);
  storageProbe('confirmed', id, { secret: enrollment.manual_key, codes: result.recovery_codes.codes });
});

test('explicit replacement invalidates the prior unconfirmed enrollment', async () => {
  const { browser, id, prepared: { enrollment: prior } } = await preparedOfficer('replace');
  storageProbe('prepared', id, { secret: prior.manual_key });

  // Cannot begin again when an unconfirmed enrollment is already active.
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 409);

  // Invalid payload shapes for replacement are rejected.
  assert.equal((await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: 'invalid' })).status, 422);

  // Mismatched enrollment ID cannot replace.
  const mismatchedId = 'enr_' + '0'.repeat(64);
  assert.equal((await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: mismatchedId })).status, 409);

  // Explicit replacement with the active enrollment ID succeeds.
  const replacementRes = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: prior.id });
  assert.equal(replacementRes.status, 200);
  const { enrollment: current } = await replacementRes.json();
  assert.notEqual(current.id, prior.id);
  assert.notEqual(current.manual_key, prior.manual_key);
  assert.notEqual(current.setup_uri, prior.setup_uri);

  // Confirming prior unconfirmed enrollment with its valid code is rejected.
  const priorProof = { enrollment_id: prior.id, authenticator_code: authenticatorCode(prior.manual_key) };
  assert.equal((await post(browser, enrollmentPath + '/confirm', priorProof)).status, 409);

  // Replacing again with the prior enrollment ID is rejected.
  assert.equal((await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: prior.id })).status, 409);

  // Storage probe verifies replacement in real MySQL: current secret is encrypted, prior is invalidated.
  storageProbe('prepared', id, { secret: current.manual_key });

  // The replaced enrollment can be confirmed successfully.
  const currentProof = { enrollment_id: current.id, authenticator_code: authenticatorCode(current.manual_key) };
  const confirmRes = await post(browser, enrollmentPath + '/confirm', currentProof);
  assert.equal(confirmRes.status, 200);
  const confirmed = await confirmRes.json();
  assert.equal(confirmed.session.state, 'authenticated');
  assert.equal(confirmed.session.mfa.status, 'verified');
  assert.equal(confirmed.recovery_codes.codes.length, 10);
  storageProbe('confirmed', id, { secret: current.manual_key, codes: confirmed.recovery_codes.codes });
});

test('refusing to replace a confirmed factor via unconfirmed enrollment operations', async () => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('refuse-replace');
  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };
  const confirmRes = await post(browser, enrollmentPath + '/confirm', proof);
  assert.equal(confirmRes.status, 200);
  const confirmed = await confirmRes.json();
  assert.equal(confirmed.session.state, 'authenticated');
  assert.equal(confirmed.session.mfa.status, 'verified');

  // Verify confirmed factor state in MySQL.
  storageProbe('confirmed-state', id, { secret: enrollment.manual_key });

  // Attempting begin on a confirmed factor must be refused.
  const beginRes = await post(browser, enrollmentPath, { intent: 'begin' });
  assert.equal(beginRes.status, 409);
  assert.equal((await beginRes.json()).code, 'enrollment_unavailable');

  // Attempting replace_unconfirmed on a confirmed factor must be refused.
  const replaceRes = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(replaceRes.status, 409);
  assert.equal((await replaceRes.json()).code, 'enrollment_unavailable');

  // Attempting confirmation on a confirmed factor must be refused.
  const reConfirmRes = await post(browser, enrollmentPath + '/confirm', proof);
  assert.equal(reConfirmRes.status, 409);
  assert.equal((await reConfirmRes.json()).code, 'enrollment_unavailable');

  // Attempting confirmation with arbitrary enrollment ID and code is refused.
  const arbitraryProof = { enrollment_id: 'enr_' + 'a'.repeat(64), authenticator_code: '123456' };
  const arbitraryConfirmRes = await post(browser, enrollmentPath + '/confirm', arbitraryProof);
  assert.equal(arbitraryConfirmRes.status, 409);

  // Storage probe verifies confirmed factor and recovery verifiers remain untouched in MySQL.
  storageProbe('confirmed-state', id, { secret: enrollment.manual_key });

  // Verified session remains active and is never downgraded or disrupted.
  const sessionRes = await browser.request('/api/v1/session');
  assert.equal(sessionRes.status, 200);
  const session = await sessionRes.json();
  assert.equal(session.state, 'authenticated');
  assert.equal(session.mfa.status, 'verified');
});

test('10-minute enrollment expiry rejects confirmation and replacement until reviewed begin', async () => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('expiry');
  const now = Date.now();
  const expiresAt = Date.parse(enrollment.expires_at);
  assert.ok(expiresAt - now <= 600000, 'Expiry must not exceed 10 minutes');
  assert.ok(expiresAt - now > 590000, 'Expiry must be approximately 10 minutes');

  // Advance MySQL row past the 10-minute expiry boundary.
  storageProbe('expire', id);

  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };

  // Confirmation of an expired enrollment is rejected.
  const confirmExpired = await post(browser, enrollmentPath + '/confirm', proof);
  assert.equal(confirmExpired.status, 409);
  assert.equal((await confirmExpired.json()).code, 'enrollment_unavailable');

  // Explicit replacement of an expired enrollment is rejected (requires reviewed begin).
  const replaceExpired = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(replaceExpired.status, 409);
  assert.equal((await replaceExpired.json()).code, 'enrollment_unavailable');

  // A reviewed begin succeeds after expiry, establishing a fresh 10-minute window.
  const freshBegin = await post(browser, enrollmentPath, { intent: 'begin' });
  assert.equal(freshBegin.status, 200);
  const { enrollment: fresh } = await freshBegin.json();
  assert.notEqual(fresh.id, enrollment.id);
  assert.notEqual(fresh.manual_key, enrollment.manual_key);
  assert.ok(Date.parse(fresh.expires_at) - Date.now() <= 600000);

  // Confirming the fresh enrollment within its active window succeeds.
  const freshProof = { enrollment_id: fresh.id, authenticator_code: authenticatorCode(fresh.manual_key) };
  const confirmFresh = await post(browser, enrollmentPath + '/confirm', freshProof);
  assert.equal(confirmFresh.status, 200);
  const confirmed = await confirmFresh.json();
  assert.equal(confirmed.session.state, 'authenticated');
  assert.equal(confirmed.session.mfa.status, 'verified');
  storageProbe('confirmed', id, { secret: fresh.manual_key, codes: confirmed.recovery_codes.codes });
});

test('five-proof attempt lockout enforces retry-after and survives replacement', async () => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('lockout');
  const valid = authenticatorCode(enrollment.manual_key);
  const wrong = valid === '000000' ? '000001' : '000000';

  // 5 failed proofs exhaust the attempt budget.
  for (let i = 1; i <= 5; i++) {
    const res = await post(browser, enrollmentPath + '/confirm', { enrollment_id: enrollment.id, authenticator_code: wrong });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'invalid_authenticator_proof');
    storageProbe('failed-attempts', id, { expected_attempts: i });
  }

  // 6th attempt (even with valid TOTP code) is locked out with 429.
  const lockedOut = await post(browser, enrollmentPath + '/confirm', { enrollment_id: enrollment.id, authenticator_code: valid });
  assert.equal(lockedOut.status, 429);
  assert.match(lockedOut.headers.get('retry-after'), /^[1-9][0-9]*$/);
  assert.equal((await lockedOut.json()).code, 'throttled');

  // Replacement within attempt window cannot reset the budget and is rejected with 429.
  const replaceRes = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(replaceRes.status, 429);
  assert.match(replaceRes.headers.get('retry-after'), /^[1-9][0-9]*$/);

  // Session remains mfa_enrollment_required; factor was not confirmed.
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), { state: 'mfa_enrollment_required' });
  storageProbe('prepared', id, { secret: enrollment.manual_key });

  // Expire the attempt window in MySQL; officer can now replace and confirm with fresh budget.
  storageProbe('expire-lockout', id);
  const freshReplacement = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(freshReplacement.status, 200);
  const { enrollment: next } = await freshReplacement.json();
  const nextProof = { enrollment_id: next.id, authenticator_code: authenticatorCode(next.manual_key) };
  const successConfirm = await post(browser, enrollmentPath + '/confirm', nextProof);
  assert.equal(successConfirm.status, 200);
});

test('wrong-session and duplicate confirmation rejection preserve single issuance', async () => {
  const { browser: session1, id, email, password, prepared: { enrollment } } = await preparedOfficer('wrong-dup');
  const validProof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };

  // Establish Session 2 for the same identity via distinct browser.
  const session2 = new Browser();
  await session2.request('/csrf-cookie');
  const signIn2 = await post(session2, '/api/v1/session/sign-in', { email, password });
  assert.equal(signIn2.status, 200);

  // Session 2 confirmation of Session 1's enrollment is rejected with 409.
  const wrongSessionConfirm = await post(session2, enrollmentPath + '/confirm', validProof);
  assert.equal(wrongSessionConfirm.status, 409);
  assert.equal((await wrongSessionConfirm.json()).code, 'enrollment_unavailable');

  // Session 2 replacement of Session 1's enrollment is rejected with 409.
  const wrongSessionReplace = await post(session2, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(wrongSessionReplace.status, 409);

  // In MySQL: enrollment remains unconfirmed and bound to Session 1.
  storageProbe('prepared', id, { secret: enrollment.manual_key });

  // Session 1 confirms successfully.
  const oldCookies = new Map(session1.cookies);
  const confirmRes = await post(session1, enrollmentPath + '/confirm', validProof);
  assert.equal(confirmRes.status, 200);
  const confirmed = await confirmRes.json();
  assert.equal(confirmed.session.state, 'authenticated');
  assert.equal(confirmed.session.mfa.status, 'verified');
  assert.equal(confirmed.recovery_codes.codes.length, 10);

  // Duplicate confirmation from the rotated session is rejected with 409.
  const dupRotatedConfirm = await post(session1, enrollmentPath + '/confirm', validProof);
  assert.equal(dupRotatedConfirm.status, 409);
  assert.equal((await dupRotatedConfirm.json()).code, 'enrollment_unavailable');

  // Duplicate confirmation replaying the pre-rotation session cookie is rejected:
  const replayed = new Browser();
  replayed.cookies = oldCookies;
  // With stale CSRF token, CSRF guard precedence rejects with 419:
  const staleCsrfConfirm = await post(replayed, enrollmentPath + '/confirm', validProof);
  assert.equal(staleCsrfConfirm.status, 419);
  // Reading session confirms the old session was invalidated to signed_out:
  assert.deepEqual(await (await replayed.request('/api/v1/session')).json(), { state: 'signed_out' });
  // With fresh CSRF cookie but stale session, authentication guard rejects with 401:
  await replayed.request('/csrf-cookie');
  const dupReplayConfirm = await post(replayed, enrollmentPath + '/confirm', validProof);
  assert.equal(dupReplayConfirm.status, 401);

  // In MySQL: exactly ONE issuance event, exactly 10 recovery verifiers, enrollment marked consumed.
  storageProbe('confirmed', id, { secret: enrollment.manual_key, codes: confirmed.recovery_codes.codes });
});

test('concurrent confirmation race across independent workers issues at most one 200 and one recovery set', async t => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('race');
  storageProbe('prepared', id, { secret: enrollment.manual_key });
  const contender = new Browser();
  contender.cookies = new Map(browser.cookies);
  contender.worker = 'contender';
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/enrollment-state.php', 'hold', id]);
  const held = new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holder.once('exit', code => { if (code !== 0) reject(new Error('Lock holder failed')); });
  });
  t.after(() => holder.stdin.end('\n'));
  await Promise.race([held, new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 5000))]);
  // Leave time for the deliberate lock barrier within the current TOTP step.
  const remaining = 30000 - Date.now() % 30000;
  if (remaining < 5000) await new Promise(resolve => setTimeout(resolve, remaining + 100));
  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };
  const responses = Promise.all([post(browser, enrollmentPath + '/confirm', proof), post(contender, enrollmentPath + '/confirm', proof)]);
  let waiting = 0;
  const mysql = process.env.YSP_TEST_MYSQL_CONTAINER;
  assert.ok(mysql, 'Set YSP_TEST_MYSQL_CONTAINER to the disposable MySQL container');
  for (let i = 0; i < 40; i++) {
    const probe = spawnSync('docker', ['exec', mysql, 'sh', '-c',
      'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    waiting = Number(probe.stdout.trim());
    if (waiting >= 2) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  holder.stdin.end('\n');
  const result = await responses;
  assert.ok(waiting >= 2, `Both server-side transactions must overlap at a database lock (waiters=${waiting}, statuses=${result.map(r => r.status)})`);
  assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
  const success = await result.find(r => r.status === 200).json();
  const rejected = await result.find(r => r.status === 409).json();
  assert.equal(rejected.code, 'enrollment_unavailable');
  assert.equal(rejected.recovery_codes, undefined);
  storageProbe('confirmed', id, { secret: enrollment.manual_key, codes: success.recovery_codes.codes });
});

test('lost confirmation response recovering via bootstrap without secret readback', async () => {
  const { browser, id, email, password, prepared: { enrollment } } = await preparedOfficer('lost-response');
  const validProof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };

  // Send confirmation request.
  // The server atomically commits factor, rotates session, and persists 10 recovery code verifiers.
  const confirmRes = await post(browser, enrollmentPath + '/confirm', validProof);
  assert.equal(confirmRes.status, 200);

  // Simulate lost confirmation response payload:
  // Client discards/never reads the recovery codes from the confirmation response body.
  // The client only has the updated session cookie and must discover state via GET bootstrap.
  const bootstrapRes = await browser.request('/api/v1/session');
  assert.equal(bootstrapRes.status, 200);
  const session = await bootstrapRes.json();
  assert.equal(session.state, 'authenticated');
  assert.equal(session.mfa.status, 'verified');

  // Critical requirement: bootstrap NEVER delivers recovery codes or secret readback.
  assert.equal(Object.hasOwn(session, 'recovery_codes'), false, 'Bootstrap must not include recovery codes');
  assert.equal(Object.hasOwn(session, 'setup_uri'), false, 'Bootstrap must not include setup URI');
  assert.equal(Object.hasOwn(session, 'manual_key'), false, 'Bootstrap must not include manual key');
  assert.equal(Object.hasOwn(session, 'secret'), false, 'Bootstrap must not include secret');

  // No retry or readback operation can disclose the plaintext recovery codes.
  // Repeating confirm is rejected with 409 (already confirmed).
  const repeatConfirm = await post(browser, enrollmentPath + '/confirm', validProof);
  assert.equal(repeatConfirm.status, 409);
  assert.equal(Object.hasOwn(await repeatConfirm.json(), 'recovery_codes'), false);

  // Beginning new enrollment is rejected with 409 (confirmed factor cannot be replaced).
  const repeatBegin = await post(browser, enrollmentPath, { intent: 'begin' });
  assert.equal(repeatBegin.status, 409);

  // If the client lost the session cookie entirely (e.g. abrupt disconnect before receiving response):
  const freshClient = new Browser();
  await freshClient.request('/csrf-cookie');
  // Re-authenticating via sign-in lands in challenge-required, NOT enrollment-required.
  const reSignIn = await post(freshClient, '/api/v1/session/sign-in', { email, password });
  assert.equal(reSignIn.status, 200);
  const reSession = await (await freshClient.request('/api/v1/session')).json();
  assert.equal(reSession.state, 'mfa_challenge_required', 'Must require challenge proof, not enrollment');
  assert.equal(Object.hasOwn(reSession, 'recovery_codes'), false);

  // Real MySQL verification: factor is confirmed, exactly 10 hashed verifiers exist, and secrets are never read back.
  storageProbe('confirmed-state', id, { secret: enrollment.manual_key });
});

test('enrollment applies origin, CSRF, shape and current identity state guards without granting MFA', async () => {
  const anonymous = new Browser();
  await anonymous.request('/csrf-cookie');
  assert.equal((await post(anonymous, enrollmentPath, {})).status, 422);
  assert.equal((await post(anonymous, enrollmentPath, { intent: 'begin' })).status, 401);
  const { browser, id } = await signedInBrowser('requester');
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 403);
  arrangeState('head', id);
  await browser.request('/api/v1/session');
  assert.equal((await browser.request(enrollmentPath, { method: 'POST', body: {},
    headers: { Origin: 'https://sibling.invalid' } })).status, 403);
  assert.equal((await browser.request(enrollmentPath, { method: 'POST', body: {} })).status, 419);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin', user_id: id })).status, 422);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 200);
  arrangeState('disable', id);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 401);
});

test('a recovery-code persistence failure rolls back factor confirmation and enrollment consumption', async () => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('rollback');
  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };
  assert.match(id, /^[1-9][0-9]*$/);
  mysqlFault(`DELIMITER //
CREATE TRIGGER enrollment_test_reject_issuance BEFORE INSERT ON user_recovery_codes FOR EACH ROW
BEGIN IF NEW.user_id = ${id} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic persistence fault'; END IF; END//
DELIMITER ;\n`);
  try {
    const response = await post(browser, enrollmentPath + '/confirm', proof);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).recovery_codes, undefined);
    storageProbe('prepared', id, { secret: enrollment.manual_key });
    assert.deepEqual(await (await browser.request('/api/v1/session')).json(), { state: 'mfa_enrollment_required' });
  } finally {
    mysqlFault('DROP TRIGGER IF EXISTS enrollment_test_reject_issuance;');
  }
  assert.equal((await post(browser, enrollmentPath + '/confirm', {
    ...proof, authenticator_code: authenticatorCode(enrollment.manual_key),
  })).status, 200);
});

test('authenticator skew is bounded to the current 30-second step', async () => {
  const { browser, prepared: { enrollment } } = await preparedOfficer('skew');
  const remaining = 30000 - Date.now() % 30000;
  if (remaining < 5000) await new Promise(resolve => setTimeout(resolve, remaining + 100));
  const now = Date.now();
  const current = authenticatorCode(enrollment.manual_key, now);
  for (const offset of [-30000, 30000]) {
    const outside = authenticatorCode(enrollment.manual_key, now + offset);
    // Adjacent steps can rarely produce the same six-digit string.
    if (outside === current) continue;
    assert.equal((await post(browser, enrollmentPath + '/confirm', {
      enrollment_id: enrollment.id, authenticator_code: outside,
    })).status, 400);
  }
  assert.equal((await post(browser, enrollmentPath + '/confirm', {
    enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key),
  })).status, 200);
});

test('enrollment IP throttling bounds malformed attempts while origin and CSRF guards still win', async () => {
  const { browser, id } = await signedInBrowser('ip-cap');
  arrangeState('clear-throttles', id);
  for (let i = 0; i < 60; i++) assert.equal((await post(browser, enrollmentPath, {})).status, 422);
  const limited = await post(browser, enrollmentPath, {});
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get('retry-after'), /^[1-9][0-9]*$/);
  assert.equal((await browser.request(enrollmentPath, { method: 'POST', body: {} })).status, 419);
  assert.equal((await browser.request(enrollmentPath, { method: 'POST', body: {}, headers: { Origin: 'https://invalid.test' } })).status, 403);
  arrangeState('expire-throttles', id);
  assert.equal((await post(browser, enrollmentPath, {})).status, 422);
});

test('a failed rotated-session write cannot persist uncommitted verified MFA during middleware unwinding', async () => {
  const { browser, id, prepared: { enrollment } } = await preparedOfficer('session-rollback');
  assert.match(id, /^[1-9][0-9]*$/);
  mysqlFault(`DELIMITER //
CREATE TRIGGER enrollment_test_reject_session BEFORE INSERT ON sessions FOR EACH ROW
BEGIN IF JSON_UNQUOTE(JSON_EXTRACT(CONVERT(FROM_BASE64(NEW.payload) USING utf8mb4), '$.identity_id')) = '${id}'
AND JSON_EXTRACT(CONVERT(FROM_BASE64(NEW.payload) USING utf8mb4), '$.mfa_verified_at') IS NOT NULL
AND COALESCE(@enrollment_fault_fired, 0) = 0 THEN
SET @enrollment_fault_fired = 1;
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic session persistence fault'; END IF; END//
DELIMITER ;\n`);
  try {
    assert.equal((await post(browser, enrollmentPath + '/confirm', {
      enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key),
    })).status, 503);
    storageProbe('prepared', id, { secret: enrollment.manual_key });
    assert.notEqual((await (await browser.request('/api/v1/session')).json()).state, 'authenticated');
  } finally {
    mysqlFault('DROP TRIGGER IF EXISTS enrollment_test_reject_session;');
  }
});

// Ticket 03 exercises the same gateway/CLI/MySQL seam as enrollment.
const challengePath = '/api/v1/session/mfa/challenge/verify';
const regeneratePath = '/api/v1/session/mfa/recovery-codes/regenerate';
async function returningBrowser(officer, worker) {
  const browser = new Browser();
  browser.worker = worker;
  await browser.request('/csrf-cookie');
  const response = await post(browser, '/api/v1/session/sign-in', { email: officer.email, password: officer.password });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.state, 'mfa_challenge_required');
  return { browser, challenge: snapshot.challenge };
}
async function enrolledOfficer(label) {
  const officer = await preparedOfficer(label);
  const { enrollment } = officer.prepared;
  const enrollmentCode = authenticatorCode(enrollment.manual_key);
  const response = await post(officer.browser, enrollmentPath + '/confirm', {
    enrollment_id: enrollment.id, authenticator_code: enrollmentCode,
  });
  assert.equal(response.status, 200);
  return { ...officer, enrollmentCode, secret: enrollment.manual_key, codes: (await response.json()).recovery_codes.codes };
}
async function nextTotpStep() {
  await new Promise(resolve => setTimeout(resolve, 30100 - Date.now() % 30000));
}

test('ticket03 authenticator challenge accepts a fresh step once across sessions and rotates credentials', async () => {
  const officer = await enrolledOfficer('challenge-totp');
  const first = await returningBrowser(officer);
  const second = await returningBrowser(officer);
  // The enrollment proof already consumed this step.
  const proof = { method: 'authenticator', authenticator_code: officer.enrollmentCode };
  assert.equal((await post(first.browser, challengePath, { ...proof, challenge_id: first.challenge.id })).status, 400);
  await nextTotpStep();
  proof.authenticator_code = authenticatorCode(officer.secret);
  const oldCookies = new Map(first.browser.cookies);
  const accepted = await post(first.browser, challengePath, { ...proof, challenge_id: first.challenge.id });
  assert.equal(accepted.status, 200);
  const snapshot = await accepted.json();
  assert.equal(snapshot.state, 'authenticated');
  assert.equal(snapshot.mfa.status, 'verified');
  assert.deepEqual(snapshot.provider_destinations, []);
  assert.equal(snapshot.recovery_codes, undefined);
  assert.notEqual(first.browser.cookies.get('XSRF-TOKEN'), oldCookies.get('XSRF-TOKEN'));
  const stale = new Browser();
  stale.cookies = oldCookies;
  assert.deepEqual(await (await stale.request('/api/v1/session')).json(), { state: 'signed_out' });
  assert.deepEqual(await (await first.browser.request('/api/v1/session')).json(), snapshot);
  assert.equal((await post(second.browser, challengePath, { ...proof, challenge_id: second.challenge.id })).status, 400);
});

for (const method of ['recovery_code', 'authenticator', 'same_challenge']) {
  test(`ticket03 concurrent ${method} replay across sessions accepts exactly one use`, async t => {
    const officer = await enrolledOfficer('recovery-race');
    const first = await returningBrowser(officer);
    const second = method === 'same_challenge'
      ? { browser: new Browser(), challenge: first.challenge } : await returningBrowser(officer, 'contender');
    if (method === 'same_challenge') {
      second.browser.cookies = new Map(first.browser.cookies);
      second.browser.worker = 'contender';
    }
    if (method === 'authenticator') await nextTotpStep();
    const factor = method === 'authenticator' ? { method, authenticator_code: authenticatorCode(officer.secret) }
      : { method: 'recovery_code', recovery_code: officer.codes[0] };
    const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
      'php', 'tests/fixtures/enrollment-state.php', 'hold', officer.id]);
    t.after(() => holder.stdin.end('\n'));
    await new Promise((resolve, reject) => {
      holder.once('error', reject);
      holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
      holder.once('exit', () => reject(new Error('Lock holder exited')));
    });
    const submit = ({ browser, challenge }) => post(browser, challengePath, { challenge_id: challenge.id, ...factor });
    const requests = [submit(first)];
    let secondStarted = false;
    let waiting = 0;
    let lockDetails = "";
    try {
      for (let i = 0; i < 40; i++) {
        const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
          'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], { encoding: 'utf8' });
        assert.equal(probe.status, 0, probe.stderr);
        waiting = Number(probe.stdout.trim());
        // Stage the second request after the first reaches the identity barrier.
        // Both proof transactions still overlap; unrelated IP-counter acquisition is outside this seam.
        if (waiting >= 1 && !secondStarted) {
          requests.push(submit(second));
          secondStarted = true;
        }
        if (waiting >= 2) break;
        if (i === 39) {
          const details = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
            'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT l.OBJECT_NAME,l.INDEX_NAME,l.LOCK_MODE FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON w.REQUESTING_ENGINE_LOCK_ID=l.ENGINE_LOCK_ID"'], { encoding: 'utf8' });
          lockDetails = details.stdout;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally {
      holder.stdin.end('\n');
    }
    const results = await Promise.all(requests);
    assert.ok(waiting >= 2, `Expected overlapping server transactions, saw ${waiting} waiters; statuses=${results.map(r => r.status)}; locks=${lockDetails}`);
    const rejectedStatus = method === 'same_challenge' ? 409 : 400;
    assert.deepEqual(results.map(r => r.status).sort(), [200, rejectedStatus]);
    const rejectedIndex = results.findIndex(r => r.status === rejectedStatus);
    assert.equal((await results[rejectedIndex].json()).recovery_codes, undefined);
    const loser = [first, second][rejectedIndex];
    const retry = await post(loser.browser, challengePath, {
      challenge_id: loser.challenge.id, method: 'recovery_code', recovery_code: officer.codes[1],
    });
    if (method === 'same_challenge') {
      assert.ok([409, 419].includes(retry.status), 'A consumed challenge cannot accept another unused code');
      assert.deepEqual(await (await loser.browser.request('/api/v1/session')).json(), { state: 'signed_out' });
    } else {
      assert.equal(retry.status, 200);
    }
    const third = await returningBrowser(officer);
    assert.equal((await post(third.browser, challengePath, {
      challenge_id: third.challenge.id, ...factor,
    })).status, 400);
});
}

test('ticket03 identity throttle survives fresh cookies and restarted challenges', async () => {
  const officer = await enrolledOfficer('challenge-throttle');
  const wrong = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ';
  assert.ok(!officer.codes.includes(wrong));
  for (let i = 0; i < 5; i++) {
    const { browser, challenge } = await returningBrowser(officer);
    const response = await post(browser, challengePath, {
      challenge_id: challenge.id, method: 'recovery_code', recovery_code: wrong,
    });
    assert.equal(response.status, 400);
  }
  const { browser, challenge } = await returningBrowser(officer);
  const response = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'recovery_code', recovery_code: officer.codes[0],
  });
  assert.equal(response.status, 429);
  assert.match(response.headers.get('Retry-After'), /^[1-9][0-9]*$/);
  assert.equal((await response.json()).recovery_codes, undefined);
  assert.equal((await (await browser.request('/api/v1/session')).json()).state, 'mfa_challenge_required');
});

test('ticket03 regeneration replaces the whole set only with both fresh request proofs', async () => {
  const officer = await enrolledOfficer('regenerate');
  const proof = { password: officer.password, authenticator_code: authenticatorCode(officer.secret) };
  assert.equal((await post(officer.browser, regeneratePath, { authenticator_code: proof.authenticator_code })).status, 422);
  assert.equal((await post(officer.browser, regeneratePath, { password: officer.password, recovery_code: officer.codes[0] })).status, 422);
  const wrongPassword = await post(officer.browser, regeneratePath, { ...proof, password: 'Incorrect-password!' });
  assert.equal(wrongPassword.status, 400);
  assert.equal((await wrongPassword.json()).recovery_codes, undefined);
  const before = await returningBrowser(officer);
  assert.equal((await post(before.browser, challengePath, {
    challenge_id: before.challenge.id, method: 'recovery_code', recovery_code: officer.codes[2],
  })).status, 200, 'Failed regeneration preserves the old set');
  await nextTotpStep();
  proof.authenticator_code = authenticatorCode(officer.secret);
  const oldCookies = new Map(officer.browser.cookies);
  mysqlFault(`CREATE TRIGGER mfa_test_reject_codes BEFORE INSERT ON user_recovery_codes FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic recovery issuance failure';`);
  try {
    assert.equal((await post(officer.browser, regeneratePath, proof)).status, 503);
  } finally {
    mysqlFault('DROP TRIGGER IF EXISTS mfa_test_reject_codes;');
  }
  storageProbe('confirmed', officer.id, { secret: officer.secret, codes: officer.codes });
  const response = await post(officer.browser, regeneratePath, proof);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.session.state, 'authenticated');
  assert.equal(result.session.mfa.status, 'verified');
  assert.equal(result.recovery_codes.codes.length, 10);
  assert.equal(new Set(result.recovery_codes.codes).size, 10);
  for (const code of result.recovery_codes.codes) {
    assert.match(code, /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
    assert.ok(!officer.codes.includes(code));
  }
  assert.notEqual(officer.browser.cookies.get('XSRF-TOKEN'), oldCookies.get('XSRF-TOKEN'));
  assert.deepEqual(await (await officer.browser.request('/api/v1/session')).json(), result.session);
  storageProbe('confirmed', officer.id, { secret: officer.secret, codes: result.recovery_codes.codes });
  const after = await returningBrowser(officer);
  for (const code of [officer.codes[0], officer.codes[9]]) {
    assert.equal((await post(after.browser, challengePath, {
      challenge_id: after.challenge.id, method: 'recovery_code', recovery_code: code,
    })).status, 400);
  }
  assert.equal((await post(after.browser, challengePath, {
    challenge_id: after.challenge.id, method: 'recovery_code', recovery_code: result.recovery_codes.codes[0],
  })).status, 200);
  const replay = await post(officer.browser, regeneratePath, proof);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).recovery_codes, undefined);
});

test('ticket03 an exhausted challenge stays exhausted when the identity window expires', async () => {
  const officer = await enrolledOfficer('challenge-window');
  const { browser, challenge } = await returningBrowser(officer);
  const wrong = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ';
  assert.ok(!officer.codes.includes(wrong));
  for (let i = 0; i < 5; i++) {
    assert.equal((await post(browser, challengePath, {
      challenge_id: challenge.id, method: 'recovery_code', recovery_code: wrong,
    })).status, 400);
  }
  // An identity window may predate this challenge; its expiry cannot replenish this challenge.
  arrangeState('expire-throttles', officer.id);
  const response = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'recovery_code', recovery_code: officer.codes[0],
  });
  assert.equal(response.status, 429);
  assert.match(response.headers.get('Retry-After'), /^[1-9][0-9]*$/);
  const restarted = await returningBrowser(officer);
  assert.equal((await post(restarted.browser, challengePath, {
    challenge_id: restarted.challenge.id, method: 'recovery_code', recovery_code: officer.codes[0],
  })).status, 200, 'Identity lockout is bounded while the exhausted challenge remains unusable');
});
