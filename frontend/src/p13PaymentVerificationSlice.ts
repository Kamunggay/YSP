import { computeDeterministicHash } from './canonicalHash';

export const P13_CONTEXT_STORAGE_KEY = 'ysp_p13_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type OfficialChannelKind = 'cash' | 'official_gcash' | 'personal_unapproved';

export type PaymentEvidenceKind =
  | 'screenshot_only'
  | 'actual_account_credit'
  | 'physical_cash_counted';

export type PaymentSubmissionStatus =
  | 'pending_verification'
  | 'payment_hold'
  | 'verified_or_issued';

export interface OfficialPaymentAccount {
  account_id: string;
  chapter_id: string;
  channel: 'cash' | 'official_gcash';
  account_code: string;
  account_label: string;
  approved_by_finance_id: string;
  version: number;
}

export interface BillableSalesOrder {
  bill_so_id: string;
  chapter_id: string;
  so_reference: string;
  si_reference: string;
  buyer_name: string;
  total_amount_due: string;
  available_merchandise_value: string;
  backorder_procurement_cost: string;
  verified_credit_total: string;
  remaining_balance_due: string;
  release_coverage_allocated: string;
  procurement_funding_designated: string;
  reconciled: boolean;
  reconciled_by_user_id: string | null;
  version: number;
}

export interface PaymentSubmission {
  submission_id: string;
  chapter_id: string;
  bill_so_id: string;
  so_reference: string;
  payer_name: string;
  channel: 'cash' | 'official_gcash';
  account_code: string;
  external_reference: string;
  amount: string;
  submitted_by_user_id: string;
  evidence_kind: PaymentEvidenceKind;
  received_at: string;
  status: PaymentSubmissionStatus;
  hold_reason: string | null;
  or_reference: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
}

export interface OfficialReceiptRecord {
  or_id: string;
  chapter_id: string;
  or_reference: string;
  bill_so_id: string;
  so_reference: string;
  si_reference: string;
  submission_id: string;
  receipt_kind: 'downpayment' | 'full_settlement';
  verified_amount: string;
  channel: 'cash' | 'official_gcash';
  account_code: string;
  external_reference: string;
  collector_user_id: string;
  verifier_user_id: string;
  verified_at: string;
}

export interface CreditAllocationSnapshot {
  allocation_id: string;
  bill_so_id: string;
  so_reference: string;
  release_coverage_amount: string;
  procurement_funding_amount: string;
  finance_user_id: string;
  allocated_at: string;
}

export interface PaymentContactTask {
  task_id: string;
  bill_so_id: string;
  submission_id: string;
  so_reference: string;
  hold_reason: string;
  status: 'open' | 'contacted';
  contact_channel: string | null;
  contact_outcome: string | null;
  contacted_by_user_id: string | null;
  contacted_at: string | null;
}

export interface P13HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P13SummaryMetrics {
  total_billed_due: string;
  verified_credit_total: string;
  release_coverage_total: string;
  procurement_funding_total: string;
  pending_holds_count: number;
}

export interface P13OperationLedgerEntry {
  operation_id: string;
  chapter_id: string;
  action_code: string;
  actor_user_id: string;
  target_id: string | null;
  idempotency_key: string;
  payload_fingerprint: string;
  http_status: number;
  code: string;
  message: string;
  snapshot: unknown;
}

export interface P13ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P13LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P13EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  official_accounts: ReadonlyArray<OfficialPaymentAccount>;
  billable_orders: ReadonlyArray<BillableSalesOrder>;
  payment_submissions: ReadonlyArray<PaymentSubmission>;
  official_receipts: ReadonlyArray<OfficialReceiptRecord>;
  allocations: ReadonlyArray<CreditAllocationSnapshot>;
  contact_tasks: ReadonlyArray<PaymentContactTask>;
  history: ReadonlyArray<P13HistoryEntry>;
  summary: P13SummaryMetrics;
  operation_ledger: ReadonlyArray<P13OperationLedgerEntry>;
  last_action: P13ActionResult | null;
}

export interface P13EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  official_accounts?: ReadonlyArray<OfficialPaymentAccount> | undefined;
  billable_orders?: ReadonlyArray<BillableSalesOrder> | undefined;
  payment_submissions?: ReadonlyArray<PaymentSubmission> | undefined;
  official_receipts?: ReadonlyArray<OfficialReceiptRecord> | undefined;
  allocations?: ReadonlyArray<CreditAllocationSnapshot> | undefined;
  contact_tasks?: ReadonlyArray<PaymentContactTask> | undefined;
  history?: ReadonlyArray<P13HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P13OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_or_ref_seq?: number | undefined;
}

export interface P13PaymentVerificationEngine {
  getSnapshot: () => P13EngineSnapshot;
  registerOfficialPaymentAccount: (input: {
    channel: OfficialChannelKind;
    account_code: string;
    account_label: string;
    approved_by_finance_id: string;
  }) => P13ActionResult<OfficialPaymentAccount>;
  registerBillableSalesOrder: (input: {
    so_reference: string;
    si_reference: string;
    buyer_name: string;
    total_amount_due: string;
    available_merchandise_value: string;
    backorder_procurement_cost: string;
  }) => P13ActionResult<BillableSalesOrder>;
  submitPaymentEvidence: (input: {
    bill_so_id: string;
    payer_name: string;
    channel: OfficialChannelKind;
    account_code: string;
    external_reference: string;
    amount: string;
    submitted_by_user_id: string;
    evidence_kind: PaymentEvidenceKind;
    received_at: string;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<PaymentSubmission>;
  verifyPaymentAndIssueOr: (input: {
    submission_id: string;
    verifier_user_id: string;
    account_credit_confirmed: boolean;
    verified_at: string;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<OfficialReceiptRecord>;
  placePaymentOnHold: (input: {
    submission_id: string;
    actor_user_id: string;
    hold_reason: string;
    flagged_at: string;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<PaymentContactTask>;
  recordPaymentHoldContact: (input: {
    task_id: string;
    actor_user_id: string;
    contact_channel: string;
    contact_outcome: string;
    contacted_at: string;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<PaymentContactTask>;
  allocateVerifiedCredit: (input: {
    bill_so_id: string;
    finance_user_id: string;
    release_coverage_amount: string;
    procurement_funding_amount: string;
    allocated_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<CreditAllocationSnapshot>;
  confirmFinanceReconciliation: (input: {
    bill_so_id: string;
    reconciler_user_id: string;
    reconciled_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P13ActionResult<BillableSalesOrder>;
  lookupPaymentOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P13ActionResult<P13LookupResult>;
}

function readStoredP13Options(): P13EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P13_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P13EngineOptions;
  } catch {
    return undefined;
  }
}

function toCents(amount: string): bigint {
  const [whole = '0', frac = '00'] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const rem = abs % 100n;
  return `${negative ? '-' : ''}${whole.toString()}.${rem.toString().padStart(2, '0')}`;
}

export function createP13PaymentVerificationEngine(
  options?: P13EngineOptions
): P13PaymentVerificationEngine {
  const seed = options ?? readStoredP13Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 13000;
  let orRefSeq = seed.next_or_ref_seq ?? 0;

  const officialAccounts: OfficialPaymentAccount[] = (seed.official_accounts ?? []).map((a) =>
    structuredClone(a)
  );
  const billableOrders: BillableSalesOrder[] = (seed.billable_orders ?? []).map((b) =>
    structuredClone(b)
  );
  const paymentSubmissions: PaymentSubmission[] = (seed.payment_submissions ?? []).map((p) =>
    structuredClone(p)
  );
  const officialReceipts: OfficialReceiptRecord[] = (seed.official_receipts ?? []).map((r) =>
    structuredClone(r)
  );
  const allocations: CreditAllocationSnapshot[] = (seed.allocations ?? []).map((al) =>
    structuredClone(al)
  );
  const contactTasks: PaymentContactTask[] = (seed.contact_tasks ?? []).map((t) =>
    structuredClone(t)
  );
  const history: P13HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P13OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P13ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P13${String(seq).padStart(19, '0')}`;
  }

  function nextOrRef(): string {
    orRefSeq += 1;
    return `${chapterPrefix}-OR-2026-${String(orRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P13SummaryMetrics {
    let billedCents = 0n;
    let verifiedCents = 0n;
    let coverageCents = 0n;
    let fundingCents = 0n;

    for (const order of billableOrders) {
      billedCents += toCents(order.total_amount_due);
      verifiedCents += toCents(order.verified_credit_total);
      coverageCents += toCents(order.release_coverage_allocated);
      fundingCents += toCents(order.procurement_funding_designated);
    }

    const pendingHoldsCount = paymentSubmissions.filter(
      (s) => s.status === 'pending_verification' || s.status === 'payment_hold'
    ).length;

    return {
      total_billed_due: fromCents(billedCents),
      verified_credit_total: fromCents(verifiedCents),
      release_coverage_total: fromCents(coverageCents),
      procurement_funding_total: fromCents(fundingCents),
      pending_holds_count: pendingHoldsCount,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P13_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          official_accounts: officialAccounts,
          billable_orders: billableOrders,
          payment_submissions: paymentSubmissions,
          official_receipts: officialReceipts,
          allocations,
          contact_tasks: contactTasks,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_or_ref_seq: orRefSeq,
        })
      );
    } catch {
      // Ignore quota issues cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P13ActionResult<T> {
    const res: P13ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function recordLedgerAndPersist<T>(
    actionCode: string,
    actorUserId: string,
    targetId: string | null,
    idempotencyKey: string | undefined,
    payload: unknown,
    httpStatus: number,
    code: string,
    message: string,
    data: T
  ): P13ActionResult<T> {
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const fingerprint = computeDeterministicHash({
        chapter_id: chapterId,
        action_code: actionCode,
        payload,
      });
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: actionCode,
        actor_user_id: actorUserId,
        target_id: targetId,
        idempotency_key: idempotencyKey.trim(),
        payload_fingerprint: fingerprint,
        http_status: httpStatus,
        code,
        message,
        snapshot: structuredClone(data),
      });
    }
    const res: P13ActionResult<T> = {
      ok: true,
      http_status: httpStatus,
      code,
      message,
      replayed: false,
      data,
    };
    lastAction = res;
    persistSnapshot();
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P13ActionResult<T> | null {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) return null;
    const trimmed = idempotencyKey.trim();
    const existing = operationLedger.find(
      (o) => o.chapter_id === chapterId && o.action_code === actionCode && o.idempotency_key === trimmed
    );
    if (!existing) return null;
    const fingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      payload,
    });
    if (existing.payload_fingerprint !== fingerprint) {
      return fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        `Idempotency key "${trimmed}" cannot be reused for a modified payload.`
      );
    }
    const replayRes: P13ActionResult<T> = {
      ok: true,
      http_status: existing.http_status,
      code: existing.code,
      message: `${existing.message} (idempotent replay)`,
      replayed: true,
      data: structuredClone(existing.snapshot) as T,
    };
    lastAction = replayRes;
    return replayRes;
  }

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        official_accounts: officialAccounts.map((a) => structuredClone(a)),
        billable_orders: billableOrders.map((b) => structuredClone(b)),
        payment_submissions: paymentSubmissions.map((p) => structuredClone(p)),
        official_receipts: officialReceipts.map((r) => structuredClone(r)),
        allocations: allocations.map((al) => structuredClone(al)),
        contact_tasks: contactTasks.map((t) => structuredClone(t)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerOfficialPaymentAccount(input) {
      if (input.channel === 'personal_unapproved') {
        return fail(
          422,
          'UNAPPROVED_PAYMENT_CHANNEL',
          'Personal or unapproved collection accounts are forbidden; use chapter cash or approved official GCash.'
        );
      }
      const code = input.account_code.trim();
      const label = input.account_label.trim();
      const financeId = input.approved_by_finance_id.trim();
      if (!code || !label || !financeId) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Account code, label, and Finance approver ID are required.');
      }

      const existing = officialAccounts.find((a) => a.account_code === code);
      const record: OfficialPaymentAccount = {
        account_id: existing ? existing.account_id : nextId(),
        chapter_id: chapterId,
        channel: input.channel,
        account_code: code,
        account_label: label,
        approved_by_finance_id: financeId,
        version: existing ? existing.version + 1 : 1,
      };

      if (existing) {
        officialAccounts[officialAccounts.indexOf(existing)] = record;
      } else {
        officialAccounts.push(record);
      }

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'OFFICIAL_ACCOUNT_REGISTERED',
        message: `Registered Finance-approved ${input.channel === 'cash' ? 'Cash Counter' : 'Official GCash'} account "${code}".`,
        data: structuredClone(record),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P13ActionResult<OfficialPaymentAccount>;
    },

    registerBillableSalesOrder(input) {
      const soRef = input.so_reference.trim();
      const siRef = input.si_reference.trim();
      const buyer = input.buyer_name.trim();
      if (!soRef || !siRef || !buyer) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'SO reference, SI reference, and buyer name are required.');
      }
      if (
        !MONEY_PATTERN.test(input.total_amount_due.trim()) ||
        !MONEY_PATTERN.test(input.available_merchandise_value.trim()) ||
        !MONEY_PATTERN.test(input.backorder_procurement_cost.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Amounts must use exact two-decimal format (e.g. 1000.00).');
      }

      const existing = billableOrders.find((b) => b.so_reference === soRef);
      if (existing) {
        return fail(409, 'DUPLICATE_SO_REFERENCE', `Billable sales order "${soRef}" is already registered.`);
      }

      const record: BillableSalesOrder = {
        bill_so_id: nextId(),
        chapter_id: chapterId,
        so_reference: soRef,
        si_reference: siRef,
        buyer_name: buyer,
        total_amount_due: input.total_amount_due.trim(),
        available_merchandise_value: input.available_merchandise_value.trim(),
        backorder_procurement_cost: input.backorder_procurement_cost.trim(),
        verified_credit_total: '0.00',
        remaining_balance_due: input.total_amount_due.trim(),
        release_coverage_allocated: '0.00',
        procurement_funding_designated: '0.00',
        reconciled: false,
        reconciled_by_user_id: null,
        version: 1,
      };
      billableOrders.push(record);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'BILLABLE_SO_REGISTERED',
        message: `Registered ${soRef} (${siRef}) — PHP ${record.total_amount_due} total due.`,
        data: structuredClone(record),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P13ActionResult<BillableSalesOrder>;
    },

    submitPaymentEvidence(input) {
      const replay = checkIdempotency<PaymentSubmission>('p13.submit_payment', input.idempotency_key, input);
      if (replay) return replay;

      if (input.channel === 'personal_unapproved') {
        return fail(
          422,
          'UNAPPROVED_PAYMENT_CHANNEL',
          'Payment rejected: unapproved personal channels cannot be recorded as chapter funds.'
        );
      }

      const payer = input.payer_name.trim();
      const accountCode = input.account_code.trim();
      const extRef = input.external_reference.trim();
      const actorId = input.submitted_by_user_id.trim();
      const receivedAt = input.received_at.trim();

      if (!payer || !accountCode || !extRef || !actorId || !UTC_INSTANT_PATTERN.test(receivedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Payer, account code, external reference, collector ID, and UTC timestamp are required.');
      }
      if (!MONEY_PATTERN.test(input.amount.trim()) || toCents(input.amount.trim()) <= 0n) {
        return fail(422, 'INVALID_MONEY_AMOUNT', 'Payment amount must be greater than 0.00.');
      }

      const account = officialAccounts.find(
        (a) => a.account_code === accountCode && a.channel === input.channel
      );
      if (!account) {
        return fail(
          422,
          'UNAPPROVED_PAYMENT_CHANNEL',
          `Account "${accountCode}" is not an approved ${input.channel} destination for this chapter.`
        );
      }

      const order = billableOrders.find((b) => b.bill_so_id === input.bill_so_id);
      if (!order) {
        return fail(404, 'RESOURCE_NOT_FOUND', 'Target billable sales order not found.');
      }

      // Duplicate account+external_reference guard across ALL submissions/chapters
      const duplicate = paymentSubmissions.find(
        (p) => p.account_code.toLowerCase() === accountCode.toLowerCase() &&
               p.external_reference.toLowerCase() === extRef.toLowerCase()
      );
      if (duplicate) {
        return fail(
          409,
          'DUPLICATE_PAYMENT_REFERENCE',
          `Transaction reference "${extRef}" on account "${accountCode}" has already been submitted and cannot become new money twice.`
        );
      }

      const submission: PaymentSubmission = {
        submission_id: nextId(),
        chapter_id: chapterId,
        bill_so_id: order.bill_so_id,
        so_reference: order.so_reference,
        payer_name: payer,
        channel: input.channel,
        account_code: accountCode,
        external_reference: extRef,
        amount: input.amount.trim(),
        submitted_by_user_id: actorId,
        evidence_kind: input.evidence_kind,
        received_at: receivedAt,
        status: 'pending_verification',
        hold_reason: null,
        or_reference: null,
        verified_by_user_id: null,
        verified_at: null,
      };

      paymentSubmissions.push(submission);
      history.push({
        event_id: nextUlid(),
        target_id: submission.submission_id,
        action: 'submitPaymentEvidence',
        actor_user_id: actorId,
        reason: `${accountCode} / ${extRef}`,
        timestamp: receivedAt,
      });

      return recordLedgerAndPersist(
        'p13.submit_payment',
        actorId,
        submission.submission_id,
        input.idempotency_key,
        input,
        201,
        'PAYMENT_EVIDENCE_STAGED',
        `Recorded pending payment evidence (${extRef}, PHP ${submission.amount}). Awaiting Finance verification before OR issuance.`,
        submission
      );
    },

    verifyPaymentAndIssueOr(input) {
      const replay = checkIdempotency<OfficialReceiptRecord>('p13.verify_or', input.idempotency_key, input);
      if (replay) return replay;

      const verifierId = input.verifier_user_id.trim();
      const verifiedAt = input.verified_at.trim();
      if (!verifierId || !UTC_INSTANT_PATTERN.test(verifiedAt)) {
        return fail(422, 'INVALID_INPUT', 'Verifier ID and valid UTC verification timestamp are required.');
      }

      const sub = paymentSubmissions.find((p) => p.submission_id === input.submission_id);
      if (!sub) return fail(404, 'RESOURCE_NOT_FOUND', 'Payment submission not found.');
      if (sub.status === 'verified_or_issued') {
        return fail(409, 'OR_ALREADY_ISSUED', `Official Receipt ${sub.or_reference} has already been issued for this submission.`);
      }
      if (sub.evidence_kind === 'screenshot_only' && !input.account_credit_confirmed) {
        return fail(
          409,
          'SCREENSHOT_ALONE_INSUFFICIENT',
          'A buyer screenshot or assertion alone cannot authorize OR issuance; confirm actual official account credit first.'
        );
      }
      if (verifierId === sub.submitted_by_user_id) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'Collecting officer cannot independently verify their own payment submission.'
        );
      }

      const order = billableOrders.find((b) => b.bill_so_id === sub.bill_so_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Parent billable sales order not found.');

      const subCents = toCents(sub.amount);
      const prevCreditCents = toCents(order.verified_credit_total);
      const dueTotalCents = toCents(order.total_amount_due);
      const nextCreditCents = prevCreditCents + subCents;
      const nextRemainingCents = dueTotalCents > nextCreditCents ? dueTotalCents - nextCreditCents : 0n;

      const receiptKind: 'downpayment' | 'full_settlement' =
        nextRemainingCents === 0n ? 'full_settlement' : 'downpayment';

      const orRef = nextOrRef();
      const orRecord: OfficialReceiptRecord = {
        or_id: nextId(),
        chapter_id: chapterId,
        or_reference: orRef,
        bill_so_id: order.bill_so_id,
        so_reference: order.so_reference,
        si_reference: order.si_reference,
        submission_id: sub.submission_id,
        receipt_kind: receiptKind,
        verified_amount: sub.amount,
        channel: sub.channel,
        account_code: sub.account_code,
        external_reference: sub.external_reference,
        collector_user_id: sub.submitted_by_user_id,
        verifier_user_id: verifierId,
        verified_at: verifiedAt,
      };

      officialReceipts.push(orRecord);
      sub.status = 'verified_or_issued';
      sub.hold_reason = null;
      sub.or_reference = orRef;
      sub.verified_by_user_id = verifierId;
      sub.verified_at = verifiedAt;

      order.verified_credit_total = fromCents(nextCreditCents);
      order.remaining_balance_due = fromCents(nextRemainingCents);
      order.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: orRecord.or_id,
        action: 'verifyPaymentAndIssueOr',
        actor_user_id: verifierId,
        reason: `${orRef} (${receiptKind})`,
        timestamp: verifiedAt,
      });

      return recordLedgerAndPersist(
        'p13.verify_or',
        verifierId,
        orRecord.or_id,
        input.idempotency_key,
        input,
        201,
        'OR_ISSUED',
        `Verified PHP ${sub.amount} and issued ${receiptKind === 'full_settlement' ? 'Full Settlement' : 'Downpayment'} OR ${orRef} (Cumulative credit: PHP ${order.verified_credit_total}).`,
        orRecord
      );
    },

    placePaymentOnHold(input) {
      const replay = checkIdempotency<PaymentContactTask>('p13.place_hold', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const reason = input.hold_reason.trim();
      const flaggedAt = input.flagged_at.trim();
      if (!actorId || !reason || !UTC_INSTANT_PATTERN.test(flaggedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID, hold reason, and UTC timestamp are required.');
      }

      const sub = paymentSubmissions.find((p) => p.submission_id === input.submission_id);
      if (!sub) return fail(404, 'RESOURCE_NOT_FOUND', 'Payment submission not found.');
      if (sub.status === 'verified_or_issued') {
        return fail(409, 'ALREADY_VERIFIED', 'Cannot place an already verified OR payment on hold.');
      }

      sub.status = 'payment_hold';
      sub.hold_reason = reason;

      const task: PaymentContactTask = {
        task_id: nextId(),
        bill_so_id: sub.bill_so_id,
        submission_id: sub.submission_id,
        so_reference: sub.so_reference,
        hold_reason: reason,
        status: 'open',
        contact_channel: null,
        contact_outcome: null,
        contacted_by_user_id: null,
        contacted_at: null,
      };
      contactTasks.push(task);

      history.push({
        event_id: nextUlid(),
        target_id: task.task_id,
        action: 'placePaymentOnHold',
        actor_user_id: actorId,
        reason,
        timestamp: flaggedAt,
      });

      return recordLedgerAndPersist(
        'p13.place_hold',
        actorId,
        task.task_id,
        input.idempotency_key,
        input,
        200,
        'PAYMENT_PLACED_ON_HOLD',
        `Payment placed on hold (${reason}); Sales buyer notification task #${task.task_id} opened.`,
        task
      );
    },

    recordPaymentHoldContact(input) {
      const replay = checkIdempotency<PaymentContactTask>('p13.hold_contact', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const channel = input.contact_channel.trim();
      const outcome = input.contact_outcome.trim();
      const contactedAt = input.contacted_at.trim();
      if (!actorId || !channel || !outcome || !UTC_INSTANT_PATTERN.test(contactedAt)) {
        return fail(422, 'INVALID_INPUT', 'Officer ID, channel, outcome, and UTC contact timestamp are required.');
      }

      const task = contactTasks.find((t) => t.task_id === input.task_id);
      if (!task) return fail(404, 'RESOURCE_NOT_FOUND', 'Payment-hold contact task not found.');

      task.status = 'contacted';
      task.contact_channel = channel;
      task.contact_outcome = outcome;
      task.contacted_by_user_id = actorId;
      task.contacted_at = contactedAt;

      history.push({
        event_id: nextUlid(),
        target_id: task.task_id,
        action: 'recordPaymentHoldContact',
        actor_user_id: actorId,
        reason: `${channel}: ${outcome}`,
        timestamp: contactedAt,
      });

      return recordLedgerAndPersist(
        'p13.hold_contact',
        actorId,
        task.task_id,
        input.idempotency_key,
        input,
        200,
        'HOLD_CONTACT_RECORDED',
        `Recorded buyer contact outcome via ${channel} for ${task.so_reference}.`,
        task
      );
    },

    allocateVerifiedCredit(input) {
      const replay = checkIdempotency<CreditAllocationSnapshot>('p13.allocate_credit', input.idempotency_key, input);
      if (replay) return replay;

      const financeId = input.finance_user_id.trim();
      const allocatedAt = input.allocated_at.trim();
      if (!financeId || !UTC_INSTANT_PATTERN.test(allocatedAt)) {
        return fail(422, 'INVALID_INPUT', 'Finance officer ID and UTC allocation timestamp are required.');
      }
      if (
        !MONEY_PATTERN.test(input.release_coverage_amount.trim()) ||
        !MONEY_PATTERN.test(input.procurement_funding_amount.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Allocation amounts must use exact two-decimal format.');
      }

      const order = billableOrders.find((b) => b.bill_so_id === input.bill_so_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Billable sales order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Billable order version changed before allocation completed.');
      }

      const verifiedCents = toCents(order.verified_credit_total);
      const releaseCents = toCents(input.release_coverage_amount.trim());
      const fundingCents = toCents(input.procurement_funding_amount.trim());

      if (releaseCents > verifiedCents) {
        return fail(
          409,
          'ALLOCATION_EXCEEDS_VERIFIED_CREDIT',
          `Release coverage PHP ${input.release_coverage_amount} exceeds verified customer credit PHP ${order.verified_credit_total}.`
        );
      }
      if (fundingCents > verifiedCents) {
        return fail(
          409,
          'ALLOCATION_EXCEEDS_VERIFIED_CREDIT',
          `Procurement funding designation PHP ${input.procurement_funding_amount} exceeds verified customer credit PHP ${order.verified_credit_total}.`
        );
      }

      order.release_coverage_allocated = input.release_coverage_amount.trim();
      order.procurement_funding_designated = input.procurement_funding_amount.trim();
      order.version += 1;

      const snap: CreditAllocationSnapshot = {
        allocation_id: nextId(),
        bill_so_id: order.bill_so_id,
        so_reference: order.so_reference,
        release_coverage_amount: order.release_coverage_allocated,
        procurement_funding_amount: order.procurement_funding_designated,
        finance_user_id: financeId,
        allocated_at: allocatedAt,
      };
      allocations.push(snap);

      history.push({
        event_id: nextUlid(),
        target_id: snap.allocation_id,
        action: 'allocateVerifiedCredit',
        actor_user_id: financeId,
        reason: `Coverage ${snap.release_coverage_amount}; Funding ${snap.procurement_funding_amount}`,
        timestamp: allocatedAt,
      });

      return recordLedgerAndPersist(
        'p13.allocate_credit',
        financeId,
        snap.allocation_id,
        input.idempotency_key,
        input,
        200,
        'CREDIT_ALLOCATED',
        `Annotated PHP ${snap.release_coverage_amount} release coverage and PHP ${snap.procurement_funding_amount} procurement funding without altering verified credit PHP ${order.verified_credit_total}.`,
        snap
      );
    },

    confirmFinanceReconciliation(input) {
      const replay = checkIdempotency<BillableSalesOrder>('p13.reconcile', input.idempotency_key, input);
      if (replay) return replay;

      const reconcilerId = input.reconciler_user_id.trim();
      const reconciledAt = input.reconciled_at.trim();
      if (!reconcilerId || !UTC_INSTANT_PATTERN.test(reconciledAt)) {
        return fail(422, 'INVALID_INPUT', 'Independent reconciler ID and UTC timestamp are required.');
      }

      const order = billableOrders.find((b) => b.bill_so_id === input.bill_so_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Billable sales order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Billable order version changed before reconciliation.');
      }

      const orderOrs = officialReceipts.filter((r) => r.bill_so_id === order.bill_so_id);
      if (orderOrs.length === 0) {
        return fail(409, 'NO_VERIFIED_RECEIPTS', 'Cannot reconcile an order with zero issued Official Receipts.');
      }
      if (orderOrs.some((r) => r.verifier_user_id === reconcilerId)) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'An officer who verified payment receipts for this order cannot perform independent reconciliation.'
        );
      }

      order.reconciled = true;
      order.reconciled_by_user_id = reconcilerId;
      order.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: order.bill_so_id,
        action: 'confirmFinanceReconciliation',
        actor_user_id: reconcilerId,
        reason: order.so_reference,
        timestamp: reconciledAt,
      });

      return recordLedgerAndPersist(
        'p13.reconcile',
        reconcilerId,
        order.bill_so_id,
        input.idempotency_key,
        input,
        200,
        'FINANCE_RECONCILED',
        `Completed independent reconciliation review for ${order.so_reference} across ${orderOrs.length} Official Receipt(s).`,
        order
      );
    },

    lookupPaymentOperation(input) {
      if (input.chapter_id !== chapterId) {
        return {
          ok: false,
          http_status: 403,
          code: 'FORBIDDEN_SCOPE',
          message: 'Operation lookup rejected for foreign chapter scope.',
          data: {
            action_result: 'forbidden',
            input_policy: 'preserve',
            lookup_state: null,
            operation_id: null,
            idempotency_key: null,
            recovered_snapshot: null,
          },
        };
      }

      const match =
        input.query_type === 'by_key'
          ? operationLedger.find(
              (o) =>
                o.idempotency_key === (input.idempotency_key ?? '').trim() &&
                (!input.action_code || o.action_code === input.action_code)
            )
          : operationLedger.find((o) => o.operation_id === (input.operation_id ?? '').trim());

      if (!match) {
        return {
          ok: false,
          http_status: 404,
          code: 'OPERATION_NOT_VISIBLE',
          message: 'No committed operation found for the supplied identifier; preserve inputs.',
          data: {
            action_result: 'uncertain',
            input_policy: 'preserve',
            lookup_state: 'pending_or_not_visible',
            operation_id: input.operation_id ?? null,
            idempotency_key: input.idempotency_key ?? null,
            recovered_snapshot: null,
          },
        };
      }

      return {
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered durable result ${match.operation_id} (${match.code}).`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: match.operation_id,
          idempotency_key: match.idempotency_key,
          recovered_snapshot: structuredClone(match.snapshot),
        },
      };
    },
  };
}
