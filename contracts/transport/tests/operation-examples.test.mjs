import assert from 'node:assert/strict';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const lookup = {
  path: '/chapters/{chapter_id}/operations/by-key', method: 'get',
  operationId: 'lookupOperationByKey',
  request: { path: { chapter_id: '1' }, query: { action_code: 'records.submit', idempotency_key: 'attempt-01' } },
  response: { status: 200, mediaType: 'application/json', headers: { 'cache-control': 'no-store' },
    body: api.paths['/chapters/{chapter_id}/operations/by-key'].get.responses['200'].content['application/json'].examples['same-payload-replay'].value },
};

test('TR-03: formal lookup exchange validates against its actual operation', () => {
  validateExchange(api, ajv, lookup);
  for (const change of [
    e => { e.operationId = 'lookupOperationById'; },
    e => { e.method = 'post'; },
    e => { e.request.path.chapter_id = 1; },
    e => { delete e.request.query.action_code; },
    e => { e.request.query.operation_id = 'unexpected'; },
    e => { e.response.status = 401; },
    e => { e.response.status = 201; },
    e => { e.response.mediaType = 'text/html'; },
    e => { e.response.headers['cache-control'] = 'public'; },
    e => { delete e.response.body; },
    e => { e.request.body = {}; e.request.mediaType = 'application/json'; },
  ]) {
    const invalid = structuredClone(lookup);
    change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  }
});

test('TR-03: a synthetic operation validates request media, headers and bodyless responses', () => {
  // Test-only operation: no invented P02 endpoint is published.
  const synthetic = { paths: { '/fixture/{id}': {
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    post: {
      operationId: 'fixture',
      parameters: [{ in: 'header', name: 'X-Proof', required: true, schema: { const: 'proof' } }],
      requestBody: { required: true, content: { 'application/json': { schema: {
        type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string' } },
      } } } },
      responses: { 204: { description: 'No body', headers: { 'X-Revision': { required: true, schema: { const: '1' } } } } },
    },
  } } };
  const example = { path: '/fixture/{id}', method: 'post', operationId: 'fixture',
    request: { path: { id: '1' }, header: { 'x-proof': 'proof' }, mediaType: 'application/json', body: { name: 'Example' } },
    response: { status: 204, headers: { 'x-revision': '1' } },
  };
  validateExchange(synthetic, ajv, example);
  for (const change of [
    e => { delete e.request.body; },
    e => { e.request.body.name = 1; },
    e => { e.request.mediaType = 'text/plain'; },
    e => { e.request.header = {}; },
    e => { e.request.header['x-proof'] = 'wrong'; },
    e => { e.response.headers = {}; },
    e => { e.response.headers['x-revision'] = '2'; },
    e => { e.response.body = null; },
    e => { e.response.mediaType = 'application/json'; },
  ]) {
    const invalid = structuredClone(example);
    change(invalid);
    assert.throws(() => validateExchange(synthetic, ajv, invalid));
  }
});
