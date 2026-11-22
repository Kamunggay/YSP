import { describe, expect, it } from 'vitest';
import {
  createP16DonationRestrictionEngine,
  P16_CONTEXT_STORAGE_KEY,
} from './p16DonationRestrictionSlice';
import type {
  DonationAcknowledgment,
  DonationAllocationRecord,
  P16LookupResult,
  ProvenanceStockLot,
} from './p16DonationRestrictionSlice';

describe('p16DonationRestrictionSlice — DA Receiving & Bounded Donor Restrictions', () => {
  it('starts strictly unseeded with empty donations, stock lots, allocations, and zero counters', () => {
    expect(P16_CONTEXT_STORAGE_KEY).toBe('ysp_p16_context');
    const engine = createP16DonationRestrictionEngine();
    const snap = engine.getSnapshot();

    expect(snap.donation_records).toEqual([]);
    expect(snap.stock_lots).toEqual([]);
    expect(snap.allocations).toEqual([]);
    expect(snap.summary).toEqual({
      total_usable_on_hand: '0',
      unrestricted_saleable: '0',
      restricted_internal_only: '0',
      uninterpreted_blocked: '0',
      cash_or_created_count: 0,
    });
  });

  it('distinguishes same-SKU restricted donations vs commercial lots, creates zero ORs, and blocks ordinary overrides', () => {
    const engine = createP16DonationRestrictionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const daRes = engine.acknowledgeDonationSource({
      donor_name: 'Cebu Relief Foundation',
      acknowledging_officer_id: '101',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_scale: 0,
      declared_quantity_value: '10',
      estimated_unit_value: '250.00',
      valuation_basis: 'Sponsor declared invoice value',
      restriction_mode: 'distribution_only',
      raw_donor_condition: 'Relief distribution only; not for resale',
      acknowledged_at: '2026-11-05T08:00:00Z',
      idempotency_key: 'p16-da-1',
    });
    expect(daRes.ok).toBe(true);
    const da = daRes.data as DonationAcknowledgment;
    expect(da.da_reference).toBe('CEBU-DA-2026-000001');
    expect(da.creates_cash_receipt).toBe(false);
    expect(da.or_reference).toBeNull();
    expect(engine.getSnapshot().summary.cash_or_created_count).toBe(0);

    const daLot = engine.postDonatedRmReceipt({
      da_id: da.da_id,
      inspector_user_id: '301',
      accepted_quantity_value: '8',
      rejected_quantity_value: '2',
      inspected_at: '2026-11-05T08:30:00Z',
    }).data as ProvenanceStockLot;
    expect(daLot.rm_reference).toBe('CEBU-RM-DA-2026-000001');
    expect(daLot.quarantined_rejected_quantity.value).toBe('2');

    // Same SKU commercial PO lot coexists with saleable eligibility
    const poLot = engine.registerUnrestrictedCommercialLot({
      po_reference: 'CEBU-PO-2026-000001',
      rm_reference: 'CEBU-RM-2026-000001',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_scale: 0,
      accepted_quantity_value: '5',
    }).data as ProvenanceStockLot;

    expect(engine.getSnapshot().summary.unrestricted_saleable).toBe('5');
    expect(engine.getSnapshot().summary.restricted_internal_only).toBe('8');

    // Sale allocation against distribution_only DA lot blocked (even with override flag)
    const saleBlocked = engine.allocateLotToDemand({
      lot_id: daLot.lot_id,
      demand_kind: 'track1_sale',
      demand_reference: 'CEBU-SO-2026-000010',
      quantity_value: '3',
      actor_user_id: '301',
      allocated_at: '2026-11-05T09:00:00Z',
    });
    expect(saleBlocked.ok).toBe(false);
    expect(saleBlocked.code).toBe('DISTRIBUTION_ONLY_SALE_FORBIDDEN');

    const overrideBlocked = engine.allocateLotToDemand({
      lot_id: daLot.lot_id,
      demand_kind: 'track1_sale',
      demand_reference: 'CEBU-SO-2026-000010',
      quantity_value: '3',
      actor_user_id: '301',
      attempt_ordinary_override: true,
      allocated_at: '2026-11-05T09:02:00Z',
    });
    expect(overrideBlocked.ok).toBe(false);
    expect(overrideBlocked.code).toBe('ORDINARY_OVERRIDE_FORBIDDEN');

    // Permitted internal RF succeeds on DA lot, while sale succeeds on commercial PO lot
    const rfOk = engine.allocateLotToDemand({
      lot_id: daLot.lot_id,
      demand_kind: 'internal_rf',
      demand_reference: 'CEBU-RF-2026-000003',
      quantity_value: '4',
      actor_user_id: '301',
      allocated_at: '2026-11-05T09:05:00Z',
      idempotency_key: 'p16-alloc-rf',
    });
    expect(rfOk.ok).toBe(true);

    const poSaleOk = engine.allocateLotToDemand({
      lot_id: poLot.lot_id,
      demand_kind: 'track1_sale',
      demand_reference: 'CEBU-SO-2026-000010',
      quantity_value: '3',
      actor_user_id: '301',
      allocated_at: '2026-11-05T09:10:00Z',
    });
    expect(poSaleOk.ok).toBe(true);
    expect((poSaleOk.data as DonationAllocationRecord).quantity.value).toBe('3');
  });

  it('blocks uninterpreted donor conditions until independent authorized resolution, and prevents conflicting restriction edits', () => {
    const engine = createP16DonationRestrictionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const da = engine.acknowledgeDonationSource({
      donor_name: 'Sponsor B',
      acknowledging_officer_id: '101',
      variant_id: '75',
      item_name: 'Responder Vest',
      quantity_scale: 0,
      declared_quantity_value: '6',
      estimated_unit_value: '400.00',
      valuation_basis: 'Standard catalog valuation',
      restriction_mode: 'uninterpreted_condition',
      raw_donor_condition: 'Reserve for Ty-Yolanda Medical Unit only',
      acknowledged_at: '2026-11-05T08:00:00Z',
    }).data as DonationAcknowledgment;

    let lot = engine.postDonatedRmReceipt({
      da_id: da.da_id,
      inspector_user_id: '301',
      accepted_quantity_value: '6',
      rejected_quantity_value: '0',
      inspected_at: '2026-11-05T08:20:00Z',
    }).data as ProvenanceStockLot;

    expect(engine.getSnapshot().summary.uninterpreted_blocked).toBe('6');

    const blockedAll = engine.allocateLotToDemand({
      lot_id: lot.lot_id,
      demand_kind: 'internal_rf',
      demand_reference: 'CEBU-RF-2026-000004',
      quantity_value: '2',
      actor_user_id: '301',
      allocated_at: '2026-11-05T08:30:00Z',
    });
    expect(blockedAll.ok).toBe(false);
    expect(blockedAll.code).toBe('UNINTERPRETED_DONOR_CONDITION_BLOCKED');

    // Same officer cannot self-authorize restriction resolution -> independent officer 202 succeeds
    const selfRes = engine.resolveDonorRestrictionVersion({
      lot_id: lot.lot_id,
      approver_user_id: '101',
      next_mode: 'scoped_predicate',
      permitted_event_code: 'TY-MED-2026',
      permitted_unit_id: 'UNIT-MED',
      evidence_hash: 'd'.repeat(64),
      resolution_notes: 'Mapped sponsor letter to scoped predicate',
      resolved_at: '2026-11-05T08:40:00Z',
      expected_version: lot.version,
    });
    expect(selfRes.ok).toBe(false);
    expect(selfRes.code).toBe('INDEPENDENCE_REQUIRED');

    lot = engine.resolveDonorRestrictionVersion({
      lot_id: lot.lot_id,
      approver_user_id: '202',
      next_mode: 'scoped_predicate',
      permitted_event_code: 'TY-MED-2026',
      permitted_unit_id: 'UNIT-MED',
      evidence_hash: 'd'.repeat(64),
      resolution_notes: 'Mapped sponsor letter to scoped predicate',
      resolved_at: '2026-11-05T08:45:00Z',
      expected_version: lot.version,
      idempotency_key: 'p16-resolve-1',
    }).data as ProvenanceStockLot;
    expect(lot.restriction_version).toBe(2);

    // Wrong event predicate rejected; matching predicate succeeds
    const mismatch = engine.allocateLotToDemand({
      lot_id: lot.lot_id,
      demand_kind: 'internal_rf',
      demand_reference: 'CEBU-RF-2026-000005',
      event_code: 'OTHER-EVENT',
      unit_id: 'UNIT-MED',
      quantity_value: '2',
      actor_user_id: '301',
      allocated_at: '2026-11-05T09:00:00Z',
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.code).toBe('DONOR_PREDICATE_MISMATCH');

    const matchOk = engine.allocateLotToDemand({
      lot_id: lot.lot_id,
      demand_kind: 'internal_rf',
      demand_reference: 'CEBU-RF-2026-000005',
      event_code: 'TY-MED-2026',
      unit_id: 'UNIT-MED',
      quantity_value: '2',
      actor_user_id: '301',
      allocated_at: '2026-11-05T09:05:00Z',
    });
    expect(matchOk.ok).toBe(true);

    // Updating restriction into an incompatible state with active allocation blocked
    const latestLot = engine.getSnapshot().stock_lots[0] as ProvenanceStockLot;
    const conflictRes = engine.resolveDonorRestrictionVersion({
      lot_id: latestLot.lot_id,
      approver_user_id: '202',
      next_mode: 'uninterpreted_condition',
      evidence_hash: 'e'.repeat(64),
      resolution_notes: 'Revoke interpretation while allocated',
      resolved_at: '2026-11-05T09:15:00Z',
      expected_version: latestLot.version,
    });
    expect(conflictRes.ok).toBe(false);
    expect(conflictRes.code).toBe('ACTIVE_RESERVATION_RESTRICTION_CONFLICT');

    const lookup = engine.lookupDonationOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p16-resolve-1',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P16LookupResult).action_result).toBe('recovered');
  });
});
