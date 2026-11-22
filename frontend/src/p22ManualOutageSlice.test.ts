import { describe, expect, it } from 'vitest';
import { createP22ManualOutageEngine, P22_CONTEXT_STORAGE_KEY } from './p22ManualOutageSlice';
import type {
  ManualOutageSaleRecord,
  ManualReceiptSeries,
  P22LookupResult,
} from './p22ManualOutageSlice';

describe('p22ManualOutageSlice — Manual Outage Controls & Once-Only Later Entry', () => {
  it('starts strictly unseeded with empty series, sales, discrepancies, and zero balances', () => {
    expect(P22_CONTEXT_STORAGE_KEY).toBe('ysp_p22_context');
    const engine = createP22ManualOutageEngine();
    const snap = engine.getSnapshot();

    expect(snap.receipt_series).toEqual([]);
    expect(snap.manual_sales).toEqual([]);
    expect(snap.manual_exceptions).toEqual([]);
    expect(snap.missing_in_range_refs).toEqual([]);
    expect(snap.summary).toEqual({
      remaining_custody_total: '0',
      entered_manual_sales_total: '0.00',
      entered_sales_count: 0,
      open_discrepancies_count: 0,
      second_or_issued_count: 0,
    });
  });

  it('enforces range bounds, unconfirmed offline GCash block, duplicate OR/payment ref prevention, and no second OR', () => {
    const engine = createP22ManualOutageEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const series = engine.allocateManualReceiptSeries({
      event_code: 'CEBU-EVT-2026-000001',
      series_prefix: 'MAN-CEBU-OR',
      range_start: 101,
      range_end: 105,
      booth_custody_qty: '20',
      authorized_by_user_id: '202',
    }).data as ManualReceiptSeries;

    // Out of allocated range rejected
    const outOfRange = engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 199,
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-MAN-199',
      amount_php: '150.00',
      quantity_sold: '1',
      original_sale_at: '2026-11-15T11:00:00Z',
      entered_at: '2026-11-15T13:00:00Z',
      officer_user_id: '302',
      evidence_note: 'Paper stub scan',
    });
    expect(outOfRange.ok).toBe(false);
    expect(outOfRange.code).toBe('MANUAL_OR_OUT_OF_ALLOCATED_RANGE');

    // Unconfirmed offline GCash blocked
    const badGcash = engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 101,
      payment_channel: 'official_gcash',
      gcash_credit_verified: false,
      payment_reference: 'GC-OFFLINE-101',
      amount_php: '300.00',
      quantity_sold: '2',
      original_sale_at: '2026-11-15T11:05:00Z',
      entered_at: '2026-11-15T13:05:00Z',
      officer_user_id: '302',
      evidence_note: 'Buyer screenshot offline',
    });
    expect(badGcash.ok).toBe(false);
    expect(badGcash.code).toBe('UNCONFIRMED_OFFLINE_GCASH_CREDIT_FORBIDDEN');

    // Valid once-only manual cash sale #101 -> posts once without issuing second OR
    const entry = engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 101,
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-MAN-101',
      amount_php: '300.00',
      quantity_sold: '2',
      original_sale_at: '2026-11-15T11:05:00Z',
      entered_at: '2026-11-15T13:10:00Z',
      officer_user_id: '302',
      evidence_note: 'Signed carbon receipt #101',
      idempotency_key: 'p22-enter-101',
    }).data as ManualOutageSaleRecord;
    expect(entry.second_or_issued).toBe(false);
    expect(entry.original_sale_at).toBe('2026-11-15T11:05:00Z');
    expect(entry.entered_at).toBe('2026-11-15T13:10:00Z');
    expect(engine.getSnapshot().summary.remaining_custody_total).toBe('18');

    // Duplicate manual OR or payment reference blocked (no double deduction!)
    const dupOr = engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 101,
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-MAN-999',
      amount_php: '300.00',
      quantity_sold: '2',
      original_sale_at: '2026-11-15T11:05:00Z',
      entered_at: '2026-11-15T13:12:00Z',
      officer_user_id: '302',
      evidence_note: 'Duplicate retry',
    });
    expect(dupOr.ok).toBe(false);
    expect(dupOr.code).toBe('DUPLICATE_MANUAL_OR_OR_PAYMENT_REF');
    expect(engine.getSnapshot().summary.remaining_custody_total).toBe('18');
  });

  it('prevents negative custody fabrication, surfaces range gaps, and recovers idempotent operations', () => {
    const engine = createP22ManualOutageEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const series = engine.allocateManualReceiptSeries({
      event_code: 'CEBU-EVT-2026-000001',
      series_prefix: 'MAN-CEBU-OR',
      range_start: 101,
      range_end: 105,
      booth_custody_qty: '3',
      authorized_by_user_id: '202',
    }).data as ManualReceiptSeries;

    // Entering #103 (skipping #101, #102) surfaces missing-in-range gaps
    engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 103,
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-MAN-103',
      amount_php: '450.00',
      quantity_sold: '3',
      original_sale_at: '2026-11-15T11:20:00Z',
      entered_at: '2026-11-15T13:20:00Z',
      officer_user_id: '302',
      evidence_note: 'Carbon slip #103',
      idempotency_key: 'p22-enter-103',
    });
    expect(engine.getSnapshot().missing_in_range_refs).toEqual(['MAN-CEBU-OR-0101', 'MAN-CEBU-OR-0102']);

    // Exceeding remaining 0 custody blocks without creating negative stock
    const shortfall = engine.enterManualOutageSale({
      series_id: series.series_id,
      manual_or_number: 104,
      payment_channel: 'cash',
      gcash_credit_verified: false,
      payment_reference: 'CASH-MAN-104',
      amount_php: '150.00',
      quantity_sold: '1',
      original_sale_at: '2026-11-15T11:25:00Z',
      entered_at: '2026-11-15T13:25:00Z',
      officer_user_id: '302',
      evidence_note: 'Custody depleted',
    });
    expect(shortfall.ok).toBe(false);
    expect(shortfall.code).toBe('CUSTODY_SHORTFALL_RECONCILIATION_REQUIRED');

    // Preserve unconfirmed GCash fact without faking payment
    engine.recordManualReceiptException({
      series_id: series.series_id,
      manual_or_number: 104,
      exception_kind: 'unconfirmed_gcash_shortfall',
      officer_user_id: '302',
      recorded_at: '2026-11-15T13:30:00Z',
      real_world_fact_note: 'Manual slip #104 awaited bank verification',
    });
    expect(engine.getSnapshot().summary.open_discrepancies_count).toBeGreaterThanOrEqual(3);

    const lookup = engine.lookupManualOutageOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p22-enter-103',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P22LookupResult).action_result).toBe('recovered');
  });
});
