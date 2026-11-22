import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP28RecoveryHandoffEngine } from './p28RecoveryHandoffSlice';
import type {
  DrillExecutorRole,
  P28ActionResult,
  P28EngineSnapshot,
  P28LookupResult,
  ReconcilerRole,
  UncertainCategory,
} from './p28RecoveryHandoffSlice';

type P28TabId = 'drills' | 'reconcile' | 'replay' | 'history';

interface P28RecoveryHandoffWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P28RecoveryHandoffWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P28RecoveryHandoffWorkspaceProps) {
  const engine = useMemo(() => createP28RecoveryHandoffEngine(), []);
  const [snapshot, setSnapshot] = useState<P28EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P28TabId>('drills');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P28ActionResult | null>(snapshot.last_action);

  // Tab 1: Off-Host Backups & Timed Regional Drills
  const [bkpRefInput, setBkpRefInput] = useState('');
  const [bkpPrimaryInput, setBkpPrimaryInput] = useState('');
  const [bkpDestInput, setBkpDestInput] = useState('');
  const [bkpLagInput, setBkpLagInput] = useState('180');
  const [bkpActorInput, setBkpActorInput] = useState('');
  const [bkpAtInput, setBkpAtInput] = useState('');

  const [drillRefInput, setDrillRefInput] = useState('');
  const [drillBkpRefInput, setDrillBkpRefInput] = useState('');
  const [drillActorInput, setDrillActorInput] = useState('');
  const [drillRoleInput, setDrillRoleInput] = useState<DrillExecutorRole>('technical_lead');
  const [drillFencedInput, setDrillFencedInput] = useState(true);
  const [drillUsableInput, setDrillUsableInput] = useState(true);
  const [drillFailAtInput, setDrillFailAtInput] = useState('');
  const [drillCommitAtInput, setDrillCommitAtInput] = useState('');
  const [drillRestoredAtInput, setDrillRestoredAtInput] = useState('');

  // Tab 2: Uncertain Interval Reconciliation & Reopen Gate
  const [uncCatInput, setUncCatInput] = useState<UncertainCategory>('manual_outage_sale');
  const [uncSrcInput, setUncSrcInput] = useState('');
  const [uncDescInput, setUncDescInput] = useState('');
  const [uncStartInput, setUncStartInput] = useState('');
  const [uncEndInput, setUncEndInput] = useState('');
  const [uncActorInput, setUncActorInput] = useState('');
  const [uncAtInput, setUncAtInput] = useState('');

  const [recItemIdInput, setRecItemIdInput] = useState('');
  const [recActorInput, setRecActorInput] = useState('');
  const [recRoleInput, setRecRoleInput] = useState<ReconcilerRole>('FINANCE');
  const [recEvInput, setRecEvInput] = useState('');
  const [recNoteInput, setRecNoteInput] = useState('');
  const [recAtInput, setRecAtInput] = useState('');

  const [reopenPeerInput, setReopenPeerInput] = useState('');
  const [reopenFinanceInput, setReopenFinanceInput] = useState('');
  const [reopenHeadInput, setReopenHeadInput] = useState('');
  const [reopenAtInput, setReopenAtInput] = useState('');

  // Tab 3: Duplicate-Safe Replay
  const [repKeyInput, setRepKeyInput] = useState('');
  const [repTargetInput, setRepTargetInput] = useState('');
  const [repActionInput, setRepActionInput] = useState('');
  const [repAlreadyInput, setRepAlreadyInput] = useState(false);
  const [repActorInput, setRepActorInput] = useState('');
  const [repAtInput, setRepAtInput] = useState('');

  // Tab 4: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P28ActionResult<P28LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P28ActionResult<T>): P28ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  function handleRegisterBackup() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerOffHostBackupSet({
        backup_ref: bkpRefInput,
        primary_region: bkpPrimaryInput,
        destination_region: bkpDestInput,
        binlog_lag_seconds: bkpLagInput,
        includes_mysql_dump: true,
        includes_binlogs: true,
        includes_evidence_objects: true,
        includes_keys_and_config: true,
        includes_audit_idempotency_sequences: true,
        encrypted: true,
        destination_acknowledged: true,
        operator_user_id: bkpActorInput,
        recorded_at: bkpAtInput,
        idempotency_key: nextSequentialKey('p28-bkp'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      if (!drillBkpRefInput.trim()) setDrillBkpRefInput(bkpRefInput.trim());
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleExecuteDrill() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.executeTimedRegionalRestoreDrill({
        drill_ref: drillRefInput,
        backup_ref: drillBkpRefInput,
        executor_user_id: drillActorInput,
        executor_role: drillRoleInput,
        old_writers_fenced: drillFencedInput,
        evidence_and_history_usable: drillUsableInput,
        failure_started_at: drillFailAtInput,
        last_recovered_commit_at: drillCommitAtInput,
        service_restored_at: drillRestoredAtInput,
        idempotency_key: nextSequentialKey('p28-drill'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLogUncertain() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordUncertainIntervalItem({
        category: uncCatInput,
        source_reference: uncSrcInput,
        description: uncDescInput,
        interval_start_at: uncStartInput,
        interval_end_at: uncEndInput,
        recorded_by_user_id: uncActorInput,
        recorded_at: uncAtInput,
        idempotency_key: nextSequentialKey('p28-unc'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setRecItemIdInput(res.data.item_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReconcileUncertain() {
    playClickPen(soundEnabled);
    const targetId = recItemIdInput.trim() || snapshot.uncertain_interval_items[0]?.item_id || '';
    const res = refreshSnapshot(
      engine.reconcileUncertainIntervalItem({
        item_id: targetId,
        reconciler_user_id: recActorInput,
        reconciler_role: recRoleInput,
        evidence_ref: recEvInput,
        reconciliation_note: recNoteInput,
        reconciled_at: recAtInput,
        idempotency_key: nextSequentialKey('p28-rec'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAuthorizeReopen() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.authorizePostRecoveryReopen({
        peer_technical_reviewer_id: reopenPeerInput,
        finance_reconciler_id: reopenFinanceInput,
        authorizing_head_id: reopenHeadInput,
        authorized_at: reopenAtInput,
        idempotency_key: nextSequentialKey('p28-reopen'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReplayFollowUp() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.replayDurableFollowUp({
        original_operation_key: repKeyInput,
        target_record_ref: repTargetInput,
        follow_up_action: repActionInput,
        already_committed_before_failure: repAlreadyInput,
        executor_user_id: repActorInput,
        replayed_at: repAtInput,
        idempotency_key: nextSequentialKey('p28-rep'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupRecoveryOperation({
        query_type: 'by_key',
        chapter_id: snapshot.chapter_id,
        idempotency_key: lookupKeyInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByUlid() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupRecoveryOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleUncertain = snapshot.uncertain_interval_items.filter(
    (u) =>
      !normalizedSearch ||
      u.source_reference.toLowerCase().includes(normalizedSearch) ||
      u.description.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p28-workspace">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="p28-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search uncertain interval items or references"
                aria-label="Search recovery reconciliation items"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Independent Off-Host Recovery, Regional Drills &amp; Operating Handoff
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Recovery and handoff tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p28-tab-drills"
                  aria-selected={activeTab === 'drills'}
                  className={`p03-filter-pill ${activeTab === 'drills' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('drills');
                  }}
                >
                  Off-Host Backups &amp; Drills
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p28-tab-reconcile"
                  aria-selected={activeTab === 'reconcile'}
                  className={`p03-filter-pill ${activeTab === 'reconcile' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('reconcile');
                  }}
                >
                  Uncertain Reconciliation &amp; Reopen
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p28-tab-replay"
                  aria-selected={activeTab === 'replay'}
                  className={`p03-filter-pill ${activeTab === 'replay' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('replay');
                  }}
                >
                  Duplicate-Safe Replay
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p28-tab-history"
                  aria-selected={activeTab === 'history'}
                  className={`p03-filter-pill ${activeTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('history');
                  }}
                >
                  Audit History &amp; Recovery
                </button>
              </div>

              <button
                type="button"
                id="p28-back-dashboard-btn"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={() => {
                  playClickPen(soundEnabled);
                  onBackToDashboard();
                }}
              >
                Back to Chapter Workspace
              </button>
            </div>
          </div>
        </header>

        <section className="p03-card surface-card" aria-labelledby="p28-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p28-overview-heading" className="p03-section-title">
              Recovery &amp; Reconciliation Status — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Reopen Gate:{' '}
                <strong data-testid="p28-reopen-status-val">{snapshot.reopen_status}</strong>
              </span>
              <span className="p03-version-pill">
                Unresolved Uncertain:{' '}
                <strong data-testid="p28-unresolved-count-val">
                  {snapshot.summary.unresolved_uncertain_count}
                </strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Off-Host Backup Sets</span>
              <span className="p03-axis-val" data-testid="p28-backups-count-val">
                {snapshot.summary.off_host_backups_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Passed Timed Drills</span>
              <span className="p03-axis-val" data-testid="p28-drills-count-val">
                {snapshot.summary.passed_drills_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Reconciled Discrepancies</span>
              <span className="p03-axis-val" data-testid="p28-reconciled-count-val">
                {snapshot.summary.reconciled_items_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Replayed Operations</span>
              <span className="p03-axis-val" data-testid="p28-replayed-count-val">
                {snapshot.summary.replayed_operations_count}
              </span>
            </div>
          </div>

          {snapshot.recovery_drills.length === 0 ? (
            <p className="p03-muted-copy" data-testid="p28-empty-drills-notice">
              No independent regional restore drills recorded yet. Verify an off-host backup set
              before rehearsing timed recovery targets (4 hours restore / 1 hour loss).
            </p>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p28-feedback-banner"
              aria-live="polite"
            >
              <span
                className={`callout-dot ${lastResult.ok ? 'dot-success' : 'dot-error'}`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {lastResult.code} (HTTP {lastResult.http_status})
                </strong>
                <div>{lastResult.message}</div>
              </div>
            </div>
          ) : null}
        </section>

        {/* TAB 1: Off-Host Backups & Timed Drills */}
        {activeTab === 'drills' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p28-bkp-heading">
              <h2 id="p28-bkp-heading" className="p03-section-title">
                Verify Encrypted Off-Host Backup Set
              </h2>
              <div className="form-group">
                <label htmlFor="p28-bkp-ref" className="form-label">
                  Backup Set Reference
                </label>
                <input
                  id="p28-bkp-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpRefInput}
                  placeholder="BKP-OFFHOST-SG-TO-TYO"
                  onChange={(e) => setBkpRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-bkp-primary" className="form-label">
                  Primary Host Region
                </label>
                <input
                  id="p28-bkp-primary"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpPrimaryInput}
                  placeholder="ap-southeast-1"
                  onChange={(e) => setBkpPrimaryInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-bkp-dest" className="form-label">
                  Independent Destination Location
                </label>
                <input
                  id="p28-bkp-dest"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpDestInput}
                  placeholder="ap-northeast-1"
                  onChange={(e) => setBkpDestInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-bkp-lag" className="form-label">
                  Binlog Copy Lag (seconds, target 300s)
                </label>
                <input
                  id="p28-bkp-lag"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpLagInput}
                  onChange={(e) => setBkpLagInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-bkp-actor" className="form-label">
                  Operator ID
                </label>
                <input
                  id="p28-bkp-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpActorInput}
                  placeholder="701"
                  onChange={(e) => setBkpActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-bkp-at" className="form-label">
                  Verification Time (UTC)
                </label>
                <input
                  id="p28-bkp-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={bkpAtInput}
                  placeholder="2026-11-22T05:05:00Z"
                  onChange={(e) => setBkpAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-register-bkp-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterBackup}
                >
                  Verify Off-Host Backup Set
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p28-drill-heading">
              <h2 id="p28-drill-heading" className="p03-section-title">
                Execute Timed Regional Failure Restore Drill
              </h2>
              <div className="form-group">
                <label htmlFor="p28-drill-ref" className="form-label">
                  Drill Run Reference
                </label>
                <input
                  id="p28-drill-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillRefInput}
                  placeholder="DRILL-LEAD-01"
                  onChange={(e) => setDrillRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-bkp-ref" className="form-label">
                  Verified Backup Reference
                </label>
                <input
                  id="p28-drill-bkp-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillBkpRefInput}
                  placeholder="BKP-OFFHOST-SG-TO-TYO"
                  onChange={(e) => setDrillBkpRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-actor" className="form-label">
                  Executing Operator ID
                </label>
                <input
                  id="p28-drill-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillActorInput}
                  placeholder="701"
                  onChange={(e) => setDrillActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-role" className="form-label">
                  Independent Operator Role
                </label>
                <select
                  id="p28-drill-role"
                  className="form-control"
                  value={drillRoleInput}
                  onChange={(e) => setDrillRoleInput(e.target.value as DrillExecutorRole)}
                >
                  <option value="technical_lead">Technical Lead</option>
                  <option value="named_backup">Named Backup Operator</option>
                </select>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p28-drill-fenced"
                  type="checkbox"
                  checked={drillFencedInput}
                  onChange={(e) => setDrillFencedInput(e.target.checked)}
                />
                <label htmlFor="p28-drill-fenced">Old database writers and cron schedulers fenced</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p28-drill-usable"
                  type="checkbox"
                  checked={drillUsableInput}
                  onChange={(e) => setDrillUsableInput(e.target.checked)}
                />
                <label htmlFor="p28-drill-usable">
                  Restored supporting evidence, signatures, and history usable
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-commit-at" className="form-label">
                  Last Recovered Commit Time (UTC)
                </label>
                <input
                  id="p28-drill-commit-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillCommitAtInput}
                  placeholder="2026-11-22T05:30:00Z"
                  onChange={(e) => setDrillCommitAtInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-fail-at" className="form-label">
                  Failure Start Time (UTC)
                </label>
                <input
                  id="p28-drill-fail-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillFailAtInput}
                  placeholder="2026-11-22T06:00:00Z"
                  onChange={(e) => setDrillFailAtInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-drill-restored-at" className="form-label">
                  Service &amp; Evidence Restored Time (UTC)
                </label>
                <input
                  id="p28-drill-restored-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={drillRestoredAtInput}
                  placeholder="2026-11-22T07:30:00Z"
                  onChange={(e) => setDrillRestoredAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-run-drill-btn"
                  className="btn-batcave-primary"
                  onClick={handleExecuteDrill}
                >
                  Record Timed Recovery Drill
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Uncertain Interval Reconciliation & Reopen Gate */}
        {activeTab === 'reconcile' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p28-unc-heading">
              <h2 id="p28-unc-heading" className="p03-section-title">
                Log Uncertain Failure-Window Discrepancy
              </h2>
              <div className="form-group">
                <label htmlFor="p28-unc-cat" className="form-label">
                  Discrepancy Category
                </label>
                <select
                  id="p28-unc-cat"
                  className="form-control"
                  value={uncCatInput}
                  onChange={(e) => setUncCatInput(e.target.value as UncertainCategory)}
                >
                  <option value="manual_outage_sale">Manual Booth Outage Sale</option>
                  <option value="physical_custody">Physical Stock Custody</option>
                  <option value="issued_document">Issued Form / Receipt</option>
                  <option value="payment_verification">Unsettled Payment Verification</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-src" className="form-label">
                  Source Reference
                </label>
                <input
                  id="p28-unc-src"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={uncSrcInput}
                  placeholder="MAN-OR-2026-0091"
                  onChange={(e) => setUncSrcInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-desc" className="form-label">
                  Uncertain Activity Description
                </label>
                <input
                  id="p28-unc-desc"
                  type="text"
                  className="form-control"
                  value={uncDescInput}
                  placeholder="Offline cash receipt during regional outage"
                  onChange={(e) => setUncDescInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-start" className="form-label">
                  Uncertain Window Start (UTC)
                </label>
                <input
                  id="p28-unc-start"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={uncStartInput}
                  placeholder="2026-11-22T05:30:00Z"
                  onChange={(e) => setUncStartInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-end" className="form-label">
                  Uncertain Window End (UTC)
                </label>
                <input
                  id="p28-unc-end"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={uncEndInput}
                  placeholder="2026-11-22T06:00:00Z"
                  onChange={(e) => setUncEndInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-actor" className="form-label">
                  Reporting Officer ID
                </label>
                <input
                  id="p28-unc-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={uncActorInput}
                  placeholder="401"
                  onChange={(e) => setUncActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-unc-at" className="form-label">
                  Entry Time (UTC)
                </label>
                <input
                  id="p28-unc-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={uncAtInput}
                  placeholder="2026-11-22T07:15:00Z"
                  onChange={(e) => setUncAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-log-unc-btn"
                  className="btn-batcave-primary"
                  onClick={handleLogUncertain}
                >
                  Log Uncertain Interval Item
                </button>
              </div>

              {visibleUncertain.length > 0 ? (
                <div className="p03-queue-list" data-testid="p28-uncertain-list">
                  {visibleUncertain.map((u) => (
                    <div key={u.item_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {u.source_reference} ({u.resolution_status})
                        </strong>
                        <span className="p03-muted-copy">{u.description}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => setRecItemIdInput(u.item_id)}
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p28-rec-heading">
              <h2 id="p28-rec-heading" className="p03-section-title">
                Business Reconciliation &amp; Post-Recovery Reopen Gate
              </h2>
              <div className="form-group">
                <label htmlFor="p28-rec-item-id" className="form-label">
                  Uncertain Item ID
                </label>
                <input
                  id="p28-rec-item-id"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={recItemIdInput}
                  onChange={(e) => setRecItemIdInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-rec-actor" className="form-label">
                  Reconciling Officer ID
                </label>
                <input
                  id="p28-rec-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={recActorInput}
                  placeholder="302"
                  onChange={(e) => setRecActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-rec-role" className="form-label">
                  Reconciler Authorized Duty
                </label>
                <select
                  id="p28-rec-role"
                  className="form-control"
                  value={recRoleInput}
                  onChange={(e) => setRecRoleInput(e.target.value as ReconcilerRole)}
                >
                  <option value="FINANCE">Finance Verifier</option>
                  <option value="INVENTORY">Inventory Custodian</option>
                  <option value="BOOTH_RECONCILER">Independent Booth Reviewer</option>
                  <option value="CHAPTER_HEAD">Chapter Head</option>
                  <option value="TECHNICAL_EXECUTOR">Technical Restore Executor</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p28-rec-ev" className="form-label">
                  Matched Evidence Reference
                </label>
                <input
                  id="p28-rec-ev"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={recEvInput}
                  placeholder="MAN-OR-STUB-0091"
                  onChange={(e) => setRecEvInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-rec-note" className="form-label">
                  Reconciliation Verification Note
                </label>
                <input
                  id="p28-rec-note"
                  type="text"
                  className="form-control"
                  value={recNoteInput}
                  placeholder="Matched physical stub with cash remittance"
                  onChange={(e) => setRecNoteInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-rec-at" className="form-label">
                  Reconciliation Time (UTC)
                </label>
                <input
                  id="p28-rec-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={recAtInput}
                  placeholder="2026-11-22T08:10:00Z"
                  onChange={(e) => setRecAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-reconcile-btn"
                  className="btn-batcave-primary"
                  onClick={handleReconcileUncertain}
                >
                  Verify &amp; Reconcile Item
                </button>
              </div>

              <hr className="p03-divider" />
              <h3 className="p03-section-title">Authorize Service Reopening</h3>
              <div className="form-group">
                <label htmlFor="p28-reopen-peer" className="form-label">
                  Non-Author Peer Technical Reviewer ID
                </label>
                <input
                  id="p28-reopen-peer"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={reopenPeerInput}
                  placeholder="703"
                  onChange={(e) => setReopenPeerInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-reopen-finance" className="form-label">
                  Independent Finance Money Reconciler ID
                </label>
                <input
                  id="p28-reopen-finance"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={reopenFinanceInput}
                  placeholder="302"
                  onChange={(e) => setReopenFinanceInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-reopen-head" className="form-label">
                  Authorizing Chapter Head ID
                </label>
                <input
                  id="p28-reopen-head"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={reopenHeadInput}
                  placeholder="101"
                  onChange={(e) => setReopenHeadInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-reopen-at" className="form-label">
                  Authorization Time (UTC)
                </label>
                <input
                  id="p28-reopen-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={reopenAtInput}
                  placeholder="2026-11-22T08:15:00Z"
                  onChange={(e) => setReopenAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-reopen-btn"
                  className="btn-batcave-primary"
                  onClick={handleAuthorizeReopen}
                >
                  Authorize Post-Recovery Reopening
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Duplicate-Safe Durable Replay */}
        {activeTab === 'replay' ? (
          <section className="p03-card surface-card" aria-labelledby="p28-replay-heading">
            <h2 id="p28-replay-heading" className="p03-section-title">
              Replay Durable Post-Restore Follow-Up Work
            </h2>
            <p className="p03-muted-copy">
              Durable replay verifies whether an operation already committed prior to failure so
              retrying follow-up work never creates duplicate stock movements, cash receipts, or forms.
            </p>
            <div className="form-group">
              <label htmlFor="p28-rep-key" className="form-label">
                Original Operation Key
              </label>
              <input
                id="p28-rep-key"
                type="text"
                className="form-control p03-mono-inline"
                value={repKeyInput}
                placeholder="p13-or-seq-4"
                onChange={(e) => setRepKeyInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p28-rep-target" className="form-label">
                Target Business Record Reference
              </label>
              <input
                id="p28-rep-target"
                type="text"
                className="form-control p03-mono-inline"
                value={repTargetInput}
                placeholder="OR-2026-000018"
                onChange={(e) => setRepTargetInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p28-rep-action" className="form-label">
                Follow-Up Action Description
              </label>
              <input
                id="p28-rep-action"
                type="text"
                className="form-control"
                value={repActionInput}
                placeholder="Regenerate receipt notification snapshot"
                onChange={(e) => setRepActionInput(e.target.value)}
              />
            </div>
            <div className="p03-checkbox-row">
              <input
                id="p28-rep-already"
                type="checkbox"
                checked={repAlreadyInput}
                onChange={(e) => setRepAlreadyInput(e.target.checked)}
              />
              <label htmlFor="p28-rep-already">
                Business posting already committed before failure window
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="p28-rep-actor" className="form-label">
                Operator ID
              </label>
              <input
                id="p28-rep-actor"
                type="text"
                className="form-control p03-mono-inline"
                value={repActorInput}
                placeholder="701"
                onChange={(e) => setRepActorInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p28-rep-at" className="form-label">
                Replay Time (UTC)
              </label>
              <input
                id="p28-rep-at"
                type="text"
                className="form-control p03-mono-inline"
                value={repAtInput}
                placeholder="2026-11-22T07:35:00Z"
                onChange={(e) => setRepAtInput(e.target.value)}
              />
            </div>
            <div className="p03-guard-buttons">
              <button
                type="button"
                id="p28-replay-btn"
                className="btn-batcave-primary"
                onClick={handleReplayFollowUp}
              >
                Replay Durable Follow-Up Safely
              </button>
            </div>
          </section>
        ) : null}

        {/* TAB 4: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p28-audit-heading">
              <h2 id="p28-audit-heading" className="p03-section-title">
                Recovery Drills &amp; Reconciliation Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No recovery or reconciliation events recorded yet.</p>
              ) : (
                <div className="p03-queue-list">
                  {snapshot.history.map((h) => (
                    <div key={h.event_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{h.action}</strong>
                        <span className="p03-muted-copy">{h.reason}</span>
                      </div>
                      <span className="p03-mono-inline">Actor {h.actor_user_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p28-lookup-heading">
              <h2 id="p28-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p28-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p28-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p28-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p28-lookup-ulid-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupUlidInput}
                  placeholder="Operation ULID"
                  onChange={(e) => setLookupUlidInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p28-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p28-lookup-by-ulid-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByUlid}
                >
                  Recover by ID
                </button>
              </div>
              {snapshot.operation_ledger.length > 0 ? (
                <div className="p03-queue-list">
                  {snapshot.operation_ledger.map((op) => (
                    <div key={op.operation_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{op.code}</strong>
                        <span className="p03-mono-inline">
                          {op.operation_id} ({op.idempotency_key})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        data-testid={`p28-ledger-fill-${op.operation_id}`}
                        onClick={() => {
                          setLookupKeyInput(op.idempotency_key);
                          setLookupUlidInput(op.operation_id);
                        }}
                      >
                        Fill Lookup
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {lookupResult ? (
                <div className="callout-banner" data-testid="p28-lookup-result" aria-live="polite">
                  <span className="callout-dot dot-success" aria-hidden="true" />
                  <div>
                    <strong>{lookupResult.code}</strong>
                    <div>{lookupResult.message}</div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
