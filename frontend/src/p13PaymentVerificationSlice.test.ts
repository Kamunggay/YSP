import { describe, expect, it } from 'vitest';
import {
  createP13PaymentVerificationEngine,
  P13_CONTEXT_STORAGE_KEY,
} from './p13PaymentVerificationSlice';
import type {
  BillableSalesOrder,
  OfficialReceiptRecord,
  P13LookupResult,
  PaymentContactTask,
  PaymentSubmission,
} from './p13PaymentVerificationSlice';

describe('p13PaymentVerificationSlice — Actual Payment Verification, OR & Line Credit', () => {
  it('starts strictly unseeded with empty accounts, orders, submissions, receipts, and zero metrics', () => {
    expect(P13_CONTEXT_STORAGE_KEY).toBe('ysp_p13_context');
    const engine = createP13PaymentVerificationEngine();
    const snap = engine.getSnapshot();

    expect(snap.official_accounts).toEqual([]);
    expect(snap.billable_orders).toEqual([]);
    expect(snap.payment_submissions).toEqual([]);
    expect(snap.official_receipts).toEqual([]);
    expect(snap.summary).toEqual({
      total_billed_due: '0.00',
      verified_credit_total: '0.00',
      release_coverage_total: '0.00',
      procurement_funding_total: '0.00',
      pending_holds_count: 0,
    });
  });

  it('blocks personal accounts, screenshot-only OR issuance, and duplicate external references', () => {
    const engine = createP13PaymentVerificationEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const personal = engine.registerOfficialPaymentAccount({
      channel: 'personal_unapproved',
      account_code: 'GCASH-PERSONAL',
      account_label: 'Personal Wallet',
      approved_by_finance_id: '201',
    });
    expect(personal.ok).toBe(false);
    expect(personal.code).toBe('UNAPPROVED_PAYMENT_CHANNEL');

    engine.registerOfficialPaymentAccount({
      channel: 'official_gcash',
      account_code: 'GCASH-CEBU-01',
      account_label: 'YSP Cebu Official GCash',
      approved_by_finance_id: '201',
    });

    const billSo = engine.registerBillableSalesOrder({
      so_reference: 'CEBU-SO-2026-000001',
      si_reference: 'CEBU-SI-2026-000001',
      buyer_name: 'Maria Santos',
      total_amount_due: '1000.00',
      available_merchandise_value: '600.00',
      backorder_procurement_cost: '400.00',
    }).data as BillableSalesOrder;

    // Submit screenshot only
    const sub1 = engine.submitPaymentEvidence({
      bill_so_id: billSo.bill_so_id,
      payer_name: 'Maria Santos',
      channel: 'official_gcash',
      account_code: 'GCASH-CEBU-01',
      external_reference: 'GC-771201',
      amount: '400.00',
      submitted_by_user_id: '101',
      evidence_kind: 'screenshot_only',
      received_at: '2026-11-02T08:00:00Z',
    }).data as PaymentSubmission;

    // Duplicate reference blocked across submissions
    const dup = engine.submitPaymentEvidence({
      bill_so_id: billSo.bill_so_id,
      payer_name: 'Maria Santos',
      channel: 'official_gcash',
      account_code: 'GCASH-CEBU-01',
      external_reference: 'GC-771201',
      amount: '400.00',
      submitted_by_user_id: '101',
      evidence_kind: 'actual_account_credit',
      received_at: '2026-11-02T08:05:00Z',
    });
    expect(dup.ok).toBe(false);
    expect(dup.code).toBe('DUPLICATE_PAYMENT_REFERENCE');

    // Screenshot alone cannot issue OR
    const orBlocked = engine.verifyPaymentAndIssueOr({
      submission_id: sub1.submission_id,
      verifier_user_id: '202',
      account_credit_confirmed: false,
      verified_at: '2026-11-02T08:10:00Z',
    });
    expect(orBlocked.ok).toBe(false);
    expect(orBlocked.code).toBe('SCREENSHOT_ALONE_INSUFFICIENT');

    // Self-verification blocked even when credit confirmed
    const selfVerify = engine.verifyPaymentAndIssueOr({
      submission_id: sub1.submission_id,
      verifier_user_id: '101',
      account_credit_confirmed: true,
      verified_at: '2026-11-02T08:12:00Z',
    });
    expect(selfVerify.ok).toBe(false);
    expect(selfVerify.code).toBe('INDEPENDENCE_REQUIRED');

    // Payment hold & buyer contact task
    const holdTask = engine.placePaymentOnHold({
      submission_id: sub1.submission_id,
      actor_user_id: '202',
      hold_reason: 'Awaiting GCash settlement confirmation in chapter ledger',
      flagged_at: '2026-11-02T08:15:00Z',
    }).data as PaymentContactTask;
    expect(holdTask.status).toBe('open');

    const contacted = engine.recordPaymentHoldContact({
      task_id: holdTask.task_id,
      actor_user_id: '101',
      contact_channel: 'SMS',
      contact_outcome: 'Sent bank posting notice to buyer',
      contacted_at: '2026-11-02T08:20:00Z',
    }).data as PaymentContactTask;
    expect(contacted.status).toBe('contacted');
  });

  it('accumulates distinct 400 + 600 installments into 1000 credit, allocates coverage vs procurement funding, and enforces independent reconciliation', () => {
    const engine = createP13PaymentVerificationEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    engine.registerOfficialPaymentAccount({
      channel: 'official_gcash',
      account_code: 'GCASH-CEBU-01',
      account_label: 'YSP Cebu Official GCash',
      approved_by_finance_id: '201',
    });
    engine.registerOfficialPaymentAccount({
      channel: 'cash',
      account_code: 'CASH-CEBU-DESK',
      account_label: 'YSP Chapter Cash Desk',
      approved_by_finance_id: '201',
    });

    const billSo = engine.registerBillableSalesOrder({
      so_reference: 'CEBU-SO-2026-000001',
      si_reference: 'CEBU-SI-2026-000001',
      buyer_name: 'Maria Santos',
      total_amount_due: '1000.00',
      available_merchandise_value: '600.00',
      backorder_procurement_cost: '400.00',
    }).data as BillableSalesOrder;

    const depSub = engine.submitPaymentEvidence({
      bill_so_id: billSo.bill_so_id,
      payer_name: 'Maria Santos',
      channel: 'official_gcash',
      account_code: 'GCASH-CEBU-01',
      external_reference: 'GC-771201',
      amount: '400.00',
      submitted_by_user_id: '101',
      evidence_kind: 'actual_account_credit',
      received_at: '2026-11-02T09:00:00Z',
    }).data as PaymentSubmission;

    const depOr = engine.verifyPaymentAndIssueOr({
      submission_id: depSub.submission_id,
      verifier_user_id: '202',
      account_credit_confirmed: true,
      verified_at: '2026-11-02T09:05:00Z',
      idempotency_key: 'p13-or-dep',
    }).data as OfficialReceiptRecord;
    expect(depOr.or_reference).toBe('CEBU-OR-2026-000001');
    expect(depOr.receipt_kind).toBe('downpayment');
    expect(engine.getSnapshot().summary.verified_credit_total).toBe('400.00');

    // Second distinct installment (PHP 600.00 cash)
    const finalSub = engine.submitPaymentEvidence({
      bill_so_id: billSo.bill_so_id,
      payer_name: 'Maria Santos',
      channel: 'cash',
      account_code: 'CASH-CEBU-DESK',
      external_reference: 'CASH-RCP-0902',
      amount: '600.00',
      submitted_by_user_id: '101',
      evidence_kind: 'physical_cash_counted',
      received_at: '2026-11-02T14:00:00Z',
    }).data as PaymentSubmission;

    const finalOr = engine.verifyPaymentAndIssueOr({
      submission_id: finalSub.submission_id,
      verifier_user_id: '202',
      account_credit_confirmed: true,
      verified_at: '2026-11-02T14:05:00Z',
      idempotency_key: 'p13-or-final',
    }).data as OfficialReceiptRecord;
    expect(finalOr.or_reference).toBe('CEBU-OR-2026-000002');
    expect(finalOr.receipt_kind).toBe('full_settlement');
    expect(engine.getSnapshot().summary.verified_credit_total).toBe('1000.00');

    // Allocate credit (1000 coverage exceeds check vs valid 600 coverage + 400 procurement funding)
    const updatedOrder = engine.getSnapshot().billable_orders[0] as BillableSalesOrder;
    const overAlloc = engine.allocateVerifiedCredit({
      bill_so_id: updatedOrder.bill_so_id,
      finance_user_id: '201',
      release_coverage_amount: '1001.00',
      procurement_funding_amount: '400.00',
      allocated_at: '2026-11-02T14:10:00Z',
      expected_version: updatedOrder.version,
    });
    expect(overAlloc.ok).toBe(false);
    expect(overAlloc.code).toBe('ALLOCATION_EXCEEDS_VERIFIED_CREDIT');

    const validAlloc = engine.allocateVerifiedCredit({
      bill_so_id: updatedOrder.bill_so_id,
      finance_user_id: '201',
      release_coverage_amount: '600.00',
      procurement_funding_amount: '400.00',
      allocated_at: '2026-11-02T14:12:00Z',
      expected_version: updatedOrder.version,
      idempotency_key: 'p13-alloc-1',
    });
    expect(validAlloc.ok).toBe(true);
    // Verified credit remains 1000.00 (no double-charging of deposit)
    expect(engine.getSnapshot().summary.verified_credit_total).toBe('1000.00');
    expect(engine.getSnapshot().summary.release_coverage_total).toBe('600.00');
    expect(engine.getSnapshot().summary.procurement_funding_total).toBe('400.00');

    // Reconciler cannot be the same verifier (202)
    const latestOrder = engine.getSnapshot().billable_orders[0] as BillableSalesOrder;
    const recBlocked = engine.confirmFinanceReconciliation({
      bill_so_id: latestOrder.bill_so_id,
      reconciler_user_id: '202',
      reconciled_at: '2026-11-02T16:00:00Z',
      expected_version: latestOrder.version,
    });
    expect(recBlocked.ok).toBe(false);
    expect(recBlocked.code).toBe('INDEPENDENCE_REQUIRED');

    const recOk = engine.confirmFinanceReconciliation({
      bill_so_id: latestOrder.bill_so_id,
      reconciler_user_id: '203',
      reconciled_at: '2026-11-02T16:05:00Z',
      expected_version: latestOrder.version,
      idempotency_key: 'p13-rec-1',
    });
    expect(recOk.ok).toBe(true);
    expect((recOk.data as BillableSalesOrder).reconciled).toBe(true);

    const lookup = engine.lookupPaymentOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p13-or-final',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P13LookupResult).action_result).toBe('recovered');
  });
});
