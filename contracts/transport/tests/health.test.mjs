import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkHealth } from '../../../frontend/src/health.ts';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const schema = await readJson('../../health/v1/health.schema.json');
const examples = await readJson('../../health/v1/examples.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validate = ajv.compile(schema);

test('TR-03: formal health examples remain compatible with the actual typed client', async t => {
  for (const example of examples) {
    assert.ok(validate(example.response), ajv.errorsText(validate.errors));
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(example.response.body), {
      status: example.response.status,
    }));
    assert.deepEqual(await checkHealth(new AbortController().signal), example.clientResult);
    t.mock.restoreAll();
  }
  assert.deepEqual(examples.map(example => example.response.status).sort(), [200, 503]);
});

test('TR-03: health cannot silently widen status, fields or expose diagnostic details', () => {
  for (const response of [
    { status: 201, body: { status: 'ok', database: 'ok' } },
    { status: 200, body: { status: 'ok', database: 'unavailable' } },
    { status: 200, body: { status: 'ok', database: 'ok', diagnostic: 'private' } },
    { status: 503, body: { status: 'unavailable', database: 'unavailable', exception: 'private' } },
  ]) assert.equal(validate(response), false);
});
