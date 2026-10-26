import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const bundle = new URL('contracts/p00-review/v1/', root);
const compatibility = JSON.parse(readFileSync(new URL('fixtures/stage-0-compatibility.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', bundle), 'utf8'));
const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

test('Stage 0 reconciliation identifies the historical revision and preserves authored review records', () => {
  assert.equal(compatibility.sourceRevision, '3e2c51dacf3f5f74c78958b3048a857364521eea');
  assert.equal(compatibility.sourceUrl, `https://github.com/Kamunggay/YSP/tree/${compatibility.sourceRevision}`);
  assert.equal(compatibility.historicalManifest, 'contracts/p00-review/v1/manifest.json');
  assert.equal(digest(readFileSync(new URL('manifest.json', bundle), 'utf8')),
    '3ad7b9e5321b12b6b90a17d57a3dcb60e64dddfbb02f5902adf43ce04448ffc5');
  for (const [path, expected] of Object.entries(compatibility.handoffDigests)) {
    assert.equal(digest(readFileSync(new URL(path, root), 'utf8')), expected, path);
  }
});

test('Published contract artifacts use portable references', () => {
  const privateReference = /\.scratch[/\\]|stage-0-leader[/\\]|local[_-]?ticket|trackingRecord|\btickets?\s*(?:0[1-9]|10)\b|[A-Z]:[/\\](?:xampp|Users)[/\\]|!\[\[/i;
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'tests'].includes(entry.name)) continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) inspect(path);
      else if (/\.(md|json|mjs)$/.test(entry.name)) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), privateReference, path.pathname);
      }
    }
  }
  inspect(new URL('contracts/', root));
});

test('P00 handoff pins all consumed first-slice and index artifacts without changing acceptance', () => {
  assert.equal(manifest.revision, '1.0.0-review.1');
  assert.equal(manifest.peerAcceptance, 'pending');
  assert.equal(manifest.p00Acceptance, 'pending');
  assert.equal(manifest.digestFormat, 'sha256-utf8-lf');
  assert.equal(new Set(manifest.artifacts.map(row => row.path)).size, manifest.artifacts.length);
  for (const directory of ['transport', 'identity-record-evidence', 'ipc-rm-acceptance', 'stock-holds', 'full-mvp-coverage']) {
    assert.ok(manifest.artifacts.some(row => row.path.startsWith(`contracts/${directory}/v1/`)), directory);
  }
  for (const row of manifest.artifacts) {
    assert.match(row.path, /^contracts\/[a-z-]+\/v1\/[a-zA-Z0-9.-]+$/);
    // Original byte hashes remain in the unchanged historical manifest/revision.
    // Extensible transport artifacts use granular preservation checks instead.
    if (!compatibility.extensibleArtifacts.includes(row.path)) {
      assert.equal(digest(readFileSync(new URL(row.path, root), 'utf8')), row.sha256, row.path);
    }
  }
  assert.deepEqual(compatibility.extensibleArtifacts, [
    'contracts/transport/v1/api-v1.json', 'contracts/transport/v1/transport.schema.json', 'contracts/transport/v1/examples.json',
  ]);
  const index = JSON.parse(readFileSync(new URL('contracts/full-mvp-coverage/v1/index.json', root), 'utf8'));
  assert.equal(index.revision, manifest.consumedIndexRevision);
  assert.equal(index.packages.length, 30);
  assert.equal(Object.values(index.mappings).flat().length, 460);
  assert.ok(index.packages.every(row => row.status === 'pending'));
  assert.ok(Object.values(index.mappings).flat().every(row => row.status === 'pending'));
});

test('P00 local Markdown links resolve to existing artifacts', () => {
  for (const name of ['README.md', 'reconciliation.md', 'walkthrough.md']) {
    const text = readFileSync(new URL(name, bundle), 'utf8');
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (match[1].startsWith('https://')) continue;
      const target = new URL(match[1], bundle);
      readFileSync(target, 'utf8');
    }
  }
});

test('P00 artifact identity detects changed content while allowing Git line endings', () => {
  const row = manifest.artifacts.find(row => row.path.endsWith('ipc-rm-acceptance/v1/examples.json'));
  const original = readFileSync(new URL(row.path, root), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(digest(original.replaceAll('\n', '\r\n')), row.sha256);
  assert.notEqual(digest(original.replace('synthetic-opening-01', 'different-opening-key')), row.sha256);
});
