import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP23BoothCloseoutEngine } from './p23BoothCloseoutSlice';
import type {
  BoothCloseoutRecord,
  P23ActionResult,
  P23EngineSnapshot,
  P23LookupResult,
} from './p23BoothCloseoutSlice';

type P23TabId = 'count' | 'resolve' | 'history';

interface P23BoothCloseoutWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P23BoothCloseoutWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P23BoothCloseoutWorkspaceProps) {
  const engine = useMemo(() => createP23BoothCloseoutEngine(), []);
  const [snapshot, setSnapshot] = useState<P23EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P23TabId>('count');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P23ActionResult | null>(snapshot.last_action);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Tab 1: Initialize Closeout Event & Post Independent Closing Count / Usable Return
  const [evCodeInput, setEvCodeInput] = useState('');
  const [evNameInput, setEvNameInput] = useState('');
  const [evCustodianInput, setEvCustodianInput] = useState('');
  const [evCashierInput, setEvCashierInput] = useState('');
  const [evCheckedOutInput, setEvCheckedOutInput] = useState('');
  const [evSoldInput, setEvSoldInput] = useState('');
  const [evFloatInput, setEvFloatInput] = useState('');
  const [evCashSalesInput, setEvCashSalesInput] = useState('');
  const [evRefundsInput, setEvRefundsInput] = useState('');
  const [evPriorDepsInput, setEvPriorDepsInput] = useState('');
  const [evPriorFloatRetInput, setEvPriorFloatRetInput] = useState('');
  const [evGcashSalesInput, setEvGcashSalesInput] = useState('');
  const [evGcashPriorInput, setEvGcashPriorInput] = useState('');

  const [cntActorInput, setCntActorInput] = useState('');
  const [cntUsableInput, setCntUsableInput] = useState('');
  const [cntDamagedInput, setCntDamagedInput] = useState('');
  const [cntMissingInput, setCntMissingInput] = useState('');
  const [cntSigHashInput, setCntSigHashInput] = useState('');
  const [cntAtInput, setCntAtInput] = useState('');

  // Tab 2: Variance Dual Approval, Remittance Settlement & Closure
  const [varHeadInput, setVarHeadInput] = useState('');
  const [varFinanceInput, setVarFinanceInput] = useState('');
  const [varNoteInput, setVarNoteInput] = useState('');
  const [varAtInput, setVarAtInput] = useState('');

  const [remActorInput, setRemActorInput] = useState('');
  const [remCashInput, setRemCashInput] = useState('');
  const [remFloatInput, setRemFloatInput] = useState('');
  const [remGcashInput, setRemGcashInput] = useState('');
  const [remRefInput, setRemRefInput] = useState('');
  const [remAtInput, setRemAtInput] = useState('');

  const [clsActorInput, setClsActorInput] = useState('');
  const [clsAtInput, setClsAtInput] = useState('');

  // Tab 3: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P23ActionResult<P23LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P23ActionResult<T>): P23ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeEvent: BoothCloseoutRecord | undefined =
    snapshot.closeout_events.find((e) => e.event_id === selectedEventId) ??
    snapshot.closeout_events[0];

  function handleInitializeEvent() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.initializeBoothCloseoutEvent({
        event_code: evCodeInput,
        event_name: evNameInput,
        custodian_user_id: evCustodianInput,
        cashier_user_id: evCashierInput,
        checked_out_qty: evCheckedOutInput,
        sold_qty: evSoldInput,
        float_issued_php: evFloatInput,
        cash_sales_php: evCashSalesInput,
        cash_refunds_executed_php: evRefundsInput,
        prior_sales_deposits_php: evPriorDepsInput,
        prior_float_returns_php: evPriorFloatRetInput,
        gcash_sales_verified_php: evGcashSalesInput,
        gcash_prior_remitted_php: evGcashPriorInput,
        idempotency_key: nextSequentialKey('p23-init'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedEventId(res.data.event_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostCount() {
    playClickPen(soundEnabled);
    if (!activeEvent) return;
    const res = refreshSnapshot(
      engine.recordIndependentClosingCountAndGoodReturn({
        event_id: activeEvent.event_id,
        counter_user_id: cntActorInput,
        usable_return_qty: cntUsableInput,
        damaged_qty: cntDamagedInput,
        unexplained_missing_qty: cntMissingInput,
        signature_hash: cntSigHashInput,
        counted_at: cntAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p23-count'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveVariance() {
    playClickPen(soundEnabled);
    if (!activeEvent) return;
    const res = refreshSnapshot(
      engine.approveBoothVarianceAdj({
        event_id: activeEvent.event_id,
        head_approver_id: varHeadInput,
        finance_approver_id: varFinanceInput,
        quarantine_treatment_note: varNoteInput,
        approved_at: varAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p23-var'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReconcileRemittance() {
    playClickPen(soundEnabled);
    if (!activeEvent) return;
    const res = refreshSnapshot(
      engine.recordBoothRemittanceAndFloatSettlement({
        event_id: activeEvent.event_id,
        reconciler_user_id: remActorInput,
        cash_remitted_php: remCashInput,
        float_returned_php: remFloatInput,
        gcash_remitted_verified_php: remGcashInput,
        settlement_reference: remRefInput,
        settled_at: remAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p23-remit'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCloseEvent() {
    playClickPen(soundEnabled);
    if (!activeEvent) return;
    const res = refreshSnapshot(
      engine.closeBoothEvent({
        event_id: activeEvent.event_id,
        closing_officer_id: clsActorInput,
        closed_at: clsAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p23-close'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupBoothCloseoutOperation({
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
      engine.lookupBoothCloseoutOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleEvents = snapshot.closeout_events.filter(
    (e) =>
      !normalizedSearch ||
      e.event_code.toLowerCase().includes(normalizedSearch) ||
      e.event_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p23-workspace">
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
                id="p23-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search close-out events"
                aria-label="Search booth close-out events"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Independent Booth Returns, Variance &amp; Remittance Close-Out
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Booth close-out workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p23-tab-count"
                  aria-selected={activeTab === 'count'}
                  className={`p03-filter-pill ${activeTab === 'count' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('count');
                  }}
                >
                  Closing Count &amp; Usable Returns
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p23-tab-resolve"
                  aria-selected={activeTab === 'resolve'}
                  className={`p03-filter-pill ${activeTab === 'resolve' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('resolve');
                  }}
                >
                  Variance ADJ, Remittance &amp; Close-Out
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p23-tab-history"
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
                id="p23-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p23-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p23-overview-heading" className="p03-section-title">
              Stock Custody &amp; Collection Reconciliation — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Event Status:{' '}
                <strong data-testid="p23-event-status-val">
                  {activeEvent?.status ?? 'none'}
                </strong>
              </span>
              <span className="p03-version-pill">
                Events: <strong>{visibleEvents.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Booth Custody Left</span>
              <span className="p03-axis-val" data-testid="p23-booth-custody-val">
                {snapshot.summary.booth_custody_remaining_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Stockroom Net Delta</span>
              <span className="p03-axis-val" data-testid="p23-stockroom-delta-val">
                {snapshot.summary.stockroom_net_delta_summary}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Sales Cash Due</span>
              <span className="p03-axis-val" data-testid="p23-sales-cash-due-val">
                {snapshot.summary.sales_cash_still_due_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Float Still Due</span>
              <span className="p03-axis-val" data-testid="p23-float-due-val">
                {snapshot.summary.float_still_due_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">GCash Still Due</span>
              <span className="p03-axis-val" data-testid="p23-gcash-due-val">
                {snapshot.summary.gcash_still_due_total}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p23-feedback-banner"
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

        {/* TAB 1: Initialize Close-Out & Post Independent Closing Count */}
        {activeTab === 'count' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p23-init-heading">
              <h2 id="p23-init-heading" className="p03-section-title">
                Load Event Custody &amp; Collection Summary
              </h2>
              <div className="form-group">
                <label htmlFor="p23-ev-code" className="form-label">
                  Event Reference
                </label>
                <input
                  id="p23-ev-code"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCodeInput}
                  placeholder="CEBU-EVT-2026-000001"
                  onChange={(e) => setEvCodeInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-name" className="form-label">
                  Event Name
                </label>
                <input
                  id="p23-ev-name"
                  type="text"
                  className="form-control"
                  value={evNameInput}
                  placeholder="Summit Close-Out"
                  onChange={(e) => setEvNameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-custodian" className="form-label">
                  Booth Custodian ID
                </label>
                <input
                  id="p23-ev-custodian"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCustodianInput}
                  placeholder="301"
                  onChange={(e) => setEvCustodianInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-cashier" className="form-label">
                  Booth Cashier ID
                </label>
                <input
                  id="p23-ev-cashier"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCashierInput}
                  placeholder="302"
                  onChange={(e) => setEvCashierInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-checked-out" className="form-label">
                  Signed Checkout Qty
                </label>
                <input
                  id="p23-ev-checked-out"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCheckedOutInput}
                  placeholder="100"
                  onChange={(e) => setEvCheckedOutInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-sold" className="form-label">
                  Verified Sold Qty
                </label>
                <input
                  id="p23-ev-sold"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evSoldInput}
                  placeholder="30"
                  onChange={(e) => setEvSoldInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-float" className="form-label">
                  Float Issued (PHP)
                </label>
                <input
                  id="p23-ev-float"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evFloatInput}
                  placeholder="2000.00"
                  onChange={(e) => setEvFloatInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-cash-sales" className="form-label">
                  Verified Cash Sales (PHP)
                </label>
                <input
                  id="p23-ev-cash-sales"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCashSalesInput}
                  placeholder="4500.00"
                  onChange={(e) => setEvCashSalesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-refunds" className="form-label">
                  Executed Cash Refunds (PHP)
                </label>
                <input
                  id="p23-ev-refunds"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evRefundsInput}
                  placeholder="500.00"
                  onChange={(e) => setEvRefundsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-prior-deps" className="form-label">
                  Prior Sales Cash Deposits (PHP)
                </label>
                <input
                  id="p23-ev-prior-deps"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evPriorDepsInput}
                  placeholder="1000.00"
                  onChange={(e) => setEvPriorDepsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-prior-float" className="form-label">
                  Prior Verified Float Returns (PHP)
                </label>
                <input
                  id="p23-ev-prior-float"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evPriorFloatRetInput}
                  placeholder="2000.00"
                  onChange={(e) => setEvPriorFloatRetInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-gcash-sales" className="form-label">
                  Official GCash Sales (PHP)
                </label>
                <input
                  id="p23-ev-gcash-sales"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evGcashSalesInput}
                  placeholder="3000.00"
                  onChange={(e) => setEvGcashSalesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-ev-gcash-prior" className="form-label">
                  Prior Verified GCash Settled (PHP)
                </label>
                <input
                  id="p23-ev-gcash-prior"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evGcashPriorInput}
                  placeholder="3000.00"
                  onChange={(e) => setEvGcashPriorInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p23-init-event-btn"
                  className="btn-batcave-secondary"
                  onClick={handleInitializeEvent}
                >
                  Load Close-Out Event
                </button>
              </div>
              {snapshot.closeout_events.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p23-empty-events-notice">
                  No booth close-out events initialized yet.
                </p>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p23-count-heading">
              <h2 id="p23-count-heading" className="p03-section-title">
                Independent Closing Count &amp; Signed Return
              </h2>
              <div className="form-group">
                <label htmlFor="p23-cnt-actor" className="form-label">
                  Independent Counter ID
                </label>
                <input
                  id="p23-cnt-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntActorInput}
                  placeholder="401"
                  onChange={(e) => setCntActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cnt-usable" className="form-label">
                  Usable Return Quantity
                </label>
                <input
                  id="p23-cnt-usable"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntUsableInput}
                  placeholder="70"
                  onChange={(e) => setCntUsableInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cnt-damaged" className="form-label">
                  Damaged Quantity
                </label>
                <input
                  id="p23-cnt-damaged"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntDamagedInput}
                  placeholder="0"
                  onChange={(e) => setCntDamagedInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cnt-missing" className="form-label">
                  Unexplained Missing Qty
                </label>
                <input
                  id="p23-cnt-missing"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntMissingInput}
                  placeholder="0"
                  onChange={(e) => setCntMissingInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cnt-hash" className="form-label">
                  Closing Count Signature SHA-256
                </label>
                <input
                  id="p23-cnt-hash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntSigHashInput}
                  placeholder="64 lowercase hex chars"
                  onChange={(e) => setCntSigHashInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cnt-at" className="form-label">
                  Count Verification Time (UTC)
                </label>
                <input
                  id="p23-cnt-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cntAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setCntAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p23-post-count-btn"
                  className="btn-batcave-primary"
                  onClick={handlePostCount}
                >
                  Post Signed Usable Return &amp; Count
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Variance Dual Approval, Remittance & Event Close-Out */}
        {activeTab === 'resolve' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p23-var-heading">
              <h2 id="p23-var-heading" className="p03-section-title">
                Dual Independent Variance &amp; Damage Approval
              </h2>
              <div className="form-group">
                <label htmlFor="p23-var-head" className="form-label">
                  Chapter Head Approver ID
                </label>
                <input
                  id="p23-var-head"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={varHeadInput}
                  placeholder="201"
                  onChange={(e) => setVarHeadInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-var-fin" className="form-label">
                  Finance Approver ID
                </label>
                <input
                  id="p23-var-fin"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={varFinanceInput}
                  placeholder="202"
                  onChange={(e) => setVarFinanceInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-var-note" className="form-label">
                  Quarantine &amp; Variance Treatment
                </label>
                <input
                  id="p23-var-note"
                  type="text"
                  className="form-control"
                  value={varNoteInput}
                  placeholder="Quarantine damaged units"
                  onChange={(e) => setVarNoteInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-var-at" className="form-label">
                  Approval Timestamp (UTC)
                </label>
                <input
                  id="p23-var-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={varAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setVarAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p23-approve-variance-btn"
                  className="btn-batcave-secondary"
                  onClick={handleApproveVariance}
                >
                  Approve Variance Adjustment
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p23-rem-heading">
              <h2 id="p23-rem-heading" className="p03-section-title">
                Reconcile Cash, Float &amp; GCash &amp; Close Event
              </h2>
              <div className="form-group">
                <label htmlFor="p23-rem-actor" className="form-label">
                  Independent Reconciler ID
                </label>
                <input
                  id="p23-rem-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remActorInput}
                  placeholder="202"
                  onChange={(e) => setRemActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-rem-cash" className="form-label">
                  Sales Cash Remitted (PHP)
                </label>
                <input
                  id="p23-rem-cash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remCashInput}
                  placeholder="3000.00"
                  onChange={(e) => setRemCashInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-rem-float" className="form-label">
                  Cash Float Returned (PHP)
                </label>
                <input
                  id="p23-rem-float"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remFloatInput}
                  placeholder="0.00"
                  onChange={(e) => setRemFloatInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-rem-gcash" className="form-label">
                  Official GCash Remitted (PHP)
                </label>
                <input
                  id="p23-rem-gcash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remGcashInput}
                  placeholder="0.00"
                  onChange={(e) => setRemGcashInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-rem-ref" className="form-label">
                  Settlement Reference
                </label>
                <input
                  id="p23-rem-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remRefInput}
                  placeholder="CASH-REM-3000"
                  onChange={(e) => setRemRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-rem-at" className="form-label">
                  Reconciliation Timestamp (UTC)
                </label>
                <input
                  id="p23-rem-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={remAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setRemAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p23-reconcile-btn"
                  className="btn-batcave-secondary"
                  onClick={handleReconcileRemittance}
                >
                  Verify Final Remittance
                </button>
              </div>

              <hr />
              <div className="form-group">
                <label htmlFor="p23-cls-actor" className="form-label">
                  Closing Officer ID
                </label>
                <input
                  id="p23-cls-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={clsActorInput}
                  placeholder="202"
                  onChange={(e) => setClsActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-cls-at" className="form-label">
                  Closure Timestamp (UTC)
                </label>
                <input
                  id="p23-cls-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={clsAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setClsAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p23-close-event-btn"
                  className="btn-batcave-primary"
                  onClick={handleCloseEvent}
                >
                  Complete Booth Event Closure
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p23-audit-heading">
              <h2 id="p23-audit-heading" className="p03-section-title">
                Close-Out, Variance &amp; Remittance Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No close-out movements or settlements recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p23-lookup-heading">
              <h2 id="p23-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p23-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p23-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p23-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p23-lookup-ulid-input"
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
                  id="p23-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p23-lookup-by-ulid-btn"
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
                        data-testid={`p23-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p23-lookup-result" aria-live="polite">
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
