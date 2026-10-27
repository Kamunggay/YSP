import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../run-http-tests.mjs', import.meta.url));
const environment = { ...process.env };
// These subprocesses emulate standalone CLI invocations, not nested test workers.
delete environment.NODE_TEST_CONTEXT;

test('focused selection fails when no real test matches instead of reporting a file-level pass', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-test-selection-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const fixture = join(directory, 'sample.test.mjs');
  writeFileSync(fixture, "import { test } from 'node:test'; test('known behavior', () => {});\n");
  const result = spawnSync(process.execPath, [runner, fixture, 'missing behavior'], { encoding: 'utf8', env: environment });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /No tests matched/);
});

test('focused selection runs the named behavior and propagates genuine test failures', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-test-selection-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const fixture = join(directory, 'sample.test.mjs');
  writeFileSync(fixture, "import { test } from 'node:test'; test('passes', () => {}); test('fails', () => { throw Error('real failure'); });\n");
  const selected = spawnSync(process.execPath, [runner, fixture, '^passes$'], { encoding: 'utf8', env: environment });
  assert.equal(selected.status, 0, selected.stdout + selected.stderr);
  assert.match(selected.stdout, /passes/);
  const failed = spawnSync(process.execPath, [runner, fixture, '^fails$'], { encoding: 'utf8', env: environment });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /real failure/);
});
