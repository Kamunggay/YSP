import { computeDeterministicHash } from './canonicalHash';

export const P21_CONTEXT_STORAGE_KEY = 'ysp_p21_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type BoothPaymentChannel = 'cash' | 'official_gcash';

export interface BoothCatalogItem {
  item_id: string;
  chapter_id: string;
  event_code: string;
  sku_code: string;
  item_name: string;
  approved_unit_price: string;
  initial_booth_custody_qty: string;
  booth_custody_qty: string;
  stockroom_usable_qty: string;
  cart_qty: string;
  version: number;
}

export interface BoothImmediateSaleRecord {
  sale_id: string;
  or_reference: string;
  event_code: string;
  item_id: string;
  sku_code: string;
  item_name: string;
  quantity_sold: string;
  unit_price: string;
  total_amount: string;
  payment_channel: BoothPaymentChannel;
  payment_reference: string;
  gcash_credit_verified: boolean;
  cashier_user_id: string;
  stockroom_delta: string;
  booth_custody_delta: string;
  eligible_for_booth_claim_f: boolean;
  so_created_count: number;
  si_created_count: number;
  cdr_created_count: number;
  sold_at: string;
}

export interface Track1SoHandoffLead {
  handoff_id: string;
  so_lead_reference: string;
  event_code: string;
  sku_code: string;
  buyer_name: string;
  requested_qty: string;
  cashier_user_id: string;
  creates_booth_backorder: boolean;
  notes: string;
  recorded_at: string;
}

export interface P21HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P21SummaryMetrics {
  booth_custody_total: string;
  stockroom_usable_total: string;
  cart_total_qty: string;
  verified_booth_sales_total: string;
  or_issued_count: number;
  track1_so_handoff_count: number;
}

export interface P21OperationLedgerEntry {
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

export interface P21ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P21LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P21EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  catalog_items: ReadonlyArray<BoothCatalogItem>;
  immediate_sales: ReadonlyArray<BoothImmediateSaleRecord>;
  track1_handoffs: ReadonlyArray<Track1SoHandoffLead>;
  history: ReadonlyArray<P21HistoryEntry>;
  summary: P21SummaryMetrics;
  operation_ledger: ReadonlyArray<P21OperationLedgerEntry>;
  last_action: P21ActionResult | null;
}

export interface P21EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  catalog_items?: ReadonlyArray<BoothCatalogItem> | undefined;
  immediate_sales?: ReadonlyArray<BoothImmediateSaleRecord> | undefined;
  track1_handoffs?: ReadonlyArray<Track1SoHandoffLead> | undefined;
  history?: ReadonlyArray<P21HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P21OperationLedgerEntry> | undefined;
}

export interface P21BoothSaleOrEngine {
  getSnapshot: () => P21EngineSnapshot;
  registerCheckedOutBoothCatalogItem: (input: {
    event_code: string;
    sku_code: string;
    item_name: string;
    approved_unit_price: string;
    booth_custody_qty: string;
    stockroom_usable_qty: string;
    idempotency_key?: string | undefined;
  }) => P21ActionResult<BoothCatalogItem>;
  adjustBoothCartQuantity: (input: {
    item_id: string;
    mode: 'increment' | 'decrement' | 'set_exact';
    quantity_value?: string | undefined;
  }) => P21ActionResult<BoothCatalogItem>;
  resetUnpostedBoothCart: (input: {
    item_id: string;
    confirm_non_empty_reset: boolean;
  }) => P21ActionResult<BoothCatalogItem>;
  simulateConcurrentBoothStockChange: (input: {
    item_id: string;
    new_booth_custody_qty: string;
    actor_user_id: string;
  }) => P21ActionResult<BoothCatalogItem>;
  commitImmediateBoothSale: (input: {
    item_id: string;
    cashier_user_id: string;
    submitted_unit_price: string;
    payment_channel: BoothPaymentChannel;
    gcash_credit_verified: boolean;
    payment_reference: string;
    sold_at: string;
    idempotency_key?: string | undefined;
  }) => P21ActionResult<BoothImmediateSaleRecord>;
  handoffOutOfStockToTrack1So: (input: {
    event_code: string;
    sku_code: string;
    buyer_name: string;
    requested_qty: string;
    cashier_user_id: string;
    recorded_at: string;
    notes: string;
    idempotency_key?: string | undefined;
  }) => P21ActionResult<Track1SoHandoffLead>;
  lookupBoothSaleOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P21ActionResult<P21LookupResult>;
}

function readStoredP21Options(): P21EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P21_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P21EngineOptions;
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
 * Creates a chapter-scoped booth immediate sale, cart, and Official Receipt engine.
 * Debits booth custody once on committed sales without modifying stockroom balance or fabricating SOs.
 */
export function createP21BoothSaleOrEngine(options?: P21EngineOptions): P21BoothSaleOrEngine {
  const seed = options ?? readStoredP21Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 21000;

  const catalogItems: BoothCatalogItem[] = (seed.catalog_items ?? []).map((c) => structuredClone(c));
  const immediateSales: BoothImmediateSaleRecord[] = (seed.immediate_sales ?? []).map((s) =>
    structuredClone(s)
  );
  const track1Handoffs: Track1SoHandoffLead[] = (seed.track1_handoffs ?? []).map((t) =>
    structuredClone(t)
  );
  const history: P21HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P21OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P21ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P21${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P21SummaryMetrics {
    let boothTotal = 0n;
    let stockroomTotal = 0n;
    let cartTotal = 0n;
    for (const item of catalogItems) {
      boothTotal += BigInt(item.booth_custody_qty);
      stockroomTotal += BigInt(item.stockroom_usable_qty);
      cartTotal += BigInt(item.cart_qty);
    }
    let salesCents = 0n;
    for (const sale of immediateSales) {
      salesCents += toCents(sale.total_amount);
    }
    return {
      booth_custody_total: boothTotal.toString(),
      stockroom_usable_total: stockroomTotal.toString(),
      cart_total_qty: cartTotal.toString(),
      verified_booth_sales_total: fromCents(salesCents),
      or_issued_count: immediateSales.length,
      track1_so_handoff_count: track1Handoffs.length,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P21_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          catalog_items: catalogItems,
          immediate_sales: immediateSales,
          track1_handoffs: track1Handoffs,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors in sandboxed contexts.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P21ActionResult<T> {
    const res: P21ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P21ActionResult<T> | null {
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
    const replayRes: P21ActionResult<T> = {
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
  ): P21ActionResult<T> {
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
    const res: P21ActionResult<T> = {
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
        catalog_items: catalogItems.map((c) => structuredClone(c)),
        immediate_sales: immediateSales.map((s) => structuredClone(s)),
        track1_handoffs: track1Handoffs.map((t) => structuredClone(t)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerCheckedOutBoothCatalogItem(input) {
      const replay = checkIdempotency<BoothCatalogItem>(
        'p21.register_item',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const evCode = input.event_code.trim();
      const sku = input.sku_code.trim();
      const name = input.item_name.trim();
      const price = input.approved_unit_price.trim();
      const boothQty = input.booth_custody_qty.trim();
      const stockQty = input.stockroom_usable_qty.trim();

      if (!evCode || !sku || !name) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Event code, SKU code, and item name are required.');
      }
      if (!MONEY_PATTERN.test(price) || toCents(price) <= 0n) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Approved unit price must use exact two-decimal format.');
      }
      if (!INTEGER_PATTERN.test(boothQty) || !INTEGER_PATTERN.test(stockQty)) {
        return fail(422, 'INVALID_QUANTITY', 'Custody and stockroom quantities must be whole numbers.');
      }

      const item: BoothCatalogItem = {
        item_id: nextId(),
        chapter_id: chapterId,
        event_code: evCode,
        sku_code: sku,
        item_name: name,
        approved_unit_price: price,
        initial_booth_custody_qty: boothQty,
        booth_custody_qty: boothQty,
        stockroom_usable_qty: stockQty,
        cart_qty: '0',
        version: 1,
      };
      catalogItems.push(item);

      history.push({
        event_id: nextId(),
        target_id: item.item_id,
        action: 'booth_catalog_item_registered',
        actor_user_id: 'system',
        reason: `${evCode} / ${sku} (${boothQty} booth custody, PHP ${price})`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p21.register_item',
        'system',
        item.item_id,
        input.idempotency_key,
        input,
        201,
        'BOOTH_CATALOG_ITEM_REGISTERED',
        `Loaded ${sku} (${boothQty} units in booth custody) at approved price PHP ${price}.`,
        structuredClone(item)
      );
    },

    adjustBoothCartQuantity(input) {
      const item = catalogItems.find((c) => c.item_id === input.item_id);
      if (!item) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth catalog item not found.');

      const current = BigInt(item.cart_qty);
      let nextVal: bigint;
      if (input.mode === 'increment') {
        nextVal = current + 1n;
      } else if (input.mode === 'decrement') {
        nextVal = current > 0n ? current - 1n : 0n;
      } else {
        const raw = (input.quantity_value ?? '').trim();
        if (!INTEGER_PATTERN.test(raw)) {
          return fail(422, 'INVALID_QUANTITY', 'Cart quantity must be a non-negative whole number.');
        }
        nextVal = BigInt(raw);
      }

      item.cart_qty = nextVal.toString();
      persistSnapshot();
      const res: P21ActionResult<BoothCatalogItem> = {
        ok: true,
        http_status: 200,
        code: 'BOOTH_CART_UPDATED',
        message: `Unposted cart quantity for ${item.sku_code} updated to ${item.cart_qty}.`,
        data: structuredClone(item),
      };
      lastAction = res;
      return res;
    },

    resetUnpostedBoothCart(input) {
      const item = catalogItems.find((c) => c.item_id === input.item_id);
      if (!item) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth catalog item not found.');

      if (BigInt(item.cart_qty) > 0n && !input.confirm_non_empty_reset) {
        return fail(
          409,
          'CART_RESET_CONFIRMATION_REQUIRED',
          'Confirm reset before clearing a non-empty unposted cart.'
        );
      }

      item.cart_qty = '0';
      persistSnapshot();
      const res: P21ActionResult<BoothCatalogItem> = {
        ok: true,
        http_status: 200,
        code: 'UNPOSTED_CART_RESET',
        message: `Cleared unposted cart for ${item.sku_code}; committed sales remain untouched.`,
        data: structuredClone(item),
      };
      lastAction = res;
      return res;
    },

    simulateConcurrentBoothStockChange(input) {
      const item = catalogItems.find((c) => c.item_id === input.item_id);
      if (!item) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth catalog item not found.');

      const qtyStr = input.new_booth_custody_qty.trim();
      const actor = input.actor_user_id.trim();
      if (!actor || !INTEGER_PATTERN.test(qtyStr)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and non-negative whole custody quantity required.');
      }

      item.booth_custody_qty = qtyStr;
      item.version += 1;
      history.push({
        event_id: nextId(),
        target_id: item.item_id,
        action: 'concurrent_booth_stock_changed',
        actor_user_id: actor,
        reason: `Booth custody changed concurrently to ${qtyStr}`,
        timestamp: new Date().toISOString(),
      });
      persistSnapshot();

      const res: P21ActionResult<BoothCatalogItem> = {
        ok: true,
        http_status: 200,
        code: 'CONCURRENT_STOCK_UPDATED',
        message: `Updated ${item.sku_code} booth custody to ${qtyStr} (fresh stock check active).`,
        data: structuredClone(item),
      };
      lastAction = res;
      return res;
    },

    commitImmediateBoothSale(input) {
      const replay = checkIdempotency<BoothImmediateSaleRecord>(
        'p21.commit_sale',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const cashier = input.cashier_user_id.trim();
      const subPrice = input.submitted_unit_price.trim();
      const payRef = input.payment_reference.trim();
      const soldAt = input.sold_at.trim();

      if (!cashier || !payRef || !UTC_INSTANT_PATTERN.test(soldAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Cashier ID, payment reference, and valid UTC timestamp are required.'
        );
      }

      const item = catalogItems.find((c) => c.item_id === input.item_id);
      if (!item) return fail(404, 'RESOURCE_NOT_FOUND', 'Booth catalog item not found.');

      const cartUnits = BigInt(item.cart_qty);
      if (cartUnits <= 0n) {
        return fail(422, 'EMPTY_CART_CANNOT_COMMIT', 'Select at least 1 unit before committing a sale.');
      }
      if (!MONEY_PATTERN.test(subPrice) || toCents(subPrice) !== toCents(item.approved_unit_price)) {
        return fail(
          422,
          'UNAUTHORIZED_DISCOUNT_OR_PRICE_OVERRIDE',
          `Submitted unit price (${subPrice || 'empty'}) violates approved event price PHP ${item.approved_unit_price}.`
        );
      }
      if (input.payment_channel === 'official_gcash' && !input.gcash_credit_verified) {
        return fail(
          409,
          'UNVERIFIED_GCASH_OR_SCREENSHOT_BLOCKED',
          'Official GCash credit verification is required before immediate booth sale OR issuance.'
        );
      }
      const dupPay = immediateSales.some((s) => s.payment_reference === payRef);
      if (dupPay) {
        return fail(
          409,
          'DUPLICATE_PAYMENT_REFERENCE',
          `Payment reference "${payRef}" has already been recorded for an issued Official Receipt.`
        );
      }

      const custodyUnits = BigInt(item.booth_custody_qty);
      if (cartUnits > custodyUnits) {
        return fail(
          409,
          'BOOTH_CUSTODY_OVERSALE_BLOCKED',
          `Requested sale (${item.cart_qty}) exceeds fresh eligible booth custody (${item.booth_custody_qty}).`
        );
      }

      item.booth_custody_qty = (custodyUnits - cartUnits).toString();
      item.cart_qty = '0';
      item.version += 1;

      const totalCents = cartUnits * toCents(item.approved_unit_price);
      const serial = String(immediateSales.length + 1).padStart(6, '0');
      const sale: BoothImmediateSaleRecord = {
        sale_id: nextId(),
        or_reference: `${chapterPrefix}-OR-BTH-2026-${serial}`,
        event_code: item.event_code,
        item_id: item.item_id,
        sku_code: item.sku_code,
        item_name: item.item_name,
        quantity_sold: cartUnits.toString(),
        unit_price: item.approved_unit_price,
        total_amount: fromCents(totalCents),
        payment_channel: input.payment_channel,
        payment_reference: payRef,
        gcash_credit_verified: input.payment_channel === 'official_gcash' ? true : false,
        cashier_user_id: cashier,
        stockroom_delta: '0',
        booth_custody_delta: `-${cartUnits.toString()}`,
        eligible_for_booth_claim_f: true,
        so_created_count: 0,
        si_created_count: 0,
        cdr_created_count: 0,
        sold_at: soldAt,
      };
      immediateSales.push(sale);

      history.push({
        event_id: nextId(),
        target_id: sale.sale_id,
        action: 'immediate_booth_sale_committed',
        actor_user_id: cashier,
        reason: `${sale.or_reference}: ${sale.quantity_sold} x ${sale.sku_code} = PHP ${sale.total_amount} (booth -${sale.quantity_sold}, stockroom 0)`,
        timestamp: soldAt,
      });

      return recordLedgerAndPersist(
        'p21.commit_sale',
        cashier,
        sale.sale_id,
        input.idempotency_key,
        input,
        201,
        'IMMEDIATE_BOOTH_SALE_COMMITTED',
        `Issued ${sale.or_reference} for ${sale.quantity_sold} units (PHP ${sale.total_amount}); booth custody debited once (${item.booth_custody_qty} remaining), stockroom untouched.`,
        structuredClone(sale)
      );
    },

    handoffOutOfStockToTrack1So(input) {
      const replay = checkIdempotency<Track1SoHandoffLead>(
        'p21.track1_handoff',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const evCode = input.event_code.trim();
      const sku = input.sku_code.trim();
      const buyer = input.buyer_name.trim();
      const reqQty = input.requested_qty.trim();
      const cashier = input.cashier_user_id.trim();
      const recAt = input.recorded_at.trim();
      const notes = input.notes.trim();

      if (!evCode || !sku || !buyer || !cashier || !notes || !UTC_INSTANT_PATTERN.test(recAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Event, SKU, buyer, cashier, notes, and UTC time required.');
      }
      if (!INTEGER_PATTERN.test(reqQty) || BigInt(reqQty) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Requested quantity must exceed zero.');
      }

      const serial = String(track1Handoffs.length + 1).padStart(6, '0');
      const lead: Track1SoHandoffLead = {
        handoff_id: nextId(),
        so_lead_reference: `${chapterPrefix}-SO-LEAD-2026-${serial}`,
        event_code: evCode,
        sku_code: sku,
        buyer_name: buyer,
        requested_qty: reqQty,
        cashier_user_id: cashier,
        creates_booth_backorder: false,
        notes,
        recorded_at: recAt,
      };
      track1Handoffs.push(lead);

      history.push({
        event_id: nextId(),
        target_id: lead.handoff_id,
        action: 'track1_so_handoff_recorded',
        actor_user_id: cashier,
        reason: `${lead.so_lead_reference}: ${buyer} (${reqQty} ${sku}) routed to Track 1`,
        timestamp: recAt,
      });

      return recordLedgerAndPersist(
        'p21.track1_handoff',
        cashier,
        lead.handoff_id,
        input.idempotency_key,
        input,
        201,
        'TRACK1_SO_HANDOFF_RECORDED',
        `Routed out-of-stock request for ${buyer} (${reqQty} x ${sku}) to Track 1 lead ${lead.so_lead_reference} without booth backorder.`,
        structuredClone(lead)
      );
    },

    lookupBoothSaleOperation(input) {
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
