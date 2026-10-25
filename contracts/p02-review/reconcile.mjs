import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sessionNextAction } from '../transport/consumer/session.ts';
import { chapterNextAction } from '../transport/consumer/chapter-context.ts';

const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const digest = value => createHash('sha256').update(value.replaceAll('\r\n', '\n')).digest('hex');
const apiPath = 'contracts/transport/v1/api-v1.json';
const slices = ['session', 'enrollment', 'mfa-recovery', 'chapter-context', 'membership', 'duty-grant', 'policy', 'provisioning', 'identity-disable'];
const pointer = value => value.replaceAll('~', '~0').replaceAll('/', '~1');
const ref = (path, location = '') => `${path}#${location}`;

// Read constraints and actions from the same status-specific schemas/examples as
// the consumer. This is a review index, not another response validator.
function responseBoundary(exchange, validation) {
  const variants = validation[exchange.operationId]?.oneOf ?? [];
  const responseIndex = variants.findIndex(row => row.properties.status.const === exchange.response.status);
  const schema = variants[responseIndex]?.properties.body;
  const body = exchange.response.body;
  function fields(definition) {
    if (!definition) return { names: [], closed: body === undefined };
    const branches = ['oneOf', 'anyOf', 'allOf'].flatMap(key => definition[key] ?? []).filter(branch =>
      Object.entries(branch.properties ?? {}).every(([name, value]) =>
        !Object.hasOwn(value, 'const') || body?.[name] === undefined || body[name] === value.const));
    const children = branches.map(fields);
    return { names: [...Object.keys(definition.properties ?? {}), ...children.flatMap(row => row.names)],
      closed: definition.additionalProperties === false ||
        (children.length > 0 && children.every(row => row.closed)) };
  }
  const allowed = fields(schema);
  const candidates = ['user', 'identity', 'chapter_context', 'chapter_choices', 'provider_destinations', 'permissions',
    'duties', 'context', 'membership', 'grant', 'items', 'record', 'material', 'settings', 'enrollment', 'setup_uri',
    'manual_key', 'recovery_codes', 'result', 'operation'];
  const actionLists = [];
  function findActions(value, location) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const at = `${location}/${pointer(key)}`;
      if (['permitted_next_steps', 'next_actions', 'allowed_actions', 'permitted_actions'].includes(key)) {
        actionLists.push({ source: `${exchange.source}${at}`, actions: child });
      } else findActions(child, at);
    }
  }
  findActions(body, '/response/body');
  const consumerActions = [];
  if (['signed_out', 'mfa_enrollment_required', 'mfa_challenge_required', 'authenticated'].includes(body?.state)) {
    consumerActions.push({ source: 'contracts/transport/consumer/session.ts#sessionNextAction', action: sessionNextAction(body) });
  }
  if (['no_authorized_memberships', 'selection_required', 'selected'].includes(body?.chapter_state)) {
    consumerActions.push({ source: 'contracts/transport/consumer/chapter-context.ts#chapterNextAction', action: chapterNextAction(body) });
  }
  return { exchange: exchange.source,
    forbiddenData: schema && allowed.closed ? {
      source: ref('contracts/transport/generated/session-validation.json', `/${exchange.operationId}/oneOf/${responseIndex}/properties/body`),
      fields: candidates.filter(name => !allowed.names.includes(name)),
      boundary: 'These named top-level protected fields are excluded by this closed response variant; nested authorization/redaction remains a declarative server obligation.',
    } : { fields: [], boundary: body === undefined ? 'Entire response body forbidden.' :
      'Forbidden-field enumeration unspecified by this index; consult the canonical chapter lookup schema and current-access redaction obligations.' },
    permittedNextSteps: { actionLists, consumerActions,
      boundary: actionLists.length || consumerActions.length ? 'Only these response/consumer actions, subject to current authority; no automatic mutation replay.' :
        'No explicit next-action list in this response. Further navigation is unspecified here and requires owning consumer/server agreement; no mutation replay is permitted.' },
  };
}

export async function buildReview(plan) {
  const api = await read(apiPath);
  const validation = await read('contracts/transport/generated/session-validation.json');
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
        declaredForbiddenData: row.response_absent_fields?.length ? ref(path, `/${index}/response_absent_fields`) : null,
        responseBoundaries: row.exchanges.map(name => responseBoundary(namedExchange(slice, name), validation)),
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
      responseBoundaries: [responseBoundary(exchange, validation)],
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

  const files = new Set([apiPath, 'scripts/verification.Dockerfile', 'scripts/verification.Dockerfile.dockerignore', 'scripts/verify.ps1',
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
