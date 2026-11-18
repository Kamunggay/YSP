import { describe, expect, it } from 'vitest';
import {
  computeDeterministicHash,
  createP03RecordEngine,
  normalizeSixDecimalQuantity,
} from './p03RecordSlice';

describe('p03RecordSlice', () => {
  it('saves incomplete drafts incrementing row_version while keeping material_version null', () => {
    const engine = createP03RecordEngine();
    const initial = engine.getSnapshot();
    expect(initial.draft.row_version).toBe(1);
    expect(initial.draft.material_version).toBeNull();
    expect(initial.document_number).toBeNull();

    const saveRes = engine.saveDraft({
      payload: {
        ...initial.draft.draft_payload,
        purpose: 'Partial opening count draft',
      },
    });

    expect(saveRes.action_result).toBe('success');
    const updated = engine.getSnapshot();
    expect(updated.server_row_version).toBe(2);
    expect(updated.draft.row_version).toBe(2);
    expect(updated.draft.material_version).toBeNull();
    expect(updated.current_source).toBeNull();
    expect(updated.document_number).toBeNull();
  });

  it('publishes immutable material_version 1 with deterministic SHA-256 hash and once-only sequence number', () => {
    const engine = createP03RecordEngine();
    const snap = engine.getSnapshot();

    const submitRes = engine.submitMaterial({
      idempotency_key: 'submit-ipc-01',
      expected_row_version: snap.server_row_version,
      expected_material_version: null,
      purpose: 'Synthetic opening count; contract example only',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Approved chapter valuation basis',
    });

    expect(submitRes.action_result).toBe('success');
    expect(submitRes.document_number).toBe('IPC-2026-0001');
    expect(submitRes.operation?.outcome).toBe('committed');
    expect(submitRes.operation?.replayed).toBe(false);
    expect(submitRes.operation?.identity.operation_id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    const after = engine.getSnapshot();
    expect(after.server_material_version).toBe(1);
    expect(after.current_source?.target.material_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(after.current_source?.material.lines[0]?.counted_quantity.value).toBe('10.000000');
    expect(after.current_source?.material.lines[0]?.unit_valuation).toBe('25.000000');
  });

  it('replays identical idempotency key once and rejects changed payload on same key', () => {
    const engine = createP03RecordEngine();
    const snap = engine.getSnapshot();

    const first = engine.submitMaterial({
      idempotency_key: 'same-key-01',
      expected_row_version: snap.server_row_version,
      expected_material_version: null,
      purpose: 'Opening baseline count',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25.000000',
      valuation_basis: 'Chapter standard',
    });
    expect(first.action_result).toBe('success');
    expect(first.operation?.replayed).toBe(false);

    // Exact replay (even with unnormalized decimal representation '10.000000' matching '10')
    const replay = engine.submitMaterial({
      idempotency_key: 'same-key-01',
      expected_row_version: snap.server_row_version,
      expected_material_version: null,
      purpose: 'Opening baseline count',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10.000000',
      unit_valuation: '25',
      valuation_basis: 'Chapter standard',
    });
    expect(replay.action_result).toBe('success');
    expect(replay.operation?.replayed).toBe(true);
    expect(replay.operation?.identity.operation_id).toBe(first.operation?.identity.operation_id);
    expect(replay.document_number).toBe('IPC-2026-0001');
    expect(engine.getSnapshot().server_material_version).toBe(1);

    // Changed payload on same key MUST reject
    const mismatch = engine.submitMaterial({
      idempotency_key: 'same-key-01',
      expected_row_version: snap.server_row_version,
      expected_material_version: null,
      purpose: 'Changed payload on reused key',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '12',
      unit_valuation: '25.000000',
      valuation_basis: 'Chapter standard',
    });
    expect(mismatch.action_result).toBe('blocked');
    expect(mismatch.blocking_reason?.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(mismatch.input_policy).toBe('preserve');
  });

  it('preserves v1 return reason when revised to v2 and never copies prior approvals forward', () => {
    const engine = createP03RecordEngine();

    const sub1 = engine.submitMaterial({
      idempotency_key: 'sub-v1',
      expected_row_version: 1,
      expected_material_version: null,
      purpose: 'Initial v1 purpose',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });
    expect(sub1.record?.material_version).toBe(1);

    // Chapter Head approves v1 first, then Finance returns v1
    const headApproveV1 = engine.recordReviewDecision({
      idempotency_key: 'rev-v1-head',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'approve',
      actor_id: '21',
      actor_name: 'Laurence Parojinog',
      duty_code: 'CHAPTER_HEAD',
      reason: 'Head initial ok',
    });
    expect(headApproveV1.action_result).toBe('success');

    const financeReturnV1 = engine.recordReviewDecision({
      idempotency_key: 'rev-v1-return',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'return',
      actor_id: '22',
      actor_name: 'Maria Clara Santos',
      duty_code: 'FINANCE',
      reason: 'Clarify valuation basis before final sign-off',
    });
    expect(financeReturnV1.action_result).toBe('success');
    expect(financeReturnV1.record?.states.approval).toBe('returned');

    // Revise and publish material v2
    const sub2 = engine.submitMaterial({
      idempotency_key: 'sub-v2',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      purpose: 'Revised v2 clarified purpose',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Verified supplier invoice valuation',
    });
    expect(sub2.action_result).toBe('success');
    expect(sub2.record?.material_version).toBe(2);
    expect(sub2.record?.states.approval).toBe('requires_review');
    expect(sub2.document_number).toBe('IPC-2026-0001');

    const timeline = engine.getVersionTimeline();
    expect(timeline.length).toBe(2);
    const v1 = timeline[0];
    const v2 = timeline[1];
    expect(v1?.target.material_version).toBe(1);
    expect(v1?.decisions.length).toBe(2);
    expect(v1?.decisions[1]?.reason).toBe('Clarify valuation basis before final sign-off');

    // v2 has previous_version -> v1 and ZERO copied decisions!
    expect(v2?.previous_version?.material_version).toBe(1);
    expect(v2?.previous_version?.material_hash).toBe(v1?.target.material_hash);
    expect(v2?.decisions.length).toBe(0);
  });

  it('enforces distinct individual approval identities and rejects self-approval or dual-role reuse', () => {
    const engine = createP03RecordEngine();
    engine.submitMaterial({
      idempotency_key: 'sub-indep',
      expected_row_version: 1,
      expected_material_version: null,
      purpose: 'Independence check count',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });

    // Preparer (user_id 11) tries to approve
    const selfApprove = engine.recordReviewDecision({
      idempotency_key: 'self-app-01',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'approve',
      actor_id: '11',
      actor_name: 'Ana Maria Reyes',
      duty_code: 'RECEIVING',
      reason: 'Trying self-approval',
    });
    expect(selfApprove.action_result).toBe('blocked');
    expect(selfApprove.blocking_reason?.code).toBe('SELF_APPROVAL_FORBIDDEN');

    // Officer 21 approves as CHAPTER_HEAD
    const headApp = engine.recordReviewDecision({
      idempotency_key: 'head-app-01',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'approve',
      actor_id: '21',
      actor_name: 'Laurence Parojinog',
      duty_code: 'CHAPTER_HEAD',
      reason: 'Head approval',
    });
    expect(headApp.action_result).toBe('success');
    expect(headApp.record?.states.approval).toBe('submitted');

    // Same user_id 21 tries to also sign FINANCE slot
    const dupActor = engine.recordReviewDecision({
      idempotency_key: 'dup-actor-01',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'approve',
      actor_id: '21',
      actor_name: 'Laurence Parojinog',
      duty_code: 'FINANCE',
      reason: 'Trying second slot as same person',
    });
    expect(dupActor.action_result).toBe('blocked');
    expect(dupActor.blocking_reason?.code).toBe('DUPLICATE_APPROVER_IDENTITY');

    // Distinct officer 22 signs FINANCE slot -> becomes fully approved
    const finApp = engine.recordReviewDecision({
      idempotency_key: 'fin-app-01',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: 1,
      decision: 'approve',
      actor_id: '22',
      actor_name: 'Maria Clara Santos',
      duty_code: 'FINANCE',
      reason: 'Finance approval',
    });
    expect(finApp.action_result).toBe('success');
    expect(finApp.record?.states.approval).toBe('approved');
  });

  it('detects STALE_ROW_VERSION and STALE_MATERIAL_VERSION with input_policy preserve', () => {
    const engine = createP03RecordEngine();
    engine.submitMaterial({
      idempotency_key: 'sub-stale-base',
      expected_row_version: 1,
      expected_material_version: null,
      purpose: 'Base count',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });

    const staleRowSnap = engine.simulateConcurrentUpdate('row');
    expect(staleRowSnap.server_row_version).toBe(3);

    const staleRowRes = engine.submitMaterial({
      idempotency_key: 'sub-stale-row',
      expected_row_version: 2,
      expected_material_version: 1,
      purpose: 'Local draft text',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '15',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });
    expect(staleRowRes.action_result).toBe('stale');
    expect(staleRowRes.blocking_reason?.code).toBe('STALE_ROW_VERSION');
    expect(staleRowRes.input_policy).toBe('preserve');

    engine.simulateConcurrentUpdate('material');
    const staleMatRes = engine.submitMaterial({
      idempotency_key: 'sub-stale-mat',
      expected_row_version: 3,
      expected_material_version: 1,
      purpose: 'Local draft text',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '15',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });
    expect(staleMatRes.action_result).toBe('stale');
    expect(staleMatRes.blocking_reason?.code).toBe('STALE_MATERIAL_VERSION');
    expect(staleMatRes.input_policy).toBe('preserve');
  });

  it('recovers commit-before-dispatch lost responses via scoped lookup and redacts cross-chapter queries', () => {
    const engine = createP03RecordEngine();

    const lost = engine.submitMaterial({
      idempotency_key: 'lost-conn-01',
      expected_row_version: 1,
      expected_material_version: null,
      purpose: 'Crash test submission',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
      simulate_lost_response: true,
    });

    expect(lost.action_result).toBe('uncertain');
    expect(lost.lookup_state).toBe('unavailable');
    expect(lost.operation?.outcome).toBe('unknown');
    expect(lost.operation?.identity.operation_id).toBeNull();
    expect(lost.blocking_reason?.code).toBe('LOOKUP_UNAVAILABLE');

    // Recover by scoped action + key
    const recoveredByKey = engine.lookupOperation({
      kind: 'by_key',
      chapter_id: '1',
      action_code: 'ipc.submit_material',
      idempotency_key: 'lost-conn-01',
    });
    expect(recoveredByKey.action_result).toBe('success');
    expect(recoveredByKey.operation?.replayed).toBe(true);
    expect(recoveredByKey.document_number).toBe('IPC-2026-0001');
    const ulid = recoveredByKey.operation?.identity.operation_id ?? '';
    expect(ulid).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    // Recover by ULID
    const recoveredById = engine.lookupOperation({
      kind: 'by_id',
      chapter_id: '1',
      operation_id: ulid,
    });
    expect(recoveredById.action_result).toBe('success');
    expect(recoveredById.document_number).toBe('IPC-2026-0001');

    // Cross-chapter lookup must redact and return forbidden
    const wrongChapter = engine.lookupOperation({
      kind: 'by_key',
      chapter_id: '999',
      action_code: 'ipc.submit_material',
      idempotency_key: 'lost-conn-01',
    });
    expect(wrongChapter.action_result).toBe('forbidden');
    expect(wrongChapter.operation).toBeNull();
    expect(wrongChapter.record).toBeNull();
  });

  it('blocks submission when setup policy is inactive while permitting draft saves and rejects generic posting', () => {
    const engine = createP03RecordEngine();
    engine.setPolicyEffective(false);

    const draftOk = engine.saveDraft({
      payload: {
        ...engine.getSnapshot().draft.draft_payload,
        purpose: 'Allowed draft during unapproved config',
      },
    });
    expect(draftOk.action_result).toBe('success');

    const blockedSubmit = engine.submitMaterial({
      idempotency_key: 'no-policy-sub',
      expected_row_version: engine.getSnapshot().server_row_version,
      expected_material_version: null,
      purpose: 'Blocked under missing policy',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
    });
    expect(blockedSubmit.action_result).toBe('blocked');
    expect(blockedSubmit.blocking_reason?.code).toBe('POLICY_NOT_EFFECTIVE');
    expect(blockedSubmit.input_policy).toBe('preserve');

    const genericPost = engine.attemptGenericStockOrMoneyPost('1');
    expect(genericPost.action_result).toBe('blocked');
    expect(genericPost.blocking_reason?.code).toBe('GENERIC_POSTING_FORBIDDEN');
  });

  it('produces deterministic canonical hashes and exact 6-decimal quantity normalization', () => {
    expect(normalizeSixDecimalQuantity('10')).toBe('10.000000');
    expect(normalizeSixDecimalQuantity('10.25')).toBe('10.250000');
    const h1 = computeDeterministicHash({ b: 2, a: 'hello', nested: { z: true, x: '1' } });
    const h2 = computeDeterministicHash({ a: 'hello', nested: { x: '1', z: true }, b: 2 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('tracks parent_reference (DOC-02), persists external_reference (DOC-07), and records cancel decisions with retained reason (DOC-04/DOC-09)', () => {
    const engine = createP03RecordEngine();
    const initial = engine.getSnapshot();
    expect(initial.parent_reference).toEqual({
      kind: 'CONFIG',
      document_number: 'CFG-2026-0001',
      label: 'Policy CFG-2026-0001 v1',
    });

    const submitted = engine.submitMaterial({
      idempotency_key: 'sub-ext-cancel-01',
      expected_row_version: initial.server_row_version,
      expected_material_version: null,
      purpose: 'Opening count with external reference sheet',
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      counted_quantity: '10',
      unit_valuation: '25',
      valuation_basis: 'Standard',
      external_reference: 'COUNT-SHEET-EXT-99',
    });
    expect(submitted.action_result).toBe('success');

    const afterSubmit = engine.getSnapshot();
    expect(afterSubmit.current_source?.material.external_reference).toBe('COUNT-SHEET-EXT-99');
    expect(afterSubmit.draft.draft_payload.external_reference).toBe('COUNT-SHEET-EXT-99');

    const canceled = engine.recordReviewDecision({
      idempotency_key: 'rev-cancel-01',
      expected_row_version: afterSubmit.server_row_version,
      expected_material_version: 1,
      decision: 'cancel',
      actor_id: '21',
      actor_name: 'Laurence Parojinog',
      duty_code: 'CHAPTER_HEAD',
      reason: 'Superseded by recounted chapter worksheet before sign-off',
    });
    expect(canceled.action_result).toBe('success');
    expect(canceled.record?.states.exception).toBe('open');

    const afterCancel = engine.getSnapshot();
    expect(afterCancel.current_source?.decisions[0]?.decision).toBe('cancel');
    expect(afterCancel.current_source?.decisions[0]?.reason).toBe(
      'Superseded by recounted chapter worksheet before sign-off'
    );
  });
});
