import { useMemo, useState } from 'react';
import type { ResolvedVerifiedSession } from './LoginPage';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import {
  createS02DashboardEngine,
  DASHBOARD_WORKSTATION_GROUPS,
  evaluateQueueAuthority,
  formatPhpCurrency,
  workstationMatchesOfficerDuties,
} from './s02DashboardSlice';
import type {
  DashboardQueueItem,
  DashboardRouteTarget,
  QueueBucket,
  S02ActionResult,
  S02EngineSnapshot,
  S02LookupResult,
  SubscriptionPhase,
  WorkstationGroupId,
} from './s02DashboardSlice';

interface S02OfficerDashboardProps {
  dashboardSession: ResolvedVerifiedSession | undefined;
  soundEnabled: boolean;
  isSigningOut: boolean;
  onOpenRoute: (route: DashboardRouteTarget) => void;
  onSignOut: () => void;
  onNotify: (tone: 'info' | 'success' | 'warning' | 'error', text: string) => void;
}

const ALL_WORKSTATIONS = DASHBOARD_WORKSTATION_GROUPS.flatMap((group) => group.items);

function subscriptionBadgeText(phase: SubscriptionPhase, daysRemaining: string): string {
  switch (phase) {
    case 'not_activated':
      return 'Trial Not Activated';
    case 'trial_active':
      return `30-Day Trial Active (${daysRemaining}d remaining)`;
    case 'grace_read_export':
      return `14-Day Read & Export Grace (${daysRemaining}d remaining)`;
    case 'post_grace_suspended':
      return 'Subscription Lapsed — Exports Suspended';
    case 'paid_active':
      return `Paid Subscription Active (${daysRemaining}d remaining)`;
  }
}

export function S02OfficerDashboard({
  dashboardSession,
  soundEnabled,
  isSigningOut,
  onOpenRoute,
  onSignOut,
  onNotify,
}: S02OfficerDashboardProps) {
  const engine = useMemo(() => createS02DashboardEngine(), []);
  const [snapshot, setSnapshot] = useState<S02EngineSnapshot>(() => engine.getSnapshot());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBucket, setActiveBucket] = useState<QueueBucket>('needs_my_action');
  const [activeDomain, setActiveDomain] = useState<'all' | WorkstationGroupId>('all');
  const [filterByMyDuties, setFilterByMyDuties] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<S02ActionResult | null>(snapshot.last_action);

  // Enqueue Work Item form state (strictly unseeded)
  const [qBucket, setQBucket] = useState<QueueBucket>('needs_my_action');
  const [qRef, setQRef] = useState('');
  const [qTitle, setQTitle] = useState('');
  const [qCategory, setQCategory] = useState('');
  const [qDuty, setQDuty] = useState('');
  const [qTargetRoute, setQTargetRoute] = useState<DashboardRouteTarget>('p07-requisitions');
  const [qDueUtc, setQDueUtc] = useState('');
  const [qUrgencyRank, setQUrgencyRank] = useState('');
  const [qPreparerId, setQPreparerId] = useState('');
  const [qSummary, setQSummary] = useState('');
  const [qUncertain, setQUncertain] = useState(false);
  const [qOverdue, setQOverdue] = useState(false);
  const [qIndependentApproval, setQIndependentApproval] = useState(false);

  // Operational Pulse form state (strictly unseeded)
  const [pulseUsable, setPulseUsable] = useState('');
  const [pulseAvailable, setPulseAvailable] = useState('');
  const [pulseClocks, setPulseClocks] = useState('');
  const [pulsePaymentsCount, setPulsePaymentsCount] = useState('');
  const [pulseCashTotal, setPulseCashTotal] = useState('');
  const [pulseBoothUnits, setPulseBoothUnits] = useState('');
  const [pulseRopAlerts, setPulseRopAlerts] = useState('');

  // Chapter Lifecycle & Maintenance Fence form state (strictly unseeded)
  const [lifePhase, setLifePhase] = useState<SubscriptionPhase>('not_activated');
  const [lifeDays, setLifeDays] = useState('');
  const [lifeFenced, setLifeFenced] = useState(false);
  const [lifeNotice, setLifeNotice] = useState('');

  // Lookup state
  const [lookupKey, setLookupKey] = useState('');
  const [lookupResult, setLookupResult] = useState<S02ActionResult<S02LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: S02ActionResult<T>): S02ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeOfficerName = dashboardSession?.userName ?? 'Verified Officer';
  const rawDutiesText = dashboardSession?.grantedDuties ?? '';
  const activeDutiesList = useMemo(() => {
    const trimmed = rawDutiesText.trim();
    if (trimmed === '' || trimmed === 'Chapter Operations' || trimmed === '—') {
      return [];
    }
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }, [rawDutiesText]);

  function handleRecordPrefixJump() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(engine.resolveRecordPrefixJump(searchQuery));
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      onNotify('success', res.message);
      onOpenRoute(res.data.route);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleEnqueueWorkItem() {
    playClickPen(soundEnabled);
    const parsedRank = qUrgencyRank.trim() === '' ? 1 : Number(qUrgencyRank.trim());
    const res = refreshSnapshot(
      engine.enqueueWorkItem({
        bucket: qBucket,
        record_reference: qRef,
        title: qTitle,
        summary: qSummary,
        category: qCategory,
        responsible_duty: qDuty,
        target_route: qTargetRoute,
        due_at_utc: qDueUtc,
        is_uncertain_outcome: qUncertain,
        is_overdue: qOverdue,
        urgency_rank: parsedRank,
        preparer_actor_id: qPreparerId,
        requires_independent_approval: qIndependentApproval,
        idempotency_key: nextSequentialKey('s02-queue'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setActiveBucket(qBucket);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleInspectItem(item: DashboardQueueItem) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.inspectWorkItem({
        queue_item_id: item.queue_item_id,
        inspected_at_utc: new Date().toISOString(),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'info' : 'error', res.message);
  }

  function handleUpdatePulse() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.updateOperationalPulse({
        usable_on_hand: pulseUsable,
        available_to_allocate: pulseAvailable,
        active_clocks_48h: pulseClocks,
        unverified_payments_count: pulsePaymentsCount,
        unverified_cash_total: pulseCashTotal,
        booth_custody_units: pulseBoothUnits,
        critical_rop_alerts: pulseRopAlerts,
        idempotency_key: nextSequentialKey('s02-pulse'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleUpdateLifecycle() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.updateChapterLifecycle({
        subscription_phase: lifePhase,
        days_remaining: lifeDays,
        maintenance_fenced: lifeFenced,
        maintenance_notice: lifeNotice,
        idempotency_key: nextSequentialKey('s02-lifecycle'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupOperation() {
    playClickPen(soundEnabled);
    const res = engine.lookupOperation(lookupKey);
    setLookupResult(res);
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    onNotify(res.ok ? 'success' : 'warning', res.message);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const bucketCounts = {
    needs_my_action: snapshot.queue_items.filter((i) => i.bucket === 'needs_my_action').length,
    waiting_on_others: snapshot.queue_items.filter((i) => i.bucket === 'waiting_on_others').length,
    resolved_history: snapshot.queue_items.filter((i) => i.bucket === 'resolved_history').length,
  };

  const visibleQueueItems = snapshot.queue_items.filter((item) => {
    if (item.bucket !== activeBucket) return false;
    if (normalizedQuery === '') return true;
    return (
      item.record_reference.toLowerCase().includes(normalizedQuery) ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.summary.toLowerCase().includes(normalizedQuery) ||
      item.responsible_duty.toLowerCase().includes(normalizedQuery)
    );
  });

  const visibleGroups = DASHBOARD_WORKSTATION_GROUPS.filter((group) =>
    activeDomain === 'all' ? true : group.id === activeDomain
  )
    .map((group) => {
      const filteredItems = group.items.filter((entry) => {
        if (filterByMyDuties && !workstationMatchesOfficerDuties(entry, activeDutiesList)) {
          return false;
        }
        if (normalizedQuery === '') return true;
        return (
          entry.title.toLowerCase().includes(normalizedQuery) ||
          entry.description.toLowerCase().includes(normalizedQuery) ||
          entry.stageLabel.toLowerCase().includes(normalizedQuery) ||
          entry.keywords.some((kw) => kw.includes(normalizedQuery))
        );
      });
      return {
        ...group,
        items: filteredItems,
      };
    })
    .filter((group) => group.items.length > 0);

  const lifecycle = snapshot.chapter_lifecycle;
  const pulse = snapshot.operational_pulse;

  return (
    <main className="p03-workspace-shell" data-testid="s02-dashboard-workspace">
      <div className="p03-workspace-inner">
        {/* Command Header & Fast Record Jump */}
        <header className="p03-top-header surface-card" aria-labelledby="my-work-heading">
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
                id="s02-command-search"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim() !== '') {
                    e.preventDefault();
                    handleRecordPrefixJump();
                  }
                }}
                placeholder="Search workstations or jump to record (e.g. RF-2026-001, SO-2026-002, OR-2026-088)"
                aria-label="Search workstations or jump to record reference"
              />
            </div>

            <div className="p03-search-meta">
              <button
                type="button"
                id="s02-record-jump-btn"
                className="btn-batcave-primary p03-shrink-btn"
                onClick={handleRecordPrefixJump}
              >
                Jump to Record
              </button>
              {searchQuery.trim() !== '' ? (
                <button
                  type="button"
                  id="s02-clear-search-btn"
                  className="btn-batcave-secondary p03-shrink-btn"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setSearchQuery('');
                  }}
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                id="s02-sign-out-btn"
                disabled={isSigningOut}
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={() => {
                  playClickPen(soundEnabled);
                  onSignOut();
                }}
              >
                <span>{isSigningOut ? 'Signing out...' : 'Sign out & Return to Login'}</span>
              </button>
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <div>
                <h1 id="my-work-heading" className="p03-main-title">
                  My Work — Chapter Workspace
                </h1>
                <p className="p03-muted-copy">
                  Signed in as{' '}
                  <span className="kamunggay-verified-name-slot" style={{ fontWeight: 600 }}>
                    {activeOfficerName}
                  </span>{' '}
                  • Officer queue ordered with uncertain outcomes first, deadlines second, and
                  strict independence enforcement.
                </p>
              </div>
            </div>

            <div className="p03-header-controls">
              <span className="p03-version-pill" data-testid="s02-subscription-pill">
                {subscriptionBadgeText(lifecycle.subscription_phase, lifecycle.days_remaining)}
              </span>
              <span
                className={`p03-attention-badge ${lifecycle.maintenance_fenced ? 'is-serious-attention' : ''}`}
                data-testid="s02-host-status-pill"
              >
                {lifecycle.maintenance_fenced ? 'Maintenance Write Fence Active' : 'Normal Operations'}
              </span>
            </div>
          </div>

          <div className="s02-session-grid" aria-label="Officer Session Context">
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Chapter</span>
              <span className="p03-axis-val slot-chapter">
                {dashboardSession?.activeChapter ?? 'Assigned Chapter'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Granted Duties</span>
              <span className="p03-axis-val slot-duties">
                {dashboardSession?.grantedDuties ?? 'Chapter Operations'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Governance Constraints</span>
              <span className="p03-axis-val slot-constraints">
                {dashboardSession?.governanceConstraints ?? 'Standard chapter governance rules apply'}
              </span>
            </div>
          </div>

          {lifecycle.maintenance_fenced ? (
            <div
              className="callout-banner is-error"
              data-testid="s02-maintenance-banner"
              role="status"
            >
              <span className="callout-dot dot-error" aria-hidden="true" />
              <div>
                <strong>Planned Maintenance Write Fence Active</strong>
                <div>{lifecycle.maintenance_notice}</div>
              </div>
            </div>
          ) : null}

          {lifecycle.subscription_phase === 'grace_read_export' ||
          lifecycle.subscription_phase === 'post_grace_suspended' ? (
            <div
              className={`callout-banner ${
                lifecycle.subscription_phase === 'post_grace_suspended' ? 'is-error' : 'is-warning'
              }`}
              data-testid="s02-lifecycle-banner"
              role="status"
            >
              <span
                className={`callout-dot ${
                  lifecycle.subscription_phase === 'post_grace_suspended'
                    ? 'dot-error'
                    : 'dot-warning'
                }`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {lifecycle.subscription_phase === 'grace_read_export'
                    ? `14-Day Read & Export Grace Active (${lifecycle.days_remaining}d left)`
                    : 'Post-Grace Subscription Lapsed'}
                </strong>
                <div>
                  {lifecycle.subscription_phase === 'grace_read_export'
                    ? 'New officer business postings and queued jobs are fenced. Scoped read and CSV/PDF export remain enabled along with essential security, backup, and reconciliation controls.'
                    : 'Commercial post-grace terms apply. Scoped read/export is suspended while financial and stock history preservation remains enforced.'}
                </div>
              </div>
            </div>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="s02-feedback-banner"
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
        </header>

        {/* Section 1: Operational Pulse & Telemetry */}
        <section className="p03-card surface-card" aria-labelledby="s02-pulse-heading">
          <div className="p03-card-header-row">
            <div>
              <span className="p03-eyebrow">Live Chapter Health</span>
              <h2 id="s02-pulse-heading" className="p03-section-title">
                At-a-Glance Operational Pulse
              </h2>
            </div>
            <button
              type="button"
              id="s02-toggle-controls-btn"
              className="btn-batcave-secondary p03-shrink-btn"
              aria-expanded={controlsOpen}
              onClick={() => {
                playClickPen(soundEnabled);
                setControlsOpen((prev) => !prev);
              }}
            >
              {controlsOpen ? 'Hide Telemetry & Queue Controls' : 'Record Live Telemetry & Queue Items'}
            </button>
          </div>

          <div className="s02-kpi-grid">
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="s02-kpi-usable">
                {pulse.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val" data-testid="s02-kpi-available">
                {pulse.available_to_allocate}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active 48h Clocks</span>
              <span className="p03-axis-val" data-testid="s02-kpi-clocks">
                {pulse.active_clocks_48h}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Unverified Cash &amp; Slips</span>
              <span className="p03-axis-val" data-testid="s02-kpi-cash">
                {formatPhpCurrency(pulse.unverified_cash_total)} ({pulse.unverified_payments_count}{' '}
                slips)
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Booth Custody &amp; ROP Alerts</span>
              <span className="p03-axis-val" data-testid="s02-kpi-booth-rop">
                {pulse.booth_custody_units} units / {pulse.critical_rop_alerts} ROP
              </span>
            </div>
          </div>

          {controlsOpen ? (
            <div className="s02-controls-drawer" data-testid="s02-controls-drawer">
              <div className="p03-grid">
                {/* Control Card A: Enqueue Work Queue Alert */}
                <div className="p04-line-card">
                  <h3 className="p03-section-title" style={{ fontSize: '1rem' }}>
                    Enqueue Scoped Work Item
                  </h3>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="s02-q-bucket" className="form-label">
                        Queue Bucket
                      </label>
                      <select
                        id="s02-q-bucket"
                        className="form-control"
                        value={qBucket}
                        onChange={(e) => setQBucket(e.target.value as QueueBucket)}
                      >
                        <option value="needs_my_action">Needs My Action</option>
                        <option value="waiting_on_others">Waiting on Others</option>
                        <option value="resolved_history">Resolved &amp; History</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="s02-q-ref" className="form-label">
                        Record Reference
                      </label>
                      <input
                        id="s02-q-ref"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={qRef}
                        placeholder="RF-2026-001"
                        onChange={(e) => setQRef(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="s02-q-title" className="form-label">
                        Task Title
                      </label>
                      <input
                        id="s02-q-title"
                        type="text"
                        className="form-control"
                        value={qTitle}
                        placeholder="Review Internal Requisition"
                        onChange={(e) => setQTitle(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="s02-q-duty" className="form-label">
                        Responsible Duty
                      </label>
                      <input
                        id="s02-q-duty"
                        type="text"
                        className="form-control"
                        value={qDuty}
                        placeholder="Finance Officer"
                        onChange={(e) => setQDuty(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="s02-q-route" className="form-label">
                        Target Workspace
                      </label>
                      <select
                        id="s02-q-route"
                        className="form-control"
                        value={qTargetRoute}
                        onChange={(e) => setQTargetRoute(e.target.value as DashboardRouteTarget)}
                      >
                        {ALL_WORKSTATIONS.map((ws) => (
                          <option key={ws.route} value={ws.route}>
                            {ws.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="s02-q-due" className="form-label">
                        Due At (UTC ISO)
                      </label>
                      <input
                        id="s02-q-due"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={qDueUtc}
                        placeholder="2026-11-23T12:00:00Z"
                        onChange={(e) => setQDueUtc(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="s02-q-rank" className="form-label">
                        Urgency Rank (1 = Highest)
                      </label>
                      <input
                        id="s02-q-rank"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={qUrgencyRank}
                        placeholder="1"
                        onChange={(e) => setQUrgencyRank(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="s02-q-preparer" className="form-label">
                        Preparer Actor Name
                      </label>
                      <input
                        id="s02-q-preparer"
                        type="text"
                        className="form-control"
                        value={qPreparerId}
                        placeholder="Verified Officer"
                        onChange={(e) => setQPreparerId(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="s02-q-category" className="form-label">
                      Alert Category
                    </label>
                    <input
                      id="s02-q-category"
                      type="text"
                      className="form-control"
                      value={qCategory}
                      placeholder="Uncertain Posting / 48h Clock"
                      onChange={(e) => setQCategory(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="s02-q-summary" className="form-label">
                      Next Action Summary
                    </label>
                    <input
                      id="s02-q-summary"
                      type="text"
                      className="form-control"
                      value={qSummary}
                      placeholder="Verify payment reference before release approval."
                      onChange={(e) => setQSummary(e.target.value)}
                    />
                  </div>
                  <label
                    className={`p03-checkbox-row ${qUncertain ? 'is-checked' : ''}`}
                    htmlFor="s02-q-uncertain"
                  >
                    <span>Uncertain Posting Outcome (Pin to Top)</span>
                    <input
                      id="s02-q-uncertain"
                      type="checkbox"
                      checked={qUncertain}
                      onChange={(e) => setQUncertain(e.target.checked)}
                    />
                  </label>
                  <label
                    className={`p03-checkbox-row ${qOverdue ? 'is-checked' : ''}`}
                    htmlFor="s02-q-overdue"
                  >
                    <span>Overdue / Deadline Urgent</span>
                    <input
                      id="s02-q-overdue"
                      type="checkbox"
                      checked={qOverdue}
                      onChange={(e) => setQOverdue(e.target.checked)}
                    />
                  </label>
                  <label
                    className={`p03-checkbox-row ${qIndependentApproval ? 'is-checked' : ''}`}
                    htmlFor="s02-q-independent"
                  >
                    <span>Requires Independent Approval (Bar Self-Approval)</span>
                    <input
                      id="s02-q-independent"
                      type="checkbox"
                      checked={qIndependentApproval}
                      onChange={(e) => setQIndependentApproval(e.target.checked)}
                    />
                  </label>
                  <button
                    type="button"
                    id="s02-enqueue-item-btn"
                    className="btn-batcave-primary"
                    onClick={handleEnqueueWorkItem}
                  >
                    Enqueue Work Item
                  </button>
                </div>

                {/* Control Card B: Operational Pulse & Chapter Lifecycle */}
                <div className="p02-column-stack">
                  <div className="p04-line-card">
                    <h3 className="p03-section-title" style={{ fontSize: '1rem' }}>
                      Update Operational Pulse Metrics
                    </h3>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label htmlFor="s02-pulse-usable" className="form-label">
                          Usable On-Hand
                        </label>
                        <input
                          id="s02-pulse-usable"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulseUsable}
                          placeholder="42"
                          onChange={(e) => setPulseUsable(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="s02-pulse-available" className="form-label">
                          Available to Allocate
                        </label>
                        <input
                          id="s02-pulse-available"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulseAvailable}
                          placeholder="30"
                          onChange={(e) => setPulseAvailable(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label htmlFor="s02-pulse-clocks" className="form-label">
                          Active 48h Clocks
                        </label>
                        <input
                          id="s02-pulse-clocks"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulseClocks}
                          placeholder="2"
                          onChange={(e) => setPulseClocks(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="s02-pulse-slips" className="form-label">
                          Unverified Slips Count
                        </label>
                        <input
                          id="s02-pulse-slips"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulsePaymentsCount}
                          placeholder="3"
                          onChange={(e) => setPulsePaymentsCount(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label htmlFor="s02-pulse-cash" className="form-label">
                          Unverified Cash Total (PHP)
                        </label>
                        <input
                          id="s02-pulse-cash"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulseCashTotal}
                          placeholder="1250.50"
                          onChange={(e) => setPulseCashTotal(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="s02-pulse-booth" className="form-label">
                          Booth Custody Units
                        </label>
                        <input
                          id="s02-pulse-booth"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={pulseBoothUnits}
                          placeholder="10"
                          onChange={(e) => setPulseBoothUnits(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="s02-pulse-rop" className="form-label">
                        Critical ROP Alerts Count
                      </label>
                      <input
                        id="s02-pulse-rop"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={pulseRopAlerts}
                        placeholder="1"
                        onChange={(e) => setPulseRopAlerts(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      id="s02-update-pulse-btn"
                      className="btn-batcave-primary"
                      onClick={handleUpdatePulse}
                    >
                      Apply Operational Pulse
                    </button>
                  </div>

                  <div className="p04-line-card">
                    <h3 className="p03-section-title" style={{ fontSize: '1rem' }}>
                      Update Subscription Phase &amp; Host Fence
                    </h3>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label htmlFor="s02-life-phase" className="form-label">
                          Subscription Phase
                        </label>
                        <select
                          id="s02-life-phase"
                          className="form-control"
                          value={lifePhase}
                          onChange={(e) => setLifePhase(e.target.value as SubscriptionPhase)}
                        >
                          <option value="not_activated">Trial Not Activated</option>
                          <option value="trial_active">30-Day Trial Active</option>
                          <option value="grace_read_export">14-Day Read &amp; Export Grace</option>
                          <option value="post_grace_suspended">Post-Grace Suspended</option>
                          <option value="paid_active">Paid Subscription Active</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="s02-life-days" className="form-label">
                          Remaining Days
                        </label>
                        <input
                          id="s02-life-days"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={lifeDays}
                          placeholder="14"
                          onChange={(e) => setLifeDays(e.target.value)}
                        />
                      </div>
                    </div>
                    <label
                      className={`p03-checkbox-row ${lifeFenced ? 'is-checked' : ''}`}
                      htmlFor="s02-life-fenced"
                    >
                      <span>Planned Maintenance Write Fence Active</span>
                      <input
                        id="s02-life-fenced"
                        type="checkbox"
                        checked={lifeFenced}
                        onChange={(e) => setLifeFenced(e.target.checked)}
                      />
                    </label>
                    <div className="form-group">
                      <label htmlFor="s02-life-notice" className="form-label">
                        Maintenance Window Notice
                      </label>
                      <input
                        id="s02-life-notice"
                        type="text"
                        className="form-control"
                        value={lifeNotice}
                        placeholder="Database backup and schema check until 22:30 UTC."
                        onChange={(e) => setLifeNotice(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      id="s02-update-lifecycle-btn"
                      className="btn-batcave-secondary"
                      onClick={handleUpdateLifecycle}
                    >
                      Apply Chapter Lifecycle
                    </button>
                  </div>

                  <div className="p04-line-card">
                    <h3 className="p03-section-title" style={{ fontSize: '1rem' }}>
                      Durable Operation Replay &amp; Lookup
                    </h3>
                    <div className="p03-input-action-row">
                      <input
                        id="s02-lookup-key"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={lookupKey}
                        placeholder="s02-queue-seq-1"
                        onChange={(e) => setLookupKey(e.target.value)}
                      />
                      <button
                        type="button"
                        id="s02-lookup-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleLookupOperation}
                      >
                        Lookup
                      </button>
                    </div>
                    {lookupResult ? (
                      <div className="p03-muted-copy" data-testid="s02-lookup-result">
                        <strong>{lookupResult.code}</strong>: {lookupResult.message}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Section 2: S-02 "My Work" Actionable Queue */}
        <section className="p03-card surface-card" aria-labelledby="s02-queue-heading">
          <div className="p03-card-header-row">
            <div>
              <span className="p03-eyebrow">Screen S-02 Triage</span>
              <h2 id="s02-queue-heading" className="p03-section-title">
                My Work Queue &amp; Deadlines
              </h2>
            </div>

            <div className="p03-filter-pill-bar" role="tablist" aria-label="Officer queue buckets">
              <button
                type="button"
                role="tab"
                id="s02-queue-tab-needs"
                aria-selected={activeBucket === 'needs_my_action'}
                className={`p03-filter-pill ${activeBucket === 'needs_my_action' ? 'is-active' : ''}`}
                onClick={() => {
                  playClickPen(soundEnabled);
                  setActiveBucket('needs_my_action');
                }}
              >
                Needs My Action ({bucketCounts.needs_my_action})
              </button>
              <button
                type="button"
                role="tab"
                id="s02-queue-tab-waiting"
                aria-selected={activeBucket === 'waiting_on_others'}
                className={`p03-filter-pill ${activeBucket === 'waiting_on_others' ? 'is-active' : ''}`}
                onClick={() => {
                  playClickPen(soundEnabled);
                  setActiveBucket('waiting_on_others');
                }}
              >
                Waiting on Others ({bucketCounts.waiting_on_others})
              </button>
              <button
                type="button"
                role="tab"
                id="s02-queue-tab-resolved"
                aria-selected={activeBucket === 'resolved_history'}
                className={`p03-filter-pill ${activeBucket === 'resolved_history' ? 'is-active' : ''}`}
                onClick={() => {
                  playClickPen(soundEnabled);
                  setActiveBucket('resolved_history');
                }}
              >
                Resolved &amp; History ({bucketCounts.resolved_history})
              </button>
            </div>
          </div>

          {visibleQueueItems.length === 0 ? (
            <p className="p03-muted-copy" data-testid="s02-queue-empty">
              No pending alerts, approvals, or uncertain outcomes in this queue bucket yet.
            </p>
          ) : (
            <div className="s02-queue-list" data-testid="s02-queue-list">
              {visibleQueueItems.map((item) => {
                const authority = evaluateQueueAuthority(
                  item,
                  activeOfficerName,
                  activeDutiesList
                );
                return (
                  <article
                    key={item.queue_item_id}
                    className={`s02-queue-card ${
                      item.is_uncertain_outcome
                        ? 'is-uncertain'
                        : item.is_overdue
                          ? 'is-overdue'
                          : ''
                    }`}
                    data-testid="s02-queue-item"
                    data-record-ref={item.record_reference}
                  >
                    <div className="p03-card-header-row">
                      <div className="p03-state-title-group">
                        <span className="p03-version-pill p03-id-pill">
                          <span className="p03-id-value">{item.record_reference}</span>
                        </span>
                        <strong style={{ fontSize: '0.96rem' }}>{item.title}</strong>
                      </div>

                      <div className="p03-version-badges">
                        {item.is_uncertain_outcome ? (
                          <span className="p03-attention-badge is-serious-attention">
                            Uncertain Outcome
                          </span>
                        ) : null}
                        {item.is_overdue ? (
                          <span className="p03-attention-badge is-needs-action">Overdue</span>
                        ) : null}
                        <span className="p03-version-pill">{item.responsible_duty}</span>
                        <span className="p03-version-pill">
                          Inspections: <strong>{item.inspection_count}</strong>
                        </span>
                      </div>
                    </div>

                    <p className="p03-muted-copy">{item.summary}</p>

                    <div className="p03-version-badges">
                      <span className="p03-utc-sub">
                        Category: {item.category}
                        {item.due_at_utc ? ` • Due UTC: ${item.due_at_utc}` : ''}
                        {item.preparer_actor_id ? ` • Prepared by: ${item.preparer_actor_id}` : ''}
                      </span>
                    </div>

                    {authority.independence_blocked || authority.duty_blocked ? (
                      <div
                        className="callout-banner is-warning"
                        data-testid="s02-independence-blocker"
                      >
                        <span className="callout-dot dot-warning" aria-hidden="true" />
                        <div style={{ flex: 1 }}>
                          <strong>
                            {authority.independence_blocked
                              ? 'Independence Restriction Active'
                              : 'Duty Assignment Restriction'}
                          </strong>
                          <div>{authority.reason}</div>
                        </div>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={() => {
                            playClickPen(soundEnabled);
                            onOpenRoute('p02-admin');
                          }}
                        >
                          Open Alternate Administration
                        </button>
                      </div>
                    ) : null}

                    <div className="s02-queue-actions">
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        data-testid={`s02-inspect-${item.record_reference}`}
                        onClick={() => handleInspectItem(item)}
                      >
                        Inspect Alert
                      </button>
                      <button
                        type="button"
                        className="btn-batcave-primary p03-shrink-btn"
                        data-testid={`s02-open-${item.record_reference}`}
                        onClick={() => {
                          playClickPen(soundEnabled);
                          onOpenRoute(item.target_route);
                        }}
                      >
                        Open Workspace
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Seven Functional Officer Workstation Hubs */}
        <section className="p03-card surface-card" aria-labelledby="s02-hub-heading">
          <div className="p03-card-header-row">
            <div>
              <span className="p03-eyebrow">All Chapter Workstations</span>
              <h2 id="s02-hub-heading" className="p03-section-title">
                Operational Workstations Hub
              </h2>
            </div>

            <label
              className={`p03-checkbox-row ${filterByMyDuties ? 'is-checked' : ''}`}
              style={{ width: 'auto', minWidth: '260px' }}
              htmlFor="s02-filter-my-duties"
            >
              <span>Filter by My Granted Duties</span>
              <input
                id="s02-filter-my-duties"
                type="checkbox"
                checked={filterByMyDuties}
                onChange={(e) => setFilterByMyDuties(e.target.checked)}
              />
            </label>
          </div>

          <div
            className="s02-domain-pill-bar"
            role="tablist"
            aria-label="Filter workstations by operational domain"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeDomain === 'all'}
              className={`p03-filter-pill ${activeDomain === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                playClickPen(soundEnabled);
                setActiveDomain('all');
              }}
            >
              All Domains ({ALL_WORKSTATIONS.length})
            </button>
            {DASHBOARD_WORKSTATION_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={activeDomain === group.id}
                className={`p03-filter-pill ${activeDomain === group.id ? 'is-active' : ''}`}
                onClick={() => {
                  playClickPen(soundEnabled);
                  setActiveDomain(group.id);
                }}
              >
                {group.title} ({group.items.length})
              </button>
            ))}
          </div>

          {visibleGroups.length === 0 ? (
            <p className="p03-muted-copy" data-testid="s02-hub-empty">
              No workstations matched your current search or granted duty filter.
            </p>
          ) : (
            <div className="s02-hub-grid" data-testid="s02-hub-grid">
              {visibleGroups.map((group) => (
                <section
                  key={group.id}
                  className="s02-domain-card"
                  aria-label={group.title}
                >
                  <div className="s02-domain-header">
                    <h3 className="p03-section-title" style={{ fontSize: '1.05rem' }}>
                      {group.title}
                    </h3>
                    <span className="p03-version-pill">{group.items.length} Modules</span>
                  </div>
                  <p className="p03-muted-copy">{group.subtitle}</p>

                  <div className="s02-station-list">
                    {group.items.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        id={entry.id}
                        className="s02-station-btn"
                        onClick={() => {
                          playClickPen(soundEnabled);
                          onOpenRoute(entry.route);
                        }}
                      >
                        <div className="s02-station-copy">
                          <span className="s02-station-title">{entry.title}</span>
                          <span className="s02-station-desc">{entry.description}</span>
                        </div>
                        <span className="s02-station-meta">{entry.stageLabel} →</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
