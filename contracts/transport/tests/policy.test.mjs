import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const read = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
const operations = ['readPolicyStatus', 'listPolicyRoots', 'readPolicyRoot', 'listPolicyVersions', 'readPolicyVersion', 'savePolicyDraft', 'submitPolicyVersion', 'reviewPolicyVersion', 'approvePolicyVersion', 'returnPolicyVersion'];

test('GOV-08/GOV-09: minimum policy HTTP interfaces validate every declared outcome', async () => {
  const exchanges = await read('policy-exchanges');
  for (const id of operations) {
    const op = Object.values(api.paths).flatMap(p => [p.get, p.post]).find(o => o?.operationId === id);
    assert.ok(op, id);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)), new Set(Object.keys(op.responses).map(Number)), id);
    assert.deepEqual(op.security, [{ chapterSession: [], ...(op.requestBody ? { csrfToken: [] } : {}) }]);
  }
  for (const e of exchanges) validateExchange(api, ajv, e);
});

test('SEC-03/TR-06: policy writes cannot smuggle settings, actor authority or ambiguous versions', async () => {
  const exchanges = await read('policy-exchanges');
  const original = exchanges.find(e => e.name === 'approvePolicyVersion-success');
  const reject = change => { const e = structuredClone(original); change(e); assert.throws(() => validateExchange(api, ajv, e)); };
  for (const f of ['expected_row_version', 'expected_material_version', 'expected_authority_version', 'material', 'reason']) reject(e => { delete e.request.body[f]; });
  for (const f of ['settings', 'approved', 'actor', 'expected_version', 'responsible_duty']) reject(e => { e.request.body[f] = {}; });
  reject(e => { delete e.request.header['X-Chapter-Context']; });
  reject(e => { e.request.body.material.record.kind = 'RF'; });
  reject(e => { e.request.body.material.material_hash = 'placeholder'; });
  reject(e => { e.request.body.expected_material_version = '3'; });
  reject(e => { e.response.body.version.material = null; });
  reject(e => { e.response.body.version.schema_support = 'unsupported'; });
  reject(e => { e.response.body.version.approved_policy = null; });
  reject(e => { e.response.body.version.decisions = []; });
  reject(e => { e.response.body.root.responsible_duty = 'FINANCE'; });
  reject(e => { e.response.body.version.settings = {}; });
  reject(e => { e.response.body.version.metadata.effective_from = '2026-02-30T00:00:00.000000Z'; });
  const draft = structuredClone(exchanges.find(e => e.name === 'savePolicyDraft-success'));
  draft.request.body.metadata.settings = {};
  assert.throws(() => validateExchange(api, ajv, draft));
  const status = structuredClone(exchanges.find(e => e.name === 'readPolicyStatus-success'));
  for (const field of ['financial_values', 'material', 'actor', 'ready_for_live']) {
    const e = structuredClone(status); e.response.body[field] = {}; assert.throws(() => validateExchange(api, ajv, e));
  }
  status.response.body.blockers[0].permitted_next_steps = ['approve_without_authority'];
  assert.throws(() => validateExchange(api, ajv, status));
  const page = exchanges.find(e => e.name === 'listPolicyRoots-success');
  for (const limit of [0, 101, '1']) { const e = structuredClone(page); e.request.query = { limit }; assert.throws(() => validateExchange(api, ajv, e)); }
});

test('DOC-11/TR-12: policy consumer preserves scope, immutable replay and uncertain results', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const { policyCommitMatches, policyLookupOutcome } = await import('../consumer/policy.ts');
  const exchanges = await read('policy-exchanges');
  const get = name => structuredClone(exchanges.find(e => e.name === name));
  for (const e of exchanges) {
    let calls = 0;
    const result = await exchangeSession(e.operationId, {
      origin: 'https://ysp.example.test', cookie: 'XSRF-TOKEN=synthetic-token', signal: new AbortController().signal,
      path: e.request.path, query: e.request.query, body: e.request.body, contextRevision: e.request.header?.['X-Chapter-Context'],
      fetch: async (url, init) => {
        calls++;
        let path = '/api/v1' + e.path;
        for (const [k, v] of Object.entries(e.request.path)) path = path.replace(`{${k}}`, v);
        assert.equal(url.pathname, path); assert.equal(init.credentials, 'include'); assert.equal(init.redirect, 'error');
        assert.equal(init.headers.get('X-Chapter-Context'), e.request.header?.['X-Chapter-Context'] ?? null);
        assert.deepEqual(Object.fromEntries(url.searchParams), Object.fromEntries(Object.entries(e.request.query ?? {}).map(([k,v]) => [k,String(v)])));
        return new Response(JSON.stringify(e.response.body), { status: e.response.status, headers: { ...e.response.headers, 'Content-Type': 'application/json' } });
      },
    });
    assert.equal(calls, 1, e.name); assert.equal(result.kind, 'response', e.name); assert.deepEqual(result.body, e.response.body, e.name);
  }
  for (const id of ['savePolicyDraft', 'submitPolicyVersion', 'reviewPolicyVersion', 'approvePolicyVersion', 'returnPolicyVersion']) {
    const a = get(id+'-success').response.body, b = get(id+'-replay').response.body;
    assert.equal(b.operation.replayed, true); b.operation.replayed = false; assert.deepEqual(a,b);
  }
  for (const e of exchanges.filter(e => ['reviewPolicyVersion','approvePolicyVersion','returnPolicyVersion'].includes(e.operationId) && e.response.status === 200)) {
    const decision = e.response.body.version.decisions.at(-1);
    assert.equal(decision.reason, e.request.body.reason, e.name);
    assert.deepEqual(decision.material, e.request.body.material, e.name);
    assert.equal(decision.authority_version, e.request.body.expected_authority_version, e.name);
    assert.equal(decision.effective_from, e.request.body.effective_from, e.name);
    assert.equal(decision.effective_until, e.request.body.effective_until, e.name);
  }
  const e = get('approvePolicyVersion-success'), success = e.response.body;
  const attempt = { chapter_id: '1', policy_id: success.root.id, category: 'operational', policy_code: 'OPERATIONAL_ROOT', action_code: 'policy.operational.approve', idempotency_key: e.request.body.idempotency_key };
  assert.ok(policyCommitMatches(success, attempt));
  for (const [key,value] of [['chapter_id','2'], ['policy_id','2'], ['category','financial'], ['policy_code','OTHER_ROOT'], ['action_code','policy.financial.approve'], ['idempotency_key','changed-key']]) assert.equal(policyCommitMatches(success,{...attempt,[key]:value}),false);
  for (const id of ['lookupOperationByKey','lookupOperationById']) for (const [suffix, expected] of [['','committed'],['-rejected','rejected'],['-pending','uncertain'],['-unavailable','uncertain']]) assert.equal(policyLookupOutcome(get(id+'-policy'+suffix).response.body),expected);
  for (const respond of [() => { throw new TypeError('Lost reply'); }, () => new Response('<html/>',{headers:{'Content-Type':'text/html'}}), () => new Response('{',{headers:{'Content-Type':'application/json'}}), () => new Response('',{status:302,headers:{Location:'/session'}})]) {
    let calls = 0;
    const result = await exchangeSession('approvePolicyVersion', { origin:'https://ysp.example.test', cookie:'XSRF-TOKEN=synthetic-token', signal:new AbortController().signal, path:e.request.path, body:e.request.body, contextRevision:e.request.header['X-Chapter-Context'], fetch:async()=>{calls++;return respond();} });
    assert.equal(result.kind,'unresolved'); assert.equal(calls,1);
  }
});

test('GOV-08/GOV-09: formal policy scenarios distinguish server obligations from schema enforcement', async () => {
  const scenarios = await read('policy-scenarios'), exchanges = await read('policy-exchanges');
  for (const id of ['authorized-metadata','complete-review','unsupported-domain','financial-ownership','approved-material','effective-now-versus-future','missing-policy','material-change','row-versus-material','denial-redaction','field-correction','immutable-replay','uncertain-attempt','return-history','cursor-snapshot']) assert.ok(scenarios.some(s => s.id === id), id);
  for (const s of scenarios) {
    assert.equal(s.verification, 'declarative_server_review'); assert.ok(s.precondition && s.obligation && s.limitations && s.requirements.length);
    assert.deepEqual(s.automatic_mutation_retries, []);
    for (const name of s.exchanges) assert.ok(exchanges.some(e => e.name === name), name);
    if (s.schema_valid_request) {
      const op = Object.values(api.paths).flatMap(p => [p.get,p.post]).find(o => o?.operationId === s.operationId);
      const check = ajv.compile(op.requestBody.content['application/json'].schema);
      assert.ok(check(s.schema_valid_request), s.id + ': requires server checks');
      const response = ajv.compile(op.responses[s.expected_server_response.status].content['application/json'].schema);
      assert.ok(response(s.expected_server_response.body), s.id);
    }
  }
  const get = n => exchanges.find(e => e.name === n).response.body;
  assert.equal(get('savePolicyDraft-success').version.material, null);
  const review = get('reviewPolicyVersion-success').version;
  assert.equal(review.material.record.kind, 'CONFIG'); assert.equal(review.material.material_version, 3); assert.equal('settings' in review, false);
  const original = get('approvePolicyVersion-success').version, changed = get('material-change-reapproval');
  assert.equal(changed.material.material_version, 4); assert.equal(changed.approved_policy, null); assert.equal(changed.review_state, 'draft');
  assert.deepEqual(changed.decisions, original.decisions); assert.equal(changed.decisions[0].material.material_version, 3);
  assert.equal(get('approve-financial').version.decisions[0].duty, 'FINANCE');
  assert.equal(original.effective_state, 'scheduled'); assert.equal(get('approve-current').version.effective_state, 'current');
  assert.equal(get('status-approved-future').blockers[0].state, 'not_yet_effective');
  assert.deepEqual(get('status-ready-for-requested-action').blockers, []);
  assert.deepEqual(Object.keys(get('requester-redacted')).sort(), ['affected_action','blockers','chapter_id','evaluated_at']);
  assert.deepEqual(get('listPolicyRoots-success').items[0], get('readPolicyRoot-success'));
  assert.deepEqual(get('listPolicyVersions-success').items[0], get('readPolicyVersion-success'));
  assert.deepEqual(api['x-policy-contract'].concrete_settings_payload_variants, []);
  assert.match(api['x-policy-contract'].review_status, /freeze blockers/);
});

test('TR-03/TR-09: canonical policy/material pins stay compatible with the existing P03 boundary', async () => {
  const internal = JSON.parse(await readFile(new URL('../../identity-record-evidence/v1/contract.schema.json', import.meta.url), 'utf8'));
  const transport = await read('transport.schema');
  for (const name of ['Hash','MaterialReference','PolicyReference']) {
    const normalized = JSON.parse(JSON.stringify(internal.$defs[name]).replaceAll('urn:ysp:transport:v1#/$defs/', '#/$defs/'));
    assert.deepEqual(transport.$defs[name], normalized, name + ': canonical schema parity');
  }
  ajv.addSchema(internal);
  const material = ajv.compile({ $ref: internal.$id + '#/$defs/MaterialReference' });
  const policy = ajv.compile({ $ref: internal.$id + '#/$defs/PolicyReference' });
  for (const e of await read('policy-exchanges')) {
    const v = e.response.body.version ?? (e.response.body.material ? e.response.body : null);
    if (v?.material) assert.ok(material(v.material), e.name);
    if (v?.approved_policy) assert.ok(policy(v.approved_policy), e.name);
  }
});
