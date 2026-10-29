import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const shell = process.platform === 'win32' ? 'powershell' : 'pwsh';
function run(args = [], isolated = false) {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-verification-'));
  try {
    const signals = join(directory, 'calls');
    if (isolated) {
      mkdirSync(join(directory, 'scripts/tests/fixtures'), { recursive: true });
      for (const file of ['scripts/verify.ps1', 'scripts/tests/fixtures/verification-native.ps1']) {
        copyFileSync(join(root, file), join(directory, file));
      }
    }
    const result = spawnSync(shell, ['-NoProfile', '-File', 'scripts/tests/fixtures/verification-native.ps1',
      '-Signals', signals, ...args], { cwd: isolated ? directory : root, encoding: 'utf8', windowsHide: true });
    let calls = '';
    try { calls = readFileSync(signals, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { code: result.status, output: result.stdout + result.stderr, calls };
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('invalid and conflicting stage selections fail before executing any prerequisite', () => {
  for (const args of [['-Stage', 'unknown'], ['-From', 'unknown'], ['-Stage', 'backend', '-From', 'sessions'], ['-Stage', '']]) {
    const result = run(args);
    assert.notEqual(result.code, 0, result.output);
    assert.equal(result.calls, '', result.calls);
  }
});

test('one backend stage runs preflight and its existing child without unrelated checks', () => {
  const result = run(['-Stage', 'backend']);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(result.calls.trim().split(/\r?\n/).map(line => line.split(' ')[0]),
    ['verify-preflight.ps1', 'verify-backend.ps1']);
  assert.match(result.output, /Partial verification passed/);
  assert.doesNotMatch(result.output, /Full verification passed|Combined verification passed/);
});

const order = ['preflight', 'toolchain', 'script-tests', 'contracts', 'client', 'backend', 'sessions', 'enrollment', 'same-origin'];
function stages(result) {
  return [...result.output.matchAll(/\[verification-stage\] ([a-z-]+)/g)].map(match => match[1]);
}

test('From accepts case-insensitive names and runs the ordered suffix with prerequisites once', () => {
  const result = run(['-From', 'SESSIONS']);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(stages(result), ['preflight', 'sessions', 'enrollment', 'toolchain', 'same-origin']);
  assert.match(result.calls, /verify-enrollment.ps1 -Action Run/);
  assert.match(result.calls, /npm ci --prefix contracts\/transport --ignore-scripts/);
  assert.match(result.output, /Partial verification passed/);
  assert.doesNotMatch(result.output, /Full verification passed/);
});

test('no arguments runs every stage in order and reports a full pass', () => {
  const result = run();
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(stages(result), order);
  assert.equal((result.calls.match(/verify-toolchain.ps1/g) ?? []).length, 1);
  assert.equal((result.calls.match(/npm ci /g) ?? []).length, 1);
  assert.match(result.calls, /node --test scripts\/tests\/verification.test.mjs scripts\/tests\/run-native.test.mjs scripts\/tests\/run-http-tests.test.mjs scripts\/tests\/enrollment-environment.test.mjs/);
  assert.match(result.output, /Full verification passed/);
});

test('a failed child stops the suffix, preserves its status and prints an executable targeted rerun', () => {
  const result = run(['-From', 'backend', '-Fail', 'verify-sessions.ps1']);
  assert.equal(result.code, 17, result.output);
  assert.deepEqual(stages(result), ['preflight', 'backend', 'sessions']);
  assert.match(result.output, /Verification failed at stage: sessions/);
  assert.match(result.output, /Targeted rerun: (?:powershell.exe|pwsh) -NoProfile -File "[^"]+verify.ps1" -Stage sessions/);
  assert.doesNotMatch(result.output, /verification passed/i);
  const rerun = run(['-Stage', 'sessions']);
  assert.equal(rerun.code, 0, rerun.output);
  assert.deepEqual(stages(rerun), ['preflight', 'sessions']);
});

test('a selected consumer prepares the current image without rerunning contracts or client checks', () => {
  const result = run(['-Stage', 'same-origin']);
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(stages(result), ['preflight', 'toolchain', 'same-origin']);
  assert.match(result.calls, /verify-same-origin.ps1 -BrowserImage ysp-verification:local/);
  const failure = run(['-Stage', 'same-origin', '-Fail', 'verify-toolchain.ps1']);
  assert.equal(failure.code, 17, failure.output);
  assert.deepEqual(stages(failure), ['preflight', 'toolchain']);
  assert.match(failure.output, /Verification failed at stage: toolchain/);
  assert.match(failure.output, /-Stage toolchain/);
  assert.doesNotMatch(failure.calls, /verify-same-origin/);
});

test('every named stage runs only its declared prerequisites and stays partial', () => {
  const prerequisites = {
    preflight: [], toolchain: ['preflight'], 'script-tests': ['preflight'],
    contracts: ['preflight', 'toolchain'], client: ['preflight', 'toolchain'],
    backend: ['preflight'], sessions: ['preflight'], enrollment: ['preflight'],
    'same-origin': ['preflight', 'toolchain'],
  };
  for (const name of order) {
    const result = run(['-Stage', name]);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(stages(result), [...prerequisites[name], name]);
    assert.match(result.output, /Partial verification passed/);
    assert.doesNotMatch(result.output, /Full verification passed/);
  }
});

test('native and setup failures stop before later checks and retain their real status', () => {
  for (const [stage, executable, code] of [['client', 'docker', 23], ['script-tests', 'node', 24], ['enrollment', 'npm', 25]]) {
    const result = run(['-From', stage, '-Fail', executable]);
    assert.equal(result.code, code, result.output);
    assert.equal(stages(result).at(-1), stage);
    assert.match(result.output, new RegExp(`Verification failed at stage: ${stage}`));
    assert.match(result.output, new RegExp(`-Stage ${stage}`));
    assert.doesNotMatch(result.output, /verification passed/i);
    if (executable === 'npm') assert.doesNotMatch(result.calls, /verify-enrollment.ps1/);
  }
  const preflight = run(['-From', 'backend', '-Fail', 'verify-preflight.ps1']);
  assert.equal(preflight.code, 17, preflight.output);
  assert.deepEqual(stages(preflight), ['preflight']);
  assert.match(preflight.output, /-Stage preflight/);
});

test('script regressions prepare their runtime directory in a fresh checkout', () => {
  const result = run(['-Stage', 'script-tests'], true);
  assert.equal(result.code, 0, result.output);
  assert.match(result.calls, /node --test/);
  assert.match(result.output, /Partial verification passed/);
});
