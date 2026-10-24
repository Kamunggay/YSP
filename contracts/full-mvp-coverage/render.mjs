import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(directory, 'v1/source-inventory.json'), 'utf8'));
const index = JSON.parse(readFileSync(resolve(directory, 'v1/index.json'), 'utf8'));
const escape = text => String(text ?? '').replaceAll('|', '&#124;').replaceAll('\n', '<br>');
const sourceLink = source => `[${source.path}:${source.line}](../../../${source.path})`;
const packages = keys => keys.map(key => `[${key}](#${key.toLowerCase()})`).join(', ');
const lines = [
  '# Full-MVP coverage and dependency index', '',
  `Revision **${index.revision}**, ${index.date}. [Parent Stage 0 specification](${index.parentSpec}); local Leader ticket 10.`, '',
  index.requirementAuthority, '',
  '**All package, source, acceptance, peer and live gates remain pending.** This is the entire team’s roadmap ownership index; the Leader-only local ticket list implements a subset of Stage 0. Glenn retains frontend, queries/reservations and demand intake. Efren retains Inventory physical posting, Finance, fulfillment, booths and ADJ. Leader coordinates architecture/contracts/schema/CI and Purchasing/Receiving. These assignments confer no officer duty.', '',
  'The governing main workspace has existing uncommitted requirement revisions. The source links below are navigation aids; use [source-inventory.json](source-inventory.json) for the exact pinned rows and hashes. The older documentation in the shared checkout is not the pinned governing revision. A snapshot check does not establish source freshness. See [README](README.md) for verification commands and [check-results.json](check-results.json) for actual checks.', '',
  '## Package ownership, provider dependencies and verification gates', '',
  index.dependencySemantics, '', index.commonGate, '',
];
for (const row of index.packages) {
  const original = baseline.packages.find(p => p.key === row.key);
  lines.push(`<a id="${row.key.toLowerCase()}"></a>`, '', `### ${row.key} — Stage ${row.stage}`, '',
    row.assignment.replaceAll('**', ''), '', `Source: ${sourceLink(original.source)}. Acceptance: **pending**.`, '',
    original.outcome, '', `Required verification: ${row.gate}`, '',
    'Provider | Scope | Required input / completion qualification', '--- | --- | ---');
  for (const edge of row.dependencies) lines.push(`${packages([edge.provider])} | ${edge.scope} | ${escape(edge.reason)}`);
  if (!row.dependencies.length) lines.push('Source review | planning | No application prerequisite');
  lines.push('');
}
const titles = {
  nodes: 'Original source nodes — 87 individual rows', branches: 'Decision branches — 40 individual outcomes',
  connectors: 'Cross-sheet connectors — A–G', loops: 'Loops, re-entry and terminal behavior',
  narrative: 'Narrative controls — T-01–T-35', ambiguities: 'Source ambiguity resolutions — A-01–A-21',
  requirements: 'Functional, adopted, technical and MIG requirements — 194 individual definitions',
  acceptance: 'Acceptance scenarios — AC-01–AC-23 and ADD-AC-01–ADD-AC-12',
  closure: 'Record-specific closure obligations', activation: 'Later activation and recovery gates', settings: 'Required policy, officer and master-data inputs',
};
for (const [category, rows] of Object.entries(index.mappings)) {
  lines.push(`## ${titles[category]}`, '',
    'Key / original source | Expected behavior or obligation | Owning packages / applicable gates | Evidence state',
    '--- | --- | --- | ---');
  for (const row of rows) {
    const original = baseline[category].find(item => item.key === row.key);
    const related = row.relatedEvidence.length ? `; related authored checks: ${row.relatedEvidence.join(', ')} (integration pending)` : '; executed integration evidence: none';
    let expected = original.expected ?? original.label ?? original.source.text.replace(/^.*?\*\*/, '').replaceAll('**', '');
    if (category === 'nodes') expected += ` Original path: ${original.original.cells[3]}.`;
    if (category === 'branches') expected = `${original.outcome} → ${original.destination}. Corrected obligation: ${original.expected}`;
    if (original.requirements?.length) expected += ` Requirements: ${original.requirements.join(', ')}.`;
    if (original.acceptance?.length) expected += ` Acceptance: ${original.acceptance.join(', ')}.`;
    if (original.schemaExpected) expected += ` Schema closure: ${original.schemaExpected}`;
    const extraSource = original.schemaSource ? `<br>${sourceLink(original.schemaSource)}` : '';
    lines.push(`${escape(row.key)}<br>${sourceLink(original.source)}${extraSource} | ${escape(expected)} | ${packages(row.packages)} | **pending**${related}`);
  }
  lines.push('');
}
lines.push('## Executed evidence and limits', '',
  'These retained local records describe checks already executed during earlier authored contributions. The current ticket’s actual checker runs are in [check-results.json](check-results.json). Neither source proves peer acceptance, real DDL/locking, signed stock acceptance or package completion.', '',
  'Evidence | Artifact / retained local record | Executed scope | Outstanding acceptance', '--- | --- | --- | ---');
for (const row of index.evidence) lines.push(`${row.key} | [${row.artifact}](../../${row.artifact.replace(/^contracts\//, '')})<br>Local record: ${row.trackingRecord} | ${row.scope}; ${row.date}; ${row.status} | Peer and integration **pending**`);
lines.push('', '## Conflicts and corrections retained', '',
  'A material unresolved mapping conflict fails the checker and blocks affected acceptance. These documented resolutions govern mapping; their implementation evidence remains pending.', '',
  'Finding | Source / affected packages | Mapping treatment', '--- | --- | ---');
for (const row of index.conflicts) lines.push(`${row.key}: ${row.status} | ${sourceLink(row.source)}; ${packages(row.packages)} | ${escape(row.resolution)}`);
lines.push('', '## Handoff to ticket 06 and actual reviewers', '',
  'Consumer | Current state | Required work', '--- | --- | ---');
for (const row of index.pendingHandoffs) lines.push(`${row.consumer} | ${row.status} | ${escape(row.scope)}`);
lines.push('', 'Ticket 06 consumes this revision, its complete individual rows and actual check report. Preserve findings, source drift and unreceived reviews rather than marking gates passed. No infrastructure, account values, operational approvals, next-ticket implementation, push or PR is authorized by this index.', '');
const content = lines.join('\n');
const path = resolve(directory, 'v1/review-index.md');
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== content) { process.stderr.write('Review index differs from the JSON revision; rerun render.mjs.\n'); process.exitCode = 1; }
  else process.stdout.write('Review index matches JSON revision.\n');
} else {
  writeFileSync(path, content);
  process.stdout.write('Rendered v1/review-index.md.\n');
}
