import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('runtime metadata CLI reproduces the committed artifact and rejects drift', () => {
  const generator = new URL('../generate-runtime.mjs', import.meta.url);
  const run = args => spawnSync(process.execPath, [fileURLToPath(generator), ...args], { encoding: 'utf8' });
  const checked = run(['--check']);
  assert.equal(checked.status, 0, checked.stderr);
  const directory = mkdtempSync(join(tmpdir(), 'ysp-contract-'));
  try {
    const target = join(directory, 'runtime.json');
    assert.equal(run(['--output', target]).status, 0);
    const metadata = JSON.parse(readFileSync(target));
    assert.equal(metadata.operations.signIn.path, '/api/v1/session/sign-in');
    assert.equal(metadata.operations.initializeCsrf.path, '/csrf-cookie');
    assert.equal(run(['--check', '--output', target]).status, 0);
    writeFileSync(target, '{}');
    assert.notEqual(run(['--check', '--output', target]).status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runtime generation has identical source identities in LF and CRLF checkouts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-line-endings-'));
  try {
    const generator = join(directory, 'generate-runtime.mjs');
    writeFileSync(generator, readFileSync(new URL('../generate-runtime.mjs', import.meta.url)));
    mkdirSync(join(directory, 'v1'));
    const outputs = [];
    for (const newline of ['\n', '\r\n']) {
      for (const name of ['api-v1.json', 'transport.schema.json', 'p02-action-catalogue.json']) {
        const source = readFileSync(new URL(`../v1/${name}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
        writeFileSync(join(directory, 'v1', name), source.replaceAll('\n', newline));
      }
      const target = join(directory, 'runtime.json');
      const result = spawnSync(process.execPath, [generator, '--output', target], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      outputs.push(readFileSync(target, 'utf8'));
    }
    assert.equal(outputs[0], outputs[1]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
