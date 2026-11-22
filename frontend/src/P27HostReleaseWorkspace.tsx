import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP27HostReleaseEngine } from './p27HostReleaseSlice';
import type { P27ActionResult, P27EngineSnapshot, P27LookupResult } from './p27HostReleaseSlice';

type P27TabId = 'manifest' | 'deploy' | 'scheduler' | 'history';

interface P27HostReleaseWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P27HostReleaseWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P27HostReleaseWorkspaceProps) {
  const engine = useMemo(() => createP27HostReleaseEngine(), []);
  const [snapshot, setSnapshot] = useState<P27EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P27TabId>('manifest');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P27ActionResult | null>(snapshot.last_action);

  // Tab 1: Release Manifest & Maintenance Window
  const [relTagInput, setRelTagInput] = useState('');
  const [relFeHashInput, setRelFeHashInput] = useState('');
  const [relBeDigestInput, setRelBeDigestInput] = useState('');
  const [relSchemaInput, setRelSchemaInput] = useState('');
  const [relPrivateDbInput, setRelPrivateDbInput] = useState(true);
  const [relSecretsCleanInput, setRelSecretsCleanInput] = useState(true);
  const [relBoundedInput, setRelBoundedInput] = useState(true);
  const [relActorInput, setRelActorInput] = useState('');
  const [relAtInput, setRelAtInput] = useState('');

  const [maintRefInput, setMaintRefInput] = useState('');
  const [maintLeadInput, setMaintLeadInput] = useState('');
  const [maintOutsideBoothInput, setMaintOutsideBoothInput] = useState(true);
  const [maintBackupOkInput, setMaintBackupOkInput] = useState(true);
  const [maintTxDrainedInput, setMaintTxDrainedInput] = useState(true);
  const [maintAffectedInput, setMaintAffectedInput] = useState('');
  const [maintStartedInput, setMaintStartedInput] = useState('');
  const [maintNextInput, setMaintNextInput] = useState('');

  // Tab 2: Deployment & Guard Checks
  const [depTagInput, setDepTagInput] = useState('');
  const [depActorInput, setDepActorInput] = useState('');
  const [depSimFailInput, setDepSimFailInput] = useState(false);
  const [depIncompatSchemaInput, setDepIncompatSchemaInput] = useState(false);
  const [depMigOnceInput, setDepMigOnceInput] = useState(true);
  const [depHealthOkInput, setDepHealthOkInput] = useState(true);
  const [depQueuesOkInput, setDepQueuesOkInput] = useState(true);
  const [depBalancesOkInput, setDepBalancesOkInput] = useState(true);
  const [depAtInput, setDepAtInput] = useState('');

  // Tab 3: Singleton Scheduler & Telemetry
  const [schedIdInput, setSchedIdInput] = useState('');
  const [schedTtlInput, setSchedTtlInput] = useState('60');
  const [schedAtInput, setSchedAtInput] = useState('');

  const [telActorInput, setTelActorInput] = useState('');
  const [telOfficersInput, setTelOfficersInput] = useState('');
  const [telJobsInput, setTelJobsInput] = useState('');
  const [telMemInput, setTelMemInput] = useState('');
  const [telCpuInput, setTelCpuInput] = useState('');
  const [telLatInput, setTelLatInput] = useState('');
  const [telLagInput, setTelLagInput] = useState('');
  const [telCreditInput, setTelCreditInput] = useState('');
  const [telReserveInput, setTelReserveInput] = useState('');
  const [telAtInput, setTelAtInput] = useState('');

  // Tab 4: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P27ActionResult<P27LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P27ActionResult<T>): P27ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  function handleRegisterManifest() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerReleaseManifest({
        release_tag: relTagInput,
        frontend_build_hash: relFeHashInput,
        backend_image_digest: relBeDigestInput,
        schema_version: relSchemaInput,
        mysql_private_network_only: relPrivateDbInput,
        secrets_outside_git_and_bundle: relSecretsCleanInput,
        single_worker_bounded: relBoundedInput,
        actor_user_id: relActorInput,
        registered_at: relAtInput,
        idempotency_key: nextSequentialKey('p27-rel'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      if (!depTagInput.trim()) setDepTagInput(relTagInput.trim());
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleStartMaintenance() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.startMaintenanceAndFenceWrites({
        maintenance_ref: maintRefInput,
        lead_user_id: maintLeadInput,
        outside_booth_trading: maintOutsideBoothInput,
        backup_validated: maintBackupOkInput,
        active_tx_drained: maintTxDrainedInput,
        affected_operations: maintAffectedInput,
        started_at: maintStartedInput,
        next_update_at: maintNextInput,
        idempotency_key: nextSequentialKey('p27-maint'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleDeployRelease() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.executeReleaseDeployment({
        release_tag: depTagInput,
        actor_user_id: depActorInput,
        simulate_migration_or_health_failure: depSimFailInput,
        incompatible_schema_applied: depIncompatSchemaInput,
        migration_applied_once: depMigOnceInput,
        health_ok: depHealthOkInput,
        queues_ok: depQueuesOkInput,
        balances_checked: depBalancesOkInput,
        executed_at: depAtInput,
        idempotency_key: nextSequentialKey('p27-dep'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleTestLockAction(action: 'business_write' | 'rollback_old_image') {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.attemptUnsafeRollbackOrWriteDuringLock({
        action,
        actor_user_id: depActorInput || '101',
        attempted_at: depAtInput || '2026-11-22T03:11:00Z',
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAcquireScheduler() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.acquireSingletonSchedulerLease({
        scheduler_instance_id: schedIdInput,
        ttl_seconds: schedTtlInput,
        acquired_at: schedAtInput,
        idempotency_key: nextSequentialKey('p27-sched'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordTelemetry() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordLoadAndFundingTelemetry({
        actor_user_id: telActorInput,
        concurrent_officers: telOfficersInput,
        pdf_jobs_active: telJobsInput,
        memory_pct: telMemInput,
        cpu_pct: telCpuInput,
        p95_latency_ms: telLatInput,
        backup_lag_seconds: telLagInput,
        credit_remaining_usd: telCreditInput,
        reserve_floor_usd: telReserveInput,
        sampled_at: telAtInput,
        idempotency_key: nextSequentialKey('p27-tel'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupHostReleaseOperation({
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
      engine.lookupHostReleaseOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleManifests = snapshot.release_candidates.filter(
    (r) =>
      !normalizedSearch ||
      r.release_tag.toLowerCase().includes(normalizedSearch) ||
      r.schema_version.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p27-workspace">
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
                id="p27-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search release tags or schema versions"
                aria-label="Search release candidates"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Reproducible Host Releases, Maintenance Fencing &amp; Operating Controls
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Host release control tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p27-tab-manifest"
                  aria-selected={activeTab === 'manifest'}
                  className={`p03-filter-pill ${activeTab === 'manifest' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('manifest');
                  }}
                >
                  Release Manifests &amp; Maintenance
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p27-tab-deploy"
                  aria-selected={activeTab === 'deploy'}
                  className={`p03-filter-pill ${activeTab === 'deploy' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('deploy');
                  }}
                >
                  Deployment &amp; Guard Locks
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p27-tab-scheduler"
                  aria-selected={activeTab === 'scheduler'}
                  className={`p03-filter-pill ${activeTab === 'scheduler' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('scheduler');
                  }}
                >
                  Singleton Scheduler &amp; Telemetry
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p27-tab-history"
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
                id="p27-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p27-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p27-overview-heading" className="p03-section-title">
              Single-Host Release &amp; Fence Status — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Active Release:{' '}
                <strong data-testid="p27-current-rel-val">
                  {snapshot.current_release_tag || 'none deployed'}
                </strong>
              </span>
              <span className="p03-version-pill">
                Triggers:{' '}
                <strong data-testid="p27-triggers-count-val">
                  {snapshot.summary.last_review_triggers_count}
                </strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Service Mode</span>
              <span className="p03-axis-val" data-testid="p27-service-mode-val">
                {snapshot.summary.service_mode}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Write Postings Blocked</span>
              <span className="p03-axis-val" data-testid="p27-writes-blocked-val">
                {String(snapshot.summary.write_postings_blocked)}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Scheduler Lease</span>
              <span className="p03-axis-val" data-testid="p27-scheduler-val">
                {snapshot.summary.active_scheduler_id ?? 'none'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Pinned Manifests</span>
              <span className="p03-axis-val" data-testid="p27-manifests-count-val">
                {snapshot.summary.manifests_count}
              </span>
            </div>
          </div>

          {snapshot.release_candidates.length === 0 ? (
            <p className="p03-muted-copy" data-testid="p27-empty-manifests-notice">
              No release candidates or maintenance windows registered yet. Pin a verified host
              manifest to prepare a controlled release.
            </p>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p27-feedback-banner"
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

        {/* TAB 1: Release Manifests & Maintenance Window */}
        {activeTab === 'manifest' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p27-rel-heading">
              <h2 id="p27-rel-heading" className="p03-section-title">
                Pin Reproducible Release Manifest
              </h2>
              <div className="form-group">
                <label htmlFor="p27-rel-tag" className="form-label">
                  Release Tag
                </label>
                <input
                  id="p27-rel-tag"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relTagInput}
                  placeholder="v1.6.1"
                  onChange={(e) => setRelTagInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-rel-fe-hash" className="form-label">
                  Built Frontend Artifact Hash
                </label>
                <input
                  id="p27-rel-fe-hash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relFeHashInput}
                  placeholder="sha256-fe-161"
                  onChange={(e) => setRelFeHashInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-rel-be-digest" className="form-label">
                  Immutable Backend Container Digest
                </label>
                <input
                  id="p27-rel-be-digest"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relBeDigestInput}
                  placeholder="sha256-be-161"
                  onChange={(e) => setRelBeDigestInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-rel-schema" className="form-label">
                  Target Schema Migration Version
                </label>
                <input
                  id="p27-rel-schema"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relSchemaInput}
                  placeholder="2026_11_22_0016"
                  onChange={(e) => setRelSchemaInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-rel-private-db"
                  type="checkbox"
                  checked={relPrivateDbInput}
                  onChange={(e) => setRelPrivateDbInput(e.target.checked)}
                />
                <label htmlFor="p27-rel-private-db">
                  Database restricted to internal private network (no public port)
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-rel-secrets-clean"
                  type="checkbox"
                  checked={relSecretsCleanInput}
                  onChange={(e) => setRelSecretsCleanInput(e.target.checked)}
                />
                <label htmlFor="p27-rel-secrets-clean">
                  Secrets excluded from Git, images, logs, and browser bundle
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-rel-bounded-worker"
                  type="checkbox"
                  checked={relBoundedInput}
                  onChange={(e) => setRelBoundedInput(e.target.checked)}
                />
                <label htmlFor="p27-rel-bounded-worker">
                  Single-host 4 GB Compose memory and restart limits configured
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p27-rel-actor" className="form-label">
                  Technical Lead ID
                </label>
                <input
                  id="p27-rel-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relActorInput}
                  placeholder="101"
                  onChange={(e) => setRelActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-rel-at" className="form-label">
                  Registration Time (UTC)
                </label>
                <input
                  id="p27-rel-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={relAtInput}
                  placeholder="2026-11-22T01:05:00Z"
                  onChange={(e) => setRelAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-register-rel-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterManifest}
                >
                  Register Release Manifest
                </button>
              </div>

              {visibleManifests.length > 0 ? (
                <div className="p03-queue-list" data-testid="p27-manifests-list">
                  {visibleManifests.map((m) => (
                    <div key={m.release_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{m.release_tag}</strong>
                        <span className="p03-muted-copy">
                          Schema {m.schema_version} | FE {m.frontend_build_hash}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => setDepTagInput(m.release_tag)}
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p27-maint-heading">
              <h2 id="p27-maint-heading" className="p03-section-title">
                Announce Maintenance &amp; Fence New Writes
              </h2>
              <div className="form-group">
                <label htmlFor="p27-maint-ref" className="form-label">
                  Maintenance Window Reference
                </label>
                <input
                  id="p27-maint-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={maintRefInput}
                  placeholder="MAINT-2026-11-B"
                  onChange={(e) => setMaintRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-maint-lead" className="form-label">
                  Technical Lead ID
                </label>
                <input
                  id="p27-maint-lead"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={maintLeadInput}
                  placeholder="101"
                  onChange={(e) => setMaintLeadInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-maint-outside-booth"
                  type="checkbox"
                  checked={maintOutsideBoothInput}
                  onChange={(e) => setMaintOutsideBoothInput(e.target.checked)}
                />
                <label htmlFor="p27-maint-outside-booth">
                  Scheduled outside active event booth trading hours
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-maint-backup-ok"
                  type="checkbox"
                  checked={maintBackupOkInput}
                  onChange={(e) => setMaintBackupOkInput(e.target.checked)}
                />
                <label htmlFor="p27-maint-backup-ok">
                  Pre-deployment backup validated on independent destination
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-maint-tx-drained"
                  type="checkbox"
                  checked={maintTxDrainedInput}
                  onChange={(e) => setMaintTxDrainedInput(e.target.checked)}
                />
                <label htmlFor="p27-maint-tx-drained">
                  In-flight transactions drained and queue worker paused
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p27-maint-affected" className="form-label">
                  Affected Operations Notice
                </label>
                <input
                  id="p27-maint-affected"
                  type="text"
                  className="form-control"
                  value={maintAffectedInput}
                  placeholder="All chapter stock and payment postings"
                  onChange={(e) => setMaintAffectedInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-maint-started" className="form-label">
                  Window Start Time (UTC)
                </label>
                <input
                  id="p27-maint-started"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={maintStartedInput}
                  placeholder="2026-11-22T02:05:00Z"
                  onChange={(e) => setMaintStartedInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-maint-next" className="form-label">
                  Next Status Update Time (UTC)
                </label>
                <input
                  id="p27-maint-next"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={maintNextInput}
                  placeholder="2026-11-22T02:35:00Z"
                  onChange={(e) => setMaintNextInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-start-maint-btn"
                  className="btn-batcave-primary"
                  onClick={handleStartMaintenance}
                >
                  Enter Maintenance Fence
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Deployment & Guard Locks */}
        {activeTab === 'deploy' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p27-dep-heading">
              <h2 id="p27-dep-heading" className="p03-section-title">
                Execute Migration &amp; Release Activation
              </h2>
              <div className="form-group">
                <label htmlFor="p27-dep-tag" className="form-label">
                  Manifest Release Tag
                </label>
                <input
                  id="p27-dep-tag"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={depTagInput}
                  placeholder="v1.6.1"
                  onChange={(e) => setDepTagInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-dep-actor" className="form-label">
                  Deploying Lead ID
                </label>
                <input
                  id="p27-dep-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={depActorInput}
                  placeholder="101"
                  onChange={(e) => setDepActorInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-sim-fail"
                  type="checkbox"
                  checked={depSimFailInput}
                  onChange={(e) => setDepSimFailInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-sim-fail">
                  Simulate migration or health verification failure
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-incompat-schema"
                  type="checkbox"
                  checked={depIncompatSchemaInput}
                  onChange={(e) => setDepIncompatSchemaInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-incompat-schema">
                  Incompatible schema migration already applied (disallow old image)
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-mig-once"
                  type="checkbox"
                  checked={depMigOnceInput}
                  onChange={(e) => setDepMigOnceInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-mig-once">Migrations ran once cleanly</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-health-ok"
                  type="checkbox"
                  checked={depHealthOkInput}
                  onChange={(e) => setDepHealthOkInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-health-ok">Service &amp; database health check OK</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-queues-ok"
                  type="checkbox"
                  checked={depQueuesOkInput}
                  onChange={(e) => setDepQueuesOkInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-queues-ok">Queue workers restarted and healthy</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p27-dep-balances-ok"
                  type="checkbox"
                  checked={depBalancesOkInput}
                  onChange={(e) => setDepBalancesOkInput(e.target.checked)}
                />
                <label htmlFor="p27-dep-balances-ok">
                  Representative stock &amp; payment balances verified
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p27-dep-at" className="form-label">
                  Execution Time (UTC)
                </label>
                <input
                  id="p27-dep-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={depAtInput}
                  placeholder="2026-11-22T03:10:00Z"
                  onChange={(e) => setDepAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-deploy-btn"
                  className="btn-batcave-primary"
                  onClick={handleDeployRelease}
                >
                  Execute Release Deployment
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p27-lock-heading">
              <h2 id="p27-lock-heading" className="p03-section-title">
                Failed Release Safety &amp; Explicit Block Verification
              </h2>
              <p className="p03-muted-copy">
                Verify that writes are explicitly blocked during maintenance or failed releases and
                that incompatible old containers cannot be restarted after a schema change.
              </p>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-test-blocked-write-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleTestLockAction('business_write')}
                >
                  Attempt Posting During Fence
                </button>
                <button
                  type="button"
                  id="p27-test-unsafe-rollback-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleTestLockAction('rollback_old_image')}
                >
                  Attempt Unsafe Old-Image Rollback
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Singleton Scheduler & Telemetry */}
        {activeTab === 'scheduler' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p27-sched-heading">
              <h2 id="p27-sched-heading" className="p03-section-title">
                Singleton Scheduler Lock Control
              </h2>
              <div className="form-group">
                <label htmlFor="p27-sched-id" className="form-label">
                  Scheduler Instance ID
                </label>
                <input
                  id="p27-sched-id"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={schedIdInput}
                  placeholder="sched-node-alpha"
                  onChange={(e) => setSchedIdInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-sched-ttl" className="form-label">
                  Lease TTL (seconds)
                </label>
                <input
                  id="p27-sched-ttl"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={schedTtlInput}
                  onChange={(e) => setSchedTtlInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-sched-at" className="form-label">
                  Lease Timestamp (UTC)
                </label>
                <input
                  id="p27-sched-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={schedAtInput}
                  placeholder="2026-11-22T04:00:00Z"
                  onChange={(e) => setSchedAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-acquire-sched-btn"
                  className="btn-batcave-primary"
                  onClick={handleAcquireScheduler}
                >
                  Acquire Singleton Scheduler Lock
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p27-tel-heading">
              <h2 id="p27-tel-heading" className="p03-section-title">
                Four-User Load &amp; Funding Reserve Telemetry
              </h2>
              <div className="form-group">
                <label htmlFor="p27-tel-actor" className="form-label">
                  Operator ID
                </label>
                <input
                  id="p27-tel-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telActorInput}
                  placeholder="101"
                  onChange={(e) => setTelActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-officers" className="form-label">
                  Concurrent Officers
                </label>
                <input
                  id="p27-tel-officers"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telOfficersInput}
                  placeholder="4"
                  onChange={(e) => setTelOfficersInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-jobs" className="form-label">
                  Active Background PDF / Export Jobs
                </label>
                <input
                  id="p27-tel-jobs"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telJobsInput}
                  placeholder="3"
                  onChange={(e) => setTelJobsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-mem" className="form-label">
                  Host Memory Utilization (%)
                </label>
                <input
                  id="p27-tel-mem"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telMemInput}
                  placeholder="84"
                  onChange={(e) => setTelMemInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-cpu" className="form-label">
                  Host CPU Utilization (%)
                </label>
                <input
                  id="p27-tel-cpu"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telCpuInput}
                  placeholder="76"
                  onChange={(e) => setTelCpuInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-lat" className="form-label">
                  Interactive P95 Latency (ms)
                </label>
                <input
                  id="p27-tel-lat"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telLatInput}
                  placeholder="2450"
                  onChange={(e) => setTelLatInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-lag" className="form-label">
                  Off-Host Binlog Backup Lag (sec)
                </label>
                <input
                  id="p27-tel-lag"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telLagInput}
                  placeholder="180"
                  onChange={(e) => setTelLagInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-credit" className="form-label">
                  Remaining Cloud Credit (USD)
                </label>
                <input
                  id="p27-tel-credit"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telCreditInput}
                  placeholder="19.50"
                  onChange={(e) => setTelCreditInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-reserve" className="form-label">
                  Credit Reserve Threshold (USD)
                </label>
                <input
                  id="p27-tel-reserve"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telReserveInput}
                  placeholder="20.00"
                  onChange={(e) => setTelReserveInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-tel-at" className="form-label">
                  Sample Time (UTC)
                </label>
                <input
                  id="p27-tel-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={telAtInput}
                  placeholder="2026-11-22T04:10:00Z"
                  onChange={(e) => setTelAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p27-record-tel-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordTelemetry}
                >
                  Record Load &amp; Reserve Sample
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p27-audit-heading">
              <h2 id="p27-audit-heading" className="p03-section-title">
                Host Operations &amp; Release Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No release or telemetry events recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p27-lookup-heading">
              <h2 id="p27-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p27-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p27-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p27-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p27-lookup-ulid-input"
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
                  id="p27-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p27-lookup-by-ulid-btn"
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
                        data-testid={`p27-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p27-lookup-result" aria-live="polite">
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
