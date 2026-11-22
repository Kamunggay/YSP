import { describe, expect, it } from 'vitest';
import { createP23BoothCloseoutEngine, P23_CONTEXT_STORAGE_KEY } from './p23BoothCloseoutSlice';
import type { BoothCloseoutRecord, P23LookupResult } from './p23BoothCloseoutSlice';

describe('p23BoothCloseoutSlice — Independent Returns, Variance, Remittance & Closure', () => {
  it('starts strictly unseeded with empty events and zero custody or remittance totals', () => {
    expect(P23_CONTEXT_STORAGE_KEY).toBe('ysp_p23_context');
    const engine = createP23BoothCloseoutEngine();
    const snap = engine.getSnapshot();

    expect(snap.closeout_events).toEqual([]);
    expect(snap.summary).toEqual({
      booth_custody_remaining_total: '0',
      stockroom_net_delta_summary: '0',
      sales_cash_still_due_total: '0.00',
      float_still_due_total: '0.00',
      gcash_still_due_total: '0.00',
      closed_events_count: 0,
    });
  });

  it('reconciles 100/30/70 custody and BTH-06/ADD-AC-10 float 2000 / cash 4500 / refund 500 / deposit 1000 / float-ret 2000 cleanly', () => {
    const engine = createP23BoothCloseoutEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    let ev = engine.initializeBoothCloseoutEvent({
      event_code: 'CEBU-EVT-2026-000001',
      event_name: 'Clean Summit Close-Out',
      custodian_user_id: '301',
      cashier_user_id: '302',
      checked_out_qty: '100',
      sold_qty: '30',
      float_issued_php: '2000.00',
      cash_sales_php: '4500.00',
      cash_refunds_executed_php: '500.00',
      prior_sales_deposits_php: '1000.00',
      prior_float_returns_php: '2000.00',
      gcash_sales_verified_php: '3000.00',
      gcash_prior_remitted_php: '3000.00',
    }).data as BoothCloseoutRecord;

    expect(ev.sales_cash_still_due_php).toBe('3000.00');
    expect(ev.float_still_due_php).toBe('0.00');
    expect(ev.gcash_still_due_php).toBe('0.00');

    // Custodian cannot self-count
    const selfCount = engine.recordIndependentClosingCountAndGoodReturn({
      event_id: ev.event_id,
      counter_user_id: '301',
      usable_return_qty: '70',
      damaged_qty: '0',
      unexplained_missing_qty: '0',
      signature_hash: 'a'.repeat(64),
      counted_at: '2026-11-16T18:00:00Z',
      expected_version: ev.version,
    });
    expect(selfCount.ok).toBe(false);
    expect(selfCount.code).toBe('INDEPENDENT_CLOSING_COUNTER_REQUIRED');

    ev = engine.recordIndependentClosingCountAndGoodReturn({
      event_id: ev.event_id,
      counter_user_id: '401',
      usable_return_qty: '70',
      damaged_qty: '0',
      unexplained_missing_qty: '0',
      signature_hash: 'a'.repeat(64),
      counted_at: '2026-11-16T18:05:00Z',
      expected_version: ev.version,
      idempotency_key: 'p23-return-70',
    }).data as BoothCloseoutRecord;

    expect(ev.booth_custody_remaining_qty).toBe('0');
    expect(ev.stockroom_net_delta).toBe('-30');

    // Closure blocked while PHP 3000.00 sales cash still due
    const blockedClose = engine.closeBoothEvent({
      event_id: ev.event_id,
      closing_officer_id: '202',
      closed_at: '2026-11-16T18:10:00Z',
      expected_version: ev.version,
    });
    expect(blockedClose.ok).toBe(false);
    expect(blockedClose.code).toBe('BOOTH_CLOSURE_BLOCKED_OPEN_OBLIGATIONS');

    // Reconciler cannot be cashier; independent reconciler settles remaining PHP 3000.00 -> closes cleanly
    const selfRec = engine.recordBoothRemittanceAndFloatSettlement({
      event_id: ev.event_id,
      reconciler_user_id: '302',
      cash_remitted_php: '3000.00',
      float_returned_php: '0.00',
      gcash_remitted_verified_php: '0.00',
      settlement_reference: 'CASH-REM-3000',
      settled_at: '2026-11-16T18:15:00Z',
      expected_version: ev.version,
    });
    expect(selfRec.ok).toBe(false);
    expect(selfRec.code).toBe('INDEPENDENT_RECONCILER_REQUIRED');

    ev = engine.recordBoothRemittanceAndFloatSettlement({
      event_id: ev.event_id,
      reconciler_user_id: '202',
      cash_remitted_php: '3000.00',
      float_returned_php: '0.00',
      gcash_remitted_verified_php: '0.00',
      settlement_reference: 'CASH-REM-3000',
      settled_at: '2026-11-16T18:20:00Z',
      expected_version: ev.version,
      idempotency_key: 'p23-reconcile-3000',
    }).data as BoothCloseoutRecord;

    ev = engine.closeBoothEvent({
      event_id: ev.event_id,
      closing_officer_id: '202',
      closed_at: '2026-11-16T18:25:00Z',
      expected_version: ev.version,
    }).data as BoothCloseoutRecord;
    expect(ev.status).toBe('closed');
    expect(engine.getSnapshot().summary.closed_events_count).toBe(1);
  });

  it('posts usable return while holding damage/missing variance for GOV-06 dual approval', () => {
    const engine = createP23BoothCloseoutEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    let ev = engine.initializeBoothCloseoutEvent({
      event_code: 'CEBU-EVT-2026-000002',
      event_name: 'Discrepant Event Close-Out',
      custodian_user_id: '301',
      cashier_user_id: '302',
      checked_out_qty: '50',
      sold_qty: '10',
      float_issued_php: '1000.00',
      cash_sales_php: '1500.00',
      cash_refunds_executed_php: '0.00',
      prior_sales_deposits_php: '1500.00',
      prior_float_returns_php: '1000.00',
      gcash_sales_verified_php: '0.00',
      gcash_prior_remitted_php: '0.00',
    }).data as BoothCloseoutRecord;

    // 40 expected unsold -> 35 usable return, 3 damaged, 2 unexplained missing
    ev = engine.recordIndependentClosingCountAndGoodReturn({
      event_id: ev.event_id,
      counter_user_id: '401',
      usable_return_qty: '35',
      damaged_qty: '3',
      unexplained_missing_qty: '2',
      signature_hash: 'b'.repeat(64),
      counted_at: '2026-11-17T18:00:00Z',
      expected_version: ev.version,
    }).data as BoothCloseoutRecord;

    expect(ev.booth_custody_remaining_qty).toBe('5');
    expect(ev.stockroom_net_delta).toBe('-15');
    expect(ev.variance_adj_status).toBe('pending_dual_approval');

    // Counter (401) or custodian (301) barred from either variance approval slot; single person barred
    const counterApp = engine.approveBoothVarianceAdj({
      event_id: ev.event_id,
      head_approver_id: '401',
      finance_approver_id: '202',
      quarantine_treatment_note: 'Quarantine 3 damaged',
      approved_at: '2026-11-17T18:10:00Z',
      expected_version: ev.version,
    });
    expect(counterApp.ok).toBe(false);
    expect(counterApp.code).toBe('PREPARER_OR_CUSTODIAN_VARIANCE_APPROVAL_FORBIDDEN');

    const singleApp = engine.approveBoothVarianceAdj({
      event_id: ev.event_id,
      head_approver_id: '201',
      finance_approver_id: '201',
      quarantine_treatment_note: 'Quarantine 3 damaged',
      approved_at: '2026-11-17T18:12:00Z',
      expected_version: ev.version,
    });
    expect(singleApp.ok).toBe(false);
    expect(singleApp.code).toBe('DUAL_DISTINCT_APPROVERS_REQUIRED');

    ev = engine.approveBoothVarianceAdj({
      event_id: ev.event_id,
      head_approver_id: '201',
      finance_approver_id: '202',
      quarantine_treatment_note: 'Quarantine 3 damaged; charge custodian 2 missing',
      approved_at: '2026-11-17T18:15:00Z',
      expected_version: ev.version,
      idempotency_key: 'p23-var-app',
    }).data as BoothCloseoutRecord;
    expect(ev.variance_adj_status).toBe('approved_resolved');
    expect(ev.booth_custody_remaining_qty).toBe('0');

    const lookup = engine.lookupBoothCloseoutOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p23-var-app',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P23LookupResult).action_result).toBe('recovered');
  });
});
