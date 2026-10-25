import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadContract, httpMethods, validateExchange } from '../validation/operation-examples.mjs';
import { jsonDigest } from './fixtures/stage-0-identity.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const schema = await readJson('../v1/transport.schema.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const validator = (name) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });

test('Q3/Q4: requests identify action and chapter and keep row/material versions distinct', () => {
  const request = {
    chapter_id: '1', action_code: 'records.submit', idempotency_key: 'attempt-01',
    record: { id: '9007199254740993', kind: 'IPC' },
    expected_row_version: 7, expected_material_version: 3,
  };
  const validate = validator('CommandContext');
  assert.ok(validate(request), ajv.errorsText(validate.errors));
  for (const name of ['chapter_id', 'action_code', 'idempotency_key', 'expected_row_version']) {
    const invalid = structuredClone(request);
    delete invalid[name];
    assert.equal(validate(invalid), false, `${name} must not be guessed`);
  }
  assert.equal(validate({ ...request, expected_version: 7 }), false);
  assert.equal(validate({ ...request, actor_id: '42', approval_state: 'approved' }), false);

  const lookup = validator('OperationLookup');
  assert.ok(lookup({ chapter_id: '1', action_code: 'records.submit', idempotency_key: 'attempt-01' }));
  assert.ok(lookup({ chapter_id: '1', operation_id: '01K8A6J0A00000000000000001' }));
  assert.equal(lookup({ chapter_id: '1', idempotency_key: 'attempt-01' }), false);
  assert.equal(lookup({ operation_id: '01K8A6J0A00000000000000001' }), false);
  assert.equal(lookup({ chapter_id: '1', action_code: 'records.submit', idempotency_key: 'attempt-01',
    operation_id: '01K8A6J0A00000000000000001' }), false);
});

test('TR-07: exact IDs, unit quantities, posted PHP and UTC instants cross JSON intact', () => {
  const cases = [
    ['Id', '9007199254740993', true],
    ['Id', '18446744073709551615', true],
    ['Id', '18446744073709551616', false],
    ['Id', 9007199254740992, false],
    ['Id', '01', false],
    ['Id', '0', false],
    ['Id', '1\n', false],
    ['Quantity', '99999999999999.123456', true],
    ['Quantity', '1e3', false],
    ['Quantity', '2\n', false],
    ['Quantity', 0.1, false],
    ['Quantity', '1.1234567', false],
    ['Quantity', '100000000000000', false],
    ['UnitQuantity', { value: '2.000000', quantity_scale: 0 }, true],
    ['UnitQuantity', { value: '2.5', quantity_scale: 0 }, false],
    ['UnitQuantity', { value: '2.125000', quantity_scale: 3 }, true],
    ['UnitQuantity', { value: '2.1251', quantity_scale: 3 }, false],
    ['PostedMoney', { currency: 'PHP', amount: '999999999999999999.99' }, true],
    ['PostedMoney', { currency: 'PHP', amount: '10.0' }, false],
    ['PostedMoney', { currency: 'PHP', amount: '10.00\n' }, false],
    ['PostedMoney', { currency: 'PHP', amount: '10.005' }, false],
    ['PostedMoney', { currency: 'USD', amount: '10.00' }, false],
    ['UtcInstant', '2026-10-24T06:15:30.123456Z', true],
    ['UtcInstant', '2026-10-24T14:15:30+08:00', false],
    ['UtcInstant', '2026-02-30T00:00:00.000000Z', false],
  ];
  for (const [name, value, expected] of cases) {
    const validate = validator(name);
    assert.equal(validate(JSON.parse(JSON.stringify(value))), expected,
      `${name} ${JSON.stringify(value)}: ${ajv.errorsText(validate.errors)}`);
  }
});

test('TR-03: OpenAPI and every reusable definition compile, including HTTP lookup responses', async () => {
  const { api, ajv: operationAjv } = await loadContract();
  for (const name of Object.keys(schema.$defs)) validator(name);
  for (const path of Object.values(api.paths)) {
    for (const method of httpMethods.filter(method => path[method])) {
      for (const response of Object.values(path[method].responses)) {
        for (const media of Object.values(response.content ?? {})) {
          const check = operationAjv.compile(media.schema);
          for (const example of Object.values(media.examples ?? {})) {
            assert.ok(check(example.value), operationAjv.errorsText(check.errors));
          }
        }
      }
    }
  }
  const exchanges = [
    ...await readJson('../v1/operation-examples.json'),
    ...await readJson('../v1/session-exchanges.json'),
    ...await readJson('../v1/enrollment-exchanges.json'),
    ...await readJson('../v1/mfa-recovery-exchanges.json'),
    ...await readJson('../v1/chapter-context-exchanges.json'),
    ...await readJson('../v1/membership-exchanges.json'),
  ];
  assert.equal(new Set(exchanges.map(e => e.name)).size, exchanges.length, 'unique exchange names');
  for (const example of exchanges) validateExchange(api, operationAjv, example);
  for (const [path, item] of Object.entries(api.paths)) {
    for (const method of httpMethods.filter(method => item[method])) {
      for (const [status, response] of Object.entries(item[method].responses)) {
        for (const [mediaType, media] of Object.entries(response.content ?? {})) {
          for (const example of Object.values(media.examples ?? {})) {
            assert.ok(exchanges.some(e => e.path === path && e.method === method
              && String(e.response.status) === status && e.response.mediaType === mediaType
              && JSON.stringify(e.response.body) === JSON.stringify(example.value)),
            `${method} ${path} ${status}: missing operation exchange`);
          }
        }
      }
    }
  }
});

test('TR-03/DOC-11: Stage 0 lookup scopes, identities and response semantics remain compatible', async () => {
  const { api } = await loadContract();
  const baseline = await readJson('./fixtures/stage-0-compatibility.json');
  assert.deepEqual(api.servers, baseline.servers);
  assert.deepEqual(api.security, baseline.security);
  assert.equal(jsonDigest(api.components.securitySchemes.chapterSession), baseline.chapterSession);
  for (const [path, expected] of Object.entries(baseline.lookups)) {
    const preserved = structuredClone(api.paths[path]);
    delete preserved.get['x-session-consumer'];
    const media = preserved.get.responses['200'].content['application/json'];
    // Compare the original branches and every old status/selector/example exactly;
    // membership branches are independently validated by membership tests.
    assert.equal(media.schema.oneOf.length, 4);
    media.schema.oneOf = media.schema.oneOf.slice(0, 2);
    for (const response of Object.values(preserved.get.responses)) {
      for (const media of Object.values(response.content ?? {})) {
        for (const name of Object.keys(media.examples ?? {})) {
          if (name.includes('-membership')) delete media.examples[name];
        }
      }
    }
    assert.equal(jsonDigest(preserved), expected, path);
  }
  for (const [name, expected] of Object.entries(baseline.definitions)) assert.equal(jsonDigest(schema.$defs[name]), expected, name);
  const examples = await readJson('../v1/examples.json');
  for (const [name, expected] of Object.entries(baseline.examples)) assert.equal(jsonDigest(examples[name]), expected, name);
});

test('TR-03/DOC-11/UX-02: examples distinguish terminal outcomes, corrections and uncertainty', async () => {
  const validate = validator('ActionResult');
  const examples = await readJson('../v1/examples.json');
  for (const [name, example] of Object.entries(examples)) {
    const check = validator(example['x-definition']);
    assert.ok(check(example.value), `${name}: ${ajv.errorsText(check.errors)}`);
  }
  const value = (name) => structuredClone(examples[name].value);
  const success = value('success');
  assert.equal(validate({ ...success, blocking_reason: { code: 'BLOCKED', message: 'Cannot proceed' } }), false);
  assert.equal(validate({ ...success, operation: null }), false);
  const stale = value('stale-progress');
  assert.equal(validate({ ...stale, record: null }), false);
  assert.equal(validate({ ...stale, input_policy: 'may_clear' }), false);
  const forbidden = value('forbidden');
  assert.equal(validate({ ...forbidden, record: success.record }), false);
  assert.equal(validate({ ...forbidden, operation: success.operation }), false);
  assert.equal(validate({ ...forbidden, data: { balance: '10' } }), false);
  const uncertain = value('uncertain-not-visible');
  assert.equal(validate({ ...uncertain, operation: { ...success.operation, outcome: 'committed' } }), false);
  assert.equal(validate({ ...uncertain, permitted_next_actions: [{ code: 'correct_input', label: 'Send again' }] }), false);
  assert.equal(validate({ ...uncertain, lookup_state: null }), false);
  const replay = value('same-payload-replay');
  assert.equal(replay.operation.identity.operation_id, success.operation.identity.operation_id);
  assert.equal(replay.operation.committed_at, success.operation.committed_at);
  assert.equal(replay.operation.replayed, true);
});

test('TR-03: standalone Operation cannot contradict terminal or unknown outcome', async () => {
  const examples = await readJson('../v1/examples.json');
  const validate = validator('Operation');
  const terminal = examples.success.value.operation;
  const unknown = examples['uncertain-not-visible'].value.operation;
  assert.ok(validate(terminal));
  assert.ok(validate(unknown));
  assert.equal(validate({ ...terminal, committed_at: null }), false);
  assert.equal(validate({ ...terminal, identity: { ...terminal.identity, operation_id: null } }), false);
  assert.equal(validate({ ...unknown, committed_at: terminal.committed_at }), false);
  assert.equal(validate({ ...unknown, replayed: true }), false);
});

test('P00 consumer walkthrough: field address, exact input, versions and Manila display remain usable', async () => {
  const examples = await readJson('../v1/examples.json');
  const value = (name) => examples[name].value;
  const attempt = value('command-context');
  assert.equal(attempt.record.id, '9007199254740993');
  assert.equal(value('stale-progress').record.row_version, 8);
  assert.equal(value('stale-progress').record.material_version, attempt.expected_material_version);
  assert.equal(value('stale-material').record.material_version, 4);
  assert.equal(value('stale-material').record.states.approval, 'requires_review');

  // Illustrative body only: no endpoint/client/posting implementation is claimed.
  const draft = { quantity: '2.5', notes: 'Retain the entered explanation' };
  const blocked = value('blocked-field');
  const fieldName = blocked.field_feedback[0].path.slice(1);
  assert.equal(draft[fieldName], '2.5', 'feedback addresses the existing form field');
  assert.equal(blocked.input_policy, 'preserve');
  assert.equal(blocked.permitted_next_actions[0].code, 'correct_input');
  for (const example of Object.values(examples).filter((entry) => entry['x-definition'] === 'ActionResult')) {
    const validate = validator('ActionResult');
    assert.ok(validate(example.value));
    if (example.value.action_result !== 'success') {
      assert.equal(validate({ ...example.value, input_policy: 'may_clear' }), false,
        `${example.summary} must require preserving client input`);
    }
  }

  const times = value('business-times');
  const display = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(display.formatToParts(new Date(times.occurred_at))
    .map(({ type, value: part }) => [type, part]));
  assert.equal(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`, '2026-10-24 07:30');
  assert.equal(new Date(Date.parse(times.occurred_at) + 48 * 60 * 60 * 1000).toISOString(), '2026-10-25T23:30:00.000Z');
  assert.equal(times.posted_at, '2026-10-24T04:00:00.000001Z', 'keep the six-place source instant');
});
