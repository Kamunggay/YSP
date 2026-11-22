import { describe, expect, it } from 'vitest';
import {
  createP12SalesOrderEngine,
  P12_CONTEXT_STORAGE_KEY,
} from './p12SalesOrderSlice';
import type {
  FullOrderSalesInvoice,
  P12LookupResult,
  SalesOrderRecord,
} from './p12SalesOrderSlice';

describe('p12SalesOrderSlice — SO Review, Buyer Acceptance & Full-Order SI', () => {
  it('starts strictly unseeded with empty stock pools, sales orders, invoices, and zero counters', () => {
    expect(P12_CONTEXT_STORAGE_KEY).toBe('ysp_p12_context');
    const engine = createP12SalesOrderEngine();
    const snap = engine.getSnapshot();

    expect(snap.stock_pools).toEqual([]);
    expect(snap.sales_orders).toEqual([]);
    expect(snap.invoices).toEqual([]);
    expect(snap.history).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand: '0',
      so_reserved: '0',
      available_to_allocate: '0',
      active_backorders: '0',
      issued_invoices: 0,
    });
  });

  it('enforces reviewer independence, discount approval limits, and return-revise-approve loop', () => {
    const engine = createP12SalesOrderEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    engine.configureSaleStockPool({
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_scale: 0,
      usable_on_hand_value: '10',
      existing_rf_reserved_value: '0',
      unit_price: '250.00',
      max_discount_amount: '50.00',
    });

    const draftRes = engine.createSalesOrderDraft({
      sales_officer_id: '101',
      buyer_name: 'Juan Dela Cruz',
      buyer_contact: '09171234567',
      variant_id: '71',
      ordered_quantity_value: '6',
      quantity_scale: 0,
      unit_price: '250.00',
      discount_amount: '100.00',
      payment_terms: '50% downpayment upon backorder acceptance',
      requested_at: '2026-11-01T08:00:00.000000Z',
      fulfillment_arrangement: 'pickup',
      idempotency_key: 'p12-draft-1',
    });
    expect(draftRes.ok).toBe(true);
    let so = draftRes.data as SalesOrderRecord;
    expect(so.buyer_has_login).toBe(false);
    expect(so.net_amount_due).toBe('1400.00');

    // Submit for review -> assigns once-only CEBU-SO-2026-000001
    const subRes = engine.submitSalesOrder({
      so_id: so.so_id,
      actor_user_id: '101',
      expected_version: so.version,
      idempotency_key: 'p12-submit-1',
    });
    expect(subRes.ok).toBe(true);
    so = subRes.data as SalesOrderRecord;
    expect(so.reference).toBe('CEBU-SO-2026-000001');

    // Self-approval blocked
    const selfApprove = engine.approveSalesOrder({
      so_id: so.so_id,
      reviewer_user_id: '101',
      expected_version: so.version,
      expected_material_version: so.material_version,
    });
    expect(selfApprove.ok).toBe(false);
    expect(selfApprove.code).toBe('INDEPENDENCE_REQUIRED');

    // Excessive unapproved discount blocked
    const discBlocked = engine.approveSalesOrder({
      so_id: so.so_id,
      reviewer_user_id: '202',
      expected_version: so.version,
      expected_material_version: so.material_version,
    });
    expect(discBlocked.ok).toBe(false);
    expect(discBlocked.code).toBe('UNAPPROVED_DISCOUNT_EXCEEDS_LIMIT');

    // Return -> Revise -> Resubmit -> Approve
    const retRes = engine.returnSalesOrder({
      so_id: so.so_id,
      reviewer_user_id: '202',
      reason: 'Reduce discount to approved PHP 50.00 cap',
      expected_version: so.version,
    });
    expect(retRes.ok).toBe(true);
    so = retRes.data as SalesOrderRecord;

    const revRes = engine.reviseSalesOrder({
      so_id: so.so_id,
      actor_user_id: '101',
      ordered_quantity_value: '6',
      unit_price: '250.00',
      discount_amount: '50.00',
      payment_terms: '50% downpayment upon backorder acceptance',
      reason: 'Aligned discount with chapter pricing cap',
      expected_version: so.version,
      expected_material_version: so.material_version,
    });
    expect(revRes.ok).toBe(true);
    so = revRes.data as SalesOrderRecord;
    expect(so.material_version).toBe(2);
    expect(so.net_amount_due).toBe('1450.00');

    const resub = engine.submitSalesOrder({
      so_id: so.so_id,
      actor_user_id: '101',
      expected_version: so.version,
    });
    so = resub.data as SalesOrderRecord;

    const app = engine.approveSalesOrder({
      so_id: so.so_id,
      reviewer_user_id: '202',
      approved_at: '2026-11-01T08:15:00.000000Z',
      expected_version: so.version,
      expected_material_version: so.material_version,
      idempotency_key: 'p12-approve-1',
    });
    expect(app.ok).toBe(true);
    expect((app.data as SalesOrderRecord).status).toBe('approved');
  });

  it('commits stock split preserving on-hand, tracks two clocks, and issues billing-only full-order SI', () => {
    const engine = createP12SalesOrderEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.configureSaleStockPool({
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      usable_on_hand_value: '10',
      existing_rf_reserved_value: '6', // leaves 4 available
      unit_price: '500.00',
      max_discount_amount: '0.00',
    });

    const draft = engine.createSalesOrderDraft({
      sales_officer_id: '101',
      buyer_name: 'Maria Santos',
      buyer_contact: '09189998888',
      variant_id: '71',
      ordered_quantity_value: '7', // 4 available + 3 backordered
      quantity_scale: 0,
      unit_price: '500.00',
      discount_amount: '0.00',
      payment_terms: 'Full payment on available; deposit on backorder',
      requested_at: '2026-11-01T08:00:00.000000Z',
      fulfillment_arrangement: 'delivery',
    }).data as SalesOrderRecord;

    const submitted = engine.submitSalesOrder({
      so_id: draft.so_id,
      actor_user_id: '101',
      expected_version: draft.version,
    }).data as SalesOrderRecord;

    const approved = engine.approveSalesOrder({
      so_id: submitted.so_id,
      reviewer_user_id: '202',
      expected_version: submitted.version,
      expected_material_version: submitted.material_version,
    }).data as SalesOrderRecord;

    const splitRes = engine.commitSoStockSplit({
      so_id: approved.so_id,
      actor_user_id: '301',
      split_at: '2026-11-01T09:00:00.000000Z',
      expected_version: approved.version,
      idempotency_key: 'p12-split-1',
    });
    expect(splitRes.ok).toBe(true);
    let so = splitRes.data as SalesOrderRecord;
    expect(so.reserved_available_quantity).toBe('4');
    expect(so.backorder_shortage_quantity).toBe('3');
    expect(so.available_reservation_expires_at).toBe('2026-11-03T09:00:00.000Z');
    // Backorder deposit clock does not start until buyer acceptance is recorded!
    expect(so.backorder_deposit_expires_at).toBeNull();
    expect(engine.getSnapshot().summary.usable_on_hand).toBe('10');
    expect(engine.getSnapshot().summary.available_to_allocate).toBe('0');

    // Record buyer acceptance 2 hours later -> starts separate 48h deposit clock
    const accRes = engine.recordBuyerAcceptance({
      so_id: so.so_id,
      actor_user_id: '101',
      decision: 'accept_all',
      contact_channel: 'Phone call',
      contact_outcome: 'Buyer confirmed 4 ready + 3 backorder',
      recorded_at: '2026-11-01T11:00:00.000000Z',
      expected_version: so.version,
      idempotency_key: 'p12-accept-1',
    });
    expect(accRes.ok).toBe(true);
    so = accRes.data as SalesOrderRecord;
    expect(so.can_procure_shortage).toBe(true);
    expect(so.backorder_deposit_expires_at).toBe('2026-11-03T11:00:00.000Z');

    // Issue Full-Order SI
    const siRes = engine.issueFullOrderSalesInvoice({
      so_id: so.so_id,
      actor_user_id: '401',
      issued_at: '2026-11-01T11:05:00.000000Z',
      expected_version: so.version,
      idempotency_key: 'p12-si-1',
    });
    expect(siRes.ok).toBe(true);
    const si = siRes.data as FullOrderSalesInvoice;
    expect(si.si_reference).toBe('CEBU-SI-2026-000001');
    expect(si.available_quantity).toBe('4');
    expect(si.backordered_quantity).toBe('3');
    expect(si.net_amount_due).toBe('3500.00');
    expect(si.is_proof_of_payment).toBe(false);
    expect(si.release_authority_granted).toBe(false);

    // Operation lookup
    const lookup = engine.lookupSalesOrderOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p12-si-1',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P12LookupResult).action_result).toBe('recovered');
  });

  it('prevents procurement of buyer-declined shortages and releases declined available reservations', () => {
    const engine = createP12SalesOrderEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    engine.configureSaleStockPool({
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      usable_on_hand_value: '2',
      existing_rf_reserved_value: '0',
      unit_price: '500.00',
      max_discount_amount: '0.00',
    });

    const draft = engine.createSalesOrderDraft({
      sales_officer_id: '101',
      buyer_name: 'Ana Cruz',
      buyer_contact: '09170001111',
      variant_id: '71',
      ordered_quantity_value: '5',
      quantity_scale: 0,
      unit_price: '500.00',
      discount_amount: '0.00',
      payment_terms: 'Standard pickup',
      requested_at: '2026-11-01T08:00:00.000000Z',
      fulfillment_arrangement: 'pickup',
    }).data as SalesOrderRecord;

    const sub = engine.submitSalesOrder({
      so_id: draft.so_id,
      actor_user_id: '101',
      expected_version: draft.version,
    }).data as SalesOrderRecord;

    const app = engine.approveSalesOrder({
      so_id: sub.so_id,
      reviewer_user_id: '202',
      expected_version: sub.version,
      expected_material_version: sub.material_version,
    }).data as SalesOrderRecord;

    const split = engine.commitSoStockSplit({
      so_id: app.so_id,
      actor_user_id: '301',
      split_at: '2026-11-01T09:00:00.000000Z',
      expected_version: app.version,
    }).data as SalesOrderRecord;

    const acceptAvailOnly = engine.recordBuyerAcceptance({
      so_id: split.so_id,
      actor_user_id: '101',
      decision: 'accept_available_only',
      contact_channel: 'SMS',
      contact_outcome: 'Buyer wants available 2 units only; declines backorder',
      recorded_at: '2026-11-01T10:00:00.000000Z',
      expected_version: split.version,
    }).data as SalesOrderRecord;

    expect(acceptAvailOnly.declined_shortage_quantity).toBe('3');
    expect(acceptAvailOnly.accepted_backorder_quantity).toBe('0');
    expect(acceptAvailOnly.can_procure_shortage).toBe(false);
    expect(engine.getSnapshot().summary.so_reserved).toBe('2');
  });
});
