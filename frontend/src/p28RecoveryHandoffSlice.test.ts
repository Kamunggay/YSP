import { describe, expect, it } from 'vitest';
import { createP28RecoveryHandoffEngine, P28_CONTEXT_STORAGE_KEY } from './p28RecoveryHandoffSlice';
import type {
  OffHostBackupArtifact,
  P28LookupResult,
  ReplayedFollowUpRecord,
  TimedRecoveryDrillRecord,
  UncertainIntervalItem,
} from './p28RecoveryHandoffSlice';

describe('p28RecoveryHandoffSlice — Independent Recovery, Regional Drills & Uncertain Reconciliation', () => {
  it('starts strictly unseeded with empty recovery logs and not_opened status', () => {
    expect(P28_CONTEXT_STORAGE_KEY).toBe('ysp_p28_context');
    const engine = createP28RecoveryHandoffEngine();
    const snap = engine.getSnapshot();

    expect(snap.backup_artifacts).toEqual([]);
    expect(snap.recovery_drills).toEqual([]);
    expect(snap.uncertain_interval_items).toEqual([]);
    expect(snap.replayed_operations).toEqual([]);
    expect(snap.reopen_status).toBe('not_opened');
    expect(snap.summary.off_host_backups_count).toBe(0);
    expect(snap.summary.passed_drills_count).toBe(0);
  });

  it('rejects same-region backups and enforces <=4h RTO and <=1h RPO with writer fencing (SEC-05, AC-22)', () => {
    const engine = createP28RecoveryHandoffEngine({ chapter_id: '1' });

    const sameRegion = engine.registerOffHostBackupSet({
      backup_ref: 'BKP-SAME-REGION',
      primary_region: 'ap-southeast-1',
      destination_region: 'ap-southeast-1',
      binlog_lag_seconds: '180',
      includes_mysql_dump: true,
      includes_binlogs: true,
      includes_evidence_objects: true,
      includes_keys_and_config: true,
      includes_audit_idempotency_sequences: true,
      encrypted: true,
      destination_acknowledged: true,
      operator_user_id: '701',
      recorded_at: '2026-11-22T05:00:00Z',
    });
    expect(sameRegion.ok).toBe(false);
    expect(sameRegion.code).toBe('SAME_REGION_BACKUP_INSUFFICIENT');

    const offHost = engine.registerOffHostBackupSet({
      backup_ref: 'BKP-OFFHOST-SG-TO-TYO',
      primary_region: 'ap-southeast-1',
      destination_region: 'ap-northeast-1',
      binlog_lag_seconds: '240',
      includes_mysql_dump: true,
      includes_binlogs: true,
      includes_evidence_objects: true,
      includes_keys_and_config: true,
      includes_audit_idempotency_sequences: true,
      encrypted: true,
      destination_acknowledged: true,
      operator_user_id: '701',
      recorded_at: '2026-11-22T05:05:00Z',
      idempotency_key: 'p28-bkp-1',
    });
    expect(offHost.ok).toBe(true);
    expect((offHost.data as OffHostBackupArtifact).binlog_target_5min_exceeded).toBe(false);

    // Block missing writer fencing
    const unfenced = engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-BAD-UNFENCED',
      backup_ref: 'BKP-OFFHOST-SG-TO-TYO',
      executor_user_id: '701',
      executor_role: 'technical_lead',
      old_writers_fenced: false,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T05:30:00Z',
      service_restored_at: '2026-11-22T07:30:00Z',
    });
    expect(unfenced.ok).toBe(false);
    expect(unfenced.code).toBe('OLD_WRITER_FENCING_REQUIRED');

    // Block RTO > 240 minutes
    const slowRto = engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-SLOW-RTO',
      backup_ref: 'BKP-OFFHOST-SG-TO-TYO',
      executor_user_id: '701',
      executor_role: 'technical_lead',
      old_writers_fenced: true,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T05:30:00Z',
      service_restored_at: '2026-11-22T10:05:00Z',
    });
    expect(slowRto.ok).toBe(false);
    expect(slowRto.code).toBe('RTO_EXCEEDED_4_HOURS');

    // Block RPO loss > 60 minutes
    const highRpo = engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-HIGH-RPO',
      backup_ref: 'BKP-OFFHOST-SG-TO-TYO',
      executor_user_id: '701',
      executor_role: 'technical_lead',
      old_writers_fenced: true,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T04:45:00Z',
      service_restored_at: '2026-11-22T07:30:00Z',
    });
    expect(highRpo.ok).toBe(false);
    expect(highRpo.code).toBe('RPO_LOSS_EXCEEDED_1_HOUR');

    const leadDrill = engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-LEAD-01',
      backup_ref: 'BKP-OFFHOST-SG-TO-TYO',
      executor_user_id: '701',
      executor_role: 'technical_lead',
      old_writers_fenced: true,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T05:30:00Z',
      service_restored_at: '2026-11-22T07:30:00Z',
      idempotency_key: 'p28-drill-lead',
    });
    expect(leadDrill.ok).toBe(true);
    expect((leadDrill.data as TimedRecoveryDrillRecord).rto_minutes).toBe(90);
    expect((leadDrill.data as TimedRecoveryDrillRecord).rpo_loss_minutes).toBe(30);
    expect(engine.getSnapshot().reopen_status).toBe('blocked_pending_reconciliation');
  });

  it('requires distinct lead & backup drills plus business reconciliation before authorizing reopen (SEC-06)', () => {
    const engine = createP28RecoveryHandoffEngine({ chapter_id: '1' });

    engine.registerOffHostBackupSet({
      backup_ref: 'BKP-2',
      primary_region: 'ap-southeast-1',
      destination_region: 'ap-northeast-1',
      binlog_lag_seconds: '120',
      includes_mysql_dump: true,
      includes_binlogs: true,
      includes_evidence_objects: true,
      includes_keys_and_config: true,
      includes_audit_idempotency_sequences: true,
      encrypted: true,
      destination_acknowledged: true,
      operator_user_id: '701',
      recorded_at: '2026-11-22T05:00:00Z',
    });

    engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-LEAD',
      backup_ref: 'BKP-2',
      executor_user_id: '701',
      executor_role: 'technical_lead',
      old_writers_fenced: true,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T05:35:00Z',
      service_restored_at: '2026-11-22T07:00:00Z',
    });

    // Cannot reopen with only lead drill (named backup rehearsal missing)
    const missingBackupDrill = engine.authorizePostRecoveryReopen({
      peer_technical_reviewer_id: '703',
      finance_reconciler_id: '302',
      authorizing_head_id: '101',
      authorized_at: '2026-11-22T08:00:00Z',
    });
    expect(missingBackupDrill.ok).toBe(false);
    expect(missingBackupDrill.code).toBe('INDEPENDENT_LEAD_AND_BACKUP_DRILLS_REQUIRED');

    // Named backup distinct executor passes timed drill
    const backupDrill = engine.executeTimedRegionalRestoreDrill({
      drill_ref: 'DRILL-BACKUP',
      backup_ref: 'BKP-2',
      executor_user_id: '702',
      executor_role: 'named_backup',
      old_writers_fenced: true,
      evidence_and_history_usable: true,
      failure_started_at: '2026-11-22T06:00:00Z',
      last_recovered_commit_at: '2026-11-22T05:40:00Z',
      service_restored_at: '2026-11-22T07:10:00Z',
    });
    expect(backupDrill.ok).toBe(true);

    // Uncertain interval item logged strictly unresolved
    const loggedItem = engine.recordUncertainIntervalItem({
      category: 'manual_outage_sale',
      source_reference: 'MAN-OR-2026-0091',
      description: 'Offline cash sale at campus booth during regional outage window',
      interval_start_at: '2026-11-22T05:40:00Z',
      interval_end_at: '2026-11-22T06:00:00Z',
      recorded_by_user_id: '401',
      recorded_at: '2026-11-22T07:15:00Z',
      idempotency_key: 'p28-unc-1',
    });
    expect(loggedItem.ok).toBe(true);
    const uncData = loggedItem.data as UncertainIntervalItem;
    expect(uncData.resolution_status).toBe('unresolved_uncertain');
    expect(uncData.silently_marked_verified).toBe(false);

    // Technical executor cannot clear business discrepancy
    const techDenied = engine.reconcileUncertainIntervalItem({
      item_id: uncData.item_id,
      reconciler_user_id: '701',
      reconciler_role: 'TECHNICAL_EXECUTOR',
      evidence_ref: 'GC-771290',
      reconciliation_note: 'Tried to self-clear after restore',
      reconciled_at: '2026-11-22T07:20:00Z',
    });
    expect(techDenied.ok).toBe(false);
    expect(techDenied.code).toBe('TECHNICAL_EXECUTOR_ALONE_CANNOT_CLEAR_BUSINESS_DISCREPANCY');

    // Unresolved uncertain interval blocks reopening
    const blockedReopen = engine.authorizePostRecoveryReopen({
      peer_technical_reviewer_id: '703',
      finance_reconciler_id: '302',
      authorizing_head_id: '101',
      authorized_at: '2026-11-22T08:05:00Z',
    });
    expect(blockedReopen.ok).toBe(false);
    expect(blockedReopen.code).toBe('UNRESOLVED_UNCERTAIN_INTERVAL_BLOCKS_REOPEN');

    // Finance officer reconciles with real evidence
    const finReconciled = engine.reconcileUncertainIntervalItem({
      item_id: uncData.item_id,
      reconciler_user_id: '302',
      reconciler_role: 'FINANCE',
      evidence_ref: 'MAN-OR-STUB-0091',
      reconciliation_note: 'Matched manual stub #0091 with remitted booth cash count',
      reconciled_at: '2026-11-22T08:10:00Z',
      idempotency_key: 'p28-rec-1',
    });
    expect(finReconciled.ok).toBe(true);

    // Peer review by non-author + Finance reconciler passes reopening gate
    const reopened = engine.authorizePostRecoveryReopen({
      peer_technical_reviewer_id: '703',
      finance_reconciler_id: '302',
      authorizing_head_id: '101',
      authorized_at: '2026-11-22T08:15:00Z',
      idempotency_key: 'p28-reopen-1',
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.code).toBe('SERVICE_REOPENING_AUTHORIZED');
    expect(engine.getSnapshot().reopen_status).toBe('reopened_authorized');
  });

  it('deduplicates durable follow-up replay with zero double stock/money effect and supports lookup recovery', () => {
    const engine = createP28RecoveryHandoffEngine({ chapter_id: '1' });

    const preCommitted = engine.replayDurableFollowUp({
      original_operation_key: 'p13-or-seq-4',
      target_record_ref: 'OR-2026-000018',
      follow_up_action: 'Emit Official Receipt Notification',
      already_committed_before_failure: true,
      executor_user_id: '701',
      replayed_at: '2026-11-22T07:35:00Z',
      idempotency_key: 'p28-rep-pre',
    });
    expect(preCommitted.ok).toBe(true);
    expect(preCommitted.code).toBe('REPLAY_DEDUPLICATED_ZERO_DOUBLE_EFFECT');
    expect((preCommitted.data as ReplayedFollowUpRecord).duplicate_effect_created).toBe(false);

    const queuedOnce = engine.replayDurableFollowUp({
      original_operation_key: 'p15-dr-seq-7',
      target_record_ref: 'DR-2026-000021',
      follow_up_action: 'Sync customer release PDF artifact',
      already_committed_before_failure: false,
      executor_user_id: '701',
      replayed_at: '2026-11-22T07:36:00Z',
      idempotency_key: 'p28-rep-once',
    });
    expect(queuedOnce.ok).toBe(true);
    expect(queuedOnce.code).toBe('REPLAY_FOLLOWUP_EXECUTED_ONCE');
    expect((queuedOnce.data as ReplayedFollowUpRecord).execution_count).toBe(1);

    // Second replay of same key deduplicates cleanly
    const secondReplay = engine.replayDurableFollowUp({
      original_operation_key: 'p15-dr-seq-7',
      target_record_ref: 'DR-2026-000021',
      follow_up_action: 'Sync customer release PDF artifact',
      already_committed_before_failure: false,
      executor_user_id: '701',
      replayed_at: '2026-11-22T07:37:00Z',
    });
    expect(secondReplay.ok).toBe(true);
    expect(secondReplay.code).toBe('REPLAY_DEDUPLICATED_ZERO_DOUBLE_EFFECT');
    expect((secondReplay.data as ReplayedFollowUpRecord).duplicate_effect_created).toBe(false);

    const lookup = engine.lookupRecoveryOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p28-rep-once',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P28LookupResult).action_result).toBe('recovered');
  });
});
