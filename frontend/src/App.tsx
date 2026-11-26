import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, checkHealth, ContractApiError, formatManilaTime } from './api/client.ts';
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
import { ChapterAuthorityBar } from './components/ChapterAuthorityBar.tsx';
import { OperationBanner } from './components/OperationBanner.tsx';
import { Stage1ReverbClient, type RealtimeStatus } from './realtime/reverbClient.ts';
import { memoryDraftStore, type MemoryDraftEntry } from './state/memoryDraftStore.ts';
import { getInitialSoundsEnabled, playClickPen, playOutageSwitch } from './theme/batcaveAudio.ts';
import { ActualIssueWorkspace } from './workspaces/ActualIssueWorkspace.tsx';
import { CatalogueWorkspace } from './workspaces/CatalogueWorkspace.tsx';
import { OpeningBaselineWorkspace } from './workspaces/OpeningBaselineWorkspace.tsx';
import { PaperEvidenceWorkspace } from './workspaces/PaperEvidenceWorkspace.tsx';
import { RequisitionWorkspace } from './workspaces/RequisitionWorkspace.tsx';
import { ReservationAndHoldWorkspace } from './workspaces/ReservationAndHoldWorkspace.tsx';
import { StockWorkspace } from './workspaces/StockWorkspace.tsx';

const NAV_ITEMS: Array<{ id: WorkspaceTab; code: string; label: string; section: string }> = [
  { id: 'my_work', code: '01', label: 'My Work & Updates', section: 'Command Center' },
  { id: 'requisitions', code: '02', label: 'Requisitions', section: 'Demand & Allocation' },
  { id: 'reservations_holds', code: '03', label: 'Reservations & Holds', section: 'Demand & Allocation' },
  { id: 'actual_issues', code: '04', label: 'Issue Handovers', section: 'Demand & Allocation' },
  { id: 'stock', code: '05', label: 'Stock Levels & Eligibility', section: 'Inventory & Baseline' },
  { id: 'catalogue', code: '06', label: 'Item Catalogue', section: 'Inventory & Baseline' },
  { id: 'opening', code: '07', label: 'Opening Inventory', section: 'Inventory & Baseline' },
  { id: 'evidence', code: '08', label: 'Signed Documents', section: 'Inventory & Baseline' },
];

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

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('my_work');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');
  const [realtimeDetail, setRealtimeDetail] = useState<string | undefined>(undefined);
  const [recentNotices, setRecentNotices] = useState<Stage1EventNotice[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
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

  const preAuthHeaderMeta = (
    <span className={`status-pill ${connection === 'connected' ? 'ok' : connection === 'unavailable' ? 'bad' : 'warn'}`}>
      Database: {connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Checking' : 'Offline'}
    </span>
  );

  const authHeaderMeta =
    session && session.state === 'authenticated' ? (
      <>
        <span className={`status-pill ${connection === 'connected' ? 'ok' : 'bad'}`}>
          Database: {connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Checking' : 'Offline'}
        </span>
        <span
          className={`status-pill ${
            realtimeStatus === 'connected' ? 'ok' : realtimeStatus === 'stale_reconnect' ? 'warn' : 'bad'
          }`}
          title={realtimeDetail}
        >
          Live Sync: {realtimeStatus === 'connected' ? 'Active' : realtimeStatus === 'stale_reconnect' ? 'Reconnecting' : realtimeStatus === 'connecting' ? 'Connecting' : 'Standby'}
        </span>
        <span className="status-pill">
          Sign-In:{' '}
          {session.authentication_method === 'authenticator'
            ? 'Authenticator App'
            : session.authentication_method === 'recovery_code'
              ? 'Recovery Code'
              : 'Password'}
        </span>
      </>
    ) : (
      preAuthHeaderMeta
    );

  if (sessionBooting) {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
        headerMeta={preAuthHeaderMeta}
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
        headerMeta={preAuthHeaderMeta}
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
      headerMeta={authHeaderMeta}
    >
      <div className="stage1-app">
        <div className="shell-grid">
          <nav className="sidenav" aria-label="Workspace navigation">
            {(['Command Center', 'Demand & Allocation', 'Inventory & Baseline'] as const).map((sec) => (
              <div key={sec}>
                <div className="nav-section-label">{sec}</div>
                {NAV_ITEMS.filter((item) => item.section === sec).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setActiveTab(item.id);
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="nav-code">{item.code}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <main className="workspace-main">
            <OperationBanner error={globalError} />

            <ChapterAuthorityBar
              memberships={memberships}
              selectedChapterId={selectedChapterId}
              context={chapterContext}
              access={chapterAccess}
              nextCursor={membershipCursor}
              drafts={drafts}
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
            />

            {activeTab === 'my_work' && (
              <div className="grid-2">
                <div className="card">
                  <h2>My Work &amp; Recent Updates</h2>
                  <p className="muted" style={{ marginBottom: '0.65rem' }}>
                    Updates appear here automatically whenever records in your chapter change.
                  </p>
                  {recentNotices.length === 0 ? (
                    <p className="muted">No recent chapter updates in this session yet.</p>
                  ) : (
                    <ul style={{ paddingLeft: '1.1rem', fontSize: '0.86rem' }}>
                      {recentNotices.map((n) => (
                        <li key={n.event_id} style={{ marginBottom: '0.35rem' }}>
                          <span>{n.event_name.replace(/^stage1\./, '').replace(/\.v\d+$/, '').replace(/\./g, ' ')}</span> ·{' '}
                          {n.resource_kind.replace(/_/g, ' ')}{' '}
                          <span className="mono">{n.resource_id}</span> @ {formatManilaTime(n.committed_at)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="card">
                  <h2>Unsaved Drafts (This Session Only)</h2>
                  {drafts.length === 0 ? (
                    <p className="muted">No unsaved form drafts stored in this session.</p>
                  ) : (
                    <ul style={{ paddingLeft: '1.1rem', fontSize: '0.86rem' }}>
                      {drafts.map((d) => (
                        <li key={`${d.chapterId}-${d.formKey}`}>
                          <strong>{d.label}</strong> (Chapter{' '}
                          <span className="mono">
                            {memberships.find((m) => m.chapter.id === d.chapterId)?.chapter.reference ?? d.chapterId}
                          </span>
                          , saved{' '}
                          {formatManilaTime(d.updatedAtIso)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'my_work' && (
              <AuthGate
                connection={connection}
                onRetryHealth={retryHealth}
                session={session}
                onSessionUpdated={handleSessionUpdated}
                soundEnabled={soundEnabled}
                onNotify={handleNotify}
              />
            )}

            {selectedChapterId ? (
              <>
                {activeTab === 'catalogue' && (
                  <CatalogueWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'stock' && (
                  <StockWorkspace
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'evidence' && (
                  <PaperEvidenceWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'opening' && (
                  <OpeningBaselineWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'requisitions' && (
                  <RequisitionWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'reservations_holds' && (
                  <ReservationAndHoldWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
                {activeTab === 'actual_issues' && (
                  <ActualIssueWorkspace
                    key={`${session.user.id}::${selectedChapterId}`}
                    userId={session.user.id}
                    chapterId={selectedChapterId}
                    refreshSignal={refreshSignal}
                    chapterAccess={chapterAccess}
                  />
                )}
              </>
            ) : (
              activeTab !== 'my_work' && (
                <div className="alert info">Select an authorized chapter above before loading chapter operations.</div>
              )
            )}
          </main>
        </div>
      </div>
    </BatCaveShell>
  );
}

export default App;
