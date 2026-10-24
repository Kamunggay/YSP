import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const checker = fileURLToPath(new URL('../../full-mvp-coverage/check.mjs', import.meta.url));
const indexPath = fileURLToPath(new URL('../../full-mvp-coverage/v1/index.json', import.meta.url));

function checkMutation(mutate) {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-coverage-'));
  try {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    mutate(index);
    const path = join(directory, 'index.json');
    writeFileSync(path, JSON.stringify(index));
    return spawnSync(process.execPath, [checker, '--snapshot', '--index', path], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('frozen full-MVP index checks mappings without certifying acceptance', () => {
  const result = checkMutation(() => {});
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'snapshot');
  assert.equal(report.sourceFreshness, 'not-checked');
  assert.equal(report.counts.nodes, 87);
  assert.equal(report.counts.branches, 40);
  assert.equal(report.counts.acceptance, 35);
  assert.equal(report.acceptance, 'pending');
});

test('missing negative branch fails with its source and affected package', () => {
  const result = checkMutation(index => {
    index.mappings.branches = index.mappings.branches.filter(row => row.key !== 'S4-12:NO');
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /S4-12:NO/);
  assert.match(result.stdout, /P17/);
  assert.match(result.stdout, /FLOWCHART-SOURCE-INVENTORY/);
});

test('unknown owner, orphan requirement and dangling evidence are rejected', () => {
  const result = checkMutation(index => {
    index.mappings.nodes.find(row => row.key === 'S1-01').packages = ['P99'];
    index.mappings.requirements = index.mappings.requirements.filter(row => row.key !== 'TR-29');
    index.mappings.acceptance.find(row => row.key === 'AC-22').relatedEvidence = ['missing-evidence'];
  });
  assert.equal(result.status, 1);
  for (const text of ['P99', 'TR-29', 'missing-evidence', 'AC-22']) assert.ok(result.stdout.includes(text), result.stdout);
});

test('a contract pass cannot promote a pilot acceptance scenario', () => {
  const result = checkMutation(index => {
    index.mappings.acceptance.find(row => row.key === 'AC-04').status = 'passed';
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /AC-04/);
  assert.match(result.stdout, /pending/);
});

test('unsupported owner reassignment and an integration dependency cycle fail', () => {
  const result = checkMutation(index => {
    index.mappings.nodes.find(row => row.key === 'S1-02').packages = ['P28'];
    index.packages.find(row => row.key === 'P01').dependencies.push({ provider: 'P29', scope: 'integration', reason: 'invalid future prerequisite' });
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /S1-02/);
  assert.match(result.stdout, /cycle/);
});

test('frozen revision and rendered review survive both LF and CRLF checkouts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ysp-coverage-line-endings-'));
  const root = resolve(dirname(checker), '../..');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const files = [
    'contracts/full-mvp-coverage/check.mjs', 'contracts/full-mvp-coverage/inventory.mjs',
    'contracts/full-mvp-coverage/render.mjs', 'contracts/full-mvp-coverage/ownership.mjs', 'contracts/full-mvp-coverage/v1/index.json',
    'contracts/full-mvp-coverage/v1/source-inventory.json', 'contracts/full-mvp-coverage/v1/review-index.md',
    ...index.evidence.map(row => row.artifact),
  ];
  try {
    for (const newline of ['\n', '\r\n']) {
      for (const file of files) {
        const target = resolve(directory, file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', newline));
      }
      const check = spawnSync(process.execPath, [resolve(directory, 'contracts/full-mvp-coverage/check.mjs'), '--snapshot'], { encoding: 'utf8' });
      assert.equal(check.status, 0, check.stdout + check.stderr);
      const render = spawnSync(process.execPath, [resolve(directory, 'contracts/full-mvp-coverage/render.mjs'), '--check'], { encoding: 'utf8' });
      assert.equal(render.status, 0, render.stdout + render.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('decision branches retain source-kind skips and the variance-fork consumers', () => {
  const result = checkMutation(index => {
    const po = index.mappings.branches.find(row => row.key === 'S3-20:NO');
    po.packages = po.packages.filter(key => !['P06', 'P16'].includes(key));
    po.gates = [...po.packages];
    const claim = index.mappings.branches.find(row => row.key === 'S4-05:NO');
    claim.packages = claim.packages.filter(key => key !== 'P17');
    claim.gates = [...claim.packages];
  });
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.ok(errors.some(row => row.key === 'S3-20:NO' && row.packages.includes('P06') && row.packages.includes('P16')));
  assert.ok(errors.some(row => row.key === 'S4-05:NO' && row.packages.includes('P17')));
});

test('missing node, acceptance and Backorder closure report their affected runtime packages', () => {
  const result = checkMutation(index => {
    index.mappings.nodes = index.mappings.nodes.filter(row => row.key !== 'S3-12');
    index.mappings.acceptance = index.mappings.acceptance.filter(row => row.key !== 'AC-04');
    index.mappings.closure = index.mappings.closure.filter(row => row.key !== 'Backorder');
  });
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.ok(errors.some(row => row.key === 'S3-12' && row.packages.includes('P06') && row.packages.includes('P26')));
  assert.ok(errors.some(row => row.key === 'AC-04' && row.packages.includes('P06')));
  assert.ok(errors.some(row => row.key === 'Backorder' && row.packages.includes('P14') && row.packages.includes('P19') && row.source.path === 'docs/DATABASE-SCHEMA.md'));
});
