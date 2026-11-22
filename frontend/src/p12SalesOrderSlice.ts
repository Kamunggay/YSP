import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P12_CONTEXT_STORAGE_KEY = 'ysp_p12_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type SalesOrderStatus =
  | 'draft'
  | 'pending_review'
  | 'returned'
  | 'approved'
  | 'canceled';

export type BuyerAcceptanceDecision =
  | 'accept_all'
  | 'accept_available_only'
  | 'decline_all';

export interface SaleStockPool {
  pool_id: string;
  chapter_id: string;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  usable_on_hand: UnitQuantity;
  existing_rf_reserved: UnitQuantity;
  so_reserved: UnitQuantity;
  available_to_allocate: UnitQuantity;
  unit_price: string;
  max_discount_amount: string;
  version: number;
}

export interface SoApprovalSnapshot {
  reviewer_user_id: string;
  duty_code: 'SALES_REVIEWER' | 'FINANCE_OFFICER';
  approved_material_version: number;
  price_override_approved: boolean;
  approved_at: string;
}

export interface SalesOrderRecord {
  so_id: string;
  chapter_id: string;
  reference: string | null;
  sales_officer_id: string;
  buyer_name: string;
  buyer_contact: string;
  buyer_has_login: false;
  variant_id: string;
  ordered_quantity: UnitQuantity;
  unit_price: string;
  discount_amount: string;
  net_amount_due: string;
  payment_terms: string;
  requested_at: string;
  fulfillment_arrangement: 'pickup' | 'delivery';
  status: SalesOrderStatus;
  version: number;
  material_version: number;
  approval: SoApprovalSnapshot | null;
  return_reason: string | null;
  cancel_reason: string | null;
  split_completed: boolean;
  reserved_available_quantity: string;
  backorder_shortage_quantity: string;
  accepted_backorder_quantity: string;
  declined_shortage_quantity: string;
  can_procure_shortage: boolean;
  available_reservation_created_at: string | null;
  available_reservation_expires_at: string | null;
  buyer_acceptance_decision: BuyerAcceptanceDecision | null;
  buyer_contact_channel: string | null;
  buyer_contact_outcome: string | null;
  backorder_accepted_at: string | null;
  backorder_deposit_expires_at: string | null;
  si_reference: string | null;
}

export interface FullOrderSalesInvoice {
  si_id: string;
  chapter_id: string;
  si_reference: string;
  so_id: string;
  so_reference: string;
  buyer_name: string;
  variant_id: string;
  available_quantity: string;
  backordered_quantity: string;
  unit_price: string;
  discount_amount: string;
  net_amount_due: string;
  issued_by_user_id: string;
  issued_at: string;
  is_proof_of_payment: false;
  release_authority_granted: false;
}

export interface P12HistoryEntry {
  event_id: string;
  so_id: string;
  version: number;
  material_version: number;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P12SummaryMetrics {
  usable_on_hand: string;
  so_reserved: string;
  available_to_allocate: string;
  active_backorders: string;
  issued_invoices: number;
}

export interface P12OperationLedgerEntry {
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

export interface P12ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P12LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P12EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  stock_pools: ReadonlyArray<SaleStockPool>;
  sales_orders: ReadonlyArray<SalesOrderRecord>;
  invoices: ReadonlyArray<FullOrderSalesInvoice>;
  history: ReadonlyArray<P12HistoryEntry>;
  summary: P12SummaryMetrics;
  operation_ledger: ReadonlyArray<P12OperationLedgerEntry>;
  last_action: P12ActionResult | null;
}

export interface P12EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  stock_pools?: ReadonlyArray<SaleStockPool> | undefined;
  sales_orders?: ReadonlyArray<SalesOrderRecord> | undefined;
  invoices?: ReadonlyArray<FullOrderSalesInvoice> | undefined;
  history?: ReadonlyArray<P12HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P12OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_so_ref_seq?: number | undefined;
  next_si_ref_seq?: number | undefined;
}

export interface P12SalesOrderEngine {
  getSnapshot: () => P12EngineSnapshot;
  configureSaleStockPool: (input: {
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    usable_on_hand_value: string;
    existing_rf_reserved_value: string;
    unit_price: string;
    max_discount_amount: string;
  }) => P12ActionResult<SaleStockPool>;
  createSalesOrderDraft: (input: {
    sales_officer_id: string;
    buyer_name: string;
    buyer_contact: string;
    variant_id: string;
    ordered_quantity_value: string;
    quantity_scale: number;
    unit_price: string;
    discount_amount: string;
    payment_terms: string;
    requested_at: string;
    fulfillment_arrangement: 'pickup' | 'delivery';
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  submitSalesOrder: (input: {
    so_id: string;
    actor_user_id: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  approveSalesOrder: (input: {
    so_id: string;
    reviewer_user_id: string;
    duty_code?: 'SALES_REVIEWER' | 'FINANCE_OFFICER' | undefined;
    price_override_approved?: boolean | undefined;
    approved_at?: string | undefined;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  returnSalesOrder: (input: {
    so_id: string;
    reviewer_user_id: string;
    reason: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  reviseSalesOrder: (input: {
    so_id: string;
    actor_user_id: string;
    ordered_quantity_value: string;
    unit_price: string;
    discount_amount: string;
    payment_terms: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  cancelSalesOrder: (input: {
    so_id: string;
    actor_user_id: string;
    reason: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  commitSoStockSplit: (input: {
    so_id: string;
    actor_user_id: string;
    split_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  recordBuyerAcceptance: (input: {
    so_id: string;
    actor_user_id: string;
    decision: BuyerAcceptanceDecision;
    contact_channel: string;
    contact_outcome: string;
    recorded_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<SalesOrderRecord>;
  issueFullOrderSalesInvoice: (input: {
    so_id: string;
    actor_user_id: string;
    issued_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P12ActionResult<FullOrderSalesInvoice>;
  lookupSalesOrderOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P12ActionResult<P12LookupResult>;
}

function readStoredP12Options(): P12EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P12_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P12EngineOptions;
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
  const target = new Date(ms + hours * 3600 * 1000);
  return target.toISOString();
}

export function createP12SalesOrderEngine(options?: P12EngineOptions): P12SalesOrderEngine {
  const seed = options ?? readStoredP12Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 12000;
  let soRefSeq = seed.next_so_ref_seq ?? 0;
  let siRefSeq = seed.next_si_ref_seq ?? 0;

  const stockPools: SaleStockPool[] = (seed.stock_pools ?? []).map((p) => structuredClone(p));
  const salesOrders: SalesOrderRecord[] = (seed.sales_orders ?? []).map((s) => structuredClone(s));
  const invoices: FullOrderSalesInvoice[] = (seed.invoices ?? []).map((inv) =>
    structuredClone(inv)
  );
  const history: P12HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P12OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P12ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P12${String(seq).padStart(19, '0')}`;
  }

  function nextSoRef(): string {
    soRefSeq += 1;
    return `${chapterPrefix}-SO-2026-${String(soRefSeq).padStart(6, '0')}`;
  }

  function nextSiRef(): string {
    siRefSeq += 1;
    return `${chapterPrefix}-SI-2026-${String(siRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P12SummaryMetrics {
    let usableMicro = 0n;
    let soReservedMicro = 0n;
    let availableMicro = 0n;
    let backorderMicro = 0n;

    for (const pool of stockPools) {
      usableMicro += toMicroUnits(pool.usable_on_hand.value);
      soReservedMicro += toMicroUnits(pool.so_reserved.value);
      availableMicro += toMicroUnits(pool.available_to_allocate.value);
    }

    for (const so of salesOrders) {
      if (so.status !== 'canceled' && so.can_procure_shortage) {
        backorderMicro += toMicroUnits(so.accepted_backorder_quantity);
      }
    }

    return {
      usable_on_hand: formatTrimmedMicro(usableMicro),
      so_reserved: formatTrimmedMicro(soReservedMicro),
      available_to_allocate: formatTrimmedMicro(availableMicro),
      active_backorders: formatTrimmedMicro(backorderMicro),
      issued_invoices: invoices.length,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P12_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          stock_pools: stockPools,
          sales_orders: salesOrders,
          invoices: invoices,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_so_ref_seq: soRefSeq,
          next_si_ref_seq: siRefSeq,
        })
      );
    } catch {
      // Ignore storage quota exceptions cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P12ActionResult<T> {
    const res: P12ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P12ActionResult<T> {
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
    const res: P12ActionResult<T> = {
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
  ): P12ActionResult<T> | null {
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
    const replayRes: P12ActionResult<T> = {
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

  function computeNetAmount(qtyValue: string, unitPrice: string, discountAmount: string): string {
    const qtyMicro = toMicroUnits(qtyValue);
    const priceCents = toCents(unitPrice);
    const discountCents = toCents(discountAmount);
    const grossCents = (qtyMicro * priceCents + 500000n) / 1000000n;
    const netCents = grossCents > discountCents ? grossCents - discountCents : 0n;
    return fromCents(netCents);
  }

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        stock_pools: stockPools.map((p) => structuredClone(p)),
        sales_orders: salesOrders.map((s) => structuredClone(s)),
        invoices: invoices.map((inv) => structuredClone(inv)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    configureSaleStockPool(input) {
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      if (!variantId || !itemName) {
        return fail(422, 'INVALID_STOCK_POOL', 'Variant ID and item name are required.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Quantity precision scale must be an integer between 0 and 6.');
      }
      if (
        !isValidUnitQuantity({ value: input.usable_on_hand_value.trim(), quantity_scale: input.quantity_scale }) ||
        !isValidUnitQuantity({
          value: input.existing_rf_reserved_value.trim(),
          quantity_scale: input.quantity_scale,
        })
      ) {
        return fail(422, 'INVALID_QUANTITY', 'Stock quantities violate approved item precision scale.');
      }
      if (!MONEY_PATTERN.test(input.unit_price.trim()) || !MONEY_PATTERN.test(input.max_discount_amount.trim())) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Unit price and max discount must use exact two-decimal format (e.g. 250.00).');
      }

      const usableMicro = toMicroUnits(input.usable_on_hand_value.trim());
      const rfMicro = toMicroUnits(input.existing_rf_reserved_value.trim());
      if (rfMicro > usableMicro) {
        return fail(422, 'INVALID_STOCK_POOL', 'Existing RF reserved stock cannot exceed usable stockroom on-hand.');
      }

      const existing = stockPools.find((p) => p.variant_id === variantId);
      const soReservedMicro = existing ? toMicroUnits(existing.so_reserved.value) : 0n;
      const availableMicro =
        usableMicro > rfMicro + soReservedMicro ? usableMicro - rfMicro - soReservedMicro : 0n;

      const updated: SaleStockPool = {
        pool_id: existing ? existing.pool_id : nextId(),
        chapter_id: chapterId,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        usable_on_hand: fromMicroUnits(usableMicro, input.quantity_scale),
        existing_rf_reserved: fromMicroUnits(rfMicro, input.quantity_scale),
        so_reserved: fromMicroUnits(soReservedMicro, input.quantity_scale),
        available_to_allocate: fromMicroUnits(availableMicro, input.quantity_scale),
        unit_price: input.unit_price.trim(),
        max_discount_amount: input.max_discount_amount.trim(),
        version: existing ? existing.version + 1 : 1,
      };

      if (existing) {
        const idx = stockPools.indexOf(existing);
        stockPools[idx] = updated;
      } else {
        stockPools.push(updated);
      }

      lastAction = {
        ok: true,
        http_status: 200,
        code: 'SALE_STOCK_POOL_CONFIGURED',
        message: `Configured eligible sale stock pool for "${itemName}" (${updated.available_to_allocate.value} available).`,
        data: structuredClone(updated),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P12ActionResult<SaleStockPool>;
    },

    createSalesOrderDraft(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.create_so_draft', input.idempotency_key, input);
      if (replay) return replay;

      const officerId = input.sales_officer_id.trim();
      const buyerName = input.buyer_name.trim();
      const buyerContact = input.buyer_contact.trim();
      const variantId = input.variant_id.trim();
      const terms = input.payment_terms.trim();

      if (!officerId || !buyerName || !buyerContact || !variantId || !terms) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Sales officer ID, buyer details, variant ID, and payment terms are required.');
      }
      if (!UTC_INSTANT_PATTERN.test(input.requested_at.trim())) {
        return fail(422, 'INVALID_TIMESTAMP', 'Requested date must be a valid UTC ISO-8601 timestamp ending in Z.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Quantity precision scale must be between 0 and 6.');
      }
      if (!isValidUnitQuantity({ value: input.ordered_quantity_value.trim(), quantity_scale: input.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Ordered quantity exceeds or violates precision scale.');
      }
      if (toMicroUnits(input.ordered_quantity_value.trim()) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Ordered quantity must be greater than zero.');
      }
      if (!MONEY_PATTERN.test(input.unit_price.trim()) || !MONEY_PATTERN.test(input.discount_amount.trim())) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Unit price and discount must use exact two-decimal format.');
      }

      const soId = nextId();
      const qtyVal = input.ordered_quantity_value.trim();
      const netDue = computeNetAmount(qtyVal, input.unit_price.trim(), input.discount_amount.trim());

      const record: SalesOrderRecord = {
        so_id: soId,
        chapter_id: chapterId,
        reference: null,
        sales_officer_id: officerId,
        buyer_name: buyerName,
        buyer_contact: buyerContact,
        buyer_has_login: false,
        variant_id: variantId,
        ordered_quantity: { value: qtyVal, quantity_scale: input.quantity_scale },
        unit_price: input.unit_price.trim(),
        discount_amount: input.discount_amount.trim(),
        net_amount_due: netDue,
        payment_terms: terms,
        requested_at: input.requested_at.trim(),
        fulfillment_arrangement: input.fulfillment_arrangement,
        status: 'draft',
        version: 1,
        material_version: 1,
        approval: null,
        return_reason: null,
        cancel_reason: null,
        split_completed: false,
        reserved_available_quantity: '0',
        backorder_shortage_quantity: '0',
        accepted_backorder_quantity: '0',
        declined_shortage_quantity: '0',
        can_procure_shortage: false,
        available_reservation_created_at: null,
        available_reservation_expires_at: null,
        buyer_acceptance_decision: null,
        buyer_contact_channel: null,
        buyer_contact_outcome: null,
        backorder_accepted_at: null,
        backorder_deposit_expires_at: null,
        si_reference: null,
      };

      salesOrders.push(record);
      history.push({
        event_id: nextUlid(),
        so_id: soId,
        version: 1,
        material_version: 1,
        action: 'createSalesOrderDraft',
        actor_user_id: officerId,
        reason: null,
        timestamp: input.requested_at.trim(),
      });

      return recordLedgerAndPersist(
        'p12.create_so_draft',
        officerId,
        soId,
        input.idempotency_key,
        input,
        201,
        'SO_DRAFT_CREATED',
        `Saved draft sales order for buyer "${buyerName}" (qty ${qtyVal}, net PHP ${netDue}).`,
        record
      );
    },

    submitSalesOrder(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.submit_so', input.idempotency_key, input);
      if (replay) return replay;

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', `Expected version ${input.expected_version}, current is ${so.version}.`);
      }
      if (so.status !== 'draft') {
        return fail(409, 'INVALID_TRANSITION', `Cannot submit sales order from "${so.status}" state.`);
      }

      so.reference = so.reference ?? nextSoRef();
      so.status = 'pending_review';
      so.version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'submitSalesOrder',
        actor_user_id: input.actor_user_id.trim(),
        reason: null,
        timestamp: so.requested_at,
      });

      return recordLedgerAndPersist(
        'p12.submit_so',
        input.actor_user_id.trim(),
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_SUBMITTED',
        `Submitted Sales Order ${so.reference} for independent review.`,
        so
      );
    },

    approveSalesOrder(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.approve_so', input.idempotency_key, input);
      if (replay) return replay;

      const reviewerId = input.reviewer_user_id.trim();
      if (!reviewerId) return fail(422, 'INVALID_ACTOR', 'Reviewer identity is required.');

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version || so.material_version !== input.expected_material_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version or material snapshot changed before review completed.');
      }
      if (so.status !== 'pending_review') {
        return fail(409, 'INVALID_TRANSITION', `Only pending sales orders can be approved (current: ${so.status}).`);
      }
      if (reviewerId === so.sales_officer_id) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'Recording sales officer cannot self-approve their own sales order.'
        );
      }

      const pool = stockPools.find((p) => p.variant_id === so.variant_id);
      const overrideApproved = input.price_override_approved === true;
      if (pool && toCents(so.discount_amount) > toCents(pool.max_discount_amount) && !overrideApproved) {
        return fail(
          422,
          'UNAPPROVED_DISCOUNT_EXCEEDS_LIMIT',
          `Discount PHP ${so.discount_amount} exceeds approved max PHP ${pool.max_discount_amount} without an authorized price override.`
        );
      }

      const approvedAt = input.approved_at?.trim() || so.requested_at;
      if (!UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(422, 'INVALID_TIMESTAMP', 'Approval timestamp must be UTC ISO-8601.');
      }

      so.status = 'approved';
      so.version += 1;
      so.approval = {
        reviewer_user_id: reviewerId,
        duty_code: input.duty_code ?? 'SALES_REVIEWER',
        approved_material_version: so.material_version,
        price_override_approved: overrideApproved,
        approved_at: approvedAt,
      };

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'approveSalesOrder',
        actor_user_id: reviewerId,
        reason: null,
        timestamp: approvedAt,
      });

      return recordLedgerAndPersist(
        'p12.approve_so',
        reviewerId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_APPROVED',
        `Approved Sales Order ${so.reference} by independent reviewer ${reviewerId}.`,
        so
      );
    },

    returnSalesOrder(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.return_so', input.idempotency_key, input);
      if (replay) return replay;

      const reason = input.reason.trim();
      const reviewerId = input.reviewer_user_id.trim();
      if (!reviewerId || !reason) {
        return fail(422, 'REASON_REQUIRED', 'Reviewer identity and return reason are required.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before return action.');
      }
      if (so.status !== 'pending_review') {
        return fail(409, 'INVALID_TRANSITION', `Cannot return sales order from "${so.status}" state.`);
      }

      so.status = 'returned';
      so.return_reason = reason;
      so.version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'returnSalesOrder',
        actor_user_id: reviewerId,
        reason,
        timestamp: so.requested_at,
      });

      return recordLedgerAndPersist(
        'p12.return_so',
        reviewerId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_RETURNED',
        `Returned Sales Order ${so.reference} for correction: ${reason}`,
        so
      );
    },

    reviseSalesOrder(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.revise_so', input.idempotency_key, input);
      if (replay) return replay;

      const reason = input.reason.trim();
      const actorId = input.actor_user_id.trim();
      if (!actorId || !reason) {
        return fail(422, 'REASON_REQUIRED', 'Actor identity and material revision reason are required.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version || so.material_version !== input.expected_material_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before revision.');
      }
      if (so.status === 'canceled' || so.split_completed || so.si_reference !== null) {
        return fail(
          409,
          'REVISION_LOCKED',
          'Cannot revise a sales order in-place after cancellation, stock split commitment, or SI issuance.'
        );
      }

      const qtyVal = input.ordered_quantity_value.trim();
      if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: so.ordered_quantity.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Revised quantity violates approved item precision scale.');
      }
      if (toMicroUnits(qtyVal) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Revised quantity must be positive.');
      }
      if (!MONEY_PATTERN.test(input.unit_price.trim()) || !MONEY_PATTERN.test(input.discount_amount.trim())) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Revised price and discount must use exact two-decimal format.');
      }

      so.ordered_quantity = { value: qtyVal, quantity_scale: so.ordered_quantity.quantity_scale };
      so.unit_price = input.unit_price.trim();
      so.discount_amount = input.discount_amount.trim();
      so.payment_terms = input.payment_terms.trim() || so.payment_terms;
      so.net_amount_due = computeNetAmount(qtyVal, so.unit_price, so.discount_amount);
      so.approval = null;
      so.status = 'draft';
      so.version += 1;
      so.material_version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'reviseSalesOrder',
        actor_user_id: actorId,
        reason,
        timestamp: so.requested_at,
      });

      return recordLedgerAndPersist(
        'p12.revise_so',
        actorId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_REVISED_TO_DRAFT',
        `Revised Sales Order ${so.reference ?? so.so_id} (material version v${so.material_version}); prior approval invalidated for fresh review.`,
        so
      );
    },

    cancelSalesOrder(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.cancel_so', input.idempotency_key, input);
      if (replay) return replay;

      const reason = input.reason.trim();
      const actorId = input.actor_user_id.trim();
      if (!actorId || !reason) {
        return fail(422, 'REASON_REQUIRED', 'Cancellation reason and actor identity are required.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before cancellation.');
      }
      if (so.status === 'canceled') {
        return fail(409, 'ALREADY_CANCELED', 'Sales order is already canceled.');
      }

      // Release reserved available stock if previously split
      const reservedMicro = toMicroUnits(so.reserved_available_quantity);
      if (reservedMicro > 0n) {
        const pool = stockPools.find((p) => p.variant_id === so.variant_id);
        if (pool) {
          const curSoReserved = toMicroUnits(pool.so_reserved.value);
          const nextSoReserved = curSoReserved > reservedMicro ? curSoReserved - reservedMicro : 0n;
          const usableMicro = toMicroUnits(pool.usable_on_hand.value);
          const rfMicro = toMicroUnits(pool.existing_rf_reserved.value);
          const nextAvail = usableMicro - rfMicro - nextSoReserved;
          pool.so_reserved = fromMicroUnits(nextSoReserved, pool.quantity_scale);
          pool.available_to_allocate = fromMicroUnits(nextAvail > 0n ? nextAvail : 0n, pool.quantity_scale);
          pool.version += 1;
        }
        so.reserved_available_quantity = '0';
      }

      so.can_procure_shortage = false;
      so.accepted_backorder_quantity = '0';
      so.status = 'canceled';
      so.cancel_reason = reason;
      so.version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'cancelSalesOrder',
        actor_user_id: actorId,
        reason,
        timestamp: so.requested_at,
      });

      return recordLedgerAndPersist(
        'p12.cancel_so',
        actorId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_CANCELED',
        `Canceled Sales Order ${so.reference ?? so.so_id} and released any active reservation while retaining history.`,
        so
      );
    },

    commitSoStockSplit(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.commit_split', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const splitAt = input.split_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(splitAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and valid UTC timestamp are required for stock split.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before stock split.');
      }
      if (so.status !== 'approved' || !so.approval) {
        return fail(
          409,
          'SO_NOT_APPROVED',
          'Only independently approved sales orders may reserve stock or split shortages.'
        );
      }
      if (so.split_completed) {
        return fail(409, 'ALREADY_SPLIT', 'Stock split has already been committed for this sales order.');
      }

      const pool = stockPools.find((p) => p.variant_id === so.variant_id);
      if (!pool) {
        return fail(404, 'STOCK_POOL_MISSING', `No eligible sale stock pool configured for variant "${so.variant_id}".`);
      }

      const orderedMicro = toMicroUnits(so.ordered_quantity.value);
      const availMicro = toMicroUnits(pool.available_to_allocate.value);
      const reservedMicro = orderedMicro <= availMicro ? orderedMicro : availMicro;
      const shortageMicro = orderedMicro - reservedMicro;

      const newSoReservedMicro = toMicroUnits(pool.so_reserved.value) + reservedMicro;
      const newAvailMicro = availMicro - reservedMicro;

      pool.so_reserved = fromMicroUnits(newSoReservedMicro, pool.quantity_scale);
      pool.available_to_allocate = fromMicroUnits(newAvailMicro, pool.quantity_scale);
      pool.version += 1;

      so.split_completed = true;
      so.reserved_available_quantity = formatTrimmedMicro(reservedMicro);
      so.backorder_shortage_quantity = formatTrimmedMicro(shortageMicro);
      so.accepted_backorder_quantity = formatTrimmedMicro(shortageMicro);
      so.available_reservation_created_at = reservedMicro > 0n ? splitAt : null;
      so.available_reservation_expires_at = reservedMicro > 0n ? addHoursUtc(splitAt, 48) : null;
      // Backorder deposit clock remains null until recorded buyer acceptance!
      so.backorder_accepted_at = null;
      so.backorder_deposit_expires_at = null;
      so.version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'commitSoStockSplit',
        actor_user_id: actorId,
        reason: null,
        timestamp: splitAt,
      });

      return recordLedgerAndPersist(
        'p12.commit_split',
        actorId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'SO_STOCK_SPLIT_COMMITTED',
        `Reserved ${so.reserved_available_quantity} available unit(s) (48h clock started) and recorded ${so.backorder_shortage_quantity} unit(s) backorder shortage without changing usable on-hand.`,
        so
      );
    },

    recordBuyerAcceptance(input) {
      const replay = checkIdempotency<SalesOrderRecord>('p12.buyer_acceptance', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const channel = input.contact_channel.trim();
      const outcome = input.contact_outcome.trim();
      const recordedAt = input.recorded_at.trim();

      if (!actorId || !channel || !outcome || !UTC_INSTANT_PATTERN.test(recordedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor, communication channel/outcome, and UTC recorded timestamp are required.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before buyer acceptance.');
      }
      if (!so.split_completed) {
        return fail(409, 'STOCK_SPLIT_REQUIRED', 'Commit stock split before recording buyer acceptance.');
      }

      so.buyer_acceptance_decision = input.decision;
      so.buyer_contact_channel = channel;
      so.buyer_contact_outcome = outcome;

      if (input.decision === 'accept_all') {
        const shortageMicro = toMicroUnits(so.backorder_shortage_quantity);
        so.accepted_backorder_quantity = so.backorder_shortage_quantity;
        so.declined_shortage_quantity = '0';
        so.can_procure_shortage = shortageMicro > 0n;
        so.backorder_accepted_at = shortageMicro > 0n ? recordedAt : null;
        so.backorder_deposit_expires_at = shortageMicro > 0n ? addHoursUtc(recordedAt, 48) : null;
      } else if (input.decision === 'accept_available_only') {
        so.declined_shortage_quantity = so.backorder_shortage_quantity;
        so.accepted_backorder_quantity = '0';
        so.can_procure_shortage = false;
        so.backorder_accepted_at = null;
        so.backorder_deposit_expires_at = null;
      } else {
        // decline_all -> release available reservation back to available pool and cancel SO
        const reservedMicro = toMicroUnits(so.reserved_available_quantity);
        if (reservedMicro > 0n) {
          const pool = stockPools.find((p) => p.variant_id === so.variant_id);
          if (pool) {
            const curSoRes = toMicroUnits(pool.so_reserved.value);
            const nextSoRes = curSoRes > reservedMicro ? curSoRes - reservedMicro : 0n;
            const usableMicro = toMicroUnits(pool.usable_on_hand.value);
            const rfMicro = toMicroUnits(pool.existing_rf_reserved.value);
            pool.so_reserved = fromMicroUnits(nextSoRes, pool.quantity_scale);
            pool.available_to_allocate = fromMicroUnits(usableMicro - rfMicro - nextSoRes, pool.quantity_scale);
            pool.version += 1;
          }
          so.reserved_available_quantity = '0';
        }
        so.declined_shortage_quantity = so.backorder_shortage_quantity;
        so.accepted_backorder_quantity = '0';
        so.can_procure_shortage = false;
        so.status = 'canceled';
        so.cancel_reason = 'Buyer declined split/backorder terms';
      }

      so.version += 1;
      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: `recordBuyerAcceptance:${input.decision}`,
        actor_user_id: actorId,
        reason: outcome,
        timestamp: recordedAt,
      });

      return recordLedgerAndPersist(
        'p12.buyer_acceptance',
        actorId,
        so.so_id,
        input.idempotency_key,
        input,
        200,
        'BUYER_ACCEPTANCE_RECORDED',
        input.decision === 'accept_all'
          ? `Recorded buyer acceptance; separate 48h deposit clock started for ${so.accepted_backorder_quantity} backordered unit(s).`
          : input.decision === 'accept_available_only'
            ? `Buyer accepted available quantity only; ${so.declined_shortage_quantity} shortage unit(s) declined and blocked from procurement.`
            : 'Buyer declined order; active available reservation released and SO canceled.',
        so
      );
    },

    issueFullOrderSalesInvoice(input) {
      const replay = checkIdempotency<FullOrderSalesInvoice>('p12.issue_si', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const issuedAt = input.issued_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(issuedAt)) {
        return fail(422, 'INVALID_INPUT', 'Issuing officer ID and valid UTC timestamp are required.');
      }

      const so = salesOrders.find((s) => s.so_id === input.so_id);
      if (!so) return fail(404, 'RESOURCE_NOT_FOUND', 'Sales order not found.');
      if (so.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Sales order version changed before invoice issuance.');
      }
      if (so.status !== 'approved' || !so.split_completed) {
        return fail(
          409,
          'SI_PREREQUISITES_UNMET',
          'Full-order SI requires an approved sales order with committed stock split.'
        );
      }
      if (so.si_reference !== null) {
        return fail(409, 'SI_ALREADY_ISSUED', `Sales Invoice ${so.si_reference} has already been issued for this order.`);
      }

      const siRef = nextSiRef();
      const si: FullOrderSalesInvoice = {
        si_id: nextId(),
        chapter_id: chapterId,
        si_reference: siRef,
        so_id: so.so_id,
        so_reference: so.reference ?? so.so_id,
        buyer_name: so.buyer_name,
        variant_id: so.variant_id,
        available_quantity: so.reserved_available_quantity,
        backordered_quantity: so.accepted_backorder_quantity,
        unit_price: so.unit_price,
        discount_amount: so.discount_amount,
        net_amount_due: so.net_amount_due,
        issued_by_user_id: actorId,
        issued_at: issuedAt,
        is_proof_of_payment: false,
        release_authority_granted: false,
      };

      invoices.push(si);
      so.si_reference = siRef;
      so.version += 1;

      history.push({
        event_id: nextUlid(),
        so_id: so.so_id,
        version: so.version,
        material_version: so.material_version,
        action: 'issueFullOrderSalesInvoice',
        actor_user_id: actorId,
        reason: siRef,
        timestamp: issuedAt,
      });

      return recordLedgerAndPersist(
        'p12.issue_si',
        actorId,
        si.si_id,
        input.idempotency_key,
        input,
        201,
        'SI_ISSUED',
        `Issued full-order Sales Invoice ${siRef} (Available ${si.available_quantity}, Backordered ${si.backordered_quantity}). Billing notice only — grants zero release authority.`,
        si
      );
    },

    lookupSalesOrderOperation(input) {
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
