import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const readJson = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));

test('SEC-01/TR-16: one challenge operation accepts exactly one matching factor proof', async () => {
  assert.equal(api.paths['/session/mfa/challenge/verify']?.post.operationId, 'verifyMfaChallenge');
  const exchanges = await readJson('mfa-recovery-exchanges');
  for (const exchange of exchanges) validateExchange(api, ajv, exchange);
  const otp = exchanges.find(e => e.name === 'challenge-authenticator');
  const recovery = exchanges.find(e => e.name === 'challenge-recovery');
  const reject = change => {
    const invalid = structuredClone(otp); change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  };
  reject(v => { v.request.body.recovery_code = recovery.request.body.recovery_code; });
  reject(v => { v.request.body.method = 'recovery_code'; });
  reject(v => { delete v.request.body.authenticator_code; });
  for (const field of ['user_id', 'actor', 'approved', 'verified', 'permissions']) {
    reject(v => { v.request.body[field] = true; });
  }
  for (const id of [123, 'chl_short', 'chl_' + 'a'.repeat(97), 'enr_' + 'a'.repeat(32)]) {
    reject(v => { v.request.body.challenge_id = id; });
  }
  for (const proof of [123456, '12345', '1234567', '123456\n']) {
    reject(v => { v.request.body.authenticator_code = proof; });
  }
  const bootstrap = (await readJson('session-exchanges')).find(e => e.name === 'bootstrap-challenge');
  assert.equal(bootstrap.response.body.challenge.id, otp.request.body.challenge_id);
  assert.deepEqual(otp.response.body.mfa, recovery.response.body.mfa);
  assert.equal(otp.response.body.mfa.status, 'verified');
  reject(v => { v.response.body.mfa = { status: 'not_required' }; });
  reject(v => { delete v.response.headers['set-cookie']; });
});

test('SEC-01/DOC-11: MFA scenario obligations link actual exchanges and distinguish future security execution', async () => {
  const scenarios = await readJson('mfa-recovery-scenarios');
  const all = new Map((await Promise.all(['session-exchanges', 'enrollment-exchanges', 'mfa-recovery-exchanges', 'operation-examples'].map(readJson))).flat().map(e => [e.name, e]));
  for (const s of scenarios) {
    assert.equal(s.verification, 'declarative_server_review');
    assert.ok(s.precondition && s.obligation && s.limitations && s.requirements.length);
    for (const name of s.exchanges) {
      assert.ok(all.has(name), name);
      validateExchange(api, ajv, all.get(name));
    }
  }
  for (const id of ['authenticator', 'single-use-recovery', 'consumed-code-reuse', 'wrong-session', 'stale-challenge', 'expired-challenge', 'invalid-proof', 'throttled', 'restricted-access', 'regeneration', 'stale-recent-proof', 'authority-reevaluation', 'protected-storage', 'unknown-challenge', 'lost-code-issuance', 'both-factors-lost']) {
    assert.ok(scenarios.some(s => s.id === id), id);
  }
  for (const id of ['unknown-challenge', 'lost-code-issuance']) {
    assert.deepEqual(scenarios.find(s => s.id === id).automatic_mutation_retries, []);
  }
  const recovery = all.get('challenge-recovery');
  const reuse = all.get('challenge-consumed-code');
  assert.equal(reuse.request.body.recovery_code, recovery.request.body.recovery_code);
  assert.notEqual(reuse.request.body.challenge_id, recovery.request.body.challenge_id, 'reuse is rejected on a fresh challenge, not merely an already consumed challenge');
  const initial = all.get('enrollment-confirm-live').response.body.recovery_codes.codes;
  const replacement = all.get('recovery-regenerated').response.body.recovery_codes.codes;
  assert.equal(replacement.some(code => initial.includes(code)), false);
});

test('DOC-11/UX-03: unknown challenge, confirmation or code issuance uses bootstrap without automatic mutation or readback', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const all = [...await readJson('enrollment-exchanges'), ...await readJson('mfa-recovery-exchanges')];
  const sessions = await readJson('session-exchanges');
  for (const name of ['challenge-authenticator', 'challenge-recovery', 'enrollment-confirm-live', 'recovery-regenerated']) {
    const mutation = all.find(e => e.name === name);
    for (const respond of [
      () => { throw new TypeError('Lost response after possible commit'); },
      () => new Response('{', { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } }),
    ]) {
      for (const state of ['bootstrap-approver', 'bootstrap-challenge', 'bootstrap-enrollment', 'bootstrap-signed-out']) {
        const calls = [];
        const common = { origin: mutation.browser.origin, cookie: mutation.browser.cookie, signal: new AbortController().signal };
        const result = await exchangeSession(mutation.operationId, { ...common, body: mutation.request.body,
          fetch: async url => { calls.push(url.pathname); return respond(); } });
        assert.equal(result.kind, 'unresolved');
        assert.deepEqual(calls, ['/api/v1' + mutation.path]);
        const session = sessions.find(e => e.name === state);
        const bootstrap = await exchangeSession('getSession', { ...common, fetch: async url => {
          calls.push(url.pathname);
          return new Response(JSON.stringify(session.response.body), { status: 200,
            headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } });
        } });
        assert.deepEqual(bootstrap, { kind: 'response', status: 200, body: session.response.body });
        assert.deepEqual(calls, ['/api/v1' + mutation.path, '/api/v1/session']);
        assert.equal(Object.hasOwn(bootstrap.body, 'recovery_codes'), false);
        assert.equal(result.kind, 'unresolved', 'current state never proves lost code delivery');
      }
    }
  }
});

test('TR-03/UX-03: generated consumer preserves each MFA status, CSRF and single-attempt behavior', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  for (const e of await readJson('mfa-recovery-exchanges')) {
    let calls = 0;
    const result = await exchangeSession(e.operationId, {
      origin: e.browser.origin, cookie: e.browser.cookie, signal: new AbortController().signal,
      ...(e.request.body ? { body: e.request.body } : {}),
      fetch: async (url, init) => {
        calls++;
        assert.equal(url.href, e.browser.origin + '/api/v1' + e.path);
        assert.equal(init.method, e.method.toUpperCase());
        assert.equal(init.credentials, 'include');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.redirect, 'error');
        assert.equal(init.headers.get('X-XSRF-TOKEN'), e.request.header?.['X-XSRF-TOKEN'] ?? null);
        assert.equal(init.body, e.request.body ? JSON.stringify(e.request.body) : undefined);
        return new Response(JSON.stringify(e.response.body), { status: e.response.status,
          headers: { ...e.response.headers, 'Content-Type': 'application/json' } });
      },
    });
    assert.equal(calls, 1, e.name);
    assert.deepEqual(result, { kind: 'response', status: e.response.status, body: e.response.body,
      ...(e.response.status === 429 ? { retryAfter: '30' } : {}) }, e.name);
  }
});

test('TR-16/TR-18: recovery maintenance requires both fresh proofs and has one closed issuance response', async () => {
  assert.equal(api.paths['/session/mfa/recovery-codes/regenerate']?.post.operationId, 'regenerateRecoveryCodes');
  assert.equal(api.paths['/session/mfa/assisted-recovery']?.get.operationId, 'getAssistedRecoveryGuidance');
  const exchanges = await readJson('mfa-recovery-exchanges');
  const issuance = exchanges.find(e => e.name === 'recovery-regenerated');
  const reject = (example, change) => {
    const invalid = structuredClone(example); change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  };
  for (const field of ['password', 'authenticator_code']) reject(issuance, v => { delete v.request.body[field]; });
  for (const field of ['recovery_code', 'user_id', 'recent_proof_at', 'verified']) {
    reject(issuance, v => { v.request.body[field] = 'caller-controlled'; });
  }
  reject(issuance, v => { delete v.response.headers['set-cookie']; });
  reject(issuance, v => { v.response.body.recovery_codes.codes.push(v.response.body.recovery_codes.codes[0]); });
  const bootstrap = (await readJson('session-exchanges')).find(e => e.name === 'bootstrap-approver');
  for (const e of [...exchanges, bootstrap]) {
    validateExchange(api, ajv, e);
    reject(e, v => { v.response.headers['cache-control'] = 'public'; });
    for (const field of ['password', 'authenticator_code', 'setup_uri', 'manual_key', 'recovery_code']) {
      reject(e, v => { v.response.body[field] = 'secret'; });
    }
    if (e.name !== 'recovery-regenerated') {
      reject(e, v => { v.response.body.recovery_codes = issuance.response.body.recovery_codes; });
    }
  }
  const guidance = exchanges.find(e => e.name === 'assisted-recovery-blocked');
  assert.equal(guidance.response.body.availability, 'unavailable');
  assert.deepEqual(guidance.response.body.next_actions, ['bootstrap_session', 'sign_out']);
  for (const field of ['contact', 'upload_url', 'reset_token', 'ticket_id', 'notification']) {
    reject(guidance, v => { v.response.body[field] = 'invented'; });
  }
  reject(guidance, v => { v.response.body.next_actions.push('request_reset'); });
  for (const id of ['verifyMfaChallenge', 'regenerateRecoveryCodes', 'getAssistedRecoveryGuidance']) {
    const operation = Object.values(api.paths).flatMap(p => [p.post, p.get]).find(p => p?.operationId === id);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)),
      new Set(Object.keys(operation.responses).map(Number)));
    assert.deepEqual(operation.security, id === 'getAssistedRecoveryGuidance'
      ? [{ chapterSession: [] }] : [{ chapterSession: [], csrfToken: [] }]);
  }
});
