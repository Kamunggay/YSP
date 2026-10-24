import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const sourcePaths = [
  'docs/PRD.md', 'docs/TRD.md', 'docs/IMPLEMENTATION-PLAN.md',
  'docs/APP-FLOW.md', 'docs/DATABASE-SCHEMA.md', 'docs/BACKEND-ARCHITECTURE.MD',
  'docs/contracts/first-slice-agreement.md', 'CONTEXT.md',
  'docs/adr/0001-chapter-owned-operational-records.md',
  'docs/adr/0002-track-booth-custody-separately.md',
  'docs/adr/0003-start-with-a-modular-laravel-backend.md',
  'docs/adr/0004-use-bounded-donor-restrictions.md',
  'specs/ysp-chapter-operations/FLOWCHART-SOURCE-INVENTORY.md',
  'specs/ysp-chapter-operations/FLOWCHART-COVERAGE.md',
];

export function identifiers(text, prefix) {
  const escaped = prefix.replaceAll('-', '\\-');
  const re = new RegExp(`(?<![A-Z0-9-])${escaped}${prefix === 'P' ? '' : '-'}(\\d{2})(?:[–-](?:${escaped}${prefix === 'P' ? '' : '-'})?(\\d{2}))?`, 'g');
  const ids = new Set();
  for (const match of text.matchAll(re)) {
    for (let n = +match[1]; n <= +(match[2] ?? match[1]); n++) {
      ids.add(`${prefix}${prefix === 'P' ? '' : '-'}${String(n).padStart(2, '0')}`);
    }
  }
  return [...ids];
}

export const requirementPrefixes = ['GOV', 'DOC', 'INV', 'RF', 'SO', 'PAY', 'RSV', 'PRC', 'RCV', 'BTH', 'ADJ', 'RPT', 'SEC', 'UX', 'MIG', 'SUB', 'ADD', 'TR'];
export const requirementsIn = text => requirementPrefixes.flatMap(prefix => identifiers(text, prefix));

export function extractInventory(root) {
  const documents = Object.fromEntries(sourcePaths.map(path => {
    const bytes = readFileSync(resolve(root, path));
    return [path, { path, sha256: createHash('sha256').update(bytes).digest('hex'), lines: bytes.toString('utf8').split(/\r?\n/) }];
  }));
  const origin = (path, i) => ({ path, line: i + 1, text: documents[path].lines[i] });
  const table = (path, start, end) => {
    let active = false;
    const rows = [];
    documents[path].lines.forEach((line, i) => {
      if (line.startsWith(start)) active = true;
      else if (active && end && line.startsWith(end)) active = false;
      if (active && line.startsWith('|')) rows.push({ cells: line.split('|').slice(1, -1).map(s => s.trim()), source: origin(path, i) });
    });
    return rows;
  };
  const trd = 'docs/TRD.md', prd = 'docs/PRD.md', plan = 'docs/IMPLEMENTATION-PLAN.md';
  const historical = 'specs/ysp-chapter-operations/FLOWCHART-SOURCE-INVENTORY.md';
  const packages = [];
  let stage;
  documents[plan].lines.forEach((line, i) => {
    if (/^### Stage \d/.test(line)) stage = Number(line.match(/Stage (\d)/)[1]);
    if (!/^\| \*\*P\d\d /.test(line)) return;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    packages.push({ key: cells[0].match(/P\d\d/)[0], stage, assignment: cells[0], outcome: cells[1], dependencyStatement: cells[2], requirementStatement: cells[3], completion: cells[4], source: origin(plan, i) });
  });
  const nodes = [], branches = [];
  const rawNodes = new Map();
  documents[historical].lines.forEach((line, i) => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (/^S[1-4]-\d\d$/.test(cells[0] ?? '')) rawNodes.set(cells[0], { cells, source: origin(historical, i) });
  });
  documents[trd].lines.forEach((line, i) => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (!/^S[1-4]-\d\d /.test(cells[1] ?? '')) return;
    const key = cells[1].slice(0, 5), raw = rawNodes.get(key);
    if (!raw) throw new Error(`Historical node missing: ${key}`);
    nodes.push({ key, label: cells[1], expected: cells[2], requirements: requirementsIn(cells[3]), acceptance: [...identifiers(cells[4], 'AC'), ...identifiers(cells[4], 'ADD-AC')], source: origin(trd, i), original: raw });
    if (raw.cells[1] !== 'Decision') return;
    for (const outcome of ['YES', 'NO']) {
      const edge = key === 'S4-07'
        ? { YES: 'S4-09', NO: 'S4-08' }[outcome]
        : raw.cells[3].match(new RegExp(`${outcome}(?: \\([^)]*\\))? → (S[1-4]-\\d\\d)`))?.[1];
      if (!edge) throw new Error(`Branch endpoint missing: ${key}:${outcome}`);
      branches.push({ key: `${key}:${outcome}`, node: key, outcome, destination: edge, expected: cells[2], source: raw.source, interpretation: origin(trd, i) });
    }
  });
  const coverageRows = (start, end, matcher, make) => table(trd, start, end)
    .filter(row => matcher.test(row.cells[1] ?? row.cells[0])).map(make);
  const connectors = coverageRows('### All cross-sheet connectors', '### Loops', /^[A-G]:/, row => ({
    key: row.cells[1][0], label: row.cells[1], expected: row.cells[2], requirements: requirementsIn(row.cells[3]), acceptance: identifiers(row.cells[4], 'AC'), source: row.source,
  }));
  const loops = table(trd, '### Loops and terminal behavior', '### Narrative controls')
    .filter(row => row.cells[0] === '[ ]').map(row => ({ key: row.cells[1], expected: row.cells[2], requirements: requirementsIn(row.cells[3]), acceptance: identifiers(row.cells[4], 'AC'), source: row.source }));
  const narrative = coverageRows('### Narrative controls T-', '### Source ambiguity', /^T-\d\d /, row => ({ key: row.cells[1].slice(0, 4), label: row.cells[1], requirements: requirementsIn(row.cells[2]), acceptance: identifiers(row.cells[3], 'AC'), source: row.source }));
  const ambiguities = table(trd, '### Source ambiguity resolution', '### Release evidence')
    .filter(row => /^A-\d\d /.test(row.cells[0])).map(row => ({ key: row.cells[0].slice(0, 4), label: row.cells[0], expected: row.cells[1], requirements: requirementsIn(row.cells[2]), source: row.source }));
  const requirements = [];
  for (const path of [prd, trd]) documents[path].lines.forEach((line, i) => {
    const match = line.match(/\*\*((?:[A-Z]+-)+\d{2}) —/);
    if (!match || (path === trd && !match[1].startsWith('TR-'))) return;
    requirements.push({ key: match[1], source: origin(path, i) });
  });
  const acceptance = [];
  documents[prd].lines.forEach((line, i) => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (/^(ADD-)?AC-\d\d$/.test(cells[0] ?? '')) acceptance.push({ key: cells[0], scenario: cells[1], expected: cells[2], source: origin(prd, i) });
  });
  const closure = table(prd, '## 14. State visibility', '## 15.')
    .filter(row => !['Record', '---'].includes(row.cells[0])).map(row => ({ key: row.cells[0], states: row.cells[1], expected: row.cells[2], source: row.source }));
  const activation = table(plan, '## 9. Production readiness', 'For growth')
    .filter(row => !['Gate / activation prerequisite', '---'].includes(row.cells[0])).map(row => ({ key: row.cells[0], expected: row.cells[1], source: row.source }));
  const settings = table(prd, '### 4.1 Required chapter inputs', 'Exact amounts')
    .filter(row => !['Configuration', '---'].includes(row.cells[0])).map(row => ({ key: row.cells[0], expected: row.cells[1], source: row.source }));
  const planningReferences = documents[plan].lines.flatMap((line, i) => /^[#|]/.test(line) ? [origin(plan, i)] : []);
  return {
    sources: Object.values(documents).map(({ path, sha256 }) => ({ path, sha256 })),
    packages, nodes, branches, connectors, loops, narrative, ambiguities, requirements, acceptance, closure, activation, settings, planningReferences,
  };
}
