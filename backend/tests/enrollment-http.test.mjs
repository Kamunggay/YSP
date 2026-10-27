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

test('officer confirms authenticator once, rotates credentials and bootstraps without secret readback', async () => {
  const { browser, prepared } = await preparedOfficer('enroll');
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
});

function storageProbe(action, id, input = {}) {
  const result = spawnSync('docker', ['exec', '-i', '-e', 'YSP_SESSION_FIXTURES=1', container,
    'php', 'tests/fixtures/enrollment-state.php', action, id], { encoding: 'utf8', input: JSON.stringify(input) });
  assert.equal(result.status, 0, result.stderr);
  const assertions = JSON.parse(result.stdout);
  for (const [name, passed] of Object.entries(assertions)) assert.equal(passed, true, name);
}

test('overlapping MySQL confirmations issue exactly one encrypted factor and one recovery set', async t => {
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

test('five rejected proofs exhaust the enrollment and replacement cannot reset the budget', async () => {
  const { browser, prepared: { enrollment } } = await preparedOfficer('attempts');
  const valid = authenticatorCode(enrollment.manual_key);
  const wrong = valid === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++) {
    const response = await post(browser, enrollmentPath + '/confirm', { enrollment_id: enrollment.id, authenticator_code: wrong });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'invalid_authenticator_proof');
  }
  const exhausted = await post(browser, enrollmentPath + '/confirm', { enrollment_id: enrollment.id, authenticator_code: valid });
  assert.equal(exhausted.status, 429);
  assert.match(exhausted.headers.get('retry-after'), /^[1-9][0-9]*$/);
  const replace = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(replace.status, 429);
  assert.deepEqual(await (await browser.request('/api/v1/session')).json(), { state: 'mfa_enrollment_required' });
});

test('only a live session-bound enrollment can be replaced or confirmed, and expiry needs a reviewed begin', async () => {
  const { browser, id, email, password, prepared: { enrollment } } = await preparedOfficer('binding');
  const otherSession = new Browser();
  await otherSession.request('/csrf-cookie');
  assert.equal((await post(otherSession, '/api/v1/session/sign-in', { email, password })).status, 200);
  const proof = { enrollment_id: enrollment.id, authenticator_code: authenticatorCode(enrollment.manual_key) };
  assert.equal((await post(otherSession, enrollmentPath + '/confirm', proof)).status, 409);
  assert.equal((await post(otherSession, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id })).status, 409);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 409);
  const replacement = await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: enrollment.id });
  assert.equal(replacement.status, 200);
  const next = (await replacement.json()).enrollment;
  assert.notEqual(next.id, enrollment.id);
  assert.notEqual(next.manual_key, enrollment.manual_key);
  assert.equal((await post(browser, enrollmentPath + '/confirm', proof)).status, 409);
  storageProbe('expire', id);
  assert.equal((await post(browser, enrollmentPath + '/confirm', { enrollment_id: next.id,
    authenticator_code: authenticatorCode(next.manual_key) })).status, 409);
  assert.equal((await post(browser, enrollmentPath, { intent: 'replace_unconfirmed', enrollment_id: next.id })).status, 409);
  assert.equal((await post(browser, enrollmentPath, { intent: 'begin' })).status, 200);
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
  function fault(sql) {
    const result = spawnSync('docker', ['exec', '-i', process.env.YSP_TEST_MYSQL_CONTAINER, 'sh', '-c',
      'MYSQL_PWD="$(cat /run/secrets/db_root_password)" mysql -uroot ysp_local'], { encoding: 'utf8', input: sql });
    assert.equal(result.status, 0, result.stderr);
  }
  fault(`DELIMITER //
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
    fault('DROP TRIGGER IF EXISTS enrollment_test_reject_issuance;');
  }
  assert.equal((await post(browser, enrollmentPath + '/confirm', {
    ...proof, authenticator_code: authenticatorCode(enrollment.manual_key),
  })).status, 200);
});
