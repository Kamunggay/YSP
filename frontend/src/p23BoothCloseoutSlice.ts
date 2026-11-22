import { computeDeterministicHash } from './canonicalHash';

export const P23_CONTEXT_STORAGE_KEY = 'ysp_p23_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export interface BoothCloseoutRecord {
  event_id: string;
  chapter_id: string;
  event_code: string;
  event_name: string;
  custodian_user_id: string;
  cashier_user_id: string;
  checked_out_qty: string;
  sold_qty: string;
  expected_unsold_qty: string;
  usable_returned_qty: string;
  damaged_qty: string;
  unexplained_missing_qty: string;
  booth_custody_remaining_qty: string;
  stockroom_net_delta: string;
  counter_user_id: string | null;
  count_signature_hash: string | null;
  counted_at: string | null;
  closing_count_recorded: boolean;
  variance_adj_status: 'none_needed' | 'pending_dual_approval' | 'approved_resolved';
  head_approver_id: string | null;
  finance_approver_id: string | null;
  quarantine_treatment_note: string | null;
  float_issued_php: string;
  cash_sales_php: string;
  cash_refunds_executed_php: string;
  prior_sales_deposits_php: string;
  prior_float_returns_php: string;
  sales_cash_still_due_php: string;
  float_still_due_php: string;
  gcash_sales_verified_php: string;
  gcash_prior_remitted_php: string;
  gcash_still_due_php: string;
  used_settlement_refs: ReadonlyArray<string>;
  remittance_settled: boolean;
  status: 'open_closeout' | 'closed';
  version: number;
}

export interface P23HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P23SummaryMetrics {
  booth_custody_remaining_total: string;
  stockroom_net_delta_summary: string;
  sales_cash_still_due_total: string;
  float_still_due_total: string;
  gcash_still_due_total: string;
  closed_events_count: number;
}

export interface P23OperationLedgerEntry {
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

export interface P23ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P23LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P23EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  closeout_events: ReadonlyArray<BoothCloseoutRecord>;
  history: ReadonlyArray<P23HistoryEntry>;
  summary: P23SummaryMetrics;
  operation_ledger: ReadonlyArray<P23OperationLedgerEntry>;
  last_action: P23ActionResult | null;
}

export interface P23EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  closeout_events?: ReadonlyArray<BoothCloseoutRecord> | undefined;
  history?: ReadonlyArray<P23HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P23OperationLedgerEntry> | undefined;
}

export interface P23BoothCloseoutEngine {
  getSnapshot: () => P23EngineSnapshot;
  initializeBoothCloseoutEvent: (input: {
    event_code: string;
    event_name: string;
    custodian_user_id: string;
    cashier_user_id: string;
    checked_out_qty: string;
    sold_qty: string;
    float_issued_php: string;
    cash_sales_php: string;
    cash_refunds_executed_php: string;
    prior_sales_deposits_php: string;
    prior_float_returns_php: string;
    gcash_sales_verified_php: string;
    gcash_prior_remitted_php: string;
    idempotency_key?: string | undefined;
  }) => P23ActionResult<BoothCloseoutRecord>;
  recordIndependentClosingCountAndGoodReturn: (input: {
    event_id: string;
    counter_user_id: string;
    usable_return_qty: string;
    damaged_qty: string;
    unexplained_missing_qty: string;
    signature_hash: string;
    counted_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P23ActionResult<BoothCloseoutRecord>;
  approveBoothVarianceAdj: (input: {
    event_id: string;
    head_approver_id: string;
    finance_approver_id: string;
    quarantine_treatment_note: string;
    approved_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P23ActionResult<BoothCloseoutRecord>;
  recordBoothRemittanceAndFloatSettlement: (input: {
    event_id: string;
    reconciler_user_id: string;
    cash_remitted_php: string;
    float_returned_php: string;
    gcash_remitted_verified_php: string;
    settlement_reference: string;
    settled_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P23ActionResult<BoothCloseoutRecord>;
  closeBoothEvent: (input: {
    event_id: string;
    closing_officer_id: string;
    closed_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P23ActionResult<BoothCloseoutRecord>;
  lookupBoothCloseoutOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P23ActionResult<P23LookupResult>;
}

function readStoredP23Options(): P23EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P23_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P23EngineOptions;
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

/**
 * Creates a chapter-scoped booth returns, independent count variance, remittance, and close-out engine.
 * Separates float liability from sales cash and GCash, posts good usable returns immediately while holding
 * damages/variances under GOV-06 dual independent approval, and blocks closure until all obligations settle.
 */
export function createP23BoothCloseoutEngine(options?: P23EngineOptions): P23BoothCloseoutEngine {
  const seed = options ?? readStoredP23Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 23000;

  const closeoutEvents: BoothCloseoutRecord[] = (seed.closeout_events ?? []).map((e) =>
    structuredClone(e)
  );
  const history: P23HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P23OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P23ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P23${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P23SummaryMetrics {
    if (closeoutEvents.length === 0) {
      return {
        booth_custody_remaining_total: '0',
        stockroom_net_delta_summary: '0',
        sales_cash_still_due_total: '0.00',
        float_still_due_total: '0.00',
        gcash_still_due_total: '0.00',
        closed_events_count: 0,
      };
    }

    let custodyTotal = 0n;
    let netDeltaTotal = 0n;
    let salesDueCents = 0n;
    let floatDueCents = 0n;
    let gcashDueCents = 0n;
    let closedCount = 0;

    for (const ev of closeoutEvents) {
      custodyTotal += BigInt(ev.booth_custody_remaining_qty);
      netDeltaTotal += BigInt(ev.stockroom_net_delta);
      salesDueCents += toCents(ev.sales_cash_still_due_php);
      floatDueCents += toCents(ev.float_still_due_php);
      gcashDueCents += toCents(ev.gcash_still_due_php);
      if (ev.status === 'closed') closedCount += 1;
    }

    return {
      booth_custody_remaining_total: custodyTotal.toString(),
      stockroom_net_delta_summary: netDeltaTotal.toString(),
      sales_cash_still_due_total: fromCents(salesDueCents),
      float_still_due_total: fromCents(floatDueCents),
      gcash_still_due_total: fromCents(gcashDueCents),
      closed_events_count: closedCount,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P23_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          closeout_events: closeoutEvents,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P23ActionResult<T> {
    const res: P23ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P23ActionResult<T> | null {
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
        'IDEMPOTENCY_PAYLOAD_MISMATCH',
        `Idempotency key "${trimmed}" cannot be reused for a modified payload.`
      );
    }
    const replayRes: P23ActionResult<T> = {
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
  ): P23ActionResult<T> {
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
    const res: P23ActionResult<T> = {
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

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        closeout_events: closeoutEvents.map((e) => structuredClone(e)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    initializeBoothCloseoutEvent(input) {
      const replay = checkIdempotency<BoothCloseoutRecord>(
        'p23.init_closeout',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const evCode = input.event_code.trim();
      const evName = input.event_name.trim();
      const custId = input.custodian_user_id.trim();
      const cashId = input.cashier_user_id.trim();
      const chkQtyStr = input.checked_out_qty.trim();
      const soldQtyStr = input.sold_qty.trim();
      const moneyInputs = [
        input.float_issued_php.trim(),
        input.cash_sales_php.trim(),
        input.cash_refunds_executed_php.trim(),
        input.prior_sales_deposits_php.trim(),
        input.prior_float_returns_php.trim(),
        input.gcash_sales_verified_php.trim(),
        input.gcash_prior_remitted_php.trim(),
      ];

      if (!evCode || !evName || !custId || !cashId) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Event code, event name, custodian ID, and cashier ID are required.'
        );
      }
      if (!INTEGER_PATTERN.test(chkQtyStr) || !INTEGER_PATTERN.test(soldQtyStr)) {
        return fail(422, 'INVALID_QUANTITY', 'Checked-out and sold quantities must be whole numbers.');
      }
      const checkedOut = BigInt(chkQtyStr);
      const sold = BigInt(soldQtyStr);
      if (sold > checkedOut) {
        return fail(422, 'INVALID_QUANTITY', 'Sold quantity cannot exceed checked-out custody.');
      }
      if (!moneyInputs.every((m) => MONEY_PATTERN.test(m))) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'All monetary inputs must use exact two-decimal format.');
      }

      const [floatStr, salesStr, refStr, depStr, floatRetStr, gcashSalesStr, gcashPriorStr] =
        moneyInputs as [string, string, string, string, string, string, string];

      const salesCashDueCents = toCents(salesStr) - toCents(refStr) - toCents(depStr);
      const floatDueCents = toCents(floatStr) - toCents(floatRetStr);
      const gcashDueCents = toCents(gcashSalesStr) - toCents(gcashPriorStr);
      if (salesCashDueCents < 0n || floatDueCents < 0n || gcashDueCents < 0n) {
        return fail(422, 'OVER_REMITTED_INITIAL_STATE', 'Prior returns or deposits exceed collections.');
      }

      const expectedUnsold = checkedOut - sold;
      const ev: BoothCloseoutRecord = {
        event_id: nextId(),
        chapter_id: chapterId,
        event_code: evCode,
        event_name: evName,
        custodian_user_id: custId,
        cashier_user_id: cashId,
        checked_out_qty: chkQtyStr,
        sold_qty: soldQtyStr,
        expected_unsold_qty: expectedUnsold.toString(),
        usable_returned_qty: '0',
        damaged_qty: '0',
        unexplained_missing_qty: '0',
        booth_custody_remaining_qty: expectedUnsold.toString(),
        stockroom_net_delta: checkedOut === 0n ? '0' : `-${checkedOut.toString()}`,
        counter_user_id: null,
        count_signature_hash: null,
        counted_at: null,
        closing_count_recorded: false,
        variance_adj_status: 'none_needed',
        head_approver_id: null,
        finance_approver_id: null,
        quarantine_treatment_note: null,
        float_issued_php: floatStr,
        cash_sales_php: salesStr,
        cash_refunds_executed_php: refStr,
        prior_sales_deposits_php: depStr,
        prior_float_returns_php: floatRetStr,
        sales_cash_still_due_php: fromCents(salesCashDueCents),
        float_still_due_php: fromCents(floatDueCents),
        gcash_sales_verified_php: gcashSalesStr,
        gcash_prior_remitted_php: gcashPriorStr,
        gcash_still_due_php: fromCents(gcashDueCents),
        used_settlement_refs: [],
        remittance_settled:
          salesCashDueCents === 0n && floatDueCents === 0n && gcashDueCents === 0n,
        status: 'open_closeout',
        version: 1,
      };
      closeoutEvents.push(ev);

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_closeout_initialized',
        actor_user_id: custId,
        reason: `${evCode}: expected unsold ${ev.expected_unsold_qty}, sales cash due PHP ${ev.sales_cash_still_due_php}, float due PHP ${ev.float_still_due_php}, GCash due PHP ${ev.gcash_still_due_php}`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p23.init_closeout',
        custId,
        ev.event_id,
        input.idempotency_key,
        input,
        201,
        'BOOTH_CLOSEOUT_INITIALIZED',
        `Loaded ${evCode} close-out: expected unsold ${ev.expected_unsold_qty} units, sales cash due PHP ${ev.sales_cash_still_due_php}, float due PHP ${ev.float_still_due_php}.`,
        structuredClone(ev)
      );
    },

    recordIndependentClosingCountAndGoodReturn(input) {
      const replay = checkIdempotency<BoothCloseoutRecord>(
        'p23.post_count_return',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const counterId = input.counter_user_id.trim();
      const usableStr = input.usable_return_qty.trim();
      const damStr = input.damaged_qty.trim();
      const missStr = input.unexplained_missing_qty.trim();
      const sigHash = input.signature_hash.trim();
      const countedAt = input.counted_at.trim();

      if (!counterId || !UTC_INSTANT_PATTERN.test(countedAt)) {
        return fail(422, 'INVALID_INPUT', 'Independent counter ID and UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(sigHash)) {
        return fail(
          422,
          'INVALID_EVIDENCE_HASH',
          'Signed return evidence requires a valid 64-character lowercase SHA-256 hex digest.'
        );
      }
      if (!INTEGER_PATTERN.test(usableStr) || !INTEGER_PATTERN.test(damStr) || !INTEGER_PATTERN.test(missStr)) {
        return fail(422, 'INVALID_QUANTITY', 'Counted quantities must be non-negative whole numbers.');
      }

      const ev = closeoutEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth close-out event not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Event version changed before closing count posting.');
      }
      if (ev.closing_count_recorded) {
        return fail(409, 'CLOSING_COUNT_ALREADY_POSTED', 'Closing count has already been posted once.');
      }
      if (counterId === ev.custodian_user_id || counterId === ev.cashier_user_id) {
        return fail(
          403,
          'INDEPENDENT_CLOSING_COUNTER_REQUIRED',
          `Closing count must be verified independently — custodian (${ev.custodian_user_id}) and cashier (${ev.cashier_user_id}) cannot count their own booth.`
        );
      }

      const usable = BigInt(usableStr);
      const damaged = BigInt(damStr);
      const unexplained = BigInt(missStr);
      const expected = BigInt(ev.expected_unsold_qty);
      if (usable + damaged + unexplained !== expected) {
        return fail(
          422,
          'CLOSING_COUNT_SUM_MISMATCH',
          `Usable (${usableStr}) + damaged (${damStr}) + missing (${missStr}) must equal expected unsold (${ev.expected_unsold_qty}).`
        );
      }

      const checkedOut = BigInt(ev.checked_out_qty);
      const netDelta = -(checkedOut - usable);

      ev.usable_returned_qty = usableStr;
      ev.damaged_qty = damStr;
      ev.unexplained_missing_qty = missStr;
      ev.booth_custody_remaining_qty = (damaged + unexplained).toString();
      ev.stockroom_net_delta = netDelta.toString();
      ev.counter_user_id = counterId;
      ev.count_signature_hash = sigHash;
      ev.counted_at = countedAt;
      ev.closing_count_recorded = true;
      ev.variance_adj_status =
        damaged + unexplained > 0n ? 'pending_dual_approval' : 'none_needed';
      ev.version += 1;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_good_return_and_count_posted',
        actor_user_id: counterId,
        reason: `Usable return +${usableStr}, stockroom net ${ev.stockroom_net_delta}, unresolved custody ${ev.booth_custody_remaining_qty}`,
        timestamp: countedAt,
      });

      return recordLedgerAndPersist(
        'p23.post_count_return',
        counterId,
        ev.event_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_GOOD_RETURN_AND_COUNT_POSTED',
        `Posted ${usableStr} usable return units (stockroom net ${ev.stockroom_net_delta}, remaining booth custody ${ev.booth_custody_remaining_qty}).`,
        structuredClone(ev)
      );
    },

    approveBoothVarianceAdj(input) {
      const replay = checkIdempotency<BoothCloseoutRecord>(
        'p23.approve_variance',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const headId = input.head_approver_id.trim();
      const finId = input.finance_approver_id.trim();
      const note = input.quarantine_treatment_note.trim();
      const approvedAt = input.approved_at.trim();

      if (!headId || !finId || !note || !UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Head approver ID, Finance approver ID, quarantine/variance treatment note, and UTC time required.'
        );
      }

      const ev = closeoutEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth close-out event not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Event version changed before variance ADJ approval.');
      }
      if (ev.variance_adj_status !== 'pending_dual_approval') {
        return fail(409, 'NO_PENDING_VARIANCE_ADJ', 'No open booth variance or damage adjustment requires approval.');
      }

      const conflictedIds = new Set(
        [ev.counter_user_id, ev.custodian_user_id, ev.cashier_user_id].filter(
          (id): id is string => Boolean(id)
        )
      );
      if (conflictedIds.has(headId) || conflictedIds.has(finId)) {
        return fail(
          403,
          'PREPARER_OR_CUSTODIAN_VARIANCE_APPROVAL_FORBIDDEN',
          'Count preparer, affected custodian, and selling cashier are barred from either Head or Finance variance approval slot.'
        );
      }
      if (headId === finId) {
        return fail(
          403,
          'DUAL_DISTINCT_APPROVERS_REQUIRED',
          'Booth count variance and damage adjustment require two distinct eligible approvers.'
        );
      }

      ev.variance_adj_status = 'approved_resolved';
      ev.head_approver_id = headId;
      ev.finance_approver_id = finId;
      ev.quarantine_treatment_note = note;
      ev.booth_custody_remaining_qty = '0';
      ev.version += 1;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_variance_adj_approved',
        actor_user_id: `${headId}+${finId}`,
        reason: `Resolved ${ev.damaged_qty} damaged / ${ev.unexplained_missing_qty} missing units: ${note}`,
        timestamp: approvedAt,
      });

      return recordLedgerAndPersist(
        'p23.approve_variance',
        headId,
        ev.event_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_VARIANCE_ADJ_APPROVED',
        `Approved booth variance/damage adjustment for ${ev.event_code} via distinct Head (${headId}) & Finance (${finId}).`,
        structuredClone(ev)
      );
    },

    recordBoothRemittanceAndFloatSettlement(input) {
      const replay = checkIdempotency<BoothCloseoutRecord>(
        'p23.reconcile_remittance',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const recId = input.reconciler_user_id.trim();
      const cashRem = input.cash_remitted_php.trim();
      const floatRet = input.float_returned_php.trim();
      const gcashRem = input.gcash_remitted_verified_php.trim();
      const setRef = input.settlement_reference.trim();
      const settledAt = input.settled_at.trim();

      if (!recId || !setRef || !UTC_INSTANT_PATTERN.test(settledAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Reconciler ID, settlement reference, and UTC timestamp are required.'
        );
      }
      if (!MONEY_PATTERN.test(cashRem) || !MONEY_PATTERN.test(floatRet) || !MONEY_PATTERN.test(gcashRem)) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Remittance amounts must use exact two-decimal format.');
      }

      const ev = closeoutEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth close-out event not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Event version changed before remittance settlement.');
      }
      if (recId === ev.cashier_user_id || recId === ev.custodian_user_id) {
        return fail(
          403,
          'INDEPENDENT_RECONCILER_REQUIRED',
          `Booth cash & GCash reconciliation requires an independent officer distinct from cashier (${ev.cashier_user_id}) and custodian (${ev.custodian_user_id}).`
        );
      }
      if (ev.used_settlement_refs.includes(setRef)) {
        return fail(
          409,
          'DUPLICATE_REMITTANCE_OR_NOTHING_DUE',
          `Settlement reference "${setRef}" has already been applied once.`
        );
      }

      const remSalesCents = toCents(cashRem);
      const remFloatCents = toCents(floatRet);
      const remGcashCents = toCents(gcashRem);
      const dueSalesCents = toCents(ev.sales_cash_still_due_php);
      const dueFloatCents = toCents(ev.float_still_due_php);
      const dueGcashCents = toCents(ev.gcash_still_due_php);

      if (remSalesCents === 0n && remFloatCents === 0n && remGcashCents === 0n) {
        return fail(422, 'ZERO_SETTLEMENT_SUBMITTED', 'At least one remittance or float return amount must exceed 0.00.');
      }
      if (remSalesCents > dueSalesCents || remFloatCents > dueFloatCents || remGcashCents > dueGcashCents) {
        return fail(
          422,
          'REMITTANCE_EXCEEDS_DUE',
          'Submitted remittance or float return exceeds outstanding balance; do not subtract prior transfers twice.'
        );
      }

      const nextSalesDue = dueSalesCents - remSalesCents;
      const nextFloatDue = dueFloatCents - remFloatCents;
      const nextGcashDue = dueGcashCents - remGcashCents;

      ev.sales_cash_still_due_php = fromCents(nextSalesDue);
      ev.float_still_due_php = fromCents(nextFloatDue);
      ev.gcash_still_due_php = fromCents(nextGcashDue);
      ev.used_settlement_refs = [...ev.used_settlement_refs, setRef];
      ev.remittance_settled = nextSalesDue === 0n && nextFloatDue === 0n && nextGcashDue === 0n;
      ev.version += 1;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_remittance_reconciled',
        actor_user_id: recId,
        reason: `${setRef}: cash +PHP ${cashRem}, float +PHP ${floatRet}, GCash +PHP ${gcashRem} (sales due PHP ${ev.sales_cash_still_due_php}, float due PHP ${ev.float_still_due_php})`,
        timestamp: settledAt,
      });

      return recordLedgerAndPersist(
        'p23.reconcile_remittance',
        recId,
        ev.event_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_REMITTANCE_RECONCILED',
        `Reconciled settlement ${setRef}: sales cash still due PHP ${ev.sales_cash_still_due_php}, float due PHP ${ev.float_still_due_php}, GCash due PHP ${ev.gcash_still_due_php}.`,
        structuredClone(ev)
      );
    },

    closeBoothEvent(input) {
      const replay = checkIdempotency<BoothCloseoutRecord>(
        'p23.close_event',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const officerId = input.closing_officer_id.trim();
      const closedAt = input.closed_at.trim();
      if (!officerId || !UTC_INSTANT_PATTERN.test(closedAt)) {
        return fail(422, 'INVALID_INPUT', 'Closing officer ID and UTC timestamp are required.');
      }

      const ev = closeoutEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth close-out event not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Event version changed before close-out.');
      }

      const blockers: string[] = [];
      if (!ev.closing_count_recorded) blockers.push('independent closing count pending');
      if (ev.variance_adj_status === 'pending_dual_approval') {
        blockers.push('open variance/damage ADJ awaiting dual approval');
      }
      if (ev.sales_cash_still_due_php !== '0.00') {
        blockers.push(`sales cash still due PHP ${ev.sales_cash_still_due_php}`);
      }
      if (ev.float_still_due_php !== '0.00') {
        blockers.push(`float still due PHP ${ev.float_still_due_php}`);
      }
      if (ev.gcash_still_due_php !== '0.00') {
        blockers.push(`GCash reconciliation due PHP ${ev.gcash_still_due_php}`);
      }

      if (blockers.length > 0) {
        return fail(
          409,
          'BOOTH_CLOSURE_BLOCKED_OPEN_OBLIGATIONS',
          `Cannot close ${ev.event_code}: ${blockers.join('; ')}.`
        );
      }

      ev.status = 'closed';
      ev.version += 1;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_event_closed',
        actor_user_id: officerId,
        reason: `${ev.event_code} closed cleanly (net stockroom ${ev.stockroom_net_delta}, PHP 0.00 due)`,
        timestamp: closedAt,
      });

      return recordLedgerAndPersist(
        'p23.close_event',
        officerId,
        ev.event_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_EVENT_CLOSED',
        `Closed ${ev.event_code} with reconciled stockroom delta ${ev.stockroom_net_delta} and PHP 0.00 outstanding cash/float/GCash.`,
        structuredClone(ev)
      );
    },

    lookupBoothCloseoutOperation(input) {
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
