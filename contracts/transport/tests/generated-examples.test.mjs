import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExamples } from '../generate-examples.mjs';

test('TR-03: documentation examples use exchange response bodies without request data', () => {
  assert.deepEqual(buildExamples('session', [
    { name: 'bootstrap', request: { body: { password: 'synthetic' } }, response: { status: 200, body: { state: 'signed_out' } } },
    { name: 'logout', response: { status: 204 } },
  ]), { bootstrap: { summary: 'bootstrap', value: { state: 'signed_out' } } });
});

test('TR-03: cross-surface provisioning scenarios keep their existing example ownership', () => {
  assert.deepEqual(buildExamples('provisioning', [
    { name: 'provider', path: '/provider/provisioning-context', response: { body: { authority_version: 1 } } },
    { name: 'bootstrap', path: '/session', response: { body: { state: 'authenticated' } } },
  ]), { provider: { value: { authority_version: 1 } } });
});

test('TR-03: duplicate names cannot overwrite documentation and falsy bodies remain examples', () => {
  assert.throws(() => buildExamples('session', [
    { name: 'duplicate', response: { body: {} } }, { name: 'duplicate', response: { body: {} } },
  ]), /duplicate exchange names/);
  assert.deepEqual(buildExamples('session', [{ name: 'empty', response: { body: null } }]),
    { empty: { summary: 'empty', value: null } });
});
