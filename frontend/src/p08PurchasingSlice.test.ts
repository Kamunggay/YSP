import { describe, expect, it } from 'vitest';
import {
  createP08PurchasingEngine,
  P08_CONTEXT_STORAGE_KEY,
} from './p08PurchasingSlice';
import type { P08LookupResult, RepfRecord, VariantSupplyProfile } from './p08PurchasingSlice';

describe('p08PurchasingSlice — Uncovered RF/ROP Need & Budget Review', () => {
  it('starts strictly unseeded with empty supply profiles, purchase requests, and zero balances', () => {
    expect(P08_CONTEXT_STORAGE_KEY).toBe('ysp_p08_context');
    const engine = createP08PurchasingEngine();
    const snap = engine.getSnapshot();

    expect(snap.profiles).toEqual([]);
    expect(snap.repfs).toEqual([]);
    expect(snap.history).toEqual([]);
    expect(snap.summary).toEqual({
      total_gross_uncovered: '0',
      active_repf_claimed: '0',
      remaining_uncovered: '0',
      low_stock_alerts: 0,
      approved_repfs: 0,
    });
  });

  it('computes ROP low-stock alert (<= threshold) and deduplicated net need matching PRD 6.1', () => {
    const engine = createP08PurchasingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    // PRD 6.1 case: Target 40, usable 10, confirmed inbound 20 -> uncovered net need 10
    const res = engine.configureVariantSupplyProfile({
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_scale: 0,
      usable_on_hand_value: '10',
      active_rf_reserved_value: '0',
      approved_rf_demand_value: '0',
      existing_po_inbound_value: '20',
      rop_threshold_value: '10', // <= triggers alert
      target_stock_level_value: '40',
    });

    expect(res.ok).toBe(true);
    const profile = res.data as VariantSupplyProfile;
    expect(profile.uncovered_net_need).toBe('10');
    expect(profile.low_stock_alert).toBe(true);
    expect(engine.getSnapshot().summary.low_stock_alerts).toBe(1);
  });

  it('blocks unpaid SO shortage relabeling, missing emergency reasons, and duplicate supply coverage', () => {
    const engine = createP08PurchasingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.configureVariantSupplyProfile({
      variant_id: '71',
      quantity_scale: 0,
      usable_on_hand_value: '4',
      active_rf_reserved_value: '4',
      approved_rf_demand_value: '10',
      existing_po_inbound_value: '0',
      rop_threshold_value: '5',
      target_stock_level_value: '5', // gross uncovered = 15 - 4 = 11
    });

    // Block unpaid SO shortage relabeling
    const unpaidSo = engine.createRepfDraft({
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'unpaid_so',
      requested_quantity_value: '5',
      quantity_scale: 0,
      estimated_amount: '125.00',
      priority: 'normal',
      is_emergency: false,
      justification: 'Attempted relabel',
    });
    expect(unpaidSo.ok).toBe(false);
    expect(unpaidSo.http_status).toBe(409);
    expect(unpaidSo.code).toBe('UNPAID_SO_RELABEL_FORBIDDEN');

    // Missing emergency reason fails
    const missingEmergencyReason = engine.createRepfDraft({
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'rf_shortage',
      requested_quantity_value: '11',
      quantity_scale: 0,
      estimated_amount: '275.00',
      priority: 'urgent',
      is_emergency: true,
      justification: 'Urgent need',
    });
    expect(missingEmergencyReason.ok).toBe(false);
    expect(missingEmergencyReason.code).toBe('EMERGENCY_REASON_REQUIRED');

    // Claim all 11 uncovered units in first RepF
    const firstRepf = engine.createRepfDraft({
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'rf_shortage',
      linked_rf_reference: 'CEBU-RF-2026-000001',
      requested_quantity_value: '11',
      quantity_scale: 0,
      estimated_amount: '275.00',
      priority: 'normal',
      is_emergency: false,
      justification: 'Uncovered RF + ROP restock',
    });
    expect(firstRepf.ok).toBe(true);
    expect(engine.getSnapshot().summary.remaining_uncovered).toBe('0');

    // Second competing RepF claiming 1 unit fails with 409 DUPLICATE_SUPPLY_COVERAGE
    const duplicate = engine.createRepfDraft({
      requester_user_id: '102',
      variant_id: '71',
      source_kind: 'rop_replenishment',
      requested_quantity_value: '1',
      quantity_scale: 0,
      estimated_amount: '25.00',
      priority: 'normal',
      is_emergency: false,
      justification: 'Competing request',
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.http_status).toBe(409);
    expect(duplicate.code).toBe('DUPLICATE_SUPPLY_COVERAGE');
  });

  it('enforces reviewer independence, budget denial releasing claim without PO, and return/revise/approve workflow', () => {
    const engine = createP08PurchasingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.configureVariantSupplyProfile({
      variant_id: '71',
      quantity_scale: 0,
      usable_on_hand_value: '0',
      active_rf_reserved_value: '0',
      approved_rf_demand_value: '10',
      existing_po_inbound_value: '0',
      rop_threshold_value: '5',
      target_stock_level_value: '10', // uncovered = 20
    });

    // RepF 1: submitted -> budget denied -> releases claimed 10, 0 POs
    const d1 = engine.createRepfDraft({
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'rf_shortage',
      requested_quantity_value: '10',
      quantity_scale: 0,
      estimated_amount: '1000.00',
      priority: 'normal',
      is_emergency: false,
      justification: 'First draft',
    }).data!;
    const s1 = engine.submitRepfForBudget({
      repf_id: d1.repf_id,
      actor_user_id: '101',
      expected_version: d1.version,
      expected_material_version: d1.material_version,
    }).data!;
    expect(s1.reference).toBe('CEBU-REPF-2026-000001');

    // Self-approval blocked
    const selfDecide = engine.decideRepfBudget({
      repf_id: s1.repf_id,
      reviewer_user_id: '101',
      decision: 'approve',
      expected_version: s1.version,
      expected_material_version: s1.material_version,
    });
    expect(selfDecide.ok).toBe(false);
    expect(selfDecide.code).toBe('INDEPENDENCE_REQUIRED');

    const denied = engine.decideRepfBudget({
      repf_id: s1.repf_id,
      reviewer_user_id: '202',
      decision: 'reject_cancel',
      reason: 'Exceeds Q4 committee allocation',
      expected_version: s1.version,
      expected_material_version: s1.material_version,
    });
    expect(denied.ok).toBe(true);
    expect(denied.code).toBe('REPF_BUDGET_DENIED');
    expect((denied.data as RepfRecord).po_count_created).toBe(0);
    expect(engine.getSnapshot().summary.remaining_uncovered).toBe('20');

    // RepF 2: submit -> return -> revise -> resubmit -> budget approved
    const d2 = engine.createRepfDraft({
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'rf_shortage',
      requested_quantity_value: '15',
      quantity_scale: 0,
      estimated_amount: '1500.00',
      priority: 'normal',
      is_emergency: false,
      justification: 'Adjusted need',
    }).data!;
    const s2 = engine.submitRepfForBudget({
      repf_id: d2.repf_id,
      actor_user_id: '101',
      expected_version: d2.version,
      expected_material_version: d2.material_version,
    }).data!;
    expect(s2.reference).toBe('CEBU-REPF-2026-000002');

    const ret = engine.decideRepfBudget({
      repf_id: s2.repf_id,
      reviewer_user_id: '202',
      decision: 'return',
      reason: 'Lower estimate to 1200.00',
      expected_version: s2.version,
      expected_material_version: s2.material_version,
    }).data!;
    expect(ret.status).toBe('returned');

    const rev = engine.reviseRepf({
      repf_id: ret.repf_id,
      actor_user_id: '101',
      requested_quantity_value: '12',
      estimated_amount: '1200.00',
      justification: 'Trimmed request for chapter budget',
      reason: 'Applied budget cap',
      expected_version: ret.version,
      expected_material_version: ret.material_version,
    }).data!;
    expect(rev.material_version).toBe(2);

    const resub = engine.submitRepfForBudget({
      repf_id: rev.repf_id,
      actor_user_id: '101',
      expected_version: rev.version,
      expected_material_version: rev.material_version,
    }).data!;
    expect(resub.reference).toBe('CEBU-REPF-2026-000002');

    const approved = engine.decideRepfBudget({
      repf_id: resub.repf_id,
      reviewer_user_id: '202',
      decision: 'approve',
      approved_budget_amount: '1200.00',
      expected_version: resub.version,
      expected_material_version: resub.material_version,
    });
    expect(approved.ok).toBe(true);
    expect(approved.code).toBe('REPF_BUDGET_APPROVED');
    expect(engine.getSnapshot().summary.approved_repfs).toBe(1);
  });

  it('enforces idempotency replay, key conflict, cross-chapter redaction, and operation lookup', () => {
    const engine = createP08PurchasingEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.configureVariantSupplyProfile({
      variant_id: '71',
      quantity_scale: 0,
      usable_on_hand_value: '0',
      active_rf_reserved_value: '0',
      approved_rf_demand_value: '10',
      existing_po_inbound_value: '0',
      rop_threshold_value: '0',
      target_stock_level_value: '0',
    });

    const input = {
      requester_user_id: '101',
      variant_id: '71',
      source_kind: 'rf_shortage' as const,
      requested_quantity_value: '5',
      quantity_scale: 0,
      estimated_amount: '500.00',
      priority: 'normal' as const,
      is_emergency: false,
      justification: 'Order 5',
      idempotency_key: 'p08-create-idem-1',
    };

    const first = engine.createRepfDraft(input);
    expect(first.ok).toBe(true);
    const replay = engine.createRepfDraft(input);
    expect(replay.replayed).toBe(true);
    expect(engine.getSnapshot().repfs).toHaveLength(1);

    const conflict = engine.createRepfDraft({ ...input, estimated_amount: '600.00' });
    expect(conflict.http_status).toBe(409);
    expect(conflict.code).toBe('ACTION_KEY_CONFLICT');

    const cross = engine.createRepfDraft({ ...input, chapter_id: '9', idempotency_key: 'cross' });
    expect(cross.http_status).toBe(403);
    expect(cross.code).toBe('FORBIDDEN_REDACTED');

    const unseen = engine.lookupPurchasingOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'unknown-p08-key',
    });
    expect(unseen.code).toBe('OPERATION_UNCERTAIN');
    expect((unseen.data as P08LookupResult).input_policy).toBe('preserve');

    const opId = engine.getSnapshot().operation_ledger[0]!.operation_id;
    const byUlid = engine.lookupPurchasingOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opId,
    });
    expect(byUlid.ok).toBe(true);
    expect(byUlid.code).toBe('OPERATION_RECOVERED');
  });
});
