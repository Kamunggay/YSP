import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const readJson = async name => JSON.parse(await readFile(new URL(`../v1/${name}.json`, import.meta.url), 'utf8'));
const { api, ajv } = await loadContract();

test('GOV-01/GOV-02: authenticated chapter state distinguishes zero, selection required and selected', async () => {
  assert.equal(api.paths['/session/chapter-context']?.get.operationId, 'getChapterContext');
  assert.equal(api.paths['/session/chapter-selection']?.post.operationId, 'selectChapter');
  assert.equal(api.paths['/session/chapter-memberships']?.get.operationId, 'listChapterMemberships');
  const exchanges = await readJson('chapter-context-exchanges');
  for (const e of exchanges) validateExchange(api, ajv, e);
  const context = exchanges.filter(e => e.operationId === 'getChapterContext' && e.response.status === 200);
  assert.deepEqual(new Set(context.map(e => e.response.body.chapter_state)),
    new Set(['no_authorized_memberships', 'selection_required', 'selected']));
});

test('TR-03/GOV-02: chapter consumer forwards the revision guard and bounded query without retries', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  for (const e of await readJson('chapter-context-exchanges')) {
    let calls = 0;
    const result = await exchangeSession(e.operationId, {
      origin: e.browser.origin, cookie: e.browser.cookie, signal: new AbortController().signal,
      ...(e.request.body ? { body: e.request.body } : {}),
      ...(e.request.query ? { query: e.request.query } : {}),
      ...(e.request.header?.['X-Chapter-Context'] ? { contextRevision: e.request.header['X-Chapter-Context'] } : {}),
      fetch: async (url, init) => {
        calls++;
        assert.equal(url.pathname, '/api/v1' + e.path);
        assert.deepEqual(Object.fromEntries(url.searchParams), Object.fromEntries(Object.entries(e.request.query ?? {}).map(([k, v]) => [k, String(v)])));
        assert.equal(init.headers.get('X-Chapter-Context'), e.request.header?.['X-Chapter-Context'] ?? null);
        assert.equal(init.headers.get('X-XSRF-TOKEN'), e.request.header?.['X-XSRF-TOKEN'] ?? null);
        assert.equal(init.credentials, 'include');
        assert.equal(init.redirect, 'error');
        return new Response(JSON.stringify(e.response.body), { status: e.response.status,
          headers: { ...e.response.headers, 'Content-Type': 'application/json' } });
      },
    });
    assert.equal(calls, 1, e.name);
    assert.deepEqual(result, { kind: 'response', status: e.response.status, body: e.response.body,
      ...(e.response.status === 429 ? { retryAfter: '30' } : {}) }, e.name);
  }
});

test('SEC-03/TR-06: closed selectors, revision guards and chapter states reject malformed or mixed authority input', async () => {
  const exchanges = await readJson('chapter-context-exchanges');
  const selected = exchanges.find(e => e.name === 'selection-cebu');
  const context = exchanges.find(e => e.name === 'context-selected');
  const page = exchanges.find(e => e.name === 'memberships-many-page-one');
  const reject = (original, change) => {
    const invalid = structuredClone(original); change(invalid);
    assert.throws(() => validateExchange(api, ajv, invalid));
  };
  for (const field of ['actor', 'user_id', 'duty_code', 'approved', 'authority_version', 'context']) {
    reject(selected, e => { e.request.body[field] = true; });
  }
  for (const field of ['chapter_id', 'membership_id']) {
    for (const value of [1, '0', '01', '18446744073709551616', ['1', '2'], '1\n']) {
      reject(selected, e => { e.request.body[field] = value; });
    }
  }
  for (const value of [0, -1, 1.5, '1', 4294967296]) {
    reject(selected, e => { e.request.body.expected_membership_version = value; });
    reject(context, e => { e.response.body.context.authority_version = value; });
  }
  reject(selected, e => { delete e.request.header['X-Chapter-Context']; });
  for (const value of [1, '', 'ctx_short', 'ctx_' + 'a'.repeat(97), ['ctx_' + 'a'.repeat(32)]]) {
    reject(selected, e => { e.request.header['X-Chapter-Context'] = value; });
  }
  reject(selected, e => { e.request.query = { chapter_id: '1' }; });
  reject(context, e => { e.request.query.chapter_id = ['1', '2']; });
  for (const value of [0, 101, 1.5, '1', [1, 2]]) reject(page, e => { e.request.query.limit = value; });
  reject(page, e => { e.request.query.cursor = ''; });
  reject(page, e => { e.request.query.user_id = '1'; });
  reject(page, e => { e.request.query.chapter_id = '1'; });
  reject(page, e => { e.response.body.items.push(...Array(101).fill(e.response.body.items[0])); });
  reject(context, e => { e.response.body.context.checked_at = '2026-02-30T00:00:00.000000Z'; });
  reject(context, e => { e.response.body.context.duty_grants[0].ends_at = '2026-10-25T14:00:00+08:00'; });
  reject(context, e => { e.response.body.context.duty_grants[0].scope_kind = 'unit'; });
  reject(context, e => { e.response.body.context.mfa_satisfied = false; });
  reject(context, e => { e.response.body.context.available_actions.push('provider.chapters.create'); });
  reject(context, e => { e.response.body.context.available_actions.push(e.response.body.context.available_actions[0]); });
  reject(context, e => { e.response.body.chapter_state = 'selection_required'; });
  for (const name of ['context-zero', 'context-many']) {
    reject(exchanges.find(e => e.name === name), e => { e.response.body.context = context.response.body.context; });
  }
  const invalidSelector = exchanges.find(e => e.name === 'getChapterContext-400');
  reject(invalidSelector, e => { delete e.request.query; });
  const invalidBody = exchanges.find(e => e.name === 'selectChapter-422');
  reject(invalidBody, e => { e.request.body.expected_membership_version = 3; });
});

test('TR-03/TR-17: P02 projections retain canonical Stage 0 duties, grants and current-context meaning', async () => {
  const internal = JSON.parse(await readFile(new URL('../../identity-record-evidence/v1/contract.schema.json', import.meta.url), 'utf8'));
  ajv.addSchema(internal);
  const check = ajv.compile({ $ref: internal.$id + '#/$defs/CurrentContext' });
  assert.deepEqual(api.components.schemas.ChapterDuty.enum, internal.$defs.Duty.enum);
  assert.equal(internal.$defs.Duty.enum.length, 14);
  const exchanges = await readJson('chapter-context-exchanges');
  for (const e of exchanges.filter(e => e.response.status === 200 && e.response.body.chapter_state === 'selected')) {
    assert.ok(check(e.response.body.context), ajv.errorsText(check.errors));
  }
  const verified = exchanges.find(e => e.name === 'context-one').response.body;
  const notRequired = exchanges.find(e => e.name === 'context-requester-not-required').response.body;
  assert.equal(verified.session.mfa.status, 'verified');
  assert.equal(notRequired.session.mfa.status, 'not_required');
  assert.equal(verified.context.mfa_satisfied, true);
  assert.equal(notRequired.context.mfa_satisfied, true, 'gate satisfied does not claim a verified factor');
  const internalOnly = structuredClone(notRequired.context);
  internalOnly.mfa_satisfied = false;
  assert.ok(check(internalOnly), 'the unchanged internal contract can still represent an unsatisfied gate');
});

test('GOV-03/GOV-04/GOV-08: finite P02 matrix separates sensitive read, preparation, approval, revoke and disable', async () => {
  const catalogue = await readJson('p02-action-catalogue');
  assert.deepEqual(catalogue.duties, api.components.schemas.ChapterDuty.enum);
  assert.deepEqual(catalogue.provider_authorities, ['provisioner', 'billing_admin', 'recovery_operator']);
  assert.equal(new Set(catalogue.actions.map(r => r.action)).size, catalogue.actions.length);
  assert.deepEqual(catalogue.actions.map(r => r.action), api.components.schemas.P02Action.enum);
  assert.deepEqual(new Set(catalogue.actions.map(r => r.category)),
    new Set(['safe_read', 'sensitive_read', 'preparation', 'approval', 'revoke', 'disable']));
  for (const group of ['memberships', 'duty_grants', 'alternates']) {
    for (const verb of ['read', 'prepare', 'authorize', 'revoke']) {
      const row = catalogue.actions.find(r => r.action === `${group}.${verb}`);
      assert.deepEqual(row.chapter_duties, ['CHAPTER_HEAD']);
      assert.deepEqual(row.provider_authorities, []);
    }
  }
  assert.deepEqual(catalogue.actions.find(r => r.action === 'policy.operational.approve').chapter_duties, ['CHAPTER_HEAD']);
  assert.deepEqual(catalogue.actions.find(r => r.action === 'policy.financial.approve').chapter_duties, ['FINANCE']);
  assert.deepEqual(catalogue.actions.find(r => r.action === 'memberships.disable').chapter_duties, ['CHAPTER_HEAD']);
  for (const row of catalogue.actions) {
    assert.ok(row.chapter_duties.every(d => catalogue.duties.includes(d)));
    assert.ok(row.provider_authorities.every(d => catalogue.provider_authorities.includes(d)));
    if (row.provider_authorities.length) {
      assert.deepEqual(row.chapter_duties, []);
      assert.equal(api.components.schemas.P02ChapterAction.enum.includes(row.action), false);
    }
  }
  const globalDisable = catalogue.actions.find(r => r.action === 'identity.disable');
  assert.equal(globalDisable.enabled_boundary, false);
  assert.deepEqual(globalDisable.chapter_duties, []);
  assert.deepEqual(globalDisable.provider_authorities, []);
});

test('GOV-01/GOV-02: generated chapter consumer checks the returned scope and handles all states', async () => {
  const { chapterNextAction, chapterScopeMatches } = await import('../consumer/chapter-context.ts');
  const exchanges = await readJson('chapter-context-exchanges');
  const get = name => structuredClone(exchanges.find(e => e.name === name).response.body);
  assert.equal(chapterNextAction(get('context-zero')), 'no_chapter_work');
  assert.equal(chapterNextAction(get('context-many')), 'select_chapter');
  assert.equal(chapterNextAction(get('context-one')), 'review_current_actions');
  assert.equal(chapterScopeMatches(get('context-selected'), '1'), true);
  assert.equal(chapterScopeMatches(get('context-other-chapter-finance'), '2'), true);
  assert.equal(chapterScopeMatches(get('context-other-chapter-finance'), '1'), false);
  assert.equal(chapterScopeMatches(get('context-zero'), '1'), false);
  for (const change of [
    v => { v.context.chapter_id = '2'; },
    v => { v.context.chapter_name = 'Wrong chapter'; },
    v => { v.context.membership_id = '99'; },
    v => { v.context.user_id = '99'; },
  ]) {
    const wrong = get('context-selected'); change(wrong);
    // Shape validators do not enforce cross-value relationships.
    const validate = ajv.compile(api.components.schemas.ChapterSnapshot);
    assert.ok(validate(wrong));
    assert.equal(chapterScopeMatches(wrong, '1'), false);
  }
  const list = get('memberships-one');
  assert.deepEqual(list.items[0], get('context-one').membership);
  const cebu = get('context-selected');
  const liloan = get('context-other-chapter-finance');
  assert.equal(cebu.context.user_id, liloan.context.user_id);
  assert.equal(cebu.context.available_actions.includes('policy.financial.approve'), false);
  assert.equal(liloan.context.available_actions.includes('memberships.authorize'), false);
  assert.equal(liloan.context.available_actions.includes('policy.financial.approve'), true);
});

test('SEC-01/SEC-03: reviewed scenario obligations link exchanges and execute their disclosure absences', async () => {
  const scenarios = await readJson('chapter-context-scenarios');
  const exchanges = [...await readJson('chapter-context-exchanges'), ...await readJson('operation-examples')];
  const byName = new Map(exchanges.map(e => [e.name, e]));
  for (const s of scenarios) {
    assert.equal(s.verification, 'declarative_server_review');
    assert.ok(s.precondition && s.obligation && s.limitations && s.requirements.length);
    assert.deepEqual(s.automatic_mutation_retries, []);
    for (const name of s.exchanges) {
      assert.ok(byName.has(name), name);
      const e = byName.get(name);
      validateExchange(api, ajv, e);
      if (!s.absence_statuses || s.absence_statuses.includes(e.response.status)) {
        for (const field of s.response_absent_fields) assert.equal(Object.hasOwn(e.response.body, field), false, `${s.id}: ${field}`);
      }
    }
  }
  for (const id of ['zero-one-many', 'pre-mfa-isolation', 'mfa-reevaluation', 'different-chapter-duties', 'concurrent-tabs', 'revoked-selection', 'expired-grant', 'provider-only', 'provider-separate-membership', 'scope-identity', 'original-attempt-after-switch', 'pagination', 'independence', 'protected-delivery', 'unknown-selection']) {
    assert.ok(scenarios.some(s => s.id === id), id);
  }
  const forbidden = ['selection-unknown', 'selection-unauthorized', 'selection-revoked'].map(n => byName.get(n).response);
  assert.deepEqual(forbidden[0], forbidden[1]);
  assert.deepEqual(forbidden[0], forbidden[2]);
  for (const oid of ['getChapterContext', 'selectChapter', 'listChapterMemberships']) {
    const op = Object.values(api.paths).flatMap(p => [p.get, p.post]).find(o => o?.operationId === oid);
    assert.deepEqual(new Set(exchanges.filter(e => e.operationId === oid).map(e => e.response.status)), new Set(Object.keys(op.responses).map(Number)));
  }
  assert.match(api['x-chapter-context-contract'].review_status, /freeze blockers/);
});

test('DOC-11/UX-03: unknown or stale selection never automatically retries or retargets a prepared mutation', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const exchanges = await readJson('chapter-context-exchanges');
  const select = exchanges.find(e => e.name === 'selection-switch-finance');
  for (const respond of [
    () => { throw new TypeError('Selection may have committed'); },
    () => new Response('{', { status: 200, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } }),
  ]) {
    const calls = [];
    const result = await exchangeSession('selectChapter', {
      origin: select.browser.origin, cookie: select.browser.cookie, signal: new AbortController().signal,
      body: select.request.body, contextRevision: select.request.header['X-Chapter-Context'],
      fetch: async url => { calls.push(url.pathname); return respond(); },
    });
    assert.equal(result.kind, 'unresolved');
    assert.deepEqual(calls, ['/api/v1/session/chapter-selection']);
  }
  const success = select.response.body;
  const stale = exchanges.find(e => e.name === 'selection-concurrent-tab');
  assert.notEqual(success.selection_revision, stale.request.header['X-Chapter-Context']);
  assert.equal(stale.request.body.chapter_id, '1');
  assert.equal(success.context.chapter_id, '2');
  assert.equal(stale.response.body.code, 'chapter_context_stale');
});
