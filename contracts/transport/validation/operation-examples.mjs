import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export async function loadContract() {
  const schema = JSON.parse(await readFile(new URL('../v1/transport.schema.json', import.meta.url), 'utf8'));
  const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  for (const name of Object.keys(schema.$defs)) ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });
  const api = await SwaggerParser.validate(fileURLToPath(new URL('../v1/api-v1.json', import.meta.url)), {
    resolve: { http: false },
  });
  // Compile even definitions with no example or operation reference.
  for (const definition of Object.values(api.components?.schemas ?? {})) ajv.compile(definition);
  return { api, ajv };
}

function checkValue(ajv, schema, value, label) {
  assert.notEqual(schema, undefined, `${label}: missing schema`);
  const validate = ajv.compile(schema);
  assert.ok(validate(value), `${label}: ${ajv.errorsText(validate.errors)}`);
}

function checkBody(ajv, definition, message, label) {
  const present = Object.hasOwn(message, 'body');
  if (!definition?.content || Object.keys(definition.content).length === 0) {
    assert.equal(present, false, `${label}: body forbidden`);
    assert.equal(message.mediaType, undefined, `${label}: media type without content`);
    return;
  }
  if (!present) {
    assert.ok(label === 'request' && !definition.required, `${label}: body required`);
    assert.equal(message.mediaType, undefined, `${label}: media type without body`);
    return;
  }
  const media = definition.content[message.mediaType];
  assert.ok(media, `${label}: undocumented media type ${message.mediaType}`);
  checkValue(ajv, media.schema, message.body, label);
}

function checkHeaders(ajv, definitions, supplied = {}, label) {
  const headers = Object.fromEntries(Object.entries(supplied).map(([name, value]) => [name.toLowerCase(), value]));
  for (const [name, definition] of Object.entries(definitions)) {
    const key = name.toLowerCase();
    if (definition.required) assert.ok(Object.hasOwn(headers, key), `${label}: missing ${name}`);
    if (Object.hasOwn(headers, key)) checkValue(ajv, definition.schema, headers[key], `${label} ${name}`);
  }
}

// Examples contain parsed parameter values (IDs stay strings); this is not an HTTP adapter.
export function validateExchange(api, ajv, exchange) {
  const item = api.paths[exchange.path];
  const operation = item?.[exchange.method];
  assert.ok(httpMethods.includes(exchange.method) && operation, 'undocumented operation');
  assert.equal(exchange.operationId, operation.operationId, 'operation identity');
  const parameters = new Map();
  for (const p of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) parameters.set(`${p.in}:${p.name}`, p);
  for (const location of ['path', 'query', 'cookie', 'header']) {
    const definitions = [...parameters.values()].filter(p => p.in === location);
    const values = exchange.request[location] ?? {};
    if (location === 'header') {
      checkHeaders(ajv, Object.fromEntries(definitions.map(p => [p.name, p])), values, 'request header');
      continue;
    }
    for (const name of Object.keys(values)) assert.ok(definitions.some(p => p.name === name), `unknown ${location} parameter ${name}`);
    for (const p of definitions) {
      if (p.required) assert.ok(Object.hasOwn(values, p.name), `missing ${location} parameter ${p.name}`);
      if (Object.hasOwn(values, p.name)) checkValue(ajv, p.schema, values[p.name], `${location} ${p.name}`);
    }
  }
  const status = exchange.response.status;
  if (operation['x-invalid-request-statuses']?.includes(status)) {
    // An operation-linked validation rejection must actually contain invalid input.
    assert.equal(exchange.request.mediaType, 'application/json', 'invalid request media type');
    assert.ok(Object.hasOwn(exchange.request, 'body'), 'invalid request body missing');
    assert.throws(() => checkBody(ajv, operation.requestBody, exchange.request, 'request'),
      'validation rejection requires invalid request input');
  } else checkBody(ajv, operation.requestBody, exchange.request, 'request');
  assert.ok(Number.isInteger(status) && status >= 100 && status <= 599, 'invalid response status');
  const response = operation.responses[status] ?? operation.responses[`${Math.floor(status / 100)}XX`] ?? operation.responses.default;
  assert.ok(response, `undocumented response status ${status}`);
  checkHeaders(ajv, response.headers ?? {}, exchange.response.headers, 'response header');
  if (exchange.method === 'head' || [204, 304].includes(status)) {
    assert.equal(Object.hasOwn(exchange.response, 'body'), false, 'bodyless response');
    assert.equal(exchange.response.mediaType, undefined, 'bodyless media type');
  } else checkBody(ajv, response, exchange.response, 'response');
}
