import { computeBatchSnapshotHashV1, computeDeterministicHash } from './canonicalHash';
import type { CanonicalBatchSnapshotInput } from './canonicalHash';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P11_CONTEXT_STORAGE_KEY = 'ysp_p11_context';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type RfIssueStatus =
  | 'open'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'partially_fulfilled_and_canceled'
  | 'canceled';

export interface ApprovedRfForIssue {
  rf_id: string;
  rf_line_id: string;
  rf_reference: string;
  requester_user_id: string;
  variant_id: string;
  item_name?: string | undefined;
  quantity_scale: number;
  requested_quantity: string;
  active_reserved_quantity: string;
  issued_quantity: string;
  canceled_quantity: string;
  remaining_demand_quantity: string;
  uncovered_shortage_quantity: string;
  status: RfIssueStatus;
  closure_reason: string | null;
  version: number;
}

export interface BoundIssueEvidence {
  evidence_kind: 'IS_AR' | 'EL';
  signature_evidence_hash: string;
  photo_evidence_hash: string | null;
  issuer_user_id: string;
  recipient_user_id: string;
  recipient_acknowledged: boolean;
  signed_at: string;
  linked_batch_snapshot_hash: string;
}

export interface ActualIssueBatch {
  batch_id: string;
  isar_reference: string;
  rf_id: string;
  rf_reference: string;
  variant_id: string;
  quantity_scale: number;
  batch_quantity: string;
  recipient_name: string;
  recipient_user_id: string | null;
  recipient_capacity: string;
  prepared_by_user_id: string;
  material_version: number;
  batch_snapshot_hash: string;
  status: 'draft' | 'ready' | 'posted';
  ready_evidence: BoundIssueEvidence | null;
  posted_at: string | null;
  version: number;
}

export interface P11HistoryEntry {
  event_id: string;
  rf_id: string;
  batch_id: string | null;
  action: string;
  actor_user_id: string;
  notes: string;
  timestamp: string;
}

export interface P11StockSummary {
  usable_on_hand: string;
  active_reserved: string;
  total_issued: string;
  open_rf_remaining: string;
  total_canceled: string;
}

export interface P11OperationLedgerEntry {
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

export interface P11ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P11LookupResult {
  action_result: 'recovered' | 'uncertain' | 'forbidden';
  input_policy: 'may_clear' | 'preserve';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P11EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  approved_rfs: ReadonlyArray<ApprovedRfForIssue>;
  batches: ReadonlyArray<ActualIssueBatch>;
  history: ReadonlyArray<P11HistoryEntry>;
  summary: P11StockSummary;
  operation_ledger: ReadonlyArray<P11OperationLedgerEntry>;
  last_action: P11ActionResult | null;
}

export interface P11EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
}

export interface P11ActualIssueEngine {
  getSnapshot: () => P11EngineSnapshot;
  registerApprovedRfForIssue: (input: {
    chapter_id?: string | undefined;
    rf_reference: string;
    requester_user_id: string;
    variant_id: string;
    item_name?: string | undefined;
    requested_quantity_value: string;
    initial_reserved_value: string;
    initial_usable_on_hand_value?: string | undefined;
    quantity_scale: number;
  }) => P11ActionResult<ApprovedRfForIssue>;
  replenishRfReservationFromRm: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    rm_reference: string;
    replenished_quantity_value: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ApprovedRfForIssue>;
  prepareActualIssueBatch: (input: {
    chapter_id?: string | undefined;
    prepared_by_user_id: string;
    rf_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_user_id?: string | undefined;
    recipient_capacity: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ActualIssueBatch>;
  reviseActualIssueBatch: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    batch_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_user_id?: string | undefined;
    recipient_capacity: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ActualIssueBatch>;
  bindReadyIssueEvidence: (input: {
    chapter_id?: string | undefined;
    batch_id: string;
    evidence_kind: 'IS_AR' | 'EL';
    signature_evidence_hash: string;
    photo_evidence_hash?: string | undefined;
    issuer_user_id: string;
    recipient_user_id: string;
    recipient_acknowledged: boolean;
    signed_at: string;
    linked_batch_snapshot_hash: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ActualIssueBatch>;
  postActualIssueBatch: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    batch_id: string;
    expected_snapshot_hash?: string | undefined;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ActualIssueBatch>;
  cancelRemainingRfDemand: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    cancellation_reason: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }) => P11ActionResult<ApprovedRfForIssue>;
  lookupIssueOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P11ActionResult<P11LookupResult>;
}

function readStoredP11Options(): P11EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P11_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P11EngineOptions;
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

export function createP11ActualIssueEngine(options?: P11EngineOptions): P11ActualIssueEngine {
  const seed = options ?? readStoredP11Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 11000;
  let isarRefSeq = 0;

  let usableMicroTotal = 0n;
  let totalIssuedMicro = 0n;

  const approvedRfs: ApprovedRfForIssue[] = [];
  const batches: ActualIssueBatch[] = [];
  const history: P11HistoryEntry[] = [];
  const operationLedger: P11OperationLedgerEntry[] = [];
  let lastAction: P11ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P11${String(seq).padStart(19, '0')}`;
  }

  function nextTimestamp(): string {
    return `2026-11-22T12:45:${String(seq % 60).padStart(2, '0')}.000000Z`;
  }

  function allocateIsarReference(): string {
    isarRefSeq += 1;
    return `${chapterPrefix}-ISAR-2026-${String(isarRefSeq).padStart(6, '0')}`;
  }

  function computeSnapshotHashForBatch(params: {
    rf: ApprovedRfForIssue;
    batch_id: string;
    material_version: number;
    recipient_name: string;
    recipient_user_id: string | null;
    recipient_capacity: string;
    batch_quantity: string;
  }): string {
    const input: CanonicalBatchSnapshotInput = {
      chapter_id: chapterId,
      record: { id: params.rf.rf_id, kind: 'rf' },
      material_version: params.material_version,
      batch_id: params.batch_id,
      recipient: {
        name: params.recipient_name,
        user_id: params.recipient_user_id,
        capacity: params.recipient_capacity,
      },
      lines: [
        {
          line: {
            chapter_id: chapterId,
            record: { id: params.rf.rf_id, kind: 'rf' },
            line_id: params.rf.rf_line_id,
            line_kind: 'rf_line',
            variant_id: params.rf.variant_id,
          },
          quantity: params.batch_quantity,
        },
      ],
    };
    return computeBatchSnapshotHashV1(input);
  }

  function recordOutcome<T>(res: P11ActionResult<T>): P11ActionResult<T> {
    lastAction = res;
    return res;
  }

  function checkChapter<T>(requested?: string): P11ActionResult<T> | null {
    if (requested !== undefined && requested !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested issuance record is outside authorized chapter scope.',
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
    | { status: 'replay'; result: P11ActionResult<T> }
    | { status: 'conflict'; result: P11ActionResult<T> }
    | { status: 'fresh'; key: string | null; fingerprint: string } {
    const key = params.idempotency_key?.trim() || null;
    const fingerprint = computeDeterministicHash({
      target_id: params.target_id,
      payload: params.payload,
    });
    if (!key) return { status: 'fresh', key: null, fingerprint };

    const existing = operationLedger.find(
      (e) =>
        e.chapter_id === chapterId &&
        e.action_code === params.action_code &&
        e.actor_user_id === params.actor_user_id &&
        e.idempotency_key === key
    );
    if (!existing) return { status: 'fresh', key, fingerprint };
    if (existing.payload_fingerprint === fingerprint) {
      return {
        status: 'replay',
        result: recordOutcome<T>({
          ok: true,
          http_status: existing.http_status,
          code: existing.code,
          message: existing.message,
          replayed: true,
          data: structuredClone(existing.snapshot) as T,
        }),
      };
    }
    return {
      status: 'conflict',
      result: recordOutcome<T>({
        ok: false,
        http_status: 409,
        code: 'ACTION_KEY_CONFLICT',
        message: 'Idempotency key was already committed with a different request payload.',
      }),
    };
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
  }): P11ActionResult<T> {
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

  function totalActiveReservedMicro(): bigint {
    return approvedRfs.reduce((acc, rf) => acc + toMicroUnits(rf.active_reserved_quantity), 0n);
  }

  function computeSummary(): P11StockSummary {
    const activeReservedMicro = totalActiveReservedMicro();
    const openRemainingMicro = approvedRfs.reduce(
      (acc, rf) => acc + toMicroUnits(rf.remaining_demand_quantity),
      0n
    );
    const totalCanceledMicro = approvedRfs.reduce(
      (acc, rf) => acc + toMicroUnits(rf.canceled_quantity),
      0n
    );
    return {
      usable_on_hand: formatTrimmedMicro(usableMicroTotal),
      active_reserved: formatTrimmedMicro(activeReservedMicro),
      total_issued: formatTrimmedMicro(totalIssuedMicro),
      open_rf_remaining: formatTrimmedMicro(openRemainingMicro),
      total_canceled: formatTrimmedMicro(totalCanceledMicro),
    };
  }

  function registerApprovedRfForIssue(input: {
    chapter_id?: string | undefined;
    rf_reference: string;
    requester_user_id: string;
    variant_id: string;
    item_name?: string | undefined;
    requested_quantity_value: string;
    initial_reserved_value: string;
    initial_usable_on_hand_value?: string | undefined;
    quantity_scale: number;
  }): P11ActionResult<ApprovedRfForIssue> {
    const scopeErr = checkChapter<ApprovedRfForIssue>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const rfRef = input.rf_reference.trim();
    const requester = input.requester_user_id.trim();
    const variantId = input.variant_id.trim();
    const reqVal = input.requested_quantity_value.trim();
    const resVal = input.initial_reserved_value.trim();
    const usableVal = input.initial_usable_on_hand_value?.trim();

    if (!rfRef || !requester || !variantId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'RF_SOURCE_FIELDS_REQUIRED',
        message: 'Requisition reference, requester ID, and variant ID are required.',
      });
    }
    if (
      !isValidUnitQuantity({ value: reqVal, quantity_scale: input.quantity_scale }) ||
      !isValidUnitQuantity({ value: resVal, quantity_scale: input.quantity_scale })
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `Requested and reserved quantities must match unit decimal scale ${input.quantity_scale}.`,
      });
    }

    const reqMicro = toMicroUnits(reqVal);
    const resMicro = toMicroUnits(resVal);
    if (reqMicro <= 0n || resMicro > reqMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_RESERVATION_BOUNDS',
        message:
          'Requested quantity must be positive, and initial reservation cannot exceed requested demand.',
      });
    }

    let addedUsableMicro = 0n;
    if (usableVal !== undefined && usableVal !== '') {
      if (!isValidUnitQuantity({ value: usableVal, quantity_scale: input.quantity_scale })) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_PRECISION',
          message: `Usable stock quantity "${usableVal}" must match unit decimal scale ${input.quantity_scale}.`,
        });
      }
      addedUsableMicro = toMicroUnits(usableVal);
    }

    const nextUsableTotal = usableMicroTotal + addedUsableMicro;
    const freeUsableMicro = nextUsableTotal - totalActiveReservedMicro();
    if (resMicro > freeUsableMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'INSUFFICIENT_USABLE_STOCK',
        message: 'Initial active reservation cannot exceed available unreserved usable stock.',
      });
    }

    usableMicroTotal = nextUsableTotal;

    const rfId = nextId();
    const rfLineId = nextId();
    const rf: ApprovedRfForIssue = {
      rf_id: rfId,
      rf_line_id: rfLineId,
      rf_reference: rfRef,
      requester_user_id: requester,
      variant_id: variantId,
      item_name: input.item_name?.trim() || undefined,
      quantity_scale: input.quantity_scale,
      requested_quantity: fromMicroUnits(reqMicro, input.quantity_scale).value,
      active_reserved_quantity: fromMicroUnits(resMicro, input.quantity_scale).value,
      issued_quantity: '0',
      canceled_quantity: '0',
      remaining_demand_quantity: fromMicroUnits(reqMicro, input.quantity_scale).value,
      uncovered_shortage_quantity: fromMicroUnits(reqMicro - resMicro, input.quantity_scale).value,
      status: 'open',
      closure_reason: null,
      version: 1,
    };
    approvedRfs.push(rf);

    history.push({
      event_id: nextId(),
      rf_id: rfId,
      batch_id: null,
      action: 'registerApprovedRfForIssue',
      actor_user_id: requester,
      notes: `Registered ${rf.rf_reference}: requested ${rf.requested_quantity}, active reserved ${rf.active_reserved_quantity}, uncovered ${rf.uncovered_shortage_quantity}`,
      timestamp: nextTimestamp(),
    });

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'APPROVED_RF_REGISTERED',
      message: `Registered ${rf.rf_reference} with ${rf.active_reserved_quantity} actively reserved (${rf.uncovered_shortage_quantity} uncovered pending replenishment).`,
      data: structuredClone(rf),
    });
  }

  function replenishRfReservationFromRm(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    rm_reference: string;
    replenished_quantity_value: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ApprovedRfForIssue> {
    const scopeErr = checkChapter<ApprovedRfForIssue>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const rmRef = input.rm_reference.trim();
    if (!actor || !rmRef) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REPLENISHMENT_SOURCE_REQUIRED',
        message: 'Stockroom officer ID and posted Receiving Memo reference are required.',
      });
    }

    const idem = checkIdempotency<ApprovedRfForIssue>({
      action_code: 'issuance.rf.replenish',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = approvedRfs.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Approved requisition line was not found.',
      });
    }
    if (rf.version !== input.expected_rf_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Requisition line changed before replenishment; reload current reservation balance.',
      });
    }
    if (rf.status === 'fulfilled' || rf.status === 'canceled' || rf.status === 'partially_fulfilled_and_canceled') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'RF_ALREADY_CLOSED',
        message: 'Closed requisition lines cannot receive additional reservations.',
      });
    }

    const repVal = input.replenished_quantity_value.trim();
    if (!isValidUnitQuantity({ value: repVal, quantity_scale: rf.quantity_scale }) || toMicroUnits(repVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Replenished quantity "${repVal}" must be positive at scale ${rf.quantity_scale}.`,
      });
    }

    const uncoveredMicro = toMicroUnits(rf.uncovered_shortage_quantity);
    if (uncoveredMicro === 0n) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'NO_UNCOVERED_DEMAND',
        message: 'Requisition line already has full reservation coverage for its remaining demand.',
      });
    }

    const repMicro = toMicroUnits(repVal);
    usableMicroTotal += repMicro;

    const allocateMicro = repMicro < uncoveredMicro ? repMicro : uncoveredMicro;
    const newReservedMicro = toMicroUnits(rf.active_reserved_quantity) + allocateMicro;
    const newUncoveredMicro = uncoveredMicro - allocateMicro;

    rf.active_reserved_quantity = fromMicroUnits(newReservedMicro, rf.quantity_scale).value;
    rf.uncovered_shortage_quantity = fromMicroUnits(newUncoveredMicro, rf.quantity_scale).value;
    rf.version += 1;

    history.push({
      event_id: nextId(),
      rf_id: rf.rf_id,
      batch_id: null,
      action: 'replenishRfReservationFromRm',
      actor_user_id: actor,
      notes: `Replenished ${fromMicroUnits(repMicro, rf.quantity_scale).value} usable via ${rmRef}; active reservation now ${rf.active_reserved_quantity}`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.rf.replenish',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_RESERVATION_REPLENISHED',
      message: `Replenished from ${rmRef}: active reservation is now ${rf.active_reserved_quantity} (${rf.uncovered_shortage_quantity} uncovered remaining).`,
      snapshot: rf,
    });
  }

  function prepareActualIssueBatch(input: {
    chapter_id?: string | undefined;
    prepared_by_user_id: string;
    rf_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_user_id?: string | undefined;
    recipient_capacity: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ActualIssueBatch> {
    const scopeErr = checkChapter<ActualIssueBatch>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const preparer = input.prepared_by_user_id.trim();
    const recName = input.recipient_name.trim();
    const recCap = input.recipient_capacity.trim();
    const recUserId = input.recipient_user_id?.trim() || null;

    if (!preparer || !recName || !recCap) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'BATCH_FIELDS_REQUIRED',
        message: 'Preparer ID, recipient name, and recipient capacity are required to prepare a batch.',
      });
    }

    const idem = checkIdempotency<ActualIssueBatch>({
      action_code: 'issuance.batch.prepare',
      actor_user_id: preparer,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = approvedRfs.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Approved requisition line was not found.',
      });
    }
    if (rf.version !== input.expected_rf_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Requisition line changed; reload reservation state before preparing a batch.',
      });
    }
    if (rf.status === 'fulfilled' || rf.status === 'canceled' || rf.status === 'partially_fulfilled_and_canceled') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'RF_ALREADY_CLOSED',
        message: 'Cannot prepare an issue batch for a closed requisition line.',
      });
    }

    const qtyVal = input.batch_quantity_value.trim();
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: rf.quantity_scale }) || toMicroUnits(qtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Batch issue quantity "${qtyVal}" must be positive at scale ${rf.quantity_scale}.`,
      });
    }

    const batchMicro = toMicroUnits(qtyVal);
    const activeReservedMicro = toMicroUnits(rf.active_reserved_quantity);
    const unpostedPendingMicro = batches
      .filter((b) => b.rf_id === rf.rf_id && b.status !== 'posted')
      .reduce((acc, b) => acc + toMicroUnits(b.batch_quantity), 0n);

    if (unpostedPendingMicro + batchMicro > activeReservedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'EXCEEDS_ACTIVE_RESERVATION',
        message: `Requested batch quantity exceeds currently active reserved stock (${rf.active_reserved_quantity} reserved; wait for incoming replenishment before issuing uncovered demand).`,
      });
    }

    const batchId = nextId();
    const isarRef = allocateIsarReference();
    const formattedQty = fromMicroUnits(batchMicro, rf.quantity_scale).value;
    const hash = computeSnapshotHashForBatch({
      rf,
      batch_id: batchId,
      material_version: 1,
      recipient_name: recName,
      recipient_user_id: recUserId,
      recipient_capacity: recCap,
      batch_quantity: formattedQty,
    });

    const batch: ActualIssueBatch = {
      batch_id: batchId,
      isar_reference: isarRef,
      rf_id: rf.rf_id,
      rf_reference: rf.rf_reference,
      variant_id: rf.variant_id,
      quantity_scale: rf.quantity_scale,
      batch_quantity: formattedQty,
      recipient_name: recName,
      recipient_user_id: recUserId,
      recipient_capacity: recCap,
      prepared_by_user_id: preparer,
      material_version: 1,
      batch_snapshot_hash: hash,
      status: 'draft',
      ready_evidence: null,
      posted_at: null,
      version: 1,
    };
    batches.push(batch);

    history.push({
      event_id: nextId(),
      rf_id: rf.rf_id,
      batch_id: batch.batch_id,
      action: 'prepareActualIssueBatch',
      actor_user_id: preparer,
      notes: `Prepared ${batch.isar_reference} for ${batch.batch_quantity} units to ${batch.recipient_name}`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.batch.prepare',
      actor_user_id: preparer,
      target_id: batch.batch_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'ISSUE_BATCH_PREPARED',
      message: `Prepared issue batch ${batch.isar_reference} (${batch.batch_quantity} units); bind signed acknowledgment before posting.`,
      snapshot: batch,
    });
  }

  function reviseActualIssueBatch(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    batch_id: string;
    batch_quantity_value: string;
    recipient_name: string;
    recipient_user_id?: string | undefined;
    recipient_capacity: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ActualIssueBatch> {
    const scopeErr = checkChapter<ActualIssueBatch>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const recName = input.recipient_name.trim();
    const recCap = input.recipient_capacity.trim();
    const recUserId = input.recipient_user_id?.trim() || null;

    if (!actor || !recName || !recCap) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'BATCH_FIELDS_REQUIRED',
        message: 'Officer ID, recipient name, and recipient capacity are required to revise a batch.',
      });
    }

    const idem = checkIdempotency<ActualIssueBatch>({
      action_code: 'issuance.batch.revise',
      actor_user_id: actor,
      target_id: input.batch_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const batch = batches.find((b) => b.batch_id === input.batch_id);
    const rf = batch ? approvedRfs.find((r) => r.rf_id === batch.rf_id) : undefined;
    if (!batch || !rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Issue batch was not found.',
      });
    }
    if (batch.status === 'posted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'BATCH_ALREADY_POSTED',
        message: 'Posted issue batches are immutable and cannot be revised.',
      });
    }
    if (batch.version !== input.expected_batch_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Issue batch state changed; reload before revising.',
      });
    }

    const qtyVal = input.batch_quantity_value.trim();
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: rf.quantity_scale }) || toMicroUnits(qtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Revised batch quantity "${qtyVal}" must be positive at scale ${rf.quantity_scale}.`,
      });
    }

    const revisedMicro = toMicroUnits(qtyVal);
    const activeReservedMicro = toMicroUnits(rf.active_reserved_quantity);
    const otherUnpostedMicro = batches
      .filter((b) => b.rf_id === rf.rf_id && b.status !== 'posted' && b.batch_id !== batch.batch_id)
      .reduce((acc, b) => acc + toMicroUnits(b.batch_quantity), 0n);

    if (otherUnpostedMicro + revisedMicro > activeReservedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'EXCEEDS_ACTIVE_RESERVATION',
        message: `Revised batch quantity exceeds currently active reserved stock (${rf.active_reserved_quantity} reserved).`,
      });
    }

    const formattedQty = fromMicroUnits(revisedMicro, rf.quantity_scale).value;
    batch.batch_quantity = formattedQty;
    batch.recipient_name = recName;
    batch.recipient_user_id = recUserId;
    batch.recipient_capacity = recCap;
    batch.material_version += 1;
    batch.batch_snapshot_hash = computeSnapshotHashForBatch({
      rf,
      batch_id: batch.batch_id,
      material_version: batch.material_version,
      recipient_name: batch.recipient_name,
      recipient_user_id: batch.recipient_user_id,
      recipient_capacity: batch.recipient_capacity,
      batch_quantity: batch.batch_quantity,
    });
    // Material edits invalidate previously signed ready evidence
    batch.ready_evidence = null;
    batch.status = 'draft';
    batch.version += 1;

    history.push({
      event_id: nextId(),
      rf_id: rf.rf_id,
      batch_id: batch.batch_id,
      action: 'reviseActualIssueBatch',
      actor_user_id: actor,
      notes: `Revised ${batch.isar_reference} to ${batch.batch_quantity} units (material v${batch.material_version}); prior evidence invalidated`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.batch.revise',
      actor_user_id: actor,
      target_id: batch.batch_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'ISSUE_BATCH_REVISED',
      message: `Revised ${batch.isar_reference} to material v${batch.material_version}; prior signature invalidated and must be re-signed.`,
      snapshot: batch,
    });
  }

  function bindReadyIssueEvidence(input: {
    chapter_id?: string | undefined;
    batch_id: string;
    evidence_kind: 'IS_AR' | 'EL';
    signature_evidence_hash: string;
    photo_evidence_hash?: string | undefined;
    issuer_user_id: string;
    recipient_user_id: string;
    recipient_acknowledged: boolean;
    signed_at: string;
    linked_batch_snapshot_hash: string;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ActualIssueBatch> {
    const scopeErr = checkChapter<ActualIssueBatch>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const issuer = input.issuer_user_id.trim();
    const recipient = input.recipient_user_id.trim();
    if (!issuer || !recipient) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'EVIDENCE_PARTIES_REQUIRED',
        message: 'Both issuing custodian ID and recipient member ID are required.',
      });
    }

    const idem = checkIdempotency<ActualIssueBatch>({
      action_code: 'issuance.batch.bind_evidence',
      actor_user_id: issuer,
      target_id: input.batch_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const batch = batches.find((b) => b.batch_id === input.batch_id);
    if (!batch) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Issue batch was not found.',
      });
    }
    if (batch.status === 'posted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'BATCH_ALREADY_POSTED',
        message: 'Issue batch has already been posted.',
      });
    }
    if (batch.version !== input.expected_batch_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Issue batch version changed before evidence binding.',
      });
    }
    if (issuer === recipient) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'SEPARATION_OF_DUTIES_VIOLATION',
        message: 'Issuing officer and recipient signatory cannot be the same account.',
      });
    }
    if (!input.recipient_acknowledged) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'MISSING_RECIPIENT_ACKNOWLEDGMENT',
        message: 'Recipient signature or physical acknowledgment is required before binding ready evidence.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.signed_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Signature timestamp must be a valid Z-suffixed UTC instant.',
      });
    }

    const sigHash = input.signature_evidence_hash.trim();
    const photoHash = input.photo_evidence_hash?.trim() || null;
    if (!SHA256_HEX_PATTERN.test(sigHash) || (photoHash !== null && !SHA256_HEX_PATTERN.test(photoHash))) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_EVIDENCE_HASH',
        message: 'Evidence digests must be valid 64-character lowercase SHA-256 hex strings.',
      });
    }
    if (input.linked_batch_snapshot_hash.trim() !== batch.batch_snapshot_hash) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_BATCH_EVIDENCE_MISMATCH',
        message: 'Evidence snapshot digest does not match current batch material snapshot; refresh and re-sign.',
      });
    }

    batch.ready_evidence = {
      evidence_kind: input.evidence_kind,
      signature_evidence_hash: sigHash,
      photo_evidence_hash: photoHash,
      issuer_user_id: issuer,
      recipient_user_id: recipient,
      recipient_acknowledged: true,
      signed_at: input.signed_at.trim(),
      linked_batch_snapshot_hash: batch.batch_snapshot_hash,
    };
    batch.status = 'ready';
    batch.version += 1;

    history.push({
      event_id: nextId(),
      rf_id: batch.rf_id,
      batch_id: batch.batch_id,
      action: 'bindReadyIssueEvidence',
      actor_user_id: issuer,
      notes: `Bound signed ${input.evidence_kind} evidence to ${batch.isar_reference} (material v${batch.material_version})`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.batch.bind_evidence',
      actor_user_id: issuer,
      target_id: batch.batch_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'ISSUE_EVIDENCE_BOUND',
      message: `Bound ready issuance evidence for ${batch.isar_reference}; batch is ready to post.`,
      snapshot: batch,
    });
  }

  function postActualIssueBatch(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    batch_id: string;
    expected_snapshot_hash?: string | undefined;
    expected_batch_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ActualIssueBatch> {
    const scopeErr = checkChapter<ActualIssueBatch>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    if (!actor) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'ISSUANCE_ACTOR_REQUIRED',
        message: 'Posting custodian user ID is required.',
      });
    }

    const idem = checkIdempotency<ActualIssueBatch>({
      action_code: 'issuance.batch.post',
      actor_user_id: actor,
      target_id: input.batch_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const batch = batches.find((b) => b.batch_id === input.batch_id);
    const rf = batch ? approvedRfs.find((r) => r.rf_id === batch.rf_id) : undefined;
    if (!batch || !rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Issue batch or parent requisition line was not found.',
      });
    }
    if (batch.status === 'posted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'BATCH_ALREADY_POSTED',
        message: 'Issue batch has already been posted.',
      });
    }
    if (batch.version !== input.expected_batch_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Issue batch state changed; reload before posting.',
      });
    }
    if (
      input.expected_snapshot_hash &&
      input.expected_snapshot_hash.trim() !== batch.batch_snapshot_hash
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_BATCH_EVIDENCE_MISMATCH',
        message: 'Submitted batch snapshot digest is stale after material edits; re-sign before posting.',
      });
    }
    if (!batch.ready_evidence) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MISSING_ISSUANCE_EVIDENCE',
        message: 'Signed recipient acknowledgment evidence must be bound before posting stock deduction.',
      });
    }
    if (batch.ready_evidence.linked_batch_snapshot_hash !== batch.batch_snapshot_hash) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_BATCH_EVIDENCE_MISMATCH',
        message: 'Bound evidence snapshot digest does not match current batch material snapshot.',
      });
    }

    const batchMicro = toMicroUnits(batch.batch_quantity);
    const reservedMicro = toMicroUnits(rf.active_reserved_quantity);
    if (batchMicro > reservedMicro || batchMicro > usableMicroTotal) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'EXCEEDS_ACTIVE_RESERVATION',
        message: 'Batch quantity exceeds current active reservation or usable on-hand stock.',
      });
    }

    usableMicroTotal -= batchMicro;
    totalIssuedMicro += batchMicro;

    const newReservedMicro = reservedMicro - batchMicro;
    const newIssuedMicro = toMicroUnits(rf.issued_quantity) + batchMicro;
    const reqMicro = toMicroUnits(rf.requested_quantity);
    const cancMicro = toMicroUnits(rf.canceled_quantity);
    const newRemainingMicro = reqMicro - newIssuedMicro - cancMicro;

    rf.active_reserved_quantity = fromMicroUnits(newReservedMicro, rf.quantity_scale).value;
    rf.issued_quantity = fromMicroUnits(newIssuedMicro, rf.quantity_scale).value;
    rf.remaining_demand_quantity = fromMicroUnits(newRemainingMicro, rf.quantity_scale).value;
    rf.uncovered_shortage_quantity = fromMicroUnits(
      newRemainingMicro - newReservedMicro,
      rf.quantity_scale
    ).value;
    rf.status = newRemainingMicro === 0n ? 'fulfilled' : 'partially_fulfilled';
    rf.version += 1;

    batch.status = 'posted';
    batch.posted_at = nextTimestamp();
    batch.version += 1;

    history.push({
      event_id: nextId(),
      rf_id: rf.rf_id,
      batch_id: batch.batch_id,
      action: 'postActualIssueBatch',
      actor_user_id: actor,
      notes: `Posted ${batch.isar_reference} (${batch.batch_quantity} issued); total RF issued ${rf.issued_quantity}, remaining ${rf.remaining_demand_quantity}`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.batch.post',
      actor_user_id: actor,
      target_id: batch.batch_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'ISSUE_BATCH_POSTED',
      message: `Posted ${batch.isar_reference}: ${batch.batch_quantity} issued (${rf.issued_quantity} total issued on ${rf.rf_reference}, ${rf.remaining_demand_quantity} remaining).`,
      snapshot: batch,
    });
  }

  function cancelRemainingRfDemand(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    rf_id: string;
    cancellation_reason: string;
    expected_rf_version: number;
    idempotency_key?: string | undefined;
  }): P11ActionResult<ApprovedRfForIssue> {
    const scopeErr = checkChapter<ApprovedRfForIssue>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const reason = input.cancellation_reason.trim();
    if (!actor || !reason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'CANCELLATION_REASON_REQUIRED',
        message: 'Officer ID and cancellation rationale are required to close remaining demand.',
      });
    }

    const idem = checkIdempotency<ApprovedRfForIssue>({
      action_code: 'issuance.rf.cancel_remainder',
      actor_user_id: actor,
      target_id: input.rf_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const rf = approvedRfs.find((r) => r.rf_id === input.rf_id);
    if (!rf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Approved requisition line was not found.',
      });
    }
    if (rf.version !== input.expected_rf_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Requisition line version changed; reload before canceling remainder.',
      });
    }

    const remainingMicro = toMicroUnits(rf.remaining_demand_quantity);
    if (remainingMicro === 0n) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'RF_ALREADY_CLOSED',
        message: 'No open remaining demand left to cancel on this requisition line.',
      });
    }

    const issuedMicro = toMicroUnits(rf.issued_quantity);
    rf.active_reserved_quantity = '0';
    rf.canceled_quantity = fromMicroUnits(
      toMicroUnits(rf.canceled_quantity) + remainingMicro,
      rf.quantity_scale
    ).value;
    rf.remaining_demand_quantity = '0';
    rf.uncovered_shortage_quantity = '0';
    rf.status = issuedMicro > 0n ? 'partially_fulfilled_and_canceled' : 'canceled';
    rf.closure_reason = reason;
    rf.version += 1;

    history.push({
      event_id: nextId(),
      rf_id: rf.rf_id,
      batch_id: null,
      action: 'cancelRemainingRfDemand',
      actor_user_id: actor,
      notes: `Formally closed ${rf.rf_reference}: ${rf.issued_quantity} issued, ${rf.canceled_quantity} canceled (${reason})`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'issuance.rf.cancel_remainder',
      actor_user_id: actor,
      target_id: rf.rf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'RF_REMAINDER_CANCELED',
      message: `Closed ${rf.rf_reference}: ${rf.issued_quantity} issued and ${rf.canceled_quantity} formally canceled.`,
      snapshot: rf,
    });
  }

  function lookupIssueOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P11ActionResult<P11LookupResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested issuance operation scope is outside authorized chapter.',
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
      message: 'No visible issuance operation found. Preserve entered batch details before retrying.',
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
      approved_rfs: approvedRfs.map((r) => structuredClone(r)),
      batches: batches.map((b) => structuredClone(b)),
      history: history.map((h) => structuredClone(h)),
      summary: computeSummary(),
      operation_ledger: operationLedger.map((o) => structuredClone(o)),
      last_action: lastAction,
    }),
    registerApprovedRfForIssue,
    replenishRfReservationFromRm,
    prepareActualIssueBatch,
    reviseActualIssueBatch,
    bindReadyIssueEvidence,
    postActualIssueBatch,
    cancelRemainingRfDemand,
    lookupIssueOperation,
  };
}
