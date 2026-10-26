import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
