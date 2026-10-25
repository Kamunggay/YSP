import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const readJson = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));

test('SEC-01/TR-16: enrollment preparation and confirmation are distinct validated HTTP exchanges', async () => {
  assert.equal(api.paths['/session/mfa/enrollment']?.post.operationId, 'prepareAuthenticatorEnrollment');
  assert.equal(api.paths['/session/mfa/enrollment/confirm']?.post.operationId, 'confirmAuthenticatorEnrollment');
  const exchanges = await readJson('enrollment-exchanges');
  for (const exchange of exchanges) validateExchange(api, ajv, exchange);
  const named = Object.fromEntries(exchanges.map(e => [e.name, e]));
  const predecessor = named['enrollment-begin'].response.body.enrollment;
  const replacement = named['enrollment-replace'].response.body.enrollment;
  assert.equal(named['enrollment-replace'].request.body.enrollment_id, predecessor.id);
  assert.notEqual(replacement.id, predecessor.id);
  assert.notEqual(replacement.manual_key, predecessor.manual_key);
  assert.equal(named['confirmAuthenticatorEnrollment-stale'].request.body.enrollment_id, predecessor.id);
  assert.equal(named['confirmAuthenticatorEnrollment-stale'].response.status, 409);
  assert.equal(named['enrollment-confirm-live'].request.body.enrollment_id, replacement.id);
  for (const id of ['prepareAuthenticatorEnrollment', 'confirmAuthenticatorEnrollment']) {
    const operation = Object.values(api.paths).map(p => p.post).find(p => p?.operationId === id);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)),
      new Set(Object.keys(operation.responses).map(Number)));
    assert.deepEqual(operation.security, [{ chapterSession: [], csrfToken: [] }]);
  }
});

test('SEC-03/TR-18: secrets and client authority cannot cross enrollment response boundaries', async () => {
  const exchanges = await readJson('enrollment-exchanges');
  const begin = exchanges.find(e => e.name === 'enrollment-begin');
  const confirm = exchanges.find(e => e.name === 'enrollment-confirm-live');
  const reject = (example, change) => {
    const invalid = structuredClone(example); change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  };
  for (const field of ['user_id', 'actor', 'verified', 'approved', 'permissions', 'recovery_code']) {
    for (const e of [begin, confirm]) reject(e, v => { v.request.body[field] = true; });
  }
  for (const id of [123, 'enr_short', 'enr_' + 'a'.repeat(97), '01ARZ3NDEKTSV4RRFFQ69G5FAV']) {
    reject(confirm, v => { v.request.body.enrollment_id = id; });
  }
  for (const proof of [123456, '12345', '1234567', 'DEMO-CODE-0001-AAAA']) {
    reject(confirm, v => { v.request.body.authenticator_code = proof; });
  }
  reject(begin, v => { v.request.body = { intent: 'replace_unconfirmed' }; });
  reject(begin, v => { v.request.body.enrollment_id = confirm.request.body.enrollment_id; });
  reject(begin, v => { v.response.body.recovery_codes = confirm.response.body.recovery_codes; });
  reject(begin, v => { v.response.body.enrollment.expires_at = '2026-02-30T00:00:00.000000Z'; });
  reject(confirm, v => { v.response.body.session.mfa = { status: 'not_required' }; });
  reject(confirm, v => { v.response.body.session = { state: 'mfa_enrollment_required' }; });
  reject(confirm, v => { v.response.body.recovery_codes.codes.push(v.response.body.recovery_codes.codes[0]); });
  reject(confirm, v => { v.response.body.recovery_codes.readback_url = '/codes'; });
  reject(confirm, v => { delete v.response.headers['set-cookie']; });
  for (const e of exchanges) {
    reject(e, v => { v.response.headers['cache-control'] = 'public'; });
    for (const field of ['setup_uri', 'manual_key', 'authenticator_code', 'recovery_codes']) {
      if (e.response.status !== 200) reject(e, v => { v.response.body[field] = 'secret'; });
    }
  }
  const session = ajv.compile(api.components.schemas.SessionSnapshot);
  for (const state of ['signed_out', 'mfa_enrollment_required', 'mfa_challenge_required']) {
    for (const field of ['setup_uri', 'manual_key', 'enrollment', 'recovery_codes']) {
      assert.equal(session({ state, [field]: 'secret' }), false);
    }
  }
  for (const field of ['setup_uri', 'manual_key', 'enrollment', 'recovery_codes']) {
    assert.equal(session({ ...confirm.response.body.session, [field]: 'secret' }), false);
  }
});

test('TR-03/UX-03: every enrollment exchange uses the generated consumer once with CSRF and no-store', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  for (const example of await readJson('enrollment-exchanges')) {
    let calls = 0;
    const result = await exchangeSession(example.operationId, {
      origin: example.browser.origin, cookie: example.response.status === 419 ? '' : example.browser.cookie,
      signal: new AbortController().signal, body: example.request.body,
      fetch: async (url, init) => {
        calls++;
        assert.equal(url.href, example.browser.origin + '/api/v1' + example.path);
        assert.equal(init.method, 'POST');
        assert.equal(init.credentials, 'include');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.redirect, 'error');
        assert.equal(init.headers.get('X-XSRF-TOKEN'), example.request.header?.['X-XSRF-TOKEN'] ?? null);
        assert.equal(init.body, JSON.stringify(example.request.body));
        return new Response(JSON.stringify(example.response.body), {
          status: example.response.status, headers: { ...example.response.headers, 'Content-Type': 'application/json' },
        });
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { kind: 'response', status: example.response.status, body: example.response.body,
      ...(example.response.status === 429 ? { retryAfter: '30' } : {}) }, example.name);
  }
});

test('SEC-01/DOC-11: declarative server scenarios reference validated exchanges without claiming enforcement', async () => {
  const scenarios = await readJson('enrollment-scenarios');
  const all = new Map((await Promise.all(['session-exchanges', 'enrollment-exchanges', 'operation-examples'].map(readJson))).flat().map(e => [e.name, e]));
  for (const scenario of scenarios) {
    assert.equal(scenario.verification, 'declarative_server_review');
    assert.ok(scenario.precondition && scenario.obligation && scenario.requirements.length);
    for (const name of scenario.exchanges) {
      assert.ok(all.has(name), name);
      validateExchange(api, ajv, all.get(name));
    }
  }
  for (const id of ['replacement', 'invalid-proof', 'expired-proof', 'expired-enrollment', 'wrong-session', 'stale-enrollment', 'throttled', 'pending-access', 'lost-confirmation']) {
    assert.ok(scenarios.some(s => s.id === id), id);
  }
  const lost = scenarios.find(s => s.id === 'lost-confirmation');
  assert.equal(lost.follow_on_ticket, '.scratch/p02-shared-openapi/issues/04-mfa-challenges-and-recovery.md');
  assert.deepEqual(lost.automatic_mutation_retries, []);
});

test('UX-03/TR-18: lost or malformed confirmation is followed only by an explicit bootstrap, never code readback', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const confirm = (await readJson('enrollment-exchanges')).find(e => e.name === 'enrollment-confirm-live');
  const sessionExamples = await readJson('session-exchanges');
  for (const respond of [
    () => { throw new TypeError('Lost response after possible server commit'); },
    () => new Response('{', { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } }),
    () => new Response('<html>Sign in</html>', { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/html' } }),
  ]) {
    for (const name of ['bootstrap-approver', 'bootstrap-enrollment', 'bootstrap-challenge', 'bootstrap-signed-out']) {
      const calls = [];
      const common = { origin: confirm.browser.origin, cookie: confirm.browser.cookie, signal: new AbortController().signal };
      const result = await exchangeSession('confirmAuthenticatorEnrollment', { ...common, body: confirm.request.body,
        fetch: async url => { calls.push(url.pathname); return respond(); } });
      assert.equal(result.kind, 'unresolved');
      assert.deepEqual(calls, ['/api/v1/session/mfa/enrollment/confirm']);
      const example = sessionExamples.find(e => e.name === name);
      const bootstrap = await exchangeSession('getSession', { ...common,
        fetch: async url => { calls.push(url.pathname); return new Response(JSON.stringify(example.response.body), {
          status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
        }); } });
      assert.equal(bootstrap.kind, 'response');
      assert.deepEqual(bootstrap.body, example.response.body);
      assert.equal(Object.hasOwn(bootstrap.body, 'recovery_codes'), false);
      assert.deepEqual(calls, ['/api/v1/session/mfa/enrollment/confirm', '/api/v1/session']);
      // Bootstrap reports current state; it cannot resolve whether lost plaintext codes were seen.
      assert.equal(result.kind, 'unresolved');
    }
  }
});
