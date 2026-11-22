import { computeDeterministicHash } from './canonicalHash';

export const P19_CONTEXT_STORAGE_KEY = 'ysp_p19_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type FinancialContextKind = 'track1_so' | 'booth_or';

export type FundedExceptionKind =
  | 'funded_cancellation'
  | 'supplier_failure'
  | 'excess_cost'
  | 'overdue_pickup';

export interface OrderFinancialContext {
  context_id: string;
  chapter_id: string;
  context_kind: FinancialContextKind;
  source_reference: string;
  or_reference: string;
  adj_reference: string;
  buyer_name: string;
  verified_credit_amount: string;
  consumed_release_coverage: string;
  available_refundable_credit: string;
  approved_unexecuted_refund_total: string;
  executed_refund_total: string;
  linked_po_reference: string | null;
  open_po_committed_amount: string;
  reserved_stock_qty: string;
  version: number;
}

export interface RefundCaseRecord {
  refund_id: string;
  context_id: string;
  source_reference: string;
  adj_reference: string;
  preparer_user_id: string;
  finance_approver_id: string;
  refund_amount: string;
  approval_reason: string;
  approved_at: string;
  status: 'approved_pending_execution' | 'executed';
  payout_channel: 'cash' | 'official_gcash' | null;
  payout_reference: string | null;
  payout_evidence_hash: string | null;
  executed_by_user_id: string | null;
  executed_at: string | null;
  version: number;
}

export interface UnequalExchangeRecord {
  exchange_id: string;
  context_id: string;
  source_reference: string;
  returned_item_value: string;
  replacement_item_value: string;
  additional_amount_due: string;
  additional_payment_verified: boolean;
  additional_or_reference: string | null;
  additional_verified_by_id: string | null;
  additional_verified_at: string | null;
  recipient_signature_hash: string | null;
  status: 'awaiting_additional_payment' | 'ready_for_release' | 'completed';
  released_at: string | null;
  version: number;
}

export interface FundedExceptionRecord {
  exception_id: string;
  context_id: string;
  source_reference: string;
  exception_kind: FundedExceptionKind;
  linked_po_reference: string | null;
  open_po_committed_amount: string;
  reserved_stock_qty: string;
  initiated_by_user_id: string;
  initiated_at: string;
  status: 'open_obligations_visible' | 'resolved';
  po_resolution: string | null;
  stock_resolution: string | null;
  fund_resolution: string | null;
  approver_user_id: string | null;
  resolution_reason: string | null;
  resolved_at: string | null;
  version: number;
}

export interface P19HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P19SummaryMetrics {
  net_verified_credit: string;
  approved_unexecuted_refunds: string;
  executed_refunds_total: string;
  additional_exchange_collected: string;
  open_funded_obligations: number;
}

export interface P19OperationLedgerEntry {
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

export interface P19ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P19LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P19EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  financial_contexts: ReadonlyArray<OrderFinancialContext>;
  refund_cases: ReadonlyArray<RefundCaseRecord>;
  exchange_cases: ReadonlyArray<UnequalExchangeRecord>;
  funded_exceptions: ReadonlyArray<FundedExceptionRecord>;
  history: ReadonlyArray<P19HistoryEntry>;
  summary: P19SummaryMetrics;
  operation_ledger: ReadonlyArray<P19OperationLedgerEntry>;
  last_action: P19ActionResult | null;
}

export interface P19EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  financial_contexts?: ReadonlyArray<OrderFinancialContext> | undefined;
  refund_cases?: ReadonlyArray<RefundCaseRecord> | undefined;
  exchange_cases?: ReadonlyArray<UnequalExchangeRecord> | undefined;
  funded_exceptions?: ReadonlyArray<FundedExceptionRecord> | undefined;
  history?: ReadonlyArray<P19HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P19OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
}

export interface P19RefundExceptionEngine {
  getSnapshot: () => P19EngineSnapshot;
  registerOrderFinancialContext: (input: {
    context_kind: FinancialContextKind;
    source_reference: string;
    or_reference: string;
    adj_reference: string;
    buyer_name: string;
    verified_credit_amount: string;
    consumed_release_coverage: string;
    linked_po_reference?: string | null | undefined;
    open_po_committed_amount: string;
    reserved_stock_qty: string;
  }) => P19ActionResult<OrderFinancialContext>;
  approveCustomerRefund: (input: {
    context_id: string;
    preparer_user_id: string;
    finance_approver_id: string;
    refund_amount: string;
    approval_reason: string;
    approved_at: string;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<RefundCaseRecord>;
  executeVerifiedRefund: (input: {
    refund_id: string;
    executed_by_user_id: string;
    payout_channel: 'cash' | 'official_gcash';
    payout_reference: string;
    evidence_hash: string;
    executed_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<RefundCaseRecord>;
  prepareUnequalExchange: (input: {
    context_id: string;
    actor_user_id: string;
    returned_item_value: string;
    replacement_item_value: string;
    attempt_new_so_fabrication?: boolean | undefined;
    prepared_at: string;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<UnequalExchangeRecord>;
  verifyAdditionalExchangePayment: (input: {
    exchange_id: string;
    verifier_user_id: string;
    additional_or_reference: string;
    verified_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<UnequalExchangeRecord>;
  releaseUnequalExchangeReplacement: (input: {
    exchange_id: string;
    actor_user_id: string;
    signature_hash: string;
    released_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<UnequalExchangeRecord>;
  initiateFundedExceptionCase: (input: {
    context_id: string;
    exception_kind: FundedExceptionKind;
    initiated_by_user_id: string;
    attempt_auto_forfeit_or_release?: boolean | undefined;
    initiated_at: string;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<FundedExceptionRecord>;
  resolveFundedExceptionObligations: (input: {
    exception_id: string;
    approver_user_id: string;
    po_resolution: string;
    stock_resolution: string;
    fund_resolution: string;
    resolution_reason: string;
    resolved_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P19ActionResult<FundedExceptionRecord>;
  lookupRefundExceptionOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P19ActionResult<P19LookupResult>;
}

function readStoredP19Options(): P19EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P19_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P19EngineOptions;
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

export function createP19RefundExceptionEngine(
  options?: P19EngineOptions
): P19RefundExceptionEngine {
  const seed = options ?? readStoredP19Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 19000;

  const financialContexts: OrderFinancialContext[] = (seed.financial_contexts ?? []).map((f) =>
    structuredClone(f)
  );
  const refundCases: RefundCaseRecord[] = (seed.refund_cases ?? []).map((r) => structuredClone(r));
  const exchangeCases: UnequalExchangeRecord[] = (seed.exchange_cases ?? []).map((x) =>
    structuredClone(x)
  );
  const fundedExceptions: FundedExceptionRecord[] = (seed.funded_exceptions ?? []).map((e) =>
    structuredClone(e)
  );
  const history: P19HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P19OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P19ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P19${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P19SummaryMetrics {
    let netCreditCents = 0n;
    let approvedPendingCents = 0n;
    let executedCents = 0n;
    let extraExchangeCents = 0n;

    for (const ctx of financialContexts) {
      netCreditCents += toCents(ctx.available_refundable_credit);
      approvedPendingCents += toCents(ctx.approved_unexecuted_refund_total);
      executedCents += toCents(ctx.executed_refund_total);
    }
    for (const ex of exchangeCases) {
      if (ex.status === 'completed') {
        extraExchangeCents += toCents(ex.additional_amount_due);
      }
    }
    const openObligations = fundedExceptions.filter(
      (f) => f.status === 'open_obligations_visible'
    ).length;

    return {
      net_verified_credit: fromCents(netCreditCents),
      approved_unexecuted_refunds: fromCents(approvedPendingCents),
      executed_refunds_total: fromCents(executedCents),
      additional_exchange_collected: fromCents(extraExchangeCents),
      open_funded_obligations: openObligations,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P19_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          financial_contexts: financialContexts,
          refund_cases: refundCases,
          exchange_cases: exchangeCases,
          funded_exceptions: fundedExceptions,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P19ActionResult<T> {
    const res: P19ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P19ActionResult<T> {
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
    const res: P19ActionResult<T> = {
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
  ): P19ActionResult<T> | null {
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
    const replayRes: P19ActionResult<T> = {
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
        financial_contexts: financialContexts.map((f) => structuredClone(f)),
        refund_cases: refundCases.map((r) => structuredClone(r)),
        exchange_cases: exchangeCases.map((x) => structuredClone(x)),
        funded_exceptions: fundedExceptions.map((e) => structuredClone(e)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerOrderFinancialContext(input) {
      const srcRef = input.source_reference.trim();
      const orRef = input.or_reference.trim();
      const adjRef = input.adj_reference.trim();
      const buyer = input.buyer_name.trim();
      if (!srcRef || !orRef || !adjRef || !buyer) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Source reference, OR reference, ADJ reference, and buyer name are required.');
      }
      if (
        !MONEY_PATTERN.test(input.verified_credit_amount.trim()) ||
        !MONEY_PATTERN.test(input.consumed_release_coverage.trim()) ||
        !MONEY_PATTERN.test(input.open_po_committed_amount.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Amounts must use exact two-decimal format.');
      }

      const verifiedCents = toCents(input.verified_credit_amount.trim());
      const consumedCents = toCents(input.consumed_release_coverage.trim());
      if (consumedCents > verifiedCents) {
        return fail(422, 'INVALID_COVERAGE', 'Consumed release coverage cannot exceed verified credit.');
      }

      const ctx: OrderFinancialContext = {
        context_id: nextId(),
        chapter_id: chapterId,
        context_kind: input.context_kind,
        source_reference: srcRef,
        or_reference: orRef,
        adj_reference: adjRef,
        buyer_name: buyer,
        verified_credit_amount: input.verified_credit_amount.trim(),
        consumed_release_coverage: input.consumed_release_coverage.trim(),
        available_refundable_credit: fromCents(verifiedCents - consumedCents),
        approved_unexecuted_refund_total: '0.00',
        executed_refund_total: '0.00',
        linked_po_reference: input.linked_po_reference?.trim() || null,
        open_po_committed_amount: input.open_po_committed_amount.trim(),
        reserved_stock_qty: input.reserved_stock_qty.trim() || '0',
        version: 1,
      };
      financialContexts.push(ctx);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'FINANCIAL_CONTEXT_REGISTERED',
        message: `Registered ${srcRef} (${orRef}) — Available net refundable credit: PHP ${ctx.available_refundable_credit}.`,
        data: structuredClone(ctx),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P19ActionResult<OrderFinancialContext>;
    },

    approveCustomerRefund(input) {
      const replay = checkIdempotency<RefundCaseRecord>('p19.approve_refund', input.idempotency_key, input);
      if (replay) return replay;

      const prepId = input.preparer_user_id.trim();
      const finId = input.finance_approver_id.trim();
      const reason = input.approval_reason.trim();
      const approvedAt = input.approved_at.trim();
      if (!prepId || !finId || !reason || !UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Preparer, Finance approver, reason, and UTC timestamp are required.');
      }
      if (prepId === finId) {
        return fail(403, 'INDEPENDENCE_REQUIRED', 'Finance refund approver must be independent of the claim preparer.');
      }
      if (!MONEY_PATTERN.test(input.refund_amount.trim()) || toCents(input.refund_amount.trim()) <= 0n) {
        return fail(422, 'INVALID_MONEY_AMOUNT', 'Refund amount must be greater than 0.00.');
      }

      const ctx = financialContexts.find((f) => f.context_id === input.context_id);
      if (!ctx) return fail(404, 'RESOURCE_NOT_FOUND', 'Financial order context not found.');

      const reqCents = toCents(input.refund_amount.trim());
      const availCents = toCents(ctx.available_refundable_credit);
      const pendingCents = toCents(ctx.approved_unexecuted_refund_total);
      if (pendingCents + reqCents > availCents) {
        return fail(
          409,
          'REFUND_EXCEEDS_AVAILABLE_CREDIT',
          `Approved refund total exceeds available unconsumed customer credit (PHP ${ctx.available_refundable_credit}).`
        );
      }

      // Notice: net_verified_credit (available_refundable_credit) & executed_refund_total do NOT change on approval alone!
      ctx.approved_unexecuted_refund_total = fromCents(pendingCents + reqCents);
      ctx.version += 1;

      const refund: RefundCaseRecord = {
        refund_id: nextId(),
        context_id: ctx.context_id,
        source_reference: ctx.source_reference,
        adj_reference: ctx.adj_reference,
        preparer_user_id: prepId,
        finance_approver_id: finId,
        refund_amount: input.refund_amount.trim(),
        approval_reason: reason,
        approved_at: approvedAt,
        status: 'approved_pending_execution',
        payout_channel: null,
        payout_reference: null,
        payout_evidence_hash: null,
        executed_by_user_id: null,
        executed_at: null,
        version: 1,
      };
      refundCases.push(refund);

      history.push({
        event_id: nextUlid(),
        target_id: refund.refund_id,
        action: 'approveCustomerRefund',
        actor_user_id: finId,
        reason: `Approved PHP ${refund.refund_amount} pending payout (credit untouched)`,
        timestamp: approvedAt,
      });

      return recordLedgerAndPersist(
        'p19.approve_refund',
        finId,
        refund.refund_id,
        input.idempotency_key,
        input,
        201,
        'REFUND_APPROVED_PENDING_EXECUTION',
        `Approved refund of PHP ${refund.refund_amount} (${ctx.source_reference}). Pending actual payout execution — zero cash debit recorded yet.`,
        refund
      );
    },

    executeVerifiedRefund(input) {
      const replay = checkIdempotency<RefundCaseRecord>('p19.execute_refund', input.idempotency_key, input);
      if (replay) return replay;

      const execId = input.executed_by_user_id.trim();
      const payRef = input.payout_reference.trim();
      const evHash = input.evidence_hash.trim().toLowerCase();
      const executedAt = input.executed_at.trim();

      if (!execId || !payRef || !UTC_INSTANT_PATTERN.test(executedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Executor ID, payout reference, and UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(evHash)) {
        return fail(422, 'INVALID_EVIDENCE_HASH', 'Refund payout proof requires a valid 64-character lowercase SHA-256 hex digest.');
      }

      const refund = refundCases.find((r) => r.refund_id === input.refund_id);
      if (!refund) return fail(404, 'RESOURCE_NOT_FOUND', 'Approved refund case not found.');
      if (refund.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Refund record version changed before execution.');
      }
      if (refund.status === 'executed') {
        return fail(409, 'REFUND_ALREADY_EXECUTED', 'Verified refund payout has already been executed once.');
      }

      const ctx = financialContexts.find((f) => f.context_id === refund.context_id);
      if (!ctx) return fail(404, 'RESOURCE_NOT_FOUND', 'Parent financial order context not found.');

      const amtCents = toCents(refund.refund_amount);
      const pendingCents = toCents(ctx.approved_unexecuted_refund_total);
      const availCents = toCents(ctx.available_refundable_credit);
      const execCents = toCents(ctx.executed_refund_total);

      ctx.approved_unexecuted_refund_total = fromCents(pendingCents >= amtCents ? pendingCents - amtCents : 0n);
      ctx.available_refundable_credit = fromCents(availCents >= amtCents ? availCents - amtCents : 0n);
      ctx.executed_refund_total = fromCents(execCents + amtCents);
      ctx.version += 1;

      refund.status = 'executed';
      refund.payout_channel = input.payout_channel;
      refund.payout_reference = payRef;
      refund.payout_evidence_hash = evHash;
      refund.executed_by_user_id = execId;
      refund.executed_at = executedAt;
      refund.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: refund.refund_id,
        action: 'executeVerifiedRefund',
        actor_user_id: execId,
        reason: `${payRef} (PHP ${refund.refund_amount} via ${input.payout_channel})`,
        timestamp: executedAt,
      });

      return recordLedgerAndPersist(
        'p19.execute_refund',
        execId,
        refund.refund_id,
        input.idempotency_key,
        input,
        200,
        'VERIFIED_REFUND_EXECUTED',
        `Executed verified refund payout ${payRef} (PHP ${refund.refund_amount}). Adjusted net customer credit to PHP ${ctx.available_refundable_credit}.`,
        refund
      );
    },

    prepareUnequalExchange(input) {
      const replay = checkIdempotency<UnequalExchangeRecord>('p19.prepare_exchange', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const preparedAt = input.prepared_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(preparedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC timestamp are required.');
      }
      if (
        !MONEY_PATTERN.test(input.returned_item_value.trim()) ||
        !MONEY_PATTERN.test(input.replacement_item_value.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Item values must use exact two-decimal format.');
      }

      const ctx = financialContexts.find((f) => f.context_id === input.context_id);
      if (!ctx) return fail(404, 'RESOURCE_NOT_FOUND', 'Financial order context not found.');

      if (ctx.context_kind === 'booth_or' && input.attempt_new_so_fabrication) {
        return fail(
          409,
          'BOOTH_CLAIM_SO_FABRICATION_FORBIDDEN',
          'Unequal exchange from a Track 2 booth OR claim must preserve original OR linkage and cannot fabricate a new Track 1 SO.'
        );
      }

      const retCents = toCents(input.returned_item_value.trim());
      const repCents = toCents(input.replacement_item_value.trim());
      if (repCents <= retCents) {
        return fail(422, 'NOT_HIGHER_VALUE_EXCHANGE', 'Replacement item value must exceed returned item value for an unequal exchange.');
      }

      const due = fromCents(repCents - retCents);
      const ex: UnequalExchangeRecord = {
        exchange_id: nextId(),
        context_id: ctx.context_id,
        source_reference: ctx.source_reference,
        returned_item_value: input.returned_item_value.trim(),
        replacement_item_value: input.replacement_item_value.trim(),
        additional_amount_due: due,
        additional_payment_verified: false,
        additional_or_reference: null,
        additional_verified_by_id: null,
        additional_verified_at: null,
        recipient_signature_hash: null,
        status: 'awaiting_additional_payment',
        released_at: null,
        version: 1,
      };
      exchangeCases.push(ex);

      history.push({
        event_id: nextUlid(),
        target_id: ex.exchange_id,
        action: 'prepareUnequalExchange',
        actor_user_id: actorId,
        reason: `Additional due PHP ${due}`,
        timestamp: preparedAt,
      });

      return recordLedgerAndPersist(
        'p19.prepare_exchange',
        actorId,
        ex.exchange_id,
        input.idempotency_key,
        input,
        201,
        'UNEQUAL_EXCHANGE_PREPARED',
        `Prepared higher-value exchange (PHP ${ex.replacement_item_value} vs PHP ${ex.returned_item_value}): requires additional verified OR of PHP ${due} before release.`,
        ex
      );
    },

    verifyAdditionalExchangePayment(input) {
      const replay = checkIdempotency<UnequalExchangeRecord>('p19.verify_exchange_pay', input.idempotency_key, input);
      if (replay) return replay;

      const verifierId = input.verifier_user_id.trim();
      const orRef = input.additional_or_reference.trim();
      const verifiedAt = input.verified_at.trim();
      if (!verifierId || !orRef || !UTC_INSTANT_PATTERN.test(verifiedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Verifier ID, additional OR reference, and UTC timestamp are required.');
      }

      const ex = exchangeCases.find((x) => x.exchange_id === input.exchange_id);
      if (!ex) return fail(404, 'RESOURCE_NOT_FOUND', 'Unequal exchange case not found.');
      if (ex.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Exchange case version changed before payment verification.');
      }

      ex.additional_payment_verified = true;
      ex.additional_or_reference = orRef;
      ex.additional_verified_by_id = verifierId;
      ex.additional_verified_at = verifiedAt;
      ex.status = 'ready_for_release';
      ex.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: ex.exchange_id,
        action: 'verifyAdditionalExchangePayment',
        actor_user_id: verifierId,
        reason: `${orRef} (PHP ${ex.additional_amount_due})`,
        timestamp: verifiedAt,
      });

      return recordLedgerAndPersist(
        'p19.verify_exchange_pay',
        verifierId,
        ex.exchange_id,
        input.idempotency_key,
        input,
        200,
        'ADDITIONAL_EXCHANGE_PAYMENT_VERIFIED',
        `Verified additional difference PHP ${ex.additional_amount_due} with Official Receipt ${orRef}.`,
        ex
      );
    },

    releaseUnequalExchangeReplacement(input) {
      const replay = checkIdempotency<UnequalExchangeRecord>('p19.release_exchange', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const sigHash = input.signature_hash.trim().toLowerCase();
      const releasedAt = input.released_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(releasedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC timestamp are required.');
      }

      const ex = exchangeCases.find((x) => x.exchange_id === input.exchange_id);
      if (!ex) return fail(404, 'RESOURCE_NOT_FOUND', 'Unequal exchange case not found.');
      if (ex.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Exchange case version changed before release.');
      }
      if (!ex.additional_payment_verified || !ex.additional_or_reference) {
        return fail(
          409,
          'ADDITIONAL_VERIFIED_PAYMENT_REQUIRED',
          `Cannot release higher-value replacement before additional payment (PHP ${ex.additional_amount_due}) is verified with an Official Receipt.`
        );
      }
      if (!SHA256_PATTERN.test(sigHash)) {
        return fail(
          409,
          'MISSING_REPLACEMENT_ACKNOWLEDGMENT',
          'Signed buyer acknowledgment (64-char SHA-256) is required to release higher-value replacement.'
        );
      }

      ex.recipient_signature_hash = sigHash;
      ex.status = 'completed';
      ex.released_at = releasedAt;
      ex.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: ex.exchange_id,
        action: 'releaseUnequalExchangeReplacement',
        actor_user_id: actorId,
        reason: `${ex.additional_or_reference} completed`,
        timestamp: releasedAt,
      });

      return recordLedgerAndPersist(
        'p19.release_exchange',
        actorId,
        ex.exchange_id,
        input.idempotency_key,
        input,
        200,
        'UNEQUAL_EXCHANGE_RELEASED',
        `Released higher-value replacement backed by additional OR ${ex.additional_or_reference} while preserving original receipt and stock history.`,
        ex
      );
    },

    initiateFundedExceptionCase(input) {
      const replay = checkIdempotency<FundedExceptionRecord>('p19.init_exception', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.initiated_by_user_id.trim();
      const initiatedAt = input.initiated_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(initiatedAt)) {
        return fail(422, 'INVALID_INPUT', 'Officer ID and UTC timestamp are required.');
      }
      if (input.attempt_auto_forfeit_or_release) {
        return fail(
          409,
          'AUTOMATIC_FORFEITURE_OR_RELEASE_FORBIDDEN',
          'Funded exceptions with open PO, money, or stock commitments cannot automatically forfeit buyer deposits or release protected stock.'
        );
      }

      const ctx = financialContexts.find((f) => f.context_id === input.context_id);
      if (!ctx) return fail(404, 'RESOURCE_NOT_FOUND', 'Financial order context not found.');

      const exc: FundedExceptionRecord = {
        exception_id: nextId(),
        context_id: ctx.context_id,
        source_reference: ctx.source_reference,
        exception_kind: input.exception_kind,
        linked_po_reference: ctx.linked_po_reference,
        open_po_committed_amount: ctx.open_po_committed_amount,
        reserved_stock_qty: ctx.reserved_stock_qty,
        initiated_by_user_id: actorId,
        initiated_at: initiatedAt,
        status: 'open_obligations_visible',
        po_resolution: null,
        stock_resolution: null,
        fund_resolution: null,
        approver_user_id: null,
        resolution_reason: null,
        resolved_at: null,
        version: 1,
      };
      fundedExceptions.push(exc);

      history.push({
        event_id: nextUlid(),
        target_id: exc.exception_id,
        action: `initiateFundedExceptionCase:${input.exception_kind}`,
        actor_user_id: actorId,
        reason: `PO ${ctx.linked_po_reference ?? 'none'} (PHP ${ctx.open_po_committed_amount}) retained`,
        timestamp: initiatedAt,
      });

      return recordLedgerAndPersist(
        'p19.init_exception',
        actorId,
        exc.exception_id,
        input.idempotency_key,
        input,
        201,
        'FUNDED_EXCEPTION_OPENED',
        `Opened ${input.exception_kind} exception for ${ctx.source_reference}: preserved linked PO (${ctx.linked_po_reference ?? 'N/A'}), stock, and deposit obligations pending authorized resolution.`,
        exc
      );
    },

    resolveFundedExceptionObligations(input) {
      const replay = checkIdempotency<FundedExceptionRecord>('p19.resolve_exception', input.idempotency_key, input);
      if (replay) return replay;

      const approverId = input.approver_user_id.trim();
      const poRes = input.po_resolution.trim();
      const stockRes = input.stock_resolution.trim();
      const fundRes = input.fund_resolution.trim();
      const reason = input.resolution_reason.trim();
      const resolvedAt = input.resolved_at.trim();

      if (!approverId || !poRes || !stockRes || !fundRes || !reason || !UTC_INSTANT_PATTERN.test(resolvedAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Approver ID, explicit PO, stock, and fund resolutions, rationale, and UTC timestamp are all required.'
        );
      }

      const exc = fundedExceptions.find((e) => e.exception_id === input.exception_id);
      if (!exc) return fail(404, 'RESOURCE_NOT_FOUND', 'Funded exception case not found.');
      if (exc.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Funded exception version changed before resolution.');
      }

      exc.po_resolution = poRes;
      exc.stock_resolution = stockRes;
      exc.fund_resolution = fundRes;
      exc.approver_user_id = approverId;
      exc.resolution_reason = reason;
      exc.resolved_at = resolvedAt;
      exc.status = 'resolved';
      exc.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: exc.exception_id,
        action: 'resolveFundedExceptionObligations',
        actor_user_id: approverId,
        reason,
        timestamp: resolvedAt,
      });

      return recordLedgerAndPersist(
        'p19.resolve_exception',
        approverId,
        exc.exception_id,
        input.idempotency_key,
        input,
        200,
        'FUNDED_OBLIGATIONS_RESOLVED',
        `Resolved linked PO, stock, and customer fund obligations for ${exc.source_reference} with authorized Sales/Finance/Purchasing approval.`,
        exc
      );
    },

    lookupRefundExceptionOperation(input) {
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
