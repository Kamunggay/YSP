import { computeDeterministicHash } from './canonicalHash';

export const P22_CONTEXT_STORAGE_KEY = 'ysp_p22_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type ManualPaymentChannel = 'cash' | 'official_gcash';

export type ManualExceptionKind =
  | 'missing_receipt'
  | 'voided_receipt'
  | 'unconfirmed_gcash_shortfall'
  | 'custody_shortfall';

export interface ManualReceiptSeries {
  series_id: string;
  chapter_id: string;
  event_code: string;
  series_prefix: string;
  range_start: number;
  range_end: number;
  initial_booth_custody_qty: string;
  remaining_booth_custody_qty: string;
  authorized_by_user_id: string;
  version: number;
}

export interface ManualOutageSaleRecord {
  entry_id: string;
  series_id: string;
  event_code: string;
  manual_or_number: number;
  manual_or_reference: string;
  payment_channel: ManualPaymentChannel;
  gcash_credit_verified: boolean;
  payment_reference: string;
  amount_php: string;
  quantity_sold: string;
  original_sale_at: string;
  entered_at: string;
  officer_user_id: string;
  evidence_note: string;
  second_or_issued: boolean;
}

export interface ManualReceiptExceptionRecord {
  exception_id: string;
  series_id: string;
  manual_or_number: number;
  manual_or_reference: string;
  exception_kind: ManualExceptionKind;
  officer_user_id: string;
  recorded_at: string;
  real_world_fact_note: string;
}

export interface P22HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P22SummaryMetrics {
  remaining_custody_total: string;
  entered_manual_sales_total: string;
  entered_sales_count: number;
  open_discrepancies_count: number;
  second_or_issued_count: number;
}

export interface P22OperationLedgerEntry {
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

export interface P22ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P22LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P22EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  receipt_series: ReadonlyArray<ManualReceiptSeries>;
  manual_sales: ReadonlyArray<ManualOutageSaleRecord>;
  manual_exceptions: ReadonlyArray<ManualReceiptExceptionRecord>;
  missing_in_range_refs: ReadonlyArray<string>;
  history: ReadonlyArray<P22HistoryEntry>;
  summary: P22SummaryMetrics;
  operation_ledger: ReadonlyArray<P22OperationLedgerEntry>;
  last_action: P22ActionResult | null;
}

export interface P22EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  receipt_series?: ReadonlyArray<ManualReceiptSeries> | undefined;
  manual_sales?: ReadonlyArray<ManualOutageSaleRecord> | undefined;
  manual_exceptions?: ReadonlyArray<ManualReceiptExceptionRecord> | undefined;
  history?: ReadonlyArray<P22HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P22OperationLedgerEntry> | undefined;
}

export interface P22ManualOutageEngine {
  getSnapshot: () => P22EngineSnapshot;
  allocateManualReceiptSeries: (input: {
    event_code: string;
    series_prefix: string;
    range_start: number;
    range_end: number;
    booth_custody_qty: string;
    authorized_by_user_id: string;
    idempotency_key?: string | undefined;
  }) => P22ActionResult<ManualReceiptSeries>;
  enterManualOutageSale: (input: {
    series_id: string;
    manual_or_number: number;
    payment_channel: ManualPaymentChannel;
    gcash_credit_verified: boolean;
    payment_reference: string;
    amount_php: string;
    quantity_sold: string;
    original_sale_at: string;
    entered_at: string;
    officer_user_id: string;
    evidence_note: string;
    idempotency_key?: string | undefined;
  }) => P22ActionResult<ManualOutageSaleRecord>;
  recordManualReceiptException: (input: {
    series_id: string;
    manual_or_number: number;
    exception_kind: ManualExceptionKind;
    officer_user_id: string;
    recorded_at: string;
    real_world_fact_note: string;
    idempotency_key?: string | undefined;
  }) => P22ActionResult<ManualReceiptExceptionRecord>;
  lookupManualOutageOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P22ActionResult<P22LookupResult>;
}

function readStoredP22Options(): P22EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P22_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P22EngineOptions;
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
 * Creates a chapter-scoped manual outage receipt control and once-only later-entry engine.
 * Preserves original vs entered timestamps, enforces allocated receipt ranges, detects duplicates,
 * blocks unconfirmed offline GCash, and posts each sale once without issuing a second OR.
 */
export function createP22ManualOutageEngine(options?: P22EngineOptions): P22ManualOutageEngine {
  const seed = options ?? readStoredP22Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 22000;

  const receiptSeries: ManualReceiptSeries[] = (seed.receipt_series ?? []).map((s) =>
    structuredClone(s)
  );
  const manualSales: ManualOutageSaleRecord[] = (seed.manual_sales ?? []).map((m) =>
    structuredClone(m)
  );
  const manualExceptions: ManualReceiptExceptionRecord[] = (seed.manual_exceptions ?? []).map((e) =>
    structuredClone(e)
  );
  const history: P22HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P22OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P22ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P22${String(seq).padStart(19, '0')}`;
  }

  function formatOrRef(prefix: string, num: number): string {
    return `${prefix}-${String(num).padStart(4, '0')}`;
  }

  function computeMissingInRangeRefs(): string[] {
    const missing: string[] = [];
    for (const s of receiptSeries) {
      const salesInSeries = manualSales.filter((m) => m.series_id === s.series_id);
      const excInSeries = manualExceptions.filter((e) => e.series_id === s.series_id);
      const maxSaleNum = salesInSeries.reduce(
        (acc, m) => (m.manual_or_number > acc ? m.manual_or_number : acc),
        0
      );
      const maxExcNum = excInSeries.reduce(
        (acc, e) => (e.manual_or_number > acc ? e.manual_or_number : acc),
        0
      );
      const highestUsed = Math.max(maxSaleNum, maxExcNum);
      if (highestUsed < s.range_start) continue;
      for (let num = s.range_start; num <= highestUsed; num += 1) {
        const entered = salesInSeries.some((m) => m.manual_or_number === num);
        const accountedVoid = excInSeries.some(
          (e) => e.manual_or_number === num && e.exception_kind === 'voided_receipt'
        );
        if (!entered && !accountedVoid) {
          missing.push(formatOrRef(s.series_prefix, num));
        }
      }
    }
    return missing;
  }

  function computeSummary(missingRefs: ReadonlyArray<string>): P22SummaryMetrics {
    let remainingCustody = 0n;
    for (const s of receiptSeries) {
      remainingCustody += BigInt(s.remaining_booth_custody_qty);
    }
    let salesCents = 0n;
    for (const m of manualSales) {
      salesCents += toCents(m.amount_php);
    }
    const discrepancyKeys = new Set<string>(missingRefs);
    for (const e of manualExceptions) {
      discrepancyKeys.add(`${e.series_id}:${e.manual_or_reference}:${e.exception_kind}`);
    }
    return {
      remaining_custody_total: remainingCustody.toString(),
      entered_manual_sales_total: fromCents(salesCents),
      entered_sales_count: manualSales.length,
      open_discrepancies_count: discrepancyKeys.size,
      second_or_issued_count: 0,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P22_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          receipt_series: receiptSeries,
          manual_sales: manualSales,
          manual_exceptions: manualExceptions,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors in sandboxed contexts.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P22ActionResult<T> {
    const res: P22ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P22ActionResult<T> | null {
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
    const replayRes: P22ActionResult<T> = {
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
  ): P22ActionResult<T> {
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
    const res: P22ActionResult<T> = {
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
      const missingRefs = computeMissingInRangeRefs();
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        receipt_series: receiptSeries.map((s) => structuredClone(s)),
        manual_sales: manualSales.map((m) => structuredClone(m)),
        manual_exceptions: manualExceptions.map((e) => structuredClone(e)),
        missing_in_range_refs: missingRefs,
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(missingRefs),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    allocateManualReceiptSeries(input) {
      const replay = checkIdempotency<ManualReceiptSeries>(
        'p22.allocate_series',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const evCode = input.event_code.trim();
      const prefix = input.series_prefix.trim();
      const custody = input.booth_custody_qty.trim();
      const authId = input.authorized_by_user_id.trim();

      if (!evCode || !prefix || !authId) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Event code, series prefix, and authorizing officer ID are required.'
        );
      }
      if (!Number.isInteger(input.range_start) || !Number.isInteger(input.range_end) || input.range_start < 1 || input.range_end < input.range_start) {
        return fail(422, 'INVALID_SERIES_RANGE', 'Allocated manual OR start and end range must be valid ascending positive integers.');
      }
      if (!INTEGER_PATTERN.test(custody)) {
        return fail(422, 'INVALID_QUANTITY', 'Booth custody quantity must be a non-negative whole number.');
      }

      const series: ManualReceiptSeries = {
        series_id: nextId(),
        chapter_id: chapterId,
        event_code: evCode,
        series_prefix: prefix,
        range_start: input.range_start,
        range_end: input.range_end,
        initial_booth_custody_qty: custody,
        remaining_booth_custody_qty: custody,
        authorized_by_user_id: authId,
        version: 1,
      };
      receiptSeries.push(series);

      history.push({
        event_id: nextId(),
        target_id: series.series_id,
        action: 'manual_series_allocated',
        actor_user_id: authId,
        reason: `${prefix} [${input.range_start}..${input.range_end}] (${custody} custody)`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p22.allocate_series',
        authId,
        series.series_id,
        input.idempotency_key,
        input,
        201,
        'MANUAL_SERIES_ALLOCATED',
        `Allocated manual OR series ${prefix} (${input.range_start}–${input.range_end}) for ${evCode}.`,
        structuredClone(series)
      );
    },

    enterManualOutageSale(input) {
      const replay = checkIdempotency<ManualOutageSaleRecord>(
        'p22.enter_manual_sale',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const payRef = input.payment_reference.trim();
      const amount = input.amount_php.trim();
      const qtyStr = input.quantity_sold.trim();
      const origAt = input.original_sale_at.trim();
      const entAt = input.entered_at.trim();
      const officer = input.officer_user_id.trim();
      const note = input.evidence_note.trim();

      if (!payRef || !officer || !note || !UTC_INSTANT_PATTERN.test(origAt) || !UTC_INSTANT_PATTERN.test(entAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Payment reference, officer ID, evidence note, original sale time, and entry time (UTC) are required.'
        );
      }
      if (!MONEY_PATTERN.test(amount) || toCents(amount) <= 0n) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Amount must use exact two-decimal format above 0.00.');
      }
      if (!INTEGER_PATTERN.test(qtyStr) || BigInt(qtyStr) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Quantity sold must be a positive whole number.');
      }

      const series = receiptSeries.find((s) => s.series_id === input.series_id);
      if (!series) return fail(404, 'RESOURCE_NOT_FOUND', 'Allocated manual OR series not found.');

      if (
        !Number.isInteger(input.manual_or_number) ||
        input.manual_or_number < series.range_start ||
        input.manual_or_number > series.range_end
      ) {
        return fail(
          422,
          'MANUAL_OR_OUT_OF_ALLOCATED_RANGE',
          `Receipt #${input.manual_or_number} falls outside allocated range ${series.range_start}..${series.range_end}.`
        );
      }

      if (input.payment_channel === 'official_gcash' && !input.gcash_credit_verified) {
        return fail(
          409,
          'UNCONFIRMED_OFFLINE_GCASH_CREDIT_FORBIDDEN',
          'Unconfirmed offline GCash credit cannot authorize paid manual entry; record as unconfirmed shortfall.'
        );
      }

      const dupOr = manualSales.some(
        (m) => m.series_id === series.series_id && m.manual_or_number === input.manual_or_number
      );
      const dupPay = manualSales.some((m) => m.payment_reference === payRef);
      if (dupOr || dupPay) {
        return fail(
          409,
          'DUPLICATE_MANUAL_OR_OR_PAYMENT_REF',
          `Duplicate manual OR (${formatOrRef(series.series_prefix, input.manual_or_number)}) or payment reference (${payRef}) detected; existing original sale retained.`
        );
      }

      const soldUnits = BigInt(qtyStr);
      const custodyUnits = BigInt(series.remaining_booth_custody_qty);
      if (soldUnits > custodyUnits) {
        return fail(
          409,
          'CUSTODY_SHORTFALL_RECONCILIATION_REQUIRED',
          `Requested quantity (${qtyStr}) exceeds remaining booth custody (${series.remaining_booth_custody_qty}); do not invent negative stock.`
        );
      }

      series.remaining_booth_custody_qty = (custodyUnits - soldUnits).toString();
      series.version += 1;

      const manualRef = formatOrRef(series.series_prefix, input.manual_or_number);
      const entry: ManualOutageSaleRecord = {
        entry_id: nextId(),
        series_id: series.series_id,
        event_code: series.event_code,
        manual_or_number: input.manual_or_number,
        manual_or_reference: manualRef,
        payment_channel: input.payment_channel,
        gcash_credit_verified: input.payment_channel === 'official_gcash' ? true : false,
        payment_reference: payRef,
        amount_php: amount,
        quantity_sold: qtyStr,
        original_sale_at: origAt,
        entered_at: entAt,
        officer_user_id: officer,
        evidence_note: note,
        second_or_issued: false,
      };
      manualSales.push(entry);

      history.push({
        event_id: nextId(),
        target_id: entry.entry_id,
        action: 'manual_outage_sale_entered',
        actor_user_id: officer,
        reason: `${manualRef}: ${qtyStr} units (PHP ${amount}), original ${origAt} / entered ${entAt}, no 2nd OR`,
        timestamp: entAt,
      });

      return recordLedgerAndPersist(
        'p22.enter_manual_sale',
        officer,
        entry.entry_id,
        input.idempotency_key,
        input,
        201,
        'MANUAL_OUTAGE_SALE_ENTERED',
        `Recorded original manual sale ${manualRef} once (PHP ${amount}, no second OR issued; custody remaining ${series.remaining_booth_custody_qty}).`,
        structuredClone(entry)
      );
    },

    recordManualReceiptException(input) {
      const replay = checkIdempotency<ManualReceiptExceptionRecord>(
        'p22.record_exception',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const officer = input.officer_user_id.trim();
      const recAt = input.recorded_at.trim();
      const note = input.real_world_fact_note.trim();

      if (!officer || !note || !UTC_INSTANT_PATTERN.test(recAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Officer ID, fact note, and UTC timestamp are required.');
      }

      const series = receiptSeries.find((s) => s.series_id === input.series_id);
      if (!series) return fail(404, 'RESOURCE_NOT_FOUND', 'Allocated manual OR series not found.');

      if (
        !Number.isInteger(input.manual_or_number) ||
        input.manual_or_number < series.range_start ||
        input.manual_or_number > series.range_end
      ) {
        return fail(
          422,
          'MANUAL_OR_OUT_OF_ALLOCATED_RANGE',
          `Receipt #${input.manual_or_number} falls outside allocated range ${series.range_start}..${series.range_end}.`
        );
      }

      const manualRef = formatOrRef(series.series_prefix, input.manual_or_number);
      const exc: ManualReceiptExceptionRecord = {
        exception_id: nextId(),
        series_id: series.series_id,
        manual_or_number: input.manual_or_number,
        manual_or_reference: manualRef,
        exception_kind: input.exception_kind,
        officer_user_id: officer,
        recorded_at: recAt,
        real_world_fact_note: note,
      };
      manualExceptions.push(exc);

      history.push({
        event_id: nextId(),
        target_id: exc.exception_id,
        action: 'manual_receipt_exception_recorded',
        actor_user_id: officer,
        reason: `${manualRef} (${input.exception_kind}): ${note}`,
        timestamp: recAt,
      });

      return recordLedgerAndPersist(
        'p22.record_exception',
        officer,
        exc.exception_id,
        input.idempotency_key,
        input,
        201,
        'MANUAL_RECEIPT_EXCEPTION_RECORDED',
        `Preserved real-world discrepancy for ${manualRef} (${input.exception_kind}) for authorized reconciliation.`,
        structuredClone(exc)
      );
    },

    lookupManualOutageOperation(input) {
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
