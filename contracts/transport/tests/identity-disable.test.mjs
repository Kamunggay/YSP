import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const read = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
const operations = ['disableGlobalIdentity', 'lookupIdentityDisableByKey', 'lookupIdentityDisableById'];

test('SEC-02/SEC-03: global disable and result lookup expose only unavailable or safe denial', async () => {
  const exchanges = await read('identity-disable-exchanges');
  for (const id of operations) {
    const op = Object.values(api.paths).flatMap(p => [p.get, p.post]).find(o => o?.operationId === id);
    assert.ok(op, id);
    assert.equal(op['x-enabled-boundary'], false);
    assert.ok(Object.keys(op.responses).every(status => Number(status) >= 400));
    assert.deepEqual(op.security, [{ identitySession: [], ...(id === 'disableGlobalIdentity' ? { csrfToken: [] } : {}) }]);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)), new Set(Object.keys(op.responses).map(Number)));
  }
  for (const e of exchanges) validateExchange(api, ajv, e);
});

test('SEC-03/TR-06: global identity scope and protected results cannot be injected', async () => {
  const exchanges = await read('identity-disable-exchanges');
  const reject = (name, change) => {
    const e = structuredClone(exchanges.find(e => e.name === name));
    change(e);
    assert.throws(() => validateExchange(api, ajv, e), name);
  };
  for (const field of ['chapter_id', 'organization_id', 'provider_user_id', 'actor_user_id', 'scope', 'fingerprint', 'approved']) {
    reject('disableGlobalIdentity-503', e => { e.request.body[field] = '1'; });
    reject('lookupIdentityDisableByKey-503', e => { e.request.query[field] = '1'; });
  }
  for (const id of [1, '01', '18446744073709551616']) reject('disableGlobalIdentity-503', e => { e.request.body.identity.user_id = id; });
  for (const version of [0, '7', 1.5, 4294967296]) reject('disableGlobalIdentity-503', e => { e.request.body.expected_identity_version = version; });
  reject('disableGlobalIdentity-503', e => { e.request.body.identity.display_name = 'Caller label'; });
  reject('disableGlobalIdentity-503', e => { e.request.body.reason = 'x'.repeat(501); });
  for (const e of exchanges) {
    for (const field of ['identity', 'scope', 'operation', 'chapter_id', 'provider', 'record', 'status']) {
      reject(e.name, changed => { changed.response.body[field] = 'protected'; });
    }
  }
  for (const id of operations) {
    const name = id + '-503';
    reject(name, e => { e.request.header = { ...e.request.header, 'X-Chapter-Context': 'ctx_synthetic' }; });
    reject(name, e => { e.response.status = 200; });
    reject(name, e => { e.response.headers['cache-control'] = 'public'; });
  }
  for (const query of [
    { idempotency_key: 'global-disable-attempt-01' },
    { action_code: 'memberships.disable', idempotency_key: 'global-disable-attempt-01' },
    { action_code: ['identity.disable'], idempotency_key: 'global-disable-attempt-01' },
    { action_code: 'identity.disable', idempotency_key: 'global-disable-attempt-01', operation_id: '01K8A6J0A00000000000000001' },
  ]) reject('lookupIdentityDisableByKey-503', e => { e.request.query = query; });
  reject('lookupIdentityDisableById-503', e => { e.request.query = { action_code: 'identity.disable' }; });
  reject('disableGlobalIdentity-503', e => { delete e.request.header['X-XSRF-TOKEN']; });
});

test('DOC-11: strict unavailable consumer preserves uncertainty after new denial or transport loss', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const { identityDisableFeedback } = await import('../consumer/identity-disable.ts');
  const exchanges = await read('identity-disable-exchanges');
  for (const e of exchanges) {
    let calls = 0;
    const reply = await exchangeSession(e.operationId, {
      origin: 'https://ysp.example.test', cookie: 'XSRF-TOKEN=synthetic-token', signal: new AbortController().signal,
      path: e.request.path, query: e.request.query, body: e.request.body,
      fetch: async (url, init) => {
        calls++;
        let path = '/api/v1' + e.path;
        for (const [k, v] of Object.entries(e.request.path ?? {})) path = path.replace(`{${k}}`, v);
        assert.equal(url.pathname, path);
        assert.equal(init.credentials, 'include');
        assert.equal(init.redirect, 'error');
        assert.equal(init.headers.get('X-Chapter-Context'), null);
        if (e.method === 'post') assert.equal(init.headers.get('X-XSRF-TOKEN'), 'synthetic-token');
        assert.deepEqual(Object.fromEntries(url.searchParams), Object.fromEntries(Object.entries(e.request.query ?? {}).map(([k,v]) => [k,String(v)])));
        return new Response(JSON.stringify(e.response.body), { status: e.response.status, headers: { ...e.response.headers, 'Content-Type': 'application/json' } });
      },
    });
    assert.equal(calls, 1, e.name);
    assert.equal(reply.kind, 'response', e.name);
    assert.deepEqual(reply.body, e.response.body, e.name);
    assert.equal(identityDisableFeedback(reply).original_outcome, 'uncertain', e.name);
    if (e.response.status === 401) assert.equal(identityDisableFeedback(reply).next_action, 'sign_in');
    if (e.response.status === 403) assert.equal(identityDisableFeedback(reply).next_action, 'forbidden');
    if (e.response.status === 503) assert.equal(identityDisableFeedback(reply).next_action, 'unavailable');
  }
  const request = exchanges.find(e => e.name === 'disableGlobalIdentity-503').request;
  for (const respond of [
    () => { throw new TypeError('lost response'); },
    () => new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }),
    () => new Response('', { status: 302, headers: { Location: '/session' } }),
    () => new Response('{"action_result":"success"}', { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }),
  ]) {
    let calls = 0;
    const reply = await exchangeSession('disableGlobalIdentity', {
      origin: 'https://ysp.example.test', cookie: 'XSRF-TOKEN=synthetic-token', signal: new AbortController().signal, body: request.body,
      fetch: async () => { calls++; return respond(); },
    });
    assert.equal(calls, 1);
    assert.equal(reply.kind, 'unresolved');
    assert.deepEqual(identityDisableFeedback(reply), { original_outcome: 'uncertain', next_action: 'retain_original_attempt' });
  }
});

test('AC-19/TR-16: global revocation and durable results remain explicit future server obligations', async () => {
  const exchanges = await read('identity-disable-exchanges');
  const scenarios = await read('identity-disable-scenarios');
  for (const id of ['unavailable-boundary', 'chapter-head-only-denial', 'provider-only-denial', 'mfa-and-csrf', 'session-interruption', 'redacted-uncertain-lookup', 'exact-target-and-feedback', 'global-revocation-future-gate', 'queued-protected-delivery-future-gate', 'durable-global-result-future-gate', 'rate-limit-no-retry']) {
    assert.ok(scenarios.some(s => s.id === id), id);
  }
  for (const s of scenarios) {
    assert.equal(s.verification, 'declarative_server_review');
    assert.ok(s.precondition && s.obligation && s.limitations && s.requirements.length);
    assert.deepEqual(s.automatic_mutation_retries, []);
    for (const name of s.exchanges) assert.ok(exchanges.some(e => e.name === name), name);
  }
  const get = name => exchanges.find(e => e.name === name).response.body;
  for (const name of ['chapter-head-only-denied', 'provisioner-only-denied', 'recovery-operator-only-denied', 'mfa-incomplete-denied']) assert.deepEqual(get(name), get('disableGlobalIdentity-403'));
  assert.deepEqual(get('unknown-target-unavailable'), get('disableGlobalIdentity-503'));
  for (const name of ['expired-session', 'revoked-session', 'disabled-session']) assert.deepEqual(get(name), get('disableGlobalIdentity-401'));
  const invalid = exchanges.find(e => e.name === 'disableGlobalIdentity-422');
  assert.equal(invalid.response.body.field_feedback[0].path, '/identity/user_id');
  assert.equal(invalid.request.body.identity.user_id, 1);
  const catalogue = await read('p02-action-catalogue');
  const action = catalogue.actions.find(row => row.action === 'identity.disable');
  assert.equal(action.enabled_boundary, false);
  assert.deepEqual(action.chapter_duties, []);
  assert.deepEqual(action.provider_authorities, []);
  const contract = api['x-global-identity-disable-contract'];
  assert.equal(contract.enabled_boundary, false);
  assert.equal(contract.future_result_interface.enabled, false);
  assert.deepEqual(contract.inventory.success_responses, []);
  assert.ok(contract.runtime_enablement_decisions.every(g => g.required_approval && g.decision));
});
