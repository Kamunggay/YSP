import { computeDeterministicHash } from './canonicalHash';

export const P20_CONTEXT_STORAGE_KEY = 'ysp_p20_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type LotRestrictionKind =
  | 'unrestricted_saleable'
  | 'distribution_only'
  | 'uninterpreted_donor_condition';

export type CheckoutCaptureMode = 'canvas_pad' | 'paper_upload';

export interface StockroomSourceLot {
  lot_id: string;
  chapter_id: string;
  variant_id: string;
  sku_code: string;
  item_name: string;
  initial_usable_qty: string;
  stockroom_usable_qty: string;
  approved_event_unit_price: string;
  restriction_kind: LotRestrictionKind;
  version: number;
}

export interface BoundCheckoutSignature {
  signature_id: string;
  is_ar_reference: string;
  event_id: string;
  lot_id: string;
  custodian_user_id: string;
  capture_mode: CheckoutCaptureMode;
  evidence_hash: string;
  acknowledged_qty: string;
  signed_at: string;
  consumed: boolean;
}

export interface BoothCheckoutMovement {
  movement_id: string;
  is_ar_reference: string;
  event_id: string;
  event_code: string;
  lot_id: string;
  sku_code: string;
  item_name: string;
  executed_by_user_id: string;
  custodian_user_id: string;
  checkout_qty: string;
  stockroom_delta: string;
  booth_custody_delta: string;
  evidence_hash: string;
  executed_at: string;
}

export interface BoothEventRecord {
  event_id: string;
  chapter_id: string;
  event_code: string;
  rf_reference: string;
  event_name: string;
  event_dates: string;
  requester_user_id: string;
  custodian_user_id: string;
  cashier_user_id: string;
  requested_float_amount: string;
  float_liability_amount: string;
  sales_revenue_amount: string;
  remittance_schedule: string;
  approver_user_id: string | null;
  approved_at: string | null;
  status: 'draft_setup' | 'approved_ready_for_checkout' | 'checked_out_active';
  booth_custody_qty: string;
  custody_by_sku: Record<string, string>;
  so_created_count: number;
  active_signature: BoundCheckoutSignature | null;
  version: number;
}

export interface P20HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P20SummaryMetrics {
  stockroom_usable_total: string;
  booth_custody_total: string;
  float_liability_total: string;
  sales_revenue_total: string;
  so_created_total: number;
}

export interface P20OperationLedgerEntry {
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

export interface P20ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P20LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P20EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  stockroom_lots: ReadonlyArray<StockroomSourceLot>;
  booth_events: ReadonlyArray<BoothEventRecord>;
  checkout_movements: ReadonlyArray<BoothCheckoutMovement>;
  history: ReadonlyArray<P20HistoryEntry>;
  summary: P20SummaryMetrics;
  operation_ledger: ReadonlyArray<P20OperationLedgerEntry>;
  last_action: P20ActionResult | null;
}

export interface P20EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  stockroom_lots?: ReadonlyArray<StockroomSourceLot> | undefined;
  booth_events?: ReadonlyArray<BoothEventRecord> | undefined;
  checkout_movements?: ReadonlyArray<BoothCheckoutMovement> | undefined;
  history?: ReadonlyArray<P20HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P20OperationLedgerEntry> | undefined;
}

export interface P20BoothCheckoutEngine {
  getSnapshot: () => P20EngineSnapshot;
  registerStockroomSourceLot: (input: {
    variant_id: string;
    sku_code: string;
    item_name: string;
    stockroom_usable_qty: string;
    approved_event_unit_price: string;
    restriction_kind: LotRestrictionKind;
    idempotency_key?: string | undefined;
  }) => P20ActionResult<StockroomSourceLot>;
  createBoothEventSetup: (input: {
    event_name: string;
    event_dates: string;
    requester_user_id: string;
    custodian_user_id: string;
    cashier_user_id: string;
    requested_float_amount: string;
    remittance_schedule: string;
    idempotency_key?: string | undefined;
  }) => P20ActionResult<BoothEventRecord>;
  approveBoothEventSetup: (input: {
    event_id: string;
    approver_user_id: string;
    approved_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P20ActionResult<BoothEventRecord>;
  bindCustodianCheckoutSignature: (input: {
    event_id: string;
    lot_id: string;
    custodian_user_id: string;
    capture_mode: CheckoutCaptureMode;
    evidence_hash: string;
    acknowledged_qty: string;
    signed_at: string;
    idempotency_key?: string | undefined;
  }) => P20ActionResult<BoundCheckoutSignature>;
  executeBoothCustodyCheckout: (input: {
    event_id: string;
    lot_id: string;
    executed_by_user_id: string;
    checkout_qty: string;
    executed_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P20ActionResult<BoothCheckoutMovement>;
  lookupBoothCheckoutOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P20ActionResult<P20LookupResult>;
}

function readStoredP20Options(): P20EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P20_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P20EngineOptions;
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
 * Creates a chapter-scoped booth setup and signed custody checkout engine.
 * Enforces independent RF approval, separate cash float tracking, restricted lot blocks,
 * IS/AR batch signature matching, and once-only stockroom-to-booth custody transfer.
 */
export function createP20BoothCheckoutEngine(options?: P20EngineOptions): P20BoothCheckoutEngine {
  const seed = options ?? readStoredP20Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 20000;

  const stockroomLots: StockroomSourceLot[] = (seed.stockroom_lots ?? []).map((l) =>
    structuredClone(l)
  );
  const boothEvents: BoothEventRecord[] = (seed.booth_events ?? []).map((e) =>
    structuredClone(e)
  );
  const checkoutMovements: BoothCheckoutMovement[] = (seed.checkout_movements ?? []).map((m) =>
    structuredClone(m)
  );
  const history: P20HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P20OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P20ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P20${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P20SummaryMetrics {
    let usableTotal = 0n;
    for (const lot of stockroomLots) {
      usableTotal += BigInt(lot.stockroom_usable_qty);
    }

    let custodyTotal = 0n;
    let floatCents = 0n;
    let salesCents = 0n;
    let soCreated = 0;

    for (const ev of boothEvents) {
      custodyTotal += BigInt(ev.booth_custody_qty);
      floatCents += toCents(ev.float_liability_amount);
      salesCents += toCents(ev.sales_revenue_amount);
      soCreated += ev.so_created_count;
    }

    return {
      stockroom_usable_total: usableTotal.toString(),
      booth_custody_total: custodyTotal.toString(),
      float_liability_total: fromCents(floatCents),
      sales_revenue_total: fromCents(salesCents),
      so_created_total: soCreated,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P20_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          stockroom_lots: stockroomLots,
          booth_events: boothEvents,
          checkout_movements: checkoutMovements,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore storage quota errors in sandboxed runs.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P20ActionResult<T> {
    const res: P20ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P20ActionResult<T> | null {
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
    const replayRes: P20ActionResult<T> = {
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
  ): P20ActionResult<T> {
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
    const res: P20ActionResult<T> = {
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
        stockroom_lots: stockroomLots.map((l) => structuredClone(l)),
        booth_events: boothEvents.map((e) => structuredClone(e)),
        checkout_movements: checkoutMovements.map((m) => structuredClone(m)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerStockroomSourceLot(input) {
      const replay = checkIdempotency<StockroomSourceLot>(
        'p20.register_lot',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const variantId = input.variant_id.trim();
      const skuCode = input.sku_code.trim();
      const itemName = input.item_name.trim();
      const usableStr = input.stockroom_usable_qty.trim();
      const priceStr = input.approved_event_unit_price.trim();

      if (!variantId || !skuCode || !itemName) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Variant ID, SKU code, and item name are required.'
        );
      }
      if (!INTEGER_PATTERN.test(usableStr) || BigInt(usableStr) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Usable stockroom quantity must be a whole number above 0.');
      }
      if (!MONEY_PATTERN.test(priceStr) || toCents(priceStr) <= 0n) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Approved event price must use exact two-decimal format.');
      }

      const lot: StockroomSourceLot = {
        lot_id: nextId(),
        chapter_id: chapterId,
        variant_id: variantId,
        sku_code: skuCode,
        item_name: itemName,
        initial_usable_qty: usableStr,
        stockroom_usable_qty: usableStr,
        approved_event_unit_price: priceStr,
        restriction_kind: input.restriction_kind,
        version: 1,
      };
      stockroomLots.push(lot);

      history.push({
        event_id: nextId(),
        target_id: lot.lot_id,
        action: 'stockroom_lot_registered',
        actor_user_id: 'system',
        reason: `${skuCode} (${usableStr} units, ${input.restriction_kind})`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p20.register_lot',
        'system',
        lot.lot_id,
        input.idempotency_key,
        input,
        201,
        'STOCKROOM_LOT_REGISTERED',
        `Registered stockroom lot ${skuCode} (${itemName}) with ${usableStr} usable units.`,
        structuredClone(lot)
      );
    },

    createBoothEventSetup(input) {
      const replay = checkIdempotency<BoothEventRecord>(
        'p20.create_setup',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const eventName = input.event_name.trim();
      const eventDates = input.event_dates.trim();
      const reqId = input.requester_user_id.trim();
      const custId = input.custodian_user_id.trim();
      const cashId = input.cashier_user_id.trim();
      const floatStr = input.requested_float_amount.trim();
      const schedule = input.remittance_schedule.trim();

      if (!eventName || !eventDates || !reqId || !custId || !cashId || !schedule) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Event name, dates, requester, custodian, cashier, and remittance schedule are required.'
        );
      }
      if (!MONEY_PATTERN.test(floatStr)) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Requested float amount must use exact two-decimal format.');
      }

      const id = nextId();
      const serial = String(boothEvents.length + 1).padStart(6, '0');
      const ev: BoothEventRecord = {
        event_id: id,
        chapter_id: chapterId,
        event_code: `${chapterPrefix}-EVT-2026-${serial}`,
        rf_reference: `${chapterPrefix}-RF-2026-${serial}`,
        event_name: eventName,
        event_dates: eventDates,
        requester_user_id: reqId,
        custodian_user_id: custId,
        cashier_user_id: cashId,
        requested_float_amount: floatStr,
        float_liability_amount: '0.00',
        sales_revenue_amount: '0.00',
        remittance_schedule: schedule,
        approver_user_id: null,
        approved_at: null,
        status: 'draft_setup',
        booth_custody_qty: '0',
        custody_by_sku: {},
        so_created_count: 0,
        active_signature: null,
        version: 1,
      };
      boothEvents.push(ev);

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_setup_drafted',
        actor_user_id: reqId,
        reason: `${ev.event_code} (${eventName})`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p20.create_setup',
        reqId,
        ev.event_id,
        input.idempotency_key,
        input,
        201,
        'BOOTH_SETUP_DRAFTED',
        `Drafted booth requisition ${ev.rf_reference} for ${eventName} (${ev.event_code}).`,
        structuredClone(ev)
      );
    },

    approveBoothEventSetup(input) {
      const replay = checkIdempotency<BoothEventRecord>(
        'p20.approve_setup',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const approverId = input.approver_user_id.trim();
      const approvedAt = input.approved_at.trim();
      if (!approverId || !UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(422, 'INVALID_INPUT', 'Approver ID and valid UTC timestamp are required.');
      }

      const ev = boothEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth event setup not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Booth event version changed before approval.');
      }
      if (ev.status !== 'draft_setup') {
        return fail(409, 'BOOTH_SETUP_ALREADY_APPROVED', 'Booth event setup has already been approved.');
      }
      if (approverId === ev.requester_user_id) {
        return fail(
          403,
          'SELF_APPROVAL_FORBIDDEN',
          'Booth requester cannot approve their own event setup or cash float.'
        );
      }

      ev.status = 'approved_ready_for_checkout';
      ev.approver_user_id = approverId;
      ev.approved_at = approvedAt;
      ev.float_liability_amount = ev.requested_float_amount;
      ev.sales_revenue_amount = '0.00';
      ev.version += 1;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_setup_approved',
        actor_user_id: approverId,
        reason: `Float custody PHP ${ev.float_liability_amount} approved; sales revenue unchanged (PHP 0.00)`,
        timestamp: approvedAt,
      });

      return recordLedgerAndPersist(
        'p20.approve_setup',
        approverId,
        ev.event_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_SETUP_APPROVED',
        `Approved ${ev.event_code} and PHP ${ev.float_liability_amount} separate float liability (sales revenue stays PHP 0.00).`,
        structuredClone(ev)
      );
    },

    bindCustodianCheckoutSignature(input) {
      const replay = checkIdempotency<BoundCheckoutSignature>(
        'p20.bind_signature',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const custId = input.custodian_user_id.trim();
      const hash = input.evidence_hash.trim();
      const ackQty = input.acknowledged_qty.trim();
      const signedAt = input.signed_at.trim();

      if (!custId || !UTC_INSTANT_PATTERN.test(signedAt)) {
        return fail(422, 'INVALID_INPUT', 'Custodian ID and valid UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(hash)) {
        return fail(
          422,
          'INVALID_EVIDENCE_HASH',
          'Checkout signature evidence requires a 64-character lowercase SHA-256 hex digest.'
        );
      }
      if (!INTEGER_PATTERN.test(ackQty) || BigInt(ackQty) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Acknowledged checkout quantity must exceed zero.');
      }

      const ev = boothEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth event not found.');
      const lot = stockroomLots.find((l) => l.lot_id === input.lot_id);
      if (!lot) return fail(404, 'RESOURCE_NOT_FOUND', 'Stockroom source lot not found.');

      if (custId !== ev.custodian_user_id) {
        return fail(
          403,
          'CUSTODIAN_IDENTITY_MISMATCH',
          `Signature must belong to designated booth custodian ${ev.custodian_user_id}.`
        );
      }

      const serial = String(checkoutMovements.length + 1).padStart(6, '0');
      const sig: BoundCheckoutSignature = {
        signature_id: nextId(),
        is_ar_reference: `${chapterPrefix}-ISAR-2026-${serial}`,
        event_id: ev.event_id,
        lot_id: lot.lot_id,
        custodian_user_id: custId,
        capture_mode: input.capture_mode,
        evidence_hash: hash,
        acknowledged_qty: ackQty,
        signed_at: signedAt,
        consumed: false,
      };
      ev.active_signature = sig;

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'checkout_signature_bound',
        actor_user_id: custId,
        reason: `${sig.is_ar_reference} for ${ackQty} units of ${lot.sku_code} (${input.capture_mode})`,
        timestamp: signedAt,
      });

      return recordLedgerAndPersist(
        'p20.bind_signature',
        custId,
        ev.event_id,
        input.idempotency_key,
        input,
        201,
        'CHECKOUT_SIGNATURE_BOUND',
        `Bound custodian signature ${sig.is_ar_reference} for ${ackQty} units of ${lot.sku_code}.`,
        structuredClone(sig)
      );
    },

    executeBoothCustodyCheckout(input) {
      const replay = checkIdempotency<BoothCheckoutMovement>(
        'p20.execute_checkout',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const execId = input.executed_by_user_id.trim();
      const qtyStr = input.checkout_qty.trim();
      const execAt = input.executed_at.trim();

      if (!execId || !UTC_INSTANT_PATTERN.test(execAt)) {
        return fail(422, 'INVALID_INPUT', 'Executing officer ID and UTC timestamp are required.');
      }
      if (!INTEGER_PATTERN.test(qtyStr) || BigInt(qtyStr) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Checkout quantity must be a positive whole number.');
      }

      const ev = boothEvents.find((e) => e.event_id === input.event_id);
      if (!ev) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth event not found.');
      if (ev.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Booth event version changed before checkout execution.');
      }
      if (ev.status === 'draft_setup') {
        return fail(
          409,
          'BOOTH_SETUP_NOT_APPROVED',
          'Booth event setup must be independently approved before checking out stock.'
        );
      }

      const lot = stockroomLots.find((l) => l.lot_id === input.lot_id);
      if (!lot) return fail(404, 'RESOURCE_NOT_FOUND', 'Stockroom source lot not found.');

      if (
        lot.restriction_kind === 'distribution_only' ||
        lot.restriction_kind === 'uninterpreted_donor_condition'
      ) {
        return fail(
          409,
          'RESTRICTED_LOT_BOOTH_SALE_FORBIDDEN',
          `Lot ${lot.sku_code} carries restriction "${lot.restriction_kind}" and cannot be checked out for booth trading.`
        );
      }

      const sig = ev.active_signature;
      if (
        !sig ||
        sig.consumed ||
        sig.lot_id !== lot.lot_id ||
        sig.acknowledged_qty !== qtyStr
      ) {
        return fail(
          409,
          'MISSING_OR_STALE_CHECKOUT_SIGNATURE',
          'Valid unconsumed custodian acknowledgment matching exact lot and checkout quantity is required.'
        );
      }

      const reqUnits = BigInt(qtyStr);
      const stockUnits = BigInt(lot.stockroom_usable_qty);
      if (reqUnits > stockUnits) {
        return fail(
          409,
          'INSUFFICIENT_STOCKROOM_USABLE',
          `Requested checkout (${qtyStr}) exceeds available usable stockroom units (${lot.stockroom_usable_qty}).`
        );
      }

      lot.stockroom_usable_qty = (stockUnits - reqUnits).toString();
      lot.version += 1;

      sig.consumed = true;
      ev.booth_custody_qty = (BigInt(ev.booth_custody_qty) + reqUnits).toString();
      const prevSkuQty = BigInt(ev.custody_by_sku[lot.sku_code] ?? '0');
      ev.custody_by_sku[lot.sku_code] = (prevSkuQty + reqUnits).toString();
      ev.status = 'checked_out_active';
      ev.version += 1;

      const movement: BoothCheckoutMovement = {
        movement_id: nextId(),
        is_ar_reference: sig.is_ar_reference,
        event_id: ev.event_id,
        event_code: ev.event_code,
        lot_id: lot.lot_id,
        sku_code: lot.sku_code,
        item_name: lot.item_name,
        executed_by_user_id: execId,
        custodian_user_id: ev.custodian_user_id,
        checkout_qty: qtyStr,
        stockroom_delta: `-${qtyStr}`,
        booth_custody_delta: `+${qtyStr}`,
        evidence_hash: sig.evidence_hash,
        executed_at: execAt,
      };
      checkoutMovements.push(movement);

      history.push({
        event_id: nextId(),
        target_id: ev.event_id,
        action: 'booth_custody_checked_out',
        actor_user_id: execId,
        reason: `${movement.is_ar_reference}: stockroom -${qtyStr} / ${ev.event_code} custody +${qtyStr}`,
        timestamp: execAt,
      });

      return recordLedgerAndPersist(
        'p20.execute_checkout',
        execId,
        movement.movement_id,
        input.idempotency_key,
        input,
        200,
        'BOOTH_CUSTODY_CHECKED_OUT',
        `Checked out ${qtyStr} units of ${lot.sku_code} to ${ev.event_code} (stockroom -${qtyStr}, booth +${qtyStr}; PHP 0.00 sales revenue).`,
        structuredClone(movement)
      );
    },

    lookupBoothCheckoutOperation(input) {
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
