import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const read = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
const operations = ['getProvisioningContext', 'lookupProvisioningIdentity', 'createProvisionedChapter', 'appointInitialHead', 'listProvisionings', 'readProvisioning', 'lookupProvisioningByKey', 'lookupProvisioningById'];

test('GOV-03: provider-only chapter creation, explicit appointment and scoped recovery have exact HTTP contracts', async () => {
  for (const id of operations) assert.ok(Object.values(api.paths).some(p => [p.get,p.post].some(o => o?.operationId === id)), id);
  const exchanges = await read('provisioning-exchanges');
  for (const id of operations) {
    const op = Object.values(api.paths).flatMap(p => [p.get,p.post]).find(o => o?.operationId === id);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)), new Set(Object.keys(op.responses).map(Number)), id);
    assert.deepEqual(op.security, [{ provisionerSession: [], ...(op.requestBody ? { csrfToken: [] } : {}) }]);
  }
  for (const e of exchanges) validateExchange(api, ajv, e);
});

test('SEC-03/TR-06: provisioning rejects caller scopes, implicit memberships and ambiguous selectors', async () => {
  const exchanges = await read('provisioning-exchanges');
  const get = name => structuredClone(exchanges.find(e => e.name === name));
  const reject = (name, change) => { const e = get(name); change(e); assert.throws(() => validateExchange(api, ajv, e)); };
  for (const field of ['chapter_id','organization_id','provider_user_id','scope','actor','fingerprint','membership','approved','provider_role']) {
    reject('createProvisionedChapter-success', e => { e.request.body[field] = '1'; });
  }
  for (const field of ['expected_provider_authority_version','expected_provisioning_version','identity','reason']) {
    reject('appointInitialHead-success', e => { delete e.request.body[field]; });
  }
  for (const id of [1,'01','18446744073709551616']) reject('appointInitialHead-success', e => { e.request.body.identity.user_id = id; });
  for (const version of ['1',0,1.5,4294967296]) reject('appointInitialHead-success', e => { e.request.body.expected_provisioning_version = version; });
  for (const code of ['lowercase','A'.repeat(33),'BAD CODE','']) reject('createProvisionedChapter-success', e => { e.request.body.chapter.code = code; });
  reject('createProvisionedChapter-success', e => { e.request.body.chapter.name = 'A'.repeat(161); });
  reject('createProvisionedChapter-success', e => { e.response.body.provisioning.initial_head_membership_authorization = 'authorized'; });
  reject('appointInitialHead-success', e => { e.response.body.provisioning.initial_head = null; });
  reject('appointInitialHead-success', e => { e.response.body.provisioning.initial_head.identity.email = 'private@example.test'; });
  reject('appointInitialHead-success', e => { e.response.body.chapter_id = '1'; });
  reject('appointInitialHead-success', e => { e.response.body.operation.committed_at = '2026-10-25T14:00:00+08:00'; });
  reject('appointInitialHead-success', e => { e.response.body.operation.identity.action_code = 'provider.chapters.create'; });
  for (const query of [{idempotency_key:'same-key'}, {action_code:['provider.chapters.create'],idempotency_key:'same-key'}, {action_code:'provider.chapters.create',idempotency_key:'same-key',operation_id:'01K8A6J0A00000000000000001'}, {action_code:'provider.chapters.create',idempotency_key:'same-key',chapter_id:'1'}]) {
    reject('lookupProvisioningByKey-success', e => { e.request.query = query; });
  }
  reject('lookupProvisioningById-success', e => { e.request.query = {action_code:'provider.chapters.create'}; });
  for (const limit of [0,101,'1']) reject('listProvisionings-success', e => { e.request.query.limit = limit; });
  for (const status of ['pending_or_not_visible','unavailable']) reject('lookupProvisioningByKey-'+status, e => { e.response.body.operation = get('appointInitialHead-success').response.body.operation; });
  reject('lookupProvisioningByKey-success', e => { e.response.body.operation.replayed = false; });
  reject('lookupProvisioningById-rejected', e => { e.response.body.operation.replayed = false; });
});

test('DOC-11/TR-12: strict consumer verifies original provider attempt and never retries uncertainty', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const { provisioningLookupOutcome } = await import('../consumer/provisioning.ts');
  const exchanges = await read('provisioning-exchanges');
  const get = name => structuredClone(exchanges.find(e => e.name === name));
  const committed = get('appointInitialHead-success').response.body;
  const attempt = { scope: committed.scope, action_code: 'provider.initial_head.appoint', idempotency_key: committed.operation.identity.idempotency_key, provisioning_id: committed.provisioning.id, operation_id: committed.operation.identity.operation_id };
  assert.equal(provisioningLookupOutcome({kind:'response',status:200,body:committed},attempt),'committed');
  for (const [field,value] of [['action_code','provider.chapters.create'],['idempotency_key','different-key'],['provisioning_id','2'],['operation_id','01K8A6J0A00000000000000003']]) assert.equal(provisioningLookupOutcome({kind:'response',status:200,body:committed},{...attempt,[field]:value}),'uncertain');
  for (const field of ['organization_id','provider_user_id']) assert.equal(provisioningLookupOutcome({kind:'response',status:200,body:committed},{...attempt,scope:{...attempt.scope,[field]:'2'}}),'uncertain');
  const wrongResourceScope = structuredClone(committed); wrongResourceScope.provisioning.scope.organization_id='2';
  assert.equal(provisioningLookupOutcome({kind:'response',status:200,body:wrongResourceScope},attempt),'uncertain');
  const wrongRejectedTarget = get('lookupProvisioningByKey-rejected').response.body; wrongRejectedTarget.provisioning_id='2';
  assert.equal(provisioningLookupOutcome({kind:'response',status:200,body:wrongRejectedTarget},attempt),'uncertain');
  for(const id of ['createProvisionedChapter','appointInitialHead']) {
    const original=get(id+'-success').response.body, replay=get(id+'-replay').response.body;
    assert.equal(replay.operation.replayed,true); replay.operation.replayed=false; assert.deepEqual(replay,original);
  }
  for(const id of ['lookupProvisioningByKey','lookupProvisioningById']) for(const [suffix,outcome] of [['success','committed'],['rejected','rejected'],['pending_or_not_visible','uncertain'],['unavailable','uncertain'],['401','uncertain'],['403','uncertain'],['503','uncertain']]) {
    assert.equal(provisioningLookupOutcome({kind:'response',...get(id+'-'+suffix).response},attempt),outcome);
  }
  for(const e of exchanges) {
    let calls=0;
    const result=await exchangeSession(e.operationId,{origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,path:e.request.path,query:e.request.query,body:e.request.body,fetch:async(url,init)=>{
      calls++; let path='/api/v1'+e.path;
      for(const [k,v] of Object.entries(e.request.path??{}))path=path.replace(`{${k}}`,v);
      assert.equal(url.pathname,path);assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');assert.equal(init.headers.get('X-Chapter-Context'),e.request.header?.['X-Chapter-Context']??null);
      assert.deepEqual(Object.fromEntries(url.searchParams),Object.fromEntries(Object.entries(e.request.query??{}).map(([k,v])=>[k,String(v)])));
      return new Response(JSON.stringify(e.response.body),{status:e.response.status,headers:{...e.response.headers,'Content-Type':'application/json'}});
    },...(e.request.header?.['X-Chapter-Context']?{contextRevision:e.request.header['X-Chapter-Context']}:{})});
    assert.equal(calls,1,e.name);assert.equal(result.kind,'response',e.name);assert.deepEqual(result.body,e.response.body,e.name);
  }
  const e=get('appointInitialHead-success');
  for(const reply of [()=>{throw new TypeError('lost reply');},()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}}),()=>new Response('{',{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),()=>new Response('',{status:302,headers:{Location:'/session'}})]) {
    let calls=0;
    const result=await exchangeSession('appointInitialHead',{origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,path:e.request.path,body:e.request.body,fetch:async()=>{calls++;return reply();}});
    assert.equal(result.kind,'unresolved');assert.equal(calls,1);assert.equal(provisioningLookupOutcome(result,attempt),'uncertain');
  }
});

test('GOV-03/AC-19: provisioning examples and declared server obligations retain authority and readiness gates', async () => {
  const scenarios=await read('provisioning-scenarios'), exchanges=await read('provisioning-exchanges');
  const get=name=>exchanges.find(e=>e.name===name).response.body;
  for(const id of ['provider-only-entry','chapter-then-head','separate-membership','identity-visibility','scoped-uncertain-lookup','immutable-replay','stale-versions','terminal-rejection','selector-rejection','uncertainty-and-expiry','bounded-private-list','field-feedback','p03-runtime-gate']) assert.ok(scenarios.some(s=>s.id===id),id);
  for(const s of scenarios) {
    assert.equal(s.verification,'declarative_server_review');assert.ok(s.precondition && s.obligation && s.limitations && s.requirements.length);
    assert.deepEqual(s.automatic_mutation_retries,[]);
    for(const name of s.exchanges)assert.ok(exchanges.some(e=>e.name===name),name);
    if(s.schema_valid_request) {
      const op=Object.values(api.paths).flatMap(p=>[p.get,p.post]).find(o=>o?.operationId===s.operationId);
      assert.ok(ajv.compile(op.requestBody.content['application/json'].schema)(s.schema_valid_request),s.id);
      assert.ok(ajv.compile(op.responses[s.expected_server_response.status].content['application/json'].schema)(s.expected_server_response.body),s.id);
    }
  }
  const bootstrap=get('provider-only-entry');
  assert.equal(bootstrap.state,'authenticated');assert.equal(bootstrap.provider_destinations[0].kind,'chapter_provisioning');
  assert.equal(get('createProvisionedChapter-success').provisioning.initial_head,null);
  assert.equal(get('appointInitialHead-success').provisioning.initial_head_membership_authorization,'not_authorized');
  assert.equal(get('provider-separate-membership-authorized').initial_head_membership_authorization,'authorized');
  for(const name of ['disabled','not-visible','ineligible'])assert.deepEqual(get('provider-identity-'+name),get('provider-identity-absent'));
  assert.deepEqual(get('readProvisioning-success'),get('listProvisionings-success').items[0]);
  const first=get('provider-first-page'), last=get('provider-last-page');
  assert.ok(BigInt(first.items[0].id)<BigInt(last.items[0].id));assert.equal(last.next_cursor,null);
  for(const id of ['lookupProvisioningIdentity','createProvisionedChapter','appointInitialHead']) {
    const e=exchanges.find(e=>e.name===id+'-422'),pointer=e.response.body.field_feedback[0].path;
    assert.notEqual(pointer.split('/').slice(1).reduce((v,k)=>v?.[k.replaceAll('~1','/').replaceAll('~0','~')],e.request.body),undefined);
  }
  const contract=api['x-provisioning-contract'];
  assert.ok(contract.freeze_gates.some(g=>g.includes('P03')));assert.ok(contract.p03_dependencies.length);
});
