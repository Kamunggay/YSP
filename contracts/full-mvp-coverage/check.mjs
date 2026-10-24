import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { extractInventory, identifiers, requirementsIn, textSha256 } from './inventory.mjs';
import { affectedPackages, nodeOwners, branchOwners, acceptanceOwners, closureOwners } from './ownership.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const checkout = resolve(directory, '../..');
const sha256 = textSha256;
const args = process.argv.slice(2);
const option = name => {
  const position = args.indexOf(name);
  if (position < 0) return undefined;
  if (!args[position + 1] || args[position + 1].startsWith('--')) throw new Error(`Value required: ${name}`);
  return args[position + 1];
};

function run() {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--snapshot') continue;
    if (['--source-root', '--index'].includes(args[i])) { option(args[i]); i++; continue; }
    throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (args.includes('--snapshot') && args.includes('--source-root')) throw new Error('Choose --snapshot or --source-root, not both.');
  if (!args.includes('--snapshot') && !args.includes('--source-root')) throw new Error('Explicit --source-root <governing workspace> or --snapshot is required; freshness is never implied.');
  const bytes = readFileSync(resolve(directory, 'v1/source-inventory.json'));
  const baseline = JSON.parse(bytes);
  const index = JSON.parse(readFileSync(resolve(option('--index') ?? resolve(directory, 'v1/index.json')), 'utf8'));
  const errors = [];
  const error = (key, message, source, packages = []) => errors.push({ key, message, source, packages, blocksAffectedAcceptance: true });
  const byKey = rows => new Map(rows.map(row => [row.key, row]));
  const packageMap = byKey(index.packages);
  const sourcePackages = byKey(baseline.packages);
  const evidenceMap = byKey(index.evidence);
  const allowedScopes = ['contract', 'integration', 'inherited', 'rehearsal', 'activation'];
  const sameSet = (a, b) => isDeepStrictEqual([...new Set(a)].sort(), [...new Set(b)].sort());
  const requiredCounts = { packages: 30, nodes: 87, branches: 40, connectors: 7, loops: 6, narrative: 35, ambiguities: 21, requirements: 194, acceptance: 35, closure: 10, activation: 11, settings: 14 };
  for (const [category, count] of Object.entries(requiredCounts)) {
    if (baseline[category]?.length !== count) error(category, `Pinned inventory must retain ${count} rows; deliberate inventory changes require a reviewed revision.`, 'v1/source-inventory.json', ['P00', 'P29']);
  }
  if (index.sourceInventorySha256 !== sha256(bytes)) error('inventory', 'Frozen source inventory digest mismatch.', 'v1/source-inventory.json', ['P00', 'P29']);
  const origins = new Map([
    ...Object.values(baseline).filter(Array.isArray).flatMap(rows => rows.flatMap(row => [row.source, row.interpretation, row.original?.source, row.schemaSource].filter(Boolean))),
    ...baseline.planningReferences,
  ].map(origin => [`${origin.path}:${origin.line}`, origin]));

  function reference(ref, key, packages) {
    if (!ref?.path || !Number.isInteger(ref.line) || ref.line < 1) {
      error(key, 'Missing exact source path and positive line.', ref, packages);
      return;
    }
    if (!origins.has(`${ref.path}:${ref.line}`)) error(key, 'Source locator is absent from pinned inventory and planning references.', ref, packages);
  }

  const checkUnique = (rows, key, source, packages) => {
    const found = new Set();
    for (const row of rows) {
      if (found.has(row.key)) error(row.key, `Duplicate ${key} row.`, source, packages);
      found.add(row.key);
    }
  };
  checkUnique(index.packages, 'package', 'v1/index.json', ['P00']);
  checkUnique(index.evidence, 'evidence', 'v1/index.json', ['P00']);
  for (const original of baseline.packages) {
    const row = packageMap.get(original.key);
    if (!row) { error(original.key, 'Missing package.', original.source, [original.key]); continue; }
    if (row.assignment !== original.assignment || row.stage !== original.stage || row.gate !== original.completion) error(row.key, 'Owner, stage or completion gate changed from roadmap.', original.source, [row.key]);
    if (row.status !== 'pending') error(row.key, 'Package acceptance remains pending in this planning revision.', original.source, [row.key]);
    const providers = identifiers(original.dependencyStatement, 'P');
    if (!sameSet(providers, row.dependencies.map(edge => edge.provider))) error(row.key, 'Provider references must retain the roadmap dependencies exactly.', original.source, [row.key]);
    if (row.dependencies.length !== providers.length) error(row.key, 'Duplicate dependency edge.', original.source, [row.key]);
    for (const edge of row.dependencies) {
      if (!packageMap.has(edge.provider) || !allowedScopes.includes(edge.scope) || edge.reason !== original.dependencyStatement) error(row.key, 'Unknown provider/scope or lost dependency qualification.', original.source, [row.key, edge.provider]);
      const expected = edge.provider === 'P00' || (row.key === 'P05' && edge.provider === 'P04') ? 'contract'
        : row.key === 'P06' && ['P02', 'P03'].includes(edge.provider) ? 'inherited'
        : row.key === 'P26' && edge.provider === 'P28' ? 'activation'
        : row.key === 'P27' && edge.provider !== 'P01' ? 'rehearsal' : 'integration';
      if (edge.scope !== expected) error(row.key, `Dependency ${edge.provider} needs ${expected} scope; don't defer an implementation gate or invent a live cycle.`, original.source, [row.key, edge.provider]);
    }
  }
  for (const row of index.packages) if (!sourcePackages.has(row.key)) error(row.key, 'Package absent from authoritative roadmap.', 'docs/IMPLEMENTATION-PLAN.md', [row.key]);
  const visiting = new Set(), visited = new Set();
  function visit(key, path = []) {
    if (visiting.has(key)) { error(key, `Implementation dependency cycle: ${[...path, key].join(' -> ')}`, sourcePackages.get(key)?.source, [...path, key]); return; }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const edge of packageMap.get(key)?.dependencies ?? []) if (['contract', 'integration', 'rehearsal'].includes(edge.scope)) visit(edge.provider, [...path, key]);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of packageMap.keys()) visit(key);
  for (const category of Object.keys(index.mappings)) if (!(category in requiredCounts) || category === 'packages') error(category, 'Unrecognized mapping category.', 'v1/index.json', ['P00']);
  for (const category of Object.keys(requiredCounts).filter(category => category !== 'packages')) {
    const originals = byKey(baseline[category]);
    const rows = index.mappings[category] ?? [];
    checkUnique(rows, category, 'v1/index.json', ['P00']);
    const mapped = byKey(rows);
    for (const original of originals.values()) {
      if (!mapped.has(original.key)) {
        const affected = affectedPackages(baseline, category, original);
        error(original.key, `Orphan ${category} row: missing mapping.`, original.source, affected);
      }
      for (const requirement of original.requirements ?? []) if (!baseline.requirements.some(row => row.key === requirement)) error(original.key, `Unknown source requirement ${requirement}.`, original.source, mapped.get(original.key)?.packages);
      for (const ac of original.acceptance ?? []) if (!baseline.acceptance.some(row => row.key === ac)) error(original.key, `Unknown acceptance reference ${ac}.`, original.source, mapped.get(original.key)?.packages);
    }
    for (const row of rows) {
      const original = originals.get(row.key);
      if (!original) { error(row.key, `Mapping is absent from authoritative ${category}.`, 'v1/index.json', row.packages); continue; }
      if (!row.packages?.length) error(row.key, 'Missing owning package.', original.source, ['P00']);
      for (const key of row.packages ?? []) if (!packageMap.has(key)) error(row.key, `Unknown owning package ${key}.`, original.source, row.packages);
      if (!sameSet(row.gates, row.packages) || row.gates.length !== row.packages.length) error(row.key, 'Every owning package must retain its verification gate exactly once.', original.source, row.packages);
      if (row.status !== 'pending') error(row.key, 'Acceptance status must remain pending; contract consistency cannot promote integration or live acceptance.', original.source, row.packages);
      for (const key of row.relatedEvidence) if (!evidenceMap.has(key)) error(row.key, `Dangling evidence reference ${key}.`, original.source, row.packages);
      if (category === 'nodes' && !sameSet(row.packages, nodeOwners(baseline, row.key))) error(row.key, 'Unsupported node ownership; retain the exact section 8 node allocation.', original.source, row.packages);
      if (category === 'branches') {
        if (!sameSet(row.packages, branchOwners(baseline, row.key))) error(row.key, 'Branch must retain both node and decision-specific package gates.', original.source, branchOwners(baseline, row.key));
        if (!baseline.nodes.some(node => node.key === original.destination)) error(row.key, 'Branch destination is not an inventoried source node.', original.source, row.packages);
      }
      if (category === 'acceptance' && !sameSet(row.packages, acceptanceOwners(row.key))) error(row.key, 'Acceptance owners differ from the individual roadmap ledger refinement.', original.source, acceptanceOwners(row.key));
      if (category === 'closure' && !sameSet(row.packages, closureOwners(row.key))) error(row.key, 'Closure owners must retain the PRD and schema obligations.', original.source, closureOwners(row.key));
      if (category === 'requirements') {
        for (const p of baseline.packages.filter(p => requirementsIn(p.requirementStatement).includes(row.key))) if (!row.packages.includes(p.key)) error(row.key, `Lost explicit roadmap requirement owner ${p.key}.`, original.source, [p.key]);
      }
      const refs = [row.basis?.source, ...(row.basis?.sources ?? []), row.basis?.path ? row.basis : undefined].filter(Boolean);
      if (!refs.length) error(row.key, 'Missing mapping rationale/source.', original.source, row.packages);
      for (const ref of refs) reference(ref, row.key, row.packages);
    }
  }
  for (const row of index.evidence) {
    if (row.kind !== 'authored-contract-consistency' || row.status !== 'executed' || row.integrationAcceptance !== 'pending' || row.peerAcceptance !== 'pending') error(row.key, 'This revision records executed contract checks only, with integration and peer acceptance pending.', row.artifact, ['P00']);
    const path = resolve(checkout, row.artifact);
    const rel = relative(checkout, path);
    if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(path) || sha256(readFileSync(path)) !== row.artifactSha256) error(row.key, 'Evidence artifact is missing, outside checkout, or has changed since its recorded check.', row.artifact, ['P00']);
  }
  for (const row of index.packages) for (const key of row.relatedEvidence) if (!evidenceMap.has(key)) error(row.key, `Dangling package evidence ${key}.`, sourcePackages.get(row.key)?.source, [row.key]);
  for (const conflict of index.conflicts) {
    if (!['resolved-for-mapping', 'unresolved'].includes(conflict.status)) error(conflict.key, 'Unknown conflict status.', conflict.source, conflict.packages);
    if (conflict.status === 'unresolved') error(conflict.key, 'Material mapping conflict remains unresolved.', conflict.source, conflict.packages);
  }
  const sourceRoot = option('--source-root');
  if (sourceRoot) {
    const fresh = extractInventory(resolve(sourceRoot));
    for (const source of baseline.sources) if (fresh.sources.find(item => item.path === source.path)?.sha256 !== source.sha256) {
      const affected = new Set(index.conflicts.filter(row => row.source.path === source.path).flatMap(row => row.packages));
      for (const category of Object.keys(index.mappings)) for (const row of baseline[category]) if (row.source.path === source.path || row.original?.source.path === source.path || row.schemaSource?.path === source.path) for (const p of affectedPackages(baseline, category, row)) affected.add(p);
      error(source.path, 'Governing source drift: reconcile and review the affected mappings before acceptance.', source.path, affected.size ? [...affected].sort() : baseline.packages.map(p => p.key));
    }
    if (!isDeepStrictEqual(fresh, baseline)) error('source-inventory', 'Fresh extraction differs from pinned authoritative inventory.', 'v1/source-inventory.json', ['P00', 'P29']);
    for (const rows of Object.values(index.mappings)) for (const row of rows) {
      const refs = [row.basis?.source, ...(row.basis?.sources ?? []), row.basis?.path ? row.basis : undefined].filter(Boolean);
      for (const ref of refs) {
        const lines = readFileSync(resolve(sourceRoot, ref.path), 'utf8').split(/\r?\n/);
        if (lines[ref.line - 1] !== origins.get(`${ref.path}:${ref.line}`)?.text) error(row.key, 'Mapping source locator no longer matches governing text.', ref, row.packages);
      }
    }
  }
  const report = {
    revision: index.revision, mode: sourceRoot ? 'governing-source' : 'snapshot', sourceFreshness: sourceRoot ? errors.some(e => /source|Source/.test(e.message)) ? 'failed' : 'matched' : 'not-checked',
    counts: Object.fromEntries(Object.keys(requiredCounts).map(category => [category, category === 'packages' ? index.packages.length : index.mappings[category]?.length ?? 0])),
    referenceCheck: errors.length ? 'failed' : 'passed', errors,
    acceptance: 'pending', peerAcceptance: 'pending', liveReadiness: 'pending',
    warning: 'This checks inventory completeness, references and scoped implementation dependencies only. Expected cases, synthetic values, contract checks and screenshots cannot certify real application/peer/pilot/recovery acceptance.',
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = errors.length ? 1 : 0;
}

try { run(); } catch (error) {
  process.stderr.write(`Coverage check failed: ${error.message}\n`);
  process.exitCode = 1;
}
