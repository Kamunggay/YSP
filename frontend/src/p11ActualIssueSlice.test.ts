import { describe, expect, it } from 'vitest';
import { createP11ActualIssueEngine } from './p11ActualIssueSlice';

const SIG_HASH_1 = 'c'.repeat(64);
const PHOTO_HASH_1 = 'd'.repeat(64);
const SIG_HASH_2 = 'e'.repeat(64);

describe('P11 Signed Partial RF Issue & Material Revision Engine', () => {
  it('starts strictly unseeded and enforces active reservation, SoD, and acknowledgment guards', () => {
    const engine = createP11ActualIssueEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const initial = engine.getSnapshot();
    expect(initial.approved_rfs).toHaveLength(0);
    expect(initial.batches).toHaveLength(0);
    expect(initial.summary.usable_on_hand).toBe('0');
    expect(initial.summary.active_reserved).toBe('0');
    expect(initial.summary.total_issued).toBe('0');

    const regRes = engine.registerApprovedRfForIssue({
      rf_reference: 'CEBU-RF-2026-000001',
      requester_user_id: '101',
      variant_id: '71',
      item_name: 'Sleeping Pad',
      requested_quantity_value: '10',
      initial_reserved_value: '6',
      initial_usable_on_hand_value: '6',
      quantity_scale: 0,
    });
    expect(regRes.ok).toBe(true);
    const rf = regRes.data!;
    expect(rf.active_reserved_quantity).toBe('6');
    expect(rf.uncovered_shortage_quantity).toBe('4');

    // Cannot prepare a batch exceeding active reservation (e.g., 7 > 6)
    const exceedRes = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '7',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Relief Team Lead',
      expected_rf_version: rf.version,
      idempotency_key: 'p11-exceed-1',
    });
    expect(exceedRes.ok).toBe(false);
    expect(exceedRes.code).toBe('EXCEEDS_ACTIVE_RESERVATION');

    // Prepare Batch 1 (4 units) -> assigns CEBU-ISAR-2026-000001
    const prep1 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '4',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Relief Team Lead',
      expected_rf_version: rf.version,
      idempotency_key: 'p11-prep-1',
    });
    expect(prep1.ok).toBe(true);
    const batch1 = prep1.data!;
    expect(batch1.isar_reference).toBe('CEBU-ISAR-2026-000001');

    // Cannot post draft without signed ready evidence
    const unreadyPost = engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: batch1.batch_id,
      expected_batch_version: batch1.version,
      idempotency_key: 'p11-post-unready',
    });
    expect(unreadyPost.ok).toBe(false);
    expect(unreadyPost.code).toBe('MISSING_ISSUANCE_EVIDENCE');

    // Separation of duties guard: issuer === recipient rejected
    const sodErr = engine.bindReadyIssueEvidence({
      batch_id: batch1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      photo_evidence_hash: PHOTO_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '301',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:40:00Z',
      linked_batch_snapshot_hash: batch1.batch_snapshot_hash,
      expected_batch_version: batch1.version,
    });
    expect(sodErr.ok).toBe(false);
    expect(sodErr.code).toBe('SEPARATION_OF_DUTIES_VIOLATION');

    // Missing recipient acknowledgment rejected
    const ackErr = engine.bindReadyIssueEvidence({
      batch_id: batch1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: false,
      signed_at: '2026-11-22T12:40:00Z',
      linked_batch_snapshot_hash: batch1.batch_snapshot_hash,
      expected_batch_version: batch1.version,
    });
    expect(ackErr.ok).toBe(false);
    expect(ackErr.code).toBe('MISSING_RECIPIENT_ACKNOWLEDGMENT');
  });

  it('completes 4 + 2 partial issues, replenishes 4 from RM, and fulfills final 4', () => {
    const engine = createP11ActualIssueEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const rf = engine.registerApprovedRfForIssue({
      rf_reference: 'CEBU-RF-2026-000001',
      requester_user_id: '101',
      variant_id: '71',
      requested_quantity_value: '10',
      initial_reserved_value: '6',
      initial_usable_on_hand_value: '6',
      quantity_scale: 0,
    }).data!;

    // Issue 4
    const b1 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '4',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Lead',
      expected_rf_version: rf.version,
      idempotency_key: 'b1-prep',
    }).data!;
    const b1Bound = engine.bindReadyIssueEvidence({
      batch_id: b1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:40:00Z',
      linked_batch_snapshot_hash: b1.batch_snapshot_hash,
      expected_batch_version: b1.version,
      idempotency_key: 'b1-bind',
    }).data!;
    const b1Post = engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: b1Bound.batch_id,
      expected_batch_version: b1Bound.version,
      idempotency_key: 'b1-post',
    });
    expect(b1Post.ok).toBe(true);

    // Issue 2 (v2 on RF)
    const rfAfter4 = engine.getSnapshot().approved_rfs[0]!;
    expect(rfAfter4.issued_quantity).toBe('4');
    expect(rfAfter4.active_reserved_quantity).toBe('2');

    const b2 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '2',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Lead',
      expected_rf_version: rfAfter4.version,
      idempotency_key: 'b2-prep',
    }).data!;
    const b2Bound = engine.bindReadyIssueEvidence({
      batch_id: b2.batch_id,
      evidence_kind: 'EL',
      signature_evidence_hash: SIG_HASH_2,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:41:00Z',
      linked_batch_snapshot_hash: b2.batch_snapshot_hash,
      expected_batch_version: b2.version,
      idempotency_key: 'b2-bind',
    }).data!;
    expect(
      engine.postActualIssueBatch({
        actor_user_id: '301',
        batch_id: b2Bound.batch_id,
        expected_batch_version: b2Bound.version,
        idempotency_key: 'b2-post',
      }).ok
    ).toBe(true);

    const midSnap = engine.getSnapshot();
    expect(midSnap.approved_rfs[0]!.issued_quantity).toBe('6');
    expect(midSnap.approved_rfs[0]!.remaining_demand_quantity).toBe('4');
    expect(midSnap.approved_rfs[0]!.active_reserved_quantity).toBe('0');
    expect(midSnap.summary.usable_on_hand).toBe('0');

    // Replenish 4 from RM -> converts remaining 4 uncovered demand into active reservation
    const repRes = engine.replenishRfReservationFromRm({
      actor_user_id: '301',
      rf_id: rf.rf_id,
      rm_reference: 'CEBU-RM-2026-000001',
      replenished_quantity_value: '4',
      expected_rf_version: midSnap.approved_rfs[0]!.version,
      idempotency_key: 'rep-1',
    });
    expect(repRes.ok).toBe(true);
    expect(repRes.code).toBe('RF_RESERVATION_REPLENISHED');
    expect(repRes.data!.active_reserved_quantity).toBe('4');

    // Issue final 4 -> RF becomes fulfilled
    const b3 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '4',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Lead',
      expected_rf_version: repRes.data!.version,
      idempotency_key: 'b3-prep',
    }).data!;
    const b3Bound = engine.bindReadyIssueEvidence({
      batch_id: b3.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:42:00Z',
      linked_batch_snapshot_hash: b3.batch_snapshot_hash,
      expected_batch_version: b3.version,
      idempotency_key: 'b3-bind',
    }).data!;
    const b3Post = engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: b3Bound.batch_id,
      expected_batch_version: b3Bound.version,
      idempotency_key: 'b3-post',
    });
    expect(b3Post.ok).toBe(true);

    const endSnap = engine.getSnapshot();
    expect(endSnap.approved_rfs[0]!.status).toBe('fulfilled');
    expect(endSnap.approved_rfs[0]!.issued_quantity).toBe('10');
    expect(endSnap.approved_rfs[0]!.remaining_demand_quantity).toBe('0');
    expect(endSnap.summary.usable_on_hand).toBe('0');
    expect(endSnap.summary.total_issued).toBe('10');
  });

  it('closes 6 issued + 4 canceled formally without erasing previously posted batches', () => {
    const engine = createP11ActualIssueEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const rf = engine.registerApprovedRfForIssue({
      rf_reference: 'CEBU-RF-2026-000002',
      requester_user_id: '101',
      variant_id: '72',
      requested_quantity_value: '10',
      initial_reserved_value: '6',
      initial_usable_on_hand_value: '6',
      quantity_scale: 0,
    }).data!;

    const b1 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '6',
      recipient_name: 'Juan Cruz',
      recipient_user_id: '103',
      recipient_capacity: 'Medic',
      expected_rf_version: rf.version,
    }).data!;
    const b1Bound = engine.bindReadyIssueEvidence({
      batch_id: b1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '103',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:40:00Z',
      linked_batch_snapshot_hash: b1.batch_snapshot_hash,
      expected_batch_version: b1.version,
    }).data!;
    engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: b1Bound.batch_id,
      expected_batch_version: b1Bound.version,
    });

    const currentRf = engine.getSnapshot().approved_rfs[0]!;
    const cancelRes = engine.cancelRemainingRfDemand({
      actor_user_id: '201',
      rf_id: rf.rf_id,
      cancellation_reason: 'Activity ended; remaining 4 units no longer required',
      expected_rf_version: currentRf.version,
      idempotency_key: 'cancel-rem-1',
    });
    expect(cancelRes.ok).toBe(true);
    expect(cancelRes.code).toBe('RF_REMAINDER_CANCELED');
    expect(cancelRes.data!.status).toBe('partially_fulfilled_and_canceled');
    expect(cancelRes.data!.issued_quantity).toBe('6');
    expect(cancelRes.data!.canceled_quantity).toBe('4');
    expect(cancelRes.data!.remaining_demand_quantity).toBe('0');

    const finalSnap = engine.getSnapshot();
    expect(finalSnap.batches).toHaveLength(1);
    expect(finalSnap.summary.total_issued).toBe('6');
    expect(finalSnap.summary.total_canceled).toBe('4');
  });

  it('invalidates bound signature on material batch revision and supports idempotent replay + lookup', () => {
    const engine = createP11ActualIssueEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const rf = engine.registerApprovedRfForIssue({
      rf_reference: 'CEBU-RF-2026-000003',
      requester_user_id: '101',
      variant_id: '73',
      requested_quantity_value: '8',
      initial_reserved_value: '8',
      initial_usable_on_hand_value: '8',
      quantity_scale: 0,
    }).data!;

    const b1 = engine.prepareActualIssueBatch({
      prepared_by_user_id: '301',
      rf_id: rf.rf_id,
      batch_quantity_value: '4',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Lead',
      expected_rf_version: rf.version,
      idempotency_key: 'rev-prep-1',
    }).data!;
    const staleHash = b1.batch_snapshot_hash;

    const bound1 = engine.bindReadyIssueEvidence({
      batch_id: b1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:40:00Z',
      linked_batch_snapshot_hash: staleHash,
      expected_batch_version: b1.version,
      idempotency_key: 'rev-bind-1',
    }).data!;
    expect(bound1.status).toBe('ready');

    // Material revision invalidates prior bound signature & increments material_version
    const revised = engine.reviseActualIssueBatch({
      actor_user_id: '301',
      batch_id: b1.batch_id,
      batch_quantity_value: '5',
      recipient_name: 'Maria Santos',
      recipient_user_id: '102',
      recipient_capacity: 'Lead',
      expected_batch_version: bound1.version,
      idempotency_key: 'rev-edit-1',
    });
    expect(revised.ok).toBe(true);
    expect(revised.data!.material_version).toBe(2);
    expect(revised.data!.status).toBe('draft');
    expect(revised.data!.ready_evidence).toBeNull();
    expect(revised.data!.batch_snapshot_hash).not.toBe(staleHash);

    // Submitting stale hash against revised batch rejects with STALE_BATCH_EVIDENCE_MISMATCH
    const staleBind = engine.bindReadyIssueEvidence({
      batch_id: b1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_1,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:41:00Z',
      linked_batch_snapshot_hash: staleHash,
      expected_batch_version: revised.data!.version,
    });
    expect(staleBind.ok).toBe(false);
    expect(staleBind.code).toBe('STALE_BATCH_EVIDENCE_MISMATCH');

    // Fresh bind + post succeeds
    const bound2 = engine.bindReadyIssueEvidence({
      batch_id: b1.batch_id,
      evidence_kind: 'IS_AR',
      signature_evidence_hash: SIG_HASH_2,
      issuer_user_id: '301',
      recipient_user_id: '102',
      recipient_acknowledged: true,
      signed_at: '2026-11-22T12:42:00Z',
      linked_batch_snapshot_hash: revised.data!.batch_snapshot_hash,
      expected_batch_version: revised.data!.version,
      idempotency_key: 'rev-bind-2',
    }).data!;

    const post1 = engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: bound2.batch_id,
      expected_snapshot_hash: revised.data!.batch_snapshot_hash,
      expected_batch_version: bound2.version,
      idempotency_key: 'rev-post-1',
    });
    expect(post1.ok).toBe(true);
    expect(post1.data!.batch_quantity).toBe('5');

    // Replay same post key returns replayed result
    const replay = engine.postActualIssueBatch({
      actor_user_id: '301',
      batch_id: bound2.batch_id,
      expected_snapshot_hash: revised.data!.batch_snapshot_hash,
      expected_batch_version: bound2.version,
      idempotency_key: 'rev-post-1',
    });
    expect(replay.replayed).toBe(true);

    const lookupOk = engine.lookupIssueOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'rev-post-1',
    });
    expect(lookupOk.code).toBe('OPERATION_RECOVERED');

    const lookupMiss = engine.lookupIssueOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: '01K9UNKNOWN',
    });
    expect(lookupMiss.code).toBe('OPERATION_UNCERTAIN');

    const lookupCross = engine.lookupIssueOperation({
      query_type: 'by_key',
      chapter_id: '999',
      idempotency_key: 'rev-post-1',
    });
    expect(lookupCross.code).toBe('FORBIDDEN_REDACTED');
  });
});
