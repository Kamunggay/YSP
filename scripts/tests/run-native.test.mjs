import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../run-native.mjs', import.meta.url));

test('native stderr progress remains capturable without changing a successful exit', () => {
  const result = spawnSync(process.execPath, [runner, process.execPath, '-e',
    "process.stdout.write('started\\n'); process.stderr.write('building\\n');"], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /started/);
  assert.match(result.stdout, /building/);
  assert.equal(result.stderr, '');
});

test('native failures preserve exit status and quoted arguments without shell interpretation', () => {
  const literal = 'spaces "quotes" $HOME $(literal) `ticks`';
  const argumentsJson = Buffer.from(JSON.stringify([process.execPath, '-e',
    'process.stdout.write(process.argv[1]); process.exitCode = 7;', literal])).toString('base64');
  const result = spawnSync(process.execPath, [runner, '--encoded-arguments', argumentsJson], { encoding: 'utf8' });
  assert.equal(result.status, 7);
  assert.equal(result.stdout, literal);
});
