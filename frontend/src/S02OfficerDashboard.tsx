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

interface DailyWorkflowTile {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly route: DashboardRouteTarget;
  readonly iconKind: 'requisition' | 'sales' | 'payment' | 'booth' | 'reports' | 'map';
}

const DAILY_WORKFLOW_TILES: ReadonlyArray<DailyWorkflowTile> = [
  {
    id: 's02-quick-requisitions',
    title: 'Internal Requisitions',
    subtitle: 'Stock requests & holds',
    route: 'p07-requisitions',
    iconKind: 'requisition',
  },
  {
    id: 's02-quick-sales',
    title: 'Sales Orders & SI',
    subtitle: 'Orders & buyer billing',
    route: 'p12-sales',
    iconKind: 'sales',
  },
  {
    id: 's02-quick-payments',
    title: 'Payments & Receipts',
    subtitle: 'Verify slips & issue OR',
    route: 'p13-payments',
    iconKind: 'payment',
  },
  {
    id: 's02-quick-booth-sale',
    title: 'Live Booth Sales',
    subtitle: 'Event cart & receipts',
    route: 'p21-booth-sale',
    iconKind: 'booth',
  },
  {
    id: 's02-quick-reports',
    title: 'Reports & Exports',
    subtitle: 'Stock views & CSV',
    route: 'p24-reports',
    iconKind: 'reports',
  },
  {
    id: 's02-quick-map',
    title: 'Operations Map',
    subtitle: 'Flow tracer & views',
    route: 'p25-operations-map',
    iconKind: 'map',
  },
];

const ALL_WORKSTATIONS = DASHBOARD_WORKSTATION_GROUPS.flatMap((group) => group.items);

function computeOfficerInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return 'OF';
  if (parts.length === 1) return (parts[0] ?? 'OF').slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
}

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

function DomainIcon({ groupId }: { groupId: WorkstationGroupId }) {
  switch (groupId) {
    case 'governance':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'inventory':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'procurement':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
        </svg>
      );
    case 'sales':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <path d="M8 7h8M8 11h8M8 15h4" />
        </svg>
      );
    case 'booths':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M2 7h20v2a3 3 0 0 1-6 0v-2m0 2a3 3 0 0 1-6 0v-2m0 2a3 3 0 0 1-6 0V7" />
        </svg>
      );
    case 'reports':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case 'operations':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

function WorkflowTileIcon({ kind }: { kind: DailyWorkflowTile['iconKind'] }) {
  switch (kind) {
    case 'requisition':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      );
    case 'sales':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'payment':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case 'booth':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'reports':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      );
    case 'map':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
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

  const visibleGroups = DASHBOARD_WORKSTATION_GROUPS.map((group) => {
    const filteredItems = group.items.filter((entry) => {
      if (filterByMyDuties && !workstationMatchesOfficerDuties(entry, activeDutiesList)) {
        return false;
      }
      if (normalizedQuery === '') return true;
      return (
        entry.shortTitle.toLowerCase().includes(normalizedQuery) ||
        entry.title.toLowerCase().includes(normalizedQuery) ||
        entry.description.toLowerCase().includes(normalizedQuery) ||
        entry.keywords.some((kw) => kw.includes(normalizedQuery))
      );
    });
    return {
      ...group,
      items: filteredItems,
    };
  }).filter((group) => group.items.length > 0);

  const lifecycle = snapshot.chapter_lifecycle;
  const pulse = snapshot.operational_pulse;
  const officerInitials = computeOfficerInitials(activeOfficerName);

  return (
    <main className="s02-shell" data-testid="s02-dashboard-workspace">
      {/* Persistent Sticky Left Navigation Sidebar */}
      <aside className="s02-sidebar surface-card" aria-label="Chapter Workspace Navigation">
        <div className="s02-sidebar-profile">
          <div className="s02-avatar" aria-hidden="true">
            {officerInitials}
          </div>
          <div className="s02-profile-copy">
            <span className="kamunggay-verified-name-slot s02-officer-name">
              {activeOfficerName}
            </span>
            <span className="slot-duties s02-officer-duties">
              {dashboardSession?.grantedDuties ?? 'Chapter Operations'}
            </span>
          </div>
        </div>

        <label className="s02-duty-filter-row" htmlFor="s02-filter-my-duties">
          <span className="s02-duty-filter-label">My duties only</span>
          <input
            id="s02-filter-my-duties"
            type="checkbox"
            checked={filterByMyDuties}
            onChange={(e) => setFilterByMyDuties(e.target.checked)}
          />
        </label>

        <nav className="s02-sidebar-nav" aria-label="Operational Modules">
          {visibleGroups.length === 0 ? (
            <p className="s02-sidebar-empty" data-testid="s02-hub-empty">
              No workspaces matched your current filter.
            </p>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.id} className="s02-nav-group">
                <div className="s02-nav-group-label">
                  <DomainIcon groupId={group.id} />
                  <span>{group.title}</span>
                </div>
                <div className="s02-nav-group-items">
                  {group.items.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      id={entry.id}
                      title={entry.title}
                      className="s02-nav-item"
                      onClick={() => {
                        playClickPen(soundEnabled);
                        onOpenRoute(entry.route);
                      }}
                    >
                      <span className="s02-nav-item-text">{entry.shortTitle}</span>
                      <span className="s02-nav-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </nav>

        <div className="s02-sidebar-footer">
          <button
            type="button"
            id="s02-sign-out-btn"
            disabled={isSigningOut}
            className="s02-signout-btn"
            onClick={() => {
              playClickPen(soundEnabled);
              onSignOut();
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{isSigningOut ? 'Signing out...' : 'Sign out & Return to Login'}</span>
          </button>
        </div>
      </aside>

      {/* Main Executive Workspace Canvas */}
      <div className="s02-main-canvas">
        {/* Clean Executive Page Header with Inline Spotlight Jump Bar */}
        <header className="s02-canvas-header">
          <div className="s02-title-stack">
            <h1 id="my-work-heading" className="s02-page-title">
              My Work — Chapter Workspace
            </h1>
            <p className="s02-page-subtitle">
              Active operational overview, priority queue, and daily officer workflows.
            </p>
          </div>

          <div className="s02-command-bar">
            <div className="s02-command-input-wrap">
              <svg
                className="s02-command-icon"
                width="15"
                height="15"
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
                className="form-control s02-command-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim() !== '') {
                    e.preventDefault();
                    handleRecordPrefixJump();
                  }
                }}
                placeholder="Search or jump to record (RF-2026-001)"
                aria-label="Search modules or jump to record reference"
              />
            </div>

            <button
              type="button"
              id="s02-record-jump-btn"
              className="btn-batcave-primary s02-jump-btn"
              onClick={handleRecordPrefixJump}
            >
              Jump to Record
            </button>

            {searchQuery.trim() !== '' ? (
              <button
                type="button"
                id="s02-clear-search-btn"
                className="btn-batcave-secondary s02-clear-btn"
                onClick={() => {
                  playClickPen(soundEnabled);
                  setSearchQuery('');
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </header>

        {/* Conditional Operational & Action Feedback Banners */}
        {lifecycle.maintenance_fenced ? (
          <div className="callout-banner is-error" data-testid="s02-maintenance-banner" role="status">
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
                  ? 'New business postings are paused. Scoped read and CSV/PDF exports remain enabled along with essential security and reconciliation controls.'
                  : 'Commercial post-grace terms apply. Read/export access is suspended while financial and stock history remain preserved.'}
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

        {/* 4-Card Executive KPI Pulse Strip */}
        <section className="s02-kpi-grid" aria-label="Operational Pulse Summary">
          <div className="surface-card s02-kpi-card">
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Stockroom On-Hand</span>
              <span className="s02-kpi-icon tone-indigo" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value" data-testid="s02-kpi-usable">
              {pulse.usable_on_hand}
            </div>
            <div className="s02-kpi-sub">
              <span data-testid="s02-kpi-available" className="s02-kpi-num-inline">
                {pulse.available_to_allocate}
              </span>{' '}
              available to allocate
            </div>
          </div>

          <div className="surface-card s02-kpi-card">
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Active 48h Clocks</span>
              <span className="s02-kpi-icon tone-amber" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value" data-testid="s02-kpi-clocks">
              {pulse.active_clocks_48h}
            </div>
            <div className="s02-kpi-sub">Payment &amp; reservation deadlines</div>
          </div>

          <div className="surface-card s02-kpi-card">
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Unverified Payments</span>
              <span className="s02-kpi-icon tone-emerald" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value" data-testid="s02-kpi-cash">
              {formatPhpCurrency(pulse.unverified_cash_total)}
            </div>
            <div className="s02-kpi-sub">
              <span data-testid="s02-kpi-slips" className="s02-kpi-num-inline">
                {pulse.unverified_payments_count}
              </span>{' '}
              pending slips awaiting receipt
            </div>
          </div>

          <div className="surface-card s02-kpi-card">
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Booth Custody</span>
              <span className="s02-kpi-icon tone-violet" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value" data-testid="s02-kpi-booth">
              {pulse.booth_custody_units}
            </div>
            <div className="s02-kpi-sub">
              <span data-testid="s02-kpi-rop" className="s02-kpi-num-inline">
                {pulse.critical_rop_alerts}
              </span>{' '}
              low-stock reorder alerts
            </div>
          </div>
        </section>

        {/* 2-Column Body Grid: Priority Action Queue + Daily Workflows / Chapter Readiness */}
        <div className="s02-body-grid">
          {/* Primary Column: Priority Action Queue */}
          <section className="surface-card s02-queue-panel" aria-labelledby="s02-queue-heading">
            <div className="s02-panel-header">
              <div>
                <h2 id="s02-queue-heading" className="s02-panel-title">
                  Priority Queue
                </h2>
                <p className="s02-panel-subtitle">
                  Uncertain outcomes and expiring 48-hour clocks stay pinned at the top.
                </p>
              </div>

              <div className="s02-segmented-tabs" role="tablist" aria-label="Officer queue buckets">
                <button
                  type="button"
                  role="tab"
                  id="s02-queue-tab-needs"
                  aria-selected={activeBucket === 'needs_my_action'}
                  className={`s02-seg-tab ${activeBucket === 'needs_my_action' ? 'is-active' : ''}`}
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
                  className={`s02-seg-tab ${activeBucket === 'waiting_on_others' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveBucket('waiting_on_others');
                  }}
                >
                  Waiting ({bucketCounts.waiting_on_others})
                </button>
                <button
                  type="button"
                  role="tab"
                  id="s02-queue-tab-resolved"
                  aria-selected={activeBucket === 'resolved_history'}
                  className={`s02-seg-tab ${activeBucket === 'resolved_history' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveBucket('resolved_history');
                  }}
                >
                  Resolved ({bucketCounts.resolved_history})
                </button>
              </div>
            </div>

            {visibleQueueItems.length === 0 ? (
              <div className="s02-empty-state" data-testid="s02-queue-empty">
                <div className="s02-empty-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <strong className="s02-empty-heading">All clear — no pending officer actions</strong>
                <p className="s02-empty-caption">
                  Uncertain posting outcomes, expiring 48-hour clocks, and pending approvals appear here
                  automatically.
                </p>
              </div>
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
                      <div className="s02-queue-card-top">
                        <div className="s02-queue-title-row">
                          <span className="s02-record-pill">{item.record_reference}</span>
                          <strong className="s02-queue-item-title">{item.title}</strong>
                        </div>

                        <div className="s02-queue-badges">
                          {item.is_uncertain_outcome ? (
                            <span className="s02-status-tag is-uncertain">Uncertain Outcome</span>
                          ) : null}
                          {item.is_overdue ? (
                            <span className="s02-status-tag is-overdue">Overdue</span>
                          ) : null}
                          <span className="s02-duty-chip">{item.responsible_duty}</span>
                        </div>
                      </div>

                      <p className="s02-queue-summary">{item.summary}</p>

                      <div className="s02-queue-meta-line">
                        <span>{item.category}</span>
                        {item.due_at_utc ? (
                          <span className="s02-meta-mono">Due {item.due_at_utc}</span>
                        ) : null}
                        {item.preparer_actor_id ? (
                          <span>Prepared by {item.preparer_actor_id}</span>
                        ) : null}
                        <span className="s02-meta-mono">Inspections: {item.inspection_count}</span>
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

          {/* Secondary Utility Column */}
          <div className="s02-right-rail">
            {/* Card A: Daily Workflows 2x3 Tile Grid */}
            <section className="surface-card s02-rail-card" aria-labelledby="s02-daily-heading">
              <div className="s02-rail-header">
                <h2 id="s02-daily-heading" className="s02-panel-title">
                  Daily Workflows
                </h2>
                <span className="s02-panel-caption">Quick launch</span>
              </div>

              <div className="s02-quick-grid">
                {DAILY_WORKFLOW_TILES.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    data-testid={tile.id}
                    className="s02-quick-tile"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      onOpenRoute(tile.route);
                    }}
                  >
                    <span className="s02-quick-icon" aria-hidden="true">
                      <WorkflowTileIcon kind={tile.iconKind} />
                    </span>
                    <span className="s02-quick-text">
                      <span className="s02-quick-title">{tile.title}</span>
                      <span className="s02-quick-sub">{tile.subtitle}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Card B: Chapter Readiness & Status */}
            <section className="surface-card s02-rail-card" aria-labelledby="s02-readiness-heading">
              <div className="s02-rail-header">
                <h2 id="s02-readiness-heading" className="s02-panel-title">
                  Chapter Readiness
                </h2>
              </div>

              <dl className="s02-readiness-list">
                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Active Chapter</dt>
                  <dd className="s02-readiness-val slot-chapter">
                    {dashboardSession?.activeChapter ?? 'Assigned Chapter'}
                  </dd>
                </div>
                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Subscription</dt>
                  <dd className="s02-readiness-val">
                    <span
                      className={`s02-status-dot ${
                        lifecycle.subscription_phase === 'paid_active' ||
                        lifecycle.subscription_phase === 'trial_active'
                          ? 'is-green'
                          : lifecycle.subscription_phase === 'grace_read_export'
                            ? 'is-amber'
                            : lifecycle.subscription_phase === 'post_grace_suspended'
                              ? 'is-red'
                              : 'is-neutral'
                      }`}
                      aria-hidden="true"
                    />
                    <span data-testid="s02-subscription-pill">
                      {subscriptionBadgeText(
                        lifecycle.subscription_phase,
                        lifecycle.days_remaining
                      )}
                    </span>
                  </dd>
                </div>
                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Host Status</dt>
                  <dd className="s02-readiness-val">
                    <span
                      className={`s02-status-dot ${
                        lifecycle.maintenance_fenced ? 'is-red' : 'is-green'
                      }`}
                      aria-hidden="true"
                    />
                    <span data-testid="s02-host-status-pill">
                      {lifecycle.maintenance_fenced ? 'Maintenance Fenced' : 'Operational'}
                    </span>
                  </dd>
                </div>
                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Governance</dt>
                  <dd className="s02-readiness-val slot-constraints">
                    {dashboardSession?.governanceConstraints ??
                      'Standard chapter governance rules apply'}
                  </dd>
                </div>
              </dl>

              <div className="s02-rail-footer">
                <button
                  type="button"
                  id="s02-toggle-controls-btn"
                  className="s02-quiet-toggle-btn"
                  aria-expanded={controlsOpen}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setControlsOpen((prev) => !prev);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" />
                    <line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                  <span>
                    {controlsOpen ? 'Hide Queue & Telemetry Controls' : 'Manage Queue & Telemetry'}
                  </span>
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Hidden-by-Default Queue, Telemetry & Replay Operations Drawer */}
        {controlsOpen ? (
          <section className="surface-card s02-controls-drawer" data-testid="s02-controls-drawer">
            <div className="s02-drawer-header">
              <div>
                <h2 className="s02-panel-title">Queue, Telemetry &amp; Lifecycle Controls</h2>
                <p className="s02-panel-subtitle">
                  Post operational pulse updates, queue officer alerts, configure chapter
                  subscription phases, and recover operations.
                </p>
              </div>
            </div>

            <div className="p03-grid">
              {/* Control Card A: Enqueue Work Queue Alert */}
              <div className="p04-line-card">
                <h3 className="s02-drawer-subhead">Enqueue Scoped Work Item</h3>
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
                  <h3 className="s02-drawer-subhead">Update Operational Pulse Metrics</h3>
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
                  <h3 className="s02-drawer-subhead">Update Subscription Phase &amp; Host Fence</h3>
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
                  <h3 className="s02-drawer-subhead">Durable Operation Replay &amp; Lookup</h3>
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
