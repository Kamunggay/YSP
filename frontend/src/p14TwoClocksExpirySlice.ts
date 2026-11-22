import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P14_CONTEXT_STORAGE_KEY = 'ysp_p14_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type UnpaidAvailableState = 'none' | 'active_unpaid' | 'paid_protected' | 'expired_released';
export type BackorderClockState = 'none' | 'awaiting_deposit' | 'funded_protected' | 'lapsed_unfunded';

export interface DualClockOrder {
  order_id: string;
  chapter_id: string;
  so_reference: string;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  usable_on_hand: UnitQuantity;
  rf_reserved: UnitQuantity;
  unpaid_available_reserved: UnitQuantity;
  paid_available_reserved: UnitQuantity;
  available_to_allocate: UnitQuantity;
  accepted_backorder_qty: UnitQuantity;
  unpaid_available_state: UnpaidAvailableState;
  backorder_state: BackorderClockState;
  agreed_sale_amount: string;
  estimated_procurement_cost: string;
  finance_cost_approved: boolean;
  cost_exceeds_sale_blocker: boolean;
  reservation_created_at: string;
  available_clock_expires_at: string;
  backorder_accepted_at: string | null;
  deposit_clock_expires_at: string | null;
  pickup_deadline_at: string | null;
  funded_or_reference: string | null;
  backorder_deposit_paid: string;
  partial_unfunded_credit: string;
  overdue_pickup_alert: boolean;
  payment_hold_expiry_notice: boolean;
  repf_reference: string | null;
  expiry_history: string[];
  version: number;
}

export interface RepfForwardRecord {
  forward_id: string;
  order_id: string;
  so_reference: string;
  repf_reference: string;
  funded_or_reference: string;
  quantity: string;
  approved_cost: string;
  forwarded_by_user_id: string;
  forwarded_at: string;
}

export interface LatePaymentResolutionRecord {
  resolution_id: string;
  order_id: string;
  so_reference: string;
  or_reference: string;
  requested_quantity: string;
  available_at_check: string;
  outcome: 'allocated_fresh_paid' | 'convert_to_funded_backorder' | 'route_to_finance_refund';
  actor_user_id: string;
  resolved_at: string;
}

export interface P14HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P14SummaryMetrics {
  usable_on_hand: string;
  active_unpaid_so_reserved: string;
  protected_paid_so_reserved: string;
  funded_backorder_qty: string;
  available_to_allocate: string;
}

export interface P14OperationLedgerEntry {
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

export interface P14ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P14LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P14EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  tracked_orders: ReadonlyArray<DualClockOrder>;
  repf_forwards: ReadonlyArray<RepfForwardRecord>;
  late_resolutions: ReadonlyArray<LatePaymentResolutionRecord>;
  history: ReadonlyArray<P14HistoryEntry>;
  summary: P14SummaryMetrics;
  operation_ledger: ReadonlyArray<P14OperationLedgerEntry>;
  last_action: P14ActionResult | null;
}

export interface P14EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  tracked_orders?: ReadonlyArray<DualClockOrder> | undefined;
  repf_forwards?: ReadonlyArray<RepfForwardRecord> | undefined;
  late_resolutions?: ReadonlyArray<LatePaymentResolutionRecord> | undefined;
  history?: ReadonlyArray<P14HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P14OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_repf_ref_seq?: number | undefined;
}

export interface P14TwoClocksExpiryEngine {
  getSnapshot: () => P14EngineSnapshot;
  registerDualClockOrder: (input: {
    so_reference: string;
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    usable_on_hand_value: string;
    rf_reserved_value: string;
    unpaid_available_reserved_value: string;
    paid_available_reserved_value: string;
    accepted_backorder_qty_value: string;
    agreed_sale_amount: string;
    estimated_procurement_cost: string;
    finance_cost_approved: boolean;
    reservation_created_at: string;
    backorder_accepted_at?: string | undefined;
    pickup_deadline_at?: string | undefined;
  }) => P14ActionResult<DualClockOrder>;
  approveExcessProcurementCost: (input: {
    order_id: string;
    finance_user_id: string;
    buyer_acceptance_reason: string;
    approved_at: string;
    expected_version: number;
  }) => P14ActionResult<DualClockOrder>;
  recordScopedOrderFunding: (input: {
    order_id: string;
    funding_scope: 'backorder_deposit' | 'available_reservation';
    evidence_kind: 'verified_or' | 'pending_screenshot';
    or_reference: string;
    amount: string;
    verified_at: string;
    actor_user_id: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P14ActionResult<DualClockOrder>;
  evaluateOrderClocksAtTime: (input: {
    order_id: string;
    evaluation_time: string;
    actor_user_id: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P14ActionResult<DualClockOrder>;
  consumeAvailableStockElsewhere: (input: {
    order_id: string;
    consumed_quantity_value: string;
    actor_user_id: string;
  }) => P14ActionResult<DualClockOrder>;
  forwardShortageToPurchasingRepf: (input: {
    order_id: string;
    actor_user_id: string;
    attempt_rf_rop_relabel?: boolean | undefined;
    forwarded_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P14ActionResult<RepfForwardRecord>;
  resolveLateVerifiedPayment: (input: {
    order_id: string;
    actor_user_id: string;
    or_reference: string;
    requested_quantity_value: string;
    verified_at: string;
    fallback_choice: 'convert_to_funded_backorder' | 'route_to_finance_refund';
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P14ActionResult<LatePaymentResolutionRecord>;
  lookupTwoClocksOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P14ActionResult<P14LookupResult>;
}

function readStoredP14Options(): P14EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P14_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P14EngineOptions;
  } catch {
    return undefined;
  }
}

function formatTrimmedMicro(micro: bigint): string {
  const whole = micro / 1000000n;
  const rem = micro % 1000000n;
  if (rem === 0n) return whole.toString();
  return `${whole.toString()}.${rem.toString().padStart(6, '0').replace(/0+$/, '')}`;
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

function addHoursUtc(isoUtc: string, hours: number): string {
  const ms = Date.parse(isoUtc);
  return new Date(ms + hours * 3600 * 1000).toISOString();
}

export function createP14TwoClocksExpiryEngine(
  options?: P14EngineOptions
): P14TwoClocksExpiryEngine {
  const seed = options ?? readStoredP14Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 14000;
  let repfRefSeq = seed.next_repf_ref_seq ?? 0;

  const trackedOrders: DualClockOrder[] = (seed.tracked_orders ?? []).map((o) => structuredClone(o));
  const repfForwards: RepfForwardRecord[] = (seed.repf_forwards ?? []).map((f) =>
    structuredClone(f)
  );
  const lateResolutions: LatePaymentResolutionRecord[] = (seed.late_resolutions ?? []).map((l) =>
    structuredClone(l)
  );
  const history: P14HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P14OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P14ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P14${String(seq).padStart(19, '0')}`;
  }

  function nextRepfRef(): string {
    repfRefSeq += 1;
    return `${chapterPrefix}-REPF-SO-2026-${String(repfRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P14SummaryMetrics {
    let usableMicro = 0n;
    let unpaidMicro = 0n;
    let paidMicro = 0n;
    let fundedBackorderMicro = 0n;
    let availMicro = 0n;

    for (const o of trackedOrders) {
      usableMicro += toMicroUnits(o.usable_on_hand.value);
      if (o.unpaid_available_state === 'active_unpaid') {
        unpaidMicro += toMicroUnits(o.unpaid_available_reserved.value);
      }
      paidMicro += toMicroUnits(o.paid_available_reserved.value);
      if (o.backorder_state === 'funded_protected') {
        fundedBackorderMicro += toMicroUnits(o.accepted_backorder_qty.value);
      }
      availMicro += toMicroUnits(o.available_to_allocate.value);
    }

    return {
      usable_on_hand: formatTrimmedMicro(usableMicro),
      active_unpaid_so_reserved: formatTrimmedMicro(unpaidMicro),
      protected_paid_so_reserved: formatTrimmedMicro(paidMicro),
      funded_backorder_qty: formatTrimmedMicro(fundedBackorderMicro),
      available_to_allocate: formatTrimmedMicro(availMicro),
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P14_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          tracked_orders: trackedOrders,
          repf_forwards: repfForwards,
          late_resolutions: lateResolutions,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_repf_ref_seq: repfRefSeq,
        })
      );
    } catch {
      // Ignore storage quota issues.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P14ActionResult<T> {
    const res: P14ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P14ActionResult<T> {
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
    const res: P14ActionResult<T> = {
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
  ): P14ActionResult<T> | null {
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
    const replayRes: P14ActionResult<T> = {
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
        tracked_orders: trackedOrders.map((o) => structuredClone(o)),
        repf_forwards: repfForwards.map((f) => structuredClone(f)),
        late_resolutions: lateResolutions.map((l) => structuredClone(l)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerDualClockOrder(input) {
      const soRef = input.so_reference.trim();
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      const createdAt = input.reservation_created_at.trim();
      const backorderAt = input.backorder_accepted_at?.trim() || null;
      const pickupAt = input.pickup_deadline_at?.trim() || null;

      if (!soRef || !variantId || !itemName || !UTC_INSTANT_PATTERN.test(createdAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'SO reference, variant ID, item name, and UTC creation timestamp are required.');
      }
      if (backorderAt && !UTC_INSTANT_PATTERN.test(backorderAt)) {
        return fail(422, 'INVALID_TIMESTAMP', 'Backorder acceptance timestamp must be UTC ISO-8601.');
      }
      if (pickupAt && !UTC_INSTANT_PATTERN.test(pickupAt)) {
        return fail(422, 'INVALID_TIMESTAMP', 'Pickup deadline timestamp must be UTC ISO-8601.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Precision scale must be an integer between 0 and 6.');
      }

      const qtyInputs = [
        input.usable_on_hand_value.trim(),
        input.rf_reserved_value.trim(),
        input.unpaid_available_reserved_value.trim(),
        input.paid_available_reserved_value.trim(),
        input.accepted_backorder_qty_value.trim(),
      ];
      if (qtyInputs.some((q) => !isValidUnitQuantity({ value: q, quantity_scale: input.quantity_scale }))) {
        return fail(422, 'INVALID_QUANTITY', 'Stock quantities violate item precision scale.');
      }
      if (
        !MONEY_PATTERN.test(input.agreed_sale_amount.trim()) ||
        !MONEY_PATTERN.test(input.estimated_procurement_cost.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Sale amount and procurement cost must use two-decimal format.');
      }

      const usableMicro = toMicroUnits(input.usable_on_hand_value.trim());
      const rfMicro = toMicroUnits(input.rf_reserved_value.trim());
      const unpaidMicro = toMicroUnits(input.unpaid_available_reserved_value.trim());
      const paidMicro = toMicroUnits(input.paid_available_reserved_value.trim());
      const backorderMicro = toMicroUnits(input.accepted_backorder_qty_value.trim());

      if (rfMicro + unpaidMicro + paidMicro > usableMicro) {
        return fail(422, 'EXCEEDS_USABLE_ON_HAND', 'Combined RF and SO reservations cannot exceed usable stockroom on-hand.');
      }

      const availMicro = usableMicro - rfMicro - unpaidMicro - paidMicro;
      const saleCents = toCents(input.agreed_sale_amount.trim());
      const costCents = toCents(input.estimated_procurement_cost.trim());

      const order: DualClockOrder = {
        order_id: nextId(),
        chapter_id: chapterId,
        so_reference: soRef,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        usable_on_hand: fromMicroUnits(usableMicro, input.quantity_scale),
        rf_reserved: fromMicroUnits(rfMicro, input.quantity_scale),
        unpaid_available_reserved: fromMicroUnits(unpaidMicro, input.quantity_scale),
        paid_available_reserved: fromMicroUnits(paidMicro, input.quantity_scale),
        available_to_allocate: fromMicroUnits(availMicro, input.quantity_scale),
        accepted_backorder_qty: fromMicroUnits(backorderMicro, input.quantity_scale),
        unpaid_available_state: unpaidMicro > 0n ? 'active_unpaid' : 'none',
        backorder_state: backorderMicro > 0n && backorderAt ? 'awaiting_deposit' : 'none',
        agreed_sale_amount: input.agreed_sale_amount.trim(),
        estimated_procurement_cost: input.estimated_procurement_cost.trim(),
        finance_cost_approved: input.finance_cost_approved,
        cost_exceeds_sale_blocker: costCents > saleCents,
        reservation_created_at: createdAt,
        available_clock_expires_at: addHoursUtc(createdAt, 48),
        backorder_accepted_at: backorderAt,
        deposit_clock_expires_at: backorderAt ? addHoursUtc(backorderAt, 48) : null,
        pickup_deadline_at: pickupAt,
        funded_or_reference: null,
        backorder_deposit_paid: '0.00',
        partial_unfunded_credit: '0.00',
        overdue_pickup_alert: false,
        payment_hold_expiry_notice: false,
        repf_reference: null,
        expiry_history: [],
        version: 1,
      };

      trackedOrders.push(order);
      lastAction = {
        ok: true,
        http_status: 201,
        code: 'DUAL_CLOCK_ORDER_REGISTERED',
        message: `Registered ${soRef} with Clock 1 expiry ${order.available_clock_expires_at}${order.cost_exceeds_sale_blocker ? ' (Excess procurement cost requires pricing/budget review)' : ''}.`,
        data: structuredClone(order),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P14ActionResult<DualClockOrder>;
    },

    approveExcessProcurementCost(input) {
      const reason = input.buyer_acceptance_reason.trim();
      const financeId = input.finance_user_id.trim();
      const approvedAt = input.approved_at.trim();
      if (!financeId || !reason || !UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(422, 'INVALID_INPUT', 'Finance officer ID, buyer acceptance reason, and UTC timestamp are required.');
      }

      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before excess cost approval.');
      }

      order.cost_exceeds_sale_blocker = false;
      order.finance_cost_approved = true;
      order.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: order.order_id,
        action: 'approveExcessProcurementCost',
        actor_user_id: financeId,
        reason,
        timestamp: approvedAt,
      });

      lastAction = {
        ok: true,
        http_status: 200,
        code: 'EXCESS_COST_APPROVED',
        message: `Cleared excess procurement cost blocker for ${order.so_reference} with documented approval.`,
        data: structuredClone(order),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P14ActionResult<DualClockOrder>;
    },

    recordScopedOrderFunding(input) {
      const replay = checkIdempotency<DualClockOrder>('p14.record_funding', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const orRef = input.or_reference.trim();
      const verifiedAt = input.verified_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(verifiedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC timestamp are required.');
      }
      if (input.evidence_kind === 'pending_screenshot') {
        return fail(
          409,
          'UNVERIFIED_PAYMENT_CANNOT_PROTECT',
          'Pending payment screenshots cannot extend deadlines or fabricate reservation protection.'
        );
      }
      if (!orRef) {
        return fail(422, 'OR_REFERENCE_REQUIRED', 'Verified Official Receipt reference is required to protect stock or backorders.');
      }
      if (!MONEY_PATTERN.test(input.amount.trim()) || toCents(input.amount.trim()) <= 0n) {
        return fail(422, 'INVALID_MONEY_AMOUNT', 'Verified amount must be greater than 0.00.');
      }

      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before funding protection recorded.');
      }

      if (input.funding_scope === 'backorder_deposit') {
        if (!order.deposit_clock_expires_at) {
          return fail(409, 'NO_ACTIVE_BACKORDER_CLOCK', 'No accepted backorder deadline is active on this order.');
        }
        if (Date.parse(verifiedAt) > Date.parse(order.deposit_clock_expires_at)) {
          return fail(
            409,
            'BACKDATED_ENTRY_CANNOT_EXTEND_CLOCK',
            `Verification timestamp ${verifiedAt} falls after the 48-hour backorder deadline (${order.deposit_clock_expires_at}).`
          );
        }

        const totalDepCents = toCents(order.backorder_deposit_paid) + toCents(input.amount.trim());
        const reqCostCents = toCents(order.estimated_procurement_cost);
        order.backorder_deposit_paid = fromCents(totalDepCents);

        if (totalDepCents >= reqCostCents) {
          order.backorder_state = 'funded_protected';
          order.funded_or_reference = orRef;
          order.partial_unfunded_credit = '0.00';
        } else {
          order.partial_unfunded_credit = fromCents(totalDepCents);
        }
      } else {
        if (Date.parse(verifiedAt) > Date.parse(order.available_clock_expires_at)) {
          return fail(
            409,
            'BACKDATED_ENTRY_CANNOT_EXTEND_CLOCK',
            `Verification timestamp ${verifiedAt} falls after the 48-hour available-stock deadline (${order.available_clock_expires_at}).`
          );
        }
        const curUnpaidMicro = toMicroUnits(order.unpaid_available_reserved.value);
        const curPaidMicro = toMicroUnits(order.paid_available_reserved.value);
        order.paid_available_reserved = fromMicroUnits(curPaidMicro + curUnpaidMicro, order.quantity_scale);
        order.unpaid_available_reserved = fromMicroUnits(0n, order.quantity_scale);
        order.unpaid_available_state = 'paid_protected';
      }

      order.version += 1;
      history.push({
        event_id: nextUlid(),
        target_id: order.order_id,
        action: `recordScopedOrderFunding:${input.funding_scope}`,
        actor_user_id: actorId,
        reason: `${orRef} PHP ${input.amount.trim()}`,
        timestamp: verifiedAt,
      });

      return recordLedgerAndPersist(
        'p14.record_funding',
        actorId,
        order.order_id,
        input.idempotency_key,
        input,
        200,
        'SCOPED_FUNDING_RECORDED',
        input.funding_scope === 'backorder_deposit'
          ? order.backorder_state === 'funded_protected'
            ? `Protected backorder commitment with verified deposit OR ${orRef}; unpaid available reservation remains strictly governed by its own Clock 1.`
            : `Recorded partial deposit PHP ${input.amount} (retained as partial credit — below approved procurement cost PHP ${order.estimated_procurement_cost}).`
          : `Protected available SO reservation as fully paid with OR ${orRef}.`,
        order
      );
    },

    evaluateOrderClocksAtTime(input) {
      const replay = checkIdempotency<DualClockOrder>('p14.eval_clocks', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const evalTime = input.evaluation_time.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(evalTime)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and valid UTC evaluation timestamp are required.');
      }

      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before clock evaluation.');
      }

      const evalMs = Date.parse(evalTime);
      const effects: string[] = [];

      // Clock 1: Unpaid available SO reservation expiry (only active_unpaid expires)
      if (
        order.unpaid_available_state === 'active_unpaid' &&
        evalMs >= Date.parse(order.available_clock_expires_at)
      ) {
        const releasedMicro = toMicroUnits(order.unpaid_available_reserved.value);
        const curAvailMicro = toMicroUnits(order.available_to_allocate.value);
        order.available_to_allocate = fromMicroUnits(curAvailMicro + releasedMicro, order.quantity_scale);
        order.unpaid_available_reserved = fromMicroUnits(0n, order.quantity_scale);
        order.unpaid_available_state = 'expired_released';
        order.payment_hold_expiry_notice = true;
        order.expiry_history.push(
          `Expired unpaid available qty ${formatTrimmedMicro(releasedMicro)} at ${evalTime}`
        );
        effects.push(`released ${formatTrimmedMicro(releasedMicro)} unpaid available units`);
      }

      // Clock 2: Unfunded backorder deposit lapse
      if (
        order.backorder_state === 'awaiting_deposit' &&
        order.deposit_clock_expires_at &&
        evalMs >= Date.parse(order.deposit_clock_expires_at)
      ) {
        order.backorder_state = 'lapsed_unfunded';
        order.expiry_history.push(
          `Lapsed unfunded backorder qty ${order.accepted_backorder_qty.value} at ${evalTime}`
        );
        effects.push(`lapsed unfunded backorder (${order.accepted_backorder_qty.value} units)`);
      }

      // Pickup follow-up alert on paid/funded demand (never auto-frees stock!)
      if (
        order.pickup_deadline_at &&
        evalMs >= Date.parse(order.pickup_deadline_at) &&
        (toMicroUnits(order.paid_available_reserved.value) > 0n ||
          order.backorder_state === 'funded_protected')
      ) {
        order.overdue_pickup_alert = true;
        effects.push('raised overdue pickup follow-up alert (stock retained)');
      }

      order.version += 1;
      history.push({
        event_id: nextUlid(),
        target_id: order.order_id,
        action: 'evaluateOrderClocksAtTime',
        actor_user_id: actorId,
        reason: effects.join('; ') || 'No elapsed deadlines triggered',
        timestamp: evalTime,
      });

      return recordLedgerAndPersist(
        'p14.eval_clocks',
        actorId,
        order.order_id,
        input.idempotency_key,
        input,
        200,
        'CLOCKS_EVALUATED',
        effects.length > 0
          ? `Evaluated deadlines at ${evalTime}: ${effects.join('; ')}. RF, paid, and funded commitments untouched.`
          : `No deadlines elapsed at ${evalTime}; all active commitments retained.`,
        order
      );
    },

    consumeAvailableStockElsewhere(input) {
      const actorId = input.actor_user_id.trim();
      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (!isValidUnitQuantity({ value: input.consumed_quantity_value.trim(), quantity_scale: order.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Consumed quantity violates item precision.');
      }

      const consumeMicro = toMicroUnits(input.consumed_quantity_value.trim());
      const curAvailMicro = toMicroUnits(order.available_to_allocate.value);
      if (consumeMicro > curAvailMicro) {
        return fail(409, 'AVAILABILITY_CONFLICT', 'Cannot allocate more available stock than currently eligible.');
      }

      order.available_to_allocate = fromMicroUnits(curAvailMicro - consumeMicro, order.quantity_scale);
      const curUsableMicro = toMicroUnits(order.usable_on_hand.value);
      order.usable_on_hand = fromMicroUnits(
        curUsableMicro >= consumeMicro ? curUsableMicro - consumeMicro : 0n,
        order.quantity_scale
      );
      order.version += 1;

      lastAction = {
        ok: true,
        http_status: 200,
        code: 'OTHER_OFFICER_ALLOCATED_STOCK',
        message: `Simulated competing allocation of ${input.consumed_quantity_value.trim()} units by ${actorId || 'other officer'}. Available now: ${order.available_to_allocate.value}.`,
        data: structuredClone(order),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P14ActionResult<DualClockOrder>;
    },

    forwardShortageToPurchasingRepf(input) {
      const replay = checkIdempotency<RepfForwardRecord>('p14.forward_repf', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const forwardedAt = input.forwarded_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(forwardedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC forwarding timestamp are required.');
      }
      if (input.attempt_rf_rop_relabel) {
        return fail(
          409,
          'UNPAID_SO_RELABEL_FORBIDDEN',
          'Unpaid SO shortages cannot evade the verified buyer OR deposit gate by relabeling as RF or ROP.'
        );
      }

      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before RepF forwarding.');
      }
      if (!order.finance_cost_approved || order.cost_exceeds_sale_blocker) {
        return fail(
          409,
          'COST_APPROVAL_REQUIRED',
          'Finance procurement cost approval (and pricing clearance if cost exceeds sale) is required first.'
        );
      }
      if (order.backorder_state !== 'funded_protected' || !order.funded_or_reference) {
        return fail(
          409,
          'SO_SHORTAGE_OR_FUNDING_REQUIRED',
          'Cannot forward SO shortage to Purchasing without verified OR deposit covering approved procurement cost.'
        );
      }

      const repfRef = order.repf_reference ?? nextRepfRef();
      const forward: RepfForwardRecord = {
        forward_id: nextId(),
        order_id: order.order_id,
        so_reference: order.so_reference,
        repf_reference: repfRef,
        funded_or_reference: order.funded_or_reference,
        quantity: order.accepted_backorder_qty.value,
        approved_cost: order.estimated_procurement_cost,
        forwarded_by_user_id: actorId,
        forwarded_at: forwardedAt,
      };
      repfForwards.push(forward);
      order.repf_reference = repfRef;
      order.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: forward.forward_id,
        action: 'forwardShortageToPurchasingRepf',
        actor_user_id: actorId,
        reason: `${repfRef} backed by ${order.funded_or_reference}`,
        timestamp: forwardedAt,
      });

      return recordLedgerAndPersist(
        'p14.forward_repf',
        actorId,
        forward.forward_id,
        input.idempotency_key,
        input,
        201,
        'REPF_FUNDED_FORWARDED',
        `Forwarded funded shortage ${repfRef} (${forward.quantity} units) to Purchasing backed by ${forward.funded_or_reference}.`,
        forward
      );
    },

    resolveLateVerifiedPayment(input) {
      const replay = checkIdempotency<LatePaymentResolutionRecord>('p14.late_payment', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const orRef = input.or_reference.trim();
      const verifiedAt = input.verified_at.trim();
      if (!actorId || !orRef || !UTC_INSTANT_PATTERN.test(verifiedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID, OR reference, and UTC verification time are required.');
      }

      const order = trackedOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Tracked order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before late-payment resolution.');
      }
      if (!isValidUnitQuantity({ value: input.requested_quantity_value.trim(), quantity_scale: order.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Requested quantity violates item precision scale.');
      }

      const reqMicro = toMicroUnits(input.requested_quantity_value.trim());
      if (reqMicro <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Requested quantity must be positive.');
      }

      const availMicro = toMicroUnits(order.available_to_allocate.value);
      const availSnapshot = order.available_to_allocate.value;
      let outcome: LatePaymentResolutionRecord['outcome'];

      if (availMicro >= reqMicro) {
        order.available_to_allocate = fromMicroUnits(availMicro - reqMicro, order.quantity_scale);
        order.paid_available_reserved = fromMicroUnits(
          toMicroUnits(order.paid_available_reserved.value) + reqMicro,
          order.quantity_scale
        );
        order.expiry_history.push(`Late verified OR ${orRef} allocated ${input.requested_quantity_value.trim()} at ${verifiedAt} (no unpaid timer)`);
        outcome = 'allocated_fresh_paid';
      } else {
        outcome = input.fallback_choice;
        if (input.fallback_choice === 'convert_to_funded_backorder') {
          order.accepted_backorder_qty = fromMicroUnits(
            toMicroUnits(order.accepted_backorder_qty.value) + reqMicro,
            order.quantity_scale
          );
          order.backorder_state = 'funded_protected';
          order.funded_or_reference = orRef;
        }
        order.expiry_history.push(
          `Late verified OR ${orRef} insufficient stock (${availSnapshot} available) -> ${input.fallback_choice}`
        );
      }

      order.version += 1;
      const resolution: LatePaymentResolutionRecord = {
        resolution_id: nextId(),
        order_id: order.order_id,
        so_reference: order.so_reference,
        or_reference: orRef,
        requested_quantity: input.requested_quantity_value.trim(),
        available_at_check: availSnapshot,
        outcome,
        actor_user_id: actorId,
        resolved_at: verifiedAt,
      };
      lateResolutions.push(resolution);

      history.push({
        event_id: nextUlid(),
        target_id: resolution.resolution_id,
        action: `resolveLateVerifiedPayment:${outcome}`,
        actor_user_id: actorId,
        reason: `${orRef} checked against ${availSnapshot} available`,
        timestamp: verifiedAt,
      });

      return recordLedgerAndPersist(
        'p14.late_payment',
        actorId,
        resolution.resolution_id,
        input.idempotency_key,
        input,
        200,
        'LATE_PAYMENT_RESOLVED',
        outcome === 'allocated_fresh_paid'
          ? `Fresh check passed (${availSnapshot} available): allocated ${resolution.requested_quantity} paid units with no unpaid timer.`
          : `Fresh check prevented over-allocation (${availSnapshot} available): routed to ${outcome === 'convert_to_funded_backorder' ? 'accepted backorder' : 'Finance refund resolution'}.`,
        resolution
      );
    },

    lookupTwoClocksOperation(input) {
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
