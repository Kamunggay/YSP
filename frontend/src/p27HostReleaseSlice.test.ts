import { describe, expect, it } from 'vitest';
import { createP27HostReleaseEngine, P27_CONTEXT_STORAGE_KEY } from './p27HostReleaseSlice';
import type { HostTelemetrySample, P27LookupResult } from './p27HostReleaseSlice';

describe('p27HostReleaseSlice — Reproducible Host/Release, Maintenance Fence & Operating Controls', () => {
  it('starts strictly unseeded in operational mode with empty manifests and leases', () => {
    expect(P27_CONTEXT_STORAGE_KEY).toBe('ysp_p27_context');
    const engine = createP27HostReleaseEngine();
    const snap = engine.getSnapshot();

    expect(snap.release_candidates).toEqual([]);
    expect(snap.maintenance_windows).toEqual([]);
    expect(snap.active_scheduler_lease).toBeNull();
    expect(snap.telemetry_samples).toEqual([]);
    expect(snap.service_mode).toBe('operational');
    expect(snap.write_postings_blocked).toBe(false);
    expect(snap.old_image_rollback_forbidden).toBe(false);
    expect(snap.current_release_tag).toBe('');
    expect(snap.current_schema_version).toBe('');
  });

  it('enforces private MySQL, secret hygiene, bounded worker, and outside-booth maintenance fencing', () => {
    const engine = createP27HostReleaseEngine({ chapter_id: '1' });

    const pubDb = engine.registerReleaseManifest({
      release_tag: 'v1.5.0-bad-db',
      frontend_build_hash: 'sha256-aaa',
      backend_image_digest: 'sha256-bbb',
      schema_version: '2026_11_22_0001',
      mysql_private_network_only: false,
      secrets_outside_git_and_bundle: true,
      single_worker_bounded: true,
      actor_user_id: '101',
      registered_at: '2026-11-22T01:00:00Z',
    });
    expect(pubDb.ok).toBe(false);
    expect(pubDb.code).toBe('PUBLIC_MYSQL_PORT_FORBIDDEN');

    const badSecret = engine.registerReleaseManifest({
      release_tag: 'v1.5.0-bad-sec',
      frontend_build_hash: 'sha256-aaa',
      backend_image_digest: 'sha256-bbb',
      schema_version: '2026_11_22_0001',
      mysql_private_network_only: true,
      secrets_outside_git_and_bundle: false,
      single_worker_bounded: true,
      actor_user_id: '101',
      registered_at: '2026-11-22T01:01:00Z',
    });
    expect(badSecret.ok).toBe(false);
    expect(badSecret.code).toBe('SECRETS_IN_REPO_OR_BUNDLE_FORBIDDEN');

    const validRel = engine.registerReleaseManifest({
      release_tag: 'v1.5.0',
      frontend_build_hash: 'sha256-fe-150',
      backend_image_digest: 'sha256-be-150',
      schema_version: '2026_11_22_0015',
      mysql_private_network_only: true,
      secrets_outside_git_and_bundle: true,
      single_worker_bounded: true,
      actor_user_id: '101',
      registered_at: '2026-11-22T01:05:00Z',
      idempotency_key: 'p27-rel-150',
    });
    expect(validRel.ok).toBe(true);

    // Block maintenance during active booth trading
    const boothBusy = engine.startMaintenanceAndFenceWrites({
      maintenance_ref: 'MAINT-2026-11-A',
      lead_user_id: '101',
      outside_booth_trading: false,
      backup_validated: true,
      active_tx_drained: true,
      affected_operations: 'All business postings',
      started_at: '2026-11-22T02:00:00Z',
      next_update_at: '2026-11-22T02:30:00Z',
    });
    expect(boothBusy.ok).toBe(false);
    expect(boothBusy.code).toBe('MAINTENANCE_DURING_ACTIVE_BOOTH_BLOCKED');

    // Start valid outside-booth fenced maintenance
    const maintOk = engine.startMaintenanceAndFenceWrites({
      maintenance_ref: 'MAINT-2026-11-B',
      lead_user_id: '101',
      outside_booth_trading: true,
      backup_validated: true,
      active_tx_drained: true,
      affected_operations: 'All business postings',
      started_at: '2026-11-22T02:05:00Z',
      next_update_at: '2026-11-22T02:35:00Z',
      idempotency_key: 'p27-maint-ok',
    });
    expect(maintOk.ok).toBe(true);
    expect(engine.getSnapshot().service_mode).toBe('maintenance_fenced');
    expect(engine.getSnapshot().write_postings_blocked).toBe(true);

    const blockedWrite = engine.attemptUnsafeRollbackOrWriteDuringLock({
      action: 'business_write',
      actor_user_id: '102',
      attempted_at: '2026-11-22T02:06:00Z',
    });
    expect(blockedWrite.ok).toBe(false);
    expect(blockedWrite.code).toBe('SERVICE_FENCED_WRITE_BLOCKED_EXPLICITLY');
  });

  it('keeps postings blocked on failed incompatible release, blocks unsafe rollback, and reopens cleanly on fix', () => {
    const engine = createP27HostReleaseEngine({ chapter_id: '1' });

    engine.registerReleaseManifest({
      release_tag: 'v1.6.0-rc1',
      frontend_build_hash: 'sha256-fe-160',
      backend_image_digest: 'sha256-be-160',
      schema_version: '2026_11_22_0016',
      mysql_private_network_only: true,
      secrets_outside_git_and_bundle: true,
      single_worker_bounded: true,
      actor_user_id: '101',
      registered_at: '2026-11-22T03:00:00Z',
    });

    engine.startMaintenanceAndFenceWrites({
      maintenance_ref: 'MAINT-2026-11-C',
      lead_user_id: '101',
      outside_booth_trading: true,
      backup_validated: true,
      active_tx_drained: true,
      affected_operations: 'All chapter workflows',
      started_at: '2026-11-22T03:05:00Z',
      next_update_at: '2026-11-22T03:35:00Z',
    });

    // Simulated migration/health failure -> persists 503 lock and forbids old image rollback
    const failedDeploy = engine.executeReleaseDeployment({
      release_tag: 'v1.6.0-rc1',
      actor_user_id: '101',
      simulate_migration_or_health_failure: true,
      incompatible_schema_applied: true,
      migration_applied_once: true,
      health_ok: false,
      queues_ok: false,
      balances_checked: false,
      executed_at: '2026-11-22T03:10:00Z',
      idempotency_key: 'p27-fail-dep',
    });
    expect(failedDeploy.ok).toBe(false);
    expect(failedDeploy.http_status).toBe(503);
    expect(failedDeploy.code).toBe('FAILED_RELEASE_POSTINGS_REMAIN_BLOCKED');
    expect(engine.getSnapshot().service_mode).toBe('failed_release_locked');
    expect(engine.getSnapshot().write_postings_blocked).toBe(true);
    expect(engine.getSnapshot().old_image_rollback_forbidden).toBe(true);

    const unsafeRollback = engine.attemptUnsafeRollbackOrWriteDuringLock({
      action: 'rollback_old_image',
      actor_user_id: '101',
      attempted_at: '2026-11-22T03:11:00Z',
    });
    expect(unsafeRollback.ok).toBe(false);
    expect(unsafeRollback.code).toBe('INCOMPATIBLE_SCHEMA_OLD_IMAGE_ROLLBACK_FORBIDDEN');

    // Recover cleanly with patched release
    engine.registerReleaseManifest({
      release_tag: 'v1.6.1',
      frontend_build_hash: 'sha256-fe-161',
      backend_image_digest: 'sha256-be-161',
      schema_version: '2026_11_22_0016',
      mysql_private_network_only: true,
      secrets_outside_git_and_bundle: true,
      single_worker_bounded: true,
      actor_user_id: '101',
      registered_at: '2026-11-22T03:15:00Z',
    });
    engine.startMaintenanceAndFenceWrites({
      maintenance_ref: 'MAINT-2026-11-D',
      lead_user_id: '101',
      outside_booth_trading: true,
      backup_validated: true,
      active_tx_drained: true,
      affected_operations: 'All chapter workflows',
      started_at: '2026-11-22T03:16:00Z',
      next_update_at: '2026-11-22T03:45:00Z',
    });

    const cleanDeploy = engine.executeReleaseDeployment({
      release_tag: 'v1.6.1',
      actor_user_id: '101',
      simulate_migration_or_health_failure: false,
      incompatible_schema_applied: false,
      migration_applied_once: true,
      health_ok: true,
      queues_ok: true,
      balances_checked: true,
      executed_at: '2026-11-22T03:20:00Z',
      idempotency_key: 'p27-clean-dep',
    });
    expect(cleanDeploy.ok).toBe(true);
    expect(cleanDeploy.code).toBe('RELEASE_DEPLOYED_AND_REOPENED');
    expect(engine.getSnapshot().service_mode).toBe('operational');
    expect(engine.getSnapshot().write_postings_blocked).toBe(false);
    expect(engine.getSnapshot().current_release_tag).toBe('v1.6.1');
  });

  it('prevents duplicate schedulers, evaluates growth/credit triggers without auto-spend, and supports lookup', () => {
    const engine = createP27HostReleaseEngine({ chapter_id: '1' });

    const lease1 = engine.acquireSingletonSchedulerLease({
      scheduler_instance_id: 'sched-node-alpha',
      ttl_seconds: '60',
      acquired_at: '2026-11-22T04:00:00Z',
      idempotency_key: 'p27-lease-1',
    });
    expect(lease1.ok).toBe(true);

    const dupSched = engine.acquireSingletonSchedulerLease({
      scheduler_instance_id: 'sched-node-beta',
      ttl_seconds: '60',
      acquired_at: '2026-11-22T04:00:30Z',
    });
    expect(dupSched.ok).toBe(false);
    expect(dupSched.code).toBe('DUPLICATE_SCHEDULER_PREVENTED');

    // Handover allowed cleanly after lease expiration
    const lease2 = engine.acquireSingletonSchedulerLease({
      scheduler_instance_id: 'sched-node-beta',
      ttl_seconds: '60',
      acquired_at: '2026-11-22T04:01:05Z',
    });
    expect(lease2.ok).toBe(true);

    // 4-user PDF/job load crossing review triggers & USD reserve floor without automatic spending
    const telRes = engine.recordLoadAndFundingTelemetry({
      actor_user_id: '101',
      concurrent_officers: '4',
      pdf_jobs_active: '3',
      memory_pct: '84',
      cpu_pct: '76',
      p95_latency_ms: '2450',
      backup_lag_seconds: '180',
      credit_remaining_usd: '19.50',
      reserve_floor_usd: '20.00',
      sampled_at: '2026-11-22T04:10:00Z',
      idempotency_key: 'p27-tel-1',
    });
    expect(telRes.ok).toBe(true);
    const sample = telRes.data as HostTelemetrySample;
    expect(sample.review_triggers).toEqual([
      'MEMORY_REVIEW_TRIGGER_ABOVE_80',
      'CPU_REVIEW_TRIGGER_ABOVE_70',
      'LATENCY_REVIEW_TRIGGER_ABOVE_2000MS',
      'CREDIT_RESERVE_ALERT',
    ]);
    expect(sample.automatic_spending_authorized).toBe(false);

    const lookup = engine.lookupHostReleaseOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p27-tel-1',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P27LookupResult).action_result).toBe('recovered');
  });
});
