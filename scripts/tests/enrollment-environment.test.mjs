import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const shell = process.platform === 'win32' ? 'powershell' : 'pwsh';
const root = resolve(import.meta.dirname, '../..');
function invoke(action, project, signals, extra = []) {
  const child = spawn(shell, ['-NoProfile', '-File', 'scripts/tests/fixtures/enrollment-native.ps1',
    '-Action', action, '-Project', project, '-Signals', signals, ...extra], { cwd: root, windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  return { child, done: new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('close', code => accept({ code, output }));
  }) };
}
async function waitFor(path) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { await access(path); return; } catch { await new Promise(r => setTimeout(r, 25)); }
  }
  assert.fail('Verifier did not reach the migration barrier');
}

test('Test rejects overlap while Start owns a migration, then accepts the ready environment', { timeout: 20000 }, async () => {
  const signals = await mkdtemp(resolve(root, '.runtime/environment-test-'));
  const project = `ysp-enrollment-check-lock-${process.pid}`;
  const start = invoke('Start', project, signals);
  try {
    await waitFor(resolve(signals, 'held'));
    for (const action of ['Test', 'Start', 'Stop']) {
      const contender = await invoke(action, project, signals).done;
      assert.notEqual(contender.code, 0, `${action} must reject while Start is migrating`);
      assert.match(contender.output, /already running/);
    }
    assert.equal((await readFile(resolve(signals, 'migrations'), 'utf8')).trim(), 'Start');
    await writeFile(resolve(signals, 'release'), 'release');
    assert.equal((await start.done).code, 0);
    assert.equal((await invoke('Test', project, signals).done).code, 0);
  } finally {
    await writeFile(resolve(signals, 'release'), 'release');
    await start.done;
    await invoke('Stop', project, signals).done;
    await rm(signals, { recursive: true, force: true });
  }
});

test('interrupted Start retains ownership for Stop but cannot be tested', { timeout: 20000 }, async () => {
  const signals = await mkdtemp(resolve(root, '.runtime/environment-test-'));
  const project = `ysp-enrollment-check-interrupt-${process.pid}`;
  const start = invoke('Start', project, signals);
  try {
    await waitFor(resolve(signals, 'held'));
    start.child.kill();
    await start.done;
    const test = await invoke('Test', project, signals).done;
    assert.notEqual(test.code, 0);
    assert.match(test.output, /not ready/);
    const state = JSON.parse((await readFile(resolve(root, `.runtime/${project}.json`), 'utf8')).replace(/^\uFEFF/, ''));
    assert.equal(state.Project, project);
    assert.equal((await invoke('Stop', project, signals).done).code, 0);
  } finally {
    start.child.kill();
    await start.done;
    await invoke('Stop', project, signals).done;
    await rm(signals, { recursive: true, force: true });
  }
});

test('failed Test migrations invalidate readiness and preserve explicit cleanup', { timeout: 20000 }, async () => {
  const signals = await mkdtemp(resolve(root, '.runtime/environment-test-'));
  const project = `ysp-enrollment-check-failure-${process.pid}`;
  await writeFile(resolve(signals, 'release'), 'release');
  try {
    assert.equal((await invoke('Start', project, signals).done).code, 0);
    assert.notEqual((await invoke('Test', project, signals, ['-FailMigration']).done).code, 0);
    const retry = await invoke('Test', project, signals).done;
    assert.notEqual(retry.code, 0);
    assert.match(retry.output, /not ready/);
    assert.equal((await invoke('Stop', project, signals).done).code, 0);
  } finally {
    await invoke('Stop', project, signals).done;
    await rm(signals, { recursive: true, force: true });
  }
});

test('failed cleanup retains ownership until a successful Stop', { timeout: 20000 }, async () => {
  const signals = await mkdtemp(resolve(root, '.runtime/environment-test-'));
  const project = `ysp-enrollment-check-cleanup-${process.pid}`;
  await writeFile(resolve(signals, 'release'), 'release');
  try {
    assert.equal((await invoke('Start', project, signals).done).code, 0);
    assert.notEqual((await invoke('Stop', project, signals, ['-FailCleanup']).done).code, 0);
    await access(resolve(root, `.runtime/${project}.json`));
    assert.notEqual((await invoke('Start', project, signals).done).code, 0);
    assert.equal((await invoke('Stop', project, signals).done).code, 0);
    await assert.rejects(access(resolve(root, `.runtime/${project}.json`)));
  } finally {
    await invoke('Stop', project, signals).done;
    await rm(signals, { recursive: true, force: true });
  }
});

test('interrupted Test requires cleanup before further tests can enter the environment', { timeout: 20000 }, async () => {
  const signals = await mkdtemp(resolve(root, '.runtime/environment-test-'));
  const project = `ysp-enrollment-check-testkill-${process.pid}`;
  await writeFile(resolve(signals, 'release'), 'release');
  let active;
  try {
    assert.equal((await invoke('Start', project, signals).done).code, 0);
    active = invoke('Test', project, signals, ['-HoldTests']);
    await waitFor(resolve(signals, 'tests-held'));
    assert.notEqual((await invoke('Test', project, signals).done).code, 0);
    active.child.kill();
    await active.done;
    const retry = await invoke('Test', project, signals).done;
    assert.notEqual(retry.code, 0);
    assert.match(retry.output, /not ready/);
    assert.equal((await invoke('Stop', project, signals).done).code, 0);
  } finally {
    if (active) { active.child.kill(); await active.done; }
    await invoke('Stop', project, signals).done;
    await rm(signals, { recursive: true, force: true });
  }
});
