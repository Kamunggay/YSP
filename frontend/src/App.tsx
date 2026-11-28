import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiMutate, checkHealth, ContractApiError } from './api/client.ts';
import type {
  ChapterAccessSnapshot,
  ChapterContext,
  ChapterMembership,
  ConnectionState,
  SessionProjection,
  Stage1EventNotice,
  WorkspaceTab,
} from './api/types.ts';
import { AuthGate } from './components/AuthGate.tsx';
import { BatCaveShell } from './components/BatCaveShell.tsx';
import { useBatCaveToast } from './components/batcaveToast.ts';
import { OperationBanner } from './components/OperationBanner.tsx';
import { S02Dashboard } from './components/S02Dashboard.tsx';
import { getRefreshDomainsForNotice } from './realtime/stage2NoticeRouter.ts';
import type { Stage2RefreshDomain } from './realtime/stage2NoticeRouter.ts';
import { Stage1ReverbClient, type RealtimeStatus } from './realtime/reverbClient.ts';
import { memoryDraftStore, type MemoryDraftEntry } from './state/memoryDraftStore.ts';
import { getInitialSoundsEnabled, playClickPen, playOutageSwitch } from './theme/batcaveAudio.ts';
import { ActualIssueWorkspace } from './workspaces/ActualIssueWorkspace.tsx';
import { CatalogueWorkspace } from './workspaces/CatalogueWorkspace.tsx';
import { OpeningBaselineWorkspace } from './workspaces/OpeningBaselineWorkspace.tsx';
import { PaperEvidenceWorkspace } from './workspaces/PaperEvidenceWorkspace.tsx';
import { QuotationPurchaseOrderWorkspace } from './workspaces/QuotationPurchaseOrderWorkspace.tsx';
import { ReceivingDiscrepancyHoldWorkspace } from './workspaces/ReceivingDiscrepancyHoldWorkspace.tsx';
import { ReplenishmentRepfWorkspace } from './workspaces/ReplenishmentRepfWorkspace.tsx';
import { RequisitionWorkspace } from './workspaces/RequisitionWorkspace.tsx';
import { ReservationAndHoldWorkspace } from './workspaces/ReservationAndHoldWorkspace.tsx';
import { Stage2AlertsReportsWorkspace } from './workspaces/Stage2AlertsReportsWorkspace.tsx';
import { DonationRestrictionWorkspace } from './workspaces/DonationRestrictionWorkspace.tsx';
import { StockWorkspace } from './workspaces/StockWorkspace.tsx';
import {
  resetStage2Preview,
  setStage2PreviewEnabled,
} from './fixtures/stage2Fixtures.ts';
import { stage2EvidenceStore } from './state/stage2EvidenceStore.ts';

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [healthAttempt, setHealthAttempt] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getInitialSoundsEnabled());
  const { toast, isExiting, showToast, dismissToast } = useBatCaveToast();

  const [session, setSession] = useState<SessionProjection | null>(null);
  const [sessionBooting, setSessionBooting] = useState(true);
  const [globalError, setGlobalError] = useState<unknown>(null);

  const [memberships, setMemberships] = useState<ChapterMembership[]>([]);
  const [membershipCursor, setMembershipCursor] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterContext, setChapterContext] = useState<ChapterContext | null>(null);
  const [chapterAccess, setChapterAccess] = useState<ChapterAccessSnapshot | null>(null);
  const [stage2PreviewEnabled, setStage2PreviewState] = useState(false);
  const [stage2DeepLink, setStage2DeepLink] = useState<{
    repfId?: string;
    poId?: string;
    daId?: string;
  }>({});
  const [rfHandoff, setRfHandoff] = useState<{
    rfId: string;
    rfLineId?: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('my_work');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');
  const [realtimeDetail, setRealtimeDetail] = useState<string | undefined>(undefined);
  const [recentNotices, setRecentNotices] = useState<Stage1EventNotice[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [stage2DomainSignals, setStage2DomainSignals] = useState<
    Partial<Record<Stage2RefreshDomain, number>>
  >({});
  const [drafts, setDrafts] = useState<MemoryDraftEntry[]>([]);

  const reverbRef = useRef<Stage1ReverbClient | null>(null);
  const contextGenRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then((state) => {
      if (!controller.signal.aborted) {
        setConnection(state);
      }
    });
    return () => controller.abort();
  }, [healthAttempt]);

  function retryHealth() {
    playClickPen(soundEnabled);
    setConnection('checking');
    setHealthAttempt((a) => a + 1);
  }

  const clearProtectedState = useCallback((purgeUserId?: string) => {
    contextGenRef.current += 1;
    reverbRef.current?.disconnect();
    if (purgeUserId) {
      memoryDraftStore.purgeUser(purgeUserId);
    } else {
      memoryDraftStore.purgeAll();
    }
    setMemberships([]);
    setMembershipCursor(null);
    setSelectedChapterId(null);
    setChapterContext(null);
    setChapterAccess(null);
    setRecentNotices([]);
  }, []);

  const loadMemberships = useCallback(async (cursor?: string | null) => {
    const qs = cursor ? `?limit=25&cursor=${encodeURIComponent(cursor)}` : '?limit=25';
    const res = await apiGet<ChapterMembership[]>(`/api/v1/auth/memberships${qs}`);
    setMemberships((prev) => (cursor ? [...prev, ...res.data] : res.data));
    setMembershipCursor(res.page?.next_cursor ?? null);
    if (!cursor && res.data.length === 1) {
      setSelectedChapterId(res.data[0].chapter.id);
    }
  }, []);

  const loadChapterState = useCallback(
    async (cid: string, gen: number) => {
      try {
        const [ctxRes, accRes] = await Promise.all([
          apiGet<ChapterContext>(`/api/v1/chapters/${cid}/context`),
          apiGet<ChapterAccessSnapshot>(`/api/v1/chapters/${cid}/access`),
        ]);
        if (gen !== contextGenRef.current) {
          return;
        }
        setChapterContext(ctxRes.data);
        setChapterAccess(accRes.data);
        setRefreshSignal((s) => s + 1);
      } catch (err) {
        if (gen !== contextGenRef.current) {
          return;
        }
        if (err instanceof ContractApiError && (err.status === 401 || err.code === 'mfa_incomplete')) {
          setSession(null);
          clearProtectedState();
        } else {
          setGlobalError(err);
        }
      }
    },
    [clearProtectedState],
  );

  useEffect(() => {
    let cancelled = false;
    async function bootstrapSession() {
      try {
        const res = await apiGet<SessionProjection>('/api/v1/auth/session');
        if (!cancelled) {
          setSession(res.data);
          setDrafts(res.data.state === 'authenticated' ? memoryDraftStore.listAllForUser(res.data.user.id) : []);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setSessionBooting(false);
        }
      }
    }
    void bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || session.state !== 'authenticated') {
      return;
    }
    return memoryDraftStore.subscribe(() => {
      setDrafts(memoryDraftStore.listAllForUser(session.user.id));
    });
  }, [session]);

  useEffect(() => {
    if (!session || session.state !== 'authenticated') {
      return;
    }
    let active = true;
    void (async () => {
      try {
        await loadMemberships();
      } catch (err: unknown) {
        if (active) {
          setGlobalError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session, loadMemberships]);

  useEffect(() => {
    if (!session || session.state !== 'authenticated' || !selectedChapterId) {
      return;
    }
    contextGenRef.current += 1;
    const gen = contextGenRef.current;
    let active = true;
    void (async () => {
      if (active) {
        await loadChapterState(selectedChapterId, gen);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, selectedChapterId, loadChapterState]);

  useEffect(() => {
    if (!session || session.state !== 'authenticated') {
      reverbRef.current?.disconnect();
      return;
    }
    if (!reverbRef.current) {
      reverbRef.current = new Stage1ReverbClient({
        onStatus: (st, detail) => {
          setRealtimeStatus(st);
          setRealtimeDetail(detail);
        },
        onNotice: (notice) => {
          playOutageSwitch(soundEnabled);
          setRecentNotices((prev) => [notice, ...prev].slice(0, 25));
          if (notice.event_name === 'stage1.authority.changed.v1') {
            void loadMemberships().catch((err: unknown) => setGlobalError(err));
          }
          if (notice.chapter_id && notice.chapter_id === selectedChapterId) {
            setRefreshSignal((s) => s + 1);
            const domains = getRefreshDomainsForNotice(notice);
            if (domains.length > 0) {
              setStage2DomainSignals((prev) => {
                const next = { ...prev };
                for (const d of domains) {
                  next[d] = (next[d] ?? 0) + 1;
                }
                return next;
              });
            }
          }
        },
        onResyncNeeded: () => {
          void apiGet<SessionProjection>('/api/v1/auth/session')
            .then((s) => {
              setSession(s.data);
              if (s.data.state === 'authenticated' && selectedChapterId) {
                return loadChapterState(selectedChapterId, contextGenRef.current);
              }
              return undefined;
            })
            .catch(() => {
              setSession(null);
              clearProtectedState();
            });
        },
      });
    }
    reverbRef.current.connect(session.user.id, selectedChapterId);
    return () => {
      reverbRef.current?.disconnect();
    };
  }, [session, selectedChapterId, loadMemberships, loadChapterState, clearProtectedState, soundEnabled]);

  function handleSessionUpdated(next: SessionProjection | null) {
    const prevUserId = session?.user.id;
    setSession(next);
    setGlobalError(null);
    if (!next || next.state !== 'authenticated' || (prevUserId && prevUserId !== next.user.id)) {
      clearProtectedState(prevUserId);
      setDrafts([]);
    } else {
      setDrafts(memoryDraftStore.listAllForUser(next.user.id));
    }
  }

  function handleNotify(tone: 'success' | 'warning' | 'error' | 'info', text: string) {
    showToast({ tone, text });
  }

  function handleSelectTab(nextTab: WorkspaceTab) {
    playClickPen(soundEnabled);
    setActiveTab(nextTab);
  }

  function handleBackToDashboard() {
    playClickPen(soundEnabled);
    setActiveTab('my_work');
  }

  async function handleSignOut() {
    playClickPen(soundEnabled);
    try {
      await apiMutate<void>('POST', '/api/v1/auth/sign-out', null);
    } catch {
      // Clear local session state even if server session already expired
    }
    setStage2PreviewState(false);
    resetStage2Preview();
    stage2EvidenceStore.clearAll();
    setStage2DeepLink({});
    setRfHandoff(null);
    handleSessionUpdated(null);
    handleNotify('info', 'Signed out. Temporary session drafts cleared.');
  }

  if (sessionBooting) {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
        >
        <main className="status-shell">
          <div className="surface-card status-card">
            <div className="eyebrow">YSP Chapter Portal</div>
            <h1>YSP Chapter Operations</h1>
            <p role="status" className={`message connection ${connection}`}>
              {connection === 'checking'
                ? 'Checking server connection...'
                : connection === 'connected'
                  ? 'System ready and connected.'
                  : 'Connection unavailable. Check that the local services are running, then try again.'}
            </p>
            <div className="button-group">
              <button
                type="button"
                className="retry-button"
                disabled={connection === 'checking'}
                onClick={retryHealth}
              >
                Check connection
              </button>
            </div>
          </div>
        </main>
      </BatCaveShell>
    );
  }

  if (!session || session.state !== 'authenticated') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
        >
        <AuthGate
          connection={connection}
          onRetryHealth={retryHealth}
          session={session}
          onSessionUpdated={handleSessionUpdated}
          soundEnabled={soundEnabled}
          onNotify={handleNotify}
        />
      </BatCaveShell>
    );
  }

  return (
    <BatCaveShell
      soundEnabled={soundEnabled}
      onToggleSound={setSoundEnabled}
      toast={toast}
      toastExiting={isExiting}
      onDismissToast={dismissToast}
    >
      {activeTab === 'my_work' ? (
        <S02Dashboard
          session={session}
          connection={connection}
          realtimeStatus={realtimeStatus}
          realtimeDetail={realtimeDetail ?? null}
          memberships={memberships}
          membershipCursor={membershipCursor}
          selectedChapterId={selectedChapterId}
          chapterContext={chapterContext}
          chapterAccess={chapterAccess}
          recentNotices={recentNotices}
          drafts={drafts}
          refreshSignal={refreshSignal}
          globalError={globalError}
          onSelectTab={handleSelectTab}
          onSelectChapter={(cid) => {
            playClickPen(soundEnabled);
            setGlobalError(null);
            setChapterContext(null);
            setChapterAccess(null);
            setSelectedChapterId(cid);
          }}
          onLoadMoreMemberships={() => void loadMemberships(membershipCursor)}
          onRefreshAccess={() => {
            playClickPen(soundEnabled);
            if (selectedChapterId) {
              void loadChapterState(selectedChapterId, contextGenRef.current);
            }
          }}
          onTriggerRefresh={() => {
            playClickPen(soundEnabled);
            setRefreshSignal((s) => s + 1);
          }}
          onRetryHealth={retryHealth}
          onSessionUpdated={handleSessionUpdated}
          onNotify={handleNotify}
          soundEnabled={soundEnabled}
          onSignOut={() => void handleSignOut()}
        />
      ) : (
        <>
          <OperationBanner error={globalError} />
          {selectedChapterId ? (
            <>
              <div className="s2-preview-bar" role="region" aria-label="Stage 2 data mode">
                <div>
                  <strong>Stage 2 Mode:</strong>{' '}
                  {stage2PreviewEnabled ? (
                    <span className="s2-badge is-warning">
                      Contract Fixture Preview (In-Memory Sample Data)
                    </span>
                  ) : (
                    <span className="s2-badge is-ready">Live HTTP Backend</span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-batcave-secondary p02-compact-btn"
                  onClick={() => {
                    const next = !stage2PreviewEnabled;
                    setStage2PreviewState(next);
                    setStage2PreviewEnabled(next, selectedChapterId, (notice) => {
                      setRecentNotices((prev) => [notice, ...prev].slice(0, 25));
                      setRefreshSignal((s) => s + 1);
                    });
                    setRefreshSignal((s) => s + 1);
                  }}
                >
                  {stage2PreviewEnabled
                    ? 'Switch to Live Backend'
                    : 'Enable Contract Fixture Preview'}
                </button>
              </div>
              {activeTab === 'catalogue' && (
                <CatalogueWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterAccess={chapterAccess}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'stock' && (
                <StockWorkspace
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterAccess={chapterAccess}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'evidence' && (
                <PaperEvidenceWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterAccess={chapterAccess}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'opening' && (
                <OpeningBaselineWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterAccess={chapterAccess}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'requisitions' && (
                <RequisitionWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterAccess={chapterAccess}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'reservations_holds' && (
                <ReservationAndHoldWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterContext={chapterContext}
                  chapterAccess={chapterAccess}
                  initialRfId={rfHandoff?.rfId ?? null}
                  initialRfLineId={rfHandoff?.rfLineId ?? null}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'actual_issues' && (
                <ActualIssueWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  chapterContext={chapterContext}
                  chapterAccess={chapterAccess}
                  initialRfId={rfHandoff?.rfId ?? null}
                  initialRfLineId={rfHandoff?.rfLineId ?? null}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'replenishment_repf' && (
                <ReplenishmentRepfWorkspace
                  key={`${session.user.id}::${selectedChapterId}::repf`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  domainSignal={stage2DomainSignals.repf ?? stage2DomainSignals.replenishment ?? 0}
                  chapterAccess={chapterAccess}
                  previewEnabled={stage2PreviewEnabled}
                  initialRepfId={stage2DeepLink.repfId ?? null}
                  onNavigateTab={(tab, opts) => {
                    if (opts) setStage2DeepLink(opts);
                    setActiveTab(tab);
                  }}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'quotations_po' && (
                <QuotationPurchaseOrderWorkspace
                  key={`${session.user.id}::${selectedChapterId}::po`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  domainSignal={
                    (stage2DomainSignals.quotations ?? 0) +
                    (stage2DomainSignals.purchase_order ?? 0)
                  }
                  chapterAccess={chapterAccess}
                  previewEnabled={stage2PreviewEnabled}
                  initialRepfId={stage2DeepLink.repfId ?? null}
                  initialPoId={stage2DeepLink.poId ?? null}
                  onNavigateTab={(tab, opts) => {
                    if (opts) setStage2DeepLink(opts);
                    setActiveTab(tab);
                  }}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'receiving_discrepancies' && (
                <ReceivingDiscrepancyHoldWorkspace
                  key={`${session.user.id}::${selectedChapterId}::rcv`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  domainSignal={
                    (stage2DomainSignals.receiving_report ?? 0) +
                    (stage2DomainSignals.receiving_discrepancy ?? 0) +
                    (stage2DomainSignals.receiving_hold ?? 0)
                  }
                  chapterAccess={chapterAccess}
                  previewEnabled={stage2PreviewEnabled}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'donations_restrictions' && (
                <DonationRestrictionWorkspace
                  key={`${session.user.id}::${selectedChapterId}::da`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  domainSignal={stage2DomainSignals.donation ?? 0}
                  chapterAccess={chapterAccess}
                  previewEnabled={stage2PreviewEnabled}
                  initialDaId={stage2DeepLink.daId ?? null}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
              {activeTab === 'stage2_alerts_reports' && (
                <Stage2AlertsReportsWorkspace
                  key={`${session.user.id}::${selectedChapterId}::s2ar`}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                  domainSignal={
                    (stage2DomainSignals.alerts ?? 0) +
                    (stage2DomainSignals.allocation_queue ?? 0) +
                    (stage2DomainSignals.reports ?? 0)
                  }
                  chapterAccess={chapterAccess}
                  previewEnabled={stage2PreviewEnabled}
                  onHandoffAllocation={({ targetTab, rfId, rfLineId }) => {
                    setRfHandoff({ rfId, rfLineId });
                    setActiveTab(targetTab);
                  }}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onBackToDashboard={handleBackToDashboard}
                />
              )}
            </>
          ) : (
            <main className="p03-workspace-shell">
              <div className="p03-workspace-inner">
                <section className="p03-card surface-card">
                  <div className="p03-card-header-row">
                    <div>
                      <h1 className="p03-main-title">Select a Chapter</h1>
                      <p className="form-card-subtitle">
                        Choose an authorized chapter in My Work before opening chapter operations.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={handleBackToDashboard}
                    >
                      Back to Chapter Workspace
                    </button>
                  </div>
                </section>
              </div>
            </main>
          )}
        </>
      )}
    </BatCaveShell>
  );
}

export default App;
