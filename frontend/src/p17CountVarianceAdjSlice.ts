import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P17_CONTEXT_STORAGE_KEY = 'ysp_p17_context';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type CountVarianceKind =
  | 'negative_shortage'
  | 'positive_gain_discovery'
  | 'damaged_quarantine';

export type VarianceAdjStatus =
  | 'awaiting_recount'
  | 'awaiting_dual_approval'
  | 'approved_ready_to_post'
  | 'rejected'
  | 'posted';

export interface LockedCustodyPosition {
  position_id: string;
  chapter_id: string;
  variant_id: string;
  item_name: string;
  location_id: string;
  custodian_user_id: string;
  quantity_scale: number;
  recorded_usable_on_hand: UnitQuantity;
  quarantined_stock: UnitQuantity;
  baseline_locked: boolean;
  gain_lots: string[];
  version: number;
}

export interface VarianceApprovalSlot {
  approver_user_id: string;
  is_independent_fallback: boolean;
  approved_at: string;
}

export interface CountVarianceAdjRecord {
  adj_id: string;
  chapter_id: string;
  adj_reference: string;
  position_id: string;
  variant_id: string;
  preparer_user_id: string;
  custodian_user_id: string;
  variance_kind: CountVarianceKind;
  variance_quantity: UnitQuantity;
  reason: string;
  count_sheet_hash: string;
  initiated_at: string;
  recount_completed: boolean;
  recounter_user_id: string | null;
  recount_verified_quantity: UnitQuantity | null;
  recount_notes: string | null;
  recounted_at: string | null;
  chapter_head_slot: VarianceApprovalSlot | null;
  finance_slot: VarianceApprovalSlot | null;
  rejection_reason: string | null;
  status: VarianceAdjStatus;
  gain_lot_reference: string | null;
  posted_at: string | null;
  version: number;
}

export interface P17HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P17SummaryMetrics {
  recorded_usable_on_hand: string;
  quarantined_stock: string;
  pending_variance_count: number;
  posted_adj_count: number;
}

export interface P17OperationLedgerEntry {
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

export interface P17ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P17LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P17EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  custody_positions: ReadonlyArray<LockedCustodyPosition>;
  variance_adjs: ReadonlyArray<CountVarianceAdjRecord>;
  history: ReadonlyArray<P17HistoryEntry>;
  summary: P17SummaryMetrics;
  operation_ledger: ReadonlyArray<P17OperationLedgerEntry>;
  last_action: P17ActionResult | null;
}

export interface P17EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  custody_positions?: ReadonlyArray<LockedCustodyPosition> | undefined;
  variance_adjs?: ReadonlyArray<CountVarianceAdjRecord> | undefined;
  history?: ReadonlyArray<P17HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P17OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_adj_ref_seq?: number | undefined;
}

export interface P17CountVarianceAdjEngine {
  getSnapshot: () => P17EngineSnapshot;
  registerLockedBaselinePosition: (input: {
    variant_id: string;
    item_name: string;
    location_id: string;
    custodian_user_id: string;
    quantity_scale: number;
    recorded_usable_value: string;
    quarantined_value: string;
  }) => P17ActionResult<LockedCustodyPosition>;
  attemptDirectBalanceOverwrite: (input: {
    position_id: string;
    actor_user_id: string;
    attempted_usable_value: string;
  }) => P17ActionResult<never>;
  initiateCountVarianceAdj: (input: {
    position_id: string;
    preparer_user_id: string;
    variance_kind: CountVarianceKind;
    variance_quantity_value: string;
    reason: string;
    count_sheet_hash: string;
    initiated_at: string;
    idempotency_key?: string | undefined;
  }) => P17ActionResult<CountVarianceAdjRecord>;
  recordIndependentRecount: (input: {
    adj_id: string;
    recounter_user_id: string;
    verified_quantity_value: string;
    recount_notes: string;
    recounted_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P17ActionResult<CountVarianceAdjRecord>;
  approveCountVarianceSlot: (input: {
    adj_id: string;
    slot: 'chapter_head_slot' | 'finance_slot';
    approver_user_id: string;
    is_independent_fallback?: boolean | undefined;
    approved_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P17ActionResult<CountVarianceAdjRecord>;
  rejectCountVarianceAdj: (input: {
    adj_id: string;
    reviewer_user_id: string;
    rejection_reason: string;
    rejected_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P17ActionResult<CountVarianceAdjRecord>;
  postApprovedCountVarianceAdj: (input: {
    adj_id: string;
    actor_user_id: string;
    posted_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P17ActionResult<CountVarianceAdjRecord>;
  lookupCountVarianceOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P17ActionResult<P17LookupResult>;
}

function readStoredP17Options(): P17EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P17_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P17EngineOptions;
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

export function createP17CountVarianceAdjEngine(
  options?: P17EngineOptions
): P17CountVarianceAdjEngine {
  const seed = options ?? readStoredP17Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 17000;
  let adjRefSeq = seed.next_adj_ref_seq ?? 0;

  const custodyPositions: LockedCustodyPosition[] = (seed.custody_positions ?? []).map((p) =>
    structuredClone(p)
  );
  const varianceAdjs: CountVarianceAdjRecord[] = (seed.variance_adjs ?? []).map((v) =>
    structuredClone(v)
  );
  const history: P17HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P17OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P17ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P17${String(seq).padStart(19, '0')}`;
  }

  function nextAdjRef(): string {
    adjRefSeq += 1;
    return `${chapterPrefix}-ADJ-VAR-2026-${String(adjRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P17SummaryMetrics {
    let usableMicro = 0n;
    let quarantineMicro = 0n;
    for (const p of custodyPositions) {
      usableMicro += toMicroUnits(p.recorded_usable_on_hand.value);
      quarantineMicro += toMicroUnits(p.quarantined_stock.value);
    }
    const pendingCount = varianceAdjs.filter(
      (a) =>
        a.status === 'awaiting_recount' ||
        a.status === 'awaiting_dual_approval' ||
        a.status === 'approved_ready_to_post'
    ).length;
    const postedCount = varianceAdjs.filter((a) => a.status === 'posted').length;

    return {
      recorded_usable_on_hand: formatTrimmedMicro(usableMicro),
      quarantined_stock: formatTrimmedMicro(quarantineMicro),
      pending_variance_count: pendingCount,
      posted_adj_count: postedCount,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P17_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          custody_positions: custodyPositions,
          variance_adjs: varianceAdjs,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_adj_ref_seq: adjRefSeq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P17ActionResult<T> {
    const res: P17ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P17ActionResult<T> {
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
    const res: P17ActionResult<T> = {
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
  ): P17ActionResult<T> | null {
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
    const replayRes: P17ActionResult<T> = {
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
        custody_positions: custodyPositions.map((p) => structuredClone(p)),
        variance_adjs: varianceAdjs.map((v) => structuredClone(v)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerLockedBaselinePosition(input) {
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      const locId = input.location_id.trim();
      const custodianId = input.custodian_user_id.trim();

      if (!variantId || !itemName || !locId || !custodianId) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Variant ID, item name, location ID, and custodian ID are required.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Precision scale must be between 0 and 6.');
      }
      if (
        !isValidUnitQuantity({ value: input.recorded_usable_value.trim(), quantity_scale: input.quantity_scale }) ||
        !isValidUnitQuantity({ value: input.quarantined_value.trim(), quantity_scale: input.quantity_scale })
      ) {
        return fail(422, 'INVALID_QUANTITY', 'Quantities violate item precision scale.');
      }

      const usableMicro = toMicroUnits(input.recorded_usable_value.trim());
      const quarMicro = toMicroUnits(input.quarantined_value.trim());

      const pos: LockedCustodyPosition = {
        position_id: nextId(),
        chapter_id: chapterId,
        variant_id: variantId,
        item_name: itemName,
        location_id: locId,
        custodian_user_id: custodianId,
        quantity_scale: input.quantity_scale,
        recorded_usable_on_hand: fromMicroUnits(usableMicro, input.quantity_scale),
        quarantined_stock: fromMicroUnits(quarMicro, input.quantity_scale),
        baseline_locked: true,
        gain_lots: [],
        version: 1,
      };
      custodyPositions.push(pos);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'LOCKED_BASELINE_POSITION_REGISTERED',
        message: `Registered locked custody position #${pos.position_id} for "${itemName}" (${pos.recorded_usable_on_hand.value} usable, custodian ${custodianId}).`,
        data: structuredClone(pos),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P17ActionResult<LockedCustodyPosition>;
    },

    attemptDirectBalanceOverwrite(input) {
      return fail(
        403,
        'DIRECT_BALANCE_EDIT_FORBIDDEN',
        `Direct balance edit to "${input.attempted_usable_value}" on position #${input.position_id} by actor ${input.actor_user_id} is strictly prohibited; later discoveries require an independently recounted and dual-approved ADJ.`
      );
    },

    initiateCountVarianceAdj(input) {
      const replay = checkIdempotency<CountVarianceAdjRecord>('p17.initiate_adj', input.idempotency_key, input);
      if (replay) return replay;

      const preparerId = input.preparer_user_id.trim();
      const reason = input.reason.trim();
      const sheetHash = input.count_sheet_hash.trim().toLowerCase();
      const initiatedAt = input.initiated_at.trim();

      if (!preparerId || !reason || !UTC_INSTANT_PATTERN.test(initiatedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Preparer ID, variance reason, and UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(sheetHash)) {
        return fail(422, 'INVALID_EVIDENCE_HASH', 'Count sheet digest must be a valid 64-character lowercase SHA-256 hex digest.');
      }

      const pos = custodyPositions.find((p) => p.position_id === input.position_id);
      if (!pos) return fail(404, 'RESOURCE_NOT_FOUND', 'Target custody position not found.');

      if (!isValidUnitQuantity({ value: input.variance_quantity_value.trim(), quantity_scale: pos.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Variance quantity violates item precision scale.');
      }
      const varMicro = toMicroUnits(input.variance_quantity_value.trim());
      if (varMicro <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Variance quantity must be greater than zero.');
      }

      const adjRef = nextAdjRef();
      const adj: CountVarianceAdjRecord = {
        adj_id: nextId(),
        chapter_id: chapterId,
        adj_reference: adjRef,
        position_id: pos.position_id,
        variant_id: pos.variant_id,
        preparer_user_id: preparerId,
        custodian_user_id: pos.custodian_user_id,
        variance_kind: input.variance_kind,
        variance_quantity: fromMicroUnits(varMicro, pos.quantity_scale),
        reason,
        count_sheet_hash: sheetHash,
        initiated_at: initiatedAt,
        recount_completed: false,
        recounter_user_id: null,
        recount_verified_quantity: null,
        recount_notes: null,
        recounted_at: null,
        chapter_head_slot: null,
        finance_slot: null,
        rejection_reason: null,
        status: 'awaiting_recount',
        gain_lot_reference: null,
        posted_at: null,
        version: 1,
      };
      varianceAdjs.push(adj);

      history.push({
        event_id: nextUlid(),
        target_id: adj.adj_id,
        action: 'initiateCountVarianceAdj',
        actor_user_id: preparerId,
        reason: `${adjRef} (${input.variance_kind}, ${adj.variance_quantity.value})`,
        timestamp: initiatedAt,
      });

      return recordLedgerAndPersist(
        'p17.initiate_adj',
        preparerId,
        adj.adj_id,
        input.idempotency_key,
        input,
        201,
        'VARIANCE_ADJ_INITIATED',
        `Initiated ${adjRef} (${adj.variance_quantity.value} units). Recorded stock balance unchanged pending second-person recount and dual approval.`,
        adj
      );
    },

    recordIndependentRecount(input) {
      const replay = checkIdempotency<CountVarianceAdjRecord>('p17.recount', input.idempotency_key, input);
      if (replay) return replay;

      const recounterId = input.recounter_user_id.trim();
      const notes = input.recount_notes.trim();
      const recountedAt = input.recounted_at.trim();

      if (!recounterId || !notes || !UTC_INSTANT_PATTERN.test(recountedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Recounter ID, recount notes, and UTC timestamp are required.');
      }

      const adj = varianceAdjs.find((a) => a.adj_id === input.adj_id);
      if (!adj) return fail(404, 'RESOURCE_NOT_FOUND', 'Count variance ADJ not found.');
      if (adj.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Variance ADJ version changed before recount.');
      }
      if (recounterId === adj.preparer_user_id) {
        return fail(
          403,
          'RECOUNTER_INDEPENDENCE_REQUIRED',
          'Physical count variance requires a second-person recount by someone other than the ADJ preparer.'
        );
      }

      const pos = custodyPositions.find((p) => p.position_id === adj.position_id);
      const scale = pos ? pos.quantity_scale : adj.variance_quantity.quantity_scale;
      if (!isValidUnitQuantity({ value: input.verified_quantity_value.trim(), quantity_scale: scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Recounted quantity violates item precision scale.');
      }
      const verMicro = toMicroUnits(input.verified_quantity_value.trim());

      adj.recount_completed = true;
      adj.recounter_user_id = recounterId;
      adj.recount_verified_quantity = fromMicroUnits(verMicro, scale);
      adj.variance_quantity = fromMicroUnits(verMicro, scale);
      adj.recount_notes = notes;
      adj.recounted_at = recountedAt;
      adj.status = 'awaiting_dual_approval';
      adj.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: adj.adj_id,
        action: 'recordIndependentRecount',
        actor_user_id: recounterId,
        reason: notes,
        timestamp: recountedAt,
      });

      return recordLedgerAndPersist(
        'p17.recount',
        recounterId,
        adj.adj_id,
        input.idempotency_key,
        input,
        200,
        'INDEPENDENT_RECOUNT_RECORDED',
        `Completed independent recount (${adj.variance_quantity.value} units) for ${adj.adj_reference}. Ready for dual Chapter Head + Finance approval.`,
        adj
      );
    },

    approveCountVarianceSlot(input) {
      const replay = checkIdempotency<CountVarianceAdjRecord>('p17.approve_slot', input.idempotency_key, input);
      if (replay) return replay;

      const approverId = input.approver_user_id.trim();
      const approvedAt = input.approved_at.trim();
      if (!approverId || !UTC_INSTANT_PATTERN.test(approvedAt)) {
        return fail(422, 'INVALID_INPUT', 'Approver identity and UTC timestamp are required.');
      }

      const adj = varianceAdjs.find((a) => a.adj_id === input.adj_id);
      if (!adj) return fail(404, 'RESOURCE_NOT_FOUND', 'Count variance ADJ not found.');
      if (adj.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Variance ADJ version changed before approval.');
      }
      if (adj.status === 'rejected' || adj.status === 'posted') {
        return fail(409, 'INVALID_TRANSITION', `Cannot approve variance ADJ in "${adj.status}" state.`);
      }
      if (!adj.recount_completed) {
        return fail(
          409,
          'RECOUNT_REQUIRED_BEFORE_APPROVAL',
          'Independent second-person recount is required before Chapter Head or Finance approval.'
        );
      }

      // Neither preparer nor affected custodian can approve EITHER slot!
      if (approverId === adj.preparer_user_id || approverId === adj.custodian_user_id) {
        return fail(
          403,
          'PREPARER_OR_CUSTODIAN_BARRED',
          `Actor ${approverId} is the count preparer or affected custodian and cannot approve either Chapter Head or Finance variance slot.`
        );
      }

      // Same person cannot sign both Head and Finance slots (two displayed roles on one person is insufficient)
      const otherSlot =
        input.slot === 'chapter_head_slot' ? adj.finance_slot : adj.chapter_head_slot;
      if (otherSlot && otherSlot.approver_user_id === approverId) {
        return fail(
          403,
          'DUAL_DUTY_SAME_PERSON_INSUFFICIENT',
          `Actor ${approverId} already signed the other variance slot; dual variance approval requires at least two distinct eligible people.`
        );
      }

      const slotEntry: VarianceApprovalSlot = {
        approver_user_id: approverId,
        is_independent_fallback: input.is_independent_fallback === true,
        approved_at: approvedAt,
      };
      if (input.slot === 'chapter_head_slot') {
        adj.chapter_head_slot = slotEntry;
      } else {
        adj.finance_slot = slotEntry;
      }

      const bothApproved = adj.chapter_head_slot !== null && adj.finance_slot !== null;
      if (bothApproved) {
        adj.status = 'approved_ready_to_post';
      }
      adj.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: adj.adj_id,
        action: `approveCountVarianceSlot:${input.slot}`,
        actor_user_id: approverId,
        reason: slotEntry.is_independent_fallback ? 'Independent alternate' : null,
        timestamp: approvedAt,
      });

      return recordLedgerAndPersist(
        'p17.approve_slot',
        approverId,
        adj.adj_id,
        input.idempotency_key,
        input,
        200,
        'VARIANCE_SLOT_APPROVED',
        bothApproved
          ? `Recorded ${input.slot} by ${approverId}; both independent slots signed (${adj.adj_reference} ready to post once).`
          : `Recorded ${input.slot} by ${approverId}; second distinct eligible officer required for the remaining slot.`,
        adj
      );
    },

    rejectCountVarianceAdj(input) {
      const replay = checkIdempotency<CountVarianceAdjRecord>('p17.reject_adj', input.idempotency_key, input);
      if (replay) return replay;

      const reviewerId = input.reviewer_user_id.trim();
      const reason = input.rejection_reason.trim();
      const rejectedAt = input.rejected_at.trim();
      if (!reviewerId || !reason || !UTC_INSTANT_PATTERN.test(rejectedAt)) {
        return fail(422, 'REASON_REQUIRED', 'Reviewer identity, rejection reason, and UTC timestamp are required.');
      }

      const adj = varianceAdjs.find((a) => a.adj_id === input.adj_id);
      if (!adj) return fail(404, 'RESOURCE_NOT_FOUND', 'Count variance ADJ not found.');
      if (adj.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Variance ADJ version changed before rejection.');
      }
      if (adj.status === 'posted') {
        return fail(409, 'ADJ_ALREADY_POSTED', 'Posted adjustment cannot be rejected.');
      }

      adj.status = 'rejected';
      adj.rejection_reason = reason;
      adj.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: adj.adj_id,
        action: 'rejectCountVarianceAdj',
        actor_user_id: reviewerId,
        reason,
        timestamp: rejectedAt,
      });

      return recordLedgerAndPersist(
        'p17.reject_adj',
        reviewerId,
        adj.adj_id,
        input.idempotency_key,
        input,
        200,
        'VARIANCE_ADJ_REJECTED',
        `Rejected ${adj.adj_reference} (${reason}) with zero ledger effect.`,
        adj
      );
    },

    postApprovedCountVarianceAdj(input) {
      const replay = checkIdempotency<CountVarianceAdjRecord>('p17.post_adj', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const postedAt = input.posted_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(postedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC timestamp are required.');
      }

      const adj = varianceAdjs.find((a) => a.adj_id === input.adj_id);
      if (!adj) return fail(404, 'RESOURCE_NOT_FOUND', 'Count variance ADJ not found.');
      if (adj.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Variance ADJ version changed before posting.');
      }
      if (adj.status === 'posted') {
        return fail(409, 'ADJ_ALREADY_POSTED', `${adj.adj_reference} has already posted once and cannot be reposted on refresh.`);
      }
      if (
        adj.status !== 'approved_ready_to_post' ||
        !adj.chapter_head_slot ||
        !adj.finance_slot ||
        adj.chapter_head_slot.approver_user_id === adj.finance_slot.approver_user_id
      ) {
        return fail(
          409,
          'DUAL_APPROVAL_INCOMPLETE',
          'Both Chapter Head and Finance slots must be approved by two distinct eligible people before posting.'
        );
      }

      const pos = custodyPositions.find((p) => p.position_id === adj.position_id);
      if (!pos) return fail(404, 'RESOURCE_NOT_FOUND', 'Target custody position not found.');

      const deltaMicro = toMicroUnits(adj.variance_quantity.value);
      const curUsableMicro = toMicroUnits(pos.recorded_usable_on_hand.value);
      const curQuarMicro = toMicroUnits(pos.quarantined_stock.value);

      if (adj.variance_kind === 'negative_shortage') {
        if (deltaMicro > curUsableMicro) {
          return fail(409, 'NEGATIVE_STOCK_FORBIDDEN', 'Shortage variance exceeds current recorded usable on-hand.');
        }
        pos.recorded_usable_on_hand = fromMicroUnits(curUsableMicro - deltaMicro, pos.quantity_scale);
      } else if (adj.variance_kind === 'positive_gain_discovery') {
        pos.recorded_usable_on_hand = fromMicroUnits(curUsableMicro + deltaMicro, pos.quantity_scale);
        const gainLotRef = `GAIN-LOT-${adj.adj_reference}`;
        pos.gain_lots.push(gainLotRef);
        adj.gain_lot_reference = gainLotRef;
      } else {
        // damaged_quarantine
        if (deltaMicro > curUsableMicro) {
          return fail(409, 'NEGATIVE_STOCK_FORBIDDEN', 'Damaged quarantine transfer exceeds recorded usable on-hand.');
        }
        pos.recorded_usable_on_hand = fromMicroUnits(curUsableMicro - deltaMicro, pos.quantity_scale);
        pos.quarantined_stock = fromMicroUnits(curQuarMicro + deltaMicro, pos.quantity_scale);
      }

      pos.version += 1;
      adj.status = 'posted';
      adj.posted_at = postedAt;
      adj.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: adj.adj_id,
        action: `postApprovedCountVarianceAdj:${adj.variance_kind}`,
        actor_user_id: actorId,
        reason: `${adj.adj_reference} (${adj.variance_quantity.value})`,
        timestamp: postedAt,
      });

      return recordLedgerAndPersist(
        'p17.post_adj',
        actorId,
        adj.adj_id,
        input.idempotency_key,
        input,
        200,
        'VARIANCE_ADJ_POSTED',
        `Posted ${adj.adj_reference} once (${adj.variance_kind}: ${adj.variance_quantity.value})${adj.gain_lot_reference ? ` — provenance ${adj.gain_lot_reference}` : ''}.`,
        adj
      );
    },

    lookupCountVarianceOperation(input) {
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
