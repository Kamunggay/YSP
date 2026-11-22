import { describe, expect, it } from 'vitest';
import {
  createP10SupplierReceivingEngine,
  P10_CONTEXT_STORAGE_KEY,
} from './p10SupplierReceivingSlice';
import type { P10LookupResult, SupplierClaimRecord, SupplierRmReceipt } from './p10SupplierReceivingSlice';

describe('p10SupplierReceivingSlice — Supplier Delivery, Partial RM & Discrepancy Loop', () => {
  it('starts strictly unseeded with empty POs, receipts, claims, and zero stock projections', () => {
    expect(P10_CONTEXT_STORAGE_KEY).toBe('ysp_p10_context');
    const engine = createP10SupplierReceivingEngine();
    const snap = engine.getSnapshot();

    expect(snap.open_pos).toEqual([]);
    expect(snap.receipts).toEqual([]);
    expect(snap.supplier_claims).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand: '0',
      allocatable_now: '0',
      held_quarantined: '0',
      rejected_nonusable: '0',
      open_po_outstanding: '0',
      open_claims_count: 0,
    });
  });

  it('rejects missing supplier DR, wrong variant substitution, overdelivery, and missing discrepancy digest', () => {
    const engine = createP10SupplierReceivingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const po = engine.registerOpenPoForReceiving({
      po_reference: 'CEBU-PO-2026-000001',
      supplier_name: 'Mactan Gear Supply',
      variant_id: '71',
      ordered_quantity_value: '100',
      quantity_scale: 0,
    }).data!;

    // Missing supplier DR blocked
    const noDr = engine.inspectAndPostSupplierRm({
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: false,
      supplier_dr_reference: '',
      delivered_variant_id: '71',
      delivered_value: '40',
      accepted_value: '40',
      held_value: '0',
      rejected_value: '0',
      missing_value: '60',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: 'No supplier DR presented',
      inspection_evidence_hash: 'a'.repeat(64),
      discrepancy_evidence_hash: 'b'.repeat(64),
      expected_po_version: po.version,
    });
    expect(noDr.ok).toBe(false);
    expect(noDr.code).toBe('MISSING_RECEIVING_SOURCE');

    // Wrong variant blocked
    const wrongVariant = engine.inspectAndPostSupplierRm({
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: true,
      supplier_dr_reference: 'DR-9901',
      delivered_variant_id: '999',
      delivered_value: '40',
      accepted_value: '40',
      held_value: '0',
      rejected_value: '0',
      missing_value: '0',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: 'Substituted item arrived',
      inspection_evidence_hash: 'a'.repeat(64),
      expected_po_version: po.version,
    });
    expect(wrongVariant.code).toBe('UNAUTHORIZED_SUBSTITUTION');

    // Overdelivery beyond 100 blocked
    const overdelivery = engine.inspectAndPostSupplierRm({
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: true,
      supplier_dr_reference: 'DR-9901',
      delivered_variant_id: '71',
      delivered_value: '110',
      accepted_value: '110',
      held_value: '0',
      rejected_value: '0',
      missing_value: '0',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: '10 excess delivered',
      inspection_evidence_hash: 'a'.repeat(64),
      expected_po_version: po.version,
    });
    expect(overdelivery.code).toBe('OVERDELIVERY_NOT_AUTHORIZED');

    // Missing discrepancy digest when missing > 0
    const missingDiscHash = engine.inspectAndPostSupplierRm({
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: true,
      supplier_dr_reference: 'DR-9901',
      delivered_variant_id: '71',
      delivered_value: '40',
      accepted_value: '40',
      held_value: '0',
      rejected_value: '0',
      missing_value: '60',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: '40 intact, 60 backordered',
      inspection_evidence_hash: 'a'.repeat(64),
      expected_po_version: po.version,
    });
    expect(missingDiscHash.code).toBe('DISCREPANCY_EVIDENCE_REQUIRED');
  });

  it('executes AC-07 partial RM (PO 100, accepted 40 -> 60 outstanding, 10 held, 10 rejected) and once-only held custody transfer', () => {
    const engine = createP10SupplierReceivingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const po = engine.registerOpenPoForReceiving({
      po_reference: 'CEBU-PO-2026-000001',
      supplier_name: 'Mactan Gear Supply',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      ordered_quantity_value: '100',
      quantity_scale: 0,
    }).data!;

    // Post partial delivery: 60 arrived (40 accepted usable, 10 held pending test, 10 rejected damaged) & 40 missing
    const postRes = engine.inspectAndPostSupplierRm({
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: true,
      supplier_dr_reference: 'DR-8821',
      delivered_variant_id: '71',
      delivered_value: '60',
      accepted_value: '40',
      held_value: '10',
      rejected_value: '10',
      missing_value: '40',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: '40 passed spec; 10 held for seam check; 10 rejected torn canvas; 40 missing',
      inspection_evidence_hash: 'a'.repeat(64),
      discrepancy_evidence_hash: 'b'.repeat(64),
      expected_po_version: po.version,
      idempotency_key: 'rm-post-1',
    });

    expect(postRes.ok).toBe(true);
    expect(postRes.code).toBe('SUPPLIER_RM_POSTED');
    const rm = postRes.data as SupplierRmReceipt;
    expect(rm.rm_reference).toBe('CEBU-RM-2026-000001');

    expect(engine.getSnapshot().summary).toEqual({
      usable_on_hand: '40',
      allocatable_now: '40',
      held_quarantined: '10',
      rejected_nonusable: '10',
      open_po_outstanding: '60', // only accepted 40 reduces 100
      open_claims_count: 1,
    });

    const claim = engine.getSnapshot().supplier_claims[0] as SupplierClaimRecord;
    expect(claim.held_transferred).toBe(false);

    // Accept held 10 after seam verification -> moves once into usable stock & reduces PO outstanding 60 -> 50
    const transfer1 = engine.acceptPreviouslyHeldCustody({
      actor_user_id: '402',
      claim_id: claim.claim_id,
      clearance_notes: 'Lab seam inspection passed for all 10 held tents',
      expected_claim_version: claim.version,
    });
    expect(transfer1.ok).toBe(true);
    expect(transfer1.code).toBe('HELD_CUSTODY_ACCEPTED');
    expect(engine.getSnapshot().summary).toMatchObject({
      usable_on_hand: '50',
      allocatable_now: '50',
      held_quarantined: '0',
      rejected_nonusable: '10',
      open_po_outstanding: '50',
    });

    // Second transfer attempt on same held goods blocked once-only
    const transfer2 = engine.acceptPreviouslyHeldCustody({
      actor_user_id: '402',
      claim_id: claim.claim_id,
      clearance_notes: 'Duplicate transfer attempt',
      expected_claim_version: transfer1.data!.version,
    });
    expect(transfer2.ok).toBe(false);
    expect(transfer2.code).toBe('HELD_CUSTODY_ALREADY_TRANSFERRED');

    // Resolve supplier claim -> rejected 10 remains strictly excluded from usable stock
    const resolved = engine.resolveSupplierClaim({
      actor_user_id: '402',
      claim_id: claim.claim_id,
      resolution_kind: 'credit_note',
      resolution_notes: 'Supplier issued credit note for 10 torn tents and short-shipped 40',
      expected_claim_version: transfer1.data!.version,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.code).toBe('SUPPLIER_CLAIM_RESOLVED');
    expect(engine.getSnapshot().summary.usable_on_hand).toBe('50');
    expect(engine.getSnapshot().summary.rejected_nonusable).toBe('10');
  });

  it('enforces idempotency replay, key conflict, cross-chapter redaction, and lookup recovery', () => {
    const engine = createP10SupplierReceivingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const po = engine.registerOpenPoForReceiving({
      po_reference: 'CEBU-PO-2026-000001',
      supplier_name: 'Vendor A',
      variant_id: '71',
      ordered_quantity_value: '50',
      quantity_scale: 0,
    }).data!;

    const input = {
      inspector_user_id: '401',
      po_id: po.po_id,
      has_valid_supplier_dr: true,
      supplier_dr_reference: 'DR-100',
      delivered_variant_id: '71',
      delivered_value: '20',
      accepted_value: '20',
      held_value: '0',
      rejected_value: '0',
      missing_value: '30',
      inspection_at: '2026-12-03T09:00:00.000000Z',
      condition_notes: 'Partial 20 accepted',
      inspection_evidence_hash: 'a'.repeat(64),
      discrepancy_evidence_hash: 'b'.repeat(64),
      expected_po_version: po.version,
      idempotency_key: 'p10-rm-idem-1',
    };

    const first = engine.inspectAndPostSupplierRm(input);
    const replay = engine.inspectAndPostSupplierRm(input);
    expect(replay.replayed).toBe(true);
    expect(replay.data?.rm_id).toBe(first.data?.rm_id);
    expect(engine.getSnapshot().summary.usable_on_hand).toBe('20'); // Never double-posted!

    const conflict = engine.inspectAndPostSupplierRm({ ...input, accepted_value: '19', rejected_value: '1' });
    expect(conflict.http_status).toBe(409);
    expect(conflict.code).toBe('ACTION_KEY_CONFLICT');

    const cross = engine.inspectAndPostSupplierRm({ ...input, chapter_id: '8', idempotency_key: 'x' });
    expect(cross.http_status).toBe(403);
    expect(cross.code).toBe('FORBIDDEN_REDACTED');

    const unknown = engine.lookupReceivingOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'missing-rm',
    });
    expect(unknown.code).toBe('OPERATION_UNCERTAIN');
    expect((unknown.data as P10LookupResult).input_policy).toBe('preserve');

    const opId = engine.getSnapshot().operation_ledger[0]!.operation_id;
    const recovered = engine.lookupReceivingOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opId,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.code).toBe('OPERATION_RECOVERED');
  });
});
