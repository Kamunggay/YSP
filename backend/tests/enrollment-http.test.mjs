import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { spawn, spawnSync as nativeSpawnSync } from 'node:child_process';
import { measure, measureSync } from './helpers/verification-profile.mjs';

function spawnSync(command, args, options) {
  const category = args.some(arg => String(arg).includes('data_lock_waits')) ? 'concurrency-probes' : 'fixture-processes';
  return measureSync(category, () => nativeSpawnSync(command, args, options));
}
import { loadContract } from '../../contracts/transport/validation/operation-examples.mjs';

const { api, ajv } = await loadContract();

const origin = process.env.YSP_TEST_ORIGIN;
const browserOrigin = process.env.YSP_TEST_BROWSER_ORIGIN ?? origin;
const container = process.env.YSP_TEST_CONTAINER;
assert.ok(origin, 'Set YSP_TEST_ORIGIN to the disposable gateway origin');

class Browser {
  cookies = new Map();
  async request(...args) {
    return measure('http-requests', () => this.requestMeasured(...args));
  }
  async requestMeasured(path, { method = 'GET', body, rawBody, headers = {} } = {}) {
    const requestHeaders = { Accept: 'application/json', Origin: browserOrigin,
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...(body === undefined && rawBody === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(this.worker ? { 'X-Test-Worker': this.worker } : {}), ...headers };
    for (const key of Object.keys(requestHeaders)) if (requestHeaders[key] === null) delete requestHeaders[key];
    const response = await fetch(origin + path, {
      method, redirect: 'error',
      headers: requestHeaders,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, ...value] = cookie.split(';')[0].split('=');
      this.cookies.set(name, value.join('='));
    }
    const contractPath = path === '/csrf-cookie' ? path : path.replace('/api/v1', '');
    const membershipContractPath = contractPath.split('?')[0]
      .replace(/^\/chapters\/[^/]+\//, '/chapters/{chapter_id}/')
      .replace(/\/memberships\/[^/]+\/(disable|revoke)$/, '/memberships/{membership_id}/$1')
      .replace(/\/operations\/by-id\/[^/]+$/, '/operations/by-id/{operation_id}');
    const operation = api.paths[contractPath]?.[method.toLowerCase()]
      ?? (contractPath.startsWith('/chapters/') ? api.paths[membershipContractPath]?.[method.toLowerCase()] : undefined);
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

async function runIdentityCliMeasured(answers, command = 'identity:create') {
  assert.ok(container, 'Set YSP_TEST_CONTAINER to the disposable backend container');
  const child = spawn('docker', ['exec', '-i', container, 'script', '-qec',
    `php artisan ${command} --no-ansi`, '/dev/null']);
  let output = '';
  let next = 0;
  const timer = setTimeout(() => child.kill(), 60000);
  child.stdout.on('data', data => {
    output += data.toString();
    if (next < answers.length && output.includes(answers[next][0])) {
      const answer = answers[next++][1];
      setTimeout(() => child.stdin.write(answer + '\n'), 20);
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

function arrangeState(action, id) {
  const result = spawnSync('docker', ['exec', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/session-state.php', action, id], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Fixture applied');
}

// Labeled synthetic arrangements; real CLI tests continue to call createIdentity/installProvisioner.
function syntheticOfficer(label, provider = false, options = {}) {
  const email = `${label}-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/officer-setup.php', provider ? 'provider' : 'identity'],
  { encoding: 'utf8', input: JSON.stringify({ email, password, ...options }) });
  assert.equal(result.status, 0, result.stderr);
  return { ...JSON.parse(result.stdout), email, password };
}

async function cliOfficer(label) {
  const email = `${label}-${Date.now()}@example.test`;
  const password = 'Synthetic-only-secret-42!';
  const id = await createIdentity(email, password);
  arrangeState('clear-throttles', id);
  return { id, email, password };
}

async function signedInBrowserMeasured(label, officer = syntheticOfficer(label)) {
  const { id, email, password } = officer;
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await browser.request('/api/v1/session/sign-in', {
    method: 'POST', body: { email, password },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(browser.cookies.get('XSRF-TOKEN')) },
  });
  assert.equal(response.status, 200);
  return { ...officer, browser };
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

async function preparedOfficerMeasured(label) {
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
  if (remaining < 5000) await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, remaining + 100)));
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
    await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 50)));
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
  if (remaining < 5000) await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, remaining + 100)));
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
async function enrolledOfficerMeasured(label) {
  const officer = await preparedOfficer(label);
  arrangeState('clear-throttles', officer.id);
  const { enrollment } = officer.prepared;
  const remaining = 30000 - Date.now() % 30000;
  if (remaining < 3000) await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, remaining + 100)));
  const enrollmentCode = authenticatorCode(enrollment.manual_key);
  const response = await post(officer.browser, enrollmentPath + '/confirm', {
    enrollment_id: enrollment.id, authenticator_code: enrollmentCode,
  });
  assert.equal(response.status, 200);
  return { ...officer, enrollmentCode, secret: enrollment.manual_key, codes: (await response.json()).recovery_codes.codes };
}
async function nextTotpStep(officer) {
  const id = typeof officer === 'string' ? officer : (officer?.id ?? officer?.browser?.id);
  if (id) {
    storageProbe('advance-step', id);
    return;
  }
  await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 30100 - Date.now() % 30000)));
}

test('ticket03 authenticator challenge accepts a fresh step once across sessions and rotates credentials', async () => {
  const officer = await enrolledOfficer('challenge-totp');
  const first = await returningBrowser(officer);
  const second = await returningBrowser(officer);
  // The enrollment proof already consumed this step.
  const proof = { method: 'authenticator', authenticator_code: officer.enrollmentCode };
  assert.equal((await post(first.browser, challengePath, { ...proof, challenge_id: first.challenge.id })).status, 400);
  await nextTotpStep(officer);
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

test('ticket03 recovery code challenge accepts a code once across sessions and rotates credentials', async () => {
  const officer = await enrolledOfficer('challenge-recovery');
  const first = await returningBrowser(officer);
  const second = await returningBrowser(officer);
  const proof = { method: 'recovery_code', recovery_code: officer.codes[0] };
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

  // Cross-session replay of the consumed recovery code must be rejected
  assert.equal((await post(second.browser, challengePath, { ...proof, challenge_id: second.challenge.id })).status, 400);

  // Unused recovery code on second session succeeds
  const secondAccepted = await post(second.browser, challengePath, {
    method: 'recovery_code', recovery_code: officer.codes[1], challenge_id: second.challenge.id,
  });
  assert.equal(secondAccepted.status, 200);
  assert.equal((await secondAccepted.json()).state, 'authenticated');

  // A third session cannot reuse either consumed code
  const third = await returningBrowser(officer);
  assert.equal((await post(third.browser, challengePath, { ...proof, challenge_id: third.challenge.id })).status, 400);
  assert.equal((await post(third.browser, challengePath, {
    method: 'recovery_code', recovery_code: officer.codes[1], challenge_id: third.challenge.id,
  })).status, 400);
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
    if (method === 'authenticator') await nextTotpStep(officer);
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
        await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 50)));
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
  await nextTotpStep(officer);
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

test('ticket03 challenge validity is five minutes, bootstrap does not extend expiry, and expired challenge rejects', async () => {
  const officer = await enrolledOfficer('challenge-validity');
  const { browser, challenge } = await returningBrowser(officer);
  const issuedAt = Date.now();
  const expiresAt = Date.parse(challenge.expires_at);
  const ttlSec = (expiresAt - issuedAt) / 1000;
  assert.ok(ttlSec >= 290 && ttlSec <= 305, `Expected ~300s challenge TTL, got ${ttlSec}s`);

  // Multiple getSession / bootstrap calls must return the identical challenge and not extend expires_at.
  const bootstrapRes1 = await browser.request('/api/v1/session');
  assert.equal(bootstrapRes1.status, 200);
  const snapshot1 = await bootstrapRes1.json();
  assert.equal(snapshot1.state, 'mfa_challenge_required');
  assert.equal(snapshot1.challenge.id, challenge.id, 'Challenge ID must remain stable across bootstrap');
  assert.equal(snapshot1.challenge.expires_at, challenge.expires_at, 'Bootstrap must not extend challenge expiry');

  // Expire the challenge in storage.
  arrangeState('expire-challenge', officer.id);

  // Calling bootstrap on an expired challenge still returns the original expired timestamp without extending it.
  const bootstrapRes2 = await browser.request('/api/v1/session');
  assert.equal(bootstrapRes2.status, 200);
  const snapshot2 = await bootstrapRes2.json();
  assert.equal(snapshot2.state, 'mfa_challenge_required');
  assert.notEqual(snapshot2.challenge.expires_at, challenge.expires_at);
  assert.ok(Date.parse(snapshot2.challenge.expires_at) < Date.now(), 'Expired challenge must remain in the past');

  // Attempting to verify the expired challenge must be rejected with 409 ChallengeUnavailable.
  const expiredProof = { method: 'recovery_code', recovery_code: officer.codes[0] };
  const expiredVerify = await post(browser, challengePath, {
    challenge_id: challenge.id, ...expiredProof,
  });
  assert.equal(expiredVerify.status, 409);
  const err = await expiredVerify.json();
  assert.equal(err.code, 'challenge_unavailable');
  assert.equal(err.message, 'Bootstrap the current session before a reviewed next action.');

  // Re-signing in issues a fresh 5-minute challenge that succeeds with the unused code.
  const reSignIn = await post(browser, '/api/v1/session/sign-in', { email: officer.email, password: officer.password });
  assert.equal(reSignIn.status, 200);
  const reSnapshot = await reSignIn.json();
  assert.equal(reSnapshot.state, 'mfa_challenge_required');
  assert.notEqual(reSnapshot.challenge.id, challenge.id, 'Fresh sign-in must issue a new challenge ID');
  const freshTtlSec = (Date.parse(reSnapshot.challenge.expires_at) - Date.now()) / 1000;
  assert.ok(freshTtlSec >= 290 && freshTtlSec <= 305, `Expected fresh ~300s TTL, got ${freshTtlSec}s`);

  const freshVerify = await post(browser, challengePath, {
    challenge_id: reSnapshot.challenge.id, ...expiredProof,
  });
  assert.equal(freshVerify.status, 200);
  assert.equal((await freshVerify.json()).state, 'authenticated');
});

test('ticket03 challenge verification rejects requests that supply both or neither factor method', async () => {
  const officer = await enrolledOfficer('both-or-neither');
  const { browser, challenge } = await returningBrowser(officer);
  const code = authenticatorCode(officer.secret);
  const recoveryCode = officer.codes[0];

  // 1. Supplying BOTH factor methods
  // Case A: method is authenticator, but recovery_code is also provided
  const bothWithAuth = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'authenticator', authenticator_code: code, recovery_code: recoveryCode,
  });
  assert.equal(bothWithAuth.status, 422);
  const bothWithAuthErr = await bothWithAuth.json();
  assert.equal(bothWithAuthErr.code, 'invalid_input');
  assert.ok(bothWithAuthErr.field_errors.some(e => ['/recovery_code', '/challenge_id'].includes(e.pointer)));

  // Case B: method is recovery_code, but authenticator_code is also provided
  const bothWithRecovery = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'recovery_code', recovery_code: recoveryCode, authenticator_code: code,
  });
  assert.equal(bothWithRecovery.status, 422);
  const bothWithRecoveryErr = await bothWithRecovery.json();
  assert.equal(bothWithRecoveryErr.code, 'invalid_input');
  assert.ok(bothWithRecoveryErr.field_errors.some(e => ['/authenticator_code', '/challenge_id'].includes(e.pointer)));

  // Case C: neither method field specified, but both codes provided
  const bothNoMethod = await post(browser, challengePath, {
    challenge_id: challenge.id, authenticator_code: code, recovery_code: recoveryCode,
  });
  assert.equal(bothNoMethod.status, 422);

  // 2. Supplying NEITHER factor method
  // Case D: only challenge_id provided
  const neither = await post(browser, challengePath, {
    challenge_id: challenge.id,
  });
  assert.equal(neither.status, 422);
  const neitherErr = await neither.json();
  assert.equal(neitherErr.code, 'invalid_input');
  assert.ok(neitherErr.field_errors.some(e => e.pointer === '/method'));

  // Case E: method is authenticator but missing authenticator_code
  const missingAuthCode = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'authenticator',
  });
  assert.equal(missingAuthCode.status, 422);
  const missingAuthCodeErr = await missingAuthCode.json();
  assert.ok(missingAuthCodeErr.field_errors.some(e => e.pointer === '/authenticator_code'));

  // Case F: method is recovery_code but missing recovery_code
  const missingRecoveryCode = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'recovery_code',
  });
  assert.equal(missingRecoveryCode.status, 422);
  const missingRecoveryCodeErr = await missingRecoveryCode.json();
  assert.ok(missingRecoveryCodeErr.field_errors.some(e => e.pointer === '/recovery_code'));

  // Case G: missing method with authenticator_code
  const missingMethodWithAuth = await post(browser, challengePath, {
    challenge_id: challenge.id, authenticator_code: code,
  });
  assert.equal(missingMethodWithAuth.status, 422);

  // Case H: missing method with recovery_code
  const missingMethodWithRecovery = await post(browser, challengePath, {
    challenge_id: challenge.id, recovery_code: recoveryCode,
  });
  assert.equal(missingMethodWithRecovery.status, 422);

  // Case I: invalid method name
  const invalidMethod = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'sms', authenticator_code: code,
  });
  assert.equal(invalidMethod.status, 422);

  // Case J: empty body
  const emptyBody = await post(browser, challengePath, {});
  assert.equal(emptyBody.status, 422);

  // 3. Confirm that 422 rejects did not consume the challenge or count as failed MFA proof attempts.
  // The challenge can still be verified successfully with exactly one valid method:
  const validResponse = await post(browser, challengePath, {
    challenge_id: challenge.id, method: 'recovery_code', recovery_code: recoveryCode,
  });
  assert.equal(validResponse.status, 200);
  assert.equal((await validResponse.json()).state, 'authenticated');
});

test('ticket03 regeneration rejects requests with only a recovery code, missing proofs, or cached session flag', async () => {
  const officer = await enrolledOfficer('regen-guards');
  const code = authenticatorCode(officer.secret);

  // 1. Unverified session (state is mfa_challenge_required) cannot regenerate codes
  const returning = await returningBrowser(officer);
  const unverifiedAttempt = await post(returning.browser, regeneratePath, {
    password: officer.password, authenticator_code: code,
  });
  assert.equal(unverifiedAttempt.status, 403);
  assert.equal(Object.hasOwn(await unverifiedAttempt.json(), 'recovery_codes'), false);

  // Verify MFA to reach authenticated state with mfa.status === 'verified'
  await nextTotpStep(officer);
  const verifyRes = await post(returning.browser, challengePath, {
    challenge_id: returning.challenge.id, method: 'authenticator', authenticator_code: authenticatorCode(officer.secret),
  });
  assert.equal(verifyRes.status, 200);
  assert.equal((await verifyRes.json()).state, 'authenticated');

  // Now in verified session:
  // 2. Reject regeneration with ONLY a recovery code
  const onlyRecovery = await post(returning.browser, regeneratePath, {
    recovery_code: officer.codes[0],
  });
  assert.equal(onlyRecovery.status, 422);
  const onlyRecoveryErr = await onlyRecovery.json();
  assert.equal(onlyRecoveryErr.code, 'invalid_input');
  assert.ok(onlyRecoveryErr.field_errors.some(e => ['/password', '/authenticator_code'].includes(e.pointer)));

  // 3. Reject regeneration with password and recovery code (cannot substitute recovery for authenticator)
  const recoverySubstitute = await post(returning.browser, regeneratePath, {
    password: officer.password, recovery_code: officer.codes[0],
  });
  assert.equal(recoverySubstitute.status, 422);

  // 4. Reject regeneration relying on cached session flags or caller flags
  for (const flagPayload of [
    {},
    { cached: true },
    { mfa_verified: true },
    { verified: true, password: officer.password },
    { mfa_verified_at: new Date().toISOString(), authenticator_code: code },
  ]) {
    const flagAttempt = await post(returning.browser, regeneratePath, flagPayload);
    assert.equal(flagAttempt.status, 422);
    assert.equal(Object.hasOwn(await flagAttempt.json(), 'recovery_codes'), false);
  }

  // 5. Old recovery codes remain valid after all rejected attempts
  const checkOldCode = await returningBrowser(officer);
  const verifyOldRes = await post(checkOldCode.browser, challengePath, {
    challenge_id: checkOldCode.challenge.id, method: 'recovery_code', recovery_code: officer.codes[0],
  });
  assert.equal(verifyOldRes.status, 200, 'Original recovery codes remain intact');
});

test('ticket03 whole-set regeneration invalidates every single predecessor recovery code in storage and verification', async () => {
  const officer = await enrolledOfficer('regen-all-codes');
  const initialCodes = [...officer.codes];
  assert.equal(initialCodes.length, 10);

  // Regenerate recovery codes with fresh credentials
  await nextTotpStep(officer);
  const regenRes = await post(officer.browser, regeneratePath, {
    password: officer.password,
    authenticator_code: authenticatorCode(officer.secret),
  });
  assert.equal(regenRes.status, 200);
  const { recovery_codes: { codes: newCodes } } = await regenRes.json();
  assert.equal(newCodes.length, 10);
  assert.equal(new Set(newCodes).size, 10);

  // Assert every new code is distinct from all old codes
  for (const oldCode of initialCodes) {
    assert.ok(!newCodes.includes(oldCode), `New codes must not include predecessor code ${oldCode}`);
  }

  // Storage verification: exactly the 10 new codes exist in MySQL, 0 old codes remain
  storageProbe('confirmed', officer.id, { secret: officer.secret, codes: newCodes });

  // HTTP verification: every single predecessor code is rejected
  // Batch 1 (predecessor codes 0..4)
  const returning1 = await returningBrowser(officer);
  for (let i = 0; i < 5; i++) {
    const res = await post(returning1.browser, challengePath, {
      challenge_id: returning1.challenge.id, method: 'recovery_code', recovery_code: initialCodes[i],
    });
    assert.equal(res.status, 400, `Predecessor code ${initialCodes[i]} must be rejected`);
  }

  // Clear identity throttles between batches so each code receives an independent 400 rejection
  arrangeState('expire-throttles', officer.id);

  // Batch 2 (predecessor codes 5..9)
  const returning2 = await returningBrowser(officer);
  for (let i = 5; i < 10; i++) {
    const res = await post(returning2.browser, challengePath, {
      challenge_id: returning2.challenge.id, method: 'recovery_code', recovery_code: initialCodes[i],
    });
    assert.equal(res.status, 400, `Predecessor code ${initialCodes[i]} must be rejected`);
  }

  arrangeState('expire-throttles', officer.id);

  // Verification: new codes work and are single-use
  const returning3 = await returningBrowser(officer);
  const newSuccess = await post(returning3.browser, challengePath, {
    challenge_id: returning3.challenge.id, method: 'recovery_code', recovery_code: newCodes[0],
  });
  assert.equal(newSuccess.status, 200);
  assert.equal((await newSuccess.json()).state, 'authenticated');

  // Reusing the consumed new code must fail
  const returning4 = await returningBrowser(officer);
  const reuseRes = await post(returning4.browser, challengePath, {
    challenge_id: returning4.challenge.id, method: 'recovery_code', recovery_code: newCodes[0],
  });
  assert.equal(reuseRes.status, 400);
});

test('ticket03 lost-response recovery via bootstrap recovers verified session without disclosing secrets or recovery codes', async () => {
  const officer = await enrolledOfficer('lost-response-mfa');

  // PART A: Lost response during verifyMfaChallenge
  const returning = await returningBrowser(officer);
  const verifyProof = {
    challenge_id: returning.challenge.id,
    method: 'recovery_code',
    recovery_code: officer.codes[0],
  };
  const verifyRes = await post(returning.browser, challengePath, verifyProof);
  assert.equal(verifyRes.status, 200);

  // Client discards/never processed response body; discovers session state via GET bootstrap:
  const bootstrapRes1 = await returning.browser.request('/api/v1/session');
  assert.equal(bootstrapRes1.status, 200);
  const session1 = await bootstrapRes1.json();
  assert.equal(session1.state, 'authenticated');
  assert.equal(session1.mfa.status, 'verified');
  assert.match(session1.mfa.verified_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  // Bootstrap must never include secrets or recovery codes
  assert.equal(session1.recovery_codes, undefined, 'Bootstrap must not include recovery codes');
  assert.equal(session1.secret, undefined);
  assert.equal(session1.manual_key, undefined);
  assert.equal(session1.setup_uri, undefined);

  // Replaying the consumed challenge is rejected with 409 ChallengeUnavailable
  const replayChallenge = await post(returning.browser, challengePath, verifyProof);
  assert.equal(replayChallenge.status, 409);
  const replayErr = await replayChallenge.json();
  assert.equal(replayErr.code, 'challenge_unavailable');
  assert.equal(replayErr.recovery_codes, undefined);

  // PART B: Lost response during regenerateRecoveryCodes
  await nextTotpStep(officer);
  const regenProof = {
    password: officer.password,
    authenticator_code: authenticatorCode(officer.secret),
  };
  const regenRes = await post(returning.browser, regeneratePath, regenProof);
  assert.equal(regenRes.status, 200);
  const regenBody = await regenRes.json();
  const newCodes = regenBody.recovery_codes.codes;
  assert.equal(newCodes.length, 10);

  // Client lost the regeneration response body; discovers state via GET bootstrap:
  const bootstrapRes2 = await returning.browser.request('/api/v1/session');
  assert.equal(bootstrapRes2.status, 200);
  const session2 = await bootstrapRes2.json();
  assert.equal(session2.state, 'authenticated');
  assert.equal(session2.mfa.status, 'verified');

  // Critical requirement: bootstrap NEVER delivers plaintext recovery codes or secrets!
  assert.equal(session2.recovery_codes, undefined, 'Bootstrap must never expose regenerated recovery codes');
  assert.equal(session2.codes, undefined);
  assert.equal(session2.secret, undefined);

  // Retrying the lost regeneration request with the same TOTP proof is rejected with 400 MfaProofRejected
  const replayRegen = await post(returning.browser, regeneratePath, regenProof);
  assert.equal(replayRegen.status, 400);
  const replayRegenErr = await replayRegen.json();
  assert.equal(replayRegenErr.code, 'invalid_factor_proof');
  assert.equal(replayRegenErr.message, 'The factor proof was not accepted.');
  assert.equal(replayRegenErr.recovery_codes, undefined, 'Replay failure must not disclose recovery codes');

  // PART C: If cookies were lost entirely (client crash before session cookie was saved)
  const freshClient = new Browser();
  await freshClient.request('/csrf-cookie');
  const reSignIn = await post(freshClient, '/api/v1/session/sign-in', {
    email: officer.email, password: officer.password,
  });
  assert.equal(reSignIn.status, 200);
  const reSignInBody = await reSignIn.json();
  assert.equal(reSignInBody.state, 'mfa_challenge_required');
  assert.equal(reSignInBody.recovery_codes, undefined);

  // All predecessor codes fail
  const oldCodeAttempt = await post(freshClient, challengePath, {
    challenge_id: reSignInBody.challenge.id, method: 'recovery_code', recovery_code: officer.codes[1],
  });
  assert.equal(oldCodeAttempt.status, 400);

  // Live authenticator proof succeeds
  await nextTotpStep(officer);
  const freshVerify = await post(freshClient, challengePath, {
    challenge_id: reSignInBody.challenge.id,
    method: 'authenticator',
    authenticator_code: authenticatorCode(officer.secret),
  });
  assert.equal(freshVerify.status, 200);
  assert.equal((await freshVerify.json()).state, 'authenticated');
});

function provisioningFixture(action, id, input = {}) {
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/provisioning-state.php', action, id], {encoding:'utf8', input:JSON.stringify(input)});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('ticket07 zero memberships is an authenticated empty context with a stable server revision', async () => {
  const {browser} = await signedInBrowser('p07-empty');
  const response = await browser.request('/api/v1/session/chapter-context');
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.chapter_state, 'no_authorized_memberships');
  assert.match(snapshot.selection_revision, /^ctx_[A-Za-z0-9_-]{32,96}$/);
  assert.deepEqual(await (await browser.request('/api/v1/session/chapter-context')).json(), snapshot);
  const choices = await (await browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(choices, {session:snapshot.session, items:[], limit:25, next_cursor:null});
});

function chapterFixture(action, user, input = {}) {
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/chapter-context-state.php', action, user], {encoding:'utf8', input:JSON.stringify(input)});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
const contextPath = '/api/v1/session/chapter-context';
const membershipPath = chapter => `/api/v1/chapters/${chapter}/memberships`;
async function membershipHead(label) {
  const officer = await enrolledOfficer(label);
  const member = chapterFixture('membership', officer.id, {duties:['CHAPTER_HEAD']});
  const context = await (await officer.browser.request(contextPath)).json();
  const selected = await selectChapter(officer.browser, context.selection_revision, member);
  assert.equal(selected.status, 200);
  return {...officer, member, selected:await selected.json()};
}
const membershipPost = (head, path, body, revision = head.selected.selection_revision) => head.browser.request(path, {
  method:'POST', body, headers:{'X-Chapter-Context':revision,
    'X-XSRF-TOKEN':decodeURIComponent(head.browser.cookies.get('XSRF-TOKEN'))},
});
test('ticket08 core write requires independently eligible existing identity', async () => {
  const head = await membershipHead('p08-core');
  const target = syntheticOfficer('p08-target');
  const body = {idempotency_key:'core-attempt', expected_authority_version:head.selected.context.authority_version,
    identity:{user_id:target.id}, expected_membership_version:null};
  const response = await membershipPost(head, membershipPath(head.member.chapter_id)+'/authorize', body);
  assert.equal(response.status, 422);
});
test('ticket08 core write authorizes an audited candidate with no automatic duties', async () => {
  const head = await membershipHead('p08-authorize');
  const target = await signedInBrowser('p08-authorize-target');
  chapterFixture('membership-candidate', target.id, {chapter_id:head.member.chapter_id, approved_by_user_id:head.id});
  const body = {idempotency_key:'authorize-attempt', expected_authority_version:head.selected.context.authority_version,
    identity:{user_id:target.id}, expected_membership_version:null};
  const response = await membershipPost(head, membershipPath(head.member.chapter_id)+'/authorize', body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.membership.identity.user_id, target.id);
  assert.equal(result.membership.status, 'authorized');
  assert.equal(result.membership.version, 1);
  assert.equal(result.membership.authorized.user_id, head.id);
  const access = await (await target.browser.request(contextPath)).json();
  assert.equal(access.membership.membership_id, result.membership.membership_id);
  assert.deepEqual(access.context.available_actions, []);
});
async function authorizedMember(label) {
  const head = await membershipHead(label);
  const target = await signedInBrowser(label+'-target');
  chapterFixture('membership-candidate', target.id, {chapter_id:head.member.chapter_id, approved_by_user_id:head.id});
  const body = {idempotency_key:'authorize-attempt', expected_authority_version:head.selected.context.authority_version,
    identity:{user_id:target.id}, expected_membership_version:null};
  const path = membershipPath(head.member.chapter_id)+'/authorize';
  const response = await membershipPost(head, path, body);
  assert.equal(response.status, 200);
  return {head, target, body, path, result:await response.json()};
}
test('ticket08 reauthorization retains identity and exact versions while removal preserves other chapters', async () => {
  const {head, target, path, result} = await authorizedMember('p08-retained');
  chapterFixture('grant',target.id,{membership_id:result.membership.membership_id,duty:'COMMITTEE_REQUESTER'});
  const other = chapterFixture('membership', target.id, {duties:[]});
  head.selected = await (await head.browser.request(contextPath)).json();
  let response = await membershipPost(head, membershipPath(head.member.chapter_id)+`/${result.membership.membership_id}/disable`, {
    idempotency_key:'disable-attempt', expected_authority_version:head.selected.context.authority_version, expected_membership_version:1});
  assert.equal(response.status, 200);
  const disabled = await response.json();
  assert.equal(disabled.membership.status, 'disabled');
  assert.equal(disabled.membership.disabled.user_id, head.id);
  assert.equal(disabled.membership.version, 2);
  const remaining = await (await target.browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(remaining.items.map(m=>m.chapter_id), [other.chapter_id]);
  head.selected = await (await head.browser.request(contextPath)).json();
  const body = {idempotency_key:'reauthorize-attempt', expected_authority_version:head.selected.context.authority_version,
    identity:{user_id:target.id}, expected_membership_version:null};
  response = await membershipPost(head, path, body);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'membership_stale');
  body.expected_membership_version = 2;
  response = await membershipPost(head, path, body);
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.equal(restored.membership.membership_id, result.membership.membership_id);
  assert.equal(restored.membership.history_reference, result.membership.history_reference);
  assert.equal(restored.membership.version, 3);
  assert.equal(restored.membership.status, 'authorized');
  const targetCurrent = await (await target.browser.request(contextPath)).json();
  const selectedTarget = await selectChapter(target.browser,targetCurrent.selection_revision,{
    chapter_id:head.member.chapter_id,membership_id:restored.membership.membership_id,expected_membership_version:restored.membership.authority_version});
  assert.equal(selectedTarget.status,200);
  assert.deepEqual((await selectedTarget.json()).context.available_actions,[],'reauthorization must not revive ended duties');
  head.selected = await (await head.browser.request(contextPath)).json();
  response = await membershipPost(head, membershipPath(head.member.chapter_id)+`/${restored.membership.membership_id}/revoke`, {
    idempotency_key:'revoke-attempt', expected_authority_version:head.selected.context.authority_version, expected_membership_version:3});
  assert.equal(response.status, 200);
  const revoked = await response.json();
  assert.equal(revoked.membership.status, 'revoked');
  assert.equal(revoked.membership.revoked.user_id, head.id);
  assert.equal(revoked.membership.version, 4);
});
test('ticket08 replay and both lookup selectors require live original chapter access', async () => {
  const {head, body, path, result} = await authorizedMember('p08-replay');
  let response = await membershipPost(head, path, body);
  assert.equal(response.status, 200, 'identical replay precedes stale authority checks');
  const replayed = structuredClone(result);
  replayed.operation.replayed = true;
  assert.deepEqual(await response.json(), replayed);
  response = await membershipPost(head, path, {...body, expected_membership_version:1});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'idempotency_conflict');
  const root = `/api/v1/chapters/${head.member.chapter_id}/operations`;
  const keyPath = root+'/by-key?action_code=memberships.authorize&idempotency_key='+body.idempotency_key;
  const idPath = root+'/by-id/'+result.operation.identity.operation_id;
  for (const lookup of [keyPath,idPath]) {
    response = await head.browser.request(lookup);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), replayed);
  }
  const missing = await (await head.browser.request(root+'/by-key?action_code=memberships.authorize&idempotency_key=missing')).json();
  assert.equal(missing.action_result, 'uncertain');
  assert.equal(missing.lookup_state, 'pending_or_not_visible');
  assert.equal(missing.operation.outcome, 'unknown');
  const other = chapterFixture('membership',head.id,{duties:['CHAPTER_HEAD']});
  const current = await (await head.browser.request(contextPath)).json();
  assert.equal((await selectChapter(head.browser,current.selection_revision,other)).status,200);
  response = await membershipPost(head,path,body);
  assert.equal(response.status,200,'switching selection never retargets original replay');
  assert.deepEqual(await response.json(),replayed);
  chapterFixture('end-membership', head.id, head.member);
  for (const lookup of [keyPath,idPath]) {
    response = await head.browser.request(lookup);
    assert.equal(response.status, 403);
    const denied = await response.json();
    assert.equal(denied.action_result, 'forbidden');
    assert.equal(denied.operation, null);
    assert.equal(denied.chapter_id, null);
  }
  response = await membershipPost(head, path, body);
  assert.equal(response.status, 403);
  assert.deepEqual(Object.keys(await response.json()).sort(), ['code','message']);
});
test('ticket08 restricted candidate approval is chapter and purpose bound', async () => {
  const commands = spawnSync('docker', ['exec',container,'php','artisan','list','--raw'], {encoding:'utf8'});
  assert.equal(commands.status, 0, commands.stderr);
  assert.match(commands.stdout, /^candidate:authorize-membership\s/m);
  const head = await membershipHead('p08-cli');
  const target = syntheticOfficer('p08-cli-target');
  const document = {purpose:'membership_authorization', chapter_id:head.member.chapter_id,
    user_id:target.id, approved_by_user_id:head.id, approval_reference:'Synthetic independent chapter approval'};
  const approved = await headApprovalCli('candidate:authorize-membership', target.id, target.id, document);
  assert.equal(approved.code, 0, approved.output);
  const body = {idempotency_key:'cli-approved', expected_authority_version:head.selected.context.authority_version,
    identity:{user_id:target.id}, expected_membership_version:null};
  const response = await membershipPost(head, membershipPath(head.member.chapter_id)+'/authorize', body);
  assert.equal(response.status, 200);
  const wrongPurpose = await headApprovalCli('candidate:authorize-membership', target.id, target.id,
    {...document,purpose:'initial_head_appointment'});
  assert.notEqual(wrongPurpose.code, 0);
});
test('ticket08 protected follow-up is suppressed after revocation while committed access survives', async () => {
  const {head, target, result} = await authorizedMember('p08-follow-up');
  const input = {revision:head.selected.selection_revision, scope:{chapter_id:head.member.chapter_id, action:'memberships.authorize'}};
  assert.deepEqual(chapterFixture('follow-up', head.id, input), {status:200, body:{executed:true}, effect_committed:true});
  chapterFixture('end-membership', head.id, head.member);
  const denied = chapterFixture('follow-up', head.id, input);
  assert.equal(denied.status, 403);
  assert.equal(denied.effect_committed, false);
  const targetContext = await (await target.browser.request(contextPath)).json();
  assert.equal(targetContext.membership.membership_id, result.membership.membership_id);
});
test('ticket08 new writes distinguish stale context authority and resource guards', async () => {
  const {head, body, path, result} = await authorizedMember('p08-guards');
  let response = await membershipPost(head, path, {...body,idempotency_key:'new-stale-authority'});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'authority_stale');
  head.selected = await (await head.browser.request(contextPath)).json();
  const current = {...body,idempotency_key:'new-stale-context',expected_authority_version:head.selected.context.authority_version};
  response = await membershipPost(head, path, current, 'ctx_'+'x'.repeat(64));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'chapter_context_stale');
  response = await membershipPost(head, path, current);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'membership_stale');
  for (const edit of [{...current,actor_user_id:head.id},{...current,identity:{user_id:body.identity.user_id,email:'forbidden'}},
    {...current,expected_membership_version:undefined}]) {
    assert.equal((await membershipPost(head,path,edit)).status, 422);
  }
  const root = `/api/v1/chapters/${head.member.chapter_id}/operations`;
  for (const suffix of ['&action_code=memberships.revoke','&%61ction_code=memberships.authorize','&idempotency_key=other','&record_id=1']) {
    assert.equal((await head.browser.request(root+'/by-key?action_code=memberships.authorize&idempotency_key='+body.idempotency_key+suffix)).status, 400);
  }
  assert.equal((await head.browser.request(root+'/by-id/'+result.operation.identity.operation_id+'?action_code=memberships.authorize')).status, 400);
});
test('ticket08 lookup preserves original forbidden envelopes for boundary and authentication failures', async () => {
  const {head,result} = await authorizedMember('p08-boundary');
  const path = `/api/v1/chapters/${head.member.chapter_id}/operations/by-id/${result.operation.identity.operation_id}`;
  const response = await head.browser.request(path,{headers:{Origin:'https://untrusted.example'}});
  assert.equal(response.status,403);
  assert.equal((await response.json()).action_result,'forbidden');
  const signedOut = await new Browser().request(path);
  assert.equal(signedOut.status,401);
  assert.equal((await signedOut.json()).operation,null);
});
test('ticket08 Chapter Head can revoke own membership without erasing the committed outcome', async () => {
  const head = await membershipHead('p08-self');
  const response = await membershipPost(head,membershipPath(head.member.chapter_id)+`/${head.member.membership_id}/revoke`,{
    idempotency_key:'self-revoke',expected_authority_version:head.selected.context.authority_version,expected_membership_version:1});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.membership.status,'revoked');
  assert.equal(result.operation.outcome,'committed');
  const lookup = await head.browser.request(`/api/v1/chapters/${head.member.chapter_id}/operations/by-id/${result.operation.identity.operation_id}`);
  assert.equal(lookup.status,403);
  assert.equal((await lookup.json()).operation,null);
});
for (const counter of ['resource','authority']) {
  test(`ticket08 ${counter} version overflow retains a durable rejection and immutable history`, async () => {
    const {head,target,result} = await authorizedMember('p08-overflow-'+counter);
    const version = counter === 'resource' ? 4294967295 : 1;
    chapterFixture('membership-versions',target.id,{membership_id:result.membership.membership_id,
      row_version:version,authority_version:counter === 'authority' ? 2147483647 : 1});
    head.selected = await (await head.browser.request(contextPath)).json();
    const body = {idempotency_key:'overflow',expected_authority_version:head.selected.context.authority_version,expected_membership_version:version};
    const path = membershipPath(head.member.chapter_id)+`/${result.membership.membership_id}/disable`;
    const response = await membershipPost(head,path,body);
    assert.equal(response.status,409);
    const rejected = await response.json();
    assert.equal(rejected.operation.outcome,'rejected');
    const replay = await membershipPost(head,path,body);
    assert.equal(replay.status,409);
    assert.deepEqual(await replay.json(),{...rejected,operation:{...rejected.operation,replayed:true}});
    const lookup = await head.browser.request(`/api/v1/chapters/${head.member.chapter_id}/operations/by-id/${rejected.operation.identity.operation_id}`);
    assert.equal(lookup.status,200);
    assert.deepEqual(await lookup.json(),{...rejected,operation:{...rejected.operation,replayed:true}});
    assert.deepEqual(chapterFixture('chapter-history-security',head.id),{UPDATE_denied:true,DELETE_denied:true});
    assert.equal((await (await target.browser.request(contextPath)).json()).membership.membership_id,result.membership.membership_id);
  });
}
test('ticket08 intended MySQL retains membership identity and immutable outcomes even for privileged writers', async () => {
  const {head,target,result} = await authorizedMember('p08-integrity');
  const other = syntheticOfficer('p08-integrity-other');
  for (const sql of [
    `UPDATE memberships SET user_id=${other.id} WHERE id=${result.membership.membership_id}`,
    `DELETE FROM memberships WHERE id=${result.membership.membership_id}`,
    `UPDATE chapter_operations SET result_snapshot=JSON_OBJECT() WHERE public_id='${result.operation.identity.operation_id}'`,
    `DELETE FROM chapter_operations WHERE public_id='${result.operation.identity.operation_id}'`,
  ]) {
    const mutation = spawnSync('docker',['exec','-i',process.env.YSP_TEST_MYSQL_CONTAINER,'sh','-c',
      'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot ysp_local'],{encoding:'utf8',input:sql});
    assert.notEqual(mutation.status,0,'privileged SQL must not rewrite stable identity or history');
    assert.match(mutation.stderr,/1644/,'database trigger must enforce retention');
  }
  const lookup = await head.browser.request(`/api/v1/chapters/${head.member.chapter_id}/operations/by-id/${result.operation.identity.operation_id}`);
  assert.deepEqual(await lookup.json(),{...result,operation:{...result.operation,replayed:true}});
  assert.equal((await (await target.browser.request(contextPath)).json()).membership.membership_id,result.membership.membership_id);
});
for (const changed of [false,true]) {
  test(`ticket08 overlapping ${changed ? 'changed' : 'identical'} key attempts retain one original result`, async t => {
    const head = await membershipHead('p08-race-'+changed);
    const target = syntheticOfficer('p08-race-target');
    chapterFixture('membership-candidate',target.id,{chapter_id:head.member.chapter_id,approved_by_user_id:head.id});
    const body = {idempotency_key:'overlapping-key',expected_authority_version:head.selected.context.authority_version,
      identity:{user_id:target.id},expected_membership_version:null};
    const contender = {...head,browser:new Browser()};
    contender.browser.cookies = new Map(head.browser.cookies);
    contender.browser.worker = 'contender';
    const holder = spawn('docker',['exec','-i','-e','YSP_SESSION_FIXTURES=1',container,
      'php','tests/fixtures/enrollment-state.php','hold',head.id]);
    t.after(()=>holder.stdin.end('\n'));
    await new Promise((resolve,reject)=>{
      holder.once('error',reject);
      holder.stdout.on('data',data=>{if(data.toString().includes('held'))resolve();});
      holder.once('exit',()=>reject(new Error('Lock holder exited')));
    });
    const path = membershipPath(head.member.chapter_id)+'/authorize';
    const requests = [membershipPost(head,path,body)];
    let waiting = 0;
    let secondStarted = false;
    try {
      for(let i=0;i<40;i++) {
        const probe = spawnSync('docker',['exec',process.env.YSP_TEST_MYSQL_CONTAINER,'sh','-c',
          'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'],{encoding:'utf8'});
        assert.equal(probe.status,0,probe.stderr);
        waiting = Number(probe.stdout.trim());
        if(waiting>=1 && !secondStarted) {
          requests.push(membershipPost(contender,path,changed ? {...body,expected_membership_version:1} : body));
          secondStarted=true;
        }
        if(waiting>=2)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    } finally { holder.stdin.end('\n'); }
    const responses = await Promise.all(requests);
    assert.ok(waiting>=2,`Expected overlapping MySQL transactions, observed ${waiting} waiters`);
    assert.deepEqual(responses.map(r=>r.status),[200,changed ? 409 : 200]);
    const first = await responses[0].json();
    const second = await responses[1].json();
    if(changed) assert.equal(second.code,'idempotency_conflict');
    else assert.deepEqual(second,{...first,operation:{...first.operation,replayed:true}});
    const recovered = await head.browser.request(`/api/v1/chapters/${head.member.chapter_id}/operations/by-key?action_code=memberships.authorize&idempotency_key=overlapping-key`);
    assert.deepEqual(await recovered.json(),{...first,operation:{...first.operation,replayed:true}});
  });
}
const selectionPath = '/api/v1/session/chapter-selection';
const selectChapter = (browser, revision, target) => browser.request(selectionPath, {
  method:'POST', body:target, headers:{'X-Chapter-Context':revision,
    'X-XSRF-TOKEN':decodeURIComponent(browser.cookies.get('XSRF-TOKEN'))},
});

test('ticket07 invalidated selection first returns safe stale then recomputes without relabeling a rejected attempt', async () => {
  const {browser, id} = await signedInBrowser('p07-invalidate');
  const first = chapterFixture('membership', id);
  const selected = await (await browser.request(contextPath)).json();
  assert.equal(selected.chapter_state, 'selected');
  const second = chapterFixture('membership', id);
  chapterFixture('end-membership', id, first);
  assert.equal((await selectChapter(browser, selected.selection_revision, second)).status, 409,
    'An invalidated selected membership cannot authorize switching under its old revision');
  const stale = await browser.request(contextPath);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).selection_revision, undefined);
  const next = await (await browser.request(contextPath)).json();
  assert.equal(next.selection_source, 'sole_membership');
  assert.equal(next.context.chapter_id, second.chapter_id);
  assert.notEqual(next.selection_revision, selected.selection_revision);
  assert.equal((await selectChapter(browser, selected.selection_revision, first)).status, 409);
  assert.equal((await selectChapter(browser, next.selection_revision, first)).status, 403);
  assert.equal((await (await browser.request(contextPath)).json()).selection_revision, next.selection_revision);
  chapterFixture('end-membership', id, second);
  assert.equal((await browser.request(contextPath)).status, 409);
  assert.equal((await (await browser.request(contextPath)).json()).chapter_state, 'no_authorized_memberships');
});

test('ticket07 membership pages are bounded ordered opaque and reject duplicate or foreign selectors', async () => {
  const {browser, id} = await signedInBrowser('p07-pages');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);
  const path = '/api/v1/session/chapter-memberships';
  const one = await (await browser.request(path + '?limit=1')).json();
  assert.equal(one.limit, 1);
  assert.deepEqual(one.items.map(x => x.chapter_id), [first.chapter_id]);
  assert.match(one.next_cursor, /^cur_[A-Za-z0-9_-]{32,96}$/);
  const two = await (await browser.request(path + '?limit=1&cursor=' + one.next_cursor)).json();
  assert.deepEqual(two.items.map(x => x.chapter_id), [second.chapter_id]);
  assert.equal(two.next_cursor, null);
  const other = await signedInBrowser('p07-foreign');
  assert.equal((await other.browser.request(path + '?limit=1&cursor=' + one.next_cursor)).status, 400);
  for (const query of ['limit=0','limit=101','limit=1&%6cimit=2','limit[]=1','user_id=' + id,
    'cursor=','limit=2&cursor=' + one.next_cursor,'limit=1&cursor=cur_' + 'x'.repeat(32)]) {
    assert.equal((await browser.request(path + '?' + query)).status, 400, query);
  }
  for (const query of ['chapter_id=1&chapter_id=2','chapter_id[]=1','chapter_id=18446744073709551616','chapter_id=01','approved=true']) {
    assert.equal((await browser.request(contextPath + '?' + query)).status, 400, query);
  }
});

test('ticket07 protected execution binds original tuple revision action and exact monetary authority', async () => {
  const {browser, id} = await signedInBrowser('p07-guard');
  const member = chapterFixture('membership', id);
  const selected = await (await browser.request(contextPath)).json();
  const scope = {chapter_id:member.chapter_id, membership_id:member.membership_id,
    expected_authority_version:selected.context.authority_version, action:'policy.status.read'};
  const invoke = overrides => chapterFixture('execute', id, {revision:selected.selection_revision, scope:{...scope,...overrides}});
  assert.deepEqual(invoke({}), {status:200, body:{executed:true}, effect_committed:true});
  for (const changes of [{action:'memberships.authorize'}, {action:'provider.chapters.create'},
    {amount:'0.00'}, {requesting_unit_id:'18446744073709551615'}]) {
    const denied = invoke(changes);
    assert.equal(denied.status, 403, JSON.stringify(changes));
    assert.equal(denied.effect_committed, false);
  }
  for (const changes of [{chapter_id:'18446744073709551615'}, {membership_id:'18446744073709551615'}, {expected_authority_version:99}]) {
    const stale = invoke(changes);
    assert.equal(stale.status, 409);
    assert.equal(stale.effect_committed, false);
  }
  assert.equal(chapterFixture('execute', id, {revision:'ctx_' + 'x'.repeat(64), scope}).status, 409);
  assert.equal((await (await browser.request(contextPath)).json()).selection_revision, selected.selection_revision);
});

test('ticket07 provider-only access stays empty and separately authorized fourteen duties expose only chapter actions', async () => {
  const provider = await verifiedProvisioner('p07-provider');
  const empty = await (await provider.browser.request(contextPath)).json();
  assert.equal(empty.chapter_state, 'no_authorized_memberships');
  assert.equal(empty.context, undefined);
  const duties = ['COMMITTEE_REQUESTER','RF_APPROVER','SALES_OFFICER','SALES_REVIEWER','FINANCE','INVENTORY',
    'PURCHASING','BUDGET_APPROVER','RECEIVING','DISPATCH','BOOTH_CUSTODIAN','BOOTH_CASHIER','INDEPENDENT_REVIEWER','CHAPTER_HEAD'];
  const member = chapterFixture('membership', provider.id, {duties});
  const current = await (await provider.browser.request(contextPath)).json();
  assert.deepEqual(current.context.duty_grants.map(g => g.duty_code), duties);
  assert.deepEqual(current.context.provider_roles, ['provisioner']);
  assert.ok(current.context.available_actions.includes('policy.financial.approve'));
  assert.ok(!current.context.available_actions.some(a => a.startsWith('provider.') || a === 'identity.disable'));
  const scope = {chapter_id:member.chapter_id, membership_id:member.membership_id,
    expected_authority_version:current.context.authority_version, action:'provider.chapters.create'};
  assert.equal(chapterFixture('execute', provider.id, {revision:current.selection_revision, scope}).status, 403);
  assert.equal((await provider.browser.request('/api/v1/provider/provisioning-context', {
    headers:{'X-Chapter-Context':current.selection_revision},
  })).status, 403);
});

test('ticket07 effective grants enforce half-open intervals active unit ownership and exact null zero finite caps', async () => {
  const {browser, id} = await signedInBrowser('p07-terms');
  const member = chapterFixture('membership', id, {duties:[]});
  chapterFixture('grant', id, {...member, starts_at:'2037-01-01 00:00:00.000000'});
  chapterFixture('grant', id, {...member, starts_at:'2020-01-01 00:00:00.000000', ends_at:'2020-01-02 00:00:00.000000'});
  chapterFixture('grant', id, {...member, revoked_at:'2020-01-01 00:00:00.000000'});
  chapterFixture('grant', id, {...member, unit:true, active:false});
  const zero = chapterFixture('grant', id, {...member, unit:true, limit:'0.00'});
  const finite = chapterFixture('grant', id, {...member, unit:true, limit:'99999999999999999.98'});
  const current = await (await browser.request(contextPath)).json();
  assert.deepEqual(current.context.duty_grants.map(g => g.id), [zero.grant_id, finite.grant_id]);
  assert.deepEqual(current.context.available_actions, []);
  const invoke = changes => chapterFixture('execute', id, {revision:current.selection_revision, scope:{
    chapter_id:member.chapter_id, membership_id:member.membership_id, expected_authority_version:1,
    action:'policy.status.read', ...changes,
  }});
  assert.equal(invoke({}).status, 403);
  assert.equal(invoke({requesting_unit_id:zero.requesting_unit_id, amount:'0.00'}).status, 200);
  assert.equal(invoke({requesting_unit_id:zero.requesting_unit_id, amount:'0.01'}).status, 403);
  assert.equal(invoke({requesting_unit_id:finite.requesting_unit_id, amount:'99999999999999999.98'}).status, 200);
  assert.equal(invoke({requesting_unit_id:finite.requesting_unit_id, amount:'99999999999999999.99'}).status, 403);
  const other = chapterFixture('membership', id);
  const foreign = chapterFixture('grant', id, {...other, unit:true, limit:'9.00'});
  assert.equal(invoke({requesting_unit_id:foreign.requesting_unit_id}).status, 403);
});

test('ticket07 protected commitment rechecks real time expiry and rolls back the attempted effect', async () => {
  const {browser, id} = await signedInBrowser('p07-commit-expiry');
  const member = chapterFixture('membership', id, {duties:[]});
  const grant = chapterFixture('grant', id, {...member, ttl_ms:2000});
  const current = await (await browser.request(contextPath)).json();
  assert.deepEqual(current.context.duty_grants.map(g => g.id), [grant.grant_id]);
  const scope = {chapter_id:member.chapter_id, membership_id:member.membership_id,
    expected_authority_version:1, action:'policy.status.read'};
  const result = chapterFixture('execute', id, {revision:current.selection_revision, scope, wait_until:grant.ends_at});
  assert.equal(result.status, 403);
  assert.equal(result.effect_committed, false);
  const after = await (await browser.request(contextPath)).json();
  assert.equal(after.selection_revision, current.selection_revision);
  assert.deepEqual(after.context.duty_grants, []);
  assert.deepEqual(after.context.available_actions, []);
});

test('ticket07 live account and identity-wide MFA gate cannot be overridden by browser flags', async () => {
  const {browser, id} = await signedInBrowser('p07-live');
  const member = chapterFixture('membership', id);
  const current = await (await browser.request(contextPath)).json();
  for (const flags of [{approved:true}, {mfa_satisfied:true}, {actor_id:id}, {roles:['CHAPTER_HEAD']}, {available_actions:['memberships.authorize']}]) {
    assert.equal((await selectChapter(browser, current.selection_revision, {...member,...flags})).status, 422);
  }
  const scope = {chapter_id:member.chapter_id, membership_id:member.membership_id, expected_authority_version:1, action:'policy.status.read'};
  for (const revision of ['', 'ctx_bad']) {
    const malformed = chapterFixture('execute', id, {revision, scope});
    assert.equal(malformed.status, 400);
    assert.equal(malformed.effect_committed, false);
  }
  chapterFixture('membership', id, {duties:['FINANCE']});
  for (const path of [contextPath, '/api/v1/session/chapter-memberships']) {
    const restricted = await browser.request(path, {headers:{'X-MFA-Satisfied':'true','X-Role':'CHAPTER_HEAD'}});
    assert.equal(restricted.status, 403);
    assert.deepEqual(await restricted.json(), {code:'forbidden',message:'This request is not permitted.'});
  }
  assert.equal((await selectChapter(browser, current.selection_revision, member)).status, 403);
  assert.equal(chapterFixture('execute', id, {revision:current.selection_revision, scope}).status, 403);
  arrangeState('disable', id);
  assert.equal((await browser.request(contextPath)).status, 401);
  assert.equal((await browser.request('/api/v1/session/chapter-memberships')).status, 401);
  assert.equal((await selectChapter(browser, current.selection_revision, member)).status, 401);
});

test('ticket07 concurrent tabs overlap real MySQL transactions and accept only one selection revision', async t => {
  const {browser, id} = await signedInBrowser('p07-race');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);
  const initial = await (await browser.request(contextPath)).json();
  const contender = new Browser();
  contender.cookies = new Map(browser.cookies);
  contender.worker = 'contender';
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/enrollment-state.php', 'hold', id]);
  t.after(() => holder.stdin.end('\n'));
  await Promise.race([new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holder.once('exit', () => reject(new Error('Chapter context lock holder exited')));
  }), new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 5000))]);
  const pending = Promise.all([selectChapter(browser, initial.selection_revision, first),
    selectChapter(contender, initial.selection_revision, second)]);
  let waiting = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding:'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waiting = Number(probe.stdout.trim());
      if (waiting >= 2) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 50)));
    }
  } finally { holder.stdin.end('\n'); }
  const responses = await pending;
  assert.ok(waiting >= 2, `Both independent HTTP transactions must overlap; waiters=${waiting}`);
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  const accepted = await responses.find(r => r.status === 200).json();
  const denied = await responses.find(r => r.status === 409).json();
  assert.deepEqual(Object.keys(denied).sort(), ['code','message','next_action']);
  const restored = await (await browser.request(contextPath)).json();
  assert.equal(restored.selection_revision, accepted.selection_revision);
  assert.equal(restored.context.chapter_id, accepted.context.chapter_id);
});

test('ticket07 chapter IDs above JavaScript safe integer stay exact and pages use numeric ordering', async () => {
  const {browser, id} = await signedInBrowser('p07-exact');
  // Distinct numeric order differs from lexical order, both exceed Number safety.
  const suffix = Date.now().toString();
  const highId = '1000' + suffix;
  const lowId = '910' + suffix;
  chapterFixture('membership', id, {chapter_id:highId});
  const low = chapterFixture('membership', id, {chapter_id:lowId});
  const initial = await (await browser.request(contextPath)).json();
  const page = await (await browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(page.items.map(m => m.chapter_id), [lowId,highId]);
  const response = await selectChapter(browser, initial.selection_revision, low);
  assert.equal(response.status, 200);
  const selected = await response.json();
  assert.equal(selected.context.chapter_id, lowId);
  assert.match(selected.context.checked_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  assert.equal(typeof selected.context.duty_grants[0].id, 'string');
});

test('ticket07 multi membership explicit selection rejects stale tabs and preserves the attempted scope', async () => {
  const {browser, id} = await signedInBrowser('p07-multi');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);
  const initial = await (await browser.request(contextPath)).json();
  assert.equal(initial.chapter_state, 'selection_required');
  const tab = new Browser();
  tab.cookies = new Map(browser.cookies);
  const selected = await selectChapter(browser, initial.selection_revision, second);
  assert.equal(selected.status, 200);
  const current = await selected.json();
  assert.equal(current.selection_source, 'explicit');
  assert.equal(current.context.chapter_id, second.chapter_id);
  assert.notEqual(current.selection_revision, initial.selection_revision);
  const stale = await selectChapter(tab, initial.selection_revision, first);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), {code:'chapter_context_stale',
    message:'Refresh current context and review the original scope before another attempt.', next_action:'refresh_context'});
  assert.equal(first.chapter_id === second.chapter_id, false);
  const restored = await (await tab.request(contextPath)).json();
  assert.equal(restored.selection_source, 'restored');
  assert.equal(restored.context.chapter_id, second.chapter_id);
  assert.equal(restored.selection_revision, current.selection_revision);
  assert.equal((await browser.request(contextPath + '?chapter_id=' + first.chapter_id)).status, 409);
  assert.equal((await (await browser.request(contextPath)).json()).selection_revision, current.selection_revision);
  const repeated = await selectChapter(browser, current.selection_revision, second);
  assert.equal(repeated.status, 200);
  assert.notEqual((await repeated.json()).selection_revision, current.selection_revision);
});

test('ticket07 asserted sole scope selects only its exact membership and rejects an unrelated assertion without selecting', async () => {
  const {browser, id} = await signedInBrowser('p07-asserted-sole');
  const member = chapterFixture('membership', id);
  assert.equal((await browser.request(contextPath + '?chapter_id=18446744073709551615')).status, 409);
  const response = await browser.request(contextPath + '?chapter_id=' + member.chapter_id);
  assert.equal(response.status, 200);
  const selected = await response.json();
  assert.equal(selected.selection_source, 'sole_membership');
  assert.equal(selected.context.chapter_id, member.chapter_id);
});

test('ticket07 test-only database fixtures exercise remaining authorized duty interval and unit-limit combinations across fixed 14-duty vocabulary', async () => {
  const {browser, id} = await enrolledOfficer('p07-matrix');
  const member = chapterFixture('membership', id, {duties:[]});
  const setup = chapterFixture('duties-matrix', id, {membership_id:member.membership_id});
  assert.ok(setup.active_unit_id);
  assert.ok(setup.inactive_unit_id);
  const vocabulary = [
    'COMMITTEE_REQUESTER','RF_APPROVER','SALES_OFFICER','SALES_REVIEWER','FINANCE',
    'INVENTORY','PURCHASING','BUDGET_APPROVER','RECEIVING','DISPATCH','BOOTH_CUSTODIAN',
    'BOOTH_CASHIER','INDEPENDENT_REVIEWER','CHAPTER_HEAD',
  ];
  assert.deepEqual(Object.keys(setup.matrix).sort(), [...vocabulary].sort());

  const initial = await (await browser.request(contextPath)).json();
  assert.equal(initial.chapter_state, 'selection_required');
  const selected = await selectChapter(browser, initial.selection_revision, member);
  assert.equal(selected.status, 200);
  const current = await selected.json();
  assert.equal(current.chapter_state, 'selected');
  assert.equal(current.selection_source, 'explicit');

  const grantIds = new Set(current.context.duty_grants.map(g => g.id));
  for (const duty of vocabulary) {
    const row = setup.matrix[duty];
    assert.ok(grantIds.has(row.chapter_active), `Active chapter grant for ${duty} should be included`);
    assert.ok(grantIds.has(row.unit_finite), `Active finite unit grant for ${duty} should be included`);
    assert.ok(grantIds.has(row.unit_zero), `Active zero unit grant for ${duty} should be included`);
    assert.ok(!grantIds.has(row.future), `Future grant for ${duty} must be excluded`);
    assert.ok(!grantIds.has(row.expired), `Expired grant for ${duty} must be excluded`);
    assert.ok(!grantIds.has(row.revoked), `Revoked grant for ${duty} must be excluded`);
    assert.ok(!grantIds.has(row.inactive_unit), `Inactive unit grant for ${duty} must be excluded`);
  }

  // Chapter-level actions include Head, Finance, and universal status reads, but exclude provider/disabled actions.
  assert.ok(current.context.available_actions.includes('policy.status.read'));
  assert.ok(current.context.available_actions.includes('policy.financial.approve'));
  assert.ok(current.context.available_actions.includes('memberships.authorize'));
  assert.ok(!current.context.available_actions.some(a => a.startsWith('provider.') || a === 'identity.disable'));

  const baseScope = {
    chapter_id: member.chapter_id,
    membership_id: member.membership_id,
    expected_authority_version: current.context.authority_version,
  };

  // Chapter-scoped grant has null limit: permits non-monetary action, but rejects monetary amounts (null = no monetary cap).
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, action: 'policy.status.read'},
  }).status, 200);
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, action: 'policy.status.read', amount: '1.00'},
  }).status, 403);

  // Unit-scoped grant with finite limit (1500.00):
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, requesting_unit_id: setup.active_unit_id, action: 'policy.financial.approve', amount: '1500.00'},
  }).status, 200);
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, requesting_unit_id: setup.active_unit_id, action: 'policy.financial.approve', amount: '1500.01'},
  }).status, 403);

  // Unit-scoped grant with zero limit (0.00):
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, requesting_unit_id: setup.active_unit_id, action: 'policy.status.read', amount: '0.00'},
  }).status, 200);

  // Unit-scoped grant on inactive unit is rejected:
  assert.equal(chapterFixture('execute', id, {
    revision: current.selection_revision,
    scope: {...baseScope, requesting_unit_id: setup.inactive_unit_id, action: 'policy.status.read'},
  }).status, 403);
});

test('ticket07 0 1 many membership discovery and restoration tracks dynamic changes and retains selection across context reads', async () => {
  const {browser, id} = await signedInBrowser('p07-discovery');

  // Step 1: 0 memberships discovery and state
  const zeroCtx = await (await browser.request(contextPath)).json();
  assert.equal(zeroCtx.chapter_state, 'no_authorized_memberships');
  assert.equal(zeroCtx.selection_source, undefined);
  assert.match(zeroCtx.selection_revision, /^ctx_[A-Za-z0-9_-]{32,96}$/);

  const zeroMemberships = await (await browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(zeroMemberships.items, []);
  assert.equal(zeroMemberships.next_cursor, null);

  const randomChapter = {chapter_id: '999999999999999999', membership_id: '1', expected_membership_version: 1};
  assert.equal((await selectChapter(browser, zeroCtx.selection_revision, randomChapter)).status, 403);

  // Step 2: 1 membership added -> discovery and sole auto-selection
  const first = chapterFixture('membership', id);
  const oneMemberships = await (await browser.request('/api/v1/session/chapter-memberships')).json();
  assert.equal(oneMemberships.items.length, 1);
  assert.equal(oneMemberships.items[0].chapter_id, first.chapter_id);
  assert.equal(oneMemberships.items[0].membership_id, first.membership_id);

  const soleCtx = await (await browser.request(contextPath)).json();
  assert.equal(soleCtx.chapter_state, 'selected');
  assert.equal(soleCtx.selection_source, 'sole_membership');
  assert.equal(soleCtx.context.chapter_id, first.chapter_id);
  assert.notEqual(soleCtx.selection_revision, zeroCtx.selection_revision);

  const restoredSole = await (await browser.request(contextPath)).json();
  assert.equal(restoredSole.chapter_state, 'selected');
  assert.equal(restoredSole.selection_source, 'restored');
  assert.equal(restoredSole.context.chapter_id, first.chapter_id);
  assert.equal(restoredSole.selection_revision, soleCtx.selection_revision);

  // Step 3: Expand to many memberships -> discovery, preserved restoration, explicit switch
  const second = chapterFixture('membership', id);
  const third = chapterFixture('membership', id);

  const manyMemberships = await (await browser.request('/api/v1/session/chapter-memberships')).json();
  assert.equal(manyMemberships.items.length, 3);
  const discoveredChapterIds = manyMemberships.items.map(m => m.chapter_id);
  assert.ok(discoveredChapterIds.includes(first.chapter_id));
  assert.ok(discoveredChapterIds.includes(second.chapter_id));
  assert.ok(discoveredChapterIds.includes(third.chapter_id));

  // Context read preserves the established valid selection rather than forcing re-selection
  const restoredMany = await (await browser.request(contextPath)).json();
  assert.equal(restoredMany.chapter_state, 'selected');
  assert.equal(restoredMany.selection_source, 'restored');
  assert.equal(restoredMany.context.chapter_id, first.chapter_id);
  assert.equal(restoredMany.selection_revision, soleCtx.selection_revision);

  // Step 4: Explicit switch to second chapter
  const switched = await selectChapter(browser, restoredMany.selection_revision, second);
  assert.equal(switched.status, 200);
  const switchedCtx = await switched.json();
  assert.equal(switchedCtx.chapter_state, 'selected');
  assert.equal(switchedCtx.selection_source, 'explicit');
  assert.equal(switchedCtx.context.chapter_id, second.chapter_id);
  assert.notEqual(switchedCtx.selection_revision, restoredMany.selection_revision);

  const restoredSecond = await (await browser.request(contextPath)).json();
  assert.equal(restoredSecond.chapter_state, 'selected');
  assert.equal(restoredSecond.selection_source, 'restored');
  assert.equal(restoredSecond.context.chapter_id, second.chapter_id);
  assert.equal(restoredSecond.selection_revision, switchedCtx.selection_revision);

  // Step 5: Assertion query parameters (?chapter_id=...)
  assert.equal((await browser.request(contextPath + '?chapter_id=' + second.chapter_id)).status, 200);
  assert.equal((await browser.request(contextPath + '?chapter_id=' + first.chapter_id)).status, 409);
  assert.equal((await browser.request(contextPath + '?chapter_id=' + randomChapter.chapter_id)).status, 409);

  // Selection remains Chapter 2 after rejected assertions
  const afterRejections = await (await browser.request(contextPath)).json();
  assert.equal(afterRejections.selection_revision, switchedCtx.selection_revision);
  assert.equal(afterRejections.context.chapter_id, second.chapter_id);
});

test('ticket07 cross-tab stale X-Chapter-Context rejection isolates independent tabs and preserves original attempt', async () => {
  const {browser, id} = await signedInBrowser('p07-tabs');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);

  const tab1 = browser;
  const tab2 = new Browser();
  tab2.cookies = new Map(tab1.cookies);

  // Both tabs share the session and observe initial selection_required with revA
  const init = await (await tab1.request(contextPath)).json();
  assert.equal(init.chapter_state, 'selection_required');
  const revA = init.selection_revision;
  assert.match(revA, /^ctx_[A-Za-z0-9_-]{32,96}$/);

  // Tab 1 explicitly selects Chapter 1, rotating server revision to revB
  const sel1 = await selectChapter(tab1, revA, first);
  assert.equal(sel1.status, 200);
  const sel1Body = await sel1.json();
  const revB = sel1Body.selection_revision;
  assert.notEqual(revB, revA);
  assert.equal(sel1Body.context.chapter_id, first.chapter_id);

  // Tab 2 still holds stale revA and attempts to select Chapter 2
  const staleSelect = await selectChapter(tab2, revA, second);
  assert.equal(staleSelect.status, 409);
  const staleSelectBody = await staleSelect.json();
  assert.deepEqual(staleSelectBody, {
    code: 'chapter_context_stale',
    message: 'Refresh current context and review the original scope before another attempt.',
    next_action: 'refresh_context',
  });

  // Tab 2 attempts protected execution using stale revA
  const staleExec = chapterFixture('execute', id, {
    revision: revA,
    scope: {
      chapter_id: second.chapter_id,
      membership_id: second.membership_id,
      expected_authority_version: 1,
      action: 'policy.status.read',
    },
  });
  assert.equal(staleExec.status, 409);
  assert.equal(staleExec.effect_committed, false);

  // Malformed X-Chapter-Context header values return 400
  for (const badHeader of ['', 'invalid-format', 'ctx_short', 'ctx_' + '!'.repeat(32)]) {
    const malformed = await selectChapter(tab2, badHeader, second);
    assert.equal(malformed.status, 400);
  }

  // Server selection is still Chapter 1 under revB
  const checkServer = await (await tab1.request(contextPath)).json();
  assert.equal(checkServer.context.chapter_id, first.chapter_id);
  assert.equal(checkServer.selection_revision, revB);

  // Tab 2 refreshes context, discovers restored Chapter 1 with revB
  const tab2Refresh = await (await tab2.request(contextPath)).json();
  assert.equal(tab2Refresh.selection_source, 'restored');
  assert.equal(tab2Refresh.context.chapter_id, first.chapter_id);
  assert.equal(tab2Refresh.selection_revision, revB);

  // Tab 2 now switches to Chapter 2 using valid revB, advancing server revision to revC
  const sel2 = await selectChapter(tab2, revB, second);
  assert.equal(sel2.status, 200);
  const revC = (await sel2.json()).selection_revision;
  assert.notEqual(revC, revB);

  // Now Tab 1 holding revB is stale
  const tab1Stale = await selectChapter(tab1, revB, first);
  assert.equal(tab1Stale.status, 409);

  // Tab 1 refreshes and discovers Chapter 2 with revC
  const tab1Refresh = await (await tab1.request(contextPath)).json();
  assert.equal(tab1Refresh.selection_source, 'restored');
  assert.equal(tab1Refresh.context.chapter_id, second.chapter_id);
  assert.equal(tab1Refresh.selection_revision, revC);
});

test('ticket07 invalidated selection when membership or grant intervals expire or revoke mid-session enforces safe stale transitions and immediate authority downgrade', async () => {
  const {browser, id} = await enrolledOfficer('p07-mid-session');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);

  // Initial selection_required (user has arrangeState head from enrolledOfficer + first + second)
  const init = await (await browser.request(contextPath)).json();
  assert.equal(init.chapter_state, 'selection_required');

  // Select first chapter
  const sel1 = await selectChapter(browser, init.selection_revision, first);
  assert.equal(sel1.status, 200);
  const rev1 = (await sel1.json()).selection_revision;

  // 1. Invalidate first membership mid-session
  chapterFixture('end-membership', id, first);

  // Attempting to switch using rev1 under invalidated selected membership returns 409
  const invalidSwitch = await selectChapter(browser, rev1, second);
  assert.equal(invalidSwitch.status, 409);

  // Protected execution under invalidated membership returns 409
  const invalidExec = chapterFixture('execute', id, {
    revision: rev1,
    scope: {
      chapter_id: first.chapter_id,
      membership_id: first.membership_id,
      expected_authority_version: 1,
      action: 'policy.status.read',
    },
  });
  assert.equal(invalidExec.status, 409);
  assert.equal(invalidExec.effect_committed, false);

  // Context read first returns safe 409, clearing invalid selection
  const staleCtx = await browser.request(contextPath);
  assert.equal(staleCtx.status, 409);
  assert.equal((await staleCtx.json()).code, 'chapter_context_stale');

  // Next context read recomputes and discovers selection_required with new revision
  const recomputed = await (await browser.request(contextPath)).json();
  assert.equal(recomputed.chapter_state, 'selection_required');
  const rev2 = recomputed.selection_revision;
  assert.notEqual(rev2, rev1);

  // 2. Select second chapter and add grants
  const sel2 = await selectChapter(browser, rev2, second);
  assert.equal(sel2.status, 200);
  const rev3 = (await sel2.json()).selection_revision;

  const gFinance = chapterFixture('grant', id, {
    membership_id: second.membership_id,
    duty: 'FINANCE',
  });
  const gUnit = chapterFixture('grant', id, {
    membership_id: second.membership_id,
    duty: 'COMMITTEE_REQUESTER',
    unit: true,
    limit: '500.00',
  });

  const activeCtx = await (await browser.request(contextPath)).json();
  assert.ok(activeCtx.context.available_actions.includes('policy.financial.approve'));
  assert.ok(activeCtx.context.duty_grants.some(g => g.id === gFinance.grant_id));
  assert.ok(activeCtx.context.duty_grants.some(g => g.id === gUnit.grant_id));

  const baseSecondScope = {
    chapter_id: second.chapter_id,
    membership_id: second.membership_id,
    expected_authority_version: activeCtx.context.authority_version,
  };

  // Protected execution with Finance action succeeds
  assert.equal(chapterFixture('execute', id, {
    revision: rev3,
    scope: {...baseSecondScope, action: 'policy.financial.approve'},
  }).status, 200);

  // Revoke Finance grant mid-session
  chapterFixture('revoke-grant', id, {grant_id: gFinance.grant_id});

  // Protected execution immediately denied (403 forbidden)
  const revokedExec = chapterFixture('execute', id, {
    revision: rev3,
    scope: {...baseSecondScope, action: 'policy.financial.approve'},
  });
  assert.equal(revokedExec.status, 403);
  assert.equal(revokedExec.effect_committed, false);

  // Context read reflects immediate removal of Finance actions and grant
  const afterRevocation = await (await browser.request(contextPath)).json();
  assert.ok(!afterRevocation.context.available_actions.includes('policy.financial.approve'));
  assert.ok(!afterRevocation.context.duty_grants.some(g => g.id === gFinance.grant_id));
  assert.equal(afterRevocation.selection_revision, rev3);

  // Unit grant execution succeeds before unit deactivation
  assert.equal(chapterFixture('execute', id, {
    revision: rev3,
    scope: {...baseSecondScope, requesting_unit_id: gUnit.requesting_unit_id, action: 'policy.status.read', amount: '500.00'},
  }).status, 200);

  // Deactivate unit mid-session
  chapterFixture('deactivate-unit', id, {requesting_unit_id: gUnit.requesting_unit_id});

  // Unit execution now fails with 403 forbidden
  assert.equal(chapterFixture('execute', id, {
    revision: rev3,
    scope: {...baseSecondScope, requesting_unit_id: gUnit.requesting_unit_id, action: 'policy.status.read', amount: '500.00'},
  }).status, 403);

  // Expire unit grant mid-session
  chapterFixture('expire-grant', id, {grant_id: gUnit.grant_id});
  const afterExpiration = await (await browser.request(contextPath)).json();
  assert.ok(!afterExpiration.context.duty_grants.some(g => g.id === gUnit.grant_id));
});

test('ticket07 provider-only user isolation strictly prevents chapter access selection and action leakage', async () => {
  const provider = await verifiedProvisioner('p07-isolation');

  // Provider-only user with 0 chapter memberships
  const emptyCtx = await (await provider.browser.request(contextPath)).json();
  assert.equal(emptyCtx.chapter_state, 'no_authorized_memberships');
  assert.equal(emptyCtx.context, undefined);
  assert.equal(emptyCtx.selection_source, undefined);
  assert.match(emptyCtx.selection_revision, /^ctx_[A-Za-z0-9_-]{32,96}$/);

  const memberships = await (await provider.browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(memberships.items, []);

  // Provider cannot select an unowned chapter
  const syntheticChapter = {chapter_id: '999999999999999999', membership_id: '1', expected_membership_version: 1};
  assert.equal((await selectChapter(provider.browser, emptyCtx.selection_revision, syntheticChapter)).status, 403);

  // Provider cannot execute chapter protected execution without membership
  const unownedExec = chapterFixture('execute', provider.id, {
    revision: emptyCtx.selection_revision,
    scope: {
      chapter_id: '1',
      membership_id: '1',
      expected_authority_version: 1,
      action: 'provider.chapters.create',
    },
  });
  assert.equal(unownedExec.status, 409);
  assert.equal(unownedExec.effect_committed, false);

  // When provider is separately granted a chapter membership:
  const member = chapterFixture('membership', provider.id, {duties: ['COMMITTEE_REQUESTER']});
  const current = await (await provider.browser.request(contextPath)).json();
  assert.equal(current.chapter_state, 'selected');
  assert.equal(current.selection_source, 'sole_membership');
  assert.deepEqual(current.context.provider_roles, ['provisioner']);
  assert.deepEqual(current.context.available_actions, ['policy.status.read']);

  // Chapter context available_actions never exposes provider actions or disabled actions
  assert.ok(!current.context.available_actions.some(a => a.startsWith('provider.') || a === 'identity.disable'));

  // Protected chapter execution rejects provider actions
  const providerActionExec = chapterFixture('execute', provider.id, {
    revision: current.selection_revision,
    scope: {
      chapter_id: member.chapter_id,
      membership_id: member.membership_id,
      expected_authority_version: current.context.authority_version,
      action: 'provider.chapters.create',
    },
  });
  assert.equal(providerActionExec.status, 403);
  assert.equal(providerActionExec.effect_committed, false);

  // Chapter context revision cannot be passed to provider routes
  const providerContextPath = '/api/v1/provider/provisioning-context';
  assert.equal((await provider.browser.request(providerContextPath, {
    headers: {'X-Chapter-Context': current.selection_revision},
  })).status, 403);
});

test('ticket07 concurrent chapter selection updates under database contention accept exactly one update and reject the other as stale', async t => {
  const {browser, id} = await signedInBrowser('p07-race-updates');
  const first = chapterFixture('membership', id);
  const second = chapterFixture('membership', id);
  const third = chapterFixture('membership', id);

  // Initial selection of Chapter 1
  const initial = await (await browser.request(contextPath)).json();
  assert.equal(initial.chapter_state, 'selection_required');
  const selectedFirst = await selectChapter(browser, initial.selection_revision, first);
  assert.equal(selectedFirst.status, 200);
  const revA = (await selectedFirst.json()).selection_revision;

  // Independent contender client on separate HTTP worker
  const contender = new Browser();
  contender.cookies = new Map(browser.cookies);
  contender.worker = 'contender';

  // Hold row lock to force both workers to wait and overlap transactions
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/enrollment-state.php', 'hold', id]);
  t.after(() => holder.stdin.end('\n'));

  await Promise.race([new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holder.once('exit', () => reject(new Error('Chapter context lock holder exited')));
  }), new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 5000))]);

  // Tab 1 tries switching to Chapter 2; Tab 2 tries switching to Chapter 3
  const pending = Promise.all([
    selectChapter(browser, revA, second),
    selectChapter(contender, revA, third),
  ]);

  let waiting = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding: 'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waiting = Number(probe.stdout.trim());
      if (waiting >= 2) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 50)));
    }
  } finally {
    holder.stdin.end('\n');
  }

  const responses = await pending;
  assert.ok(waiting >= 2, `Both independent HTTP update transactions must overlap in lock waits; waiters=${waiting}`);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);

  const accepted = await responses.find(r => r.status === 200).json();
  const denied = await responses.find(r => r.status === 409).json();
  assert.deepEqual(Object.keys(denied).sort(), ['code', 'message', 'next_action']);
  assert.equal(denied.code, 'chapter_context_stale');

  // Server state reflects exactly the winning selection and its rotated revision
  const restored = await (await browser.request(contextPath)).json();
  assert.equal(restored.selection_source, 'restored');
  assert.equal(restored.selection_revision, accepted.selection_revision);
  assert.equal(restored.context.chapter_id, accepted.context.chapter_id);
  assert.ok([second.chapter_id, third.chapter_id].includes(restored.context.chapter_id));
});

async function installProvisioner(id, organization, approver) {
  return runIdentityCli([
    ['Operator audit reference', 'Synthetic restricted operator'],
    ['Provider identity ID', id], ['Organization ID', organization],
    ['Independent approver identity ID', approver],
    ['Approval evidence reference', 'Synthetic independently approved test authorization'],
  ], 'provider:install-initial');
}

test('ticket05 restricted CLI installs separately approved initial provider once', async () => {
  const {id, browser} = await signedInBrowser('p05-cli');
  const approver = await createIdentity(`p05-approval-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const {organization} = provisioningFixture('organization', id);
  const noninteractive = spawnSync('docker', ['exec', container, 'php', 'artisan', 'provider:install-initial', '--no-interaction'], {encoding:'utf8'});
  assert.equal(noninteractive.status, 1);
  assert.match(noninteractive.stdout, /interactive terminal/);
  const self = await installProvisioner(id, organization, id);
  assert.equal(self.code, 1, self.output);
  const installed = await installProvisioner(id, organization, approver);
  assert.equal(installed.code, 0, installed.output);
  const repeated = await installProvisioner(id, organization, approver);
  assert.equal(repeated.code, 1, repeated.output);
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), {state:'mfa_enrollment_required'});
  const state = provisioningFixture('installed', id);
  assert.equal(state.one_approved_installation, true);
  assert.equal(state.no_chapter_authority, true);
});

const provisioningPath = '/api/v1/provider/provisionings';
async function verifiedProvisionerMeasured(label, realCli = false) {
  const officer = await signedInBrowser(label, realCli ? await cliOfficer(label) : syntheticOfficer(label, true));
  let { organization } = officer;
  if (realCli) {
    const approver = await createIdentity(`${label}-approver-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
    ({ organization } = provisioningFixture('organization', officer.id));
    const installed = await installProvisioner(officer.id, organization, approver);
    assert.equal(installed.code, 0, installed.output);
  }
  assert.equal((await (await officer.browser.request('/api/v1/session')).json()).state, 'mfa_enrollment_required');
  const prepared = await (await post(officer.browser, enrollmentPath, {intent:'begin'})).json();
  // Keep setup away from the exact 30-second boundary; pause briefly if within 150ms of rollover.
  if (Date.now() % 30000 > 29850) {
    await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 30050 - (Date.now() % 30000))));
  }
  const confirmed = await post(officer.browser, enrollmentPath + '/confirm', {
    enrollment_id:prepared.enrollment.id, authenticator_code:authenticatorCode(prepared.enrollment.manual_key),
  });
  assert.equal(confirmed.status, 200);
  return {...officer, organization};
}
const createChapterBody = code => ({idempotency_key:`key-${code}`, expected_provider_authority_version:1,
  chapter:{code, name:'Synthetic chapter / \u00e9 \ud83c\udf31'}});

const headLookupPath = '/api/v1/provider/provisioning-identities/lookup';
function assertHeadResponse(status, body) {
  const operation = api.paths['/provider/provisionings/{provisioning_id}/initial-head'].post;
  const validate = ajv.compile(operation.responses[status].content['application/json'].schema);
  assert.ok(validate(body), JSON.stringify(validate.errors));
}
function assertLookupResponse(status, body) {
  const operation = api.paths['/provider/provisioning-identities/lookup'].post;
  const validate = ajv.compile(operation.responses[status].content['application/json'].schema);
  assert.ok(validate(body), JSON.stringify(validate.errors));
}
function assertReadProvisioning(status, body) {
  const operation = api.paths['/provider/provisionings/{provisioning_id}'].get;
  const validate = ajv.compile(operation.responses[status].content['application/json'].schema);
  assert.ok(validate(body), JSON.stringify(validate.errors));
}
function assertListProvisionings(status, body) {
  const operation = api.paths['/provider/provisionings'].get;
  const validate = ajv.compile(operation.responses[status].content['application/json'].schema);
  assert.ok(validate(body), JSON.stringify(validate.errors));
}
async function headApprovalCli(command, user, executor, document, verified = 'yes', operator = 'Synthetic executor') {
  const approval = provisioningFixture('approval-document', user, document);
  return runIdentityCli([
    ['Approval document path', approval.path], ['Technical executor identity ID', executor],
    ['Operator audit reference', operator], ['Approval independently verified (yes/no)', verified],
  ], command);
}
async function initialHeadScenarioMeasured(label, realCli = false) {
  const provider = await verifiedProvisioner(label, realCli);
  const headEmail = `${label}-head-${Date.now()}@example.test`;
  const head = await createIdentity(headEmail, 'Synthetic-only-secret-42!');
  const approved = await headApprovalCli('candidate:authorize-initial-head', head, head, {
    organization_id:provider.organization, purpose:'initial_head_appointment', approved_by_user_id:provider.id,
  });
  assert.equal(approved.code, 0, approved.output);
  const created = await post(provider.browser, provisioningPath, createChapterBody(`H${Date.now()}`));
  assert.equal(created.status, 200);
  const provisioning = (await created.json()).provisioning;
  const path = `${provisioningPath}/${provisioning.id}/initial-head`;
  const body = {idempotency_key:`head-${Date.now()}`, expected_provider_authority_version:1,
    expected_provisioning_version:1, identity:{user_id:head}, reason:'Synthetic approved initial Head designation'};
  return {...provider, head, headEmail, provisioning, path, body};
}

async function bootstrappedHead(label) {
  const scenario = await initialHeadScenario(label, true);
  const appointment = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(appointment.status, 200);
  const appointed = await appointment.json();
  const result = await headApprovalCli('chapter:bootstrap-initial-head', scenario.head, scenario.head, {
    purpose:'initial_head_membership', organization_id:scenario.organization,
    chapter_id:scenario.provisioning.chapter.id, provisioning_id:scenario.provisioning.id,
    designation_operation_id:appointed.operation.identity.operation_id, approved_by_user_id:scenario.id,
  });
  assert.equal(result.code, 0, result.output);
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  assert.equal((await post(browser, '/api/v1/session/sign-in', {
    email:scenario.headEmail, password:'Synthetic-only-secret-42!',
  })).status, 200);
  return {...scenario, browser};
}

test('ticket07 real initial Head bootstrap requires MFA before sole selection and exposes canonical current actions', async () => {
  const head = await bootstrappedHead('p07-real');
  for (const path of ['chapter-context','chapter-memberships']) {
    const restricted = await head.browser.request('/api/v1/session/' + path);
    assert.equal(restricted.status, 403);
    assert.deepEqual(await restricted.json(), {code:'forbidden', message:'This request is not permitted.'});
  }
  const prepared = await (await post(head.browser, enrollmentPath, {intent:'begin'})).json();
  const remaining = 30000 - Date.now() % 30000;
  if (remaining < 3000) await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, remaining + 100)));
  assert.equal((await post(head.browser, enrollmentPath + '/confirm', {
    enrollment_id:prepared.enrollment.id, authenticator_code:authenticatorCode(prepared.enrollment.manual_key),
  })).status, 200);
  const response = await head.browser.request('/api/v1/session/chapter-context');
  assert.equal(response.status, 200);
  const selected = await response.json();
  assert.equal(selected.chapter_state, 'selected');
  assert.equal(selected.selection_source, 'sole_membership');
  assert.equal(selected.context.user_id, head.head);
  assert.equal(selected.context.chapter_id, head.provisioning.chapter.id);
  assert.equal(selected.context.membership_id, selected.membership.membership_id);
  assert.equal(selected.context.mfa_satisfied, true);
  assert.deepEqual(selected.context.provider_roles, []);
  assert.deepEqual(selected.context.duty_grants.map(g => g.duty_code), ['CHAPTER_HEAD']);
  assert.deepEqual(selected.context.available_actions, [
    'memberships.read','memberships.prepare','memberships.authorize','memberships.revoke',
    'duty_grants.read','duty_grants.prepare','duty_grants.authorize','duty_grants.revoke',
    'alternates.read','alternates.prepare','alternates.authorize','alternates.revoke',
    'memberships.disable','policy.status.read','policy.operational.read','policy.operational.prepare',
    'policy.operational.approve','identities.reference.read',
  ]);
  const restored = await (await head.browser.request('/api/v1/session/chapter-context')).json();
  assert.equal(restored.selection_source, 'restored');
  assert.equal(restored.selection_revision, selected.selection_revision);
  const page = await (await head.browser.request('/api/v1/session/chapter-memberships')).json();
  assert.deepEqual(page.items, [selected.membership]);
});
test('ticket06 designation commits a durable P03 appointment without operational membership', async () => {
  const scenario = await initialHeadScenario('p06-appoint');
  const response = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(response.status, 200);
  const original = await response.json();
  assertHeadResponse(200, original);
  assert.equal(original.provisioning.status, 'initial_head_designated');
  assert.equal(original.provisioning.initial_head.identity.user_id, scenario.head);
  assert.equal(original.provisioning.initial_head_membership_authorization, 'not_authorized');
  assert.equal(original.provisioning.version, 2);
  assert.equal(provisioningFixture('head-authority', scenario.head).memberships, 0);
  const replay = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), {...original, operation:{...original.operation, replayed:true}});
  const changed = await post(scenario.browser, scenario.path, {...scenario.body, reason:'Changed appointment reason'});
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, 'idempotency_conflict');
  const lookup = await scenario.browser.request('/api/v1/provider/provisioning-operations/by-key?action_code=provider.initial_head.appoint&idempotency_key=' + scenario.body.idempotency_key);
  assert.deepEqual(await lookup.json(), {...original, operation:{...original.operation, replayed:true}});
  const read = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.deepEqual(await read.json(), original.provisioning);
});

test('ticket06 provider read and list projections distinguish awaiting, designated, authorized and ended states', async () => {
  const scenario = await initialHeadScenario('p06-projections');

  // State 1: Awaiting Initial Head (created but not designated)
  const read1 = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.equal(read1.status, 200);
  assert.match(read1.headers.get('cache-control'), /no-store/);
  const body1 = await read1.json();
  assertReadProvisioning(200, body1);
  assert.equal(body1.status, 'awaiting_initial_head');
  assert.equal(body1.initial_head, null);
  assert.equal(body1.initial_head_membership_authorization, 'not_applicable');
  assert.equal(body1.version, 1);

  const listAwaiting = await scenario.browser.request(`${provisioningPath}?status=awaiting_initial_head`);
  assert.equal(listAwaiting.status, 200);
  const listAwaitingBody = await listAwaiting.json();
  assertListProvisionings(200, listAwaitingBody);
  const foundAwaiting = listAwaitingBody.items.find(item => item.id === scenario.provisioning.id);
  assert.ok(foundAwaiting, 'Awaiting chapter must appear in awaiting_initial_head list');
  assert.deepEqual(foundAwaiting, body1);

  const listDesignatedEmpty = await scenario.browser.request(`${provisioningPath}?status=initial_head_designated`);
  assert.equal(listDesignatedEmpty.status, 200);
  assert.ok(!(await listDesignatedEmpty.json()).items.some(item => item.id === scenario.provisioning.id));

  // State 2: Initial Head Designated (appointed, but CLI membership not authorized)
  const appointRes = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(appointRes.status, 200);
  const appointBody = await appointRes.json();
  assertHeadResponse(200, appointBody);

  const read2 = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.equal(read2.status, 200);
  const body2 = await read2.json();
  assertReadProvisioning(200, body2);
  assert.equal(body2.status, 'initial_head_designated');
  assert.equal(body2.initial_head.identity.user_id, scenario.head);
  assert.equal(body2.initial_head_membership_authorization, 'not_authorized');
  assert.equal(body2.version, 2);

  const listDesignated = await scenario.browser.request(`${provisioningPath}?status=initial_head_designated`);
  assert.equal(listDesignated.status, 200);
  const listDesignatedBody = await listDesignated.json();
  assertListProvisionings(200, listDesignatedBody);
  const foundDesignated = listDesignatedBody.items.find(item => item.id === scenario.provisioning.id);
  assert.ok(foundDesignated, 'Designated chapter must appear in initial_head_designated list');
  assert.deepEqual(foundDesignated, body2);

  const listAwaiting2 = await scenario.browser.request(`${provisioningPath}?status=awaiting_initial_head`);
  assert.ok(!(await listAwaiting2.json()).items.some(item => item.id === scenario.provisioning.id));

  // State 3: CLI Membership Authorized
  const document = {
    purpose: 'initial_head_membership',
    organization_id: scenario.organization,
    chapter_id: scenario.provisioning.chapter.id,
    provisioning_id: scenario.provisioning.id,
    designation_operation_id: appointBody.operation.identity.operation_id,
    approved_by_user_id: scenario.id,
  };
  const bootstrapRes = await headApprovalCli('chapter:bootstrap-initial-head', scenario.head, scenario.head, document);
  assert.equal(bootstrapRes.code, 0, bootstrapRes.output);

  const read3 = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.equal(read3.status, 200);
  const body3 = await read3.json();
  assertReadProvisioning(200, body3);
  assert.equal(body3.status, 'initial_head_designated');
  assert.equal(body3.initial_head.identity.user_id, scenario.head);
  assert.equal(body3.initial_head_membership_authorization, 'authorized');
  assert.equal(body3.version, 3);

  const listAuthorized = await scenario.browser.request(`${provisioningPath}?status=initial_head_designated`);
  assert.equal(listAuthorized.status, 200);
  const foundAuthorized = (await listAuthorized.json()).items.find(item => item.id === scenario.provisioning.id);
  assert.deepEqual(foundAuthorized, body3);

  // Replay of appointment operation still preserves original not_authorized snapshot
  const replayAppoint = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(replayAppoint.status, 200);
  assert.equal((await replayAppoint.json()).provisioning.initial_head_membership_authorization, 'not_authorized');

  // State 4: CLI Membership Ended
  provisioningFixture('end-head-authority', scenario.head);

  const read4 = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.equal(read4.status, 200);
  const body4 = await read4.json();
  assertReadProvisioning(200, body4);
  assert.equal(body4.status, 'initial_head_designated');
  assert.equal(body4.initial_head.identity.user_id, scenario.head);
  assert.equal(body4.initial_head_membership_authorization, 'ended');
  assert.equal(body4.version, 3);

  const listEnded = await scenario.browser.request(`${provisioningPath}?status=initial_head_designated`);
  assert.equal(listEnded.status, 200);
  const foundEnded = (await listEnded.json()).items.find(item => item.id === scenario.provisioning.id);
  assert.deepEqual(foundEnded, body4);
});

test('ticket06 exact candidate lookup returns uniform null across missing disabled unapproved wrong-org identities', async () => {
  const provider = await verifiedProvisioner('p06-lookup');
  const lookup = async user_id => {
    const response = await post(provider.browser, headLookupPath, {user_id});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    assertLookupResponse(200, body);
    return body;
  };

  // 1. Missing identity: non-existent ID in users table
  assert.deepEqual(await lookup('18446744073709551615'), {identity:null});

  // 2. Unapproved identity: registered user in the database with no initial_head_candidates record
  const unapprovedTarget = await createIdentity(`p06-unapproved-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  assert.deepEqual(await lookup(unapprovedTarget), {identity:null});

  // 3. Wrong-org identity: candidate approved for Organization B, queried by provider of Organization A
  const otherProvider = await verifiedProvisioner('p06-other-org');
  const otherTarget = await createIdentity(`p06-other-cand-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const otherApproval = provisioningFixture('approval-document', otherTarget, {
    organization_id: otherProvider.organization, purpose: 'initial_head_appointment', approved_by_user_id: otherProvider.id,
  });
  const otherAuth = await runIdentityCli([
    ['Approval document path', otherApproval.path], ['Technical executor identity ID', otherTarget],
    ['Operator audit reference', 'Synthetic executor'], ['Approval independently verified (yes/no)', 'yes'],
  ], 'candidate:authorize-initial-head');
  assert.equal(otherAuth.code, 0, otherAuth.output);
  const otherLookup = await post(otherProvider.browser, headLookupPath, {user_id:otherTarget});
  assert.equal(otherLookup.status, 200);
  assert.deepEqual(await otherLookup.json(), {identity:{user_id:otherTarget, display_name:'Synthetic officer'}});
  assert.deepEqual(await lookup(otherTarget), {identity:null});

  // 4. Approved candidate in provider's organization: visible
  const approvedTarget = await createIdentity(`p06-approved-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const approvedDoc = provisioningFixture('approval-document', approvedTarget, {
    organization_id: provider.organization, purpose: 'initial_head_appointment', approved_by_user_id: provider.id,
  });
  const authRes = await runIdentityCli([
    ['Approval document path', approvedDoc.path], ['Technical executor identity ID', approvedTarget],
    ['Operator audit reference', 'Synthetic executor'], ['Approval independently verified (yes/no)', 'yes'],
  ], 'candidate:authorize-initial-head');
  assert.equal(authRes.code, 0, authRes.output);
  assert.deepEqual(await lookup(approvedTarget), {identity:{user_id:approvedTarget, display_name:'Synthetic officer'}});

  // 5. Revoked candidate: candidate approval revoked -> uniform null
  provisioningFixture('revoke-candidate', approvedTarget);
  assert.deepEqual(await lookup(approvedTarget), {identity:null});

  // 6. Disabled identity: candidate user disabled -> uniform null
  const disabledTarget = await createIdentity(`p06-disabled-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const disabledDoc = provisioningFixture('approval-document', disabledTarget, {
    organization_id: provider.organization, purpose: 'initial_head_appointment', approved_by_user_id: provider.id,
  });
  const disabledAuth = await headApprovalCli('candidate:authorize-initial-head', disabledTarget, disabledTarget, {
    organization_id: provider.organization, purpose: 'initial_head_appointment', approved_by_user_id: provider.id,
  });
  assert.equal(disabledAuth.code, 0, disabledAuth.output);
  assert.deepEqual(await lookup(disabledTarget), {identity:{user_id:disabledTarget, display_name:'Synthetic officer'}});
  arrangeState('disable', disabledTarget);
  assert.deepEqual(await lookup(disabledTarget), {identity:null});
});

test('ticket06 candidate becoming ineligible between lookup and appointInitialHead lock is durably rejected', async t => {
  const scenario = await initialHeadScenario('p06-ineligible-lock');

  // 1. Candidate is confirmed eligible at lookup time
  const lookupBefore = await post(scenario.browser, headLookupPath, {user_id:scenario.head});
  assert.equal(lookupBefore.status, 200);
  assert.deepEqual(await lookupBefore.json(), {identity:{user_id:scenario.head, display_name:'Synthetic officer'}});

  // 2. Candidate becomes ineligible between lookup and appointInitialHead acquisition of the lock
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/provisioning-state.php', 'hold-candidate-revocation', scenario.head]);
  t.after(() => holder.stdin.end('\n'));
  await new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holder.once('exit', () => reject(new Error('Candidate lock holder exited')));
  });

  const pending = post(scenario.browser, scenario.path, scenario.body);
  let waiting = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(*) FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON w.REQUESTING_ENGINE_LOCK_ID=l.ENGINE_LOCK_ID WHERE l.OBJECT_NAME=\'initial_head_candidates\'"'], {encoding:'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waiting = Number(probe.stdout.trim());
      if (waiting >= 1) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 100)));
    }
  } finally { holder.stdin.end('\n'); }

  const response = await pending;
  assert.ok(waiting >= 1, 'Appointment must reach and wait on the locked candidate row');
  assert.equal(response.status, 409);
  const rejected = await response.json();
  assertHeadResponse(409, rejected);
  assert.equal(rejected.code, 'identity_not_eligible');
  assert.equal(rejected.operation.outcome, 'rejected');
  assert.equal((await (await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`)).json()).status, 'awaiting_initial_head');

  // 3. Lookup after revocation returns uniform null
  const lookupAfter = await post(scenario.browser, headLookupPath, {user_id:scenario.head});
  assert.equal(lookupAfter.status, 200);
  assert.deepEqual(await lookupAfter.json(), {identity:null});

  // 4. Replay returns the exact durable terminal rejection
  const replay = await (await post(scenario.browser, scenario.path, scenario.body)).json();
  assert.deepEqual(replay, {...rejected, operation:{...rejected.operation, replayed:true}});
  assert.equal(provisioningFixture('head-authority', scenario.head).memberships, 0);
});

test('ticket06 attempting CLI bootstrap without prior designation is rejected with zero authority', async () => {
  const provider = await verifiedProvisioner('p06-no-desig');
  const candidate = await createIdentity(`p06-cnd-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const approved = await headApprovalCli('candidate:authorize-initial-head', candidate, candidate, {
    organization_id: provider.organization, purpose: 'initial_head_appointment', approved_by_user_id: provider.id,
  });
  assert.equal(approved.code, 0, approved.output);

  // Chapter is created, but Initial Head has NOT been designated (status remains awaiting_initial_head)
  const created = await post(provider.browser, provisioningPath, createChapterBody(`NODESIG_${Date.now()}`));
  assert.equal(created.status, 200);
  const provisioning = (await created.json()).provisioning;
  assert.equal(provisioning.status, 'awaiting_initial_head');

  // Attempt CLI bootstrap without prior designation
  const document = {
    purpose: 'initial_head_membership',
    organization_id: provider.organization,
    chapter_id: provisioning.chapter.id,
    provisioning_id: provisioning.id,
    designation_operation_id: '01K8A6J0A00000000000000002',
    approved_by_user_id: provider.id,
  };
  const result = await headApprovalCli('chapter:bootstrap-initial-head', candidate, candidate, document);
  assert.equal(result.code, 1, 'Bootstrap must fail without prior designation');
  assert.match(result.output, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // Database retains zero memberships and zero duty grants
  const stats = provisioningFixture('bootstrap-count', provisioning.chapter.id);
  assert.equal(stats.bootstraps, 0);
  assert.equal(stats.memberships, 0);
  assert.equal(stats.duty_grants, 0);

  // Provisioning read remains awaiting_initial_head with not_applicable
  const read = await provider.browser.request(`${provisioningPath}/${provisioning.id}`);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assertReadProvisioning(200, readBody);
  assert.equal(readBody.status, 'awaiting_initial_head');
  assert.equal(readBody.initial_head, null);
  assert.equal(readBody.initial_head_membership_authorization, 'not_applicable');
  assert.equal(readBody.version, 1);
});

test('ticket06 rejecting identical approving-authority and technical-executor attribution in candidate authorization and bootstrap', async () => {
  const provider = await verifiedProvisioner('p06-attr');
  const target = await createIdentity(`p06-target-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');

  // 1. Candidate authorization CLI: approver is also executor -> rejected
  const candidateDoc = provisioningFixture('approval-document', target, {
    organization_id: provider.organization, purpose: 'initial_head_appointment', approved_by_user_id: provider.id,
  });
  const badCandidateAuth = await runIdentityCli([
    ['Approval document path', candidateDoc.path], ['Technical executor identity ID', provider.id], // Same as approved_by_user_id!
    ['Operator audit reference', 'Synthetic executor'], ['Approval independently verified (yes/no)', 'yes'],
  ], 'candidate:authorize-initial-head');
  assert.equal(badCandidateAuth.code, 1, 'Candidate authorization must reject identical approver and executor');
  assert.match(badCandidateAuth.output, /Candidate authorization rejected; check approval and attribution\./);

  // Candidate is NOT authorized in DB
  const lookup = await post(provider.browser, headLookupPath, {user_id:target});
  assert.deepEqual(await lookup.json(), {identity:null});

  // Now authorize candidate properly with distinct approver and executor
  const goodCandidateAuth = await runIdentityCli([
    ['Approval document path', candidateDoc.path], ['Technical executor identity ID', target],
    ['Operator audit reference', 'Synthetic executor'], ['Approval independently verified (yes/no)', 'yes'],
  ], 'candidate:authorize-initial-head');
  assert.equal(goodCandidateAuth.code, 0, goodCandidateAuth.output);

  // Create chapter and designate Head
  const created = await post(provider.browser, provisioningPath, createChapterBody(`ATTR_${Date.now()}`));
  assert.equal(created.status, 200);
  const provisioning = (await created.json()).provisioning;
  const appoint = await post(provider.browser, `${provisioningPath}/${provisioning.id}/initial-head`, {
    idempotency_key: `head-attr-${Date.now()}`, expected_provider_authority_version: 1, expected_provisioning_version: 1,
    identity: {user_id:target}, reason: 'Synthetic approved initial Head designation',
  });
  assert.equal(appoint.status, 200);
  const designated = await appoint.json();

  // 2. Initial Head bootstrap CLI: approver is also executor -> rejected
  const membershipDoc = {
    purpose: 'initial_head_membership',
    organization_id: provider.organization,
    chapter_id: provisioning.chapter.id,
    provisioning_id: provisioning.id,
    designation_operation_id: designated.operation.identity.operation_id,
    approved_by_user_id: provider.id,
  };
  const badBootstrap = await headApprovalCli('chapter:bootstrap-initial-head', target, provider.id, membershipDoc);
  assert.equal(badBootstrap.code, 1, 'Bootstrap must reject identical approver and executor');
  assert.match(badBootstrap.output, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // Verify no membership or duty grant created
  const stats = provisioningFixture('bootstrap-count', provisioning.chapter.id);
  assert.equal(stats.bootstraps, 0);
  assert.equal(stats.memberships, 0);
  assert.equal(stats.duty_grants, 0);

  // Read remains designated with not_authorized
  const read = await provider.browser.request(`${provisioningPath}/${provisioning.id}`);
  assert.equal((await read.json()).initial_head_membership_authorization, 'not_authorized');
});

test('ticket06 idempotent exact CLI repeat vs mutated bootstrap conflict', async () => {
  const scenario = await initialHeadScenario('p06-repeat-conflict');
  const appointment = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(appointment.status, 200);
  const designated = await appointment.json();

  const document = {
    purpose: 'initial_head_membership',
    organization_id: scenario.organization,
    chapter_id: scenario.provisioning.chapter.id,
    provisioning_id: scenario.provisioning.id,
    designation_operation_id: designated.operation.identity.operation_id,
    approved_by_user_id: scenario.id,
  };
  const invoke = (data = document, executor = scenario.head, operator = 'Synthetic executor') =>
    headApprovalCli('chapter:bootstrap-initial-head', scenario.head, executor, data, 'yes', operator);

  // 1. Initial valid bootstrap execution
  const installed = await invoke();
  assert.equal(installed.code, 0, installed.output);
  const result = JSON.parse(installed.output.match(/Bootstrap result: (\{[^\r\n]+\})/)[1]);
  assert.equal(result.user_id, scenario.head);
  assert.equal(result.chapter_id, scenario.provisioning.chapter.id);
  assert.equal(result.duty, 'CHAPTER_HEAD');

  // Verify database state: exactly 1 bootstrap, 1 membership, 1 grant
  const stats1 = provisioningFixture('bootstrap-count', scenario.provisioning.chapter.id);
  assert.equal(stats1.bootstraps, 1);
  assert.equal(stats1.memberships, 1);
  assert.equal(stats1.duty_grants, 1);
  assert.equal(stats1.authority_version, 2);

  // 2. Idempotent exact CLI repeat with identical document, executor, operator
  const repeated = await invoke();
  assert.equal(repeated.code, 0, repeated.output);
  assert.deepEqual(JSON.parse(repeated.output.match(/Bootstrap result: (\{[^\r\n]+\})/)[1]), result);

  // Database counts unchanged
  const stats2 = provisioningFixture('bootstrap-count', scenario.provisioning.chapter.id);
  assert.equal(stats2.bootstraps, 1);
  assert.equal(stats2.memberships, 1);
  assert.equal(stats2.duty_grants, 1);
  assert.equal(stats2.authority_version, 2);

  // 3. Mutated bootstrap conflict: mutated approval_reference
  const changedRef = await invoke({...document, approval_reference: 'Mutated independent approval reference'});
  assert.equal(changedRef.code, 1, 'Must reject mutated approval reference');
  assert.match(changedRef.output, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // 4. Mutated bootstrap conflict: mutated technical executor
  const otherExecutor = await createIdentity(`p06-other-exec-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const changedExec = await invoke(document, otherExecutor);
  assert.equal(changedExec.code, 1, 'Must reject mutated technical executor');
  assert.match(changedExec.output, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // 5. Mutated bootstrap conflict: mutated operator audit reference
  const changedOp = await invoke(document, scenario.head, 'Mutated operator audit reference');
  assert.equal(changedOp.code, 1, 'Must reject mutated operator reference');
  assert.match(changedOp.output, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // 6. Mutated bootstrap conflict: competing candidate target
  const competingTarget = await invoke(document, scenario.id);
  assert.equal(competingTarget.code, 1, 'Must reject competing candidate target');

  // In all conflict cases, database counts remain strictly unchanged
  const stats3 = provisioningFixture('bootstrap-count', scenario.provisioning.chapter.id);
  assert.equal(stats3.bootstraps, 1);
  assert.equal(stats3.memberships, 1);
  assert.equal(stats3.duty_grants, 1);

  // Read still reports authorized
  const read = await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`);
  assert.equal((await read.json()).initial_head_membership_authorization, 'authorized');
});

test('ticket06 concurrent CLI bootstrap attempts serialize under MySQL lock with exact replay or conflict rejection', async t => {
  // --- Case A: Concurrent identical CLI bootstrap attempts ---
  const scenarioA = await initialHeadScenario('p06-concurrent-exact');
  const appointmentA = await post(scenarioA.browser, scenarioA.path, scenarioA.body);
  assert.equal(appointmentA.status, 200);
  const designatedA = await appointmentA.json();

  const documentA = {
    purpose: 'initial_head_membership',
    organization_id: scenarioA.organization,
    chapter_id: scenarioA.provisioning.chapter.id,
    provisioning_id: scenarioA.provisioning.id,
    designation_operation_id: designatedA.operation.identity.operation_id,
    approved_by_user_id: scenarioA.id,
  };
  const invokeA = () => headApprovalCli('chapter:bootstrap-initial-head', scenarioA.head, scenarioA.head, documentA);

  const holderA = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/provisioning-state.php', 'hold-organization', scenarioA.organization]);
  t.after(() => holderA.stdin.end('\n'));
  await new Promise((resolve, reject) => {
    holderA.once('error', reject);
    holderA.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holderA.once('exit', () => reject(new Error('Organization lock holder exited')));
  });

  const pendingA = Promise.all([invokeA(), invokeA()]);
  let waitingA = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding:'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waitingA = Number(probe.stdout.trim());
      if (waitingA >= 2) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 100)));
    }
  } finally { holderA.stdin.end('\n'); }

  assert.ok(waitingA >= 2, `Both concurrent CLI bootstrap processes must wait on MySQL lock; waiters=${waitingA}`);
  const [resA1, resA2] = await pendingA;
  assert.equal(resA1.code, 0, resA1.output);
  assert.equal(resA2.code, 0, resA2.output);
  const parsedA1 = JSON.parse(resA1.output.match(/Bootstrap result: (\{[^\r\n]+\})/)[1]);
  const parsedA2 = JSON.parse(resA2.output.match(/Bootstrap result: (\{[^\r\n]+\})/)[1]);
  assert.deepEqual(parsedA1, parsedA2, 'Both concurrent attempts must return identical bootstrap result');

  // Verify MySQL state: exactly 1 membership, 1 duty grant, 1 bootstrap row
  const statsA = provisioningFixture('bootstrap-count', scenarioA.provisioning.chapter.id);
  assert.equal(statsA.bootstraps, 1);
  assert.equal(statsA.memberships, 1);
  assert.equal(statsA.duty_grants, 1);
  assert.equal(statsA.authority_version, 2);

  const readA = await scenarioA.browser.request(`${provisioningPath}/${scenarioA.provisioning.id}`);
  assert.equal((await readA.json()).initial_head_membership_authorization, 'authorized');

  // --- Case B: Concurrent mutated/competing CLI bootstrap attempts ---
  const scenarioB = await initialHeadScenario('p06-concurrent-competing');
  const appointmentB = await post(scenarioB.browser, scenarioB.path, scenarioB.body);
  assert.equal(appointmentB.status, 200);
  const designatedB = await appointmentB.json();

  const documentB1 = {
    purpose: 'initial_head_membership',
    organization_id: scenarioB.organization,
    chapter_id: scenarioB.provisioning.chapter.id,
    provisioning_id: scenarioB.provisioning.id,
    designation_operation_id: designatedB.operation.identity.operation_id,
    approved_by_user_id: scenarioB.id,
  };
  const documentB2 = {
    ...documentB1,
    approval_reference: 'Competing approval reference under race',
  };

  const invokeB1 = () => headApprovalCli('chapter:bootstrap-initial-head', scenarioB.head, scenarioB.head, documentB1);
  const invokeB2 = () => headApprovalCli('chapter:bootstrap-initial-head', scenarioB.head, scenarioB.head, documentB2);

  const holderB = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/provisioning-state.php', 'hold-organization', scenarioB.organization]);
  t.after(() => holderB.stdin.end('\n'));
  await new Promise((resolve, reject) => {
    holderB.once('error', reject);
    holderB.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holderB.once('exit', () => reject(new Error('Organization lock holder exited')));
  });

  const pendingB = Promise.all([invokeB1(), invokeB2()]);
  let waitingB = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding:'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waitingB = Number(probe.stdout.trim());
      if (waitingB >= 2) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 100)));
    }
  } finally { holderB.stdin.end('\n'); }

  assert.ok(waitingB >= 2, `Both competing CLI bootstrap processes must wait on MySQL lock; waiters=${waitingB}`);
  const [resB1, resB2] = await pendingB;
  const codes = [resB1.code, resB2.code].sort();
  assert.deepEqual(codes, [0, 1], 'One competing attempt must succeed and the other must be rejected');
  const rejectedOutput = resB1.code === 1 ? resB1.output : resB2.output;
  assert.match(rejectedOutput, /Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap\./);

  // Database retains exactly 1 bootstrap, 1 membership, 1 grant
  const statsB = provisioningFixture('bootstrap-count', scenarioB.provisioning.chapter.id);
  assert.equal(statsB.bootstraps, 1);
  assert.equal(statsB.memberships, 1);
  assert.equal(statsB.duty_grants, 1);
  assert.equal(statsB.authority_version, 2);

  const readB = await scenarioB.browser.request(`${provisioningPath}/${scenarioB.provisioning.id}`);
  assert.equal((await readB.json()).initial_head_membership_authorization, 'authorized');
});

test('ticket06 restricted bootstrap rejects unverified mismatched approval and lost eligibility without grants', async () => {
  const scenario = await initialHeadScenario('p06-guards');
  const noninteractive = spawnSync('docker', ['exec', container, 'php', 'artisan', 'chapter:bootstrap-initial-head', '--no-interaction'], {encoding:'utf8'});
  assert.equal(noninteractive.status, 1);
  assert.match(noninteractive.stdout, /interactive terminal/);
  const document = {purpose:'initial_head_membership', organization_id:scenario.organization,
    chapter_id:scenario.provisioning.chapter.id, provisioning_id:scenario.provisioning.id,
    designation_operation_id:'01K8A6J0A00000000000000002', approved_by_user_id:scenario.id};
  const invoke = (data = document, executor = scenario.head, verified = 'yes') => headApprovalCli('chapter:bootstrap-initial-head', scenario.head, executor, data, verified);
  assert.equal((await invoke()).code, 1, 'No designation');
  const response = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(response.status, 200);
  document.designation_operation_id = (await response.json()).operation.identity.operation_id;
  assert.equal((await invoke(document, scenario.head, 'no')).code, 1, 'Unverified evidence');
  assert.equal((await invoke(document, scenario.id)).code, 1, 'Approver is also executor');
  assert.equal((await invoke({...document, chapter_id:'18446744073709551615'})).code, 1, 'Wrong chapter');
  assert.equal((await invoke({...document, designation_operation_id:'01K8A6J0A00000000000000002'})).code, 1, 'Wrong designation');
  assert.equal((await invoke({...document, approval_reference:''})).code, 1, 'Absent approval');
  provisioningFixture('revoke-candidate', scenario.head);
  assert.equal((await invoke()).code, 1, 'Lost live eligibility');
  assert.equal(provisioningFixture('head-authority', scenario.head).memberships, 0);
});

test('ticket06 bootstrap rolls back all authority on history failure and rejects an existing competing Head', async () => {
  const scenario = await initialHeadScenario('p06-atomic');
  const response = await post(scenario.browser, scenario.path, scenario.body);
  assert.equal(response.status, 200);
  const designated = await response.json();
  const document = {purpose:'initial_head_membership', organization_id:scenario.organization,
    chapter_id:scenario.provisioning.chapter.id, provisioning_id:scenario.provisioning.id,
    designation_operation_id:designated.operation.identity.operation_id, approved_by_user_id:scenario.id};
  const invoke = () => headApprovalCli('chapter:bootstrap-initial-head', scenario.head, scenario.head, document);
  mysqlFault("CREATE TRIGGER ticket06_abort BEFORE INSERT ON initial_head_bootstraps FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic bootstrap history failure'");
  try {
    assert.equal((await invoke()).code, 1);
    assert.equal(provisioningFixture('head-authority', scenario.head).memberships, 0);
    assert.equal((await (await scenario.browser.request(`${provisioningPath}/${scenario.provisioning.id}`)).json()).initial_head_membership_authorization, 'not_authorized');
  } finally { mysqlFault('DROP TRIGGER IF EXISTS ticket06_abort'); }
  // A separately seeded historical Head must also close the initial bootstrap path,
  // even when its grant has ended and there is no bootstrap result to replay.
  provisioningFixture('competing-head', scenario.id, {chapter:scenario.provisioning.chapter.id});
  assert.equal((await invoke()).code, 1);
  assert.equal(provisioningFixture('head-authority', scenario.head).memberships, 0);
  for (const [name, passed] of Object.entries(provisioningFixture('head-history-privileges', scenario.head))) assert.equal(passed, true, name);
});

test('ticket05 core write creates an awaiting initial Head chapter with no operational authority', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-write');
  const context = await browser.request('/api/v1/provider/provisioning-context');
  assert.equal(context.status, 200);
  assert.deepEqual((await context.json()).scope, {kind:'provisioner', organization_id:organization, provider_user_id:id});
  const body = createChapterBody('P05_' + Date.now());
  // Literal property order comes from the contract's JCS wrapper, independent of the PHP encoder.
  const canonical = JSON.stringify({action_code:'provider.chapters.create', body:{chapter:{code:body.chapter.code, name:body.chapter.name},
    expected_provider_authority_version:1, idempotency_key:body.idempotency_key}, input_schema:'CreateProvisionedChapterRequest@p02.09-review.1',
    provisioning_id:null, scope:{kind:'provisioner', organization_id:organization, provider_user_id:id}});
  const expectedHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const response = await post(browser, provisioningPath, body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.action_result, 'success');
  assert.equal(result.provisioning.status, 'awaiting_initial_head');
  assert.equal(result.provisioning.initial_head, null);
  assert.equal(result.provisioning.initial_head_membership_authorization, 'not_applicable');
  assert.deepEqual(result.provisioning.chapter, {...body.chapter, id:result.provisioning.chapter.id});
  assert.equal(result.operation.replayed, false);
  assert.equal(result.operation.identity.action_code, 'provider.chapters.create');
  assert.equal(result.operation.identity.idempotency_key, body.idempotency_key);
  for (const [name, passed] of Object.entries(provisioningFixture('created', id, {body, result, expectedHash}))) assert.equal(passed, true, name);
});

test('ticket05 identical replay returns original snapshot before new stale guards', async () => {
  const {browser, id} = await verifiedProvisioner('p05-replay');
  const body = createChapterBody('REPLAY_' + Date.now());
  const first = await post(browser, provisioningPath, body);
  assert.equal(first.status, 200);
  const original = await first.json();
  provisioningFixture('advance-authority', id);
  const replay = await post(browser, provisioningPath, {chapter:{name:body.chapter.name, code:body.chapter.code},
    expected_provider_authority_version:1, idempotency_key:body.idempotency_key});
  assert.equal(replay.status, 200);
  const result = await replay.json();
  assert.deepEqual(result, {...original, operation:{...original.operation, replayed:true}});
  for (const [name, passed] of Object.entries(provisioningFixture('created', id, {body, result:original}))) assert.equal(passed, true, name);
});

test('ticket05 changed semantic payload conflicts without replacing the original outcome', async () => {
  const {browser, id} = await verifiedProvisioner('p05-conflict');
  const body = createChapterBody('CONFLICT_' + Date.now());
  const original = await (await post(browser, provisioningPath, body)).json();
  const changed = await post(browser, provisioningPath, {...body, chapter:{...body.chapter, name:'Changed name'}});
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, 'idempotency_conflict');
  const replay = await (await post(browser, provisioningPath, body)).json();
  assert.deepEqual(replay, {...original, operation:{...original.operation, replayed:true}});
  for (const [name, passed] of Object.entries(provisioningFixture('created', id, {body, result:original}))) assert.equal(passed, true, name);
});

test('ticket05 new stale authority attempt has no durable outcome and version changes conflict on a used key', async () => {
  const {browser, id} = await verifiedProvisioner('p05-stale');
  const body = createChapterBody('STALE_' + Date.now());
  const original = await (await post(browser, provisioningPath, body)).json();
  provisioningFixture('advance-authority', id);
  const staleBody = {...body, idempotency_key:'new-stale-key', chapter:{...body.chapter, code:body.chapter.code + 'A'}};
  const stale = await post(browser, provisioningPath, staleBody);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'provider_authority_stale');
  const changed = await post(browser, provisioningPath, {...body, expected_provider_authority_version:2});
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).code, 'idempotency_conflict');
  for (const [name, passed] of Object.entries(provisioningFixture('created', id, {body, result:original}))) assert.equal(passed, true, name);
  assert.equal(provisioningFixture('attempt-count', id).count, 1);
});

test('ticket05 chapter code collision is a durable terminal rejection and replays before stale checks', async () => {
  const {browser, id} = await verifiedProvisioner('p05-rejection');
  const body = createChapterBody('TAKEN_' + Date.now());
  const created = await post(browser, provisioningPath, body);
  assert.equal(created.status, 200);
  const rejectedBody = {...body, idempotency_key:'rejected-key', chapter:{...body.chapter, name:'Competing chapter'}};
  const rejected = await post(browser, provisioningPath, rejectedBody);
  assert.equal(rejected.status, 409);
  const original = await rejected.json();
  assert.equal(original.code, 'chapter_code_unavailable');
  assert.equal(original.action_result, 'blocked');
  assert.equal(original.provisioning_id, null);
  assert.equal(original.operation.outcome, 'rejected');
  assert.equal(original.operation.replayed, false);
  provisioningFixture('advance-authority', id);
  const replay = await post(browser, provisioningPath, rejectedBody);
  assert.equal(replay.status, 409);
  assert.deepEqual(await replay.json(), {...original, operation:{...original.operation, replayed:true}});
  assert.equal(provisioningFixture('attempt-count', id).count, 2);
  assert.equal(provisioningFixture('chapter-count', id).count, 1);
  const other = await verifiedProvisioner('p05-other-org');
  assert.equal((await post(other.browser, provisioningPath, body)).status, 200, 'Code uniqueness is per organization');
});

test('ticket05 malformed or ambiguous semantic requests never create an attempt', async () => {
  const {browser, id} = await verifiedProvisioner('p05-invalid');
  const body = createChapterBody('INVALID_' + Date.now());
  for (const bad of [
    {...body, chapter:{...body.chapter, name:' \u00a0\u2003 '}},
    {...body, organization_id:'1'}, {...body, scope:{}}, {...body, expected_provider_authority_version:1.5},
    {...body, chapter:{...body.chapter, code:'lowercase'}}, {...body, chapter:{...body.chapter, name:''}},
  ]) assert.equal((await post(browser, provisioningPath, bad)).status, 422);
  for (const rawBody of [
    JSON.stringify(body).replace('"chapter":', '"idempotency_key":"duplicate","chapter":'),
    JSON.stringify(body).replace('"code":', '"co\\u0064e":"OTHER","code":'),
    JSON.stringify(body).replace('"name":', '"name":"hidden","name":'),
    JSON.stringify(body).replace('"name":', '"name":"' + 'a'.repeat(100000) + '","name":'),
    '{"chapter":',
  ]) {
    const response = await browser.request(provisioningPath, {method:'POST', rawBody,
      headers:{'X-XSRF-TOKEN':decodeURIComponent(browser.cookies.get('XSRF-TOKEN'))}});
    assert.equal(response.status, 422, `Reject ambiguous JSON (${rawBody.length} bytes)`);
  }
  assert.equal(provisioningFixture('attempt-count', id).count, 0);
  assert.equal(provisioningFixture('chapter-count', id).count, 0);
});

test('ticket05 current provider authority and verified MFA guard both writes and replay disclosure', async () => {
  const {browser:basic, id:basicId} = await signedInBrowser('p05-no-grant');
  const body = createChapterBody('AUTH_' + Date.now());
  assert.equal((await post(basic, provisioningPath, body)).status, 403);
  assert.equal(provisioningFixture('attempt-count', basicId).count, 0);
  const {browser, id} = await verifiedProvisioner('p05-authority');
  assert.equal((await post(browser, provisioningPath, body)).status, 200);
  assert.equal((await browser.request('/api/v1/provider/provisioning-context?organization_id=1')).status, 403);
  assert.equal((await browser.request('/api/v1/provider/provisioning-context', {headers:{'X-Chapter-Context':'forbidden'}})).status, 403);
  provisioningFixture('ambiguous', id);
  assert.equal((await post(browser, provisioningPath, body)).status, 403);
  provisioningFixture('revoke', id);
  assert.equal((await post(browser, provisioningPath, body)).status, 403);
  assert.equal(provisioningFixture('attempt-count', id).count, 1);
});

test('ticket05 terminal history has effective insert-only runtime privileges and immutable guards', async () => {
  const {browser, id} = await verifiedProvisioner('p05-history');
  const body = createChapterBody('HISTORY_' + Date.now());
  assert.equal((await post(browser, provisioningPath, body)).status, 200);
  for (const [name, passed] of Object.entries(provisioningFixture('immutable', id))) assert.equal(passed, true, name);
  const guards = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
    'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=\'ysp_local\' AND (EVENT_OBJECT_TABLE LIKE \'provider_%\' OR EVENT_OBJECT_TABLE=\'initial_provider_installations\')"'], {encoding:'utf8'});
  assert.equal(guards.status, 0, guards.stderr);
  assert.equal(guards.stdout.trim(), '12');
});

test('ticket05 a failure before terminal-result insert rolls back the chapter and permits the same attempt', async () => {
  const {browser, id} = await verifiedProvisioner('p05-rollback');
  const body = createChapterBody('ROLLBACK_' + Date.now());
  mysqlFault("CREATE TRIGGER ticket05_abort BEFORE INSERT ON provider_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Synthetic precommit failure'");
  try {
    assert.equal((await post(browser, provisioningPath, body)).status, 503);
    assert.equal(provisioningFixture('attempt-count', id).count, 0);
    assert.equal(provisioningFixture('chapter-count', id).count, 0);
  } finally { mysqlFault('DROP TRIGGER IF EXISTS ticket05_abort'); }
  assert.equal((await post(browser, provisioningPath, body)).status, 200);
  assert.equal(provisioningFixture('attempt-count', id).count, 1);
  assert.equal(provisioningFixture('chapter-count', id).count, 1);
});

for (const mode of ['identical key', 'changed payload', 'competing code']) {
  test(`ticket05 overlapping MySQL transactions fence ${mode} attempts`, async t => {
    const {browser, id} = await verifiedProvisioner('p05-race');
    const contender = new Browser();
    contender.cookies = new Map(browser.cookies);
    contender.worker = 'contender';
    const body = createChapterBody('RACE_' + Date.now());
    const second = mode === 'identical key' ? body : mode === 'changed payload'
      ? {...body, chapter:{...body.chapter, name:'Contending payload'}} : {...body, idempotency_key:'competing-code-key'};
    const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
      'php', 'tests/fixtures/enrollment-state.php', 'hold', id]);
    t.after(() => holder.stdin.end('\n'));
    await new Promise((resolve, reject) => {
      holder.once('error', reject);
      holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
      holder.once('exit', () => reject(new Error('Lock holder exited')));
    });
    const requests = Promise.all([post(browser, provisioningPath, body), post(contender, provisioningPath, second)]);
    let waiting = 0;
    try {
      for (let i = 0; i < 40; i++) {
        const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
          'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding:'utf8'});
        assert.equal(probe.status, 0, probe.stderr);
        waiting = Number(probe.stdout.trim());
        if (waiting >= 2) break;
        await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 100)));
      }
    } finally { holder.stdin.end('\n'); }
    const responses = await requests;
    assert.ok(waiting >= 2, `Two independent HTTP transactions must overlap; waiters=${waiting}`);
    assert.deepEqual(responses.map(r => r.status).sort(), mode === 'identical key' ? [200, 200] : [200, 409]);
    const results = await Promise.all(responses.map(r => r.json()));
    if (mode === 'identical key') {
      assert.equal(results[0].operation.identity.operation_id, results[1].operation.identity.operation_id);
      assert.equal(results.filter(r => r.operation.replayed).length, 1);
    } else {
      assert.equal(results.find(r => r.code)?.code, mode === 'changed payload' ? 'idempotency_conflict' : 'chapter_code_unavailable');
    }
    assert.equal(provisioningFixture('attempt-count', id).count, mode === 'competing code' ? 2 : 1);
    assert.equal(provisioningFixture('chapter-count', id).count, 1);
  });
}

test('ticket05 signed-out provisioning uses the authenticated-operation contract and has no effect', async () => {
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await post(browser, provisioningPath, createChapterBody('SIGNED_OUT'));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'authentication_required');
});

test('ticket05 independent providers competing for one code retain one chapter and one terminal rejection', async t => {
  const first = await verifiedProvisioner('p05-org-race-first');
  const second = await verifiedProvisioner('p05-org-race-second');
  second.browser.worker = 'contender';
  provisioningFixture('approved-same-organization', second.id, {organization:first.organization, approver:first.id});
  const body = createChapterBody('ORG_RACE_' + Date.now());
  const holder = spawn('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/provisioning-state.php', 'hold-organization', first.organization]);
  t.after(() => holder.stdin.end('\n'));
  await new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.on('data', data => { if (data.toString().includes('held')) resolve(); });
    holder.once('exit', () => reject(new Error('Organization holder exited')));
  });
  // Equal keys still belong to distinct actor-private namespaces.
  const requests = Promise.all([post(first.browser, provisioningPath, body), post(second.browser, provisioningPath, body)]);
  let waiting = 0;
  try {
    for (let i = 0; i < 40; i++) {
      const probe = spawnSync('docker', ['exec', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
        'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot -Nse "SELECT COUNT(DISTINCT REQUESTING_THREAD_ID) FROM performance_schema.data_lock_waits"'], {encoding:'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      waiting = Number(probe.stdout.trim());
      if (waiting >= 2) break;
      await measure('synchronization-sleep', () => new Promise(resolve => setTimeout(resolve, 100)));
    }
  } finally { holder.stdin.end('\n'); }
  const responses = await requests;
  assert.ok(waiting >= 2, `Both providers must wait on the organization; waiters=${waiting}`);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const results = await Promise.all(responses.map(r => r.json()));
  assert.equal(results.find(r => r.code)?.code, 'chapter_code_unavailable');
  assert.notEqual(results[0].operation.identity.operation_id, results[1].operation.identity.operation_id);
  assert.equal(provisioningFixture('attempt-count', first.id).count, 1);
  assert.equal(provisioningFixture('attempt-count', second.id).count, 1);
  assert.equal(provisioningFixture('chapter-count', first.id).count + provisioningFixture('chapter-count', second.id).count, 1);
});

test('ticket05 unsigned twenty-digit scope and persistence IDs remain exact through installation and creation', async () => {
  const huge = (10000000000000000000n + BigInt(Date.now()) * 1000000n).toString();
  for (const table of ['users', 'provider_role_grants', 'chapters', 'chapter_provisionings', 'provider_operation_attempts', 'provider_actor_attributions', 'provider_operations']) {
    mysqlFault(`ALTER TABLE ${table} AUTO_INCREMENT = ${huge}`);
  }
  mysqlFault(`INSERT INTO organizations (id, name) VALUES (${huge}, 'Synthetic unsigned organization')`);
  const {browser, id} = await signedInBrowser('p05-uint64');
  assert.equal(id, huge);
  const approver = await createIdentity(`p05-uint64-approver-${Date.now()}@example.test`, 'Synthetic-only-secret-42!');
  const installed = await installProvisioner(id, huge, approver);
  assert.equal(installed.code, 0, installed.output);
  await browser.request('/api/v1/session');
  const prepared = await (await post(browser, enrollmentPath, {intent:'begin'})).json();
  assert.equal((await post(browser, enrollmentPath + '/confirm', {enrollment_id:prepared.enrollment.id,
    authenticator_code:authenticatorCode(prepared.enrollment.manual_key)})).status, 200);
  const body = createChapterBody('UINT64');
  const response = await post(browser, provisioningPath, body);
  assert.equal(response.status, 200);
  const original = await response.json();
  assert.equal(original.scope.organization_id, huge);
  assert.equal(original.scope.provider_user_id, huge);
  assert.equal(original.provisioning.chapter.id, huge);
  assert.equal(original.provisioning.id, huge);
  const replay = await post(browser, provisioningPath, body);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), {...original, operation:{...original.operation, replayed:true}});
});

test('ticket05 readProvisioning returns visible provisioning and uniform 404 for absent or cross-tenant IDs', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-read-owner');
  const body = createChapterBody('READ_' + Date.now());
  const created = await (await post(browser, provisioningPath, body)).json();
  const provisioningId = created.provisioning.id;

  // Visible read succeeds
  const read = await browser.request(`${provisioningPath}/${provisioningId}`);
  assert.equal(read.status, 200);
  const readBody = await read.json();
  assert.deepEqual(readBody, created.provisioning);

  // Absent ID gives uniform 404
  const absent = await browser.request(`${provisioningPath}/999999999999999999`);
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), {code:'provisioning_not_visible', message:'Provisioning is not available.'});

  // Cross-tenant ID gives uniform 404
  const other = await verifiedProvisioner('p05-read-other');
  const otherRead = await other.browser.request(`${provisioningPath}/${provisioningId}`);
  assert.equal(otherRead.status, 404);
  assert.deepEqual(await otherRead.json(), {code:'provisioning_not_visible', message:'Provisioning is not available.'});

  // Query string on read returns 400 invalid_selector
  const badQuery = await browser.request(`${provisioningPath}/${provisioningId}?organization_id=2`);
  assert.equal(badQuery.status, 400);
  assert.deepEqual(await badQuery.json(), {code:'invalid_selector', message:'Use only the documented single-valued selectors.'});

  // Chapter context header on read returns 403
  const badContext = await browser.request(`${provisioningPath}/${provisioningId}`, {headers:{'X-Chapter-Context':'forbidden'}});
  assert.equal(badContext.status, 403);
});

const lookupKeyPath = '/api/v1/provider/provisioning-operations/by-key';
const lookupIdPath = '/api/v1/provider/provisioning-operations/by-id';

test('ticket05 outcome recovery via key and ID lookup returns committed/rejected outcomes and uniform uncertainty for absent or cross-tenant attempts', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-lookup-owner');
  const code = 'LOOKUP_' + Date.now();
  const body = createChapterBody(code);
  const created = await (await post(browser, provisioningPath, body)).json();
  const operationId = created.operation.identity.operation_id;

  // 1. Committed creation recovery via by-key and by-id
  const keyLookup = await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`);
  assert.equal(keyLookup.status, 200);
  assert.deepEqual(await keyLookup.json(), {...created, operation:{...created.operation, replayed:true}});

  const idLookup = await browser.request(`${lookupIdPath}/${operationId}`);
  assert.equal(idLookup.status, 200);
  assert.deepEqual(await idLookup.json(), {...created, operation:{...created.operation, replayed:true}});

  // 2. Rejected collision recovery via by-key and by-id
  const rejectedBody = {...body, idempotency_key:`rejected-${code}`, chapter:{...body.chapter, name:'Rejected name'}};
  const rejectedResponse = await post(browser, provisioningPath, rejectedBody);
  assert.equal(rejectedResponse.status, 409);
  const rejectedOutcome = await rejectedResponse.json();
  const rejectedOpId = rejectedOutcome.operation.identity.operation_id;

  const rejectedKeyLookup = await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${rejectedBody.idempotency_key}`);
  assert.equal(rejectedKeyLookup.status, 200);
  assert.deepEqual(await rejectedKeyLookup.json(), {...rejectedOutcome, operation:{...rejectedOutcome.operation, replayed:true}});

  const rejectedIdLookup = await browser.request(`${lookupIdPath}/${rejectedOpId}`);
  assert.equal(rejectedIdLookup.status, 200);
  assert.deepEqual(await rejectedIdLookup.json(), {...rejectedOutcome, operation:{...rejectedOutcome.operation, replayed:true}});

  // 3. Absent key and unknown ID return uniform pending_or_not_visible uncertainty
  const absentKey = await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=never-used-key`);
  assert.equal(absentKey.status, 200);
  assert.deepEqual(await absentKey.json(), {
    resource_type: 'provisioning', action_result: 'uncertain',
    scope: {kind:'provisioner', organization_id:organization, provider_user_id:id},
    lookup_state: 'pending_or_not_visible', operation: null,
    message: 'Original outcome is not currently available.', next_action: 'lookup_original_attempt',
  });

  const unknownOpId = '01K8A6J0A00000000000000002';
  const absentId = await browser.request(`${lookupIdPath}/${unknownOpId}`);
  assert.equal(absentId.status, 200);
  assert.deepEqual(await absentId.json(), {
    resource_type: 'provisioning', action_result: 'uncertain',
    scope: {kind:'provisioner', organization_id:organization, provider_user_id:id},
    lookup_state: 'pending_or_not_visible', operation: null,
    message: 'Original outcome is not currently available.', next_action: 'lookup_original_attempt',
  });

  // 4. Cross-tenant attempt lookup returns uniform pending_or_not_visible uncertainty
  const other = await verifiedProvisioner('p05-lookup-other');
  const otherKeyLookup = await other.browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`);
  assert.equal(otherKeyLookup.status, 200);
  assert.deepEqual(await otherKeyLookup.json(), {
    resource_type: 'provisioning', action_result: 'uncertain',
    scope: {kind:'provisioner', organization_id:other.organization, provider_user_id:other.id},
    lookup_state: 'pending_or_not_visible', operation: null,
    message: 'Original outcome is not currently available.', next_action: 'lookup_original_attempt',
  });

  const otherIdLookup = await other.browser.request(`${lookupIdPath}/${operationId}`);
  assert.equal(otherIdLookup.status, 200);
  assert.deepEqual(await otherIdLookup.json(), {
    resource_type: 'provisioning', action_result: 'uncertain',
    scope: {kind:'provisioner', organization_id:other.organization, provider_user_id:other.id},
    lookup_state: 'pending_or_not_visible', operation: null,
    message: 'Original outcome is not currently available.', next_action: 'lookup_original_attempt',
  });

  // 5. Invalid selectors return 400 invalid_selector
  for (const bad of [
    `${lookupKeyPath}?idempotency_key=k`,
    `${lookupKeyPath}?action_code=invalid&idempotency_key=k`,
    `${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=k&organization_id=2`,
    `${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=k&operation_id=${operationId}`,
    `${lookupKeyPath}?action_code[]=provider.chapters.create&idempotency_key=k`,
    `${lookupIdPath}/${operationId}?organization_id=2`,
    `${lookupIdPath}/bad_ulid`,
  ]) {
    const res = await browser.request(bad);
    assert.equal(res.status, 400, `Bad selector: ${bad}`);
    assert.deepEqual(await res.json(), {code:'invalid_selector', message:'Use only the documented single-valued selectors.'});
  }

  // 6. X-Chapter-Context returns 403
  assert.equal((await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`, {headers:{'X-Chapter-Context':'forbidden'}})).status, 403);
  assert.equal((await browser.request(`${lookupIdPath}/${operationId}`, {headers:{'X-Chapter-Context':'forbidden'}})).status, 403);
});

test('ticket05 listProvisionings pages with bounded deterministic cursors and rejects stale snapshots', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-list-owner');

  // Create 3 chapters
  const c1 = await (await post(browser, provisioningPath, createChapterBody('LIST_A_' + Date.now()))).json();
  const c2 = await (await post(browser, provisioningPath, createChapterBody('LIST_B_' + Date.now()))).json();
  const c3 = await (await post(browser, provisioningPath, createChapterBody('LIST_C_' + Date.now()))).json();

  // Page 1 with limit=2
  const p1 = await browser.request(`${provisioningPath}?limit=2`);
  assert.equal(p1.status, 200);
  const p1Body = await p1.json();
  assert.equal(p1Body.limit, 2);
  assert.equal(p1Body.items.length, 2);
  assert.ok(p1Body.next_cursor);
  assert.match(p1Body.next_cursor, /^cur_[A-Za-z0-9_-]{32,96}$/);
  assert.ok(BigInt(p1Body.items[0].id) < BigInt(p1Body.items[1].id), 'IDs must be ordered ascending');
  assert.equal(p1Body.items[0].id, c1.provisioning.id);
  assert.equal(p1Body.items[1].id, c2.provisioning.id);

  // Page 2 with cursor
  const p2 = await browser.request(`${provisioningPath}?limit=2&cursor=${p1Body.next_cursor}`);
  assert.equal(p2.status, 200);
  const p2Body = await p2.json();
  assert.equal(p2Body.limit, 2);
  assert.equal(p2Body.items.length, 1);
  assert.equal(p2Body.items[0].id, c3.provisioning.id);
  assert.equal(p2Body.next_cursor, null);

  // Empty status filter
  const emptyFilter = await browser.request(`${provisioningPath}?status=initial_head_designated`);
  assert.equal(emptyFilter.status, 200);
  assert.deepEqual(await emptyFilter.json(), {items:[], limit:50, next_cursor:null});

  // Actor-private namespace: another provider does not see owner's provisionings
  const other = await verifiedProvisioner('p05-list-other');
  const otherList = await other.browser.request(provisioningPath);
  assert.equal(otherList.status, 200);
  const otherItems = (await otherList.json()).items;
  assert.ok(!otherItems.some(item => [c1.provisioning.id, c2.provisioning.id, c3.provisioning.id].includes(item.id)));

  // Invalid selectors return 400 invalid_selector
  for (const bad of [
    `${provisioningPath}?limit=0`,
    `${provisioningPath}?limit=101`,
    `${provisioningPath}?limit=abc`,
    `${provisioningPath}?status=invalid_status`,
    `${provisioningPath}?organization_id=2`,
    `${provisioningPath}?limit[]=2`,
    `${provisioningPath}?limit=2&cursor=cur_invalid_short`,
    `${provisioningPath}?limit=1&cursor=${p1Body.next_cursor}`, // Changed limit
    `${provisioningPath}?limit=2&status=awaiting_initial_head&cursor=${p1Body.next_cursor}`, // Changed status filter
  ]) {
    const res = await browser.request(bad);
    assert.equal(res.status, 400, `Bad list selector: ${bad}`);
    assert.deepEqual(await res.json(), {code:'invalid_selector', message:'Use only the documented single-valued selectors.'});
  }

  // Cross-tenant cursor use returns 400 invalid_selector
  const stolenCursor = await other.browser.request(`${provisioningPath}?limit=2&cursor=${p1Body.next_cursor}`);
  assert.equal(stolenCursor.status, 400);
  assert.deepEqual(await stolenCursor.json(), {code:'invalid_selector', message:'Use only the documented single-valued selectors.'});

  // Stale snapshot: new chapter created invalidates existing cursor
  await new Promise(r => setTimeout(r, 10)); // Ensure distinct created_at timestamp
  await post(browser, provisioningPath, createChapterBody('LIST_D_' + Date.now()));
  const stale = await browser.request(`${provisioningPath}?limit=2&cursor=${p1Body.next_cursor}`);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), {
    code: 'provisioning_snapshot_stale',
    message: 'Review the original attempt with current authority.',
    next_action: 'review_original_attempt',
  });

  // X-Chapter-Context returns 403
  assert.equal((await browser.request(provisioningPath, {headers:{'X-Chapter-Context':'forbidden'}})).status, 403);
});

test('ticket05 current provider revocation denies context, writes, reads, listings, and outcome lookups', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-revocation');
  const body = createChapterBody('REVOKE_' + Date.now());
  const created = await (await post(browser, provisioningPath, body)).json();
  const provisioningId = created.provisioning.id;
  const operationId = created.operation.identity.operation_id;

  // Active provider can read and list
  assert.equal((await browser.request(`${provisioningPath}/${provisioningId}`)).status, 200);
  assert.equal((await browser.request(provisioningPath)).status, 200);
  assert.equal((await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`)).status, 200);
  assert.equal((await browser.request(`${lookupIdPath}/${operationId}`)).status, 200);

  // Revoke the provider authority
  provisioningFixture('revoke', id);

  // All provider endpoints now return 403 forbidden
  assert.equal((await browser.request('/api/v1/provider/provisioning-context')).status, 403);
  assert.equal((await post(browser, provisioningPath, createChapterBody('REVOKED_' + Date.now()))).status, 403);
  assert.equal((await post(browser, provisioningPath, body)).status, 403); // Replay also forbidden
  assert.equal((await browser.request(provisioningPath)).status, 403);
  assert.equal((await browser.request(`${provisioningPath}/${provisioningId}`)).status, 403);
  assert.equal((await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`)).status, 403);
  assert.equal((await browser.request(`${lookupIdPath}/${operationId}`)).status, 403);

  // Database retains the original chapter and attempt unchanged
  assert.equal(provisioningFixture('attempt-count', id).count, 1);
  assert.equal(provisioningFixture('chapter-count', id).count, 1);
});

test('ticket05 after-commit failure recovery via key or ID lookup preserves durable chapter and original outcome', async () => {
  const {browser, id, organization} = await verifiedProvisioner('p05-lost-response');
  const body = createChapterBody('LOST_RESP_' + Date.now());

  // Successful commit
  const response = await post(browser, provisioningPath, body);
  assert.equal(response.status, 200);
  const original = await response.json();
  const operationId = original.operation.identity.operation_id;
  const provisioningId = original.provisioning.id;

  // Simulate lost response: client did not receive response, recovers by looking up via idempotency key
  const recoveredByKey = await browser.request(`${lookupKeyPath}?action_code=provider.chapters.create&idempotency_key=${body.idempotency_key}`);
  assert.equal(recoveredByKey.status, 200);
  const keyBody = await recoveredByKey.json();
  assert.equal(keyBody.action_result, 'success');
  assert.equal(keyBody.provisioning.id, provisioningId);
  assert.equal(keyBody.operation.identity.operation_id, operationId);
  assert.equal(keyBody.operation.replayed, true);

  // Client recovers by looking up via known operation ID
  const recoveredById = await browser.request(`${lookupIdPath}/${operationId}`);
  assert.equal(recoveredById.status, 200);
  const idBody = await recoveredById.json();
  assert.deepEqual(idBody, keyBody);

  // Client retries POST with the same key
  const replayed = await post(browser, provisioningPath, body);
  assert.equal(replayed.status, 200);
  assert.deepEqual(await replayed.json(), {...original, operation:{...original.operation, replayed:true}});

  // Exactly one chapter and one attempt exist
  assert.equal(provisioningFixture('attempt-count', id).count, 1);
  assert.equal(provisioningFixture('chapter-count', id).count, 1);
});

async function runIdentityCli(...args) {
  return measure('identity-cli', () => runIdentityCliMeasured(...args));
}

async function signedInBrowser(...args) {
  return measure('identity-signin-setup', () => signedInBrowserMeasured(...args));
}

async function preparedOfficer(...args) {
  return measure('mfa-prepare-setup', () => preparedOfficerMeasured(...args));
}

async function enrolledOfficer(...args) {
  return measure('mfa-enrolled-setup', () => enrolledOfficerMeasured(...args));
}

async function verifiedProvisioner(...args) { return measure('provider-authorization-setup', () => verifiedProvisionerMeasured(...args)); }

async function initialHeadScenario(...args) { return measure('initial-head-setup', () => initialHeadScenarioMeasured(...args)); }

test('verification tooling fixture failures exit nonzero without echoing input or SQL', () => {
  const sentinel = 'Synthetic-secret-that-must-not-appear';
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/chapter-context-state.php', 'membership', '1'],
  { encoding: 'utf8', input: `{"secret":"${sentinel}"` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Fixture failed: JsonException at chapter-context-state.php:[0-9]+/);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes(sentinel));
  assert.ok(!result.stderr.includes('SQL:'));
});

test('verification tooling timestamps retain a supported future instant and fail safely outside MySQL range', async () => {
  const { id } = await signedInBrowser('tooling-timestamp');
  const member = chapterFixture('membership', id, { duties: [] });
  const grant = chapterFixture('grant', id, { ...member, ends_at: '2037-01-01 00:00:00.000000' });
  assert.equal(grant.ends_at, '2037-01-01T00:00:00.000000Z');
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/chapter-context-state.php', 'grant', id], { encoding: 'utf8',
    input: JSON.stringify({ ...member, ends_at: '2099-01-01 00:00:00.000000' }) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Fixture failed: Illuminate\\Database\\QueryException/);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('SQL:'));
  assert.ok(!result.stderr.includes('2099'));
});

test('verification tooling synthetic identity setup returns exact independent IDs usable by HTTP sign-in', async () => {
  const huge = (10000000000000000000n + BigInt(Date.now()) * 1000000n).toString();
  const first = syntheticOfficer('tooling-identity-a', false, { id: huge });
  const second = syntheticOfficer('tooling-identity-b');
  assert.match(first.id, /^[1-9][0-9]{19}$/);
  assert.equal(typeof first.id, 'string');
  assert.equal(first.id, huge);
  assert.notEqual(first.id, second.id);
  const browser = new Browser();
  await browser.request('/csrf-cookie');
  const response = await post(browser, '/api/v1/session/sign-in', { email: first.email, password: first.password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, 'authenticated');
  assert.equal((await (await browser.request(contextPath)).json()).chapter_state, 'no_authorized_memberships');
});

test('verification tooling batched provider arrangements are independent and require real MFA', async () => {
  const first = syntheticOfficer('tooling-provider-a', true);
  const second = syntheticOfficer('tooling-provider-b', true);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.organization, second.organization);
  assert.notEqual(first.id, first.approver);
  assert.equal(provisioningFixture('installed', first.id).one_approved_installation, true);
  assert.equal(provisioningFixture('installed', first.id).no_chapter_authority, true);
  const { browser } = await signedInBrowser('tooling-provider', first);
  assert.equal((await (await browser.request('/api/v1/session')).json()).state, 'mfa_enrollment_required');
  assert.equal((await browser.request('/api/v1/provider/provisioning-context')).status, 403);
});
