import { describe, expect, it } from 'vitest';
import {
  createP09QuotationPoEngine,
  P09_CONTEXT_STORAGE_KEY,
} from './p09QuotationPoSlice';
import type { P09LookupResult, PurchaseOrderRecord, SupplierQuotation } from './p09QuotationPoSlice';

describe('p09QuotationPoSlice — Quotations, Approved PO & Commitment Changes', () => {
  it('starts strictly unseeded with empty sources, quotations, purchase orders, and zero inbound/on-hand metrics', () => {
    expect(P09_CONTEXT_STORAGE_KEY).toBe('ysp_p09_context');
    const engine = createP09QuotationPoEngine();
    const snap = engine.getSnapshot();

    expect(snap.repf_sources).toEqual([]);
    expect(snap.quotations).toEqual([]);
    expect(snap.purchase_orders).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand: '0',
      confirmed_inbound_quantity: '0',
      uncovered_net_need: '0',
      issued_po_count: 0,
    });
  });

  it('enforces quote spec matching, minimum comparable quote count, budget ceiling, and selection rationale', () => {
    const engine = createP09QuotationPoEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const src = engine.registerApprovedRepfSource({
      repf_reference: 'CEBU-REPF-2026-000001',
      preparer_user_id: '101',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      approved_need_quantity_value: '10',
      quantity_scale: 0,
      budget_ceiling_amount: '2500.00',
      min_required_quotes: 2,
      is_emergency: false,
    }).data!;

    // Mismatched specification rejected
    const badSpec = engine.recordSupplierQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      supplier_name: 'Off-Spec Hardware',
      unit_price: '200.00',
      total_cost: '2000.00',
      lead_time_days: 3,
      warranty_terms: '6 months',
      payment_terms: 'COD',
      spec_matches_repf: false,
    });
    expect(badSpec.ok).toBe(false);
    expect(badSpec.code).toBe('INCOMPATIBLE_QUOTATION_SPEC');

    const q1 = engine.recordSupplierQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      supplier_name: 'Mactan Gear Supply',
      unit_price: '240.00',
      total_cost: '2400.00',
      lead_time_days: 5,
      warranty_terms: '1 year replacement',
      payment_terms: 'Net 15',
      spec_matches_repf: true,
    }).data as SupplierQuotation;

    // Selecting with only 1 quote fails threshold policy (requires 2)
    const unmetThreshold = engine.selectWinningQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      quotation_id: q1.quotation_id,
      selection_rationale: 'Lowest price available',
    });
    expect(unmetThreshold.ok).toBe(false);
    expect(unmetThreshold.http_status).toBe(409);
    expect(unmetThreshold.code).toBe('QUOTATION_THRESHOLD_UNMET');

    const q2OverBudget = engine.recordSupplierQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      supplier_name: 'Cebu Premium Trading',
      unit_price: '280.00',
      total_cost: '2800.00',
      lead_time_days: 2,
      warranty_terms: '2 years',
      payment_terms: 'Net 30',
      spec_matches_repf: true,
    }).data as SupplierQuotation;

    // Selecting quote over approved budget ceiling fails
    const overCeiling = engine.selectWinningQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      quotation_id: q2OverBudget.quotation_id,
      selection_rationale: 'Faster lead time',
    });
    expect(overCeiling.ok).toBe(false);
    expect(overCeiling.code).toBe('BUDGET_CEILING_EXCEEDED');

    // Blank rationale fails
    const blankRationale = engine.selectWinningQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      quotation_id: q1.quotation_id,
      selection_rationale: '  ',
    });
    expect(blankRationale.code).toBe('RATIONALE_REQUIRED');

    const selected = engine.selectWinningQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      quotation_id: q1.quotation_id,
      selection_rationale: 'Within budget ceiling with best warranty coverage.',
    });
    expect(selected.ok).toBe(true);
    expect(selected.code).toBe('WINNING_QUOTATION_SELECTED');
  });

  it('issues PO updating confirmed inbound (never on-hand), enforces authority/independence, and handles amendment/cancellation', () => {
    const engine = createP09QuotationPoEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const src = engine.registerApprovedRepfSource({
      repf_reference: 'CEBU-REPF-2026-000001',
      preparer_user_id: '101',
      variant_id: '71',
      approved_need_quantity_value: '10',
      quantity_scale: 0,
      budget_ceiling_amount: '2500.00',
      min_required_quotes: 1,
      is_emergency: true,
    }).data!;

    const q = engine.recordSupplierQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      supplier_name: 'Visayas Emergency Depot',
      unit_price: '245.00',
      total_cost: '2450.00',
      lead_time_days: 1,
      warranty_terms: '1 year',
      payment_terms: 'Cash on Delivery',
      spec_matches_repf: true,
    }).data!;
    engine.selectWinningQuotation({
      actor_user_id: '301',
      repf_source_id: src.source_id,
      quotation_id: q.quotation_id,
      selection_rationale: 'Emergency sole immediate supplier within ceiling',
    });

    // Missing purchase authority blocked
    const noAuth = engine.issueApprovedPo({
      repf_source_id: src.source_id,
      approver_user_id: '202',
      has_purchase_authority: false,
      delivery_location: 'Main Stockroom',
      expected_delivery_at: '2026-12-03T10:00:00.000000Z',
    });
    expect(noAuth.http_status).toBe(403);
    expect(noAuth.code).toBe('PURCHASE_AUTHORITY_REQUIRED');

    // Preparer self-issue blocked
    const selfIssue = engine.issueApprovedPo({
      repf_source_id: src.source_id,
      approver_user_id: '101',
      has_purchase_authority: true,
      delivery_location: 'Main Stockroom',
      expected_delivery_at: '2026-12-03T10:00:00.000000Z',
    });
    expect(selfIssue.http_status).toBe(403);
    expect(selfIssue.code).toBe('INDEPENDENCE_REQUIRED');

    // Valid independent issue -> CEBU-PO-2026-000001; inbound becomes 10, on-hand remains 0
    const issuedRes = engine.issueApprovedPo({
      repf_source_id: src.source_id,
      approver_user_id: '202',
      has_purchase_authority: true,
      delivery_location: 'Main Stockroom',
      expected_delivery_at: '2026-12-03T10:00:00.000000Z',
      idempotency_key: 'po-issue-1',
    });
    expect(issuedRes.ok).toBe(true);
    expect(issuedRes.code).toBe('PO_ISSUED');
    const po = issuedRes.data as PurchaseOrderRecord;
    expect(po.reference).toBe('CEBU-PO-2026-000001');
    expect(engine.getSnapshot().summary).toEqual({
      usable_on_hand: '0',
      confirmed_inbound_quantity: '10',
      uncovered_net_need: '0',
      issued_po_count: 1,
    });

    // Supplier acknowledgment
    const ack = engine.acknowledgeSupplierPo({
      actor_user_id: '301',
      po_id: po.po_id,
      acknowledged_at: '2026-11-23T08:00:00.000000Z',
      expected_version: po.version,
    });
    expect(ack.ok).toBe(true);
    expect(ack.code).toBe('PO_ACKNOWLEDGED');

    // Amend PO -> bumps version & material_version
    const amended = engine.amendOrCancelPo({
      actor_user_id: '202',
      po_id: po.po_id,
      action_type: 'amend',
      new_quantity_value: '8',
      reason: 'Supplier stock capped at 8 units immediately',
      expected_version: ack.data!.version,
    });
    expect(amended.ok).toBe(true);
    expect(amended.code).toBe('PO_AMENDED');
    expect(amended.data?.material_version).toBe(2);
    expect(engine.getSnapshot().summary.confirmed_inbound_quantity).toBe('8');
    expect(engine.getSnapshot().summary.uncovered_net_need).toBe('2');

    // Cancel PO -> restores full 10 uncovered need
    const canceled = engine.amendOrCancelPo({
      actor_user_id: '202',
      po_id: po.po_id,
      action_type: 'cancel',
      reason: 'Supplier defaulted on schedule',
      expected_version: amended.data!.version,
    });
    expect(canceled.ok).toBe(true);
    expect(canceled.code).toBe('PO_CANCELED');
    expect(engine.getSnapshot().summary.confirmed_inbound_quantity).toBe('0');
    expect(engine.getSnapshot().summary.uncovered_net_need).toBe('10');
  });

  it('supports idempotency replay, key conflict, cross-chapter redaction, and operation lookup', () => {
    const engine = createP09QuotationPoEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const src = engine.registerApprovedRepfSource({
      repf_reference: 'CEBU-REPF-2026-000001',
      preparer_user_id: '101',
      variant_id: '71',
      approved_need_quantity_value: '5',
      quantity_scale: 0,
      budget_ceiling_amount: '1000.00',
      min_required_quotes: 1,
      is_emergency: true,
    }).data!;

    const qInput = {
      actor_user_id: '301',
      repf_source_id: src.source_id,
      supplier_name: 'Vendor A',
      unit_price: '150.00',
      total_cost: '750.00',
      lead_time_days: 2,
      warranty_terms: '6 months',
      payment_terms: 'COD',
      spec_matches_repf: true,
      idempotency_key: 'p09-q-idem-1',
    };
    const first = engine.recordSupplierQuotation(qInput);
    const replay = engine.recordSupplierQuotation(qInput);
    expect(replay.replayed).toBe(true);
    expect(replay.data?.quotation_id).toBe(first.data?.quotation_id);

    const conflict = engine.recordSupplierQuotation({ ...qInput, total_cost: '800.00' });
    expect(conflict.http_status).toBe(409);
    expect(conflict.code).toBe('ACTION_KEY_CONFLICT');

    const cross = engine.recordSupplierQuotation({ ...qInput, chapter_id: '9', idempotency_key: 'x' });
    expect(cross.http_status).toBe(403);
    expect(cross.code).toBe('FORBIDDEN_REDACTED');

    const unknown = engine.lookupPoOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'missing',
    });
    expect(unknown.code).toBe('OPERATION_UNCERTAIN');
    expect((unknown.data as P09LookupResult).input_policy).toBe('preserve');

    const opId = engine.getSnapshot().operation_ledger[0]!.operation_id;
    const recovered = engine.lookupPoOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opId,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.code).toBe('OPERATION_RECOVERED');
  });
});
