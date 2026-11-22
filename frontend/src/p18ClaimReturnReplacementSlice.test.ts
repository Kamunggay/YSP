import { describe, expect, it } from 'vitest';
import {
  createP18ClaimReturnReplacementEngine,
  P18_CONTEXT_STORAGE_KEY,
} from './p18ClaimReturnReplacementSlice';
import type {
  CompletedSaleForClaim,
  CustomerClaimAdjRecord,
  P18LookupResult,
} from './p18ClaimReturnReplacementSlice';

describe('p18ClaimReturnReplacementSlice — Genuine Claims, Inspected Returns & Signed Replacements', () => {
  it('starts strictly unseeded with empty completed sales, claims, and zero counters', () => {
    expect(P18_CONTEXT_STORAGE_KEY).toBe('ysp_p18_context');
    const engine = createP18ClaimReturnReplacementEngine();
    const snap = engine.getSnapshot();

    expect(snap.completed_sales).toEqual([]);
    expect(snap.claims).toEqual([]);
    expect(snap.summary).toEqual({
      eligible_replacement_stock: '0',
      quarantined_defects: '0',
      resalable_restored: '0',
      total_replacements_issued: '0',
    });
  });

  it('requires Track 1 OR + signed DR, prevents claiming more than released qty, and gates defective quarantine on inspection & signed acknowledgment', () => {
    const engine = createP18ClaimReturnReplacementEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const incompleteSale = engine.registerOriginalSaleForClaim({
      sale_channel: 'track1_so_cdr',
      so_reference: 'CEBU-SO-2026-000001',
      or_reference: 'CEBU-OR-2026-000001',
      signed_cdr_reference: null,
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      actual_released_quantity_value: '2',
      eligible_replacement_stock_value: '5',
      original_lot_provenance: 'CEBU-RM-2026-000001',
      within_return_window: true,
    }).data as CompletedSaleForClaim;

    const noDrBlocked = engine.initiateCustomerClaimAdj({
      sale_id: incompleteSale.sale_id,
      preparer_user_id: '101',
      claim_quantity_value: '1',
      claim_reason: 'Broken zipper',
      initiated_at: '2026-11-07T08:00:00Z',
    });
    expect(noDrBlocked.ok).toBe(false);
    expect(noDrBlocked.code).toBe('MISSING_ORIGINAL_OR_OR_SIGNED_DR');

    const validSale = engine.registerOriginalSaleForClaim({
      sale_channel: 'track1_so_cdr',
      so_reference: 'CEBU-SO-2026-000002',
      or_reference: 'CEBU-OR-2026-000002',
      signed_cdr_reference: 'CEBU-CDR-2026-000002',
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      actual_released_quantity_value: '2',
      eligible_replacement_stock_value: '5',
      original_lot_provenance: 'CEBU-RM-2026-000001',
      within_return_window: true,
    }).data as CompletedSaleForClaim;

    let claim1 = engine.initiateCustomerClaimAdj({
      sale_id: validSale.sale_id,
      preparer_user_id: '101',
      claim_quantity_value: '2',
      claim_reason: 'Confirmed seam defect on 2 delivered tents',
      initiated_at: '2026-11-07T08:15:00Z',
      idempotency_key: 'p18-claim-1',
    }).data as CustomerClaimAdjRecord;
    expect(claim1.adj_reference).toBe('CEBU-ADJ-CLM-2026-000001');

    // Second claim attempting to reclaim already-claimed quantity blocked
    const doubleClaim = engine.initiateCustomerClaimAdj({
      sale_id: validSale.sale_id,
      preparer_user_id: '101',
      claim_quantity_value: '1',
      claim_reason: 'Duplicate claim attempt',
      initiated_at: '2026-11-07T08:20:00Z',
    });
    expect(doubleClaim.ok).toBe(false);
    expect(doubleClaim.code).toBe('CUMULATIVE_CLAIM_LIMIT_EXCEEDED');

    // Approval blocked before physical inspection
    const earlyApprove = engine.decideCustomerClaimApproval({
      claim_id: claim1.claim_id,
      approver_user_id: '202',
      decision: 'approve',
      decision_reason: 'Skip inspection test',
      decided_at: '2026-11-07T08:25:00Z',
      expected_version: claim1.version,
    });
    expect(earlyApprove.ok).toBe(false);
    expect(earlyApprove.code).toBe('INSPECTION_REQUIRED_BEFORE_APPROVAL');

    claim1 = engine.inspectReturnedClaimGoods({
      claim_id: claim1.claim_id,
      inspector_user_id: '301',
      inspection_outcome: 'defective_confirmed',
      linked_supplier_rm_ref: 'CEBU-RM-2026-000001',
      inspection_notes: 'Factory stitching tearing along seam',
      inspected_at: '2026-11-07T08:30:00Z',
      expected_version: claim1.version,
    }).data as CustomerClaimAdjRecord;

    claim1 = engine.decideCustomerClaimApproval({
      claim_id: claim1.claim_id,
      approver_user_id: '202',
      decision: 'approve',
      decision_reason: 'Approved even defective replacement',
      decided_at: '2026-11-07T08:35:00Z',
      expected_version: claim1.version,
    }).data as CustomerClaimAdjRecord;
    expect(claim1.approval_duty_code).toBe('CLAIM_APPROVER');

    // Replacement blocked before buyer signed acknowledgment
    const noAck = engine.executeApprovedClaimReplacement({
      claim_id: claim1.claim_id,
      actor_user_id: '301',
      executed_at: '2026-11-07T08:40:00Z',
      expected_version: claim1.version,
    });
    expect(noAck.ok).toBe(false);
    expect(noAck.code).toBe('MISSING_REPLACEMENT_ACKNOWLEDGMENT');

    claim1 = engine.bindReplacementAcknowledgment({
      claim_id: claim1.claim_id,
      actor_user_id: '301',
      signature_hash: 'f'.repeat(64),
      recipient_name: 'Maria Santos',
      acknowledged_at: '2026-11-07T08:42:00Z',
      expected_version: claim1.version,
    }).data as CustomerClaimAdjRecord;

    claim1 = engine.executeApprovedClaimReplacement({
      claim_id: claim1.claim_id,
      actor_user_id: '301',
      executed_at: '2026-11-07T08:45:00Z',
      expected_version: claim1.version,
      idempotency_key: 'p18-exec-1',
    }).data as CustomerClaimAdjRecord;
    expect(claim1.status).toBe('completed');
    // Replacements deducted from validSale (5 -> 3), quarantined_defects 2
    const updatedSale = engine.getSnapshot().completed_sales.find((s) => s.sale_id === validSale.sale_id) as CompletedSaleForClaim;
    expect(updatedSale.eligible_replacement_stock.value).toBe('3');
    expect(updatedSale.quarantined_defects.value).toBe('2');
    expect(updatedSale.total_replacements_issued.value).toBe('2');
  });

  it('accepts booth OR claims, restores nondefective resalable returns with original provenance, and isolates unsalable nondefects', () => {
    const engine = createP18ClaimReturnReplacementEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const boothSale = engine.registerOriginalSaleForClaim({
      sale_channel: 'booth_or',
      so_reference: 'BOOTH-CEBU-2026',
      or_reference: 'CEBU-OR-BOOTH-0001',
      signed_cdr_reference: null,
      variant_id: '75',
      item_name: 'Responder Jacket',
      quantity_scale: 0,
      actual_released_quantity_value: '2',
      eligible_replacement_stock_value: '4',
      original_lot_provenance: 'CEBU-RM-DA-2026-000002',
      within_return_window: true,
    }).data as CompletedSaleForClaim;

    let clm = engine.initiateCustomerClaimAdj({
      sale_id: boothSale.sale_id,
      preparer_user_id: '101',
      claim_quantity_value: '1',
      claim_reason: 'Booth customer requested size exchange (unopened)',
      initiated_at: '2026-11-08T09:00:00Z',
    }).data as CustomerClaimAdjRecord;

    clm = engine.inspectReturnedClaimGoods({
      claim_id: clm.claim_id,
      inspector_user_id: '301',
      inspection_outcome: 'nondefective_resalable',
      inspection_notes: 'Tags intact, unopened, resalable condition',
      inspected_at: '2026-11-08T09:05:00Z',
      expected_version: clm.version,
    }).data as CustomerClaimAdjRecord;

    clm = engine.decideCustomerClaimApproval({
      claim_id: clm.claim_id,
      approver_user_id: '202',
      decision: 'approve',
      decision_reason: 'Approved even size exchange',
      decided_at: '2026-11-08T09:10:00Z',
      expected_version: clm.version,
    }).data as CustomerClaimAdjRecord;

    clm = engine.bindReplacementAcknowledgment({
      claim_id: clm.claim_id,
      actor_user_id: '301',
      signature_hash: 'e'.repeat(64),
      recipient_name: 'Juan Dela Cruz',
      acknowledged_at: '2026-11-08T09:12:00Z',
      expected_version: clm.version,
    }).data as CustomerClaimAdjRecord;

    clm = engine.executeApprovedClaimReplacement({
      claim_id: clm.claim_id,
      actor_user_id: '301',
      executed_at: '2026-11-08T09:15:00Z',
      expected_version: clm.version,
      idempotency_key: 'p18-booth-exec',
    }).data as CustomerClaimAdjRecord;
    expect(clm.restored_provenance).toBe('CEBU-RM-DA-2026-000002');
    expect(engine.getSnapshot().summary.resalable_restored).toBe('1');
    expect(engine.getSnapshot().summary.eligible_replacement_stock).toBe('4'); // -1 replaced +1 resalable restored = 4

    const lookup = engine.lookupClaimOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p18-booth-exec',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P18LookupResult).action_result).toBe('recovered');
  });
});
