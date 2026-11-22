import { describe, expect, it } from 'vitest';
import {
  createP14TwoClocksExpiryEngine,
  P14_CONTEXT_STORAGE_KEY,
} from './p14TwoClocksExpirySlice';
import type {
  DualClockOrder,
  LatePaymentResolutionRecord,
  P14LookupResult,
  RepfForwardRecord,
} from './p14TwoClocksExpirySlice';

describe('p14TwoClocksExpirySlice — Two Clocks, Funded Procurement & Late-Money Resolution', () => {
  it('starts strictly unseeded with empty tracked orders, forwards, resolutions, and zero counters', () => {
    expect(P14_CONTEXT_STORAGE_KEY).toBe('ysp_p14_context');
    const engine = createP14TwoClocksExpiryEngine();
    const snap = engine.getSnapshot();

    expect(snap.tracked_orders).toEqual([]);
    expect(snap.repf_forwards).toEqual([]);
    expect(snap.late_resolutions).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand: '0',
      active_unpaid_so_reserved: '0',
      protected_paid_so_reserved: '0',
      funded_backorder_qty: '0',
      available_to_allocate: '0',
    });
  });

  it('enforces scoped Clock 1 expiry, protects RF/paid/funded backorders, blocks backdating/screenshots, and forwards funded RepF', () => {
    const engine = createP14TwoClocksExpiryEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    let order = engine.registerDualClockOrder({
      so_reference: 'CEBU-SO-2026-000001',
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      quantity_scale: 0,
      usable_on_hand_value: '10',
      rf_reserved_value: '4',
      unpaid_available_reserved_value: '3',
      paid_available_reserved_value: '2',
      accepted_backorder_qty_value: '5',
      agreed_sale_amount: '1000.00',
      estimated_procurement_cost: '400.00',
      finance_cost_approved: true,
      reservation_created_at: '2026-11-01T08:00:00Z',
      backorder_accepted_at: '2026-11-01T10:00:00Z',
      pickup_deadline_at: '2026-11-04T08:00:00Z',
    }).data as DualClockOrder;

    // Pending screenshot cannot protect
    const ssRes = engine.recordScopedOrderFunding({
      order_id: order.order_id,
      funding_scope: 'backorder_deposit',
      evidence_kind: 'pending_screenshot',
      or_reference: '',
      amount: '400.00',
      verified_at: '2026-11-01T11:00:00Z',
      actor_user_id: '202',
      expected_version: order.version,
    });
    expect(ssRes.ok).toBe(false);
    expect(ssRes.code).toBe('UNVERIFIED_PAYMENT_CANNOT_PROTECT');

    // Backdated entry after Clock 2 deadline (2026-11-03T10:00:00Z) rejected
    const backdateRes = engine.recordScopedOrderFunding({
      order_id: order.order_id,
      funding_scope: 'backorder_deposit',
      evidence_kind: 'verified_or',
      or_reference: 'CEBU-OR-2026-000001',
      amount: '400.00',
      verified_at: '2026-11-03T10:05:00Z',
      actor_user_id: '202',
      expected_version: order.version,
    });
    expect(backdateRes.ok).toBe(false);
    expect(backdateRes.code).toBe('BACKDATED_ENTRY_CANNOT_EXTEND_CLOCK');

    // Valid deposit protects ONLY backorder; unpaid available remains subject to Clock 1
    const depRes = engine.recordScopedOrderFunding({
      order_id: order.order_id,
      funding_scope: 'backorder_deposit',
      evidence_kind: 'verified_or',
      or_reference: 'CEBU-OR-2026-000001',
      amount: '400.00',
      verified_at: '2026-11-01T12:00:00Z',
      actor_user_id: '202',
      expected_version: order.version,
      idempotency_key: 'p14-fund-dep',
    });
    expect(depRes.ok).toBe(true);
    order = depRes.data as DualClockOrder;
    expect(order.backorder_state).toBe('funded_protected');
    expect(order.unpaid_available_state).toBe('active_unpaid');

    // Evaluate clocks at Clock 1 expiry (2026-11-03T08:00:00Z):
    // Only the 3 unpaid available units expire; usable_on_hand remains 10, rf_reserved 4, paid 2, funded backorder 5!
    const eval1 = engine.evaluateOrderClocksAtTime({
      order_id: order.order_id,
      evaluation_time: '2026-11-03T08:00:00Z',
      actor_user_id: '301',
      expected_version: order.version,
      idempotency_key: 'p14-eval-1',
    });
    expect(eval1.ok).toBe(true);
    order = eval1.data as DualClockOrder;
    expect(order.unpaid_available_state).toBe('expired_released');
    expect(order.unpaid_available_reserved.value).toBe('0');
    expect(order.usable_on_hand.value).toBe('10');
    expect(order.rf_reserved.value).toBe('4');
    expect(order.paid_available_reserved.value).toBe('2');
    expect(order.available_to_allocate.value).toBe('4'); // was 1, +3 released = 4
    expect(order.backorder_state).toBe('funded_protected');
    expect(order.payment_hold_expiry_notice).toBe(true);

    // Block relabeling as RF/ROP; valid funded RepF succeeds
    const relabelBlocked = engine.forwardShortageToPurchasingRepf({
      order_id: order.order_id,
      actor_user_id: '101',
      attempt_rf_rop_relabel: true,
      forwarded_at: '2026-11-03T08:05:00Z',
      expected_version: order.version,
    });
    expect(relabelBlocked.ok).toBe(false);
    expect(relabelBlocked.code).toBe('UNPAID_SO_RELABEL_FORBIDDEN');

    const forwardOk = engine.forwardShortageToPurchasingRepf({
      order_id: order.order_id,
      actor_user_id: '202',
      forwarded_at: '2026-11-03T08:10:00Z',
      expected_version: order.version,
      idempotency_key: 'p14-forward-1',
    });
    expect(forwardOk.ok).toBe(true);
    expect((forwardOk.data as RepfForwardRecord).repf_reference).toBe('CEBU-REPF-SO-2026-000001');

    // Pickup deadline triggers overdue alert without auto-freeing paid or funded stock
    order = engine.getSnapshot().tracked_orders[0] as DualClockOrder;
    const evalPickup = engine.evaluateOrderClocksAtTime({
      order_id: order.order_id,
      evaluation_time: '2026-11-05T08:00:00Z',
      actor_user_id: '301',
      expected_version: order.version,
    }).data as DualClockOrder;
    expect(evalPickup.overdue_pickup_alert).toBe(true);
    expect(evalPickup.paid_available_reserved.value).toBe('2');
  });

  it('handles Clock 2 unfunded lapse, excess cost blocker, and late-payment fresh availability check', () => {
    const engine = createP14TwoClocksExpiryEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    let order = engine.registerDualClockOrder({
      so_reference: 'CEBU-SO-2026-000002',
      variant_id: '72',
      item_name: 'Responder Kit',
      quantity_scale: 0,
      usable_on_hand_value: '5',
      rf_reserved_value: '0',
      unpaid_available_reserved_value: '2',
      paid_available_reserved_value: '0',
      accepted_backorder_qty_value: '4',
      agreed_sale_amount: '500.00',
      estimated_procurement_cost: '650.00', // exceeds sale amount
      finance_cost_approved: false,
      reservation_created_at: '2026-11-01T08:00:00Z',
      backorder_accepted_at: '2026-11-01T09:00:00Z',
    }).data as DualClockOrder;
    expect(order.cost_exceeds_sale_blocker).toBe(true);

    // Clear excess cost with pricing/Finance review
    order = engine.approveExcessProcurementCost({
      order_id: order.order_id,
      finance_user_id: '201',
      buyer_acceptance_reason: 'Buyer accepted updated backorder pricing',
      approved_at: '2026-11-01T09:30:00Z',
      expected_version: order.version,
    }).data as DualClockOrder;
    expect(order.cost_exceeds_sale_blocker).toBe(false);

    // Partial deposit below PHP 650.00 leaves backorder awaiting full deposit -> lapses after 48h
    order = engine.recordScopedOrderFunding({
      order_id: order.order_id,
      funding_scope: 'backorder_deposit',
      evidence_kind: 'verified_or',
      or_reference: 'CEBU-OR-2026-000010',
      amount: '200.00',
      verified_at: '2026-11-01T10:00:00Z',
      actor_user_id: '202',
      expected_version: order.version,
    }).data as DualClockOrder;
    expect(order.backorder_state).toBe('awaiting_deposit');
    expect(order.partial_unfunded_credit).toBe('200.00');

    order = engine.evaluateOrderClocksAtTime({
      order_id: order.order_id,
      evaluation_time: '2026-11-03T10:00:00Z',
      actor_user_id: '301',
      expected_version: order.version,
    }).data as DualClockOrder;
    expect(order.unpaid_available_state).toBe('expired_released');
    expect(order.backorder_state).toBe('lapsed_unfunded');
    // Unfunded backorder cannot forward RepF
    const fwdFail = engine.forwardShortageToPurchasingRepf({
      order_id: order.order_id,
      actor_user_id: '202',
      forwarded_at: '2026-11-03T10:05:00Z',
      expected_version: order.version,
    });
    expect(fwdFail.ok).toBe(false);
    expect(fwdFail.code).toBe('SO_SHORTAGE_OR_FUNDING_REQUIRED');

    // Another officer consumes all 5 available units before late payment arrives -> late payment must not over-allocate!
    order = engine.consumeAvailableStockElsewhere({
      order_id: order.order_id,
      consumed_quantity_value: '5',
      actor_user_id: '105',
    }).data as DualClockOrder;
    expect(order.available_to_allocate.value).toBe('0');

    const lateRes = engine.resolveLateVerifiedPayment({
      order_id: order.order_id,
      actor_user_id: '202',
      or_reference: 'CEBU-OR-2026-000015',
      requested_quantity_value: '2',
      verified_at: '2026-11-03T12:00:00Z',
      fallback_choice: 'route_to_finance_refund',
      expected_version: order.version,
      idempotency_key: 'p14-late-1',
    });
    expect(lateRes.ok).toBe(true);
    expect((lateRes.data as LatePaymentResolutionRecord).outcome).toBe('route_to_finance_refund');

    const lookup = engine.lookupTwoClocksOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p14-late-1',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P14LookupResult).action_result).toBe('recovered');
  });
});
