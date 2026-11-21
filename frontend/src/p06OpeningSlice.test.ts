import { describe, expect, it } from 'vitest';
import {
  computeAcceptOpeningFingerprint,
  createP06OpeningEngine,
  P06_CONTEXT_STORAGE_KEY,
} from './p06OpeningSlice';
import type { AcceptOpeningInput, AcceptedOpeningResult, UnacceptedOpeningResult } from './p06OpeningSlice';

function createWalkthroughEngine() {
  return createP06OpeningEngine({
    chapter_id: '1',
    chapter_name: 'Synthetic chapter A',
    inspector: {
      chapter_id: '1',
      user_id: '11',
      membership_id: '111',
      duty_grant_id: '112',
      duty_code: 'RECEIVING',
      actor_name: 'Synthetic officer 11',
      chapter_name: 'Synthetic chapter A',
      captured_at: '2026-10-24T06:00:00.000000Z',
    },
    policy: {
      chapter_id: '1',
      policy_id: '41',
      policy_version_id: '42',
      version_no: 1,
      settings_hash: 'a'.repeat(64),
      approval: {
        chapter_id: '1',
        record: { id: '43', kind: 'CONFIG' },
        material_version: 1,
        material_hash: 'b'.repeat(64),
      },
      effective_from: '2026-10-23T00:00:00.000000Z',
      effective_until: null,
    },
  });
}

function buildCanonicalAcceptInput(overrides?: Partial<AcceptOpeningInput>): AcceptOpeningInput {
  const ipcHash = 'bbd7495ecab1a3ce691c09aa273d58b7247c308d4842c5048ba5f70b1feaf128';
  const rmHash = '8a749f25377479cffec388d99e5ee1fa30dac766f3df967ec5a36a0753c60179';

  return {
    context: {
      chapter_id: '1',
      action_code: 'purchasing.accept_opening_rm',
      idempotency_key: '01K9P06VECTORKEY000000001',
      record: { id: '901', kind: 'RM' },
      expected_row_version: 4,
      expected_material_version: 1,
    },
    receipt: {
      chapter_id: '1',
      record: { id: '901', kind: 'RM' },
      material_version: 1,
      material_hash: rmHash,
    },
    source: {
      source_kind: 'opening',
      target: {
        chapter_id: '1',
        record: { id: '9007199254740993', kind: 'IPC' },
        material_version: 1,
        material_hash: ipcHash,
      },
      expected_row_version: 8,
    },
    evidence: [
      {
        binding_id: '401',
        target: {
          chapter_id: '1',
          record: { id: '9007199254740993', kind: 'IPC' },
          material_version: 1,
          material_hash: ipcHash,
        },
        line: null,
        evidence: {
          chapter_id: '1',
          evidence_object_id: '301',
          content_hash: 'c'.repeat(64),
          object_version: 'djE=',
        },
        purpose_code: 'ipc_signed_count_sheet',
      },
      {
        binding_id: '402',
        target: {
          chapter_id: '1',
          record: { id: '901', kind: 'RM' },
          material_version: 1,
          material_hash: rmHash,
        },
        line: null,
        evidence: {
          chapter_id: '1',
          evidence_object_id: '302',
          content_hash: 'd'.repeat(64),
          object_version: 'djE=',
        },
        purpose_code: 'rm_inspection',
      },
      {
        binding_id: '403',
        target: {
          chapter_id: '1',
          record: { id: '901', kind: 'RM' },
          material_version: 1,
          material_hash: rmHash,
        },
        line: null,
        evidence: {
          chapter_id: '1',
          evidence_object_id: '303',
          content_hash: 'e'.repeat(64),
          object_version: 'djE=',
        },
        purpose_code: 'rm_discrepancy',
      },
    ],
    ...overrides,
  };
}

function seedWalkthroughReadyEngine() {
  const engine = createWalkthroughEngine();
  expect(
    engine.addCounter({ user_id: '11', display_name: 'Officer Eleven', is_regular_custodian: true }).ok
  ).toBe(true);
  expect(
    engine.addCounter({ user_id: '12', display_name: 'Auditor Twelve', is_regular_custodian: false }).ok
  ).toBe(true);

  expect(
    engine.addIpcLine({
      line_id: '501',
      variant_id: '71',
      variant_sku: 'TENT-4P',
      item_name: 'Four-Person Field Tent',
      location_id: '81',
      custody_assignment_id: '82',
      condition_code: 'usable',
      counted_quantity_value: '10',
      quantity_scale: 0,
      unit_valuation: '25',
      valuation_basis: 'Synthetic approved test valuation',
      restriction_version_id: '83',
    }).ok
  ).toBe(true);

  expect(
    engine.addIpcLine({
      line_id: '502',
      variant_id: '71',
      variant_sku: 'TENT-4P',
      item_name: 'Four-Person Field Tent',
      location_id: '84',
      custody_assignment_id: '85',
      condition_code: 'damaged',
      counted_quantity_value: '2',
      quantity_scale: 0,
      unit_valuation: '25',
      valuation_basis: 'Synthetic approved test valuation',
      restriction_version_id: '83',
    }).ok
  ).toBe(true);

  const ipcRes = engine.publishAndApproveIpc({
    ipc_record_id: '9007199254740993',
    cutoff_at: '2026-10-23T23:00:00.000000Z',
    counted_at: '2026-10-24T06:00:00.000000Z',
    purpose: 'Synthetic opening count; contract example only',
    policy_version_id: '42',
    head_approved: true,
    finance_approved: true,
    signed_sheet_hash: 'c'.repeat(64),
    binding_id: '401',
    evidence_object_id: '301',
  });
  expect(ipcRes.ok).toBe(true);

  expect(
    engine.saveInspectionLine({
      rm_line_id: '601',
      source_line_id: '501',
      delivered_value: '10',
      accepted_value: '10',
      rejected_value: '0',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '0',
      condition_code: 'usable',
      condition_notes: 'Ten inspected usable units; packaging/specification/variant match.',
    }).ok
  ).toBe(true);

  expect(
    engine.saveInspectionLine({
      rm_line_id: '602',
      source_line_id: '502',
      delivered_value: '2',
      accepted_value: '0',
      rejected_value: '2',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '2',
      condition_code: 'damaged',
      condition_notes: 'Two damaged units segregated in holding; unavailable; discrepancy remains open.',
    }).ok
  ).toBe(true);

  const rmRes = engine.publishInspectionReceipt({
    rm_record_id: '901',
    inspection_at: '2026-10-24T06:30:00.000000Z',
    inspection_evidence_hash: 'd'.repeat(64),
    discrepancy_evidence_hash: 'e'.repeat(64),
    inspection_binding_id: '402',
    discrepancy_binding_id: '403',
  });
  expect(rmRes.ok).toBe(true);

  return { engine, ipcRes, rmRes };
}

describe('p06OpeningSlice — Opening Physical Count & RM Baseline Acceptance', () => {
  it('starts strictly unseeded with empty counters, lines, evidence, and unlocked zero stock state', () => {
    expect(P06_CONTEXT_STORAGE_KEY).toBe('ysp_p06_context');
    const engine = createP06OpeningEngine();
    const snap = engine.getSnapshot();

    expect(snap.baseline_locked).toBe(false);
    expect(snap.baseline_id).toBeNull();
    expect(snap.cutover_id).toBeNull();
    expect(snap.counters).toEqual([]);
    expect(snap.ipc_lines).toEqual([]);
    expect(snap.ipc_state).toBeNull();
    expect(snap.rm_lines).toEqual([]);
    expect(snap.rm_state).toBeNull();
    expect(snap.evidence_bindings).toEqual([]);
    expect(snap.stock_effects).toEqual([]);
    expect(snap.coverage_cells).toEqual([]);
    expect(snap.discrepancy_ids).toEqual([]);
    expect(snap.accepted_result).toBeNull();
    expect(snap.stock_projection).toEqual({
      usable_stockroom_on_hand: '0',
      available_to_allocate: '0',
      quarantined_rejected: '0',
      total_physical_documented: '0',
      open_discrepancy_units: '0',
    });
  });

  it('computes RFC 8785 JCS fingerprint matching fingerprint-vector.json, invariant to evidence order and idempotency_key', () => {
    const baseInput = buildCanonicalAcceptInput();
    const expectedHash = '5b2145432d2d0e008ae3c2c44259a429424607817c5e93dbea4a86e3e2cb4fc0';

    expect(computeAcceptOpeningFingerprint(baseInput)).toBe(expectedHash);

    const reordered = buildCanonicalAcceptInput({
      context: {
        ...baseInput.context,
        idempotency_key: '01K9P06DIFFERENTKEY000002',
      },
      evidence: [baseInput.evidence[2]!, baseInput.evidence[0]!, baseInput.evidence[1]!],
    });
    expect(computeAcceptOpeningFingerprint(reordered)).toBe(expectedHash);
  });

  it('enforces independent counter pair and dual Head + Finance approval gates on IPC publish', () => {
    const engine = createWalkthroughEngine();
    engine.addCounter({ user_id: '11', is_regular_custodian: true });
    engine.addCounter({ user_id: '13', is_regular_custodian: true });
    engine.addIpcLine({
      line_id: '501',
      variant_id: '71',
      location_id: '81',
      custody_assignment_id: '82',
      condition_code: 'usable',
      counted_quantity_value: '10',
      quantity_scale: 0,
      unit_valuation: '25',
      valuation_basis: 'Approved unit price',
      restriction_version_id: '83',
    });

    const singleRolePublish = engine.publishAndApproveIpc({
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      purpose: 'Opening count',
      policy_version_id: '42',
      head_approved: true,
      finance_approved: true,
      signed_sheet_hash: 'c'.repeat(64),
    });
    expect(singleRolePublish.ok).toBe(false);
    expect(singleRolePublish.http_status).toBe(409);
    expect(singleRolePublish.code).toBe('COUNTER_INDEPENDENCE_REQUIRED');

    engine.addCounter({ user_id: '12', is_regular_custodian: false });

    const missingFinancePublish = engine.publishAndApproveIpc({
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      purpose: 'Opening count',
      policy_version_id: '42',
      head_approved: true,
      finance_approved: false,
      signed_sheet_hash: 'c'.repeat(64),
    });
    expect(missingFinancePublish.ok).toBe(false);
    expect(missingFinancePublish.http_status).toBe(409);
    expect(missingFinancePublish.code).toBe('IPC_APPROVALS_INCOMPLETE');
    expect(engine.getSnapshot().stock_effects).toEqual([]);
  });

  it('validates RM inspection line conservation arithmetic and rejects non-usable accepted stock', () => {
    const engine = createWalkthroughEngine();
    engine.addCounter({ user_id: '11', is_regular_custodian: true });
    engine.addCounter({ user_id: '12', is_regular_custodian: false });
    engine.addIpcLine({
      line_id: '501',
      variant_id: '71',
      location_id: '81',
      custody_assignment_id: '82',
      condition_code: 'usable',
      counted_quantity_value: '10',
      quantity_scale: 0,
      unit_valuation: '25',
      valuation_basis: 'Approved price',
      restriction_version_id: '83',
    });
    engine.addIpcLine({
      line_id: '502',
      variant_id: '71',
      location_id: '84',
      custody_assignment_id: '85',
      condition_code: 'damaged',
      counted_quantity_value: '2',
      quantity_scale: 0,
      unit_valuation: '25',
      valuation_basis: 'Approved price',
      restriction_version_id: '83',
    });
    engine.publishAndApproveIpc({
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      purpose: 'Opening count',
      policy_version_id: '42',
      head_approved: true,
      finance_approved: true,
      signed_sheet_hash: 'c'.repeat(64),
    });

    const mismatchExpected = engine.saveInspectionLine({
      source_line_id: '501',
      delivered_value: '9',
      accepted_value: '9',
      rejected_value: '0',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '0',
      condition_code: 'usable',
      condition_notes: 'Short count without missing qty.',
    });
    expect(mismatchExpected.code).toBe('QUANTITY_MISMATCH_EXPECTED');

    const mismatchDelivered = engine.saveInspectionLine({
      source_line_id: '501',
      delivered_value: '10',
      accepted_value: '8',
      rejected_value: '0',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '0',
      condition_code: 'usable',
      condition_notes: 'Split does not add to delivered.',
    });
    expect(mismatchDelivered.code).toBe('QUANTITY_MISMATCH_DELIVERED');

    const nonusableExceeds = engine.saveInspectionLine({
      source_line_id: '502',
      delivered_value: '2',
      accepted_value: '2',
      rejected_value: '0',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '1',
      condition_code: 'damaged',
      condition_notes: 'Cannot exceed rejected + held.',
    });
    expect(nonusableExceeds.code).toBe('NONUSABLE_EXCEEDS_REJECTED_HELD');

    const nonusableAccepted = engine.saveInspectionLine({
      source_line_id: '502',
      delivered_value: '2',
      accepted_value: '2',
      rejected_value: '0',
      held_value: '0',
      missing_value: '0',
      nonusable_recorded_value: '0',
      condition_code: 'damaged',
      condition_notes: 'Damaged items cannot enter usable stock.',
    });
    expect(nonusableAccepted.code).toBe('NONUSABLE_CANNOT_ACCEPT_AS_USABLE');
  });

  it('executes full 10 usable + 2 damaged opening walkthrough matching canonical IPC/RM hashes and locking baseline', () => {
    const { engine, ipcRes, rmRes } = seedWalkthroughReadyEngine();

    expect(ipcRes.data?.material_hash).toBe(
      'bbd7495ecab1a3ce691c09aa273d58b7247c308d4842c5048ba5f70b1feaf128'
    );
    expect(rmRes.data?.material_hash).toBe(
      '8a749f25377479cffec388d99e5ee1fa30dac766f3df967ec5a36a0753c60179'
    );
    expect(engine.getSnapshot().stock_effects).toEqual([]);

    const preInput = buildCanonicalAcceptInput();
    const rawPinsWithoutLine = preInput.evidence.map((p) => ({ ...p, line: null }));
    const acceptInput = buildCanonicalAcceptInput({ evidence: rawPinsWithoutLine });

    const commitRes = engine.acceptOpeningRm(acceptInput);
    expect(commitRes.ok).toBe(true);
    expect(commitRes.http_status).toBe(200);
    expect(commitRes.code).toBe('OPENING_BASELINE_ACCEPTED');

    const payload = commitRes.data as AcceptedOpeningResult;
    expect(payload.action_result).toBe('success');
    expect(payload.operation.replayed).toBe(false);
    expect(payload.operation.outcome).toBe('committed');
    expect(payload.record.row_version).toBe(5);
    expect(payload.record.states).toEqual({
      inspection: 'complete',
      posting: 'posted',
      exception: 'open',
    });
    expect(payload.data.baseline_id).toBe('1001');
    expect(payload.data.cutover).toEqual({ id: '1002', kind: 'CUTOVER' });
    expect(payload.data.source_state.row_version).toBe(9);
    expect(payload.data.discrepancy_ids).toEqual(['1501']);
    expect(payload.data.audit_event_id).toBe('1601');
    expect(payload.data.follow_up_task_ids).toEqual(['1701', '1702']);
    expect(payload.data.stock_effects).toHaveLength(2);
    expect(payload.data.stock_effects[0]).toMatchObject({
      lot_kind: 'accepted',
      condition_code: 'usable',
      documented_quantity: { value: '10.000000', quantity_scale: 0 },
      accepted_quantity: { value: '10.000000', quantity_scale: 0 },
    });
    expect(payload.data.stock_effects[1]).toMatchObject({
      lot_kind: 'nonusable',
      condition_code: 'damaged',
      documented_quantity: { value: '2.000000', quantity_scale: 0 },
      accepted_quantity: { value: '0.000000', quantity_scale: 0 },
    });

    const postSnap = engine.getSnapshot();
    expect(postSnap.baseline_locked).toBe(true);
    expect(postSnap.baseline_id).toBe('1001');
    expect(postSnap.cutover_id).toBe('1002');
    expect(postSnap.coverage_cells).toHaveLength(2);
    expect(postSnap.stock_projection).toEqual({
      usable_stockroom_on_hand: '10',
      available_to_allocate: '10',
      quarantined_rejected: '2',
      total_physical_documented: '12',
      open_discrepancy_units: '2',
    });
  });

  it('enforces idempotency replay before baseline lock check, idempotency conflict, and once-only baseline fence', () => {
    const { engine } = seedWalkthroughReadyEngine();
    const acceptInput = buildCanonicalAcceptInput({
      evidence: buildCanonicalAcceptInput().evidence.map((p) => ({ ...p, line: null })),
    });

    const firstCommit = engine.acceptOpeningRm(acceptInput);
    expect(firstCommit.ok).toBe(true);
    const firstResult = firstCommit.data as AcceptedOpeningResult;

    // Same idempotency_key + same payload (with original pre-commit expected_row_version=4) replays cleanly
    const replayRes = engine.acceptOpeningRm(acceptInput);
    expect(replayRes.ok).toBe(true);
    expect(replayRes.code).toBe('OPENING_BASELINE_REPLAYED');
    const replayResult = replayRes.data as AcceptedOpeningResult;
    expect(replayResult.operation.replayed).toBe(true);
    expect(replayResult.operation.identity.operation_id).toBe(firstResult.operation.identity.operation_id);

    // Same idempotency_key + altered fingerprint yields 409 IDEMPOTENCY_CONFLICT
    const conflictRes = engine.acceptOpeningRm({
      ...acceptInput,
      context: { ...acceptInput.context, expected_row_version: 5 },
    });
    expect(conflictRes.ok).toBe(false);
    expect(conflictRes.http_status).toBe(409);
    expect(conflictRes.code).toBe('IDEMPOTENCY_CONFLICT');

    // Fresh idempotency_key after baseline is locked hits DUPLICATE_OPENING_BASELINE once-only fence
    const duplicateRes = engine.acceptOpeningRm({
      ...acceptInput,
      context: {
        ...acceptInput.context,
        idempotency_key: '01K9P06FRESHKEY0000000002',
      },
    });
    expect(duplicateRes.ok).toBe(false);
    expect(duplicateRes.http_status).toBe(409);
    expect(duplicateRes.code).toBe('DUPLICATE_OPENING_BASELINE');
    expect((duplicateRes.data as UnacceptedOpeningResult).action_result).toBe('blocked');
  });

  it('redacts cross-chapter 403 scopes and returns fail-closed uncertain lookup when unseen', () => {
    const { engine } = seedWalkthroughReadyEngine();
    const acceptInput = buildCanonicalAcceptInput({
      evidence: buildCanonicalAcceptInput().evidence.map((p) => ({ ...p, line: null })),
    });

    const crossChapterAccept = engine.acceptOpeningRm({
      ...acceptInput,
      context: { ...acceptInput.context, chapter_id: '999' },
    });
    expect(crossChapterAccept.ok).toBe(false);
    expect(crossChapterAccept.http_status).toBe(403);
    expect(crossChapterAccept.code).toBe('FORBIDDEN_REDACTED');
    expect(crossChapterAccept.data as UnacceptedOpeningResult).toMatchObject({
      action_result: 'forbidden',
      chapter_id: null,
      record: null,
      data: null,
      operation: null,
    });

    const uncertainLookup = engine.lookupOpeningOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'purchasing.accept_opening_rm',
      idempotency_key: '01K9P06UNKNOWNKEY00000001',
    });
    expect(uncertainLookup.ok).toBe(false);
    expect(uncertainLookup.code).toBe('OPERATION_UNCERTAIN');
    const uncertainData = uncertainLookup.data as UnacceptedOpeningResult;
    expect(uncertainData.action_result).toBe('uncertain');
    expect(uncertainData.input_policy).toBe('preserve');
    expect(uncertainData.lookup_state).toBe('pending_or_not_visible');
    expect(uncertainData.operation?.outcome).toBe('unknown');

    // Commit and verify lookup by_key and by_ulid plus cross-chapter lookup redaction
    const committed = engine.acceptOpeningRm(acceptInput);
    expect(committed.ok).toBe(true);
    const opId = (committed.data as AcceptedOpeningResult).operation.identity.operation_id!;

    const recoveredByKey = engine.lookupOpeningOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'purchasing.accept_opening_rm',
      idempotency_key: acceptInput.context.idempotency_key,
    });
    expect(recoveredByKey.ok).toBe(true);
    expect(recoveredByKey.code).toBe('OPERATION_RECOVERED');

    const recoveredByUlid = engine.lookupOpeningOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opId,
    });
    expect(recoveredByUlid.ok).toBe(true);
    expect(recoveredByUlid.code).toBe('OPERATION_RECOVERED');

    const crossChapterLookup = engine.lookupOpeningOperation({
      query_type: 'by_ulid',
      chapter_id: '2',
      operation_id: opId,
    });
    expect(crossChapterLookup.ok).toBe(false);
    expect(crossChapterLookup.http_status).toBe(403);
    expect(crossChapterLookup.code).toBe('FORBIDDEN_REDACTED');
  });
});
