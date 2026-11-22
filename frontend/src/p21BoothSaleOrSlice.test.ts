import { describe, expect, it } from 'vitest';
import { createP21BoothSaleOrEngine, P21_CONTEXT_STORAGE_KEY } from './p21BoothSaleOrSlice';
import type {
  BoothCatalogItem,
  BoothImmediateSaleRecord,
  P21LookupResult,
  Track1SoHandoffLead,
} from './p21BoothSaleOrSlice';

describe('p21BoothSaleOrSlice — Immediate Booth Cart, Verified Sale & OR', () => {
  it('starts strictly unseeded with zero custody, zero cart, and zero sales', () => {
    expect(P21_CONTEXT_STORAGE_KEY).toBe('ysp_p21_context');
    const engine = createP21BoothSaleOrEngine();
    const snap = engine.getSnapshot();

    expect(snap.catalog_items).toEqual([]);
    expect(snap.immediate_sales).toEqual([]);
    expect(snap.track1_handoffs).toEqual([]);
    expect(snap.summary).toEqual({
      booth_custody_total: '0',
      stockroom_usable_total: '0',
      cart_total_qty: '0',
      verified_booth_sales_total: '0.00',
      or_issued_count: 0,
      track1_so_handoff_count: 0,
    });
  });

  it('enforces unverified GCash block, unauthorized price override block, sell-30 stock isolation, and idempotent retry', () => {
    const engine = createP21BoothSaleOrEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const item = engine.registerCheckedOutBoothCatalogItem({
      event_code: 'CEBU-EVT-2026-000001',
      sku_code: 'MERCH-KIT-01',
      item_name: 'Chapter Advocacy Tee',
      approved_unit_price: '150.00',
      booth_custody_qty: '100',
      stockroom_usable_qty: '50',
    }).data as BoothCatalogItem;

    // Steppers + direct entry
    engine.adjustBoothCartQuantity({ item_id: item.item_id, mode: 'increment' });
    engine.adjustBoothCartQuantity({ item_id: item.item_id, mode: 'decrement' });
    engine.adjustBoothCartQuantity({ item_id: item.item_id, mode: 'set_exact', quantity_value: '30' });
    expect(engine.getSnapshot().summary.cart_total_qty).toBe('30');

    // Unauthorized discount rejected
    const badPrice = engine.commitImmediateBoothSale({
      item_id: item.item_id,
      cashier_user_id: '302',
      submitted_unit_price: '100.00',
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-EVT-001',
      sold_at: '2026-11-15T09:00:00Z',
    });
    expect(badPrice.ok).toBe(false);
    expect(badPrice.code).toBe('UNAUTHORIZED_DISCOUNT_OR_PRICE_OVERRIDE');

    // Unverified GCash screenshot blocked
    const unverifiedGcash = engine.commitImmediateBoothSale({
      item_id: item.item_id,
      cashier_user_id: '302',
      submitted_unit_price: '150.00',
      payment_channel: 'official_gcash',
      gcash_credit_verified: false,
      payment_reference: 'GC-771201',
      sold_at: '2026-11-15T09:05:00Z',
    });
    expect(unverifiedGcash.ok).toBe(false);
    expect(unverifiedGcash.code).toBe('UNVERIFIED_GCASH_OR_SCREENSHOT_BLOCKED');

    // Commit verified GCash sale for 30 units -> booth 70, stockroom unchanged 50, zero SO/SI/CDR
    const saleRes = engine.commitImmediateBoothSale({
      item_id: item.item_id,
      cashier_user_id: '302',
      submitted_unit_price: '150.00',
      payment_channel: 'official_gcash',
      gcash_credit_verified: true,
      payment_reference: 'GC-771201',
      sold_at: '2026-11-15T09:10:00Z',
      idempotency_key: 'p21-sale-30',
    });
    expect(saleRes.ok).toBe(true);
    const sale = saleRes.data as BoothImmediateSaleRecord;
    expect(sale.or_reference).toBe('CEBU-OR-BTH-2026-000001');
    expect(sale.total_amount).toBe('4500.00');
    expect(sale.stockroom_delta).toBe('0');
    expect(sale.booth_custody_delta).toBe('-30');
    expect(sale.so_created_count).toBe(0);
    expect(sale.eligible_for_booth_claim_f).toBe(true);

    const snap = engine.getSnapshot();
    expect(snap.summary.booth_custody_total).toBe('70');
    expect(snap.summary.stockroom_usable_total).toBe('50');
    expect(snap.summary.verified_booth_sales_total).toBe('4500.00');

    // Same-key retry recovers without double deduction
    const replay = engine.commitImmediateBoothSale({
      item_id: item.item_id,
      cashier_user_id: '302',
      submitted_unit_price: '150.00',
      payment_channel: 'official_gcash',
      gcash_credit_verified: true,
      payment_reference: 'GC-771201',
      sold_at: '2026-11-15T09:10:00Z',
      idempotency_key: 'p21-sale-30',
    });
    expect(replay.ok).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(engine.getSnapshot().summary.booth_custody_total).toBe('70');

    const lookup = engine.lookupBoothSaleOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p21-sale-30',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P21LookupResult).action_result).toBe('recovered');
  });

  it('guards confirmed cart reset, concurrent oversale race, and out-of-stock Track 1 SO handoff', () => {
    const engine = createP21BoothSaleOrEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const item = engine.registerCheckedOutBoothCatalogItem({
      event_code: 'CEBU-EVT-2026-000002',
      sku_code: 'YSP-KIT-STD',
      item_name: 'Standard Chapter Kit',
      approved_unit_price: '250.00',
      booth_custody_qty: '5',
      stockroom_usable_qty: '10',
    }).data as BoothCatalogItem;

    engine.adjustBoothCartQuantity({ item_id: item.item_id, mode: 'set_exact', quantity_value: '4' });

    // Unconfirmed non-empty reset blocked -> confirmed succeeds
    const unconfReset = engine.resetUnpostedBoothCart({
      item_id: item.item_id,
      confirm_non_empty_reset: false,
    });
    expect(unconfReset.ok).toBe(false);
    expect(unconfReset.code).toBe('CART_RESET_CONFIRMATION_REQUIRED');

    engine.resetUnpostedBoothCart({ item_id: item.item_id, confirm_non_empty_reset: true });
    expect(engine.getSnapshot().summary.cart_total_qty).toBe('0');

    // Enter 4 in cart, concurrent sale reduces custody to 2 -> commit blocked
    engine.adjustBoothCartQuantity({ item_id: item.item_id, mode: 'set_exact', quantity_value: '4' });
    engine.simulateConcurrentBoothStockChange({
      item_id: item.item_id,
      new_booth_custody_qty: '2',
      actor_user_id: '305',
    });
    const oversale = engine.commitImmediateBoothSale({
      item_id: item.item_id,
      cashier_user_id: '302',
      submitted_unit_price: '250.00',
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-099',
      sold_at: '2026-11-15T10:00:00Z',
    });
    expect(oversale.ok).toBe(false);
    expect(oversale.code).toBe('BOOTH_CUSTODY_OVERSALE_BLOCKED');

    // Out-of-stock custom demand routes to Track 1 SO without booth backorder
    const handoff = engine.handoffOutOfStockToTrack1So({
      event_code: 'CEBU-EVT-2026-000002',
      sku_code: 'YSP-KIT-STD',
      buyer_name: 'Elena Bautista',
      requested_qty: '8',
      cashier_user_id: '302',
      recorded_at: '2026-11-15T10:15:00Z',
      notes: 'Custody only has 2 left; buyer accepts Track 1 SO fulfillment',
    }).data as Track1SoHandoffLead;
    expect(handoff.creates_booth_backorder).toBe(false);
    expect(handoff.so_lead_reference).toBe('CEBU-SO-LEAD-2026-000001');
  });
});
