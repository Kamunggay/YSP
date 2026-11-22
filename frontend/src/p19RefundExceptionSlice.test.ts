import { describe, expect, it } from 'vitest';
import {
  createP19RefundExceptionEngine,
  P19_CONTEXT_STORAGE_KEY,
} from './p19RefundExceptionSlice';
import type {
  FundedExceptionRecord,
  OrderFinancialContext,
  P19LookupResult,
  RefundCaseRecord,
  UnequalExchangeRecord,
} from './p19RefundExceptionSlice';

describe('p19RefundExceptionSlice — Refund Execution, Unequal Exchange & Funded Exceptions', () => {
  it('starts strictly unseeded with empty financial contexts, refunds, exchanges, exceptions, and zero balances', () => {
    expect(P19_CONTEXT_STORAGE_KEY).toBe('ysp_p19_context');
    const engine = createP19RefundExceptionEngine();
    const snap = engine.getSnapshot();

    expect(snap.financial_contexts).toEqual([]);
    expect(snap.refund_cases).toEqual([]);
    expect(snap.exchange_cases).toEqual([]);
    expect(snap.funded_exceptions).toEqual([]);
    expect(snap.summary).toEqual({
      net_verified_credit: '0.00',
      approved_unexecuted_refunds: '0.00',
      executed_refunds_total: '0.00',
      additional_exchange_collected: '0.00',
      open_funded_obligations: 0,
    });
  });

  it('keeps approved refunds distinct from actual payout execution until verified payout posts once', () => {
    const engine = createP19RefundExceptionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const ctx = engine.registerOrderFinancialContext({
      context_kind: 'track1_so',
      source_reference: 'CEBU-SO-2026-000001',
      or_reference: 'CEBU-OR-2026-000001',
      adj_reference: 'CEBU-ADJ-CLM-2026-000001',
      buyer_name: 'Maria Santos',
      verified_credit_amount: '1000.00',
      consumed_release_coverage: '250.00', // leaves 750.00 refundable credit
      linked_po_reference: null,
      open_po_committed_amount: '0.00',
      reserved_stock_qty: '0',
    }).data as OrderFinancialContext;
    expect(ctx.available_refundable_credit).toBe('750.00');

    // Refund exceeding unconsumed 750.00 blocked
    const overRef = engine.approveCustomerRefund({
      context_id: ctx.context_id,
      preparer_user_id: '101',
      finance_approver_id: '202',
      refund_amount: '800.00',
      approval_reason: 'Exceeds unconsumed credit',
      approved_at: '2026-11-09T08:00:00Z',
    });
    expect(overRef.ok).toBe(false);
    expect(overRef.code).toBe('REFUND_EXCEEDS_AVAILABLE_CREDIT');

    // Approve PHP 500.00 -> net credit stays 750.00 and executed total stays 0.00 until actual payout!
    let refund = engine.approveCustomerRefund({
      context_id: ctx.context_id,
      preparer_user_id: '101',
      finance_approver_id: '202',
      refund_amount: '500.00',
      approval_reason: 'Approved return refund',
      approved_at: '2026-11-09T08:05:00Z',
      idempotency_key: 'p19-app-ref',
    }).data as RefundCaseRecord;
    expect(refund.status).toBe('approved_pending_execution');
    expect(engine.getSnapshot().summary.net_verified_credit).toBe('750.00');
    expect(engine.getSnapshot().summary.approved_unexecuted_refunds).toBe('500.00');
    expect(engine.getSnapshot().summary.executed_refunds_total).toBe('0.00');

    // Execute actual payout once -> adjusts net credit to 250.00
    refund = engine.executeVerifiedRefund({
      refund_id: refund.refund_id,
      executed_by_user_id: '203',
      payout_channel: 'official_gcash',
      payout_reference: 'GC-PAYOUT-9901',
      evidence_hash: 'a'.repeat(64),
      executed_at: '2026-11-09T09:00:00Z',
      expected_version: refund.version,
      idempotency_key: 'p19-exec-ref',
    }).data as RefundCaseRecord;
    expect(refund.status).toBe('executed');
    expect(engine.getSnapshot().summary.net_verified_credit).toBe('250.00');
    expect(engine.getSnapshot().summary.approved_unexecuted_refunds).toBe('0.00');
    expect(engine.getSnapshot().summary.executed_refunds_total).toBe('500.00');
  });

  it('enforces unequal exchange payment gate without SO fabrication and preserves open PO/deposit obligations on funded exceptions', () => {
    const engine = createP19RefundExceptionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const boothCtx = engine.registerOrderFinancialContext({
      context_kind: 'booth_or',
      source_reference: 'BOOTH-CEBU-2026',
      or_reference: 'CEBU-OR-BOOTH-0001',
      adj_reference: 'CEBU-ADJ-CLM-2026-000002',
      buyer_name: 'Juan Dela Cruz',
      verified_credit_amount: '250.00',
      consumed_release_coverage: '250.00',
      linked_po_reference: null,
      open_po_committed_amount: '0.00',
      reserved_stock_qty: '0',
    }).data as OrderFinancialContext;

    // Booth claim cannot fabricate a new Track 1 SO for unequal exchange
    const fabBlocked = engine.prepareUnequalExchange({
      context_id: boothCtx.context_id,
      actor_user_id: '101',
      returned_item_value: '250.00',
      replacement_item_value: '400.00',
      attempt_new_so_fabrication: true,
      prepared_at: '2026-11-10T08:00:00Z',
    });
    expect(fabBlocked.ok).toBe(false);
    expect(fabBlocked.code).toBe('BOOTH_CLAIM_SO_FABRICATION_FORBIDDEN');

    let ex = engine.prepareUnequalExchange({
      context_id: boothCtx.context_id,
      actor_user_id: '101',
      returned_item_value: '250.00',
      replacement_item_value: '400.00',
      prepared_at: '2026-11-10T08:05:00Z',
    }).data as UnequalExchangeRecord;
    expect(ex.additional_amount_due).toBe('150.00');

    // Releasing before additional difference verified OR blocked
    const unpaidRel = engine.releaseUnequalExchangeReplacement({
      exchange_id: ex.exchange_id,
      actor_user_id: '301',
      signature_hash: 'b'.repeat(64),
      released_at: '2026-11-10T08:10:00Z',
      expected_version: ex.version,
    });
    expect(unpaidRel.ok).toBe(false);
    expect(unpaidRel.code).toBe('ADDITIONAL_VERIFIED_PAYMENT_REQUIRED');

    ex = engine.verifyAdditionalExchangePayment({
      exchange_id: ex.exchange_id,
      verifier_user_id: '202',
      additional_or_reference: 'CEBU-OR-2026-000050',
      verified_at: '2026-11-10T08:15:00Z',
      expected_version: ex.version,
    }).data as UnequalExchangeRecord;

    ex = engine.releaseUnequalExchangeReplacement({
      exchange_id: ex.exchange_id,
      actor_user_id: '301',
      signature_hash: 'b'.repeat(64),
      released_at: '2026-11-10T08:20:00Z',
      expected_version: ex.version,
    }).data as UnequalExchangeRecord;
    expect(ex.status).toBe('completed');
    expect(engine.getSnapshot().summary.additional_exchange_collected).toBe('150.00');

    // Funded cancellation with open PO (AC-20)
    const fundedCtx = engine.registerOrderFinancialContext({
      context_kind: 'track1_so',
      source_reference: 'CEBU-SO-2026-000009',
      or_reference: 'CEBU-OR-2026-000009',
      adj_reference: 'CEBU-ADJ-EXC-2026-000001',
      buyer_name: 'Carlos Reyes',
      verified_credit_amount: '400.00',
      consumed_release_coverage: '0.00',
      linked_po_reference: 'CEBU-PO-2026-000004',
      open_po_committed_amount: '400.00',
      reserved_stock_qty: '3',
    }).data as OrderFinancialContext;

    const autoForfeit = engine.initiateFundedExceptionCase({
      context_id: fundedCtx.context_id,
      exception_kind: 'funded_cancellation',
      initiated_by_user_id: '101',
      attempt_auto_forfeit_or_release: true,
      initiated_at: '2026-11-10T09:00:00Z',
    });
    expect(autoForfeit.ok).toBe(false);
    expect(autoForfeit.code).toBe('AUTOMATIC_FORFEITURE_OR_RELEASE_FORBIDDEN');

    let exc = engine.initiateFundedExceptionCase({
      context_id: fundedCtx.context_id,
      exception_kind: 'funded_cancellation',
      initiated_by_user_id: '101',
      initiated_at: '2026-11-10T09:05:00Z',
    }).data as FundedExceptionRecord;
    expect(engine.getSnapshot().summary.open_funded_obligations).toBe(1);

    exc = engine.resolveFundedExceptionObligations({
      exception_id: exc.exception_id,
      approver_user_id: '202',
      po_resolution: 'Retain PO as chapter safety stock via approved amendment',
      stock_resolution: 'Transfer reserved 3 units cleanly to available pool',
      fund_resolution: 'Approve PHP 400.00 verified buyer refund execution',
      resolution_reason: 'Mutual cancellation under chapter funded exception policy',
      resolved_at: '2026-11-10T10:00:00Z',
      expected_version: exc.version,
      idempotency_key: 'p19-resolve-exc',
    }).data as FundedExceptionRecord;
    expect(exc.status).toBe('resolved');
    expect(engine.getSnapshot().summary.open_funded_obligations).toBe(0);

    const lookup = engine.lookupRefundExceptionOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p19-resolve-exc',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P19LookupResult).action_result).toBe('recovered');
  });
});
