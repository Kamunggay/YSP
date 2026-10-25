import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const digest = value => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
const apiPath = 'contracts/transport/v1/api-v1.json';
const slices = ['session', 'enrollment', 'mfa-recovery', 'chapter-context', 'membership', 'duty-grant', 'policy', 'provisioning', 'identity-disable'];
const pointer = value => value.replaceAll('~', '~0').replaceAll('/', '~1');
const ref = (path, location = '') => `${path}#${location}`;

export async function buildReview(plan) {
  const api = await read(apiPath);
  const operationRows = Object.entries(api.paths).flatMap(([path, item]) =>
    Object.entries(item).filter(([, operation]) => operation?.operationId).map(([method, operation]) => ({ path, method, operation, item })));
  const ids = operationRows.map(row => row.operation.operationId);
  assert.equal(new Set(ids).size, ids.length, 'unique operation inventory');
  const inventory = Object.values(plan.inventory).flat();
  assert.equal(new Set(inventory).size, inventory.length, 'no duplicate inventory assignment');
  assert.deepEqual([...inventory].sort(), [...ids].sort(), 'complete parent operation inventory');
  assert.deepEqual(plan.checklist.map(row => row.position), Array.from({ length: 18 }, (_, i) => i + 1), '18 parent checklist positions');
  assert.deepEqual(Object.keys(plan.packs).sort(), ['Entry', 'MFA', 'Membership/context', 'Administration', 'Policy', 'Provisioning', 'Outcomes'].sort(), 'seven parent scenario packs');

  const exchanges = [];
  for (const slice of ['operation', ...slices]) {
    const path = `contracts/transport/v1/${slice}-exchanges.json`;
    // The retained chapter lookup fixtures predate the P02 slice naming convention.
    const source = slice === 'operation' ? 'contracts/transport/v1/operation-examples.json' : path;
    const rows = await read(source);
    assert.equal(new Set(rows.map(row => row.name)).size, rows.length, `unique named exchanges: ${source}`);
    rows.forEach((row, index) => exchanges.push({ ...row, slice, source: ref(source, `/${index}`) }));
  }
  const namedExchange = (slice, name) => {
    const local = exchanges.find(e => e.slice === slice && e.name === name);
    const candidates = exchanges.filter(e => e.name === name);
    assert.ok(local || candidates.length === 1, `ambiguous or missing exchange ${slice}/${name}`);
    const row = local ?? candidates[0];
    assert.ok(row, `missing named exchange ${slice}/${name}`);
    return row;
  };
  const scenarios = [];
  for (const slice of slices.filter(s => s !== 'session')) {
    const path = `contracts/transport/v1/${slice}-scenarios.json`;
    const rows = await read(path);
    for (const [index, row] of rows.entries()) {
      assert.equal(row.verification, 'declarative_server_review');
      assert.ok(row.precondition && row.obligation && row.limitations, `scenario context ${slice}/${row.id}`);
      assert.ok(row.exchanges?.length, `operation-linked scenario ${slice}/${row.id}`);
      scenarios.push({
        id: `${slice}/${row.id}`, source: ref(path, `/${index}`),
        initialAuthenticationAndContext: ref(path, `/${index}/precondition`),
        syntheticServerConditionsAndObligation: ref(path, `/${index}/obligation`),
        attemptedRequestsAndExpectedResponses: row.exchanges.map(name => namedExchange(slice, name).source),
        forbiddenData: row.response_absent_fields?.length ? ref(path, `/${index}/response_absent_fields`) :
          'Closed operation response schemas constrain fields; current-access redaction and secret visibility remain declarative server obligations, not proven runtime predicates.',
        permittedNextSteps: 'Use only the referenced response feedback/next actions and current authority. Preserve an uncertain attempt; no automatic mutation replay or new key.',
        verification: 'Validated exchange shapes and consumer checks; synthetic server conditions remain declarative.',
        checks: [`contracts/transport/tests/${slice}.test.mjs`],
      });
    }
  }
  for (const exchange of exchanges.filter(row => row.slice === 'session')) {
    const initialState = exchange.operationId === 'signIn' || exchange.name === 'logout-already-signed-out' ? 'signed_out' :
      exchange.operationId === 'getSession' && exchange.response.body?.state ? exchange.response.body.state :
        exchange.operationId === 'signOut' ? 'any session stage, including signed out' : 'any session stage; no protected authority needed';
    scenarios.push({ id: `session/${exchange.name}`, source: exchange.source,
      initialAuthenticationAndContext: `${initialState}. Chapter selection/authority, when authenticated, is exactly the referenced snapshot; otherwise no chapter context is authorized.`,
      syntheticServerConditionsAndObligation: 'The named fixture supplies the synthetic server response; authorization, expiry and credential verification are not executed.',
      attemptedRequestsAndExpectedResponses: [exchange.source],
      forbiddenData: 'Only the closed status-specific response schema is permitted; restricted session states exclude chapter/provider authority.',
      permittedNextSteps: 'Follow the state-discriminated response and sessionNextAction; refresh CSRF after rotation; no automatic mutation replay.',
      verification: 'Exchange/schema and minimal consumer checks; server behavior declarative.', checks: ['contracts/transport/tests/session.test.mjs'] });
  }
  const scenarioIds = new Set(scenarios.map(row => row.id));
  for (const row of plan.checklist) {
    assert.ok(row.evidence.length && row.assessment && row.trace.length, `checklist ${row.position}`);
    for (const path of row.evidence) await readFile(new URL(path, root));
  }
  for (const [pack, selectors] of Object.entries(plan.packs)) {
    assert.ok(selectors.length, `empty pack ${pack}`);
    for (const selector of selectors) assert.ok(scenarios.some(row => row.id.startsWith(selector)), `missing pack scenario ${selector}`);
  }
  for (const scenario of scenarios) for (const check of scenario.checks) await readFile(new URL(check, root));
  assert.equal(scenarioIds.size, scenarios.length, 'unique scenario identities');

  const operations = operationRows.map(({ path, method, operation, item }) => {
    const id = operation.operationId;
    const location = `/paths/${pointer(path)}/${method}`;
    const examples = exchanges.filter(e => e.operationId === id);
    assert.ok(examples.length, `operation examples ${id}`);
    assert.deepEqual([...new Set(examples.map(e => String(e.response.status)))].sort(), Object.keys(operation.responses).sort(), `status-specific examples ${id}`);
    assert.ok(Array.isArray(operation.security ?? api.security), `explicit or inherited security ${id}`);
    const requirements = operation['x-requirements'] ?? examples.flatMap(e => e.requirements ?? []);
    assert.ok(requirements.length, `requirement trace ${id}`);
    return { operationId: id, method: method.toUpperCase(),
      route: `${(operation.servers ?? item.servers ?? api.servers)[0].url.replace(/\/$/, '')}${path}`,
      definition: ref(apiPath, location),
      wireDefinitions: 'Requests, status-specific bodies/headers, security and authority remain at this canonical operation and its referenced shared schemas; this index introduces no wire schemas.',
      requirements: [...new Set(requirements)],
      availability: operation['x-enabled-boundary'] === false ? 'safely_unavailable' : 'specified_candidate_not_runtime_enabled',
      examples: examples.map(e => e.source),
    };
  });

  const files = new Set([apiPath, 'scripts/verification.Dockerfile', 'scripts/verify.ps1',
    'frontend/tsconfig.json', 'frontend/package-lock.json', 'backend/composer.lock', 'contracts/p02-review/reconcile.mjs',
    'contracts/p02-review/v1/README.md', 'contracts/p02-review/v1/review.json']);
  async function collect(directory) {
    for (const entry of (await readdir(new URL(directory, root), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === 'node_modules') continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await collect(path);
      else files.add(path);
    }
  }
  for (const directory of ['contracts/transport', 'contracts/health', 'contracts/identity-record-evidence', 'contracts/ipc-rm-acceptance', 'contracts/stock-holds', 'contracts/p00-review', 'contracts/full-mvp-coverage']) await collect(directory);
  const artifacts = [];
  for (const path of [...files].sort()) artifacts.push({ path, sha256: digest(await readFile(new URL(path, root), 'utf8')) });
  const contractSha256 = artifacts.find(row => row.path === apiPath).sha256;
  assert.deepEqual(plan.peerReviews.map(row => row.reviewer).sort(), ['Efren', 'Glenn'], 'both required peer reviews');
  for (const review of plan.peerReviews) {
    assert.equal(review.contractSha256, contractSha256, 'peer review must identify this exact contract');
    assert.equal(review.status, 'completed_owner_attested');
    assert.ok(review.source && review.reportedOn && review.evidenceLimitations);
  }
  return { revision: plan.revision, parentSpec: plan.parentSpec, contractVersion: api.info.version,
    contractSha256, digestFormat: 'sha256-utf8-lf',
    artifactSetSha256: digest(JSON.stringify(artifacts)), artifacts,
    operations, scenarios, packs: Object.fromEntries(Object.entries(plan.packs).map(([pack, selectors]) =>
      [pack, scenarios.filter(row => selectors.some(selector => row.id.startsWith(selector))).map(row => row.id)])),
    checklist: plan.checklist, peerReviews: plan.peerReviews,
    independentImplementationReadiness: 'not asserted; see unresolved freeze and runtime-enablement gates in review.json',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = new URL('v1/index.json', import.meta.url);
  const generated = `${JSON.stringify(await buildReview(await read('contracts/p02-review/v1/review.json')), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n', '\n'), generated, 'P02 review index drift; run npm --prefix contracts/transport run reconcile');
    console.log('P02 operation/scenario/checklist and artifact fingerprints agree; runtime readiness is not certified.');
  } else await writeFile(output, generated);
}
