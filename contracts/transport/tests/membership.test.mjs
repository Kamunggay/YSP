import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';
const { api, ajv } = await loadContract();
const read = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
test('GOV-04/SEC-03: scoped membership administration has exact operations and validated exchanges', async () => {
  assert.equal(api.paths['/chapters/{chapter_id}/memberships']?.get.operationId, 'listMemberships');
  const exchanges = await read('membership-exchanges');
  for (const e of exchanges) validateExchange(api, ajv, e);
  for (const id of ['listMemberships','readMembership','lookupMembershipIdentity','authorizeMembership','disableMembership','revokeMembership']) {
    const op = Object.values(api.paths).flatMap(p => [p.get,p.post]).find(o => o?.operationId === id);
    assert.ok(op, id);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === id).map(e => e.response.status)), new Set(Object.keys(op.responses).map(Number)), id);
  }
});

test('TR-12/UX-03: generated consumer validates membership exchanges and never retries transport uncertainty', async () => {
 const { exchangeSession } = await import('../consumer/session.ts');
 const { membershipCommitMatches } = await import('../consumer/membership.ts');
 for (const e of await read('membership-exchanges')) {
  let calls=0;
  const result=await exchangeSession(e.operationId, {
   origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,
   path:e.request.path,query:e.request.query,body:e.request.body,contextRevision:e.request.header?.['X-Chapter-Context'],
   fetch:async (url,init)=>{calls++; let path='/api/v1'+e.path;for(const [k,v] of Object.entries(e.request.path))path=path.replace(`{${k}}`,v);
    assert.equal(url.pathname,path);assert.equal(init.redirect,'error');assert.equal(init.credentials,'include');
    assert.equal(init.headers.get('X-Chapter-Context'),e.request.header?.['X-Chapter-Context']??null);
    return new Response(JSON.stringify(e.response.body),{status:e.response.status,headers:{...e.response.headers,'Content-Type':'application/json'}});
   }
  });
  assert.equal(calls,1,e.name);assert.equal(result.kind,'response',e.name);assert.deepEqual(result.body,e.response.body,e.name);
  if(e.response.body.resource_type==='membership' && e.response.body.action_result==='success'){
   const success=e.response.body; const attempt={chapter_id:'1',action_code:success.operation.identity.action_code,idempotency_key:'membership-attempt-01'};
   assert.ok(membershipCommitMatches(success,attempt));assert.equal(membershipCommitMatches(success,{...attempt,chapter_id:'2'}),false);
   assert.equal(typeof success.membership.identity.user_id,'string');assert.equal(success.operation.committed_at,'2026-10-25T06:00:00.123456Z');
  }
 }
 const e=(await read('membership-exchanges')).find(e=>e.name==='authorizeMembership-success');
 for(const respond of [()=>{throw new TypeError('Lost reply');},()=>{throw new DOMException('Timeout','TimeoutError');},()=>new Response('<html/>',{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}}),()=>new Response('{',{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),()=>new Response('',{status:302,headers:{Location:'/session'}})]){
  let calls=0;const result=await exchangeSession('authorizeMembership',{origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,path:e.request.path,body:e.request.body,contextRevision:e.request.header['X-Chapter-Context'],fetch:async()=>{calls++;return respond();}});
  assert.equal(result.kind,'unresolved');assert.equal(calls,1);
 }
});
test('SEC-02/UX-02: lifecycle, edit retention and authority obligations remain declarative',async()=>{
 const exchanges=await read('membership-exchanges');const scenarios=await read('membership-scenarios');
 assert.equal(scenarios.length,8);
 for(const s of scenarios){assert.equal(s.verification,'declarative_server_review');assert.ok(s.precondition&&s.obligation&&s.limitations&&s.requirements.length);assert.deepEqual(s.automatic_mutation_retries,[]);for(const name of s.exchanges){const e=exchanges.find(e=>e.name===name);assert.ok(e,name);validateExchange(api,ajv,e);}}
 assert.match(api['x-membership-contract'].review_status,/freeze blockers/);
});

test('DOC-11: HTTP 200 pending lookup never means commitment and old record consumers remain distinct', async()=>{
 const { membershipLookupOutcome }=await import('../consumer/membership.ts');
 const exchanges=await read('membership-exchanges');
 for(const oid of ['lookupOperationByKey','lookupOperationById']){
  for(const [suffix,outcome] of [['membership','committed'],['membership-rejected','rejected'],['membership-pending','uncertain'],['membership-unavailable','uncertain']]){
   const e=exchanges.find(e=>e.name===oid+'-'+suffix);validateExchange(api,ajv,e);assert.equal(membershipLookupOutcome(e.response.body),outcome);
  }
 }
 for(const e of await read('operation-examples')){
  validateExchange(api,ajv,e);
  if(e.response.status===200)assert.equal(membershipLookupOutcome(e.response.body),e.response.body.action_result==='uncertain'?'uncertain':'record_result');
 }
});
