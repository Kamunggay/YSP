import { describe, expect, it } from 'vitest';
import {
  createP15CustomerReleaseEngine,
  P15_CONTEXT_STORAGE_KEY,
} from './p15CustomerReleaseSlice';
import type {
  CustomerReleaseBatch,
  P15LookupResult,
  ReleasableSalesOrder,
} from './p15CustomerReleaseSlice';

describe('p15CustomerReleaseSlice — Covered Signed Customer Releases & Repeated Partials', () => {
  it('starts strictly unseeded with empty orders, batches, and zero KPI counters', () => {
    expect(P15_CONTEXT_STORAGE_KEY).toBe('ysp_p15_context');
    const engine = createP15CustomerReleaseEngine();
    const snap = engine.getSnapshot();

    expect(snap.releasable_orders).toEqual([]);
    expect(snap.release_batches).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand: '0',
      protected_so_reserved: '0',
      total_released_qty: '0',
      remaining_release_coverage: '0.00',
    });
  });

  it('blocks SI-alone, screenshot-alone, and procurement-deposit-without-coverage release attempts', () => {
    const engine = createP15CustomerReleaseEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const siOnly = engine.registerReleasableSalesOrder({
      so_reference: 'CEBU-SO-2026-000001',
      si_reference: 'CEBU-SI-2026-000001',
      or_reference: null,
      has_verified_or: false,
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      unit_net_price: '250.00',
      accepted_quantity_value: '4',
      protected_reserved_value: '4',
      usable_on_hand_value: '4',
      rop_threshold_value: '2',
      verified_release_coverage_amount: '0.00',
      deposit_credit_total: '0.00',
    }).data as ReleasableSalesOrder;

    const siBlocked = engine.prepareCustomerReleaseBatch({
      order_id: siOnly.order_id,
      prepared_by_user_id: '301',
      batch_quantity_value: '2',
      recipient_name: 'Maria Santos',
      recipient_id: '9001',
    });
    expect(siBlocked.ok).toBe(false);
    expect(siBlocked.code).toBe('SI_OR_SCREENSHOT_ALONE_CANNOT_RELEASE');

    const procDepositOnly = engine.registerReleasableSalesOrder({
      so_reference: 'CEBU-SO-2026-000002',
      si_reference: 'CEBU-SI-2026-000002',
      or_reference: 'CEBU-OR-2026-000001',
      has_verified_or: true,
      is_procurement_deposit_only: true,
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      unit_net_price: '250.00',
      accepted_quantity_value: '4',
      protected_reserved_value: '4',
      usable_on_hand_value: '4',
      rop_threshold_value: '2',
      verified_release_coverage_amount: '0.00',
      deposit_credit_total: '400.00',
    }).data as ReleasableSalesOrder;

    const depBlocked = engine.prepareCustomerReleaseBatch({
      order_id: procDepositOnly.order_id,
      prepared_by_user_id: '301',
      batch_quantity_value: '2',
      recipient_name: 'Maria Santos',
      recipient_id: '9001',
    });
    expect(depBlocked.ok).toBe(false);
    expect(depBlocked.code).toBe('INSUFFICIENT_RELEASE_COVERAGE');
  });

  it('invalidates prior signature on material batch revision and enforces repeated partials + RM allocation', () => {
    const engine = createP15CustomerReleaseEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    // Order for 6 units at PHP 250.00 = 1500.00; 4 units reserved initially, 2 via RM later; 1500.00 coverage + 400.00 deposit credit
    let order = engine.registerReleasableSalesOrder({
      so_reference: 'CEBU-SO-2026-000003',
      si_reference: 'CEBU-SI-2026-000003',
      or_reference: 'CEBU-OR-2026-000005',
      has_verified_or: true,
      is_procurement_deposit_only: false,
      variant_id: '71',
      item_name: 'Field Tent',
      quantity_scale: 0,
      unit_net_price: '250.00',
      accepted_quantity_value: '6',
      protected_reserved_value: '4',
      usable_on_hand_value: '4',
      rop_threshold_value: '2',
      verified_release_coverage_amount: '1500.00',
      deposit_credit_total: '400.00',
    }).data as ReleasableSalesOrder;

    // Prepare Batch 1 for 2 units (PHP 500.00)
    let b1 = engine.prepareCustomerReleaseBatch({
      order_id: order.order_id,
      prepared_by_user_id: '301',
      batch_quantity_value: '2',
      recipient_name: 'Maria Santos',
      recipient_id: '9001',
      idempotency_key: 'p15-b1-prep',
    }).data as CustomerReleaseBatch;
    expect(b1.cdr_reference).toBe('CEBU-CDR-2026-000001');
    const oldHash = b1.batch_snapshot_hash;

    // Bind signature on Batch 1
    b1 = engine.bindCustomerDrEvidence({
      batch_id: b1.batch_id,
      capture_mode: 'canvas_signature',
      evidence_hash: 'a'.repeat(64),
      releasing_officer_id: '301',
      recipient_id: '9001',
      recipient_acknowledged: true,
      signed_at: '2026-11-04T09:00:00Z',
      linked_batch_snapshot_hash: oldHash,
      expected_batch_version: b1.version,
    }).data as CustomerReleaseBatch;
    expect(b1.evidence_ready).toBe(true);

    // Revise recipient -> old hash invalidated!
    b1 = engine.reviseCustomerReleaseBatch({
      batch_id: b1.batch_id,
      actor_user_id: '301',
      batch_quantity_value: '2',
      recipient_name: 'Maria Santos (Authorized Rep)',
      recipient_id: '9002',
      expected_batch_version: b1.version,
    }).data as CustomerReleaseBatch;
    expect(b1.evidence_ready).toBe(false);
    expect(b1.material_version).toBe(2);

    const stalePost = engine.postCustomerReleaseBatch({
      batch_id: b1.batch_id,
      actor_user_id: '301',
      expected_snapshot_hash: oldHash,
      posted_at: '2026-11-04T09:05:00Z',
      expected_batch_version: b1.version,
    });
    expect(stalePost.ok).toBe(false);
    expect(stalePost.code).toBe('STALE_BATCH_EVIDENCE_MISMATCH');

    // Re-bind with new digest and post Batch 1 (2 units, PHP 500.00 consumed)
    b1 = engine.bindCustomerDrEvidence({
      batch_id: b1.batch_id,
      capture_mode: 'paper_upload',
      evidence_hash: 'b'.repeat(64),
      releasing_officer_id: '301',
      recipient_id: '9002',
      recipient_acknowledged: true,
      signed_at: '2026-11-04T09:10:00Z',
      linked_batch_snapshot_hash: b1.batch_snapshot_hash,
      expected_batch_version: b1.version,
    }).data as CustomerReleaseBatch;

    const post1 = engine.postCustomerReleaseBatch({
      batch_id: b1.batch_id,
      actor_user_id: '301',
      posted_at: '2026-11-04T09:12:00Z',
      expected_batch_version: b1.version,
      idempotency_key: 'p15-b1-post',
    });
    expect(post1.ok).toBe(true);

    order = engine.getSnapshot().releasable_orders[0] as ReleasableSalesOrder;
    expect(order.released_quantity.value).toBe('2');
    expect(order.remaining_quantity.value).toBe('4');
    expect(order.remaining_release_coverage).toBe('1000.00');
    expect(order.deposit_credit_total).toBe('400.00');
    expect(order.status).toBe('partially_released');
    expect(order.low_stock_alert).toBe(true); // usable 2 <= rop 2

    // Allocate 2 incoming RM units to replenish remaining 2 unreserved demand -> reserved becomes 4
    order = engine.allocateIncomingRmToFundedSo({
      order_id: order.order_id,
      rm_reference: 'CEBU-RM-2026-000001',
      quantity_value: '2',
      actor_user_id: '301',
      allocated_at: '2026-11-04T11:00:00Z',
      expected_version: order.version,
    }).data as ReleasableSalesOrder;
    expect(order.protected_reserved.value).toBe('4');

    // Release remaining 4 units -> fulfilled
    let b2 = engine.prepareCustomerReleaseBatch({
      order_id: order.order_id,
      prepared_by_user_id: '301',
      batch_quantity_value: '4',
      recipient_name: 'Maria Santos (Authorized Rep)',
      recipient_id: '9002',
    }).data as CustomerReleaseBatch;
    b2 = engine.bindCustomerDrEvidence({
      batch_id: b2.batch_id,
      capture_mode: 'canvas_signature',
      evidence_hash: 'c'.repeat(64),
      releasing_officer_id: '301',
      recipient_id: '9002',
      recipient_acknowledged: true,
      signed_at: '2026-11-04T11:10:00Z',
      linked_batch_snapshot_hash: b2.batch_snapshot_hash,
      expected_batch_version: b2.version,
    }).data as CustomerReleaseBatch;
    engine.postCustomerReleaseBatch({
      batch_id: b2.batch_id,
      actor_user_id: '301',
      posted_at: '2026-11-04T11:15:00Z',
      expected_batch_version: b2.version,
      idempotency_key: 'p15-b2-post',
    });

    const finalOrder = engine.getSnapshot().releasable_orders[0] as ReleasableSalesOrder;
    expect(finalOrder.status).toBe('fulfilled');
    expect(finalOrder.remaining_quantity.value).toBe('0');
    expect(finalOrder.remaining_release_coverage).toBe('0.00');

    const lookup = engine.lookupCustomerReleaseOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p15-b2-post',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P15LookupResult).action_result).toBe('recovered');
  });
});
