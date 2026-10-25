import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';
const { api, ajv } = await loadContract();
const exchanges = JSON.parse(await readFile(new URL('../v1/membership-exchanges.json',import.meta.url),'utf8'));
const get = name => structuredClone(exchanges.find(e => e.name === name));
test('SEC-03/TR-06: membership body versions, IDs, attribution and terminal results are closed', () => {
 const original = get('authorizeMembership-success');
 const reject = change => { const e=structuredClone(original); change(e); assert.throws(()=>validateExchange(api,ajv,e)); };
 for (const field of ['expected_membership_version','expected_authority_version']) reject(e=>{delete e.request.body[field];});
 for (const field of ['actor','authority','approved','user_id','fingerprint']) reject(e=>{e.request.body[field]=true;});
 for (const value of [1,'01','18446744073709551616']) reject(e=>{e.request.body.identity.user_id=value;});
 for (const value of [0,1.5,'3',4294967296]) reject(e=>{e.request.body.expected_authority_version=value;});
 reject(e=>{e.response.body.record={};});
 reject(e=>{e.response.body.operation=null;});
 reject(e=>{e.response.body.operation.identity.operation_id=null;});
 reject(e=>{e.response.body.operation.outcome='unknown';});
 reject(e=>{e.response.body.operation.committed_at='2026-10-25T14:00:00+08:00';});
 reject(e=>{e.response.body.membership.status='disabled';});
 reject(e=>{e.response.body.membership.identity.email='private@example.test';});
 reject(e=>{delete e.request.header['X-Chapter-Context'];});
 const page=get('memberships-page');
 for (const value of [0,101,'1',1.5]) {const e=structuredClone(page);e.request.query.limit=value;assert.throws(()=>validateExchange(api,ajv,e));}
 const bad=get('authorizeMembership-422'); bad.response.body.field_feedback[0].path='expected_membership_version';assert.throws(()=>validateExchange(api,ajv,bad));
});
test('TR-12/DOC-11: authorized synthetic replay preserves terminal identity, timestamp and version',()=>{
 for(const id of ['authorizeMembership','disableMembership','revokeMembership']) {
  const original=get(id+'-success').response.body; const replay=get(id+'-replay').response.body;
  assert.equal(replay.operation.replayed,true); replay.operation.replayed=false;assert.deepEqual(replay,original);
 }
 const results=['identity-absent','identity-disabled','identity-not-visible'].map(n=>get(n).response);assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
