import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P07_CONTEXT_STORAGE_KEY = 'ysp_p07_context';

const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type RfStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'canceled';

export type RfFulfillmentState =
  | 'not_approved'
  | 'outstanding'
  | 'partially_issued'
  | 'fulfilled'
  | 'closed_canceled';

export interface RfLineDraftInput {
  line_id?: string | null | undefined;
  variant_id: string;
  variant_sku?: string | undefined;
  item_name?: string | undefined;
  requested_quantity_value: string;
  quantity_scale: number;
}

export interface RfLineItem {
  line_id: string;
  variant_id: string;
  variant_sku?: string | undefined;
  item_name?: string | undefined;
  requested_quantity: UnitQuantity;
  approved_quantity: string | null;
  reserved_quantity: string;
  blocked_reserved_quantity: string;
  issued_quantity: string;
  canceled_quantity: string;
  remaining_quantity: string | null;
  unreserved_quantity: string | null;
  uncovered_shortage: string;
}

export interface RfApprovalSnapshot {
  approver_user_id: string;
  approver_name?: string | undefined;
  duty_code: 'RF_APPROVER' | 'CHAPTER_HEAD';
  approved_material_version: number;
  approved_at: string;
}

export interface RfHistoryEntry {
  event_id: string;
  rf_id: string;
  version: number;
  material_version: number;
  progress_version: number;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface InternalRfRecord {
  rf_id: string;
  chapter_id: string;
  reference: string | null;
  requesting_unit_id: string | null;
  requester_user_id: string;
  purpose: 'internal_use';
  needed_at: string | null;
  justification: string | null;
  status: RfStatus;
  fulfillment_state: RfFulfillmentState;
  version: number;
  material_version: number;
  progress_version: number;
  lines: RfLineItem[];
  approval: RfApprovalSnapshot | null;
  return_reason: string | null;
  cancel_reason: string | null;
  submitted_at: string | null;
}

export interface LotInterval {
  start: string;
  end: string;
  state: 'free' | 'reserved';
  reservation_id: string | null;
}

export interface EligibleStockLot {
  lot_id: string;
  basis_segment_id: string;
  variant_id: string;
  item_name?: string | undefined;
  quantity_scale: number;
  accepted_quantity: string;
  reserved_quantity: string;
  free_quantity: string;
  stock_version: number;
  lot_material_version: number;
  intervals: LotInterval[];
}

export interface RfReservationPreparation {
  preparation_id: string;
  rf_id: string;
  rf_line_id: string;
  lot_id: string;
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
  prepared_rf_version: number;
  prepared_material_version: number;
  prepared_progress_version: number;
  prepared_stock_version: number;
  state: 'prepared' | 'committed';
  version: number;
  reservation_id: string | null;
}

export interface RfReservation {
  reservation_id: string;
  preparation_id: string;
  rf_id: string;
  rf_line_id: string;
  lot_id: string;
  basis_segment_id: string;
  offset_quantity: string;
  committed_quantity: string;
  active_quantity: string;
  blocked_quantity: string;
  fulfilled_quantity: string;
  released_quantity: string;
  status: 'active' | 'blocked' | 'partially_blocked' | 'fulfilled' | 'released' | 'closed_mixed';
  version: number;
  material_version: number;
  expires_at: null;
}

export interface P07StockSummary {
  usable_on_hand: string;
  rf_reserved: string;
  available_to_allocate: string;
  uncovered_shortage: string;
}

export interface P07OperationLedgerEntry {
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

export interface P07ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  failed_intent_committed?: boolean | undefined;
  data?: T | undefined;
}

export interface P07UncertainLookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P07EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  requisitions: ReadonlyArray<InternalRfRecord>;
  stock_lots: ReadonlyArray<EligibleStockLot>;
  preparations: ReadonlyArray<RfReservationPreparation>;
  reservations: ReadonlyArray<RfReservation>;
  history: ReadonlyArray<RfHistoryEntry>;
  stock_summary: P07StockSummary;
  operation_ledger: ReadonlyArray<P07OperationLedgerEntry>;
  last_action: P07ActionResult | null;
}

export interface P07EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  requisitions?: ReadonlyArray<InternalRfRecord> | undefined;
  stock_lots?: ReadonlyArray<EligibleStockLot> | undefined;
  preparations?: ReadonlyArray<RfReservationPreparation> | undefined;
  reservations?: ReadonlyArray<RfReservation> | undefined;
  history?: ReadonlyArray<RfHistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P07OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_rf_ref_seq?: number | undefined;
}

export interface P07RequisitionEngine {
  getSnapshot: () => P07EngineSnapshot;
  registerEligibleStockLot: (input: {
    chapter_id?: string | undefined;
    lot_id?: string | undefined;
    variant_id: string;
    item_name?: string | undefined;
    quantity_value: string;
    quantity_scale: number;
  }) => P07ActionResult<EligibleStockLot>;
  createInternalRf: (input: {
    chapter_id?: string | undefined;
    requester_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines?: ReadonlyArray<RfLineDraftInput> | undefined;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  replaceInternalRfDraft: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines: ReadonlyArray<RfLineDraftInput>;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  submitInternalRf: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  approveInternalRf: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    reviewer_user_id: string;
    reviewer_name?: string | undefined;
    duty_code?: 'RF_APPROVER' | 'CHAPTER_HEAD' | undefined;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  returnInternalRf: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    reviewer_user_id: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  reviseInternalRf: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines: ReadonlyArray<RfLineDraftInput>;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  cancelInternalRf: (input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<InternalRfRecord>;
  prepareRfReservation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    rf_line_id: string;
    lot_id: string;
    offset_value: string;
    quantity_value: string;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<RfReservationPreparation>;
  commitRfReservation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    preparation_id: string;
    expected_rf_version?: number | undefined;
    expected_material_version?: number | undefined;
    expected_progress_version?: number | undefined;
    expected_stock_version?: number | undefined;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<RfReservation>;
  releaseRfReservation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    reservation_id: string;
    release_kind: 'release' | 'cancel_commitment';
    quantity_value?: string | undefined;
    reason: string;
    expected_reservation_version: number;
    expected_rf_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<RfReservation>;
  reallocateRfReservation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    reservation_id: string;
    target_lot_id: string;
    target_offset_value: string;
    quantity_value: string;
    reason: string;
    expected_reservation_version: number;
    expected_rf_version: number;
    expected_progress_version: number;
    expected_source_stock_version: number;
    expected_target_stock_version: number;
    idempotency_key?: string | undefined;
  }) => P07ActionResult<RfReservation>;
  lookupRequisitionOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P07ActionResult<P07UncertainLookupResult>;
}

function readStoredP07Options(): P07EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P07_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P07EngineOptions;
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

export function createP07RequisitionEngine(options?: P07EngineOptions): P07RequisitionEngine {
  const seed = options ?? readStoredP07Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 7000;
  let rfRefSeq = seed.next_rf_ref_seq ?? 0;

  const requisitions: InternalRfRecord[] = (seed.requisitions ?? []).map((r) => structuredClone(r));
  const stockLots: EligibleStockLot[] = (seed.stock_lots ?? []).map((l) => structuredClone(l));
  const preparations: RfReservationPreparation[] = (seed.preparations ?? []).map((p) =>
    structuredClone(p)
  );
  const reservations: RfReservation[] = (seed.reservations ?? []).map((res) =>
    structuredClone(res)
  );
  const history: RfHistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P07OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P07ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P07${String(seq).padStart(19, '0')}`;
  }

  function nextTimestamp(): string {
    return `2026-11-22T11:20:${String(seq % 60).padStart(2, '0')}.000000Z`;
  }

  function allocateRfReference(): string {
    rfRefSeq += 1;
    return `${chapterPrefix}-RF-2026-${String(rfRefSeq).padStart(6, '0')}`;
  }

  function recordOutcome<T>(res: P07ActionResult<T>): P07ActionResult<T> {
    lastAction = res;
    return res;
  }

  function checkChapterAccess<T>(requestedChapterId?: string): P07ActionResult<T> | null {
    if (requestedChapterId !== undefined && requestedChapterId !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested requisition resource is outside authorized chapter scope.',
      });
    }
    return null;
  }

  function checkIdempotency<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    idempotency_key?: string | undefined;
    payload: unknown;
  }):
    | { status: 'replay'; result: P07ActionResult<T> }
    | { status: 'conflict'; result: P07ActionResult<T> }
    | { status: 'fresh'; fingerprint: string; key: string | null } {
    const cleanKey = params.idempotency_key?.trim() || null;
    const fingerprint = computeDeterministicHash({
      target_id: params.target_id,
      payload: params.payload,
    });
    if (!cleanKey) {
      return { status: 'fresh', fingerprint, key: null };
    }

    const existing = operationLedger.find(
      (entry) =>
        entry.chapter_id === chapterId &&
        entry.action_code === params.action_code &&
        entry.actor_user_id === params.actor_user_id &&
        entry.idempotency_key === cleanKey
    );

    if (!existing) {
      return { status: 'fresh', fingerprint, key: cleanKey };
    }
    if (existing.payload_fingerprint === fingerprint) {
      const replayed = recordOutcome<T>({
        ok: true,
        http_status: existing.http_status,
        code: existing.code,
        message: existing.message,
        replayed: true,
        data: structuredClone(existing.snapshot) as T,
      });
      return { status: 'replay', result: replayed };
    }
    const conflict = recordOutcome<T>({
      ok: false,
      http_status: 409,
      code: 'ACTION_KEY_CONFLICT',
      message: 'Idempotency key was already committed with a different request payload.',
      failed_intent_committed: false,
    });
    return { status: 'conflict', result: conflict };
  }

  function commitToLedger<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    key: string | null;
    fingerprint: string;
    http_status: number;
    code: string;
    message: string;
    snapshot: T;
  }): P07ActionResult<T> {
    if (params.key) {
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: params.action_code,
        actor_user_id: params.actor_user_id,
        target_id: params.target_id,
        idempotency_key: params.key,
        payload_fingerprint: params.fingerprint,
        http_status: params.http_status,
        code: params.code,
        message: params.message,
        snapshot: structuredClone(params.snapshot),
      });
    }
    return recordOutcome({
      ok: true,
      http_status: params.http_status,
      code: params.code,
      message: params.message,
      replayed: false,
      data: structuredClone(params.snapshot),
    });
  }

  function appendHistory(params: {
    rf: InternalRfRecord;
    action: string;
    actor_user_id: string;
    reason: string | null;
  }) {
    history.push({
      event_id: nextId(),
      rf_id: params.rf.rf_id,
      version: params.rf.version,
      material_version: params.rf.material_version,
      progress_version: params.rf.progress_version,
      action: params.action,
      actor_user_id: params.actor_user_id,
      reason: params.reason,
      timestamp: nextTimestamp(),
    });
  }

  function computeFreeMicroForVariant(variantId: string): bigint {
    return stockLots
      .filter((l) => l.variant_id === variantId)
      .reduce((acc, l) => acc + toMicroUnits(l.free_quantity), 0n);
  }

  function recomputeAllLineProgress() {
    for (const rf of requisitions) {
      for (const line of rf.lines) {
        if (line.approved_quantity === null) {
          line.reserved_quantity = '0';
          line.blocked_reserved_quantity = '0';
          line.remaining_quantity = null;
          line.unreserved_quantity = null;
          line.uncovered_shortage = '0';
          continue;
        }

        const activeResForLine = reservations.filter(
          (res) => res.rf_id === rf.rf_id && res.rf_line_id === line.line_id
        );
        const reservedMicro = activeResForLine.reduce(
          (acc, r) => acc + toMicroUnits(r.active_quantity),
          0n
        );
        const blockedMicro = activeResForLine.reduce(
          (acc, r) => acc + toMicroUnits(r.blocked_quantity),
          0n
        );
        const approvedMicro = toMicroUnits(line.approved_quantity);
        const issuedMicro = toMicroUnits(line.issued_quantity);
        const canceledMicro = toMicroUnits(line.canceled_quantity);
        const remainingMicro = approvedMicro - issuedMicro - canceledMicro;
        const unreservedMicro = remainingMicro - reservedMicro;
        const scale = line.requested_quantity.quantity_scale;

        line.reserved_quantity = fromMicroUnits(reservedMicro, scale).value;
        line.blocked_reserved_quantity = fromMicroUnits(blockedMicro, scale).value;
        line.remaining_quantity = fromMicroUnits(remainingMicro > 0n ? remainingMicro : 0n, scale).value;
        line.unreserved_quantity = fromMicroUnits(unreservedMicro > 0n ? unreservedMicro : 0n, scale).value;

        if (rf.status === 'canceled' || remainingMicro <= 0n) {
          line.uncovered_shortage = '0';
        } else {
          const freeVariantMicro = computeFreeMicroForVariant(line.variant_id);
          const shortageMicro = unreservedMicro > freeVariantMicro ? unreservedMicro - freeVariantMicro : 0n;
          line.uncovered_shortage = fromMicroUnits(shortageMicro, scale).value;
        }
      }
    }
  }

  function computeStockSummary(): P07StockSummary {
    const usableMicro = stockLots.reduce((acc, l) => acc + toMicroUnits(l.accepted_quantity), 0n);
    const reservedMicro = reservations.reduce((acc, r) => acc + toMicroUnits(r.active_quantity), 0n);
    const availableMicro = usableMicro > reservedMicro ? usableMicro - reservedMicro : 0n;

    // Net uncovered shortage by variant across approved unclosed RF lines
    const unreservedByVariant = new Map<string, bigint>();
    for (const rf of requisitions) {
      if (rf.status !== 'approved') continue;
      for (const line of rf.lines) {
        if (!line.unreserved_quantity) continue;
        const prev = unreservedByVariant.get(line.variant_id) ?? 0n;
        unreservedByVariant.set(line.variant_id, prev + toMicroUnits(line.unreserved_quantity));
      }
    }

    let totalUncoveredMicro = 0n;
    for (const [variantId, unreservedMicro] of unreservedByVariant.entries()) {
      const freeVariantMicro = computeFreeMicroForVariant(variantId);
      if (unreservedMicro > freeVariantMicro) {
        totalUncoveredMicro += unreservedMicro - freeVariantMicro;
      }
    }

    return {
      usable_on_hand: formatTrimmedMicro(usableMicro),
      rf_reserved: formatTrimmedMicro(reservedMicro),
      available_to_allocate: formatTrimmedMicro(availableMicro),
      uncovered_shortage: formatTrimmedMicro(totalUncoveredMicro),
    };
  }

  function validateDraftLines(
    rawLines: ReadonlyArray<RfLineDraftInput>,
    existingLines: ReadonlyArray<RfLineItem> = []
  ): { ok: true; lines: RfLineItem[] } | { ok: false; code: string; message: string } {
    const seenIds = new Set<string>();
    const result: RfLineItem[] = [];

    for (const raw of rawLines) {
      const variantId = raw.variant_id.trim();
      const qtyVal = raw.requested_quantity_value.trim();
      if (!variantId) {
        return { ok: false, code: 'INVALID_LINE', message: 'Every line must specify a catalog variant ID.' };
      }
      if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: raw.quantity_scale })) {
        return {
          ok: false,
          code: 'INVALID_QUANTITY',
          message: `Quantity "${qtyVal}" must match unit decimal scale ${raw.quantity_scale}.`,
        };
      }
      if (toMicroUnits(qtyVal) <= 0n) {
        return {
          ok: false,
          code: 'INVALID_QUANTITY',
          message: 'Requested line quantity must be strictly positive.',
        };
      }

      let lineId: string;
      if (raw.line_id && raw.line_id.trim()) {
        lineId = raw.line_id.trim();
        const retained = existingLines.find((l) => l.line_id === lineId);
        if (!retained && existingLines.length > 0) {
          // Allow keeping pre-specified ID on create or valid retained line on revision
          lineId = raw.line_id.trim();
        }
      } else {
        lineId = nextId();
      }

      if (seenIds.has(lineId)) {
        return {
          ok: false,
          code: 'DUPLICATE_LINE_ID',
          message: `Duplicate line ID "${lineId}" is not permitted.`,
        };
      }
      seenIds.add(lineId);

      result.push({
        line_id: lineId,
        variant_id: variantId,
        variant_sku: raw.variant_sku?.trim() || undefined,
        item_name: raw.item_name?.trim() || undefined,
        requested_quantity: { value: qtyVal, quantity_scale: raw.quantity_scale },
        approved_quantity: null,
        reserved_quantity: '0',
        blocked_reserved_quantity: '0',
        issued_quantity: '0',
        canceled_quantity: '0',
        remaining_quantity: null,
        unreserved_quantity: null,
        uncovered_shortage: '0',
      });
    }

    return { ok: true, lines: result };
  }

  function isIntervalFreeInLot(lot: EligibleStockLot, startMicro: bigint, endMicro: bigint): boolean {
    const acceptedMicro = toMicroUnits(lot.accepted_quantity);
    if (startMicro < 0n || endMicro <= startMicro || endMicro > acceptedMicro) {
      return false;
    }
    for (const iv of lot.intervals) {
      if (iv.state === 'reserved') {
        const ivStart = toMicroUnits(iv.start);
        const ivEnd = toMicroUnits(iv.end);
        if (ivStart < endMicro && ivEnd > startMicro) {
          return false;
        }
      }
    }
    return true;
  }

  function splitAndReserveLotInterval(
    lot: EligibleStockLot,
    startMicro: bigint,
    endMicro: bigint,
    reservationId: string
  ) {
    const scale = lot.quantity_scale;
    const nextIntervals: LotInterval[] = [];

    for (const iv of lot.intervals) {
      const ivStart = toMicroUnits(iv.start);
      const ivEnd = toMicroUnits(iv.end);
      if (iv.state !== 'free' || ivEnd <= startMicro || ivStart >= endMicro) {
        nextIntervals.push(iv);
        continue;
      }

      if (ivStart < startMicro) {
        nextIntervals.push({
          start: fromMicroUnits(ivStart, scale).value,
          end: fromMicroUnits(startMicro, scale).value,
          state: 'free',
          reservation_id: null,
        });
      }
      const clipStart = ivStart > startMicro ? ivStart : startMicro;
      const clipEnd = ivEnd < endMicro ? ivEnd : endMicro;
      if (clipStart < clipEnd) {
        nextIntervals.push({
          start: fromMicroUnits(clipStart, scale).value,
          end: fromMicroUnits(clipEnd, scale).value,
          state: 'reserved',
          reservation_id: reservationId,
        });
      }
      if (clipEnd < ivEnd) {
        nextIntervals.push({
          start: fromMicroUnits(clipEnd, scale).value,
          end: fromMicroUnits(ivEnd, scale).value,
          state: 'free',
          reservation_id: null,
        });
      }
    }

    lot.intervals = nextIntervals.sort((a, b) =>
      toMicroUnits(a.start) < toMicroUnits(b.start) ? -1 : 1
    );
    const reservedMicro = lot.intervals
      .filter((i) => i.state === 'reserved')
      .reduce((acc, i) => acc + (toMicroUnits(i.end) - toMicroUnits(i.start)), 0n);
    const acceptedMicro = toMicroUnits(lot.accepted_quantity);
    lot.reserved_quantity = fromMicroUnits(reservedMicro, scale).value;
    lot.free_quantity = fromMicroUnits(acceptedMicro - reservedMicro, scale).value;
    lot.stock_version += 1;
  }

  function releaseLotInterval(
    lot: EligibleStockLot,
    startMicro: bigint,
    endMicro: bigint,
    reservationId: string
  ) {
    const scale = lot.quantity_scale;
    const rawUpdated: LotInterval[] = [];

    for (const iv of lot.intervals) {
      if (iv.state === 'reserved' && iv.reservation_id === reservationId) {
        const ivStart = toMicroUnits(iv.start);
        const ivEnd = toMicroUnits(iv.end);
        const relStart = startMicro > ivStart ? startMicro : ivStart;
        const relEnd = endMicro < ivEnd ? endMicro : ivEnd;
        if (relStart < relEnd) {
          if (ivStart < relStart) {
            rawUpdated.push({
              start: fromMicroUnits(ivStart, scale).value,
              end: fromMicroUnits(relStart, scale).value,
              state: 'reserved',
              reservation_id: reservationId,
            });
          }
          rawUpdated.push({
            start: fromMicroUnits(relStart, scale).value,
            end: fromMicroUnits(relEnd, scale).value,
            state: 'free',
            reservation_id: null,
          });
          if (relEnd < ivEnd) {
            rawUpdated.push({
              start: fromMicroUnits(relEnd, scale).value,
              end: fromMicroUnits(ivEnd, scale).value,
              state: 'reserved',
              reservation_id: reservationId,
            });
          }
          continue;
        }
      }
      rawUpdated.push(iv);
    }

    // Coalesce adjacent free intervals
    const coalesced: LotInterval[] = [];
    for (const iv of rawUpdated) {
      const prev = coalesced[coalesced.length - 1];
      if (prev && prev.state === 'free' && iv.state === 'free' && prev.end === iv.start) {
        prev.end = iv.end;
      } else {
        coalesced.push({ ...iv });
      }
    }

    lot.intervals = coalesced;
    const reservedMicro = lot.intervals
      .filter((i) => i.state === 'reserved')
      .reduce((acc, i) => acc + (toMicroUnits(i.end) - toMicroUnits(i.start)), 0n);
    const acceptedMicro = toMicroUnits(lot.accepted_quantity);
    lot.reserved_quantity = fromMicroUnits(reservedMicro, scale).value;
    lot.free_quantity = fromMicroUnits(acceptedMicro - reservedMicro, scale).value;
    lot.stock_version += 1;
  }

  function registerEligibleStockLot(input: {
    chapter_id?: string | undefined;
    lot_id?: string | undefined;
    variant_id: string;
    item_name?: string | undefined;
    quantity_value: string;
    quantity_scale: number;
  }): P07ActionResult<EligibleStockLot> {
    const scopeErr = checkChapterAccess<EligibleStockLot>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const variantId = input.variant_id.trim();
    const qtyVal = input.quantity_value.trim();
    if (!variantId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'VARIANT_REQUIRED',
        message: 'Catalog variant ID is required to register eligible stock.',
      });
    }
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: input.quantity_scale })) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Quantity "${qtyVal}" must match unit decimal scale ${input.quantity_scale}.`,
      });
    }
    if (toMicroUnits(qtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: 'Registered stock lot quantity must be greater than zero.',
      });
    }

    const lotId = input.lot_id?.trim() || nextId();
    if (stockLots.some((l) => l.lot_id === lotId)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_LOT_ID',
        message: `Stock lot #${lotId} is already registered.`,
      });
    }

    const formattedQty = fromMicroUnits(toMicroUnits(qtyVal), input.quantity_scale).value;
    const lot: EligibleStockLot = {
      lot_id: lotId,
      basis_segment_id: lotId,
      variant_id: variantId,
      item_name: input.item_name?.trim() || undefined,
      quantity_scale: input.quantity_scale,
      accepted_quantity: formattedQty,
      reserved_quantity: '0',
      free_quantity: formattedQty,
      stock_version: 1,
      lot_material_version: 1,
      intervals: [
        {
          start: '0',
          end: formattedQty,
          state: 'free',
          reservation_id: null,
        },
      ],
    };

    stockLots.push(lot);
    recomputeAllLineProgress();

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'STOCK_LOT_REGISTERED',
      message: `Registered accepted stock lot #${lot.lot_id} (${lot.accepted_quantity} eligible units).`,
      data: structuredClone(lot),
    });
  }

  function createInternalRf(input: {
    chapter_id?: string | undefined;
    requester_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines?: ReadonlyArray<RfLineDraftInput> | undefined;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.requester_user_id.trim();
    if (!actor) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REQUESTER_REQUIRED',
        message: 'Authenticated requester user ID is required.',
      });
    }

    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.create',
      actor_user_id: actor,
      target_id: null,
      idempotency_key: input.idempotency_key,
      payload: {
        requesting_unit_id: input.requesting_unit_id ?? null,
        needed_at: input.needed_at ?? null,
        justification: input.justification ?? null,
        lines: input.lines ?? [],
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const neededAt = input.needed_at?.trim() || null;
    if (neededAt !== null && !UTC_INSTANT_PATTERN.test(neededAt)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Needed date must be a valid Z-suffixed UTC instant.',
      });
    }

    const validatedLines = validateDraftLines(input.lines ?? []);
    if (!validatedLines.ok) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: validatedLines.code,
        message: validatedLines.message,
      });
    }

    const rf: InternalRfRecord = {
      rf_id: nextId(),
      chapter_id: chapterId,
      reference: null,
      requesting_unit_id: input.requesting_unit_id?.trim() || null,
      requester_user_id: actor,
      purpose: 'internal_use',
      needed_at: neededAt,
      justification: input.justification?.trim() || null,
      status: 'draft',
      fulfillment_state: 'not_approved',
      version: 1,
      material_version: 1,
      progress_version: 1,
      lines: validatedLines.lines,
      approval: null,
      return_reason: null,
      cancel_reason: null,
      submitted_at: null,
    };

    requisitions.push(rf);
    appendHistory({
      rf,
      action: 'createInternalRf',
      actor_user_id: actor,
      reason: null,
    });

    return commitToLedger({
      action_code: 'rf.create',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'RF_DRAFT_CREATED',
      message: `Saved draft internal requisition #${rf.rf_id} (v${rf.version}/m${rf.material_version}).`,
      snapshot: rf,
    });
  }

  function replaceInternalRfDraft(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines: ReadonlyArray<RfLineDraftInput>;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.replace_draft',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        requesting_unit_id: input.requesting_unit_id ?? null,
        needed_at: input.needed_at ?? null,
        justification: input.justification ?? null,
        lines: input.lines,
        reason: input.reason,
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found in the active chapter.`,
      });
    }
    if (rf.requester_user_id !== actor) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'DUTY_DENIED',
        message: 'Only the owning requester may replace a draft requisition.',
      });
    }
    if (rf.material_version !== input.expected_material_version || rf.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: `Requisition versions changed (expected v${input.expected_version}/m${input.expected_material_version}, current v${rf.version}/m${rf.material_version}).`,
      });
    }
    if (rf.status !== 'draft') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Cannot edit requisition in "${rf.status}" state; revise returned or uncommitted approved records first.`,
      });
    }
    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A modification reason is required when updating draft content.',
      });
    }

    const neededAt = input.needed_at?.trim() || null;
    if (neededAt !== null && !UTC_INSTANT_PATTERN.test(neededAt)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Needed date must be a valid Z-suffixed UTC instant.',
      });
    }

    const validatedLines = validateDraftLines(input.lines, rf.lines);
    if (!validatedLines.ok) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: validatedLines.code,
        message: validatedLines.message,
      });
    }

    rf.requesting_unit_id = input.requesting_unit_id?.trim() || null;
    rf.needed_at = neededAt;
    rf.justification = input.justification?.trim() || null;
    rf.lines = validatedLines.lines;
    rf.version += 1;
    rf.material_version += 1;

    appendHistory({
      rf,
      action: 'replaceInternalRfDraft',
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.replace_draft',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_DRAFT_SAVED',
      message: `Saved draft requisition #${rf.rf_id} (v${rf.version}/m${rf.material_version}).`,
      snapshot: rf,
    });
  }

  function submitInternalRf(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.submit',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found.`,
      });
    }
    if (rf.requester_user_id !== actor) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'DUTY_DENIED',
        message: 'Only the owning requester may submit this draft.',
      });
    }
    if (rf.material_version !== input.expected_material_version || rf.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: 'Requisition state changed before submission; review the current snapshot.',
      });
    }
    if (rf.status !== 'draft') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only draft requisitions can be submitted (current status: ${rf.status}).`,
      });
    }
    if (
      !rf.requesting_unit_id ||
      !rf.justification ||
      !rf.needed_at ||
      rf.lines.length === 0
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'RF_INCOMPLETE_FIELDS',
        message:
          'Requesting unit, justification, needed date, and at least one item line are required to submit.',
      });
    }

    if (rf.reference === null) {
      rf.reference = allocateRfReference();
    }
    rf.status = 'submitted';
    rf.submitted_at = nextTimestamp();
    rf.version += 1;

    appendHistory({
      rf,
      action: 'submitInternalRf',
      actor_user_id: actor,
      reason: null,
    });

    return commitToLedger({
      action_code: 'rf.submit',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_SUBMITTED',
      message: `Submitted requisition ${rf.reference} for independent review.`,
      snapshot: rf,
    });
  }

  function approveInternalRf(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    reviewer_user_id: string;
    reviewer_name?: string | undefined;
    duty_code?: 'RF_APPROVER' | 'CHAPTER_HEAD' | undefined;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const reviewer = input.reviewer_user_id.trim();
    if (!reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REVIEWER_REQUIRED',
        message: 'Authenticated independent reviewer ID is required.',
      });
    }

    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.approve',
      actor_user_id: reviewer,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        duty_code: input.duty_code ?? 'RF_APPROVER',
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found.`,
      });
    }
    if (rf.requester_user_id === reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'INDEPENDENCE_REQUIRED',
        message: 'Requesters cannot approve their own internal requisition.',
      });
    }
    if (rf.material_version !== input.expected_material_version || rf.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: 'Requisition version changed before approval; reload and recheck.',
      });
    }
    if (rf.status !== 'submitted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only submitted requisitions can be approved (current status: ${rf.status}).`,
      });
    }

    rf.status = 'approved';
    rf.fulfillment_state = 'outstanding';
    rf.approval = {
      approver_user_id: reviewer,
      approver_name: input.reviewer_name?.trim() || undefined,
      duty_code: input.duty_code ?? 'RF_APPROVER',
      approved_material_version: rf.material_version,
      approved_at: nextTimestamp(),
    };
    for (const line of rf.lines) {
      line.approved_quantity = line.requested_quantity.value;
    }
    rf.version += 1;

    recomputeAllLineProgress();
    appendHistory({
      rf,
      action: 'approveInternalRf',
      actor_user_id: reviewer,
      reason: null,
    });

    return commitToLedger({
      action_code: 'rf.approve',
      actor_user_id: reviewer,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_APPROVED',
      message: `Approved requisition ${rf.reference ?? rf.rf_id} (material v${rf.material_version}); ready for stock reservation.`,
      snapshot: rf,
    });
  }

  function returnInternalRf(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    reviewer_user_id: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const reviewer = input.reviewer_user_id.trim();
    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.return',
      actor_user_id: reviewer,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        reason: input.reason,
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found.`,
      });
    }
    if (rf.requester_user_id === reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'INDEPENDENCE_REQUIRED',
        message: 'Requesters cannot review or return their own requisition.',
      });
    }
    if (!reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REVIEWER_REQUIRED',
        message: 'Reviewer user ID is required to return a requisition.',
      });
    }
    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A clear return reason is required when sending a requisition back.',
      });
    }
    if (rf.material_version !== input.expected_material_version || rf.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: 'Requisition state changed before return decision.',
      });
    }
    if (rf.status !== 'submitted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only submitted requisitions can be returned (current status: ${rf.status}).`,
      });
    }

    rf.status = 'returned';
    rf.return_reason = cleanReason;
    rf.version += 1;

    appendHistory({
      rf,
      action: 'returnInternalRf',
      actor_user_id: reviewer,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.return',
      actor_user_id: reviewer,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_RETURNED',
      message: `Returned requisition ${rf.reference ?? rf.rf_id} to requester for revision.`,
      snapshot: rf,
    });
  }

  function reviseInternalRf(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    requesting_unit_id?: string | null | undefined;
    needed_at?: string | null | undefined;
    justification?: string | null | undefined;
    lines: ReadonlyArray<RfLineDraftInput>;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.revise',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        requesting_unit_id: input.requesting_unit_id ?? null,
        needed_at: input.needed_at ?? null,
        justification: input.justification ?? null,
        lines: input.lines,
        reason: input.reason,
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
        expected_progress_version: input.expected_progress_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found.`,
      });
    }
    if (rf.requester_user_id !== actor) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'DUTY_DENIED',
        message: 'Only the owning requester may revise this requisition.',
      });
    }
    if (
      rf.material_version !== input.expected_material_version ||
      rf.progress_version !== input.expected_progress_version ||
      rf.version !== input.expected_version
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: 'Requisition versions changed before revision; refresh current record state.',
      });
    }
    if (rf.status !== 'returned' && rf.status !== 'approved') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only returned or uncommitted approved requisitions can be revised (current: ${rf.status}).`,
      });
    }

    const hasActiveCommitments = reservations.some(
      (res) => res.rf_id === rf.rf_id && toMicroUnits(res.active_quantity) > 0n
    );
    const hasIssuedQty = rf.lines.some((l) => toMicroUnits(l.issued_quantity) > 0n);
    if (hasActiveCommitments || hasIssuedQty) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'COMMITMENT_CONFLICT',
        message:
          'Release active stock reservations before revising approved material content.',
      });
    }

    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A revision reason is required.',
      });
    }
    const neededAt = input.needed_at?.trim() || null;
    if (neededAt !== null && !UTC_INSTANT_PATTERN.test(neededAt)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Needed date must be a valid Z-suffixed UTC instant.',
      });
    }

    const validatedLines = validateDraftLines(input.lines, rf.lines);
    if (!validatedLines.ok) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: validatedLines.code,
        message: validatedLines.message,
      });
    }

    rf.requesting_unit_id = input.requesting_unit_id?.trim() || null;
    rf.needed_at = neededAt;
    rf.justification = input.justification?.trim() || null;
    rf.lines = validatedLines.lines;
    rf.status = 'draft';
    rf.fulfillment_state = 'not_approved';
    rf.approval = null;
    rf.return_reason = null;
    rf.version += 1;
    rf.material_version += 1;

    recomputeAllLineProgress();
    appendHistory({
      rf,
      action: 'reviseInternalRf',
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.revise',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_REVISED_TO_DRAFT',
      message: `Revised ${rf.reference ?? rf.rf_id} back to draft (m${rf.material_version}); prior approval cleared.`,
      snapshot: rf,
    });
  }

  function cancelInternalRf(input: {
    chapter_id?: string | undefined;
    rf_id: string;
    actor_user_id: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<InternalRfRecord> {
    const scopeErr = checkChapterAccess<InternalRfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<InternalRfRecord>({
      action_code: 'rf.cancel',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        reason: input.reason,
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
        expected_progress_version: input.expected_progress_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Requisition #${input.rf_id} was not found.`,
      });
    }
    if (
      rf.material_version !== input.expected_material_version ||
      rf.progress_version !== input.expected_progress_version ||
      rf.version !== input.expected_version
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MATERIAL_VERSION_CONFLICT',
        message: 'Requisition versions changed before cancellation.',
      });
    }
    if (rf.status === 'canceled') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: 'Requisition is already formally canceled.',
      });
    }

    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A cancellation reason is required to preserve audit history.',
      });
    }

    const activeReservation = reservations.some(
      (res) => res.rf_id === rf.rf_id && toMicroUnits(res.active_quantity) > 0n
    );
    if (activeReservation) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'COMMITMENT_CONFLICT',
        message:
          'Active stock reservations must be explicitly released before canceling this requisition.',
      });
    }

    rf.status = 'canceled';
    rf.cancel_reason = cleanReason;
    if (rf.approval !== null) {
      for (const line of rf.lines) {
        const rem = line.remaining_quantity ?? '0';
        line.canceled_quantity = rem;
        line.remaining_quantity = '0';
        line.unreserved_quantity = '0';
        line.uncovered_shortage = '0';
      }
      rf.fulfillment_state = 'closed_canceled';
    } else {
      rf.fulfillment_state = 'not_approved';
    }
    rf.version += 1;

    recomputeAllLineProgress();
    appendHistory({
      rf,
      action: 'cancelInternalRf',
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.cancel',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_CANCELED',
      message: `Formally canceled requisition ${rf.reference ?? rf.rf_id} with retained history.`,
      snapshot: rf,
    });
  }

  function prepareRfReservation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    rf_line_id: string;
    lot_id: string;
    offset_value: string;
    quantity_value: string;
    idempotency_key?: string | undefined;
  }): P07ActionResult<RfReservationPreparation> {
    const scopeErr = checkChapterAccess<RfReservationPreparation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    if (!actor) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'ACTOR_REQUIRED',
        message: 'Authenticated actor ID is required to prepare stock reservation.',
      });
    }

    const idem = checkIdempotency<RfReservationPreparation>({
      action_code: 'rf.reserve.prepare',
      actor_user_id: actor,
      target_id: `${input.rf_id}:${input.rf_line_id}`,
      idempotency_key: input.idempotency_key,
      payload: {
        lot_id: input.lot_id,
        offset_value: input.offset_value,
        quantity_value: input.quantity_value,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = requisitions.find((r) => r.rf_id === input.rf_id);
    const line = rf?.lines.find((l) => l.line_id === input.rf_line_id);
    if (!rf || !line) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Approved requisition or line was not found.',
      });
    }
    if (rf.status !== 'approved' || rf.approval === null) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: 'Reservations require an approved internal requisition.',
      });
    }

    const lot = stockLots.find((l) => l.lot_id === input.lot_id);
    if (!lot) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Stock lot #${input.lot_id} was not found.`,
      });
    }
    if (lot.variant_id !== line.variant_id || lot.quantity_scale !== line.requested_quantity.quantity_scale) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'VARIANT_UNIT_MISMATCH',
        message: 'Selected lot variant or unit precision does not match the requisition line.',
      });
    }

    const offsetVal = input.offset_value.trim();
    const qtyVal = input.quantity_value.trim();
    if (
      !isValidUnitQuantity({ value: offsetVal, quantity_scale: lot.quantity_scale }) ||
      !isValidUnitQuantity({ value: qtyVal, quantity_scale: lot.quantity_scale })
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `Offset and quantity must match unit decimal scale ${lot.quantity_scale}.`,
      });
    }

    const offsetMicro = toMicroUnits(offsetVal);
    const qtyMicro = toMicroUnits(qtyVal);
    if (qtyMicro <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: 'Reservation quantity must be strictly positive.',
      });
    }

    const unreservedMicro = toMicroUnits(line.unreserved_quantity ?? '0');
    if (qtyMicro > unreservedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DEMAND_EXCEEDED',
        message: `Cannot prepare ${qtyVal}; unreserved demand remaining is ${line.unreserved_quantity ?? '0'}.`,
      });
    }

    if (!isIntervalFreeInLot(lot, offsetMicro, offsetMicro + qtyMicro)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Requested range [${offsetVal}, ${fromMicroUnits(offsetMicro + qtyMicro, lot.quantity_scale).value}) is not free in lot #${lot.lot_id} (free: ${lot.free_quantity}).`,
      });
    }

    const prep: RfReservationPreparation = {
      preparation_id: nextId(),
      rf_id: rf.rf_id,
      rf_line_id: line.line_id,
      lot_id: lot.lot_id,
      basis_segment_id: lot.basis_segment_id,
      offset_quantity: fromMicroUnits(offsetMicro, lot.quantity_scale).value,
      quantity: fromMicroUnits(qtyMicro, lot.quantity_scale).value,
      prepared_rf_version: rf.version,
      prepared_material_version: rf.material_version,
      prepared_progress_version: rf.progress_version,
      prepared_stock_version: lot.stock_version,
      state: 'prepared',
      version: 1,
      reservation_id: null,
    };

    preparations.push(prep);

    return commitToLedger({
      action_code: 'rf.reserve.prepare',
      actor_user_id: actor,
      target_id: prep.preparation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'RESERVATION_PREPARED',
      message: `Prepared exact reservation selection #${prep.preparation_id} (${prep.quantity} units on lot #${lot.lot_id}; zero stock committed yet).`,
      snapshot: prep,
    });
  }

  function commitRfReservation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    preparation_id: string;
    expected_rf_version?: number | undefined;
    expected_material_version?: number | undefined;
    expected_progress_version?: number | undefined;
    expected_stock_version?: number | undefined;
    idempotency_key?: string | undefined;
  }): P07ActionResult<RfReservation> {
    const scopeErr = checkChapterAccess<RfReservation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<RfReservation>({
      action_code: 'rf.reserve.commit',
      actor_user_id: actor,
      target_id: input.preparation_id,
      idempotency_key: input.idempotency_key,
      payload: {
        expected_rf_version: input.expected_rf_version ?? null,
        expected_material_version: input.expected_material_version ?? null,
        expected_progress_version: input.expected_progress_version ?? null,
        expected_stock_version: input.expected_stock_version ?? null,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const prep = preparations.find((p) => p.preparation_id === input.preparation_id);
    if (!prep) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Reservation preparation #${input.preparation_id} was not found.`,
        failed_intent_committed: false,
      });
    }
    if (prep.state === 'committed') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Preparation #${prep.preparation_id} has already been committed as reservation #${prep.reservation_id}.`,
        failed_intent_committed: false,
      });
    }

    const rf = requisitions.find((r) => r.rf_id === prep.rf_id);
    const line = rf?.lines.find((l) => l.line_id === prep.rf_line_id);
    const lot = stockLots.find((l) => l.lot_id === prep.lot_id);
    if (!rf || !line || !lot) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Prepared requisition line or stock lot is no longer visible.',
        failed_intent_committed: false,
      });
    }

    const expRfVer = input.expected_rf_version ?? prep.prepared_rf_version;
    const expMatVer = input.expected_material_version ?? prep.prepared_material_version;
    const expProgVer = input.expected_progress_version ?? prep.prepared_progress_version;
    const expStockVer = input.expected_stock_version ?? prep.prepared_stock_version;

    if (
      rf.material_version !== expMatVer ||
      rf.progress_version !== expProgVer ||
      rf.version !== expRfVer ||
      rf.status !== 'approved'
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Requisition state changed since preparation (current v${rf.version}/p${rf.progress_version}). Zero units committed.`,
        failed_intent_committed: false,
      });
    }

    const startMicro = toMicroUnits(prep.offset_quantity);
    const qtyMicro = toMicroUnits(prep.quantity);
    if (lot.stock_version !== expStockVer || !isIntervalFreeInLot(lot, startMicro, startMicro + qtyMicro)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Eligible availability changed (lot #${lot.lot_id} current free: ${lot.free_quantity}, v${lot.stock_version}). Competing commitment rolled back.`,
        failed_intent_committed: false,
      });
    }

    const unreservedMicro = toMicroUnits(line.unreserved_quantity ?? '0');
    if (qtyMicro > unreservedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Unreserved demand is now ${line.unreserved_quantity ?? '0'}; requested ${prep.quantity} exceeded current unreserved limit.`,
        failed_intent_committed: false,
      });
    }

    const reservationId = nextId();
    splitAndReserveLotInterval(lot, startMicro, startMicro + qtyMicro, reservationId);

    const reservation: RfReservation = {
      reservation_id: reservationId,
      preparation_id: prep.preparation_id,
      rf_id: rf.rf_id,
      rf_line_id: line.line_id,
      lot_id: lot.lot_id,
      basis_segment_id: lot.basis_segment_id,
      offset_quantity: prep.offset_quantity,
      committed_quantity: prep.quantity,
      active_quantity: prep.quantity,
      blocked_quantity: '0',
      fulfilled_quantity: '0',
      released_quantity: '0',
      status: 'active',
      version: 1,
      material_version: 1,
      expires_at: null,
    };

    reservations.push(reservation);
    prep.state = 'committed';
    prep.version = 2;
    prep.reservation_id = reservationId;

    rf.version += 1;
    rf.progress_version += 1;
    recomputeAllLineProgress();

    appendHistory({
      rf,
      action: 'commitRfReservation',
      actor_user_id: actor,
      reason: `Reserved ${reservation.committed_quantity} units from lot #${lot.lot_id}`,
    });

    return commitToLedger({
      action_code: 'rf.reserve.commit',
      actor_user_id: actor,
      target_id: reservation.reservation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RESERVATION_COMMITTED',
      message: `Committed reservation #${reservation.reservation_id} (${reservation.active_quantity} reserved; lot free: ${lot.free_quantity}).`,
      snapshot: reservation,
    });
  }

  function releaseRfReservation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    reservation_id: string;
    release_kind: 'release' | 'cancel_commitment';
    quantity_value?: string | undefined;
    reason: string;
    expected_reservation_version: number;
    expected_rf_version: number;
    expected_progress_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<RfReservation> {
    const scopeErr = checkChapterAccess<RfReservation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<RfReservation>({
      action_code: 'rf.reserve.release',
      actor_user_id: actor,
      target_id: input.reservation_id,
      idempotency_key: input.idempotency_key,
      payload: {
        release_kind: input.release_kind,
        quantity_value: input.quantity_value ?? null,
        reason: input.reason,
        expected_reservation_version: input.expected_reservation_version,
        expected_rf_version: input.expected_rf_version,
        expected_progress_version: input.expected_progress_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A release reason is required.',
      });
    }

    const res = reservations.find((r) => r.reservation_id === input.reservation_id);
    const rf = res ? requisitions.find((r) => r.rf_id === res.rf_id) : undefined;
    const lot = res ? stockLots.find((l) => l.lot_id === res.lot_id) : undefined;
    if (!res || !rf || !lot) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Reservation #${input.reservation_id} was not found.`,
      });
    }

    if (
      res.version !== input.expected_reservation_version ||
      rf.version !== input.expected_rf_version ||
      rf.progress_version !== input.expected_progress_version
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Reservation or requisition versions changed before release.',
      });
    }

    const activeMicro = toMicroUnits(res.active_quantity);
    if (activeMicro <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: 'Reservation has no unconsumed active quantity left to release.',
      });
    }

    const relVal = input.quantity_value?.trim() || res.active_quantity;
    if (!isValidUnitQuantity({ value: relVal, quantity_scale: lot.quantity_scale })) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `Release quantity "${relVal}" must match unit decimal scale ${lot.quantity_scale}.`,
      });
    }
    const relMicro = toMicroUnits(relVal);
    if (relMicro <= 0n || relMicro > activeMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Release quantity (${relVal}) must be between 0 and active reserved (${res.active_quantity}).`,
      });
    }

    const startMicro = toMicroUnits(res.offset_quantity);
    releaseLotInterval(lot, startMicro, startMicro + relMicro, res.reservation_id);

    const newActiveMicro = activeMicro - relMicro;
    const newReleasedMicro = toMicroUnits(res.released_quantity) + relMicro;
    const scale = lot.quantity_scale;

    res.active_quantity = fromMicroUnits(newActiveMicro, scale).value;
    res.released_quantity = fromMicroUnits(newReleasedMicro, scale).value;
    res.offset_quantity = fromMicroUnits(startMicro + relMicro, scale).value;
    res.version += 1;
    res.material_version += 1;
    res.status =
      newActiveMicro > 0n
        ? 'active'
        : toMicroUnits(res.fulfilled_quantity) > 0n
          ? 'closed_mixed'
          : 'released';

    rf.version += 1;
    rf.progress_version += 1;
    recomputeAllLineProgress();

    appendHistory({
      rf,
      action: `releaseRfReservation(${input.release_kind})`,
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.reserve.release',
      actor_user_id: actor,
      target_id: res.reservation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RESERVATION_RELEASED',
      message: `Released ${relVal} reserved units from reservation #${res.reservation_id} (${res.status}).`,
      snapshot: res,
    });
  }

  function reallocateRfReservation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    reservation_id: string;
    target_lot_id: string;
    target_offset_value: string;
    quantity_value: string;
    reason: string;
    expected_reservation_version: number;
    expected_rf_version: number;
    expected_progress_version: number;
    expected_source_stock_version: number;
    expected_target_stock_version: number;
    idempotency_key?: string | undefined;
  }): P07ActionResult<RfReservation> {
    const scopeErr = checkChapterAccess<RfReservation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<RfReservation>({
      action_code: 'rf.reserve.reallocate',
      actor_user_id: actor,
      target_id: input.reservation_id,
      idempotency_key: input.idempotency_key,
      payload: {
        target_lot_id: input.target_lot_id,
        target_offset_value: input.target_offset_value,
        quantity_value: input.quantity_value,
        reason: input.reason,
        expected_reservation_version: input.expected_reservation_version,
        expected_rf_version: input.expected_rf_version,
        expected_progress_version: input.expected_progress_version,
        expected_source_stock_version: input.expected_source_stock_version,
        expected_target_stock_version: input.expected_target_stock_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A reallocation reason is required.',
      });
    }

    const res = reservations.find((r) => r.reservation_id === input.reservation_id);
    const rf = res ? requisitions.find((r) => r.rf_id === res.rf_id) : undefined;
    const line = rf ? rf.lines.find((l) => l.line_id === res!.rf_line_id) : undefined;
    const srcLot = res ? stockLots.find((l) => l.lot_id === res.lot_id) : undefined;
    const dstLot = stockLots.find((l) => l.lot_id === input.target_lot_id);

    if (!res || !rf || !line || !srcLot || !dstLot) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Reservation or target lot could not be found.',
      });
    }
    if (
      res.version !== input.expected_reservation_version ||
      rf.version !== input.expected_rf_version ||
      rf.progress_version !== input.expected_progress_version ||
      srcLot.stock_version !== input.expected_source_stock_version ||
      dstLot.stock_version !== input.expected_target_stock_version
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Reservation, RF, or stock lot versions changed before reallocation.',
      });
    }
    if (dstLot.variant_id !== line.variant_id || dstLot.quantity_scale !== line.requested_quantity.quantity_scale) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'VARIANT_UNIT_MISMATCH',
        message: 'Target lot variant and precision must match the requisition line.',
      });
    }

    const qtyVal = input.quantity_value.trim();
    const dstOffsetVal = input.target_offset_value.trim();
    if (
      !isValidUnitQuantity({ value: qtyVal, quantity_scale: dstLot.quantity_scale }) ||
      !isValidUnitQuantity({ value: dstOffsetVal, quantity_scale: dstLot.quantity_scale })
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: 'Target offset and quantity must match approved scale.',
      });
    }

    const qtyMicro = toMicroUnits(qtyVal);
    const activeMicro = toMicroUnits(res.active_quantity);
    if (qtyMicro <= 0n || qtyMicro !== activeMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'EQUAL_QUANTITY_REQUIRED',
        message: `Reallocation must match full active quantity (${res.active_quantity}).`,
      });
    }

    const dstOffsetMicro = toMicroUnits(dstOffsetVal);
    if (!isIntervalFreeInLot(dstLot, dstOffsetMicro, dstOffsetMicro + qtyMicro)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Target lot #${dstLot.lot_id} range is not free.`,
      });
    }

    const oldStartMicro = toMicroUnits(res.offset_quantity);
    releaseLotInterval(srcLot, oldStartMicro, oldStartMicro + qtyMicro, res.reservation_id);
    splitAndReserveLotInterval(dstLot, dstOffsetMicro, dstOffsetMicro + qtyMicro, res.reservation_id);

    res.lot_id = dstLot.lot_id;
    res.basis_segment_id = dstLot.basis_segment_id;
    res.offset_quantity = fromMicroUnits(dstOffsetMicro, dstLot.quantity_scale).value;
    res.version += 1;
    res.material_version += 1;

    rf.version += 1;
    rf.progress_version += 1;
    recomputeAllLineProgress();

    appendHistory({
      rf,
      action: 'reallocateRfReservation',
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'rf.reserve.reallocate',
      actor_user_id: actor,
      target_id: res.reservation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RESERVATION_REALLOCATED',
      message: `Reallocated reservation #${res.reservation_id} (${res.active_quantity} units) to lot #${dstLot.lot_id}.`,
      snapshot: res,
    });
  }

  function lookupRequisitionOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P07ActionResult<P07UncertainLookupResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested operation scope is outside authorized chapter.',
        data: {
          action_result: 'forbidden',
          input_policy: 'preserve',
          lookup_state: null,
          operation_id: null,
          idempotency_key: null,
          recovered_snapshot: null,
        },
      });
    }

    const found =
      input.query_type === 'by_key'
        ? operationLedger.find(
            (e) =>
              e.chapter_id === chapterId &&
              (!input.action_code || e.action_code === input.action_code) &&
              e.idempotency_key === input.idempotency_key?.trim()
          )
        : operationLedger.find(
            (e) => e.chapter_id === chapterId && e.operation_id === input.operation_id?.trim()
          );

    if (found) {
      return recordOutcome({
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered committed operation (${found.code}) for key "${found.idempotency_key}".`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: found.operation_id,
          idempotency_key: found.idempotency_key,
          recovered_snapshot: structuredClone(found.snapshot),
        },
      });
    }

    return recordOutcome({
      ok: false,
      http_status: 200,
      code: 'OPERATION_UNCERTAIN',
      message:
        'No visible committed operation found for that reference. Preserve entered requisition fields and check again before retrying.',
      data: {
        action_result: 'uncertain',
        input_policy: 'preserve',
        lookup_state: 'pending_or_not_visible',
        operation_id: null,
        idempotency_key: input.idempotency_key?.trim() || null,
        recovered_snapshot: null,
      },
    });
  }

  return {
    getSnapshot: () => ({
      chapter_id: chapterId,
      chapter_prefix: chapterPrefix,
      chapter_name: chapterName,
      requisitions: requisitions.map((r) => structuredClone(r)),
      stock_lots: stockLots.map((l) => structuredClone(l)),
      preparations: preparations.map((p) => structuredClone(p)),
      reservations: reservations.map((r) => structuredClone(r)),
      history: history.map((h) => structuredClone(h)),
      stock_summary: computeStockSummary(),
      operation_ledger: operationLedger.map((o) => structuredClone(o)),
      last_action: lastAction,
    }),
    registerEligibleStockLot,
    createInternalRf,
    replaceInternalRfDraft,
    submitInternalRf,
    approveInternalRf,
    returnInternalRf,
    reviseInternalRf,
    cancelInternalRf,
    prepareRfReservation,
    commitRfReservation,
    releaseRfReservation,
    reallocateRfReservation,
    lookupRequisitionOperation,
  };
}
