import { computeDeterministicHash } from './canonicalHash';

export const P28_CONTEXT_STORAGE_KEY = 'ysp_p28_context';

const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type DrillExecutorRole = 'technical_lead' | 'named_backup';
export type UncertainCategory =
  | 'physical_custody'
  | 'issued_document'
  | 'payment_verification'
  | 'manual_outage_sale';
export type ReconcilerRole =
  | 'FINANCE'
  | 'INVENTORY'
  | 'BOOTH_RECONCILER'
  | 'CHAPTER_HEAD'
  | 'TECHNICAL_EXECUTOR';
export type ReopenStatus =
  | 'not_opened'
  | 'blocked_pending_reconciliation'
  | 'reopened_authorized';

export interface OffHostBackupArtifact {
  backup_id: string;
  backup_ref: string;
  primary_region: string;
  destination_region: string;
  binlog_lag_seconds: string;
  binlog_target_5min_exceeded: boolean;
  includes_mysql_dump: boolean;
  includes_binlogs: boolean;
  includes_evidence_objects: boolean;
  includes_keys_and_config: boolean;
  includes_audit_idempotency_sequences: boolean;
  encrypted: boolean;
  destination_acknowledged: boolean;
  operator_user_id: string;
  recorded_at: string;
}

export interface TimedRecoveryDrillRecord {
  drill_id: string;
  drill_ref: string;
  backup_ref: string;
  executor_user_id: string;
  executor_role: DrillExecutorRole;
  old_writers_fenced: boolean;
  evidence_and_history_usable: boolean;
  failure_started_at: string;
  last_recovered_commit_at: string;
  service_restored_at: string;
  rto_minutes: number;
  rpo_loss_minutes: number;
  passed_targets: boolean;
}

export interface UncertainIntervalItem {
  item_id: string;
  category: UncertainCategory;
  source_reference: string;
  description: string;
  interval_start_at: string;
  interval_end_at: string;
  recorded_by_user_id: string;
  recorded_at: string;
  resolution_status: 'unresolved_uncertain' | 'reconciled_verified';
  silently_marked_verified: boolean;
  reconciled_by_user_id: string | null;
  reconciler_role: ReconcilerRole | null;
  evidence_ref: string | null;
  reconciliation_note: string | null;
  reconciled_at: string | null;
}

export interface ReplayedFollowUpRecord {
  replay_id: string;
  original_operation_key: string;
  target_record_ref: string;
  follow_up_action: string;
  outcome: 'executed_once_post_restore' | 'deduplicated_no_double_effect';
  duplicate_effect_created: boolean;
  execution_count: number;
  executor_user_id: string;
  replayed_at: string;
}

export interface P28HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P28SummaryMetrics {
  off_host_backups_count: number;
  passed_drills_count: number;
  unresolved_uncertain_count: number;
  reconciled_items_count: number;
  replayed_operations_count: number;
  reopen_status: ReopenStatus;
}

export interface P28OperationLedgerEntry {
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

export interface P28ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P28LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P28EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  backup_artifacts: ReadonlyArray<OffHostBackupArtifact>;
  recovery_drills: ReadonlyArray<TimedRecoveryDrillRecord>;
  uncertain_interval_items: ReadonlyArray<UncertainIntervalItem>;
  replayed_operations: ReadonlyArray<ReplayedFollowUpRecord>;
  reopen_status: ReopenStatus;
  history: ReadonlyArray<P28HistoryEntry>;
  summary: P28SummaryMetrics;
  operation_ledger: ReadonlyArray<P28OperationLedgerEntry>;
  last_action: P28ActionResult | null;
}

export interface P28EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  backup_artifacts?: ReadonlyArray<OffHostBackupArtifact> | undefined;
  recovery_drills?: ReadonlyArray<TimedRecoveryDrillRecord> | undefined;
  uncertain_interval_items?: ReadonlyArray<UncertainIntervalItem> | undefined;
  replayed_operations?: ReadonlyArray<ReplayedFollowUpRecord> | undefined;
  reopen_status?: ReopenStatus | undefined;
  history?: ReadonlyArray<P28HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P28OperationLedgerEntry> | undefined;
}

export interface P28RecoveryHandoffEngine {
  getSnapshot: () => P28EngineSnapshot;
  registerOffHostBackupSet: (input: {
    backup_ref: string;
    primary_region: string;
    destination_region: string;
    binlog_lag_seconds: string;
    includes_mysql_dump: boolean;
    includes_binlogs: boolean;
    includes_evidence_objects: boolean;
    includes_keys_and_config: boolean;
    includes_audit_idempotency_sequences: boolean;
    encrypted: boolean;
    destination_acknowledged: boolean;
    operator_user_id: string;
    recorded_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<OffHostBackupArtifact>;
  executeTimedRegionalRestoreDrill: (input: {
    drill_ref: string;
    backup_ref: string;
    executor_user_id: string;
    executor_role: DrillExecutorRole;
    old_writers_fenced: boolean;
    evidence_and_history_usable: boolean;
    failure_started_at: string;
    last_recovered_commit_at: string;
    service_restored_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<TimedRecoveryDrillRecord>;
  recordUncertainIntervalItem: (input: {
    category: UncertainCategory;
    source_reference: string;
    description: string;
    interval_start_at: string;
    interval_end_at: string;
    recorded_by_user_id: string;
    recorded_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<UncertainIntervalItem>;
  reconcileUncertainIntervalItem: (input: {
    item_id: string;
    reconciler_user_id: string;
    reconciler_role: ReconcilerRole;
    evidence_ref: string;
    reconciliation_note: string;
    reconciled_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<UncertainIntervalItem>;
  replayDurableFollowUp: (input: {
    original_operation_key: string;
    target_record_ref: string;
    follow_up_action: string;
    already_committed_before_failure: boolean;
    executor_user_id: string;
    replayed_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<ReplayedFollowUpRecord>;
  authorizePostRecoveryReopen: (input: {
    peer_technical_reviewer_id: string;
    finance_reconciler_id: string;
    authorizing_head_id: string;
    authorized_at: string;
    idempotency_key?: string | undefined;
  }) => P28ActionResult<P28SummaryMetrics>;
  lookupRecoveryOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P28ActionResult<P28LookupResult>;
}

function readStoredP28Options(): P28EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P28_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P28EngineOptions;
  } catch {
    return undefined;
  }
}

/**
 * Creates a chapter-scoped off-host recovery, timed regional failure drill, uncertain-interval
 * business reconciliation, duplicate-safe durable replay, and post-recovery reopening engine.
 */
export function createP28RecoveryHandoffEngine(
  options?: P28EngineOptions
): P28RecoveryHandoffEngine {
  const seed = options ?? readStoredP28Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 28000;

  const backupArtifacts: OffHostBackupArtifact[] = (seed.backup_artifacts ?? []).map((b) =>
    structuredClone(b)
  );
  const recoveryDrills: TimedRecoveryDrillRecord[] = (seed.recovery_drills ?? []).map((d) =>
    structuredClone(d)
  );
  const uncertainItems: UncertainIntervalItem[] = (seed.uncertain_interval_items ?? []).map((u) =>
    structuredClone(u)
  );
  const replayedOps: ReplayedFollowUpRecord[] = (seed.replayed_operations ?? []).map((r) =>
    structuredClone(r)
  );
  let reopenStatus: ReopenStatus = seed.reopen_status ?? 'not_opened';

  const history: P28HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P28OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P28ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P28${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P28SummaryMetrics {
    const unresolvedCount = uncertainItems.filter(
      (u) => u.resolution_status === 'unresolved_uncertain'
    ).length;
    const reconciledCount = uncertainItems.filter(
      (u) => u.resolution_status === 'reconciled_verified'
    ).length;

    return {
      off_host_backups_count: backupArtifacts.length,
      passed_drills_count: recoveryDrills.filter((d) => d.passed_targets).length,
      unresolved_uncertain_count: unresolvedCount,
      reconciled_items_count: reconciledCount,
      replayed_operations_count: replayedOps.length,
      reopen_status: reopenStatus,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P28_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          backup_artifacts: backupArtifacts,
          recovery_drills: recoveryDrills,
          uncertain_interval_items: uncertainItems,
          replayed_operations: replayedOps,
          reopen_status: reopenStatus,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P28ActionResult<T> {
    const res: P28ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P28ActionResult<T> | null {
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
        `Idempotency key "${trimmed}" cannot be reused with a modified payload.`
      );
    }
    const replayRes: P28ActionResult<T> = {
      ok: existing.http_status >= 200 && existing.http_status < 400,
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
  ): P28ActionResult<T> {
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
    const res: P28ActionResult<T> = {
      ok: httpStatus >= 200 && httpStatus < 400,
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
        backup_artifacts: backupArtifacts.map((b) => structuredClone(b)),
        recovery_drills: recoveryDrills.map((d) => structuredClone(d)),
        uncertain_interval_items: uncertainItems.map((u) => structuredClone(u)),
        replayed_operations: replayedOps.map((r) => structuredClone(r)),
        reopen_status: reopenStatus,
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerOffHostBackupSet(input) {
      const replay = checkIdempotency<OffHostBackupArtifact>(
        'p28.register_backup',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const ref = input.backup_ref.trim();
      const prim = input.primary_region.trim();
      const dest = input.destination_region.trim();
      const lagStr = input.binlog_lag_seconds.trim();
      const actor = input.operator_user_id.trim();
      const at = input.recorded_at.trim();

      if (!ref || !prim || !dest || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Backup reference, primary region, independent destination region, operator ID, and UTC timestamp are required.'
        );
      }
      if (!INTEGER_PATTERN.test(lagStr)) {
        return fail(422, 'INVALID_LAG', 'Binlog copy lag seconds must be a whole number.');
      }
      if (prim.toLowerCase() === dest.toLowerCase()) {
        return fail(
          422,
          'SAME_REGION_BACKUP_INSUFFICIENT',
          'Same-region copies alone are insufficient for regional failure recovery; use an independent off-host location.'
        );
      }
      if (
        !input.includes_mysql_dump ||
        !input.includes_binlogs ||
        !input.includes_evidence_objects ||
        !input.includes_keys_and_config ||
        !input.includes_audit_idempotency_sequences ||
        !input.encrypted ||
        !input.destination_acknowledged
      ) {
        return fail(
          422,
          'INCOMPLETE_BACKUP_INVENTORY',
          'Full DB dump, binlogs, stored evidence objects, encryption keys, audit/idempotency/sequence state, encryption, and destination acknowledgment are all required.'
        );
      }
      if (backupArtifacts.some((b) => b.backup_ref === ref)) {
        return fail(409, 'DUPLICATE_BACKUP_REF', `Backup set "${ref}" is already recorded.`);
      }

      const lagExceeded = BigInt(lagStr) > 300n;
      const artifact: OffHostBackupArtifact = {
        backup_id: nextId(),
        backup_ref: ref,
        primary_region: prim,
        destination_region: dest,
        binlog_lag_seconds: lagStr,
        binlog_target_5min_exceeded: lagExceeded,
        includes_mysql_dump: true,
        includes_binlogs: true,
        includes_evidence_objects: true,
        includes_keys_and_config: true,
        includes_audit_idempotency_sequences: true,
        encrypted: true,
        destination_acknowledged: true,
        operator_user_id: actor,
        recorded_at: at,
      };
      backupArtifacts.push(artifact);

      history.push({
        event_id: nextId(),
        target_id: artifact.backup_id,
        action: 'off_host_backup_verified',
        actor_user_id: actor,
        reason: `${ref} (${prim} -> ${dest}, lag ${lagStr}s, 5m target exceeded: ${String(lagExceeded)})`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p28.register_backup',
        actor,
        artifact.backup_id,
        input.idempotency_key,
        input,
        201,
        'OFF_HOST_BACKUP_VERIFIED',
        `Verified encrypted off-host backup "${ref}" in ${dest} (binlog lag ${lagStr}s).`,
        structuredClone(artifact)
      );
    },

    executeTimedRegionalRestoreDrill(input) {
      const replay = checkIdempotency<TimedRecoveryDrillRecord>(
        'p28.execute_drill',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const drillRef = input.drill_ref.trim();
      const backupRef = input.backup_ref.trim();
      const actor = input.executor_user_id.trim();
      const failAt = input.failure_started_at.trim();
      const commitAt = input.last_recovered_commit_at.trim();
      const restoredAt = input.service_restored_at.trim();

      if (
        !drillRef ||
        !backupRef ||
        !actor ||
        !UTC_INSTANT_PATTERN.test(failAt) ||
        !UTC_INSTANT_PATTERN.test(commitAt) ||
        !UTC_INSTANT_PATTERN.test(restoredAt)
      ) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Drill reference, backup reference, executor ID, and valid UTC failure/commit/restore times are required.'
        );
      }
      if (!backupArtifacts.some((b) => b.backup_ref === backupRef)) {
        return fail(
          404,
          'BACKUP_REF_NOT_FOUND',
          `Verified off-host backup set "${backupRef}" not found.`
        );
      }
      if (!input.old_writers_fenced) {
        return fail(
          422,
          'OLD_WRITER_FENCING_REQUIRED',
          'Old database writers and schedulers must be fenced before executing a clean restore drill.'
        );
      }
      if (!input.evidence_and_history_usable) {
        return fail(
          422,
          'USABLE_EVIDENCE_AND_HISTORY_REQUIRED',
          'Recovery must restore usable supporting evidence, signatures, and audit history — displayed balances alone are insufficient.'
        );
      }
      if (recoveryDrills.some((d) => d.drill_ref === drillRef)) {
        return fail(409, 'DUPLICATE_DRILL_REF', `Drill reference "${drillRef}" was already recorded.`);
      }

      const failMs = Date.parse(failAt);
      const commitMs = Date.parse(commitAt);
      const restoredMs = Date.parse(restoredAt);
      if (restoredMs < failMs || failMs < commitMs) {
        return fail(
          422,
          'INVALID_TIMESTAMP_ORDER',
          'Timestamps must satisfy last_recovered_commit <= failure_started <= service_restored.'
        );
      }

      const rtoMinutes = Math.round((restoredMs - failMs) / 60_000);
      const rpoLossMinutes = Math.round((failMs - commitMs) / 60_000);

      if (rtoMinutes > 240) {
        return fail(
          422,
          'RTO_EXCEEDED_4_HOURS',
          `Measured restoration time (${rtoMinutes} min) exceeded the mandatory 240-minute (4-hour) recovery target.`
        );
      }
      if (rpoLossMinutes > 60) {
        return fail(
          422,
          'RPO_LOSS_EXCEEDED_1_HOUR',
          `Measured committed-record loss window (${rpoLossMinutes} min) exceeded the mandatory 60-minute (1-hour) RPO target.`
        );
      }

      const drill: TimedRecoveryDrillRecord = {
        drill_id: nextId(),
        drill_ref: drillRef,
        backup_ref: backupRef,
        executor_user_id: actor,
        executor_role: input.executor_role,
        old_writers_fenced: true,
        evidence_and_history_usable: true,
        failure_started_at: failAt,
        last_recovered_commit_at: commitAt,
        service_restored_at: restoredAt,
        rto_minutes: rtoMinutes,
        rpo_loss_minutes: rpoLossMinutes,
        passed_targets: true,
      };
      recoveryDrills.push(drill);
      if (reopenStatus === 'not_opened') {
        reopenStatus = 'blocked_pending_reconciliation';
      }

      history.push({
        event_id: nextId(),
        target_id: drill.drill_id,
        action: 'timed_regional_restore_drill_passed',
        actor_user_id: actor,
        reason: `${drillRef} (${input.executor_role}) RTO ${rtoMinutes}m <= 240m, RPO loss ${rpoLossMinutes}m <= 60m`,
        timestamp: restoredAt,
      });

      return recordLedgerAndPersist(
        'p28.execute_drill',
        actor,
        drill.drill_id,
        input.idempotency_key,
        input,
        201,
        'REGIONAL_RESTORE_DRILL_PASSED',
        `Timed recovery drill "${drillRef}" (${input.executor_role}) passed: RTO ${rtoMinutes} min, RPO loss ${rpoLossMinutes} min; awaiting reconciliation before reopening.`,
        structuredClone(drill)
      );
    },

    recordUncertainIntervalItem(input) {
      const replay = checkIdempotency<UncertainIntervalItem>(
        'p28.record_uncertain',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const srcRef = input.source_reference.trim();
      const desc = input.description.trim();
      const startAt = input.interval_start_at.trim();
      const endAt = input.interval_end_at.trim();
      const actor = input.recorded_by_user_id.trim();
      const at = input.recorded_at.trim();

      if (
        !srcRef ||
        !desc ||
        !actor ||
        !UTC_INSTANT_PATTERN.test(startAt) ||
        !UTC_INSTANT_PATTERN.test(endAt) ||
        !UTC_INSTANT_PATTERN.test(at)
      ) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Source reference, description, actor ID, and UTC interval timestamps are required.'
        );
      }
      if (uncertainItems.some((u) => u.source_reference === srcRef)) {
        return fail(
          409,
          'DUPLICATE_UNCERTAIN_SOURCE',
          `Uncertain interval reference "${srcRef}" is already queued for reconciliation.`
        );
      }

      const item: UncertainIntervalItem = {
        item_id: nextId(),
        category: input.category,
        source_reference: srcRef,
        description: desc,
        interval_start_at: startAt,
        interval_end_at: endAt,
        recorded_by_user_id: actor,
        recorded_at: at,
        resolution_status: 'unresolved_uncertain',
        silently_marked_verified: false,
        reconciled_by_user_id: null,
        reconciler_role: null,
        evidence_ref: null,
        reconciliation_note: null,
        reconciled_at: null,
      };
      uncertainItems.push(item);
      reopenStatus = 'blocked_pending_reconciliation';

      history.push({
        event_id: nextId(),
        target_id: item.item_id,
        action: 'uncertain_interval_item_logged',
        actor_user_id: actor,
        reason: `${input.category} (${srcRef}) retained as unresolved_uncertain`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p28.record_uncertain',
        actor,
        item.item_id,
        input.idempotency_key,
        input,
        201,
        'UNCERTAIN_INTERVAL_ITEM_LOGGED',
        `Recorded "${srcRef}" (${input.category}) as unresolved_uncertain pending authorized reconciliation.`,
        structuredClone(item)
      );
    },

    reconcileUncertainIntervalItem(input) {
      const replay = checkIdempotency<UncertainIntervalItem>(
        'p28.reconcile_uncertain',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.reconciler_user_id.trim();
      const evRef = input.evidence_ref.trim();
      const note = input.reconciliation_note.trim();
      const at = input.reconciled_at.trim();

      const item = uncertainItems.find((u) => u.item_id === input.item_id.trim());
      if (!item) {
        return fail(404, 'UNCERTAIN_ITEM_NOT_FOUND', 'Uncertain interval record not found.');
      }
      if (item.resolution_status === 'reconciled_verified') {
        return fail(409, 'ALREADY_RECONCILED', `Item "${item.source_reference}" is already reconciled.`);
      }
      if (!actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Reconciler user ID and valid UTC timestamp are required.'
        );
      }

      const wasRestoreExecutor = recoveryDrills.some((d) => d.executor_user_id === actor);
      if (input.reconciler_role === 'TECHNICAL_EXECUTOR' || wasRestoreExecutor) {
        return fail(
          403,
          'TECHNICAL_EXECUTOR_ALONE_CANNOT_CLEAR_BUSINESS_DISCREPANCY',
          'Technical restore completion or executor review cannot clear physical custody, payment, or manual receipt discrepancies.'
        );
      }
      if (!evRef || !note) {
        return fail(
          422,
          'MISSING_RECONCILIATION_EVIDENCE',
          'Verified evidence reference and reconciliation note are required before clearing an uncertain interval.'
        );
      }

      item.resolution_status = 'reconciled_verified';
      item.reconciled_by_user_id = actor;
      item.reconciler_role = input.reconciler_role;
      item.evidence_ref = evRef;
      item.reconciliation_note = note;
      item.reconciled_at = at;

      history.push({
        event_id: nextId(),
        target_id: item.item_id,
        action: 'uncertain_interval_reconciled',
        actor_user_id: actor,
        reason: `Verified "${item.source_reference}" via ${evRef} (${input.reconciler_role})`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p28.reconcile_uncertain',
        actor,
        item.item_id,
        input.idempotency_key,
        input,
        200,
        'UNCERTAIN_ITEM_RECONCILED_WITH_EVIDENCE',
        `Reconciled "${item.source_reference}" with supporting evidence "${evRef}".`,
        structuredClone(item)
      );
    },

    replayDurableFollowUp(input) {
      const replay = checkIdempotency<ReplayedFollowUpRecord>(
        'p28.replay_followup',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const opKey = input.original_operation_key.trim();
      const targetRef = input.target_record_ref.trim();
      const actionLabel = input.follow_up_action.trim();
      const actor = input.executor_user_id.trim();
      const at = input.replayed_at.trim();

      if (!opKey || !targetRef || !actionLabel || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Original operation key, target record reference, follow-up action, executor ID, and UTC time are required.'
        );
      }

      const existing = replayedOps.find((r) => r.original_operation_key === opKey);
      if (existing || input.already_committed_before_failure) {
        const dedupRecord: ReplayedFollowUpRecord = existing
          ? {
              ...structuredClone(existing),
              outcome: 'deduplicated_no_double_effect',
              duplicate_effect_created: false,
            }
          : {
              replay_id: nextId(),
              original_operation_key: opKey,
              target_record_ref: targetRef,
              follow_up_action: actionLabel,
              outcome: 'deduplicated_no_double_effect',
              duplicate_effect_created: false,
              execution_count: 1,
              executor_user_id: actor,
              replayed_at: at,
            };
        if (!existing) {
          replayedOps.push(dedupRecord);
        }

        history.push({
          event_id: nextId(),
          target_id: dedupRecord.replay_id,
          action: 'durable_replay_deduplicated',
          actor_user_id: actor,
          reason: `Skipped duplicate side effect for pre-committed key ${opKey} (${targetRef})`,
          timestamp: at,
        });

        return recordLedgerAndPersist(
          'p28.replay_followup',
          actor,
          dedupRecord.replay_id,
          input.idempotency_key,
          input,
          200,
          'REPLAY_DEDUPLICATED_ZERO_DOUBLE_EFFECT',
          `Durable replay verified existing commitment for "${opKey}" without duplicating stock, money, or forms.`,
          structuredClone(dedupRecord)
        );
      }

      const executedRecord: ReplayedFollowUpRecord = {
        replay_id: nextId(),
        original_operation_key: opKey,
        target_record_ref: targetRef,
        follow_up_action: actionLabel,
        outcome: 'executed_once_post_restore',
        duplicate_effect_created: false,
        execution_count: 1,
        executor_user_id: actor,
        replayed_at: at,
      };
      replayedOps.push(executedRecord);

      history.push({
        event_id: nextId(),
        target_id: executedRecord.replay_id,
        action: 'durable_replay_executed_once',
        actor_user_id: actor,
        reason: `Executed pending post-restore follow-up ${opKey} (${actionLabel}) once`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p28.replay_followup',
        actor,
        executedRecord.replay_id,
        input.idempotency_key,
        input,
        201,
        'REPLAY_FOLLOWUP_EXECUTED_ONCE',
        `Executed durable follow-up "${opKey}" once cleanly after service restore.`,
        structuredClone(executedRecord)
      );
    },

    authorizePostRecoveryReopen(input) {
      const replay = checkIdempotency<P28SummaryMetrics>(
        'p28.authorize_reopen',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const peerTech = input.peer_technical_reviewer_id.trim();
      const financeRec = input.finance_reconciler_id.trim();
      const headId = input.authorizing_head_id.trim();
      const at = input.authorized_at.trim();

      if (!peerTech || !financeRec || !headId || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Non-author technical peer reviewer ID, Finance reconciler ID, Chapter Head ID, and UTC timestamp are required.'
        );
      }

      const passedLeadDrills = recoveryDrills.filter(
        (d) => d.passed_targets && d.executor_role === 'technical_lead'
      );
      const passedBackupDrills = recoveryDrills.filter(
        (d) => d.passed_targets && d.executor_role === 'named_backup'
      );

      const hasDistinctLeadAndBackup = passedLeadDrills.some((ld) =>
        passedBackupDrills.some((bd) => bd.executor_user_id !== ld.executor_user_id)
      );
      if (!hasDistinctLeadAndBackup) {
        return fail(
          422,
          'INDEPENDENT_LEAD_AND_BACKUP_DRILLS_REQUIRED',
          'Both the technical lead and a distinct named backup operator must each complete a passing timed recovery rehearsal before authorization.'
        );
      }

      const drillExecutors = new Set(recoveryDrills.map((d) => d.executor_user_id));
      if (
        drillExecutors.has(peerTech) ||
        drillExecutors.has(financeRec) ||
        peerTech === financeRec
      ) {
        return fail(
          422,
          'NONAUTHOR_PEER_AND_FINANCE_REVIEW_REQUIRED',
          'Technical evidence verification requires a non-author peer reviewer and an independent Finance money reconciliation reviewer.'
        );
      }

      const unresolved = uncertainItems.filter(
        (u) => u.resolution_status === 'unresolved_uncertain'
      );
      if (unresolved.length > 0) {
        return fail(
          409,
          'UNRESOLVED_UNCERTAIN_INTERVAL_BLOCKS_REOPEN',
          `${unresolved.length} uncertain interval discrepancy item(s) remain unresolved and block operational reopening.`
        );
      }

      reopenStatus = 'reopened_authorized';
      const summary = computeSummary();

      history.push({
        event_id: nextId(),
        target_id: chapterId,
        action: 'post_recovery_reopening_authorized',
        actor_user_id: headId,
        reason: `Authorized after lead+backup drills, peer review (${peerTech}), and Finance reconciliation (${financeRec})`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p28.authorize_reopen',
        headId,
        chapterId,
        input.idempotency_key,
        input,
        200,
        'SERVICE_REOPENING_AUTHORIZED',
        'Independent lead & backup restore drills passed and all uncertain intervals reconciled — chapter reopening authorized.',
        summary
      );
    },

    lookupRecoveryOperation(input) {
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
