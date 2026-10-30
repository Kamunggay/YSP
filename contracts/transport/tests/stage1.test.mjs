import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const examples = JSON.parse(await readFile(new URL('../v1/stage1-exchanges.json', import.meta.url), 'utf8'));
const operations = Object.entries(api.paths).flatMap(([path, item]) => Object.entries(item)
  .filter(([, operation]) => operation['x-stage1-contract'])
  .map(([method, operation]) => ({ path, method, ...operation })));
const example = name => structuredClone(examples.find(row => row.name === name));

test('Stage 1: every declared public operation has a typed success exchange and explicit ownership', () => {
  assert.equal(operations.length, 31);
  assert.equal(new Set(examples.map(row => row.name)).size, examples.length);
  for (const operation of operations) {
    assert.ok(operation['x-backend-owner']);
    assert.equal(operation['x-ui-consumer'], 'Glenn');
    assert.ok(operation['x-requirements'].length);
    assert.ok(examples.some(row => row.operationId === operation.operationId && row.response.status === 200));
  }
  for (const row of examples) validateExchange(api, ajv, row);
});

test('Stage 1: exact quantities, version pins and server-derived authority cannot be replaced by client flags', () => {
  const command = example('prepareStage1RfHandover-success-example');
  validateExchange(api, ajv, command);
  for (const change of [
    row => { row.request.body.lines[0].actual_quantity = 4; },
    row => { row.request.body.lines[0].actual_quantity = '0.000000'; },
    row => { delete row.request.body.expected_material_version; },
    row => { row.request.body.approved = true; },
    row => { row.request.body.actor_user_id = '1'; },
    row => { row.request.body.chapter_id = '2'; },
    row => { delete row.request.header['Idempotency-Key']; },
    row => { row.request.path.record_id = 700; },
  ]) {
    const invalid = structuredClone(command);
    change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  }
});

test('Stage 1: paper readiness and exact-batch pins are distinct; arbitrary source/balance setters are absent', () => {
  const confirm = example('confirmStage1RfHandover-success-example');
  for (const field of ['acknowledged_batch_hash', 'evidence_binding_ids', 'expected_material_version', 'client_attempt_id']) {
    const invalid = structuredClone(confirm);
    delete invalid.request.body[field];
    assert.throws(() => validateExchange(api, ajv, invalid));
  }
  const opening = example('acceptStage1OpeningReceipt-success-example');
  for (const field of ['accepted_quantity', 'on_hand', 'approved', 'source_kind']) {
    const invalid = structuredClone(opening);
    invalid.request.body[field] = '1';
    assert.throws(() => validateExchange(api, ajv, invalid));
  }
  assert.ok(!operations.some(op => /inventory.*(post|set_balance)/.test(op['x-action-code'])));
});

test('Stage 1: replay identity, denial redaction and rollback-preserving errors remain consumable examples', () => {
  for (const operation of ['acceptStage1OpeningReceipt', 'allocateStage1Rf', 'confirmStage1RfHandover']) {
    const first = example(`${operation}-success-example`);
    const replay = example(`${operation}-same-key-replay-example`);
    assert.equal(replay.response.body.operation.replayed, true);
    replay.response.body.operation.replayed = false;
    assert.deepEqual(replay.response.body, first.response.body);
    const conflict = example(`${operation}-changed-key-payload-example`);
    assert.equal(conflict.request.header['Idempotency-Key'], first.request.header['Idempotency-Key']);
    assert.notDeepEqual(conflict.request.body, first.request.body);
  }
  for (const row of examples.filter(row => row.response.status === 403)) {
    for (const field of ['chapter_id', 'record', 'operation', 'data']) assert.equal(row.response.body[field], null);
  }
  for (const row of examples.filter(row => row.response.status >= 400)) {
    assert.equal(row.response.body.input_policy, 'preserve');
    assert.equal(row.response.body.operation, null);
  }
});

test('Stage 1: WebSocket technology remains open and committed invalidations contain no sensitive business payload', () => {
  assert.match(api['x-stage1-contract'].notifications.delivery, /recommended, not adopted/);
  const schema = api.components.schemas.Stage1CommitEvent;
  const validate = ajv.compile(schema);
  const change = { event_id: '01K8A6J0A00000000000000002', operation_id: '01K8A6J0A00000000000000001', chapter_id: '1', action_code: 'rf.handover_confirm', record_id: '700', row_version: 8, material_version: 1, inventory_revision: 4, committed_at: '2026-11-02T01:00:00.000001Z' };
  assert.equal(validate(change), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...change, recipient_name: 'private' }), false);
  assert.equal(validate({ ...change, approved: true }), false);
});
