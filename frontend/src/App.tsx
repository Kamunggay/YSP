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
import { ChapterAuthorityBar } from './components/ChapterAuthorityBar.tsx';
import { OperationBanner } from './components/OperationBanner.tsx';
import { Stage1ReverbClient, type RealtimeStatus } from './realtime/reverbClient.ts';
import { memoryDraftStore, type MemoryDraftEntry } from './state/memoryDraftStore.ts';
import { ActualIssueWorkspace } from './workspaces/ActualIssueWorkspace.tsx';
import { CatalogueWorkspace } from './workspaces/CatalogueWorkspace.tsx';
import { OpeningBaselineWorkspace } from './workspaces/OpeningBaselineWorkspace.tsx';
import { PaperEvidenceWorkspace } from './workspaces/PaperEvidenceWorkspace.tsx';
import { RequisitionWorkspace } from './workspaces/RequisitionWorkspace.tsx';
import { ReservationAndHoldWorkspace } from './workspaces/ReservationAndHoldWorkspace.tsx';
import { StockWorkspace } from './workspaces/StockWorkspace.tsx';
import './styles/stage1.css';

const NAV_ITEMS: Array<{ id: WorkspaceTab; code: string; label: string; section: string }> = [
  { id: 'my_work', code: 'S-02', label: 'My Work & Notices', section: 'Command Center' },
  { id: 'requisitions', code: 'S-03/04', label: 'Internal RFs', section: 'Demand & Allocation' },
  { id: 'reservations_holds', code: 'S-07/09', label: 'Reservations & Holds', section: 'Demand & Allocation' },
  { id: 'actual_issues', code: 'S-07/08', label: 'Signed Actual Issues', section: 'Demand & Allocation' },
  { id: 'stock', code: 'S-08', label: '7 Stock Views & Eligibility', section: 'Inventory & Baseline' },
  { id: 'catalogue', code: 'P05', label: 'Catalogue & Precision', section: 'Inventory & Baseline' },
  { id: 'opening', code: 'S-13', label: 'Opening IPC / RM', section: 'Inventory & Baseline' },
  { id: 'evidence', code: 'DOC-08', label: 'Paper Evidence', section: 'Inventory & Baseline' },
];

export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [healthAttempt, setHealthAttempt] = useState(0);

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
  }, [session, selectedChapterId, loadMemberships, loadChapterState, clearProtectedState]);

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

  if (sessionBooting) {
    return (
      <main style={{ maxWidth: '48rem', margin: '10vh auto', padding: '2rem' }}>
        <h1>YSP Stage 1 Workspace</h1>
        <p role="status" className={`connection ${connection}`}>
          {connection === 'checking'
            ? 'Checking connection...'
            : connection === 'connected'
              ? 'Laravel and MySQL are connected.'
              : 'Connection unavailable. Check that the local services are running, then try again.'}
        </p>
      </main>
    );
  }

  if (!session || session.state !== 'authenticated') {
    return (
      <div className="stage1-app">
        <header className="topbar">
          <div className="topbar-brand">
            <h1>YSP Chapter Operations</h1>
            <span className="topbar-sub">Stage 1 Connected Operations</span>
          </div>
          <span className={`status-pill ${connection === 'connected' ? 'ok' : connection === 'unavailable' ? 'bad' : ''}`}>
            DB: {connection}
          </span>
        </header>
        <AuthGate
          connection={connection}
          onRetryHealth={retryHealth}
          session={session}
          onSessionUpdated={handleSessionUpdated}
        />
      </div>
    );
  }

  return (
    <div className="stage1-app">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>YSP Chapter Operations</h1>
          <span className="topbar-sub">Stage 1 ({session.user.display_name})</span>
        </div>
        <div className="topbar-meta">
          <span className={`status-pill ${connection === 'connected' ? 'ok' : 'bad'}`}>DB: {connection}</span>
          <span
            className={`status-pill ${
              realtimeStatus === 'connected' ? 'ok' : realtimeStatus === 'stale_reconnect' ? 'warn' : 'bad'
            }`}
            title={realtimeDetail}
          >
            Reverb WS: {realtimeStatus}
          </span>
          <span className="status-pill">Auth: {session.authentication_method}</span>
        </div>
      </header>

      <div className="shell-grid">
        <nav className="sidenav" aria-label="Stage 1 destinations">
          {(['Command Center', 'Demand & Allocation', 'Inventory & Baseline'] as const).map((sec) => (
            <div key={sec}>
              <div className="nav-section-label">{sec}</div>
              {NAV_ITEMS.filter((item) => item.section === sec).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
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
              setGlobalError(null);
              setChapterContext(null);
              setChapterAccess(null);
              setSelectedChapterId(cid);
            }}
            onLoadMoreMemberships={() => void loadMemberships(membershipCursor)}
            onRefreshAccess={() => {
              if (selectedChapterId) {
                void loadChapterState(selectedChapterId, contextGenRef.current);
              }
            }}
          />

          {activeTab === 'my_work' && (
            <div className="grid-2">
              <div className="card">
                <h2>My Work &amp; Realtime Invalidations (`S-02` / `Ticket 09`)</h2>
                <p className="muted">
                  Authorized channel events trigger fresh permitted HTTP reads—events never broadcast protected secrets or authorize mutations.
                </p>
                {recentNotices.length === 0 ? (
                  <p className="muted">No committed change notices received in this session yet.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.1rem', fontSize: '0.86rem' }}>
                    {recentNotices.map((n) => (
                      <li key={n.event_id} style={{ marginBottom: '0.35rem' }}>
                        <span className="mono">{n.event_name}</span> · {n.resource_kind} <span className="mono">{n.resource_id}</span> @{' '}
                        {formatManilaTime(n.committed_at)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h2>Quarantined In-Memory Drafts (No localStorage)</h2>
                {drafts.length === 0 ? (
                  <p className="muted">No unsaved form buffers held in RAM.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.1rem', fontSize: '0.86rem' }}>
                    {drafts.map((d) => (
                      <li key={`${d.chapterId}-${d.formKey}`}>
                        <strong>{d.label}</strong> (Chapter <span className="mono">{d.chapterId}</span>, saved {formatManilaTime(d.updatedAtIso)})
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
                />
              )}
              {activeTab === 'stock' && <StockWorkspace chapterId={selectedChapterId} refreshSignal={refreshSignal} />}
              {activeTab === 'evidence' && <PaperEvidenceWorkspace chapterId={selectedChapterId} />}
              {activeTab === 'opening' && <OpeningBaselineWorkspace chapterId={selectedChapterId} refreshSignal={refreshSignal} />}
              {activeTab === 'requisitions' && (
                <RequisitionWorkspace
                  key={`${session.user.id}::${selectedChapterId}`}
                  userId={session.user.id}
                  chapterId={selectedChapterId}
                  refreshSignal={refreshSignal}
                />
              )}
              {activeTab === 'reservations_holds' && (
                <ReservationAndHoldWorkspace chapterId={selectedChapterId} refreshSignal={refreshSignal} />
              )}
              {activeTab === 'actual_issues' && <ActualIssueWorkspace chapterId={selectedChapterId} />}
            </>
          ) : (
            activeTab !== 'my_work' && (
              <div className="alert info">Select an authorized chapter above before loading chapter operations.</div>
            )
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
