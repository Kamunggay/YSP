import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const transport = await readJson('../v1/transport.schema.json');
const schema = await readJson('../../identity-record-evidence/v1/contract.schema.json');
const examples = await readJson('../../identity-record-evidence/v1/examples.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(transport);
ajv.addSchema(schema);
const validator = (name) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
const value = (name) => structuredClone(examples[name].value);

test('P00: every identity/record/evidence definition compiles and expected example validates', () => {
  for (const name of Object.keys(schema.$defs)) validator(name);
  for (const [name, example] of Object.entries(examples)) {
    const validate = validator(example.definition);
    assert.ok(validate(example.value), `${name}: ${ajv.errorsText(validate.errors)}`);
    assert.equal(example.evidence_state, 'expected');
  }
});

test('TR-03/Q4: normalized evidence consumption rejects authority flags and missing version pins', () => {
  const validate = validator('EvidenceCheckInput');
  const input = value('bind-input');
  for (const field of ['expected_row_version', 'expected_material_version']) {
    const invalid = structuredClone(input);
    delete invalid.context[field];
    assert.equal(validate(invalid), false, `${field} is mandatory`);
  }
  for (const field of ['actor_id', 'selected_duty', 'approved', 'ready', 'balance']) {
    assert.equal(validate({ ...input, [field]: 'client assertion' }), false, field);
  }
  assert.equal(validate({ ...input, target: { ...input.target, material_version: null } }), false);
  assert.equal(validate({ ...input, evidence: { ...input.evidence, evidence_object_id: 301 } }), false);
  const context = validator('CurrentContext');
  assert.equal(context({ ...value('current-context'), session_cookie: 'secret' }), false);
  assert.equal(validator('Attribution')({ ...value('reviewed-source').prepared_by, duty_code: 'provisioner' }), false);
  assert.equal(validator('DutyGrant')({ ...value('current-context').duty_grants[0], scope_kind: 'unit' }), false);
});

test('TR-15: lifecycle separates rejection, current availability and immutable ready bytes', () => {
  const validate = validator('EvidenceState');
  assert.equal(validate({ ...value('evidence-staged'), reference: value('evidence-ready').reference }), false);
  assert.equal(validate({ ...value('evidence-rejected'), lifecycle: 'rejected' }), false);
  const ready = value('evidence-ready');
  for (const field of ['reference', 'validated_at', 'validator_version', 'byte_size']) {
    const invalid = structuredClone(ready);
    delete invalid[field];
    assert.equal(validate(invalid), false, field);
  }
  assert.equal(validate({ ...ready, byte_size: '0' }), false);
  assert.equal(validate({ ...value('canvas-evidence'), mime_type: 'application/pdf' }), false);
  const evidence = validator('ReadyEvidenceReference');
  for (const field of ['object_version', 'content_hash']) {
    const invalid = structuredClone(ready.reference);
    delete invalid[field];
    assert.equal(evidence(invalid), false, field);
    assert.equal(evidence({ ...ready.reference, [field]: ready.reference[field] + '\n' }), false);
  }
  assert.equal(evidence({ ...ready.reference, object_version: 'https://mutable/latest' }), false);
});

test('P00 walkthrough: approved setup and stable IPC source lead to ready evidence without posting', async () => {
  const boundary = await readJson('../../identity-record-evidence/v1/boundary.json');
  assert.equal(boundary.revision, '1.0.0-review.1');
  assert.deepEqual(boundary.acceptance, { leader: 'review-ready', glenn: 'pending', efren: 'pending', runtime_p02_p04: 'pending', live_policy_approval: 'pending' });
  for (const step of boundary.walkthrough) {
    for (const name of step.examples) assert.ok(examples[name], `${step.step}: ${name}`);
    assert.equal(step.stock_effect, 'none');
  }
  const source = value('reviewed-source');
  const { target, material, policy, state } = source;
  const digest = (snapshot) => createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');
  assert.equal(target.material_hash, digest(material));
  assert.deepEqual(target.record, state.reference);
  assert.equal(target.material_version, state.material_version);
  assert.equal(material.policy_version_id, policy.policy_version_id);
  assert.deepEqual(policy, value('approved-setup'));
  assert.equal(new Set(material.counters.map((counter) => counter.user_id)).size, 2);
  assert.ok(material.counters.some((counter) => !counter.is_regular_custodian));
  assert.deepEqual(source.decisions.map((decision) => decision.actor.duty_code), ['CHAPTER_HEAD', 'FINANCE']);
  for (const decision of source.decisions) {
    assert.deepEqual(decision.target, target);
    assert.deepEqual(decision.policy, policy);
    assert.equal(decision.actor.chapter_id, target.chapter_id);
  }
  const binding = value('ready-binding');
  assert.deepEqual(binding.target, target);
  assert.deepEqual(binding.evidence, value('evidence-ready').reference);
  assert.deepEqual(value('bind-input').target, target);
  assert.deepEqual(value('bind-success').data.binding, binding);
  assert.equal(value('bind-success').record.row_version, 8);
  assert.equal(value('bind-success').record.material_version, 1);
  const revised = value('revised-source');
  assert.equal(revised.target.material_version, 2);
  assert.equal(revised.target.material_hash, digest(revised.material));
  assert.notEqual(revised.target.material_hash, target.material_hash);
  assert.deepEqual(revised.decisions, [], 'affected old approval is not copied');
  assert.deepEqual(revised.previous_version, target);
  assert.equal(revised.state.states.approval, 'requires_review');
  assert.equal(material.cutoff_at, '2026-10-23T23:00:00.000000Z');
  assert.notEqual(digest({ ...material, cutoff_at: '2026-10-24T00:00:00.000000Z' }), target.material_hash);
  const withoutCutoff = structuredClone(material);
  delete withoutCutoff.cutoff_at;
  assert.equal(validator('OpeningMaterial')(withoutCutoff), false, 'approved cutoff cannot be omitted');
});

test('DOC-08: both capture methods pin recipient and actual batch independently of file bytes', () => {
  const paper = value('paper-acknowledgment');
  const canvas = value('canvas-acknowledgment');
  const digest = (snapshot) => createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');
  for (const ack of [paper, canvas]) {
    assert.equal(digest(ack.snapshot), ack.acknowledged_snapshot_hash);
    assert.equal(ack.evidence_binding.target.material_version, ack.snapshot.material_version);
    assert.deepEqual(ack.evidence_binding.target.record, ack.snapshot.record);
    assert.notEqual(ack.evidence_binding.evidence.content_hash, ack.acknowledged_snapshot_hash);
    for (const change of [
      (batch) => { batch.recipient.name = 'Different recipient'; },
      (batch) => { batch.lines[0].quantity = '3.000000'; },
      (batch) => { batch.material_version = 4; },
      (batch) => { batch.batch_id = '610'; },
    ]) {
      const changed = structuredClone(ack.snapshot);
      change(changed);
      assert.notEqual(digest(changed), ack.acknowledged_snapshot_hash);
    }
  }
  assert.equal(paper.acknowledged_snapshot_hash, canvas.acknowledged_snapshot_hash);
  assert.notEqual(paper.evidence_binding.evidence.evidence_object_id, canvas.evidence_binding.evidence.evidence_object_id);
  const validate = validator('BatchSnapshot');
  assert.equal(validate({ ...paper.snapshot, row_version: 8 }), false, 'progress is not acknowledged content');
  assert.equal(validate({ ...paper.snapshot, record: { id: '601', kind: 'BOOTH_SALE' } }), false);
  assert.equal(validate({ ...paper.snapshot, lines: [{ ...paper.snapshot.lines[0], quantity: '0.000000' }] }), false);
});

test('P00 negative cases: typed mismatches pair with redacted, stale, blocked and uncertain results', async () => {
  const cases = await readJson('../../identity-record-evidence/v1/cases.json');
  for (const scenario of cases) {
    const request = validator(scenario.input_definition);
    assert.ok(request(scenario.input), `${scenario.name}: ${ajv.errorsText(request.errors)}`);
    const response = value(scenario.result_example);
    assert.equal(response.action_result, scenario.expected_action_result);
    assert.equal(response.blocking_reason.code, scenario.expected_code);
    assert.equal(response.input_policy, 'preserve');
    assert.equal(scenario.evidence_state, 'expected');
    assert.ok(examples[scenario.server_fixture], 'server state is an expected fixture, not a live provider');
  }
  const scenario = (name) => cases.find((entry) => entry.name === name);
  assert.notEqual(scenario('wrong-chapter').input.context.chapter_id, value('current-context').chapter_id);
  assert.notDeepEqual(scenario('wrong-parent').input.line.record, value('reviewed-source').target.record);
  assert.notEqual(scenario('stale-row').input.context.expected_row_version, value('stale-row').record.row_version);
  assert.notEqual(scenario('changed-material').input.context.expected_material_version, value('revised-source').target.material_version);
  assert.equal(scenario('unready-evidence').server_fixture, 'evidence-validating');
  assert.equal(scenario('unavailable-evidence').server_fixture, 'evidence-missing');
  assert.notEqual(scenario('changed-evidence').input.evidence.object_version, value('evidence-ready').reference.object_version);
  assert.notEqual(scenario('changed-batch').input.lines[0].quantity, value('paper-acknowledgment').snapshot.lines[0].quantity);
  const provider = scenario('provider-only').input;
  assert.deepEqual(provider.duty_grants, []);
  assert.deepEqual(provider.available_actions, []);
  assert.deepEqual(provider.provider_roles, ['provisioner']);
  const forbidden = value('wrong-chapter');
  for (const field of ['chapter_id', 'record', 'operation']) assert.equal(forbidden[field], null);
  assert.equal(value('lookup-unavailable').operation.outcome, 'unknown');
  assert.equal(value('lookup-unavailable').operation.identity.action_code, value('bind-input').context.action_code);
  assert.equal(value('lookup-unavailable').operation.identity.idempotency_key, value('bind-input').context.idempotency_key);
});

test('TR-15 canonical vectors: exact escaping and Unicode agree with literal PHP-compatible bytes', async () => {
  const vectors = await readJson('../../identity-record-evidence/v1/canonical-vectors.json');
  for (const vector of vectors.valid) {
    assert.equal(JSON.stringify(vector.value), vector.canonical_json, vector.name);
    assert.equal(createHash('sha256').update(vector.canonical_json, 'utf8').digest('hex'), vector.sha256, vector.name);
    assert.ok(validator(vector.definition)(vector.value), vector.name);
  }
  for (const vector of vectors.invalid) {
    assert.equal(validator('Recipient')(JSON.parse(vector.input_json)), false, vector.name);
  }
});
