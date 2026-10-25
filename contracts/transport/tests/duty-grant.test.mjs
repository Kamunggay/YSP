import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';
const { api, ajv } = await loadContract();
const read = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
const ids = ['readDutyCatalogue', 'listDutyGrants', 'readDutyGrant', 'authorizeDutyGrant', 'amendDutyGrant', 'endDutyGrant', 'revokeDutyGrant', 'substituteDutyGrant'];

test('GOV-04/TR-06: duty administration has eight exact operations and all declared responses validate', async () => {
 const exchanges = await read('duty-grant-exchanges');
 for (const id of ids) {
  const op = Object.values(api.paths).flatMap(p => [p.get,p.post]).find(o => o?.operationId === id);
  assert.ok(op, id);
  assert.deepEqual(new Set(exchanges.filter(e=>e.operationId===id).map(e=>e.response.status)),new Set(Object.keys(op.responses).map(Number)), id);
  assert.deepEqual(op.security,[id.startsWith('read')||id.startsWith('list')?{chapterSession:[]}:{chapterSession:[],csrfToken:[]}]);
 }
 for(const e of exchanges) validateExchange(api,ajv,e);
});

test('SEC-03/TR-07: exact limits, scope, times, versions and server attribution reject malformed shapes', async () => {
 const original=(await read('duty-grant-exchanges')).find(e=>e.name==='authorizeDutyGrant-success');
 const reject=change=>{const e=structuredClone(original);change(e);assert.throws(()=>validateExchange(api,ajv,e));};
 for(const f of ['expected_grant_version','expected_authority_version','expected_membership_version'])reject(e=>{delete e.request.body[f];});
 for(const f of ['actor','authorized','is_alternate','authority','approved'])reject(e=>{e.request.body[f]=true;});
 for(const value of [1,'01','18446744073709551616'])reject(e=>{e.request.body.membership_id=value;});
 for(const value of ['-1.00','1.0','1e3',10])reject(e=>{e.request.body.grant.monetary_limit={currency:'PHP',amount:value};});
 reject(e=>{e.request.body.grant.monetary_limit.currency='USD';});
 reject(e=>{e.request.body.grant.scope_kind='unit';});
 reject(e=>{e.request.body.grant.requesting_unit_id='1';});
 reject(e=>{e.request.body.grant.starts_at='2026-02-30T00:00:00.000000Z';});
 reject(e=>{e.request.body.grant.ends_at='2026-10-25T14:00:00+08:00';});
 reject(e=>{e.request.body.grant.duty_code='BUYER';});
 reject(e=>{e.response.body.grant.authorized.email='private@example.test';});
 reject(e=>{e.response.body.record={};});
 reject(e=>{delete e.request.header['X-Chapter-Context'];});
 const { ajv:internalAjv }=await loadContract();
 const internal=JSON.parse(await readFile(new URL('../../identity-record-evidence/v1/contract.schema.json',import.meta.url),'utf8'));
 internalAjv.addSchema(internal);const check=internalAjv.compile({$ref:internal.$id+'#/$defs/DutyGrant'});
 for(const e of await read('duty-grant-exchanges')) {
  const g=e.response.body.grant;if(!g)continue;
  const projection=Object.fromEntries(internal.$defs.DutyGrant.required.map(k=>[k,g[k]]));
  assert.ok(check(projection),internalAjv.errorsText(check.errors));
 }
});

test('GOV-05/GOV-06/TR-12: replay preserves original grant and substitution changes both grants atomically',async()=>{
 const exchanges=await read('duty-grant-exchanges');
 const get=name=>structuredClone(exchanges.find(e=>e.name===name));
 for(const id of ids.slice(3)){
  const a=get(id+'-success').response.body,b=get(id+'-replay').response.body;
  assert.equal(b.operation.replayed,true);b.operation.replayed=false;assert.deepEqual(a,b);
 }
 const alternate=get('substituteDutyGrant-success').response.body;
 assert.equal(alternate.grant.replaces_grant_id,alternate.replaced_grant.id);
 assert.equal(alternate.replaced_grant.ends_at,alternate.grant.starts_at);
 assert.notEqual(alternate.grant.identity.user_id,alternate.replaced_grant.identity.user_id);
 assert.equal(alternate.grant.duty_code,alternate.replaced_grant.duty_code);
 const catalogue=get('readDutyCatalogue-success').response.body.items;
 assert.deepEqual(catalogue.map(i=>i.duty_code),[...api.components.schemas.ChapterDuty.enum].sort());
 const scenarios=await read('duty-grant-scenarios');
 for(const s of scenarios){assert.equal(s.verification,'declarative_server_review');assert.ok(s.precondition&&s.obligation&&s.limitations&&s.requirements.length);assert.deepEqual(s.automatic_mutation_retries,[]);for(const n of s.exchanges)assert.ok(exchanges.some(e=>e.name===n),n);}
 assert.match(api['x-duty-grant-contract'].review_status,/freeze blockers/);
});

test('TR-12/DOC-11: typed grant consumer binds original scope and keeps transport and lookup uncertainty', async()=>{
 const { exchangeSession }=await import('../consumer/session.ts');
 const { dutyGrantCommitMatches, dutyGrantLookupOutcome }=await import('../consumer/duty-grant.ts');
 const exchanges=await read('duty-grant-exchanges');
 for(const e of exchanges){
  let calls=0;
  const result=await exchangeSession(e.operationId,{origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,path:e.request.path,query:e.request.query,body:e.request.body,contextRevision:e.request.header?.['X-Chapter-Context'],fetch:async(url,init)=>{
   calls++;let pathname='/api/v1'+e.path;for(const[k,v]of Object.entries(e.request.path))pathname=pathname.replace(`{${k}}`,v);
   assert.equal(url.pathname,pathname);assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');
   assert.equal(init.headers.get('X-Chapter-Context'),e.request.header?.['X-Chapter-Context']??null);
   assert.deepEqual(Object.fromEntries(url.searchParams),Object.fromEntries(Object.entries(e.request.query??{}).map(([k,v])=>[k,String(v)])));
   return new Response(JSON.stringify(e.response.body),{status:e.response.status,headers:{...e.response.headers,'Content-Type':'application/json'}});
  }});
  assert.equal(calls,1,e.name);assert.equal(result.kind,'response',e.name);assert.deepEqual(result.body,e.response.body,e.name);
 }
 const e=exchanges.find(e=>e.name==='authorizeDutyGrant-success'),success=e.response.body;
 const attempt={chapter_id:'1',membership_id:success.grant.membership_id,action_code:success.operation.identity.action_code,idempotency_key:success.operation.identity.idempotency_key};
 assert.ok(dutyGrantCommitMatches(success,attempt));
 for(const [key,value]of [['chapter_id','2'],['membership_id','2'],['action_code','alternates.authorize'],['idempotency_key','different-key']])assert.equal(dutyGrantCommitMatches(success,{...attempt,[key]:value}),false);
 for(const oid of ['lookupOperationByKey','lookupOperationById'])for(const [suffix,expected]of [['','committed'],['-rejected','rejected'],['-pending','uncertain'],['-unavailable','uncertain']])assert.equal(dutyGrantLookupOutcome(exchanges.find(e=>e.name===oid+'-duty-grant'+suffix).response.body),expected);
 for(const respond of [()=>{throw new TypeError('Lost reply');},()=>new Response('<html/>',{headers:{'Cache-Control':'no-store','Content-Type':'text/html'}}),()=>new Response('{',{headers:{'Cache-Control':'no-store','Content-Type':'application/json'}}),()=>new Response('',{status:302,headers:{Location:'/session'}})]){
  let calls=0;const result=await exchangeSession('authorizeDutyGrant',{origin:'https://ysp.example.test',cookie:'XSRF-TOKEN=synthetic-token',signal:new AbortController().signal,path:e.request.path,body:e.request.body,contextRevision:e.request.header['X-Chapter-Context'],fetch:async()=>{calls++;return respond();}});
  assert.equal(result.kind,'unresolved');assert.equal(calls,1);
 }
});

test('GOV-04/GOV-06: structural substitution results reject absent replaced grant; cross-value denials remain server obligations',async()=>{
 const e=(await read('duty-grant-exchanges')).find(e=>e.name==='substituteDutyGrant-success');
 const broken=structuredClone(e);broken.response.body.replaced_grant=null;
 assert.throws(()=>validateExchange(api,ajv,broken));
 const cases=await read('duty-grant-scenarios');
 for(const id of ['interval-order','duplicate-overlap','limit-authority','cross-chapter-alternate']){
  const s=cases.find(s=>s.id===id);assert.ok(s.schema_valid_request&&s.expected_server_response,id);
  const op=Object.values(api.paths).flatMap(p=>[p.get,p.post]).find(o=>o?.operationId===s.operationId);
  const check=ajv.compile(op.requestBody.content['application/json'].schema);
  assert.ok(check(s.schema_valid_request),id+': these cross-value cases must not be misrepresented as schema-enforced');
  const response=ajv.compile(op.responses[s.expected_server_response.status].content['application/json'].schema);
  assert.ok(response(s.expected_server_response.body),id);
 }
});
