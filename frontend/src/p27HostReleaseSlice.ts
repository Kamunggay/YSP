import { computeDeterministicHash } from './canonicalHash';

export const P27_CONTEXT_STORAGE_KEY = 'ysp_p27_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type HostServiceMode = 'operational' | 'maintenance_fenced' | 'failed_release_locked';

export interface ReleaseManifestCandidate {
  release_id: string;
  release_tag: string;
  frontend_build_hash: string;
  backend_image_digest: string;
  schema_version: string;
  mysql_private_network_only: boolean;
  secrets_outside_git_and_bundle: boolean;
  single_worker_bounded: boolean;
  actor_user_id: string;
  registered_at: string;
}

export interface MaintenanceWindowRecord {
  window_id: string;
  maintenance_ref: string;
  lead_user_id: string;
  outside_booth_trading: boolean;
  backup_validated: boolean;
  active_tx_drained: boolean;
  affected_operations: string;
  started_at: string;
  next_update_at: string;
}

export interface SchedulerLeaseRecord {
  lease_id: string;
  scheduler_instance_id: string;
  acquired_at: string;
  expires_at: string;
}

export interface HostTelemetrySample {
  sample_id: string;
  concurrent_officers: string;
  pdf_jobs_active: string;
  memory_pct: string;
  cpu_pct: string;
  p95_latency_ms: string;
  backup_lag_seconds: string;
  credit_remaining_usd: string;
  reserve_floor_usd: string;
  review_triggers: ReadonlyArray<string>;
  automatic_spending_authorized: boolean;
  sampled_at: string;
}

export interface P27HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P27SummaryMetrics {
  service_mode: HostServiceMode;
  write_postings_blocked: boolean;
  old_image_rollback_forbidden: boolean;
  current_release_tag: string;
  current_schema_version: string;
  manifests_count: number;
  active_scheduler_id: string | null;
  last_review_triggers_count: number;
}

export interface P27OperationLedgerEntry {
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

export interface P27ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P27LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P27EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  release_candidates: ReadonlyArray<ReleaseManifestCandidate>;
  maintenance_windows: ReadonlyArray<MaintenanceWindowRecord>;
  active_scheduler_lease: SchedulerLeaseRecord | null;
  telemetry_samples: ReadonlyArray<HostTelemetrySample>;
  service_mode: HostServiceMode;
  write_postings_blocked: boolean;
  old_image_rollback_forbidden: boolean;
  current_release_tag: string;
  current_schema_version: string;
  history: ReadonlyArray<P27HistoryEntry>;
  summary: P27SummaryMetrics;
  operation_ledger: ReadonlyArray<P27OperationLedgerEntry>;
  last_action: P27ActionResult | null;
}

export interface P27EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  release_candidates?: ReadonlyArray<ReleaseManifestCandidate> | undefined;
  maintenance_windows?: ReadonlyArray<MaintenanceWindowRecord> | undefined;
  active_scheduler_lease?: SchedulerLeaseRecord | null | undefined;
  telemetry_samples?: ReadonlyArray<HostTelemetrySample> | undefined;
  service_mode?: HostServiceMode | undefined;
  write_postings_blocked?: boolean | undefined;
  old_image_rollback_forbidden?: boolean | undefined;
  current_release_tag?: string | undefined;
  current_schema_version?: string | undefined;
  history?: ReadonlyArray<P27HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P27OperationLedgerEntry> | undefined;
}

export interface P27HostReleaseEngine {
  getSnapshot: () => P27EngineSnapshot;
  registerReleaseManifest: (input: {
    release_tag: string;
    frontend_build_hash: string;
    backend_image_digest: string;
    schema_version: string;
    mysql_private_network_only: boolean;
    secrets_outside_git_and_bundle: boolean;
    single_worker_bounded: boolean;
    actor_user_id: string;
    registered_at: string;
    idempotency_key?: string | undefined;
  }) => P27ActionResult<ReleaseManifestCandidate>;
  startMaintenanceAndFenceWrites: (input: {
    maintenance_ref: string;
    lead_user_id: string;
    outside_booth_trading: boolean;
    backup_validated: boolean;
    active_tx_drained: boolean;
    affected_operations: string;
    started_at: string;
    next_update_at: string;
    idempotency_key?: string | undefined;
  }) => P27ActionResult<MaintenanceWindowRecord>;
  executeReleaseDeployment: (input: {
    release_tag: string;
    actor_user_id: string;
    simulate_migration_or_health_failure: boolean;
    incompatible_schema_applied: boolean;
    migration_applied_once: boolean;
    health_ok: boolean;
    queues_ok: boolean;
    balances_checked: boolean;
    executed_at: string;
    idempotency_key?: string | undefined;
  }) => P27ActionResult<P27SummaryMetrics>;
  attemptUnsafeRollbackOrWriteDuringLock: (input: {
    action: 'business_write' | 'rollback_old_image';
    actor_user_id: string;
    attempted_at: string;
  }) => P27ActionResult<P27SummaryMetrics>;
  acquireSingletonSchedulerLease: (input: {
    scheduler_instance_id: string;
    ttl_seconds: string;
    acquired_at: string;
    idempotency_key?: string | undefined;
  }) => P27ActionResult<SchedulerLeaseRecord>;
  recordLoadAndFundingTelemetry: (input: {
    actor_user_id: string;
    concurrent_officers: string;
    pdf_jobs_active: string;
    memory_pct: string;
    cpu_pct: string;
    p95_latency_ms: string;
    backup_lag_seconds: string;
    credit_remaining_usd: string;
    reserve_floor_usd: string;
    sampled_at: string;
    idempotency_key?: string | undefined;
  }) => P27ActionResult<HostTelemetrySample>;
  lookupHostReleaseOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P27ActionResult<P27LookupResult>;
}

function readStoredP27Options(): P27EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P27_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P27EngineOptions;
  } catch {
    return undefined;
  }
}

function toCents(amount: string): bigint {
  const [whole = '0', frac = '00'] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

function addSecondsUtc(isoUtc: string, seconds: number): string {
  const baseMs = Date.parse(isoUtc);
  return new Date(baseMs + seconds * 1000).toISOString().replace(/\.000Z$/, 'Z');
}

/**
 * Creates a reproducible host/release, maintenance fencing, singleton scheduler, and growth telemetry engine.
 * Enforces private database networking, secret isolation, bounded workers, maintenance write fencing outside
 * booth hours, blocked failed-release rollback on incompatible schema migrations, and non-automatic cloud spending.
 */
export function createP27HostReleaseEngine(options?: P27EngineOptions): P27HostReleaseEngine {
  const seed = options ?? readStoredP27Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 27000;

  const releaseCandidates: ReleaseManifestCandidate[] = (seed.release_candidates ?? []).map((r) =>
    structuredClone(r)
  );
  const maintenanceWindows: MaintenanceWindowRecord[] = (seed.maintenance_windows ?? []).map((m) =>
    structuredClone(m)
  );
  let activeSchedulerLease: SchedulerLeaseRecord | null = seed.active_scheduler_lease
    ? structuredClone(seed.active_scheduler_lease)
    : null;
  const telemetrySamples: HostTelemetrySample[] = (seed.telemetry_samples ?? []).map((t) =>
    structuredClone(t)
  );
  let serviceMode: HostServiceMode = seed.service_mode ?? 'operational';
  let writePostingsBlocked = seed.write_postings_blocked ?? false;
  let oldImageRollbackForbidden = seed.old_image_rollback_forbidden ?? false;
  let currentReleaseTag = seed.current_release_tag ?? '';
  let currentSchemaVersion = seed.current_schema_version ?? '';

  const history: P27HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P27OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P27ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P27${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P27SummaryMetrics {
    const latestSample = telemetrySamples[telemetrySamples.length - 1];
    return {
      service_mode: serviceMode,
      write_postings_blocked: writePostingsBlocked,
      old_image_rollback_forbidden: oldImageRollbackForbidden,
      current_release_tag: currentReleaseTag,
      current_schema_version: currentSchemaVersion,
      manifests_count: releaseCandidates.length,
      active_scheduler_id: activeSchedulerLease ? activeSchedulerLease.scheduler_instance_id : null,
      last_review_triggers_count: latestSample ? latestSample.review_triggers.length : 0,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P27_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          release_candidates: releaseCandidates,
          maintenance_windows: maintenanceWindows,
          active_scheduler_lease: activeSchedulerLease,
          telemetry_samples: telemetrySamples,
          service_mode: serviceMode,
          write_postings_blocked: writePostingsBlocked,
          old_image_rollback_forbidden: oldImageRollbackForbidden,
          current_release_tag: currentReleaseTag,
          current_schema_version: currentSchemaVersion,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P27ActionResult<T> {
    const res: P27ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P27ActionResult<T> | null {
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
    const replayRes: P27ActionResult<T> = {
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
  ): P27ActionResult<T> {
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
    const res: P27ActionResult<T> = {
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
        release_candidates: releaseCandidates.map((r) => structuredClone(r)),
        maintenance_windows: maintenanceWindows.map((m) => structuredClone(m)),
        active_scheduler_lease: activeSchedulerLease ? structuredClone(activeSchedulerLease) : null,
        telemetry_samples: telemetrySamples.map((t) => structuredClone(t)),
        service_mode: serviceMode,
        write_postings_blocked: writePostingsBlocked,
        old_image_rollback_forbidden: oldImageRollbackForbidden,
        current_release_tag: currentReleaseTag,
        current_schema_version: currentSchemaVersion,
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerReleaseManifest(input) {
      const replay = checkIdempotency<ReleaseManifestCandidate>(
        'p27.register_manifest',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const tag = input.release_tag.trim();
      const feHash = input.frontend_build_hash.trim();
      const beDigest = input.backend_image_digest.trim();
      const schemaVer = input.schema_version.trim();
      const actor = input.actor_user_id.trim();
      const at = input.registered_at.trim();

      if (!tag || !feHash || !beDigest || !schemaVer || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Release tag, frontend hash, backend image digest, schema version, actor ID, and UTC timestamp are required.'
        );
      }
      if (!input.mysql_private_network_only) {
        return fail(
          422,
          'PUBLIC_MYSQL_PORT_FORBIDDEN',
          'Database must be reachable strictly over the private internal Docker network.'
        );
      }
      if (!input.secrets_outside_git_and_bundle) {
        return fail(
          422,
          'SECRETS_IN_REPO_OR_BUNDLE_FORBIDDEN',
          'Application secrets and keys must remain excluded from Git history, images, and frontend bundles.'
        );
      }
      if (!input.single_worker_bounded) {
        return fail(
          422,
          'UNBOUNDED_WORKER_CONFIG_FORBIDDEN',
          'Queue worker and scheduler must have explicit single-host memory and restart limits configured.'
        );
      }
      if (releaseCandidates.some((r) => r.release_tag === tag)) {
        return fail(409, 'DUPLICATE_RELEASE_TAG', `Release tag "${tag}" is already registered.`);
      }

      const candidate: ReleaseManifestCandidate = {
        release_id: nextId(),
        release_tag: tag,
        frontend_build_hash: feHash,
        backend_image_digest: beDigest,
        schema_version: schemaVer,
        mysql_private_network_only: true,
        secrets_outside_git_and_bundle: true,
        single_worker_bounded: true,
        actor_user_id: actor,
        registered_at: at,
      };
      releaseCandidates.push(candidate);

      history.push({
        event_id: nextId(),
        target_id: candidate.release_id,
        action: 'release_manifest_registered',
        actor_user_id: actor,
        reason: `Pinned ${tag} (schema ${schemaVer}) with private MySQL & external secrets`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p27.register_manifest',
        actor,
        candidate.release_id,
        input.idempotency_key,
        input,
        201,
        'RELEASE_MANIFEST_REGISTERED',
        `Registered reproducible release manifest "${tag}" (schema ${schemaVer}).`,
        structuredClone(candidate)
      );
    },

    startMaintenanceAndFenceWrites(input) {
      const replay = checkIdempotency<MaintenanceWindowRecord>(
        'p27.start_maintenance',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const ref = input.maintenance_ref.trim();
      const lead = input.lead_user_id.trim();
      const affected = input.affected_operations.trim();
      const startedAt = input.started_at.trim();
      const nextUpdateAt = input.next_update_at.trim();

      if (
        !ref ||
        !lead ||
        !affected ||
        !UTC_INSTANT_PATTERN.test(startedAt) ||
        !UTC_INSTANT_PATTERN.test(nextUpdateAt)
      ) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Maintenance reference, technical lead ID, affected scope, and UTC timestamps are required.'
        );
      }
      if (!input.outside_booth_trading) {
        return fail(
          409,
          'MAINTENANCE_DURING_ACTIVE_BOOTH_BLOCKED',
          'Scheduled deployment maintenance is prohibited during active chapter booth trading hours.'
        );
      }
      if (!input.backup_validated || !input.active_tx_drained) {
        return fail(
          422,
          'BACKUP_VALIDATION_REQUIRED_BEFORE_MIGRATION',
          'Active transactions must drain and consistent pre-upgrade backups must be verified before fencing writes.'
        );
      }

      const win: MaintenanceWindowRecord = {
        window_id: nextId(),
        maintenance_ref: ref,
        lead_user_id: lead,
        outside_booth_trading: true,
        backup_validated: true,
        active_tx_drained: true,
        affected_operations: affected,
        started_at: startedAt,
        next_update_at: nextUpdateAt,
      };
      maintenanceWindows.push(win);
      serviceMode = 'maintenance_fenced';
      writePostingsBlocked = true;

      history.push({
        event_id: nextId(),
        target_id: win.window_id,
        action: 'maintenance_write_fence_enabled',
        actor_user_id: lead,
        reason: `Fenced new business postings for ${ref}; next update ${nextUpdateAt}`,
        timestamp: startedAt,
      });

      return recordLedgerAndPersist(
        'p27.start_maintenance',
        lead,
        win.window_id,
        input.idempotency_key,
        input,
        200,
        'MAINTENANCE_WRITE_FENCE_ENABLED',
        `Maintenance window "${ref}" active: new business postings fenced safely.`,
        structuredClone(win)
      );
    },

    executeReleaseDeployment(input) {
      const replay = checkIdempotency<P27SummaryMetrics>(
        'p27.deploy_release',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const tag = input.release_tag.trim();
      const actor = input.actor_user_id.trim();
      const at = input.executed_at.trim();

      if (!tag || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Release tag, actor ID, and UTC time are required.');
      }
      if (serviceMode !== 'maintenance_fenced') {
        return fail(
          409,
          'MAINTENANCE_FENCE_REQUIRED',
          'Service must enter maintenance write fencing before executing release migration and swap.'
        );
      }
      const candidate = releaseCandidates.find((r) => r.release_tag === tag);
      if (!candidate) {
        return fail(404, 'UNKNOWN_RELEASE_TAG', `Release manifest "${tag}" is not registered.`);
      }

      if (input.simulate_migration_or_health_failure) {
        serviceMode = 'failed_release_locked';
        writePostingsBlocked = true;
        oldImageRollbackForbidden = input.incompatible_schema_applied;

        const summary = computeSummary();
        history.push({
          event_id: nextId(),
          target_id: candidate.release_id,
          action: 'failed_release_locked_postings_blocked',
          actor_user_id: actor,
          reason: `Release ${tag} failed check; postings remain blocked (incompatible schema: ${String(input.incompatible_schema_applied)})`,
          timestamp: at,
        });

        return recordLedgerAndPersist(
          'p27.deploy_release',
          actor,
          candidate.release_id,
          input.idempotency_key,
          input,
          503,
          'FAILED_RELEASE_POSTINGS_REMAIN_BLOCKED',
          `Release "${tag}" failed migration or health verification: new officer postings remain blocked pending recovery.`,
          summary
        );
      }

      if (
        !input.migration_applied_once ||
        !input.health_ok ||
        !input.queues_ok ||
        !input.balances_checked
      ) {
        return fail(
          422,
          'PRE_REOPEN_CHECKS_INCOMPLETE',
          'Once-only migrations, service health, queue backlog, and balance checks must all pass before reopening.'
        );
      }

      serviceMode = 'operational';
      writePostingsBlocked = false;
      oldImageRollbackForbidden = false;
      currentReleaseTag = candidate.release_tag;
      currentSchemaVersion = candidate.schema_version;

      const summary = computeSummary();
      history.push({
        event_id: nextId(),
        target_id: candidate.release_id,
        action: 'release_deployed_and_reopened',
        actor_user_id: actor,
        reason: `Deployed ${candidate.release_tag} (schema ${candidate.schema_version}) cleanly`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p27.deploy_release',
        actor,
        candidate.release_id,
        input.idempotency_key,
        input,
        200,
        'RELEASE_DEPLOYED_AND_REOPENED',
        `Release "${candidate.release_tag}" verified and reopened safely (queues & balances healthy).`,
        summary
      );
    },

    attemptUnsafeRollbackOrWriteDuringLock(input) {
      const actor = input.actor_user_id.trim() || 'system';
      const at = input.attempted_at.trim();

      if (input.action === 'business_write' && writePostingsBlocked) {
        history.push({
          event_id: nextId(),
          target_id: chapterId,
          action: 'fenced_write_blocked_explicitly',
          actor_user_id: actor,
          reason: `Blocked write during ${serviceMode}`,
          timestamp: UTC_INSTANT_PATTERN.test(at) ? at : new Date().toISOString().replace(/\.000Z$/, 'Z'),
        });
        persistSnapshot();
        return fail(
          503,
          'SERVICE_FENCED_WRITE_BLOCKED_EXPLICITLY',
          `Operations are currently fenced (${serviceMode}); business posting is explicitly refused rather than left uncertain.`
        );
      }

      if (input.action === 'rollback_old_image' && oldImageRollbackForbidden) {
        history.push({
          event_id: nextId(),
          target_id: chapterId,
          action: 'unsafe_old_image_rollback_blocked',
          actor_user_id: actor,
          reason: 'Blocked incompatible old application container rollback after schema migration',
          timestamp: UTC_INSTANT_PATTERN.test(at) ? at : new Date().toISOString().replace(/\.000Z$/, 'Z'),
        });
        persistSnapshot();
        return fail(
          409,
          'INCOMPATIBLE_SCHEMA_OLD_IMAGE_ROLLBACK_FORBIDDEN',
          'Incompatible schema changes were applied; running the prior application image is forbidden — use reconciled restore instead.'
        );
      }

      const summary = computeSummary();
      const okRes: P27ActionResult<P27SummaryMetrics> = {
        ok: true,
        http_status: 200,
        code: 'ACTION_PERMITTED_OPERATIONAL',
        message: 'Service is operational and unlocked for authorized execution.',
        data: summary,
      };
      lastAction = okRes;
      return okRes;
    },

    acquireSingletonSchedulerLease(input) {
      const replay = checkIdempotency<SchedulerLeaseRecord>(
        'p27.scheduler_lease',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const instanceId = input.scheduler_instance_id.trim();
      const ttlStr = input.ttl_seconds.trim();
      const acquiredAt = input.acquired_at.trim();

      if (!instanceId || !UTC_INSTANT_PATTERN.test(acquiredAt)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Scheduler instance ID and valid UTC acquisition timestamp are required.'
        );
      }
      if (!INTEGER_PATTERN.test(ttlStr) || BigInt(ttlStr) <= 0n) {
        return fail(422, 'INVALID_TTL', 'Scheduler lease TTL seconds must be a positive whole number.');
      }

      const nowMs = Date.parse(acquiredAt);
      if (
        activeSchedulerLease &&
        nowMs < Date.parse(activeSchedulerLease.expires_at) &&
        activeSchedulerLease.scheduler_instance_id !== instanceId
      ) {
        return fail(
          409,
          'DUPLICATE_SCHEDULER_PREVENTED',
          `Singleton scheduler lease is already held by "${activeSchedulerLease.scheduler_instance_id}" until ${activeSchedulerLease.expires_at}.`
        );
      }

      const ttlNum = Number(ttlStr);
      const lease: SchedulerLeaseRecord = {
        lease_id: nextId(),
        scheduler_instance_id: instanceId,
        acquired_at: acquiredAt,
        expires_at: addSecondsUtc(acquiredAt, ttlNum),
      };
      activeSchedulerLease = lease;

      history.push({
        event_id: nextId(),
        target_id: lease.lease_id,
        action: 'singleton_scheduler_lease_acquired',
        actor_user_id: instanceId,
        reason: `Active lease held by ${instanceId} until ${lease.expires_at}`,
        timestamp: acquiredAt,
      });

      return recordLedgerAndPersist(
        'p27.scheduler_lease',
        instanceId,
        lease.lease_id,
        input.idempotency_key,
        input,
        200,
        'SCHEDULER_LEASE_ACQUIRED',
        `Acquired singleton scheduler lock for "${instanceId}" until ${lease.expires_at}.`,
        structuredClone(lease)
      );
    },

    recordLoadAndFundingTelemetry(input) {
      const replay = checkIdempotency<HostTelemetrySample>(
        'p27.record_telemetry',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const sampledAt = input.sampled_at.trim();
      if (!actor || !UTC_INSTANT_PATTERN.test(sampledAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Operator ID and UTC sample time are required.');
      }

      const intFields = [
        input.concurrent_officers.trim(),
        input.pdf_jobs_active.trim(),
        input.memory_pct.trim(),
        input.cpu_pct.trim(),
        input.p95_latency_ms.trim(),
        input.backup_lag_seconds.trim(),
      ];
      if (intFields.some((v) => !INTEGER_PATTERN.test(v))) {
        return fail(422, 'INVALID_METRIC', 'Load, latency, and percentage metrics must be whole numbers.');
      }
      if (
        !MONEY_PATTERN.test(input.credit_remaining_usd.trim()) ||
        !MONEY_PATTERN.test(input.reserve_floor_usd.trim())
      ) {
        return fail(
          422,
          'INVALID_USD_AMOUNT',
          'Credit remaining and reserve floor must be formatted as USD 0.00.'
        );
      }

      const triggers: string[] = [];
      if (BigInt(input.memory_pct.trim()) > 80n) triggers.push('MEMORY_REVIEW_TRIGGER_ABOVE_80');
      if (BigInt(input.cpu_pct.trim()) > 70n) triggers.push('CPU_REVIEW_TRIGGER_ABOVE_70');
      if (BigInt(input.p95_latency_ms.trim()) > 2000n) {
        triggers.push('LATENCY_REVIEW_TRIGGER_ABOVE_2000MS');
      }
      if (toCents(input.credit_remaining_usd.trim()) <= toCents(input.reserve_floor_usd.trim())) {
        triggers.push('CREDIT_RESERVE_ALERT');
      }

      const sample: HostTelemetrySample = {
        sample_id: nextId(),
        concurrent_officers: input.concurrent_officers.trim(),
        pdf_jobs_active: input.pdf_jobs_active.trim(),
        memory_pct: input.memory_pct.trim(),
        cpu_pct: input.cpu_pct.trim(),
        p95_latency_ms: input.p95_latency_ms.trim(),
        backup_lag_seconds: input.backup_lag_seconds.trim(),
        credit_remaining_usd: input.credit_remaining_usd.trim(),
        reserve_floor_usd: input.reserve_floor_usd.trim(),
        review_triggers: triggers,
        automatic_spending_authorized: false,
        sampled_at: sampledAt,
      };
      telemetrySamples.push(sample);

      history.push({
        event_id: nextId(),
        target_id: sample.sample_id,
        action: 'host_telemetry_recorded',
        actor_user_id: actor,
        reason: `${sample.concurrent_officers} officers / mem ${sample.memory_pct}% / cpu ${sample.cpu_pct}% / credit USD ${sample.credit_remaining_usd} (triggers: ${triggers.length})`,
        timestamp: sampledAt,
      });

      return recordLedgerAndPersist(
        'p27.record_telemetry',
        actor,
        sample.sample_id,
        input.idempotency_key,
        input,
        201,
        'TELEMETRY_RECORDED_NO_AUTO_SPENDING',
        `Recorded telemetry with ${triggers.length} review trigger(s); automatic cloud spending remains disabled.`,
        structuredClone(sample)
      );
    },

    lookupHostReleaseOperation(input) {
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
