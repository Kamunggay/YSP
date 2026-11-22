import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP25OperationsMapEngine } from './p25OperationsMapSlice';
import type {
  MapViewId,
  OperationsMapNode,
  P25ActionResult,
  P25EngineSnapshot,
  P25LookupResult,
  ScenarioTraceId,
} from './p25OperationsMapSlice';

type P25TabId = 'map' | 'resilience' | 'history';

interface P25OperationsMapWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P25OperationsMapWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P25OperationsMapWorkspaceProps) {
  const engine = useMemo(() => createP25OperationsMapEngine(), []);
  const [snapshot, setSnapshot] = useState<P25EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P25TabId>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P25ActionResult | null>(snapshot.last_action);

  // Tab 1: View / Scenario & Scoped Node Inspector
  const [selectedNodeId, setSelectedNodeId] = useState('sales_payment_gate');
  const [inspChapterInput, setInspChapterInput] = useState('');
  const [inspActorInput, setInspActorInput] = useState('');
  const [inspProviderOnlyInput, setInspProviderOnlyInput] = useState(false);
  const [inspHasMembershipInput, setInspHasMembershipInput] = useState(true);
  const [inspDutiesInput, setInspDutiesInput] = useState('');
  const [inspectedNode, setInspectedNode] = useState<Omit<
    OperationsMapNode,
    'restricted_details'
  > | null>(null);

  // Tab 2: Map Failure Resilience Test
  const [coreActorInput, setCoreActorInput] = useState('');
  const [coreLabelInput, setCoreLabelInput] = useState('');
  const [coreQtyInput, setCoreQtyInput] = useState('');
  const [coreAtInput, setCoreAtInput] = useState('');

  // Tab 3: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P25ActionResult<P25LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P25ActionResult<T>): P25ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeViewMeta =
    snapshot.map_views.find((v) => v.view_id === snapshot.active_view_id) ?? snapshot.map_views[0];
  const activeScenario =
    snapshot.scenario_traces.find((s) => s.scenario_id === snapshot.active_scenario_id) ??
    snapshot.scenario_traces[0];

  function handleSelectView(viewId: MapViewId) {
    playClickPen(soundEnabled);
    refreshSnapshot(
      engine.selectMapViewAndScenario({
        view_id: viewId,
        scenario_id: snapshot.active_scenario_id,
      })
    );
  }

  function handleSelectScenario(scenarioId: ScenarioTraceId) {
    playClickPen(soundEnabled);
    refreshSnapshot(
      engine.selectMapViewAndScenario({
        view_id: snapshot.active_view_id,
        scenario_id: scenarioId,
      })
    );
  }

  function handleToggleTextAlt() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.toggleReadableTextAlternative({ enabled: !snapshot.text_alternative_enabled })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleInspectNode() {
    playClickPen(soundEnabled);
    const duties = inspDutiesInput
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    const res = refreshSnapshot(
      engine.inspectMapNodeOrFollowLink({
        node_id: selectedNodeId,
        actor_user_id: inspActorInput,
        actor_chapter_id: inspChapterInput.trim() || snapshot.chapter_id,
        is_provider_admin_only: inspProviderOnlyInput,
        has_chapter_membership: inspHasMembershipInput,
        actor_authorized_duties: duties,
        idempotency_key: nextSequentialKey('p25-insp'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setInspectedNode(res.data);
    } else {
      setInspectedNode(null);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleToggleOutage(unavailable: boolean) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.setMapRendererFailureMode({
        map_unavailable: unavailable,
        failure_reason: unavailable ? 'Simulated operations map renderer outage' : undefined,
      })
    );
    onNotify(res.ok ? 'info' : 'error', res.message);
  }

  function handleVerifyCorePosting() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.verifyCorePostingDuringMapFailure({
        actor_user_id: coreActorInput,
        action_label: coreLabelInput,
        quantity_posted: coreQtyInput,
        posted_at: coreAtInput,
        idempotency_key: nextSequentialKey('p25-core'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupOperationsMapOperation({
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
      engine.lookupOperationsMapOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleNodes = snapshot.map_nodes.filter(
    (n) =>
      !normalizedSearch ||
      n.screen_name.toLowerCase().includes(normalizedSearch) ||
      n.owning_duty.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p25-workspace">
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
                id="p25-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search operations nodes or duties"
                aria-label="Search operations map nodes"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Operations Architecture Map &amp; Interactive Scenario Tracer
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Operations architecture map tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p25-tab-map"
                  aria-selected={activeTab === 'map'}
                  className={`p03-filter-pill ${activeTab === 'map' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('map');
                  }}
                >
                  Views, Tracer &amp; Scope Inspector
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p25-tab-resilience"
                  aria-selected={activeTab === 'resilience'}
                  className={`p03-filter-pill ${activeTab === 'resilience' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('resilience');
                  }}
                >
                  Outage Resilience Check
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p25-tab-history"
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
                id="p25-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p25-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p25-overview-heading" className="p03-section-title">
              Supporting Reference Map — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p25-illustrative-banner">
                {snapshot.illustrative_label}
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Reference View</span>
              <span className="p03-axis-val" data-testid="p25-active-view-val">
                {snapshot.active_view_id}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Live Core Records</span>
              <span className="p03-axis-val" data-testid="p25-live-records-val">
                {snapshot.summary.live_records_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Diagram Renderer</span>
              <span className="p03-axis-val" data-testid="p25-map-status-val">
                {snapshot.map_unavailable ? 'unavailable' : 'online'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Text Alternative</span>
              <span className="p03-axis-val" data-testid="p25-text-alt-val">
                {snapshot.text_alternative_enabled ? 'on' : 'off'}
              </span>
            </div>
          </div>

          {snapshot.live_operational_records.length === 0 ? (
            <p className="p03-muted-copy" data-testid="p25-empty-live-records-notice">
              No live chapter transactions recorded yet. Diagrams below use illustrative reference
              walkthrough values only.
            </p>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p25-feedback-banner"
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

        {/* TAB 1: Map Views, Text Alternative & Scoped Node Inspector */}
        {activeTab === 'map' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p25-views-heading">
              <h2 id="p25-views-heading" className="p03-section-title">
                Architecture Views &amp; Accessible Tracer
              </h2>
              <div className="form-group">
                <label htmlFor="p25-view-select" className="form-label">
                  Operations View
                </label>
                <select
                  id="p25-view-select"
                  className="form-control"
                  value={snapshot.active_view_id}
                  onChange={(e) => handleSelectView(e.target.value as MapViewId)}
                >
                  {snapshot.map_views.map((v) => (
                    <option key={v.view_id} value={v.view_id}>
                      {v.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p25-scenario-select" className="form-label">
                  Illustrative Walkthrough Scenario
                </label>
                <select
                  id="p25-scenario-select"
                  className="form-control"
                  value={snapshot.active_scenario_id}
                  onChange={(e) => handleSelectScenario(e.target.value as ScenarioTraceId)}
                >
                  {snapshot.scenario_traces.map((s) => (
                    <option key={s.scenario_id} value={s.scenario_id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p25-toggle-text-alt-btn"
                  className="btn-batcave-secondary"
                  onClick={handleToggleTextAlt}
                >
                  {snapshot.text_alternative_enabled
                    ? 'Show Interactive Visual Map'
                    : 'Switch to Accessible Text Table'}
                </button>
              </div>

              {snapshot.map_unavailable ? (
                <div className="callout-banner is-error" data-testid="p25-map-outage-notice">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <div>
                    <strong>Supporting Map Unavailable</strong>
                    <div>
                      {snapshot.map_failure_reason ??
                        'Diagram renderer offline; use accessible text table or proceed to core tasks.'}
                    </div>
                  </div>
                </div>
              ) : null}

              {snapshot.text_alternative_enabled && activeScenario ? (
                <div data-testid="p25-text-alternative-panel">
                  <p>
                    <strong>{activeScenario.title}</strong> ({activeScenario.illustrative_label})
                  </p>
                  <ol>
                    {activeScenario.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : activeViewMeta && activeScenario ? (
                <div data-testid="p25-visual-map-panel">
                  <p>
                    <strong>{activeViewMeta.title}</strong>: {activeViewMeta.description}
                  </p>
                  <p className="p03-muted-copy">
                    Active tracer: {activeScenario.title} — {activeScenario.steps.join(' -> ')}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p25-insp-heading">
              <h2 id="p25-insp-heading" className="p03-section-title">
                Scoped Workflow Node Inspector
              </h2>
              <div className="form-group">
                <label htmlFor="p25-node-select" className="form-label">
                  Workflow Node
                </label>
                <select
                  id="p25-node-select"
                  className="form-control"
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                >
                  {visibleNodes.map((n) => (
                    <option key={n.node_id} value={n.node_id}>
                      {n.screen_name} ({n.owning_duty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p25-insp-chapter" className="form-label">
                  Officer Session Chapter ID
                </label>
                <input
                  id="p25-insp-chapter"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={inspChapterInput}
                  placeholder="1"
                  onChange={(e) => setInspChapterInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p25-insp-actor" className="form-label">
                  Inspecting Account ID
                </label>
                <input
                  id="p25-insp-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={inspActorInput}
                  placeholder="202"
                  onChange={(e) => setInspActorInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p25-insp-provider-only"
                  type="checkbox"
                  checked={inspProviderOnlyInput}
                  onChange={(e) => setInspProviderOnlyInput(e.target.checked)}
                />
                <label htmlFor="p25-insp-provider-only">
                  Account holds platform provisioning role only
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p25-insp-has-membership"
                  type="checkbox"
                  checked={inspHasMembershipInput}
                  onChange={(e) => setInspHasMembershipInput(e.target.checked)}
                />
                <label htmlFor="p25-insp-has-membership">
                  Holds separately approved chapter membership
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p25-insp-duties" className="form-label">
                  Assigned Chapter Duties
                </label>
                <input
                  id="p25-insp-duties"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={inspDutiesInput}
                  placeholder="finance_verifier"
                  onChange={(e) => setInspDutiesInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p25-inspect-node-btn"
                  className="btn-batcave-primary"
                  onClick={handleInspectNode}
                >
                  Inspect Scoped Node
                </button>
              </div>

              {inspectedNode ? (
                <div className="callout-banner" data-testid="p25-inspector-output">
                  <span className="callout-dot dot-success" aria-hidden="true" />
                  <div>
                    <strong>{inspectedNode.screen_name}</strong>
                    <div>Invariant: {inspectedNode.invariant_rule}</div>
                    <div className="p03-mono-inline">
                      Inputs: {inspectedNode.input_docs} | Route: {inspectedNode.next_route}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Map Outage Independence Verification */}
        {activeTab === 'resilience' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p25-outage-heading">
              <h2 id="p25-outage-heading" className="p03-section-title">
                Supporting Map Failure Simulation
              </h2>
              <p className="p03-muted-copy">
                The operations diagram is purely advisory. Even if map rendering fails, authorized
                chapter officers continue core stock and financial transactions uninterrupted.
              </p>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p25-simulate-outage-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleToggleOutage(true)}
                >
                  Simulate Map Outage
                </button>
                <button
                  type="button"
                  id="p25-restore-map-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleToggleOutage(false)}
                >
                  Restore Diagram View
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p25-core-heading">
              <h2 id="p25-core-heading" className="p03-section-title">
                Execute Authorized Core Action During Map Outage
              </h2>
              <div className="form-group">
                <label htmlFor="p25-core-actor" className="form-label">
                  Authorized Officer ID
                </label>
                <input
                  id="p25-core-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={coreActorInput}
                  placeholder="202"
                  onChange={(e) => setCoreActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p25-core-label" className="form-label">
                  Core Operational Posting
                </label>
                <input
                  id="p25-core-label"
                  type="text"
                  className="form-control"
                  value={coreLabelInput}
                  placeholder="Verify OR & release goods"
                  onChange={(e) => setCoreLabelInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p25-core-qty" className="form-label">
                  Quantity Committed
                </label>
                <input
                  id="p25-core-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={coreQtyInput}
                  placeholder="5"
                  onChange={(e) => setCoreQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p25-core-at" className="form-label">
                  Posting Time (UTC)
                </label>
                <input
                  id="p25-core-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={coreAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setCoreAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p25-verify-core-btn"
                  className="btn-batcave-primary"
                  onClick={handleVerifyCorePosting}
                >
                  Commit Core Operational Action
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p25-audit-heading">
              <h2 id="p25-audit-heading" className="p03-section-title">
                Operations Map Inspection &amp; Outage Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No inspection or outage check events recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p25-lookup-heading">
              <h2 id="p25-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p25-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p25-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p25-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p25-lookup-ulid-input"
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
                  id="p25-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p25-lookup-by-ulid-btn"
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
                        data-testid={`p25-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p25-lookup-result" aria-live="polite">
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
