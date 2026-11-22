import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP17CountVarianceAdjEngine } from './p17CountVarianceAdjSlice';
import type {
  CountVarianceAdjRecord,
  CountVarianceKind,
  LockedCustodyPosition,
  P17ActionResult,
  P17EngineSnapshot,
  P17LookupResult,
} from './p17CountVarianceAdjSlice';

type P17TabId = 'positions' | 'recount' | 'approvals' | 'history';

interface P17CountVarianceAdjWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P17CountVarianceAdjWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P17CountVarianceAdjWorkspaceProps) {
  const engine = useMemo(() => createP17CountVarianceAdjEngine(), []);
  const [snapshot, setSnapshot] = useState<P17EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P17TabId>('positions');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P17ActionResult | null>(snapshot.last_action);
  const [selectedPosId, setSelectedPosId] = useState('');
  const [selectedAdjId, setSelectedAdjId] = useState('');

  // Tab 1: Locked Positions & Direct Edit Guard
  const [posVariantInput, setPosVariantInput] = useState('');
  const [posItemInput, setPosItemInput] = useState('');
  const [posLocInput, setPosLocInput] = useState('');
  const [posCustodianInput, setPosCustodianInput] = useState('');
  const [posScaleInput, setPosScaleInput] = useState('');
  const [posUsableInput, setPosUsableInput] = useState('');
  const [posQuarInput, setPosQuarInput] = useState('');
  const [directEditValInput, setDirectEditValInput] = useState('');

  // Tab 2: Initiate ADJ & Second-Person Recount
  const [adjPrepInput, setAdjPrepInput] = useState('');
  const [adjKindInput, setAdjKindInput] = useState<CountVarianceKind>('positive_gain_discovery');
  const [adjQtyInput, setAdjQtyInput] = useState('');
  const [adjReasonInput, setAdjReasonInput] = useState('');
  const [adjHashInput, setAdjHashInput] = useState('');
  const [adjAtInput, setAdjAtInput] = useState('');

  const [recActorInput, setRecActorInput] = useState('');
  const [recQtyInput, setRecQtyInput] = useState('');
  const [recNotesInput, setRecNotesInput] = useState('');
  const [recAtInput, setRecAtInput] = useState('');

  // Tab 3: Dual Co-Approval & Once-Only Posting
  const [appSlotInput, setAppSlotInput] = useState<'chapter_head_slot' | 'finance_slot'>(
    'chapter_head_slot'
  );
  const [appActorInput, setAppActorInput] = useState('');
  const [appFallbackInput, setAppFallbackInput] = useState(false);
  const [appAtInput, setAppAtInput] = useState('');
  const [rejReasonInput, setRejReasonInput] = useState('');
  const [postActorInput, setPostActorInput] = useState('');
  const [postAtInput, setPostAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P17ActionResult<P17LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P17ActionResult<T>): P17ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activePos: LockedCustodyPosition | undefined =
    snapshot.custody_positions.find((p) => p.position_id === selectedPosId) ??
    snapshot.custody_positions[0];

  const activeAdj: CountVarianceAdjRecord | undefined =
    snapshot.variance_adjs.find((a) => a.adj_id === selectedAdjId) ?? snapshot.variance_adjs[0];

  function handleRegisterPos() {
    playClickPen(soundEnabled);
    if (posScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the custody position.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerLockedBaselinePosition({
        variant_id: posVariantInput,
        item_name: posItemInput,
        location_id: posLocInput,
        custodian_user_id: posCustodianInput,
        quantity_scale: Number(posScaleInput),
        recorded_usable_value: posUsableInput,
        quarantined_value: posQuarInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedPosId(res.data.position_id);
      setPosUsableInput('');
      setPosQuarInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAttemptDirectEdit() {
    playClickPen(soundEnabled);
    if (!activePos) return;
    const res = refreshSnapshot(
      engine.attemptDirectBalanceOverwrite({
        position_id: activePos.position_id,
        actor_user_id: '201',
        attempted_usable_value: directEditValInput || '12',
      })
    );
    onNotify('error', res.message);
  }

  function handleInitiateAdj() {
    playClickPen(soundEnabled);
    if (!activePos) return;
    const res = refreshSnapshot(
      engine.initiateCountVarianceAdj({
        position_id: activePos.position_id,
        preparer_user_id: adjPrepInput,
        variance_kind: adjKindInput,
        variance_quantity_value: adjQtyInput,
        reason: adjReasonInput,
        count_sheet_hash: adjHashInput,
        initiated_at: adjAtInput,
        idempotency_key: nextSequentialKey('p17-init'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedAdjId(res.data.adj_id);
      setAdjReasonInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordRecount() {
    playClickPen(soundEnabled);
    if (!activeAdj) return;
    const res = refreshSnapshot(
      engine.recordIndependentRecount({
        adj_id: activeAdj.adj_id,
        recounter_user_id: recActorInput,
        verified_quantity_value: recQtyInput,
        recount_notes: recNotesInput,
        recounted_at: recAtInput,
        expected_version: activeAdj.version,
        idempotency_key: nextSequentialKey('p17-rec'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveSlot() {
    playClickPen(soundEnabled);
    if (!activeAdj) return;
    const res = refreshSnapshot(
      engine.approveCountVarianceSlot({
        adj_id: activeAdj.adj_id,
        slot: appSlotInput,
        approver_user_id: appActorInput,
        is_independent_fallback: appFallbackInput,
        approved_at: appAtInput,
        expected_version: activeAdj.version,
        idempotency_key: nextSequentialKey(`p17-${appSlotInput}`),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRejectAdj() {
    playClickPen(soundEnabled);
    if (!activeAdj) return;
    const res = refreshSnapshot(
      engine.rejectCountVarianceAdj({
        adj_id: activeAdj.adj_id,
        reviewer_user_id: appActorInput,
        rejection_reason: rejReasonInput,
        rejected_at: appAtInput,
        expected_version: activeAdj.version,
        idempotency_key: nextSequentialKey('p17-rej'),
      })
    );
    if (res.ok) setRejReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostAdj() {
    playClickPen(soundEnabled);
    if (!activeAdj) return;
    const res = refreshSnapshot(
      engine.postApprovedCountVarianceAdj({
        adj_id: activeAdj.adj_id,
        actor_user_id: postActorInput,
        posted_at: postAtInput,
        expected_version: activeAdj.version,
        idempotency_key: nextSequentialKey('p17-post'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupCountVarianceOperation({
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
      engine.lookupCountVarianceOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleAdjs = snapshot.variance_adjs.filter(
    (a) =>
      !normalizedSearch ||
      a.adj_reference.toLowerCase().includes(normalizedSearch) ||
      a.reason.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p17-workspace">
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
                id="p17-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search variance slips or investigation reasons"
                aria-label="Search variance adjustments"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Independent Counts &amp; Stock-Variance Adjustments</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Stock variance workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p17-tab-positions"
                  aria-selected={activeTab === 'positions'}
                  className={`p03-filter-pill ${activeTab === 'positions' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('positions');
                  }}
                >
                  Custody Baselines
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p17-tab-recount"
                  aria-selected={activeTab === 'recount'}
                  className={`p03-filter-pill ${activeTab === 'recount' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('recount');
                  }}
                >
                  Variance Slip &amp; Recount
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p17-tab-approvals"
                  aria-selected={activeTab === 'approvals'}
                  className={`p03-filter-pill ${activeTab === 'approvals' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('approvals');
                  }}
                >
                  Dual Approval &amp; Execution
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p17-tab-history"
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
                id="p17-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p17-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p17-overview-heading" className="p03-section-title">
              Count Governance &amp; Custody Ledger — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Custody Positions: <strong>{snapshot.custody_positions.length}</strong>
              </span>
              <span className="p03-version-pill">
                Variance Slips: <strong>{snapshot.variance_adjs.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Recorded Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p17-usable-on-hand-val">
                {snapshot.summary.recorded_usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Quarantined Stock</span>
              <span className="p03-axis-val" data-testid="p17-quarantined-val">
                {snapshot.summary.quarantined_stock}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Pending Variance Slips</span>
              <span className="p03-axis-val" data-testid="p17-pending-count-val">
                {snapshot.summary.pending_variance_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Posted ADJ Movements</span>
              <span className="p03-axis-val" data-testid="p17-posted-count-val">
                {snapshot.summary.posted_adj_count}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p17-feedback-banner"
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

        {/* TAB 1: Custody Baselines */}
        {activeTab === 'positions' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p17-reg-pos-heading">
              <h2 id="p17-reg-pos-heading" className="p03-section-title">
                Register Locked Opening Custody Position
              </h2>
              <p className="p03-muted-copy">
                Locked baseline positions cannot be directly overwritten; later findings or count
                variances must follow second-person recount and dual Head + Finance approval.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-pos-variant" className="form-label">
                    Variant ID
                  </label>
                  <input
                    id="p17-pos-variant"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={posVariantInput}
                    placeholder="e.g. 71"
                    onChange={(e) => setPosVariantInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-pos-item" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p17-pos-item"
                    type="text"
                    className="form-control"
                    value={posItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setPosItemInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-pos-loc" className="form-label">
                    Location ID
                  </label>
                  <input
                    id="p17-pos-loc"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={posLocInput}
                    placeholder="e.g. LOC-MAIN"
                    onChange={(e) => setPosLocInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-pos-custodian" className="form-label">
                    Affected Custodian ID
                  </label>
                  <input
                    id="p17-pos-custodian"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={posCustodianInput}
                    placeholder="e.g. 105"
                    onChange={(e) => setPosCustodianInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-pos-usable" className="form-label">
                    Recorded Usable On-Hand
                  </label>
                  <input
                    id="p17-pos-usable"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={posUsableInput}
                    placeholder="e.g. 10"
                    onChange={(e) => setPosUsableInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-pos-quar" className="form-label">
                    Quarantined Stock
                  </label>
                  <input
                    id="p17-pos-quar"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={posQuarInput}
                    placeholder="e.g. 0"
                    onChange={(e) => setPosQuarInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p17-pos-scale" className="form-label">
                  Precision Scale
                </label>
                <select
                  id="p17-pos-scale"
                  className="form-control"
                  value={posScaleInput}
                  onChange={(e) => setPosScaleInput(e.target.value)}
                >
                  <option value="">Select scale...</option>
                  <option value="0">Scale 0 (Whole units)</option>
                  <option value="2">Scale 2 (0.01)</option>
                  <option value="3">Scale 3 (0.001)</option>
                  <option value="6">Scale 6 (0.000001)</option>
                </select>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-register-pos-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterPos}
                >
                  Register Locked Baseline Position
                </button>
              </div>

              <hr />
              <h3 className="p03-section-title">Verify Direct Balance Edit Lock</h3>
              <div className="form-group">
                <label htmlFor="p17-direct-edit-val" className="form-label">
                  Attempted Direct Overwrite Value
                </label>
                <input
                  id="p17-direct-edit-val"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={directEditValInput}
                  placeholder="e.g. 12"
                  onChange={(e) => setDirectEditValInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-direct-edit-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAttemptDirectEdit}
                >
                  Attempt Unapproved Direct Edit
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p17-pos-list-heading">
              <h2 id="p17-pos-list-heading" className="p03-section-title">
                Locked Custody Positions ({snapshot.custody_positions.length})
              </h2>
              {snapshot.custody_positions.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p17-empty-positions-notice">
                  No custody positions registered yet.
                </p>
              ) : (
                <div className="p03-queue-list">
                  {snapshot.custody_positions.map((pos) => (
                    <div key={pos.position_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {pos.item_name} ({pos.location_id})
                        </strong>
                        <span>
                          Usable: {pos.recorded_usable_on_hand.value} — Quarantine:{' '}
                          {pos.quarantined_stock.value} — Custodian {pos.custodian_user_id}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => {
                          setSelectedPosId(pos.position_id);
                          setActiveTab('recount');
                        }}
                      >
                        Prepare ADJ
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Variance Slip & Recount */}
        {activeTab === 'recount' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p17-init-adj-heading">
              <h2 id="p17-init-adj-heading" className="p03-section-title">
                Initiate Count Variance Adjustment Slip
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-adj-preparer" className="form-label">
                    Count Preparer ID
                  </label>
                  <input
                    id="p17-adj-preparer"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={adjPrepInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setAdjPrepInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-adj-kind" className="form-label">
                    Variance Finding Type
                  </label>
                  <select
                    id="p17-adj-kind"
                    className="form-control"
                    value={adjKindInput}
                    onChange={(e) => setAdjKindInput(e.target.value as CountVarianceKind)}
                  >
                    <option value="positive_gain_discovery">Positive Gain / Later Discovery</option>
                    <option value="negative_shortage">Negative Count Shortage</option>
                    <option value="damaged_quarantine">Damaged Unit Quarantine</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-adj-qty" className="form-label">
                    Variance Quantity
                  </label>
                  <input
                    id="p17-adj-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={adjQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setAdjQtyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-adj-at" className="form-label">
                    Count Timestamp (UTC)
                  </label>
                  <input
                    id="p17-adj-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={adjAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAdjAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-adj-hash" className="form-label">
                    Count Sheet SHA-256 Digest
                  </label>
                  <input
                    id="p17-adj-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={adjHashInput}
                    placeholder="64 lowercase hex chars"
                    onChange={(e) => setAdjHashInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-adj-reason" className="form-label">
                    Variance Investigation Note
                  </label>
                  <input
                    id="p17-adj-reason"
                    type="text"
                    className="form-control"
                    value={adjReasonInput}
                    placeholder="Found sealed carton"
                    onChange={(e) => setAdjReasonInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-initiate-adj-btn"
                  className="btn-batcave-primary"
                  onClick={handleInitiateAdj}
                >
                  Initiate Variance Slip (No Stock Change Yet)
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p17-recount-heading">
              <h2 id="p17-recount-heading" className="p03-section-title">
                Second-Person Physical Recount
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-rec-actor" className="form-label">
                    Independent Recounter ID
                  </label>
                  <input
                    id="p17-rec-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={recActorInput}
                    placeholder="Must differ (e.g. 302)"
                    onChange={(e) => setRecActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-rec-qty" className="form-label">
                    Verified Recount Quantity
                  </label>
                  <input
                    id="p17-rec-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={recQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setRecQtyInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-rec-notes" className="form-label">
                    Recount Verification Notes
                  </label>
                  <input
                    id="p17-rec-notes"
                    type="text"
                    className="form-control"
                    value={recNotesInput}
                    placeholder="Verified 2 extra units"
                    onChange={(e) => setRecNotesInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-rec-at" className="form-label">
                    Recount Time (UTC)
                  </label>
                  <input
                    id="p17-rec-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={recAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRecAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-record-recount-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordRecount}
                >
                  Confirm Independent Recount
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Dual Approval & Execution */}
        {activeTab === 'approvals' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p17-dual-app-heading">
              <h2 id="p17-dual-app-heading" className="p03-section-title">
                Required Chapter Head &amp; Finance Approvals
              </h2>
              <p className="p03-muted-copy">
                Neither the count preparer nor affected custodian may sign either approval slot. If
                Chapter Head and Finance duties overlap, an independent eligible alternate is
                required.
              </p>

              {activeAdj ? (
                <div className="session-ledger" data-testid="p17-adj-approval-matrix">
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Variance Slip</span>
                    <span className="session-ledger-val p03-mono-inline">
                      {activeAdj.adj_reference} ({activeAdj.status})
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Preparer / Custodian</span>
                    <span className="session-ledger-val p03-mono-inline">
                      {activeAdj.preparer_user_id} / {activeAdj.custodian_user_id} (Both Barred)
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Chapter Head Slot</span>
                    <span className="session-ledger-val">
                      {activeAdj.chapter_head_slot
                        ? `Signed by Officer ${activeAdj.chapter_head_slot.approver_user_id}`
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Finance / Fallback Slot</span>
                    <span className="session-ledger-val">
                      {activeAdj.finance_slot
                        ? `Signed by Officer ${activeAdj.finance_slot.approver_user_id}`
                        : 'Pending'}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-app-slot" className="form-label">
                    Approval Slot
                  </label>
                  <select
                    id="p17-app-slot"
                    className="form-control"
                    value={appSlotInput}
                    onChange={(e) =>
                      setAppSlotInput(e.target.value as 'chapter_head_slot' | 'finance_slot')
                    }
                  >
                    <option value="chapter_head_slot">Chapter Head Approval Slot</option>
                    <option value="finance_slot">Finance / Independent Fallback Slot</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p17-app-actor" className="form-label">
                    Eligible Approver ID
                  </label>
                  <input
                    id="p17-app-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={appActorInput}
                    placeholder="Approver ID (e.g. 201)"
                    onChange={(e) => setAppActorInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-app-at" className="form-label">
                    Approval Time (UTC)
                  </label>
                  <input
                    id="p17-app-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={appAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAppAtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-rej-reason" className="form-label">
                    Rejection Reason (If Declined)
                  </label>
                  <input
                    id="p17-rej-reason"
                    type="text"
                    className="form-control"
                    value={rejReasonInput}
                    placeholder="Optional decline reason"
                    onChange={(e) => setRejReasonInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p17-app-fallback-checkbox"
                  type="checkbox"
                  checked={appFallbackInput}
                  onChange={(e) => setAppFallbackInput(e.target.checked)}
                />
                <label htmlFor="p17-app-fallback-checkbox">
                  Acting as independent eligible fallback alternate
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-approve-slot-btn"
                  className="btn-batcave-primary"
                  onClick={handleApproveSlot}
                >
                  Sign Approval Slot
                </button>
                <button
                  type="button"
                  id="p17-reject-adj-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRejectAdj}
                >
                  Reject Variance Slip
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p17-post-heading">
              <h2 id="p17-post-heading" className="p03-section-title">
                Execute Approved Stock Adjustment (Once Only)
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-post-actor" className="form-label">
                    Posting Officer ID
                  </label>
                  <input
                    id="p17-post-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={postActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setPostActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-post-at" className="form-label">
                    Posting Time (UTC)
                  </label>
                  <input
                    id="p17-post-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={postAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setPostAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-post-adj-btn"
                  className="btn-batcave-primary"
                  onClick={handlePostAdj}
                >
                  Post Approved Stock Variance
                </button>
              </div>

              {visibleAdjs.length > 0 ? (
                <div className="p03-table-wrap" data-testid="p17-adjs-table">
                  <table className="p03-table">
                    <thead>
                      <tr>
                        <th>Slip Ref</th>
                        <th>Kind</th>
                        <th>Qty</th>
                        <th>Status / Gain Lot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAdjs.map((a) => (
                        <tr key={a.adj_id}>
                          <td className="p03-mono-inline">{a.adj_reference}</td>
                          <td>{a.variance_kind}</td>
                          <td className="p03-mono-inline">{a.variance_quantity.value}</td>
                          <td>{a.gain_lot_reference ?? a.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p17-history-heading">
              <h2 id="p17-history-heading" className="p03-section-title">
                Count Variance Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p17-history-list">
                  {snapshot.history.map((item) => (
                    <div key={item.event_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{item.action}</strong>
                        <span>
                          Actor {item.actor_user_id} — Target #{item.target_id}
                          {item.reason ? ` — ${item.reason}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p17-lookup-heading">
              <h2 id="p17-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p17-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p17-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p17-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p17-lookup-ulid-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupUlidInput}
                    placeholder="Operation ULID"
                    onChange={(e) => setLookupUlidInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p17-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p17-lookup-by-ulid-btn"
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
                        data-testid={`p17-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p17-lookup-result" aria-live="polite">
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
