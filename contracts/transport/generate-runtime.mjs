import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const sources = {};
const documents = {};
for (const name of ['api-v1.json', 'transport.schema.json', 'p02-action-catalogue.json']) {
  const source = (await readFile(new URL(`./v1/${name}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  sources[name] = createHash('sha256').update(source).digest('hex');
  documents[name] = JSON.parse(source);
}
const api = documents['api-v1.json'];
const definitions = documents['transport.schema.json'].$defs;
const wanted = new Set(['getSession', 'signIn', 'signOut', 'initializeCsrf']);
const operations = {};
for (const [path, item] of Object.entries(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!wanted.has(operation.operationId)) continue;
    const base = (operation.servers ?? item.servers ?? api.servers)[0].url;
    operations[operation.operationId] = { method: method.toUpperCase(), path: base.replace(/\/$/, '') + path };
  }
}
assert.equal(Object.keys(operations).length, wanted.size);
const selected = {};
function include(name) {
  if (selected[name]) return;
  assert.ok(definitions[name], name);
  selected[name] = definitions[name];
  for (const match of JSON.stringify(definitions[name]).matchAll(/#\/\$defs\/([^"\s]+)/g)) include(match[1]);
}
for (const name of ['SessionSnapshot', 'SignInRequest', 'SessionUnauthorized', 'SessionForbidden',
  'SessionCsrfFailure', 'SessionThrottled', 'SessionUnavailable', 'SignInInvalid']) include(name);
const output = JSON.stringify({ sources, operations, session: api['x-session-contract'],
  duties: documents['p02-action-catalogue.json'].duties, $defs: selected }, null, 2) + '\n';
const outputIndex = process.argv.indexOf('--output');
const target = outputIndex >= 0 ? process.argv[outputIndex + 1]
  : fileURLToPath(new URL('../../backend/resources/contracts/session-runtime.json', import.meta.url));
if (process.argv.includes('--check')) {
  assert.equal((await readFile(target, 'utf8')).replaceAll('\r\n', '\n'), output, 'Runtime contract drift; run node contracts/transport/generate-runtime.mjs');
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
}
