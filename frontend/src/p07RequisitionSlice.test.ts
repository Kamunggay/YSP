import { describe, expect, it } from 'vitest';
import {
  createP07RequisitionEngine,
  P07_CONTEXT_STORAGE_KEY,
} from './p07RequisitionSlice';
import type {
  InternalRfRecord,
  P07UncertainLookupResult,
  RfReservation,
  RfReservationPreparation,
} from './p07RequisitionSlice';

describe('p07RequisitionSlice — Internal RF Intake, Review & Eligible Stock Reservation', () => {
  it('starts strictly unseeded with empty requisitions, lots, reservations, and zero summary balances', () => {
    expect(P07_CONTEXT_STORAGE_KEY).toBe('ysp_p07_context');
    const engine = createP07RequisitionEngine();
    const snap = engine.getSnapshot();

    expect(snap.requisitions).toEqual([]);
    expect(snap.stock_lots).toEqual([]);
    expect(snap.preparations).toEqual([]);
    expect(snap.reservations).toEqual([]);
    expect(snap.history).toEqual([]);
    expect(snap.stock_summary).toEqual({
      usable_on_hand: '0',
      rf_reserved: '0',
      available_to_allocate: '0',
      uncovered_shortage: '0',
    });
  });

  it('supports incomplete draft creation, draft replacement, incomplete submit guard, and once-only reference assignment', () => {
    const engine = createP07RequisitionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    // Create incomplete draft (missing needed_at, justification, requesting_unit_id)
    const draftRes = engine.createInternalRf({
      requester_user_id: '101',
      lines: [
        {
          line_id: 'line-tent-1',
          variant_id: '71',
          variant_sku: 'TENT-4P',
          item_name: 'Four-Person Field Tent',
          requested_quantity_value: '5',
          quantity_scale: 0,
        },
      ],
      idempotency_key: 'rf-create-incomplete',
    });
    expect(draftRes.ok).toBe(true);
    expect(draftRes.http_status).toBe(201);
    expect(draftRes.code).toBe('RF_DRAFT_CREATED');
    const draft = draftRes.data as InternalRfRecord;
    expect(draft.status).toBe('draft');
    expect(draft.reference).toBeNull();
    expect(draft.version).toBe(1);
    expect(draft.material_version).toBe(1);

    // Incomplete draft cannot submit yet
    const incompleteSubmit = engine.submitInternalRf({
      rf_id: draft.rf_id,
      actor_user_id: '101',
      expected_version: draft.version,
      expected_material_version: draft.material_version,
      idempotency_key: 'rf-submit-incomplete-fail',
    });
    expect(incompleteSubmit.ok).toBe(false);
    expect(incompleteSubmit.http_status).toBe(422);
    expect(incompleteSubmit.code).toBe('RF_INCOMPLETE_FIELDS');

    // Replace draft with complete details -> bumps version & material_version
    const replaceRes = engine.replaceInternalRfDraft({
      rf_id: draft.rf_id,
      actor_user_id: '101',
      requesting_unit_id: 'UNIT-LOGISTICS',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Field relief shelter deployment',
      lines: [
        {
          line_id: 'line-tent-1',
          variant_id: '71',
          variant_sku: 'TENT-4P',
          item_name: 'Four-Person Field Tent',
          requested_quantity_value: '10',
          quantity_scale: 0,
        },
      ],
      reason: 'Completed unit, schedule, and final tent quantity',
      expected_version: draft.version,
      expected_material_version: draft.material_version,
      idempotency_key: 'rf-replace-complete',
    });
    expect(replaceRes.ok).toBe(true);
    expect(replaceRes.code).toBe('RF_DRAFT_SAVED');
    const saved = replaceRes.data as InternalRfRecord;
    expect(saved.version).toBe(2);
    expect(saved.material_version).toBe(2);

    // Submit -> assigns once-only CEBU-RF-2026-000001
    const submitRes = engine.submitInternalRf({
      rf_id: saved.rf_id,
      actor_user_id: '101',
      expected_version: saved.version,
      expected_material_version: saved.material_version,
      idempotency_key: 'rf-submit-first',
    });
    expect(submitRes.ok).toBe(true);
    expect(submitRes.code).toBe('RF_SUBMITTED');
    const submitted = submitRes.data as InternalRfRecord;
    expect(submitted.reference).toBe('CEBU-RF-2026-000001');
    expect(submitted.status).toBe('submitted');
    expect(submitted.version).toBe(3);
  });

  it('rejects self-approval and executes full return -> revise -> resubmit -> independent re-approve without creating reservations', () => {
    const engine = createP07RequisitionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const created = engine.createInternalRf({
      requester_user_id: '101',
      requesting_unit_id: 'UNIT-LOGISTICS',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Field response',
      lines: [
        {
          line_id: 'line-1',
          variant_id: '71',
          requested_quantity_value: '10',
          quantity_scale: 0,
        },
      ],
    }).data!;

    const submitted = engine.submitInternalRf({
      rf_id: created.rf_id,
      actor_user_id: '101',
      expected_version: created.version,
      expected_material_version: created.material_version,
    }).data!;

    // Self-approval blocked (403 INDEPENDENCE_REQUIRED)
    const selfApprove = engine.approveInternalRf({
      rf_id: submitted.rf_id,
      reviewer_user_id: '101',
      expected_version: submitted.version,
      expected_material_version: submitted.material_version,
    });
    expect(selfApprove.ok).toBe(false);
    expect(selfApprove.http_status).toBe(403);
    expect(selfApprove.code).toBe('INDEPENDENCE_REQUIRED');

    // Return with blank reason rejected
    const blankReturn = engine.returnInternalRf({
      rf_id: submitted.rf_id,
      reviewer_user_id: '202',
      reason: '   ',
      expected_version: submitted.version,
      expected_material_version: submitted.material_version,
    });
    expect(blankReturn.ok).toBe(false);
    expect(blankReturn.code).toBe('REASON_REQUIRED');

    // Independent return with reason
    const returned = engine.returnInternalRf({
      rf_id: submitted.rf_id,
      reviewer_user_id: '202',
      reason: 'Clarify shelter kit quantity to 10 units',
      expected_version: submitted.version,
      expected_material_version: submitted.material_version,
    });
    expect(returned.ok).toBe(true);
    expect(returned.code).toBe('RF_RETURNED');
    const returnedRf = returned.data!;
    expect(returnedRf.reference).toBe('CEBU-RF-2026-000001');

    // Revise back to draft -> keeps reference & line ID, bumps material_version
    const revised = engine.reviseInternalRf({
      rf_id: returnedRf.rf_id,
      actor_user_id: '101',
      requesting_unit_id: 'UNIT-LOGISTICS',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Updated quantity after logistics review',
      lines: [
        {
          line_id: 'line-1',
          variant_id: '71',
          requested_quantity_value: '10',
          quantity_scale: 0,
        },
      ],
      reason: 'Addressed reviewer note',
      expected_version: returnedRf.version,
      expected_material_version: returnedRf.material_version,
      expected_progress_version: returnedRf.progress_version,
    });
    expect(revised.ok).toBe(true);
    expect(revised.code).toBe('RF_REVISED_TO_DRAFT');
    const revisedRf = revised.data!;
    expect(revisedRf.status).toBe('draft');
    expect(revisedRf.reference).toBe('CEBU-RF-2026-000001');
    expect(revisedRf.material_version).toBe(2);
    expect(revisedRf.approval).toBeNull();

    // Resubmit -> retains original CEBU-RF-2026-000001 (never burns sequence 2)
    const resubmitted = engine.submitInternalRf({
      rf_id: revisedRf.rf_id,
      actor_user_id: '101',
      expected_version: revisedRf.version,
      expected_material_version: revisedRf.material_version,
    }).data!;
    expect(resubmitted.reference).toBe('CEBU-RF-2026-000001');

    // Independent approval
    const approved = engine.approveInternalRf({
      rf_id: resubmitted.rf_id,
      reviewer_user_id: '202',
      reviewer_name: 'Logistics Approver',
      duty_code: 'RF_APPROVER',
      expected_version: resubmitted.version,
      expected_material_version: resubmitted.material_version,
    });
    expect(approved.ok).toBe(true);
    expect(approved.code).toBe('RF_APPROVED');
    expect(approved.data?.fulfillment_state).toBe('outstanding');
    expect(approved.data?.lines[0]?.approved_quantity).toBe('10');
    expect(approved.data?.lines[0]?.unreserved_quantity).toBe('10');
    expect(engine.getSnapshot().reservations).toEqual([]);
  });

  it('executes two-step reservation (10 on-hand, 6 reserved -> 4 unreserved shortage) and rejects competing last-unit commit (AC-01)', () => {
    const engine = createP07RequisitionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const lot = engine.registerEligibleStockLot({
      lot_id: 'lot-101',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_value: '10',
      quantity_scale: 0,
    }).data!;
    expect(lot.stock_version).toBe(1);

    const rf1Draft = engine.createInternalRf({
      requester_user_id: '101',
      requesting_unit_id: 'UNIT-ALPHA',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Primary camp deployment',
      lines: [{ line_id: 'rf1-l1', variant_id: '71', requested_quantity_value: '10', quantity_scale: 0 }],
    }).data!;
    const rf1Sub = engine.submitInternalRf({
      rf_id: rf1Draft.rf_id,
      actor_user_id: '101',
      expected_version: rf1Draft.version,
      expected_material_version: rf1Draft.material_version,
    }).data!;
    const rf1App = engine.approveInternalRf({
      rf_id: rf1Sub.rf_id,
      reviewer_user_id: '202',
      expected_version: rf1Sub.version,
      expected_material_version: rf1Sub.material_version,
    }).data!;

    const rf2Draft = engine.createInternalRf({
      requester_user_id: '102',
      requesting_unit_id: 'UNIT-BRAVO',
      needed_at: '2026-12-02T09:00:00.000000Z',
      justification: 'Secondary backup unit',
      lines: [{ line_id: 'rf2-l1', variant_id: '71', requested_quantity_value: '10', quantity_scale: 0 }],
    }).data!;
    const rf2Sub = engine.submitInternalRf({
      rf_id: rf2Draft.rf_id,
      actor_user_id: '102',
      expected_version: rf2Draft.version,
      expected_material_version: rf2Draft.material_version,
    }).data!;
    const rf2App = engine.approveInternalRf({
      rf_id: rf2Sub.rf_id,
      reviewer_user_id: '202',
      expected_version: rf2Sub.version,
      expected_material_version: rf2Sub.material_version,
    }).data!;

    // Prepare 6 on RF1 and competing 10 on RF2 while stock is still 10
    const prep1 = engine.prepareRfReservation({
      actor_user_id: '301',
      rf_id: rf1App.rf_id,
      rf_line_id: 'rf1-l1',
      lot_id: 'lot-101',
      offset_value: '0',
      quantity_value: '6',
    }).data as RfReservationPreparation;
    expect(prep1.state).toBe('prepared');

    const prep2 = engine.prepareRfReservation({
      actor_user_id: '302',
      rf_id: rf2App.rf_id,
      rf_line_id: 'rf2-l1',
      lot_id: 'lot-101',
      offset_value: '0',
      quantity_value: '10',
    }).data as RfReservationPreparation;

    // Commit prep1 (6 units) -> succeeds
    const commit1 = engine.commitRfReservation({
      actor_user_id: '301',
      preparation_id: prep1.preparation_id,
      idempotency_key: 'commit-rf1-6',
    });
    expect(commit1.ok).toBe(true);
    expect(commit1.code).toBe('RESERVATION_COMMITTED');
    const reservation1 = commit1.data as RfReservation;
    expect(reservation1.active_quantity).toBe('6');
    expect(reservation1.expires_at).toBeNull();

    const midSnap = engine.getSnapshot();
    const updatedRf1 = midSnap.requisitions.find((r) => r.rf_id === rf1App.rf_id)!;
    expect(updatedRf1.lines[0]?.reserved_quantity).toBe('6');
    expect(updatedRf1.lines[0]?.unreserved_quantity).toBe('4');
    expect(midSnap.stock_summary).toEqual({
      usable_on_hand: '10',
      rf_reserved: '6',
      available_to_allocate: '4',
      uncovered_shortage: '10', // (4 unreserved RF1 + 10 unreserved RF2) - 4 free stock = 10
    });

    // Competing commit on prep2 (10 units) fails with 409 AVAILABILITY_CONFLICT, 0 committed
    const competingCommit = engine.commitRfReservation({
      actor_user_id: '302',
      preparation_id: prep2.preparation_id,
      idempotency_key: 'commit-rf2-10-fail',
    });
    expect(competingCommit.ok).toBe(false);
    expect(competingCommit.http_status).toBe(409);
    expect(competingCommit.code).toBe('AVAILABILITY_CONFLICT');
    expect(competingCommit.failed_intent_committed).toBe(false);
    expect(engine.getSnapshot().reservations).toHaveLength(1);
  });

  it('supports reservation reallocation across lots, release, and enforces cancellation commitment fence', () => {
    const engine = createP07RequisitionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.registerEligibleStockLot({ lot_id: 'lot-a', variant_id: '71', quantity_value: '10', quantity_scale: 0 });
    engine.registerEligibleStockLot({ lot_id: 'lot-b', variant_id: '71', quantity_value: '10', quantity_scale: 0 });

    const draft = engine.createInternalRf({
      requester_user_id: '101',
      requesting_unit_id: 'UNIT-LOGISTICS',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Shelter setup',
      lines: [{ line_id: 'line-a', variant_id: '71', requested_quantity_value: '4', quantity_scale: 0 }],
    }).data!;
    const sub = engine.submitInternalRf({
      rf_id: draft.rf_id,
      actor_user_id: '101',
      expected_version: draft.version,
      expected_material_version: draft.material_version,
    }).data!;
    const app = engine.approveInternalRf({
      rf_id: sub.rf_id,
      reviewer_user_id: '202',
      expected_version: sub.version,
      expected_material_version: sub.material_version,
    }).data!;

    const prep = engine.prepareRfReservation({
      actor_user_id: '301',
      rf_id: app.rf_id,
      rf_line_id: 'line-a',
      lot_id: 'lot-a',
      offset_value: '0',
      quantity_value: '4',
    }).data!;
    const committed = engine.commitRfReservation({
      actor_user_id: '301',
      preparation_id: prep.preparation_id,
    }).data!;

    // Reallocate 4 units from lot-a to lot-b retaining reservation_id
    const rfAfterCommit = engine.getSnapshot().requisitions[0]!;
    const realloc = engine.reallocateRfReservation({
      actor_user_id: '301',
      reservation_id: committed.reservation_id,
      target_lot_id: 'lot-b',
      target_offset_value: '2',
      quantity_value: '4',
      reason: 'Switch to closer staging bay lot-b',
      expected_reservation_version: committed.version,
      expected_rf_version: rfAfterCommit.version,
      expected_progress_version: rfAfterCommit.progress_version,
      expected_source_stock_version: 2,
      expected_target_stock_version: 1,
    });
    expect(realloc.ok).toBe(true);
    expect(realloc.code).toBe('RESERVATION_REALLOCATED');
    expect(realloc.data?.reservation_id).toBe(committed.reservation_id);
    expect(realloc.data?.lot_id).toBe('lot-b');
    expect(realloc.data?.offset_quantity).toBe('2');

    // Cancellation while reservation is active fails with 409 COMMITMENT_CONFLICT
    const rfBeforeCancel = engine.getSnapshot().requisitions[0]!;
    const blockedCancel = engine.cancelInternalRf({
      rf_id: rfBeforeCancel.rf_id,
      actor_user_id: '101',
      reason: 'Event postponed',
      expected_version: rfBeforeCancel.version,
      expected_material_version: rfBeforeCancel.material_version,
      expected_progress_version: rfBeforeCancel.progress_version,
    });
    expect(blockedCancel.ok).toBe(false);
    expect(blockedCancel.http_status).toBe(409);
    expect(blockedCancel.code).toBe('COMMITMENT_CONFLICT');

    // Explicitly release reservation -> free stock restores -> cancellation now succeeds
    const rel = engine.releaseRfReservation({
      actor_user_id: '301',
      reservation_id: committed.reservation_id,
      release_kind: 'cancel_commitment',
      reason: 'Releasing before event cancellation',
      expected_reservation_version: realloc.data!.version,
      expected_rf_version: rfBeforeCancel.version,
      expected_progress_version: rfBeforeCancel.progress_version,
    });
    expect(rel.ok).toBe(true);
    expect(rel.code).toBe('RESERVATION_RELEASED');
    expect(rel.data?.status).toBe('released');

    const rfReadyForCancel = engine.getSnapshot().requisitions[0]!;
    const cancelRes = engine.cancelInternalRf({
      rf_id: rfReadyForCancel.rf_id,
      actor_user_id: '101',
      reason: 'Event postponed',
      expected_version: rfReadyForCancel.version,
      expected_material_version: rfReadyForCancel.material_version,
      expected_progress_version: rfReadyForCancel.progress_version,
    });
    expect(cancelRes.ok).toBe(true);
    expect(cancelRes.code).toBe('RF_CANCELED');
    expect(cancelRes.data?.fulfillment_state).toBe('closed_canceled');
    expect(cancelRes.data?.lines[0]?.canceled_quantity).toBe('4');
  });

  it('enforces idempotency replay, key conflict, cross-chapter redaction, and fail-closed uncertain lookup', () => {
    const engine = createP07RequisitionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const createPayload = {
      requester_user_id: '101',
      requesting_unit_id: 'UNIT-1',
      needed_at: '2026-12-01T09:00:00.000000Z',
      justification: 'Initial aid kit order',
      lines: [{ variant_id: '71', requested_quantity_value: '5', quantity_scale: 0 }],
      idempotency_key: 'idem-create-001',
    };

    const first = engine.createInternalRf(createPayload);
    expect(first.ok).toBe(true);
    expect(first.replayed).toBe(false);

    // Same key + same payload replays cleanly without creating a second RF
    const replay = engine.createInternalRf(createPayload);
    expect(replay.ok).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(replay.data?.rf_id).toBe(first.data?.rf_id);
    expect(engine.getSnapshot().requisitions).toHaveLength(1);

    // Same key + changed payload returns 409 ACTION_KEY_CONFLICT
    const conflict = engine.createInternalRf({
      ...createPayload,
      justification: 'Tampered justification on same key',
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.http_status).toBe(409);
    expect(conflict.code).toBe('ACTION_KEY_CONFLICT');

    // Cross-chapter access returns 403 FORBIDDEN_REDACTED
    const crossChapter = engine.createInternalRf({
      ...createPayload,
      chapter_id: '999',
      idempotency_key: 'idem-cross-999',
    });
    expect(crossChapter.ok).toBe(false);
    expect(crossChapter.http_status).toBe(403);
    expect(crossChapter.code).toBe('FORBIDDEN_REDACTED');

    // Unknown lookup returns OPERATION_UNCERTAIN preserving inputs
    const unknownLookup = engine.lookupRequisitionOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'rf.create',
      idempotency_key: 'never-committed-key',
    });
    expect(unknownLookup.ok).toBe(false);
    expect(unknownLookup.code).toBe('OPERATION_UNCERTAIN');
    const uncertainData = unknownLookup.data as P07UncertainLookupResult;
    expect(uncertainData.action_result).toBe('uncertain');
    expect(uncertainData.input_policy).toBe('preserve');
    expect(uncertainData.lookup_state).toBe('pending_or_not_visible');

    // Known lookup by key and ULID recovers committed operation
    const opId = engine.getSnapshot().operation_ledger[0]!.operation_id;
    const byKey = engine.lookupRequisitionOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'rf.create',
      idempotency_key: 'idem-create-001',
    });
    expect(byKey.ok).toBe(true);
    expect(byKey.code).toBe('OPERATION_RECOVERED');

    const byUlid = engine.lookupRequisitionOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opId,
    });
    expect(byUlid.ok).toBe(true);
    expect(byUlid.code).toBe('OPERATION_RECOVERED');
  });
});
