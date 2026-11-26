import { useCallback, useEffect, useMemo, useState } from 'react';
import { actionBlockReason, formatActionName, formatDutyName, formatSettingKey } from '../api/access.ts';
import { apiGet, formatManilaTime } from '../api/client.ts';
import type {
  ChapterAccessSnapshot,
  ChapterContext,
  ChapterMembership,
  ConnectionState,
  SessionProjection,
  SevenStockViews,
  Stage1EventNotice,
  WorkspaceTab,
} from '../api/types.ts';
import type { RealtimeStatus } from '../realtime/reverbClient.ts';
import type { MemoryDraftEntry } from '../state/memoryDraftStore.ts';
import { AuthGate } from './AuthGate.tsx';
import { ChapterAuthorityBar } from './ChapterAuthorityBar.tsx';
import { OperationBanner } from './OperationBanner.tsx';

interface RfSummaryRow {
  id: string;
  reference: string | null;
  status: string;
  fulfillment_status: string;
  purpose: string;
  needed_at: string | null;
}

interface StockSummaryRow {
  variant_id: string;
  variant_code?: string;
  low_stock: string;
  views: SevenStockViews;
}

interface StockHoldSummaryRow {
  id: string;
  status: string;
  reason_code: string;
  reason: string;
}

interface OpeningCountSummaryRow {
  id: string;
  reference?: string | null;
  state?: string;
  status?: string;
}

interface NavGroupConfig {
  id: string;
  label: string;
  tone: 'inventory' | 'procurement' | 'sales' | 'operations';
  items: Array<{
    tab: WorkspaceTab;
    label: string;
    subtitle: string;
    requiredActions: string[];
  }>;
}

const WORKSPACE_GROUPS: NavGroupConfig[] = [
  {
    id: 'catalogue',
    label: 'Catalogue',
    tone: 'inventory',
    items: [
      {
        tab: 'catalogue',
        label: 'Catalogue',
        subtitle: 'Items, variants, units & locations',
        requiredActions: ['catalogue.read'],
      },
      {
        tab: 'opening',
        label: 'Opening Inventory',
        subtitle: 'Counts & opening receipts',
        requiredActions: ['opening.read', 'ipc.read'],
      },
      {
        tab: 'evidence',
        label: 'Signed Documents',
        subtitle: 'Proof files & receipts',
        requiredActions: ['evidence.read'],
      },
    ],
  },
  {
    id: 'requests',
    label: 'Requests',
    tone: 'procurement',
    items: [
      {
        tab: 'requisitions',
        label: 'Requisitions',
        subtitle: 'Create & submit requests',
        requiredActions: ['rf.read'],
      },
      {
        tab: 'reservations_holds',
        label: 'Reservations & Holds',
        subtitle: 'Allocate & freeze stock',
        requiredActions: ['stock.read'],
      },
    ],
  },
  {
    id: 'custody',
    label: 'Stock',
    tone: 'operations',
    items: [
      {
        tab: 'stock',
        label: 'Stock',
        subtitle: 'Balances & batch availability',
        requiredActions: ['stock.read'],
      },
      {
        tab: 'actual_issues',
        label: 'Issue Handover',
        subtitle: 'Prepare & post stock releases',
        requiredActions: ['stock.read'],
      },
    ],
  },
];

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return 'YS';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatEventTitle(eventName: string): string {
  const cleaned = eventName
    .replace(/^stage1\./i, '')
    .replace(/[._]/g, ' ')
    .replace(/\bipc\b/gi, 'opening count')
    .replace(/\bopening rm\b/gi, 'opening receipt')
    .replace(/\brf\b/gi, 'requisition');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatDraftTab(formKey: string): { tab: WorkspaceTab; workspaceLabel: string } {
  if (formKey.includes('catalogue')) {
    return { tab: 'catalogue', workspaceLabel: 'Catalogue' };
  }
  if (formKey.includes('opening')) {
    return { tab: 'opening', workspaceLabel: 'Opening Inventory' };
  }
  if (formKey.includes('rf')) {
    return { tab: 'requisitions', workspaceLabel: 'Requisitions' };
  }
  if (formKey.includes('reservation') || formKey.includes('hold')) {
    return { tab: 'reservations_holds', workspaceLabel: 'Reservations & Holds' };
  }
  if (formKey.includes('issue')) {
    return { tab: 'actual_issues', workspaceLabel: 'Issue Handover' };
  }
  return { tab: 'my_work', workspaceLabel: 'Workspace' };
}

function realtimeText(status: RealtimeStatus): { label: string; dotClass: string } {
  switch (status) {
    case 'connected':
      return { label: 'Live updates active', dotClass: 'is-green' };
    case 'connecting':
    case 'stale_reconnect':
      return { label: 'Reconnecting live stream', dotClass: 'is-amber' };
    case 'denied':
      return { label: 'Live stream denied', dotClass: 'is-red' };
    default:
      return { label: 'Live updates standby', dotClass: 'is-neutral' };
  }
}

export interface S02DashboardProps {
  session: SessionProjection;
  connection: ConnectionState;
  realtimeStatus: RealtimeStatus;
  realtimeDetail: string | null;
  memberships: ChapterMembership[];
  membershipCursor: string | null;
  selectedChapterId: string | null;
  chapterContext: ChapterContext | null;
  chapterAccess: ChapterAccessSnapshot | null;
  recentNotices: Stage1EventNotice[];
  drafts: MemoryDraftEntry[];
  refreshSignal: number;
  globalError?: unknown;
  onSelectTab: (tab: WorkspaceTab) => void;
  onSelectChapter: (chapterId: string) => void;
  onLoadMoreMemberships: () => void;
  onRefreshAccess: () => void;
  onTriggerRefresh: () => void;
  onRetryHealth: () => void;
  onSessionUpdated: (next: SessionProjection | null) => void;
  onNotify?: (tone: 'success' | 'warning' | 'error' | 'info', text: string) => void;
  soundEnabled?: boolean;
  onSignOut: () => void;
}

export function S02Dashboard({
  session,
  connection,
  realtimeStatus,
  realtimeDetail,
  memberships,
  membershipCursor,
  selectedChapterId,
  chapterContext,
  chapterAccess,
  recentNotices,
  drafts,
  refreshSignal,
  globalError,
  onSelectTab,
  onSelectChapter,
  onLoadMoreMemberships,
  onRefreshAccess,
  onTriggerRefresh,
  onRetryHealth,
  onSessionUpdated,
  onNotify,
  soundEnabled = true,
  onSignOut,
}: S02DashboardProps) {
  const [dutiesOnly, setDutiesOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    catalogue: true,
    requests: true,
    custody: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQueueTab, setActiveQueueTab] = useState<'priority' | 'updates' | 'drafts'>('priority');
  const [showSecurityDrawer, setShowSecurityDrawer] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);

  const [rfs, setRfs] = useState<RfSummaryRow[] | null>(null);
  const [stocks, setStocks] = useState<StockSummaryRow[] | null>(null);
  const [holds, setHolds] = useState<StockHoldSummaryRow[] | null>(null);
  const [ipcs, setIpcs] = useState<OpeningCountSummaryRow[] | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!selectedChapterId) {
      return;
    }
    setLoadingSnapshot(true);
    const neededAtNow = new Date().toISOString().replace(/\.\d+Z$/, '.000000Z');
    const [rfRes, stockRes, holdRes, ipcRes] = await Promise.allSettled([
      apiGet<RfSummaryRow[]>(`/api/v1/chapters/${selectedChapterId}/internal-rfs?limit=25`),
      apiGet<StockSummaryRow[]>(
        `/api/v1/chapters/${selectedChapterId}/stock?intended_use=internal_use&needed_at=${encodeURIComponent(neededAtNow)}&limit=25`,
      ),
      apiGet<StockHoldSummaryRow[]>(`/api/v1/chapters/${selectedChapterId}/stock-holds?limit=25`),
      apiGet<OpeningCountSummaryRow[]>(`/api/v1/chapters/${selectedChapterId}/ipcs?limit=25`),
    ]);

    setRfs(rfRes.status === 'fulfilled' ? rfRes.value.data : null);
    setStocks(stockRes.status === 'fulfilled' ? stockRes.value.data : null);
    setHolds(holdRes.status === 'fulfilled' ? holdRes.value.data : null);
    setIpcs(ipcRes.status === 'fulfilled' ? ipcRes.value.data : null);
    setLoadingSnapshot(false);
  }, [selectedChapterId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!selectedChapterId || !active) {
        return;
      }
      await fetchOverview();
    })();
    return () => {
      active = false;
    };
  }, [fetchOverview, refreshSignal, selectedChapterId]);

  const currentMembership =
    chapterContext?.membership ?? memberships.find((m) => m.chapter.id === selectedChapterId) ?? null;
  const assignedDuties = currentMembership?.duties ?? [];
  const chapterDisplay = currentMembership
    ? `${currentMembership.chapter.reference} · ${currentMembership.chapter.display_name}`
    : 'No chapter selected';

  const allExpanded = Object.values(expandedGroups).every(Boolean);

  function toggleAllGroups() {
    const nextState = !allExpanded;
    setExpandedGroups({
      catalogue: nextState,
      requests: nextState,
      custody: nextState,
    });
  }

  const visibleGroups = useMemo(() => {
    return WORKSPACE_GROUPS.map((group) => ({
      ...group,
      items: dutiesOnly
        ? group.items.filter((item) =>
            !chapterAccess
              ? true
              : item.requiredActions.some((act) => actionBlockReason(chapterAccess, act) === null),
          )
        : group.items,
    })).filter((group) => group.items.length > 0);
  }, [chapterAccess, dutiesOnly]);

  const openRfList = useMemo(
    () => (rfs ?? []).filter((r) => !['closed', 'cancelled', 'completed'].includes(r.status.toLowerCase())),
    [rfs],
  );
  const lowStockList = useMemo(
    () => (stocks ?? []).filter((s) => s.low_stock && s.low_stock.toLowerCase() !== 'none' && s.low_stock.toLowerCase() !== 'ok'),
    [stocks],
  );
  const activeHoldList = useMemo(
    () => (holds ?? []).filter((h) => !['cleared', 'cancelled', 'released'].includes(h.status.toLowerCase())),
    [holds],
  );
  const openIpcList = useMemo(
    () =>
      (ipcs ?? []).filter(
        (c) => !['closed', 'authorized', 'posted'].includes((c.state ?? c.status ?? '').toLowerCase()),
      ),
    [ipcs],
  );
  const blockedActions = useMemo(
    () => (chapterAccess?.actions ?? []).filter((a) => a.state !== 'allowed'),
    [chapterAccess],
  );

  interface PriorityItem {
    id: string;
    pill: string;
    title: string;
    tagLabel: string;
    tagTone: 'is-uncertain' | 'is-overdue' | '';
    summary: string;
    meta: string;
    actionLabel: string;
    onAction: () => void;
  }

  const priorityItems = useMemo(() => {
    const items: PriorityItem[] = [];
    const q = searchQuery.trim().toLowerCase();

    for (const blockerAct of blockedActions.filter((b) => b.state === 'setup_blocked').slice(0, 3)) {
      const actionTitle = formatActionName(blockerAct.action);
      const uniqueMessages = Array.from(
        new Set(
          blockerAct.blockers
            .map((b) =>
              b.message ? formatSettingKey(b.message) : b.setting_key ? formatSettingKey(b.setting_key) : 'Setup required',
            )
            .filter(Boolean),
        ),
      );
      const reason = uniqueMessages.join('; ');
      items.push({
        id: `blocker-${blockerAct.action}`,
        pill: 'Setup',
        title: `${actionTitle} paused`,
        tagLabel: 'Setup Needed',
        tagTone: 'is-overdue',
        summary: reason || 'Complete chapter configuration to unlock this workflow.',
        meta: 'Chapter Setup',
        actionLabel: 'Inspect Setup',
        onAction: () => setShowSecurityDrawer(true),
      });
    }

    for (const rf of openRfList.slice(0, 5)) {
      items.push({
        id: `rf-${rf.id}`,
        pill: rf.reference ?? 'Draft Request',
        title: rf.purpose || 'Internal Stock Requisition',
        tagLabel: rf.status.replace(/_/g, ' '),
        tagTone: rf.status === 'draft' ? 'is-overdue' : '',
        summary: `Fulfillment: ${rf.fulfillment_status.replace(/_/g, ' ')}`,
        meta: rf.needed_at ? `Needed ${formatManilaTime(rf.needed_at)}` : 'No target date',
        actionLabel: 'Open Request',
        onAction: () => onSelectTab('requisitions'),
      });
    }

    for (const hold of activeHoldList.slice(0, 4)) {
      items.push({
        id: `hold-${hold.id}`,
        pill: 'Hold',
        title: hold.reason_code.replace(/_/g, ' '),
        tagLabel: hold.status.replace(/_/g, ' '),
        tagTone: 'is-uncertain',
        summary: hold.reason || 'Stock batch currently frozen awaiting verification.',
        meta: 'Stock Custody',
        actionLabel: 'Review Hold',
        onAction: () => onSelectTab('reservations_holds'),
      });
    }

    for (const item of lowStockList.slice(0, 3)) {
      items.push({
        id: `low-${item.variant_id}`,
        pill: item.variant_code || 'Low Stock',
        title: `${item.variant_code || 'Stock variant'} running low`,
        tagLabel: item.low_stock.replace(/_/g, ' '),
        tagTone: 'is-overdue',
        summary: `On hand: ${item.views?.usable_stockroom_on_hand?.quantity?.value ?? '0'} · Available: ${item.views?.available_to_allocate?.quantity?.value ?? '0'}`,
        meta: 'Inventory Balance',
        actionLabel: 'Check Stock',
        onAction: () => onSelectTab('stock'),
      });
    }

    for (const ipc of openIpcList.slice(0, 3)) {
      const stateText = (ipc.state ?? ipc.status ?? 'in progress').replace(/_/g, ' ');
      items.push({
        id: `ipc-${ipc.id}`,
        pill: ipc.reference ?? 'Opening Count',
        title: 'Opening physical inventory in progress',
        tagLabel: stateText,
        tagTone: 'is-overdue',
        summary: 'Finish count entry, authorization, or opening receipt inspection.',
        meta: 'Opening Baseline',
        actionLabel: 'Continue Opening',
        onAction: () => onSelectTab('opening'),
      });
    }

    if (!q) {
      return items;
    }
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.summary.toLowerCase().includes(q) ||
        i.pill.toLowerCase().includes(q) ||
        i.tagLabel.toLowerCase().includes(q),
    );
  }, [activeHoldList, blockedActions, lowStockList, onSelectTab, openIpcList, openRfList, searchQuery]);

  const liveStatus = realtimeText(realtimeStatus);
  const dutySummaryText =
    assignedDuties.length > 0 ? assignedDuties.map(formatDutyName).join(' · ') : 'Chapter Member';

  return (
    <main className="s02-shell" data-testid="s02-dashboard-workspace">
      <aside className="s02-sidebar surface-card" aria-label="Chapter workspace navigation">
        <div className="s02-sidebar-profile">
          <div className="s02-avatar" aria-hidden="true">
            {computeInitials(session.user.display_name)}
          </div>
          <div className="s02-profile-copy">
            <div className="s02-officer-name">{session.user.display_name}</div>
            <span className="s02-officer-duties" title={dutySummaryText}>
              {dutySummaryText}
            </span>
          </div>
        </div>

        <label className="s02-duty-filter-row" htmlFor="s02-duties-only-switch">
          <span className="s02-duty-filter-label">My duties only</span>
          <input
            id="s02-duties-only-switch"
            type="checkbox"
            className="s02-switch-input"
            checked={dutiesOnly}
            onChange={(e) => setDutiesOnly(e.target.checked)}
          />
        </label>

        <button
          type="button"
          className="s02-nav-home-active"
          onClick={() => onSelectTab('my_work')}
        >
          <span className="s02-nav-home-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>My Work</span>
          </span>
          <span className="s02-nav-active-dot" aria-hidden="true" />
        </button>

        <div className="s02-nav-section-header">
          <span>Workspaces</span>
          <button type="button" className="s02-expand-all-btn" onClick={toggleAllGroups}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        <nav className="s02-sidebar-nav" aria-label="Operational workspaces">
          {visibleGroups.length === 0 ? (
            <div className="s02-sidebar-empty">
              No workspaces match your current duty filter.
            </div>
          ) : (
            visibleGroups.map((group) => {
              const isOpen = !!expandedGroups[group.id];
              return (
                <div key={group.id} className="s02-nav-group">
                  <button
                    type="button"
                    className="s02-nav-accordion-btn"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [group.id]: !prev[group.id],
                      }))
                    }
                  >
                    <span className="s02-nav-accordion-left">
                      <span className={`s02-domain-badge tone-${group.tone}`} aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                          {group.id === 'catalogue' && (
                            <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
                          )}
                          {group.id === 'requests' && (
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" strokeLinecap="round" />
                          )}
                          {group.id === 'custody' && (
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" strokeLinecap="round" strokeLinejoin="round" />
                          )}
                        </svg>
                      </span>
                      <span className="s02-nav-group-title">{group.label}</span>
                    </span>
                    <span className="s02-nav-accordion-right">
                      <span className="s02-nav-count">{group.items.length}</span>
                      <svg
                        className={`s02-accordion-chevron ${isOpen ? 'is-open' : ''}`}
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="s02-nav-tree">
                      {group.items.map((item) => (
                        <button
                          key={item.tab}
                          type="button"
                          className="s02-nav-item"
                          onClick={() => onSelectTab(item.tab)}
                        >
                          <span className="s02-nav-item-text">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>

        <div className="s02-sidebar-footer">
          <button type="button" className="s02-signout-btn" onClick={onSignOut}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign out &amp; Return to Login</span>
          </button>
        </div>
      </aside>

      <div className="s02-main-canvas">
        <header className="s02-canvas-header">
          <div className="s02-title-stack">
            <h1 className="s02-page-title">My Work</h1>
            <p className="s02-page-subtitle">
              {chapterDisplay} · {assignedDuties.length} assigned role{assignedDuties.length === 1 ? '' : 's'}
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
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="form-control s02-command-input"
                placeholder="Filter queue items, stock alerts, holds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter dashboard queue items"
              />
            </div>

            <button
              type="button"
              className="btn-batcave-primary s02-jump-btn"
              onClick={() => {
                onTriggerRefresh();
                void fetchOverview();
              }}
              disabled={loadingSnapshot}
            >
              {loadingSnapshot ? 'Refreshing...' : 'Refresh'}
            </button>
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                className="btn-batcave-secondary s02-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear
              </button>
            )}
          </div>
        </header>

        <OperationBanner error={globalError} />

        <section className="s02-kpi-grid" aria-label="Chapter key metrics">
          <button
            type="button"
            className="s02-kpi-card surface-card"
            onClick={() => onSelectTab('requisitions')}
          >
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Open Requisitions</span>
              <span className="s02-kpi-icon tone-indigo" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" strokeLinecap="round" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value">{rfs === null ? '—' : openRfList.length}</div>
            <div className="s02-kpi-sub">
              {rfs === null ? 'Restricted or unavailable' : `${rfs.length} total request${rfs.length === 1 ? '' : 's'}`}
            </div>
          </button>

          <button
            type="button"
            className="s02-kpi-card surface-card"
            onClick={() => onSelectTab('stock')}
          >
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Tracked Stock Items</span>
              <span className="s02-kpi-icon tone-emerald" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value">{stocks === null ? '—' : stocks.length}</div>
            <div className="s02-kpi-sub">
              {stocks === null
                ? 'Restricted or unavailable'
                : `${lowStockList.length} low-stock alert${lowStockList.length === 1 ? '' : 's'}`}
            </div>
          </button>

          <button
            type="button"
            className="s02-kpi-card surface-card"
            onClick={() => onSelectTab('reservations_holds')}
          >
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Active Stock Holds</span>
              <span className="s02-kpi-icon tone-amber" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value">{holds === null ? '—' : activeHoldList.length}</div>
            <div className="s02-kpi-sub">
              {holds === null ? 'Restricted or unavailable' : `${holds.length} total recorded hold${holds.length === 1 ? '' : 's'}`}
            </div>
          </button>

          <button
            type="button"
            className="s02-kpi-card surface-card"
            onClick={() => onSelectTab('opening')}
          >
            <div className="s02-kpi-top">
              <span className="s02-kpi-label">Opening Counts</span>
              <span className="s02-kpi-icon tone-violet" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <div className="s02-kpi-value">{ipcs === null ? '—' : ipcs.length}</div>
            <div className="s02-kpi-sub">
              {drafts.length > 0
                ? `${drafts.length} unsaved session draft${drafts.length === 1 ? '' : 's'}`
                : openIpcList.length > 0
                  ? `${openIpcList.length} count${openIpcList.length === 1 ? '' : 's'} in progress`
                  : 'Baseline & receipt setup'}
            </div>
          </button>
        </section>

        <div className="s02-body-grid">
          <section className="s02-queue-panel surface-card" aria-label="Priority work queue">
            <div className="s02-panel-header">
              <div>
                <h2 className="s02-panel-title">Priority Queue</h2>
                <p className="s02-panel-subtitle">
                  Actionable requisitions, holds, alerts, and live chapter activity.
                </p>
              </div>
              <div className="s02-segmented-tabs" role="tablist" aria-label="Queue view filter">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeQueueTab === 'priority'}
                  className={`s02-seg-tab ${activeQueueTab === 'priority' ? 'is-active' : ''}`}
                  onClick={() => setActiveQueueTab('priority')}
                >
                  Action Items ({priorityItems.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeQueueTab === 'updates'}
                  className={`s02-seg-tab ${activeQueueTab === 'updates' ? 'is-active' : ''}`}
                  onClick={() => setActiveQueueTab('updates')}
                >
                  Live Updates ({recentNotices.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeQueueTab === 'drafts'}
                  className={`s02-seg-tab ${activeQueueTab === 'drafts' ? 'is-active' : ''}`}
                  onClick={() => setActiveQueueTab('drafts')}
                >
                  My Drafts ({drafts.length})
                </button>
              </div>
            </div>

            {activeQueueTab === 'priority' && (
              priorityItems.length === 0 ? (
                <div className="s02-empty-state">
                  <div className="s02-empty-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="s02-empty-heading">All caught up</div>
                  <div className="s02-empty-caption">
                    {searchQuery
                      ? 'No queue items match your current filter.'
                      : 'No pending setup notices, open requests, or active stock holds require your attention right now.'}
                  </div>
                </div>
              ) : (
                <div className="s02-queue-list">
                  {priorityItems.map((item) => (
                    <article key={item.id} className={`s02-queue-card ${item.tagTone}`.trim()}>
                      <div className="s02-queue-card-top">
                        <div className="s02-queue-title-row">
                          <span className="s02-record-pill">{item.pill}</span>
                          <span className="s02-queue-item-title">{item.title}</span>
                        </div>
                        <div className="s02-queue-badges">
                          <span className={`s02-status-tag ${item.tagTone}`}>{item.tagLabel}</span>
                        </div>
                      </div>
                      <p className="s02-queue-summary">{item.summary}</p>
                      <div className="s02-queue-meta-line">
                        <span>{item.meta}</span>
                      </div>
                      <div className="s02-queue-actions">
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={item.onAction}
                        >
                          {item.actionLabel}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {activeQueueTab === 'updates' && (
              recentNotices.length === 0 ? (
                <div className="s02-empty-state">
                  <div className="s02-empty-heading">Waiting for chapter updates</div>
                  <div className="s02-empty-caption">
                    Real-time inventory changes and approvals will appear here automatically.
                  </div>
                </div>
              ) : (
                <div className="s02-queue-list">
                  {recentNotices.map((notice) => (
                    <article key={notice.event_id} className="s02-queue-card">
                      <div className="s02-queue-card-top">
                        <div className="s02-queue-title-row">
                          <span className="s02-record-pill">Live</span>
                          <span className="s02-queue-item-title">{formatEventTitle(notice.event_name)}</span>
                        </div>
                        <div className="s02-queue-badges">
                          {notice.resource_version !== null && (
                            <span className="s02-status-tag">Revision {notice.resource_version}</span>
                          )}
                        </div>
                      </div>
                      <div className="s02-queue-meta-line">
                        <span>{formatManilaTime(notice.committed_at)}</span>
                        <span className="s02-panel-caption">
                          {notice.resource_kind.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )
            )}

            {activeQueueTab === 'drafts' && (
              drafts.length === 0 ? (
                <div className="s02-empty-state">
                  <div className="s02-empty-heading">No unsaved drafts</div>
                  <div className="s02-empty-caption">
                    Work saved temporarily in any form during this session appears here until submitted or cleared on sign-out.
                  </div>
                </div>
              ) : (
                <div className="s02-queue-list">
                  {drafts.map((draft) => {
                    const target = formatDraftTab(draft.formKey);
                    return (
                      <article key={`${draft.chapterId}-${draft.formKey}`} className="s02-queue-card">
                        <div className="s02-queue-card-top">
                          <div className="s02-queue-title-row">
                            <span className="s02-record-pill">Draft</span>
                            <span className="s02-queue-item-title">{draft.label}</span>
                          </div>
                          <div className="s02-queue-badges">
                            <span className="s02-status-tag">Session Draft</span>
                          </div>
                        </div>
                        <div className="s02-queue-meta-line">
                          <span>Saved {formatManilaTime(draft.updatedAtIso)}</span>
                        </div>
                        <div className="s02-queue-actions">
                          <button
                            type="button"
                            className="btn-batcave-secondary p03-shrink-btn"
                            onClick={() => onSelectTab(target.tab)}
                          >
                            Resume in {target.workspaceLabel}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            )}
          </section>

          <aside className="s02-right-rail" aria-label="Quick launch and chapter health">
            <section className="s02-rail-card surface-card">
              <div className="s02-rail-header">
                <h2 className="s02-panel-title">Daily Workflows</h2>
                <span className="s02-panel-caption">Jump directly</span>
              </div>
              <div className="s02-quick-grid">
                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('catalogue')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Catalogue</span>
                    <span className="s02-quick-sub">Items, variants &amp; units</span>
                  </span>
                </button>

                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('requisitions')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Requisitions</span>
                    <span className="s02-quick-sub">Create &amp; review requests</span>
                  </span>
                </button>

                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('reservations_holds')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Reservations</span>
                    <span className="s02-quick-sub">Allocate &amp; freeze stock</span>
                  </span>
                </button>

                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('actual_issues')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="m5 12 14-7-7 14-2-5-5-2Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Issue Handover</span>
                    <span className="s02-quick-sub">Prepare &amp; release stock</span>
                  </span>
                </button>

                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('stock')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Stock</span>
                    <span className="s02-quick-sub">Balances &amp; lots</span>
                  </span>
                </button>

                <button type="button" className="s02-quick-tile" onClick={() => onSelectTab('opening')}>
                  <span className="s02-quick-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="s02-quick-text">
                    <span className="s02-quick-title">Opening</span>
                    <span className="s02-quick-sub">Baseline counts &amp; receipts</span>
                  </span>
                </button>
              </div>
            </section>

            <section className="s02-rail-card surface-card">
              <div className="s02-rail-header">
                <h2 className="s02-panel-title">Chapter Status</h2>
                <button
                  type="button"
                  className="s02-expand-all-btn"
                  onClick={() => {
                    onRetryHealth();
                    onRefreshAccess();
                  }}
                >
                  Check now
                </button>
              </div>
              <dl className="s02-readiness-list">
                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Active Chapter</dt>
                  <dd className="s02-readiness-val">{chapterDisplay}</dd>
                </div>

                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Chapter Data</dt>
                  <dd className="s02-readiness-val">
                    <span
                      className={`s02-status-dot ${
                        connection === 'connected'
                          ? 'is-green'
                          : connection === 'checking'
                            ? 'is-amber'
                            : 'is-red'
                      }`}
                    />
                    {connection === 'connected' ? 'Online' : connection === 'checking' ? 'Checking' : 'Unavailable'}
                  </dd>
                </div>

                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Live Sync</dt>
                  <dd className="s02-readiness-val" title={realtimeDetail ?? undefined}>
                    <span className={`s02-status-dot ${liveStatus.dotClass}`} />
                    {liveStatus.label}
                  </dd>
                </div>

                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Workflow Readiness</dt>
                  <dd className="s02-readiness-val">
                    <span className={`s02-status-dot ${blockedActions.length === 0 ? 'is-green' : 'is-amber'}`} />
                    {blockedActions.length === 0
                      ? 'All actions ready'
                      : `${blockedActions.length} restricted or setup needed`}
                  </dd>
                </div>

                <div className="s02-readiness-row">
                  <dt className="s02-readiness-key">Session Verification</dt>
                  <dd className="s02-readiness-val">
                    <span className="s02-status-dot is-green" />
                    {session.authentication_method === 'authenticator'
                      ? 'Authenticator verified'
                      : session.authentication_method === 'recovery_code'
                        ? 'Backup code verified'
                        : 'Signed in'}
                  </dd>
                </div>
              </dl>

              {(memberships.length > 1 || membershipCursor) && (
                <div className="form-group" style={{ marginTop: '0.65rem' }}>
                  <label htmlFor="s02-chapter-select" className="form-label">
                    Switch Active Chapter
                  </label>
                  <div className="p03-input-action-row">
                    <select
                      id="s02-chapter-select"
                      className="form-control"
                      value={selectedChapterId ?? ''}
                      title={chapterDisplay}
                      onChange={(e) => onSelectChapter(e.target.value)}
                    >
                      {memberships.map((m) => (
                        <option key={m.chapter.id} value={m.chapter.id}>
                          {m.chapter.reference} · {m.chapter.display_name}
                        </option>
                      ))}
                    </select>
                    {membershipCursor && (
                      <button type="button" className="p02-compact-btn" onClick={onLoadMoreMemberships}>
                        Load More
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>

        <footer className="s02-canvas-footer">
          <button
            type="button"
            className="s02-demo-toggle-btn"
            aria-expanded={showSecurityDrawer}
            onClick={() => setShowSecurityDrawer((prev) => !prev)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              {showSecurityDrawer
                ? 'Hide Account Security & Chapter Permissions'
                : 'Account Security, Chapter Permissions & Backup Codes'}
            </span>
          </button>
          <span className="s02-panel-caption">
            Session expires {formatManilaTime(session.expires_at)}
          </span>
        </footer>

        {showSecurityDrawer && (
          <section className="surface-card s02-controls-drawer" aria-label="Account security and chapter permissions">
            <div className="s02-drawer-header">
              <h3 className="s02-drawer-subhead">Chapter Roles, Permissions &amp; Security Controls</h3>
              <button
                type="button"
                className="p02-compact-btn"
                onClick={() => setShowSecurityDrawer(false)}
              >
                Close
              </button>
            </div>
            <ChapterAuthorityBar
              memberships={memberships}
              selectedChapterId={selectedChapterId}
              context={chapterContext}
              access={chapterAccess}
              nextCursor={membershipCursor}
              drafts={drafts}
              onSelectChapter={onSelectChapter}
              onLoadMoreMemberships={onLoadMoreMemberships}
              onRefreshAccess={onRefreshAccess}
            />
            <AuthGate
              connection={connection}
              onRetryHealth={onRetryHealth}
              session={session}
              onSessionUpdated={onSessionUpdated}
              soundEnabled={soundEnabled}
              onNotify={onNotify}
            />
          </section>
        )}
      </div>
    </main>
  );
}
