import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const transport = await readJson('../v1/transport.schema.json');
const identity = await readJson('../../identity-record-evidence/v1/contract.schema.json');
const schema = await readJson('../../ipc-rm-acceptance/v1/contract.schema.json');
const examples = await readJson('../../ipc-rm-acceptance/v1/examples.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const dependency of [transport, identity, schema]) ajv.addSchema(dependency);
const validator = (name) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
const value = (name) => structuredClone(examples[name].value);

test('P00: IPC/RM definitions compile and expected wire examples validate', () => {
  for (const name of Object.keys(schema.$defs)) validator(name);
  for (const [name, example] of Object.entries(examples)) {
    const validate = validator(example.definition);
    assert.ok(validate(example.value), `${name}: ${ajv.errorsText(validate.errors)}`);
    assert.equal(example.evidence_state, 'expected');
  }
});

test('TR-03/Q4: acceptance requires both record versions and pins, without client authority', () => {
  const validate = validator('AcceptOpeningInput');
  const input = value('accept-input');
  for (const key of ['expected_row_version', 'expected_material_version']) {
    const invalid = structuredClone(input);
    delete invalid.context[key];
    assert.equal(validate(invalid), false, key);
  }
  for (const key of ['expected_row_version', 'target']) {
    const invalid = structuredClone(input);
    delete invalid.source[key];
    assert.equal(validate(invalid), false, `source.${key}`);
  }
  for (const key of ['actor_id', 'approved', 'opening_eligible', 'balance', 'lines']) {
    assert.equal(validate({ ...input, [key]: true }), false, key);
  }
  assert.equal(validate({ ...input, evidence: [] }), false);
  assert.equal(validate({ ...input, source: { ...input.source, source_kind: 'purchase' } }), false);
  assert.equal(validate({ ...input, receipt: { ...input.receipt, record: input.source.target.record } }), false);
  assert.equal(validate({ ...input, source: { ...input.source, target: input.receipt } }), false);
  const noHash = structuredClone(input);
  delete noHash.evidence[0].evidence.content_hash;
  assert.equal(validate(noHash), false);
});

test('INV-07/INV-08: result cannot describe accepted damage, zero effects or an IPC as the posted RM', () => {
  const validate = validator('AcceptedOpeningResult');
  const result = value('accepted');
  const invalid = structuredClone(result);
  invalid.record.reference.kind = 'IPC';
  assert.equal(validate(invalid), false, 'result record is the accepted RM');
  const effect = validator('StockEffect');
  const [accepted, damaged] = result.data.stock_effects;
  assert.equal(effect({ ...accepted, documented_quantity: { value: '0', quantity_scale: 0 } }), false);
  assert.equal(effect({ ...accepted, accepted_quantity: { value: '0', quantity_scale: 0 } }), false);
  assert.equal(effect({ ...damaged, accepted_quantity: { value: '2', quantity_scale: 0 } }), false);
  assert.equal(effect({ ...damaged, condition_code: 'usable' }), false);
  assert.equal(effect({ ...accepted, condition_code: 'damaged' }), false);
});

test('RCV-08/RCV-09: signed source, inspected split and expected result trace ten usable plus two nonusable units', async () => {
  const fixture = await readJson('../../ipc-rm-acceptance/v1/source-and-evidence.json');
  const upstream = (name) => ajv.compile({ $ref: `${identity.$id}#/$defs/${name}` });
  assert.ok(upstream('VersionedSource')(fixture.source));
  for (const binding of fixture.bindings) assert.ok(upstream('EvidenceBinding')(binding));
  const input = value('accept-input');
  const inspection = value('inspection');
  const result = value('accepted');
  const hash = (snapshot) => createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');
  assert.equal(hash(fixture.source.material), input.source.target.material_hash);
  assert.equal(hash(inspection.material), input.receipt.material_hash);
  assert.deepEqual(input.source.target, fixture.source.target);
  assert.deepEqual(input.source.target, inspection.material.source);
  assert.deepEqual(input.receipt, inspection.target);
  assert.deepEqual(input.context.record, inspection.state.reference);
  assert.equal(input.context.expected_row_version, inspection.state.row_version);
  assert.equal(input.source.expected_row_version, fixture.source.state.row_version);
  assert.deepEqual(fixture.required_signer_user_ids, ['11', '12', '21', '22']);
  for (const decision of fixture.source.decisions) assert.deepEqual(decision.target, input.source.target);
  for (const pin of input.evidence) {
    const binding = fixture.bindings.find((item) => item.id === pin.binding_id);
    assert.ok(binding);
    for (const field of ['target', 'line', 'evidence', 'purpose_code']) assert.deepEqual(pin[field], binding[field]);
    assert.deepEqual(pin.target, pin.purpose_code === 'ipc_signed_count_sheet' ? input.source.target : input.receipt);
  }
  const micro = (quantity) => BigInt(quantity.value.replace('.', ''));
  assert.deepEqual(inspection.material.lines.map((line) => line.reference.line_id), ['601', '602']);
  for (const line of inspection.material.lines) {
    const source = fixture.source.material.lines.find((item) => item.reference.line_id === line.source_line.line_id);
    assert.deepEqual(line.source_line, source.reference);
    assert.equal(line.reference.variant_id, source.reference.variant_id);
    assert.deepEqual(line.expected_quantity, source.counted_quantity);
    assert.equal(micro(line.delivered_quantity), micro(line.accepted_quantity) + micro(line.rejected_quantity) + micro(line.held_quantity));
    assert.equal(micro(line.expected_quantity), micro(line.delivered_quantity) + micro(line.missing_quantity));
    assert.ok(micro(line.nonusable_recorded_quantity) <= micro(line.rejected_quantity) + micro(line.held_quantity));
  }
  assert.equal(inspection.material.lines.reduce((sum, line) => sum + micro(line.accepted_quantity), 0n), 10000000n);
  assert.equal(inspection.material.lines.reduce((sum, line) => sum + micro(line.nonusable_recorded_quantity), 0n), 2000000n);
  assert.deepEqual(result.data.stock_effects.map((effect) => [effect.receipt_line.line_id, effect.posting_id, effect.lot_kind, effect.documented_quantity.value, effect.accepted_quantity.value]), [
    ['601', '1101', 'accepted', '10.000000', '10.000000'],
    ['602', '1102', 'nonusable', '2.000000', '0.000000']
  ]);
  assert.deepEqual(result.data.posting_ids, ['1101', '1102']);
  assert.equal(result.record.row_version, 5);
  assert.equal(result.data.source_state.row_version, 9);
  assert.equal(result.record.material_version, 1);
  assert.equal(result.data.source_state.material_version, 1);
  assert.equal(result.record.states.exception, 'open');
});

test('P00: expected invalid and uncertain attempts carry concrete inputs, current facts and scoped outcomes', async () => {
  const cases = await readJson('../../ipc-rm-acceptance/v1/cases.json');
  for (const scenario of cases) {
    assert.equal(scenario.evidence_state, 'expected');
    assert.equal(validator('AcceptOpeningInput')(scenario.input), scenario.input_shape_valid, scenario.name);
    assert.ok(Object.keys(scenario.server_facts).length > 0, scenario.name);
    assert.ok(scenario.expected.length > 0);
    const outcome = examples[scenario.result_example];
    assert.ok(outcome, scenario.name);
    assert.ok(validator(outcome.definition)(outcome.value));
    if (outcome.value.action_result !== 'success') assert.equal(outcome.value.input_policy, 'preserve');
  }
});

test('TR-12: replay keeps the original durable references and uncertainty never becomes a failed acceptance', () => {
  const accepted = value('accepted');
  const replayed = value('replayed');
  replayed.operation.replayed = false;
  assert.deepEqual(replayed, accepted, 'only replay marker changes, not the original durable result');
  for (const name of ['lookup-no-terminal', 'lookup-unavailable']) {
    const uncertain = value(name);
    assert.equal(uncertain.operation.outcome, 'unknown');
    assert.equal(uncertain.operation.committed_at, null);
    assert.equal(uncertain.operation.identity.operation_id, null);
    assert.equal(uncertain.operation.identity.action_code, accepted.operation.identity.action_code);
    assert.equal(uncertain.operation.identity.idempotency_key, accepted.operation.identity.idempotency_key);
    assert.equal(uncertain.record, null);
    assert.equal(uncertain.action_result, 'uncertain');
    assert.equal(uncertain.input_policy, 'preserve');
    assert.ok(uncertain.permitted_next_actions.some((action) => action.code === 'lookup_operation'));
    assert.equal(validator('AcceptedOpeningResult')(uncertain), false);
  }
  const forbidden = value('forbidden');
  for (const field of ['chapter_id', 'record', 'operation']) assert.equal(forbidden[field], null);
});

test('TR-12: opening fingerprint matches the shared JCS wrapper and an independent literal vector', async () => {
  const vector = await readJson('../../ipc-rm-acceptance/v1/fingerprint-vector.json');
  // Contract example check for this bounded ASCII-key/integer/string domain, not a runtime JCS provider.
  const canonical = (item) => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    if (item !== null && typeof item === 'object') {
      return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
    }
    return JSON.stringify(item);
  };
  const normalized = (input) => {
    const { chapter_id, action_code, idempotency_key, ...context } = input.context;
    return {
      chapter_id, action_code, input_schema: 'urn:ysp:ipc-rm-acceptance:v1#/$defs/AcceptOpeningInput',
      input: { context, receipt: input.receipt, source: input.source, evidence: [...input.evidence].sort((a, b) => BigInt(a.binding_id) < BigInt(b.binding_id) ? -1 : 1) }
    };
  };
  const original = value('accept-input');
  assert.deepEqual(normalized(original), vector.normalized_value);
  const encoded = canonical(normalized(original));
  assert.equal(encoded, vector.canonical_json);
  assert.equal(createHash('sha256').update(encoded, 'utf8').digest('hex'), vector.sha256);
  const reordered = structuredClone(original);
  reordered.context.idempotency_key = 'another-key';
  reordered.evidence.reverse();
  assert.equal(canonical(normalized(reordered)), vector.canonical_json);
  const changed = structuredClone(original);
  changed.source.expected_row_version = 9;
  assert.notEqual(canonical(normalized(changed)), vector.canonical_json);
  changed.source.expected_row_version = 8;
  changed.evidence[0].evidence.object_version = 'djI=';
  assert.notEqual(canonical(normalized(changed)), vector.canonical_json);
});
