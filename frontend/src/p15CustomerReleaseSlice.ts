import { computeBatchSnapshotHashV1, computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P15_CONTEXT_STORAGE_KEY = 'ysp_p15_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type CustomerOrderReleaseStatus = 'open' | 'partially_released' | 'fulfilled';

export interface ReleasableSalesOrder {
  order_id: string;
  chapter_id: string;
  so_reference: string;
  si_reference: string;
  or_reference: string | null;
  has_verified_or: boolean;
  is_procurement_deposit_only: boolean;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  unit_net_price: string;
  accepted_quantity: UnitQuantity;
  protected_reserved: UnitQuantity;
  usable_on_hand: UnitQuantity;
  rop_threshold: UnitQuantity;
  low_stock_alert: boolean;
  released_quantity: UnitQuantity;
  remaining_quantity: UnitQuantity;
  verified_release_coverage_initial: string;
  remaining_release_coverage: string;
  consumed_release_coverage: string;
  deposit_credit_total: string;
  status: CustomerOrderReleaseStatus;
  version: number;
}

export interface CustomerDrEvidence {
  capture_mode: 'canvas_signature' | 'paper_upload';
  evidence_hash: string;
  releasing_officer_id: string;
  recipient_id: string;
  recipient_acknowledged: boolean;
  signed_at: string;
  linked_batch_snapshot_hash: string;
}

export interface CustomerReleaseBatch {
  batch_id: string;
  chapter_id: string;
  cdr_reference: string;
  order_id: string;
  so_reference: string;
  or_reference: string;
  variant_id: string;
  batch_quantity: UnitQuantity;
  merchandise_value: string;
  prepared_by_user_id: string;
  recipient_name: string;
  recipient_id: string;
  recipient_capacity: string;
  material_version: number;
  version: number;
  batch_snapshot_hash: string;
  evidence_ready: boolean;
  evidence: CustomerDrEvidence | null;
  status: 'draft' | 'ready' | 'posted';
  posted_at: string | null;
}

export interface P15HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P15SummaryMetrics {
  usable_on_hand: string;
  protected_so_reserved: string;
  total_released_qty: string;
  remaining_release_coverage: string;
}

export interface P15OperationLedgerEntry {
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

export interface P15ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P15LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P15EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  releasable_orders: ReadonlyArray<ReleasableSalesOrder>;
  release_batches: ReadonlyArray<CustomerReleaseBatch>;
  history: ReadonlyArray<P15HistoryEntry>;
  summary: P15SummaryMetrics;
  operation_ledger: ReadonlyArray<P15OperationLedgerEntry>;
  last_action: P15ActionResult | null;
}

export interface P15EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  releasable_orders?: ReadonlyArray<ReleasableSalesOrder> | undefined;
  release_batches?: ReadonlyArray<CustomerReleaseBatch> | undefined;
  history?: ReadonlyArray<P15HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P15OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_cdr_ref_seq?: number | undefined;
}

export interface P15CustomerReleaseEngine {
  getSnapshot: () => P15EngineSnapshot;
  registerReleasableSalesOrder: (input: {
    so_reference: string;
    si_reference: string;
    or_reference?: string | null | undefined;
    has_verified_or: boolean;
    is_procurement_deposit_only?: boolean | undefined;
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    unit_net_price: string;
    accepted_quantity_value: string;
    protected_reserved_value: string;
    usable_on_hand_value: string;
    rop_threshold_value: string;
    verified_release_coverage_amount: string;
    deposit_credit_total: string;
  }) => P15ActionResult<ReleasableSalesOrder>;
  allocateIncomingRmToFundedSo: (input: {
    order_id: string;
    rm_reference: string;
    quantity_value: string;
    actor_user_id: string;
    allocated_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P15ActionResult<ReleasableSalesOrder>;
  prepareCustomerReleaseBatch: (input: {
    order_id: string;
    prepared_by_user_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_id: string;
    recipient_capacity?: string | undefined;
    idempotency_key?: string | undefined;
  }) => P15ActionResult<CustomerReleaseBatch>;
  reviseCustomerReleaseBatch: (input: {
    batch_id: string;
    actor_user_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_id: string;
    recipient_capacity?: string | undefined;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P15ActionResult<CustomerReleaseBatch>;
  bindCustomerDrEvidence: (input: {
    batch_id: string;
    capture_mode: 'canvas_signature' | 'paper_upload';
    evidence_hash: string;
    releasing_officer_id: string;
    recipient_id: string;
    recipient_acknowledged: boolean;
    signed_at: string;
    linked_batch_snapshot_hash: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P15ActionResult<CustomerReleaseBatch>;
  postCustomerReleaseBatch: (input: {
    batch_id: string;
    actor_user_id: string;
    expected_snapshot_hash?: string | undefined;
    posted_at: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P15ActionResult<CustomerReleaseBatch>;
  lookupCustomerReleaseOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P15ActionResult<P15LookupResult>;
}

function readStoredP15Options(): P15EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P15_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P15EngineOptions;
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

function computeMerchandiseValue(qtyValue: string, unitNetPrice: string): string {
  const qtyMicro = toMicroUnits(qtyValue);
  const priceCents = toCents(unitNetPrice);
  const totalCents = (qtyMicro * priceCents + 500000n) / 1000000n;
  return fromCents(totalCents);
}

export function createP15CustomerReleaseEngine(
  options?: P15EngineOptions
): P15CustomerReleaseEngine {
  const seed = options ?? readStoredP15Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 15000;
  let cdrRefSeq = seed.next_cdr_ref_seq ?? 0;

  const releasableOrders: ReleasableSalesOrder[] = (seed.releasable_orders ?? []).map((o) =>
    structuredClone(o)
  );
  const releaseBatches: CustomerReleaseBatch[] = (seed.release_batches ?? []).map((b) =>
    structuredClone(b)
  );
  const history: P15HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P15OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P15ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P15${String(seq).padStart(19, '0')}`;
  }

  function nextCdrRef(): string {
    cdrRefSeq += 1;
    return `${chapterPrefix}-CDR-2026-${String(cdrRefSeq).padStart(6, '0')}`;
  }

  function buildSnapshotHash(batch: {
    order_id: string;
    variant_id: string;
    material_version: number;
    batch_id: string;
    recipient_name: string;
    recipient_id: string;
    recipient_capacity: string;
    batch_quantity_value: string;
  }): string {
    return computeBatchSnapshotHashV1({
      chapter_id: chapterId,
      record: { id: batch.order_id, kind: 'SO' },
      material_version: batch.material_version,
      batch_id: batch.batch_id,
      recipient: {
        name: batch.recipient_name,
        user_id: batch.recipient_id,
        capacity: batch.recipient_capacity,
      },
      lines: [
        {
          line: {
            chapter_id: chapterId,
            record: { id: batch.order_id, kind: 'SO' },
            line_id: batch.order_id,
            line_kind: 'sales_order_line',
            variant_id: batch.variant_id,
          },
          quantity: batch.batch_quantity_value,
        },
      ],
    });
  }

  function computeSummary(): P15SummaryMetrics {
    let usableMicro = 0n;
    let protectedMicro = 0n;
    let releasedMicro = 0n;
    let remCoverageCents = 0n;

    for (const o of releasableOrders) {
      usableMicro += toMicroUnits(o.usable_on_hand.value);
      protectedMicro += toMicroUnits(o.protected_reserved.value);
      releasedMicro += toMicroUnits(o.released_quantity.value);
      remCoverageCents += toCents(o.remaining_release_coverage);
    }

    return {
      usable_on_hand: formatTrimmedMicro(usableMicro),
      protected_so_reserved: formatTrimmedMicro(protectedMicro),
      total_released_qty: formatTrimmedMicro(releasedMicro),
      remaining_release_coverage: fromCents(remCoverageCents),
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P15_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          releasable_orders: releasableOrders,
          release_batches: releaseBatches,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_cdr_ref_seq: cdrRefSeq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P15ActionResult<T> {
    const res: P15ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P15ActionResult<T> {
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
    const res: P15ActionResult<T> = {
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
  ): P15ActionResult<T> | null {
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
    const replayRes: P15ActionResult<T> = {
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
        releasable_orders: releasableOrders.map((o) => structuredClone(o)),
        release_batches: releaseBatches.map((b) => structuredClone(b)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerReleasableSalesOrder(input) {
      const soRef = input.so_reference.trim();
      const siRef = input.si_reference.trim();
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      const orRef = input.or_reference?.trim() || null;

      if (!soRef || !siRef || !variantId || !itemName) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'SO reference, SI reference, variant ID, and item name are required.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Precision scale must be an integer between 0 and 6.');
      }

      const qtyInputs = [
        input.accepted_quantity_value.trim(),
        input.protected_reserved_value.trim(),
        input.usable_on_hand_value.trim(),
        input.rop_threshold_value.trim(),
      ];
      if (qtyInputs.some((q) => !isValidUnitQuantity({ value: q, quantity_scale: input.quantity_scale }))) {
        return fail(422, 'INVALID_QUANTITY', 'Quantities violate approved precision scale.');
      }
      if (
        !MONEY_PATTERN.test(input.unit_net_price.trim()) ||
        !MONEY_PATTERN.test(input.verified_release_coverage_amount.trim()) ||
        !MONEY_PATTERN.test(input.deposit_credit_total.trim())
      ) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Prices and payment coverages must use two-decimal format.');
      }

      const accMicro = toMicroUnits(input.accepted_quantity_value.trim());
      const protMicro = toMicroUnits(input.protected_reserved_value.trim());
      const usableMicro = toMicroUnits(input.usable_on_hand_value.trim());
      const ropMicro = toMicroUnits(input.rop_threshold_value.trim());

      const order: ReleasableSalesOrder = {
        order_id: nextId(),
        chapter_id: chapterId,
        so_reference: soRef,
        si_reference: siRef,
        or_reference: orRef,
        has_verified_or: input.has_verified_or,
        is_procurement_deposit_only: input.is_procurement_deposit_only === true,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        unit_net_price: input.unit_net_price.trim(),
        accepted_quantity: fromMicroUnits(accMicro, input.quantity_scale),
        protected_reserved: fromMicroUnits(protMicro, input.quantity_scale),
        usable_on_hand: fromMicroUnits(usableMicro, input.quantity_scale),
        rop_threshold: fromMicroUnits(ropMicro, input.quantity_scale),
        low_stock_alert: usableMicro <= ropMicro,
        released_quantity: fromMicroUnits(0n, input.quantity_scale),
        remaining_quantity: fromMicroUnits(accMicro, input.quantity_scale),
        verified_release_coverage_initial: input.verified_release_coverage_amount.trim(),
        remaining_release_coverage: input.verified_release_coverage_amount.trim(),
        consumed_release_coverage: '0.00',
        deposit_credit_total: input.deposit_credit_total.trim(),
        status: 'open',
        version: 1,
      };
      releasableOrders.push(order);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'RELEASABLE_ORDER_REGISTERED',
        message: `Registered ${soRef} (${siRef}) — Accepted ${order.accepted_quantity.value}, Protected Reserved ${order.protected_reserved.value}, Coverage PHP ${order.remaining_release_coverage}.`,
        data: structuredClone(order),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P15ActionResult<ReleasableSalesOrder>;
    },

    allocateIncomingRmToFundedSo(input) {
      const replay = checkIdempotency<ReleasableSalesOrder>('p15.allocate_rm', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const rmRef = input.rm_reference.trim();
      const allocatedAt = input.allocated_at.trim();
      if (!actorId || !rmRef || !UTC_INSTANT_PATTERN.test(allocatedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID, RM reference, and UTC timestamp are required.');
      }

      const order = releasableOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Releasable sales order not found.');
      if (order.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Order version changed before RM allocation.');
      }
      if (!isValidUnitQuantity({ value: input.quantity_value.trim(), quantity_scale: order.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Replenished quantity violates item precision scale.');
      }

      const addMicro = toMicroUnits(input.quantity_value.trim());
      if (addMicro <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Allocated quantity must be greater than zero.');
      }

      const nextUsableMicro = toMicroUnits(order.usable_on_hand.value) + addMicro;
      const nextProtMicro = toMicroUnits(order.protected_reserved.value) + addMicro;
      order.usable_on_hand = fromMicroUnits(nextUsableMicro, order.quantity_scale);
      order.protected_reserved = fromMicroUnits(nextProtMicro, order.quantity_scale);
      order.low_stock_alert = nextUsableMicro <= toMicroUnits(order.rop_threshold.value);
      order.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: order.order_id,
        action: 'allocateIncomingRmToFundedSo',
        actor_user_id: actorId,
        reason: `${rmRef} (+${input.quantity_value.trim()})`,
        timestamp: allocatedAt,
      });

      return recordLedgerAndPersist(
        'p15.allocate_rm',
        actorId,
        order.order_id,
        input.idempotency_key,
        input,
        200,
        'RM_ALLOCATED_TO_FUNDED_SO',
        `Allocated ${input.quantity_value.trim()} accepted units from ${rmRef} into funded SO reservation while preserving deposit protection.`,
        order
      );
    },

    prepareCustomerReleaseBatch(input) {
      const replay = checkIdempotency<CustomerReleaseBatch>('p15.prepare_batch', input.idempotency_key, input);
      if (replay) return replay;

      const preparerId = input.prepared_by_user_id.trim();
      const recName = input.recipient_name.trim();
      const recId = input.recipient_id.trim();
      const recCap = input.recipient_capacity?.trim() || 'Authorized Buyer / Recipient';

      if (!preparerId || !recName || !recId) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Preparing officer, recipient name, and recipient ID are required.');
      }

      const order = releasableOrders.find((o) => o.order_id === input.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Target sales order not found.');

      if (!order.has_verified_or || !order.or_reference) {
        return fail(
          409,
          'SI_OR_SCREENSHOT_ALONE_CANNOT_RELEASE',
          'Sales Invoice or unverified payment screenshot grants zero release authority; verified Official Receipt required.'
        );
      }

      if (!isValidUnitQuantity({ value: input.batch_quantity_value.trim(), quantity_scale: order.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Release batch quantity violates item precision scale.');
      }

      const batchMicro = toMicroUnits(input.batch_quantity_value.trim());
      if (batchMicro <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Release batch quantity must be greater than zero.');
      }

      const protMicro = toMicroUnits(order.protected_reserved.value);
      const remMicro = toMicroUnits(order.remaining_quantity.value);
      if (batchMicro > protMicro || batchMicro > remMicro) {
        return fail(
          409,
          'EXCEEDS_PROTECTED_RESERVATION',
          `Requested batch (${input.batch_quantity_value.trim()}) exceeds protected reserved stock (${order.protected_reserved.value}) or remaining order demand (${order.remaining_quantity.value}).`
        );
      }

      const batchVal = computeMerchandiseValue(input.batch_quantity_value.trim(), order.unit_net_price);
      if (
        order.is_procurement_deposit_only ||
        toCents(order.remaining_release_coverage) < toCents(batchVal)
      ) {
        return fail(
          409,
          'INSUFFICIENT_RELEASE_COVERAGE',
          `Verified merchandise release coverage (PHP ${order.remaining_release_coverage}) is below batch value (PHP ${batchVal}); procurement-only deposits cannot authorize handover.`
        );
      }

      const batchId = nextId();
      const cdrRef = nextCdrRef();
      const qtyFormatted = formatTrimmedMicro(batchMicro);
      const hash = buildSnapshotHash({
        order_id: order.order_id,
        variant_id: order.variant_id,
        material_version: 1,
        batch_id: batchId,
        recipient_name: recName,
        recipient_id: recId,
        recipient_capacity: recCap,
        batch_quantity_value: qtyFormatted,
      });

      const batch: CustomerReleaseBatch = {
        batch_id: batchId,
        chapter_id: chapterId,
        cdr_reference: cdrRef,
        order_id: order.order_id,
        so_reference: order.so_reference,
        or_reference: order.or_reference,
        variant_id: order.variant_id,
        batch_quantity: fromMicroUnits(batchMicro, order.quantity_scale),
        merchandise_value: batchVal,
        prepared_by_user_id: preparerId,
        recipient_name: recName,
        recipient_id: recId,
        recipient_capacity: recCap,
        material_version: 1,
        version: 1,
        batch_snapshot_hash: hash,
        evidence_ready: false,
        evidence: null,
        status: 'draft',
        posted_at: null,
      };
      releaseBatches.push(batch);

      history.push({
        event_id: nextUlid(),
        target_id: batch.batch_id,
        action: 'prepareCustomerReleaseBatch',
        actor_user_id: preparerId,
        reason: `${cdrRef} (${qtyFormatted} units, PHP ${batchVal})`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p15.prepare_batch',
        preparerId,
        batch.batch_id,
        input.idempotency_key,
        input,
        201,
        'CUSTOMER_DR_PREPARED',
        `Prepared Customer DR ${cdrRef} for ${qtyFormatted} units (PHP ${batchVal} covered). Capture recipient signature before release.`,
        batch
      );
    },

    reviseCustomerReleaseBatch(input) {
      const replay = checkIdempotency<CustomerReleaseBatch>('p15.revise_batch', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const recName = input.recipient_name.trim();
      const recId = input.recipient_id.trim();
      const recCap = input.recipient_capacity?.trim();

      const batch = releaseBatches.find((b) => b.batch_id === input.batch_id);
      if (!batch) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer release batch not found.');
      if (batch.version !== input.expected_batch_version) {
        return fail(409, 'STALE_VERSION', 'Release batch version changed before revision.');
      }
      if (batch.status === 'posted') {
        return fail(409, 'BATCH_ALREADY_POSTED', 'Posted customer release batch cannot be modified in-place.');
      }

      const order = releasableOrders.find((o) => o.order_id === batch.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Parent sales order not found.');

      const nextQtyRaw = input.batch_quantity_value.trim() || batch.batch_quantity.value;
      if (!isValidUnitQuantity({ value: nextQtyRaw, quantity_scale: order.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Revised batch quantity violates item precision scale.');
      }

      const nextMicro = toMicroUnits(nextQtyRaw);
      if (nextMicro <= 0n || nextMicro > toMicroUnits(order.protected_reserved.value)) {
        return fail(409, 'EXCEEDS_PROTECTED_RESERVATION', 'Revised batch quantity exceeds protected reserved quantity.');
      }

      const nextVal = computeMerchandiseValue(nextQtyRaw, order.unit_net_price);
      if (toCents(order.remaining_release_coverage) < toCents(nextVal)) {
        return fail(409, 'INSUFFICIENT_RELEASE_COVERAGE', 'Revised batch value exceeds remaining verified release coverage.');
      }

      batch.batch_quantity = fromMicroUnits(nextMicro, order.quantity_scale);
      batch.merchandise_value = nextVal;
      if (recName) batch.recipient_name = recName;
      if (recId) batch.recipient_id = recId;
      if (recCap) batch.recipient_capacity = recCap;
      batch.material_version += 1;
      batch.version += 1;
      batch.batch_snapshot_hash = buildSnapshotHash({
        order_id: batch.order_id,
        variant_id: batch.variant_id,
        material_version: batch.material_version,
        batch_id: batch.batch_id,
        recipient_name: batch.recipient_name,
        recipient_id: batch.recipient_id,
        recipient_capacity: batch.recipient_capacity,
        batch_quantity_value: batch.batch_quantity.value,
      });
      batch.evidence_ready = false;
      batch.evidence = null;
      batch.status = 'draft';

      history.push({
        event_id: nextUlid(),
        target_id: batch.batch_id,
        action: 'reviseCustomerReleaseBatch',
        actor_user_id: actorId,
        reason: `Material version v${batch.material_version}; prior acknowledgment invalidated`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p15.revise_batch',
        actorId,
        batch.batch_id,
        input.idempotency_key,
        input,
        200,
        'CUSTOMER_DR_REVISED',
        `Revised Customer DR ${batch.cdr_reference} (material v${batch.material_version}); prior signature invalidated and fresh evidence required.`,
        batch
      );
    },

    bindCustomerDrEvidence(input) {
      const replay = checkIdempotency<CustomerReleaseBatch>('p15.bind_evidence', input.idempotency_key, input);
      if (replay) return replay;

      const releasingId = input.releasing_officer_id.trim();
      const recipientId = input.recipient_id.trim();
      const evHash = input.evidence_hash.trim().toLowerCase();
      const signedAt = input.signed_at.trim();
      const linkedSnap = input.linked_batch_snapshot_hash.trim().toLowerCase();

      if (!releasingId || !recipientId || !UTC_INSTANT_PATTERN.test(signedAt)) {
        return fail(422, 'INVALID_INPUT', 'Releasing officer, recipient ID, and UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(evHash)) {
        return fail(422, 'INVALID_EVIDENCE_HASH', 'Evidence digest must be a valid 64-character lowercase SHA-256 hex string.');
      }
      if (releasingId === recipientId) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'Releasing officer cannot act as receiving buyer/recipient signatory.'
        );
      }
      if (!input.recipient_acknowledged) {
        return fail(
          422,
          'MISSING_RECIPIENT_ACKNOWLEDGMENT',
          'Explicit recipient physical receipt acknowledgment is required.'
        );
      }

      const batch = releaseBatches.find((b) => b.batch_id === input.batch_id);
      if (!batch) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer release batch not found.');
      if (batch.version !== input.expected_batch_version) {
        return fail(409, 'STALE_VERSION', 'Release batch version changed before evidence binding.');
      }
      if (linkedSnap !== batch.batch_snapshot_hash) {
        return fail(
          409,
          'STALE_BATCH_EVIDENCE_MISMATCH',
          'Submitted evidence snapshot digest does not match the current Customer DR batch revision; reload current digest and re-sign.'
        );
      }

      batch.evidence = {
        capture_mode: input.capture_mode,
        evidence_hash: evHash,
        releasing_officer_id: releasingId,
        recipient_id: recipientId,
        recipient_acknowledged: true,
        signed_at: signedAt,
        linked_batch_snapshot_hash: linkedSnap,
      };
      batch.evidence_ready = true;
      batch.status = 'ready';
      batch.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: batch.batch_id,
        action: `bindCustomerDrEvidence:${input.capture_mode}`,
        actor_user_id: releasingId,
        reason: evHash.slice(0, 12),
        timestamp: signedAt,
      });

      return recordLedgerAndPersist(
        'p15.bind_evidence',
        releasingId,
        batch.batch_id,
        input.idempotency_key,
        input,
        200,
        'CUSTOMER_DR_EVIDENCE_BOUND',
        `Bound ready ${input.capture_mode === 'canvas_signature' ? 'on-device signature' : 'signed paper scan'} to ${batch.cdr_reference} (material v${batch.material_version}).`,
        batch
      );
    },

    postCustomerReleaseBatch(input) {
      const replay = checkIdempotency<CustomerReleaseBatch>('p15.post_release', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const postedAt = input.posted_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(postedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and valid UTC posting timestamp are required.');
      }

      const batch = releaseBatches.find((b) => b.batch_id === input.batch_id);
      if (!batch) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer release batch not found.');
      if (batch.version !== input.expected_batch_version) {
        return fail(409, 'STALE_VERSION', 'Release batch version changed before posting.');
      }
      if (batch.status === 'posted') {
        return fail(409, 'BATCH_ALREADY_POSTED', 'This release batch has already been posted.');
      }

      const submittedHash = input.expected_snapshot_hash?.trim().toLowerCase();
      if (submittedHash && submittedHash !== batch.batch_snapshot_hash) {
        return fail(
          409,
          'STALE_BATCH_EVIDENCE_MISMATCH',
          'Submitted batch snapshot digest is stale after material revision; load current digest and re-bind evidence.'
        );
      }
      if (!batch.evidence_ready || !batch.evidence || batch.evidence.linked_batch_snapshot_hash !== batch.batch_snapshot_hash) {
        return fail(
          409,
          'MISSING_RELEASE_EVIDENCE',
          'Customer DR requires ready signed acknowledgment bound to the current batch before physical release.'
        );
      }

      const order = releasableOrders.find((o) => o.order_id === batch.order_id);
      if (!order) return fail(404, 'RESOURCE_NOT_FOUND', 'Parent sales order not found.');

      const releaseMicro = toMicroUnits(batch.batch_quantity.value);
      const valCents = toCents(batch.merchandise_value);
      const curUsableMicro = toMicroUnits(order.usable_on_hand.value);
      const curProtMicro = toMicroUnits(order.protected_reserved.value);
      const curReleasedMicro = toMicroUnits(order.released_quantity.value);
      const curRemMicro = toMicroUnits(order.remaining_quantity.value);
      const curCovCents = toCents(order.remaining_release_coverage);
      const curConsumedCents = toCents(order.consumed_release_coverage);

      if (releaseMicro > curUsableMicro || releaseMicro > curProtMicro || valCents > curCovCents) {
        return fail(
          409,
          'INSUFFICIENT_STOCK_OR_COVERAGE',
          'Insufficient usable stock, protected reservation, or release coverage inside commitment fence.'
        );
      }

      const nextUsableMicro = curUsableMicro - releaseMicro;
      const nextRemMicro = curRemMicro - releaseMicro;

      order.usable_on_hand = fromMicroUnits(nextUsableMicro, order.quantity_scale);
      order.protected_reserved = fromMicroUnits(curProtMicro - releaseMicro, order.quantity_scale);
      order.released_quantity = fromMicroUnits(curReleasedMicro + releaseMicro, order.quantity_scale);
      order.remaining_quantity = fromMicroUnits(nextRemMicro, order.quantity_scale);
      order.low_stock_alert = nextUsableMicro <= toMicroUnits(order.rop_threshold.value);
      order.remaining_release_coverage = fromCents(curCovCents - valCents);
      order.consumed_release_coverage = fromCents(curConsumedCents + valCents);
      order.status = nextRemMicro === 0n ? 'fulfilled' : 'partially_released';
      order.version += 1;

      batch.status = 'posted';
      batch.posted_at = postedAt;
      batch.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: batch.batch_id,
        action: 'postCustomerReleaseBatch',
        actor_user_id: actorId,
        reason: `${batch.cdr_reference} (-${batch.batch_quantity.value}, consumed PHP ${batch.merchandise_value})`,
        timestamp: postedAt,
      });

      return recordLedgerAndPersist(
        'p15.post_release',
        actorId,
        batch.batch_id,
        input.idempotency_key,
        input,
        200,
        'CUSTOMER_RELEASE_POSTED',
        `Posted ${batch.cdr_reference}: deducted ${batch.batch_quantity.value} units, consumed PHP ${batch.merchandise_value} coverage (Remaining coverage: PHP ${order.remaining_release_coverage}, Deposit credit preserved: PHP ${order.deposit_credit_total}).`,
        batch
      );
    },

    lookupCustomerReleaseOperation(input) {
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
