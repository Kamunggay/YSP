import { describe, expect, it } from 'vitest';
import { createP20BoothCheckoutEngine, P20_CONTEXT_STORAGE_KEY } from './p20BoothCheckoutSlice';
import type {
  BoothCheckoutMovement,
  BoothEventRecord,
  P20LookupResult,
  StockroomSourceLot,
} from './p20BoothCheckoutSlice';

describe('p20BoothCheckoutSlice — Approved Booth Setup & Signed Custody Checkout', () => {
  it('starts strictly unseeded with empty lots, events, movements, and zero totals', () => {
    expect(P20_CONTEXT_STORAGE_KEY).toBe('ysp_p20_context');
    const engine = createP20BoothCheckoutEngine();
    const snap = engine.getSnapshot();

    expect(snap.stockroom_lots).toEqual([]);
    expect(snap.booth_events).toEqual([]);
    expect(snap.checkout_movements).toEqual([]);
    expect(snap.summary).toEqual({
      stockroom_usable_total: '0',
      booth_custody_total: '0',
      float_liability_total: '0.00',
      sales_revenue_total: '0.00',
      so_created_total: 0,
    });
  });

  it('enforces self-approval block, donor restriction guard, signature quantity match, and separate float liability', () => {
    const engine = createP20BoothCheckoutEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const goodLot = engine.registerStockroomSourceLot({
      variant_id: '81',
      sku_code: 'MERCH-KIT-01',
      item_name: 'Chapter Advocacy Tee',
      stockroom_usable_qty: '150',
      approved_event_unit_price: '150.00',
      restriction_kind: 'unrestricted_saleable',
    }).data as StockroomSourceLot;

    const restrictedLot = engine.registerStockroomSourceLot({
      variant_id: '82',
      sku_code: 'DON-KIT-99',
      item_name: 'Donor Hygiene Relief Kit',
      stockroom_usable_qty: '60',
      approved_event_unit_price: '100.00',
      restriction_kind: 'distribution_only',
    }).data as StockroomSourceLot;

    let ev = engine.createBoothEventSetup({
      event_name: 'Cebu Youth Summit Booth',
      event_dates: '2026-11-15 to 2026-11-16',
      requester_user_id: '101',
      custodian_user_id: '301',
      cashier_user_id: '302',
      requested_float_amount: '2000.00',
      remittance_schedule: 'Same-day close-out remittance',
    }).data as BoothEventRecord;

    // Unapproved setup blocks checkout
    const unapproved = engine.executeBoothCustodyCheckout({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '100',
      executed_at: '2026-11-15T07:00:00Z',
      expected_version: ev.version,
    });
    expect(unapproved.ok).toBe(false);
    expect(unapproved.code).toBe('BOOTH_SETUP_NOT_APPROVED');

    // Requester cannot self-approve
    const selfApp = engine.approveBoothEventSetup({
      event_id: ev.event_id,
      approver_user_id: '101',
      approved_at: '2026-11-15T07:05:00Z',
      expected_version: ev.version,
    });
    expect(selfApp.ok).toBe(false);
    expect(selfApp.code).toBe('SELF_APPROVAL_FORBIDDEN');

    ev = engine.approveBoothEventSetup({
      event_id: ev.event_id,
      approver_user_id: '202',
      approved_at: '2026-11-15T07:10:00Z',
      expected_version: ev.version,
    }).data as BoothEventRecord;
    expect(ev.float_liability_amount).toBe('2000.00');
    expect(ev.sales_revenue_amount).toBe('0.00');

    // Restricted donor lot forbidden for booth sale checkout
    const restrictedCheckout = engine.executeBoothCustodyCheckout({
      event_id: ev.event_id,
      lot_id: restrictedLot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '20',
      executed_at: '2026-11-15T07:12:00Z',
      expected_version: ev.version,
    });
    expect(restrictedCheckout.ok).toBe(false);
    expect(restrictedCheckout.code).toBe('RESTRICTED_LOT_BOOTH_SALE_FORBIDDEN');

    // Bind signature for 80 units, then attempt 100 -> rejected until fresh signature matches 100
    engine.bindCustodianCheckoutSignature({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      custodian_user_id: '301',
      capture_mode: 'canvas_pad',
      evidence_hash: 'a'.repeat(64),
      acknowledged_qty: '80',
      signed_at: '2026-11-15T07:15:00Z',
    });
    const staleSig = engine.executeBoothCustodyCheckout({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '100',
      executed_at: '2026-11-15T07:16:00Z',
      expected_version: ev.version,
    });
    expect(staleSig.ok).toBe(false);
    expect(staleSig.code).toBe('MISSING_OR_STALE_CHECKOUT_SIGNATURE');

    // Bind matching 100-unit signature -> executes once (-100 stockroom, +100 booth custody, PHP 0 revenue)
    engine.bindCustodianCheckoutSignature({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      custodian_user_id: '301',
      capture_mode: 'paper_upload',
      evidence_hash: 'b'.repeat(64),
      acknowledged_qty: '100',
      signed_at: '2026-11-15T07:20:00Z',
    });
    const mv = engine.executeBoothCustodyCheckout({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '100',
      executed_at: '2026-11-15T07:25:00Z',
      expected_version: ev.version,
      idempotency_key: 'p20-checkout-100',
    }).data as BoothCheckoutMovement;
    expect(mv.stockroom_delta).toBe('-100');
    expect(mv.booth_custody_delta).toBe('+100');

    const snap = engine.getSnapshot();
    expect(snap.summary.stockroom_usable_total).toBe('110'); // 50 + 60
    expect(snap.summary.booth_custody_total).toBe('100');
    expect(snap.summary.float_liability_total).toBe('2000.00');
    expect(snap.summary.sales_revenue_total).toBe('0.00');
    expect(snap.summary.so_created_total).toBe(0);

    // Payload mismatch rejected on reused key, same-key recovery succeeds
    const mismatch = engine.executeBoothCustodyCheckout({
      event_id: ev.event_id,
      lot_id: goodLot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '90',
      executed_at: '2026-11-15T07:25:00Z',
      expected_version: ev.version,
      idempotency_key: 'p20-checkout-100',
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');

    const lookup = engine.lookupBoothCheckoutOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p20-checkout-100',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P20LookupResult).action_result).toBe('recovered');
  });

  it('isolates custody balances across multiple simultaneous events', () => {
    const engine = createP20BoothCheckoutEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const lot = engine.registerStockroomSourceLot({
      variant_id: '90',
      sku_code: 'MERCH-PIN-01',
      item_name: 'Advocacy Enamel Pin',
      stockroom_usable_qty: '100',
      approved_event_unit_price: '75.00',
      restriction_kind: 'unrestricted_saleable',
    }).data as StockroomSourceLot;

    let ev1 = engine.createBoothEventSetup({
      event_name: 'Campus Fair North',
      event_dates: '2026-11-20',
      requester_user_id: '101',
      custodian_user_id: '301',
      cashier_user_id: '302',
      requested_float_amount: '500.00',
      remittance_schedule: 'Same-day remittance',
    }).data as BoothEventRecord;
    ev1 = engine.approveBoothEventSetup({
      event_id: ev1.event_id,
      approver_user_id: '202',
      approved_at: '2026-11-20T07:00:00Z',
      expected_version: ev1.version,
    }).data as BoothEventRecord;

    const ev2 = engine.createBoothEventSetup({
      event_name: 'Plaza Community Booth',
      event_dates: '2026-11-20',
      requester_user_id: '101',
      custodian_user_id: '303',
      cashier_user_id: '304',
      requested_float_amount: '500.00',
      remittance_schedule: 'Same-day remittance',
    }).data as BoothEventRecord;

    engine.bindCustodianCheckoutSignature({
      event_id: ev1.event_id,
      lot_id: lot.lot_id,
      custodian_user_id: '301',
      capture_mode: 'canvas_pad',
      evidence_hash: 'c'.repeat(64),
      acknowledged_qty: '40',
      signed_at: '2026-11-20T07:30:00Z',
    });
    engine.executeBoothCustodyCheckout({
      event_id: ev1.event_id,
      lot_id: lot.lot_id,
      executed_by_user_id: '301',
      checkout_qty: '40',
      executed_at: '2026-11-20T07:35:00Z',
      expected_version: ev1.version,
    });

    const events = engine.getSnapshot().booth_events;
    const foundEv1 = events.find((e) => e.event_id === ev1.event_id);
    const foundEv2 = events.find((e) => e.event_id === ev2.event_id);
    expect(foundEv1?.booth_custody_qty).toBe('40');
    expect(foundEv2?.booth_custody_qty).toBe('0');
  });
});
