import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP14TwoClocksExpiryEngine } from './p14TwoClocksExpirySlice';
import type {
  DualClockOrder,
  P14ActionResult,
  P14EngineSnapshot,
  P14LookupResult,
} from './p14TwoClocksExpirySlice';

type P14TabId = 'clocks' | 'funding' | 'expiry' | 'history';

interface P14TwoClocksExpiryWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P14TwoClocksExpiryWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P14TwoClocksExpiryWorkspaceProps) {
  const engine = useMemo(() => createP14TwoClocksExpiryEngine(), []);
  const [snapshot, setSnapshot] = useState<P14EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P14TabId>('clocks');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P14ActionResult | null>(snapshot.last_action);
  const [selectedOrderId, setSelectedOrderId] = useState('');

  // Tab 1: Register Dual-Clock Order
  const [regSoRefInput, setRegSoRefInput] = useState('');
  const [regVariantInput, setRegVariantInput] = useState('');
  const [regItemInput, setRegItemInput] = useState('');
  const [regScaleInput, setRegScaleInput] = useState('');
  const [regUsableInput, setRegUsableInput] = useState('');
  const [regRfInput, setRegRfInput] = useState('');
  const [regUnpaidSoInput, setRegUnpaidSoInput] = useState('');
  const [regPaidSoInput, setRegPaidSoInput] = useState('');
  const [regBackorderInput, setRegBackorderInput] = useState('');
  const [regSaleAmtInput, setRegSaleAmtInput] = useState('');
  const [regProcCostInput, setRegProcCostInput] = useState('');
  const [regCostApprovedInput, setRegCostApprovedInput] = useState(false);
  const [regCreatedAtInput, setRegCreatedAtInput] = useState('');
  const [regAcceptedAtInput, setRegAcceptedAtInput] = useState('');
  const [regPickupAtInput, setRegPickupAtInput] = useState('');

  // Tab 2: Scoped Funding & Funded RepF Gate
  const [fundScopeInput, setFundScopeInput] = useState<'backorder_deposit' | 'available_reservation'>(
    'backorder_deposit'
  );
  const [fundEvidenceInput, setFundEvidenceInput] = useState<'verified_or' | 'pending_screenshot'>(
    'verified_or'
  );
  const [fundOrRefInput, setFundOrRefInput] = useState('');
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [fundVerifiedAtInput, setFundVerifiedAtInput] = useState('');
  const [fundActorInput, setFundActorInput] = useState('');
  const [excessReasonInput, setExcessReasonInput] = useState('');
  const [repfActorInput, setRepfActorInput] = useState('');
  const [repfAtInput, setRepfAtInput] = useState('');
  const [repfRelabelInput, setRepfRelabelInput] = useState(false);

  // Tab 3: Deadline Evaluation & Late-Payment Resolution
  const [evalTimeInput, setEvalTimeInput] = useState('');
  const [evalActorInput, setEvalActorInput] = useState('');
  const [consumeQtyInput, setConsumeQtyInput] = useState('');
  const [lateOrRefInput, setLateOrRefInput] = useState('');
  const [lateQtyInput, setLateQtyInput] = useState('');
  const [lateAtInput, setLateAtInput] = useState('');
  const [lateFallbackInput, setLateFallbackInput] = useState<
    'convert_to_funded_backorder' | 'route_to_finance_refund'
  >('route_to_finance_refund');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P14ActionResult<P14LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P14ActionResult<T>): P14ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeOrder: DualClockOrder | undefined =
    snapshot.tracked_orders.find((o) => o.order_id === selectedOrderId) ??
    snapshot.tracked_orders[0];

  function handleRegisterOrder() {
    playClickPen(soundEnabled);
    if (regScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the tracked order.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerDualClockOrder({
        so_reference: regSoRefInput,
        variant_id: regVariantInput,
        item_name: regItemInput,
        quantity_scale: Number(regScaleInput),
        usable_on_hand_value: regUsableInput,
        rf_reserved_value: regRfInput,
        unpaid_available_reserved_value: regUnpaidSoInput,
        paid_available_reserved_value: regPaidSoInput,
        accepted_backorder_qty_value: regBackorderInput,
        agreed_sale_amount: regSaleAmtInput,
        estimated_procurement_cost: regProcCostInput,
        finance_cost_approved: regCostApprovedInput,
        reservation_created_at: regCreatedAtInput,
        backorder_accepted_at: regAcceptedAtInput.trim() || undefined,
        pickup_deadline_at: regPickupAtInput.trim() || undefined,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedOrderId(res.data.order_id);
      setRegSoRefInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveExcessCost() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.approveExcessProcurementCost({
        order_id: activeOrder.order_id,
        finance_user_id: fundActorInput.trim() || '201',
        buyer_acceptance_reason: excessReasonInput,
        approved_at: fundVerifiedAtInput.trim() || '2026-11-01T10:30:00Z',
        expected_version: activeOrder.version,
      })
    );
    if (res.ok) setExcessReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordFunding() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.recordScopedOrderFunding({
        order_id: activeOrder.order_id,
        funding_scope: fundScopeInput,
        evidence_kind: fundEvidenceInput,
        or_reference: fundOrRefInput,
        amount: fundAmountInput,
        verified_at: fundVerifiedAtInput,
        actor_user_id: fundActorInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p14-fund'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleForwardRepf() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.forwardShortageToPurchasingRepf({
        order_id: activeOrder.order_id,
        actor_user_id: repfActorInput,
        attempt_rf_rop_relabel: repfRelabelInput,
        forwarded_at: repfAtInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p14-repf'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleEvaluateClocks() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.evaluateOrderClocksAtTime({
        order_id: activeOrder.order_id,
        evaluation_time: evalTimeInput,
        actor_user_id: evalActorInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p14-eval'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleConsumeElsewhere() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.consumeAvailableStockElsewhere({
        order_id: activeOrder.order_id,
        consumed_quantity_value: consumeQtyInput,
        actor_user_id: evalActorInput.trim() || '105',
      })
    );
    if (res.ok) setConsumeQtyInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLatePayment() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.resolveLateVerifiedPayment({
        order_id: activeOrder.order_id,
        actor_user_id: evalActorInput.trim() || '202',
        or_reference: lateOrRefInput,
        requested_quantity_value: lateQtyInput,
        verified_at: lateAtInput,
        fallback_choice: lateFallbackInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p14-late'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupTwoClocksOperation({
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
      engine.lookupTwoClocksOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleOrders = snapshot.tracked_orders.filter(
    (o) =>
      !normalizedSearch ||
      o.so_reference.toLowerCase().includes(normalizedSearch) ||
      o.item_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p14-workspace">
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
                id="p14-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracked orders or items"
                aria-label="Search two-clock reservation records"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Two 48h Clocks, Funded Procurement &amp; Late Money</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Two-clock workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p14-tab-clocks"
                  aria-selected={activeTab === 'clocks'}
                  className={`p03-filter-pill ${activeTab === 'clocks' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('clocks');
                  }}
                >
                  Tracked Orders &amp; Clocks
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p14-tab-funding"
                  aria-selected={activeTab === 'funding'}
                  className={`p03-filter-pill ${activeTab === 'funding' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('funding');
                  }}
                >
                  Scoped Funding &amp; Procurement Gate
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p14-tab-expiry"
                  aria-selected={activeTab === 'expiry'}
                  className={`p03-filter-pill ${activeTab === 'expiry' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('expiry');
                  }}
                >
                  Expiry Sweep &amp; Late Payments
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p14-tab-history"
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
                id="p14-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p14-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p14-overview-heading" className="p03-section-title">
              Reservation Protection &amp; Expiry Scope — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Funded RepFs: <strong>{snapshot.repf_forwards.length}</strong>
              </span>
              <span className="p03-version-pill">
                Usable On-Hand: <strong data-testid="p14-usable-on-hand-val">{snapshot.summary.usable_on_hand}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Unpaid SO Reserved</span>
              <span className="p03-axis-val" data-testid="p14-unpaid-so-val">
                {snapshot.summary.active_unpaid_so_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Paid Protected Reserved</span>
              <span className="p03-axis-val" data-testid="p14-paid-so-val">
                {snapshot.summary.protected_paid_so_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Funded Backorder Qty</span>
              <span className="p03-axis-val" data-testid="p14-funded-backorder-val">
                {snapshot.summary.funded_backorder_qty}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val" data-testid="p14-available-val">
                {snapshot.summary.available_to_allocate}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p14-feedback-banner"
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

        {/* TAB 1: Tracked Orders & Clocks */}
        {activeTab === 'clocks' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p14-reg-order-heading">
              <h2 id="p14-reg-order-heading" className="p03-section-title">
                Register Dual-Clock Order &amp; Backorder Commitments
              </h2>
              <p className="p03-muted-copy">
                Tracks the 48-hour unpaid available-stock clock separately from the 48-hour
                accepted backorder deposit clock; RF and paid/funded quantities stay protected.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-so-ref" className="form-label">
                    Sales Order Reference
                  </label>
                  <input
                    id="p14-reg-so-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regSoRefInput}
                    placeholder="e.g. CEBU-SO-2026-000001"
                    onChange={(e) => setRegSoRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-variant-id" className="form-label">
                    Variant ID
                  </label>
                  <input
                    id="p14-reg-variant-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regVariantInput}
                    placeholder="e.g. 71"
                    onChange={(e) => setRegVariantInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-item-name" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p14-reg-item-name"
                    type="text"
                    className="form-control"
                    value={regItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setRegItemInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-scale" className="form-label">
                    Precision Scale
                  </label>
                  <select
                    id="p14-reg-scale"
                    className="form-control"
                    value={regScaleInput}
                    onChange={(e) => setRegScaleInput(e.target.value)}
                  >
                    <option value="">Select scale...</option>
                    <option value="0">Scale 0 (Whole units)</option>
                    <option value="2">Scale 2 (0.01)</option>
                    <option value="3">Scale 3 (0.001)</option>
                    <option value="6">Scale 6 (0.000001)</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-usable" className="form-label">
                    Usable On-Hand
                  </label>
                  <input
                    id="p14-reg-usable"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regUsableInput}
                    placeholder="e.g. 10"
                    onChange={(e) => setRegUsableInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-rf" className="form-label">
                    RF Reserved (Protected)
                  </label>
                  <input
                    id="p14-reg-rf"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regRfInput}
                    placeholder="e.g. 4"
                    onChange={(e) => setRegRfInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-unpaid-so" className="form-label">
                    Unpaid SO Available Qty
                  </label>
                  <input
                    id="p14-reg-unpaid-so"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regUnpaidSoInput}
                    placeholder="e.g. 3"
                    onChange={(e) => setRegUnpaidSoInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-paid-so" className="form-label">
                    Paid SO Available Qty
                  </label>
                  <input
                    id="p14-reg-paid-so"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regPaidSoInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setRegPaidSoInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-backorder" className="form-label">
                    Accepted Backorder Qty
                  </label>
                  <input
                    id="p14-reg-backorder"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regBackorderInput}
                    placeholder="e.g. 5"
                    onChange={(e) => setRegBackorderInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-sale-amt" className="form-label">
                    Agreed Sale Amount (PHP)
                  </label>
                  <input
                    id="p14-reg-sale-amt"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regSaleAmtInput}
                    placeholder="e.g. 1000.00"
                    onChange={(e) => setRegSaleAmtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-proc-cost" className="form-label">
                    Est. Procurement Cost (PHP)
                  </label>
                  <input
                    id="p14-reg-proc-cost"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regProcCostInput}
                    placeholder="e.g. 400.00"
                    onChange={(e) => setRegProcCostInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-created-at" className="form-label">
                    Clock 1 Created Time (UTC)
                  </label>
                  <input
                    id="p14-reg-created-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regCreatedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRegCreatedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-reg-accepted-at" className="form-label">
                    Backorder Accepted Time (UTC)
                  </label>
                  <input
                    id="p14-reg-accepted-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regAcceptedAtInput}
                    placeholder="Optional UTC instant"
                    onChange={(e) => setRegAcceptedAtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-reg-pickup-at" className="form-label">
                    Pickup Deadline (UTC)
                  </label>
                  <input
                    id="p14-reg-pickup-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={regPickupAtInput}
                    placeholder="Optional UTC instant"
                    onChange={(e) => setRegPickupAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p14-reg-cost-approved"
                  type="checkbox"
                  checked={regCostApprovedInput}
                  onChange={(e) => setRegCostApprovedInput(e.target.checked)}
                />
                <label htmlFor="p14-reg-cost-approved">
                  Finance approved estimated shortage procurement cost
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-register-order-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterOrder}
                >
                  Register Dual-Clock Order
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p14-orders-list-heading">
              <h2 id="p14-orders-list-heading" className="p03-section-title">
                Active Deadline Schedules ({visibleOrders.length})
              </h2>
              {visibleOrders.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p14-empty-orders-notice">
                  No dual-clock orders registered yet.
                </p>
              ) : (
                <div className="p03-queue-list" data-testid="p14-orders-list">
                  {visibleOrders.map((ord) => (
                    <div key={ord.order_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{ord.so_reference}</strong>
                        <span>
                          Available: {ord.unpaid_available_state} ({ord.unpaid_available_reserved.value})
                          {' — '}Backorder: {ord.backorder_state} ({ord.accepted_backorder_qty.value})
                          {ord.overdue_pickup_alert ? ' — OVERDUE PICKUP ALERT' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => {
                          setSelectedOrderId(ord.order_id);
                          setActiveTab('funding');
                        }}
                      >
                        Manage Funding
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Scoped Funding & Procurement Gate */}
        {activeTab === 'funding' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p14-funding-heading">
              <h2 id="p14-funding-heading" className="p03-section-title">
                Record Scoped Deposit or Full Payment Protection
              </h2>
              <p className="p03-muted-copy">
                Only timely Official Receipts protect their own designated portion; screenshots and
                backdated entries cannot manufacture protection.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-fund-scope" className="form-label">
                    Protection Scope
                  </label>
                  <select
                    id="p14-fund-scope"
                    className="form-control"
                    value={fundScopeInput}
                    onChange={(e) =>
                      setFundScopeInput(
                        e.target.value as 'backorder_deposit' | 'available_reservation'
                      )
                    }
                  >
                    <option value="backorder_deposit">Backorder Deposit Commitment</option>
                    <option value="available_reservation">Available Stock Full Payment</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p14-fund-evidence" className="form-label">
                    Payment Evidence
                  </label>
                  <select
                    id="p14-fund-evidence"
                    className="form-control"
                    value={fundEvidenceInput}
                    onChange={(e) =>
                      setFundEvidenceInput(e.target.value as 'verified_or' | 'pending_screenshot')
                    }
                  >
                    <option value="verified_or">Verified Official Receipt</option>
                    <option value="pending_screenshot">Pending Screenshot Only</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-fund-or-ref" className="form-label">
                    OR Reference
                  </label>
                  <input
                    id="p14-fund-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={fundOrRefInput}
                    placeholder="e.g. CEBU-OR-2026-000001"
                    onChange={(e) => setFundOrRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-fund-amount" className="form-label">
                    Verified Amount (PHP)
                  </label>
                  <input
                    id="p14-fund-amount"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={fundAmountInput}
                    placeholder="e.g. 400.00"
                    onChange={(e) => setFundAmountInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-fund-actor" className="form-label">
                    Finance Verifier ID
                  </label>
                  <input
                    id="p14-fund-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={fundActorInput}
                    placeholder="e.g. 202"
                    onChange={(e) => setFundActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-fund-verified-at" className="form-label">
                    Verification Time (UTC)
                  </label>
                  <input
                    id="p14-fund-verified-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={fundVerifiedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setFundVerifiedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-record-funding-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordFunding}
                >
                  Apply Scoped OR Protection
                </button>
              </div>

              {activeOrder?.cost_exceeds_sale_blocker ? (
                <>
                  <hr />
                  <h3 className="p03-section-title">Excess Cost Review Blocker</h3>
                  <div className="form-group">
                    <label htmlFor="p14-excess-reason" className="form-label">
                      Pricing / Buyer Acceptance Approval Note
                    </label>
                    <input
                      id="p14-excess-reason"
                      type="text"
                      className="form-control"
                      value={excessReasonInput}
                      placeholder="Approved updated cost terms"
                      onChange={(e) => setExcessReasonInput(e.target.value)}
                    />
                  </div>
                  <div className="p03-guard-buttons">
                    <button
                      type="button"
                      id="p14-approve-excess-btn"
                      className="btn-batcave-secondary"
                      onClick={handleApproveExcessCost}
                    >
                      Approve Excess Procurement Cost
                    </button>
                  </div>
                </>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p14-repf-gate-heading">
              <h2 id="p14-repf-gate-heading" className="p03-section-title">
                Forward Funded Shortage to Purchasing
              </h2>
              <p className="p03-muted-copy">
                Only accepted shortages backed by an approved cost estimate and verified deposit OR
                may forward to Purchasing. Relabeling unpaid SO shortages as RF or ROP is forbidden.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-repf-actor" className="form-label">
                    Forwarding Officer ID
                  </label>
                  <input
                    id="p14-repf-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={repfActorInput}
                    placeholder="e.g. 202"
                    onChange={(e) => setRepfActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-repf-at" className="form-label">
                    Forwarding Time (UTC)
                  </label>
                  <input
                    id="p14-repf-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={repfAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRepfAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p14-repf-relabel-checkbox"
                  type="checkbox"
                  checked={repfRelabelInput}
                  onChange={(e) => setRepfRelabelInput(e.target.checked)}
                />
                <label htmlFor="p14-repf-relabel-checkbox">
                  Simulate unpaid SO relabeling as RF / ROP (Forbidden Guard Test)
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-forward-repf-btn"
                  className="btn-batcave-primary"
                  onClick={handleForwardRepf}
                >
                  Forward Funded Shortage to Purchasing
                </button>
              </div>

              {snapshot.repf_forwards.length > 0 ? (
                <div className="p03-queue-list" data-testid="p14-repf-list">
                  {snapshot.repf_forwards.map((f) => (
                    <div key={f.forward_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong className="p03-mono-inline">{f.repf_reference}</strong>
                        <span>
                          Qty {f.quantity} backed by {f.funded_or_reference} (Cost PHP{' '}
                          {f.approved_cost})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Expiry Sweep & Late Payments */}
        {activeTab === 'expiry' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p14-eval-heading">
              <h2 id="p14-eval-heading" className="p03-section-title">
                Evaluate 48-Hour Expiry &amp; Pickup Deadlines
              </h2>
              <p className="p03-muted-copy">
                Elapsed unpaid clocks release only unprotected quantities back to available stock;
                RF, paid, and funded commitments remain completely preserved.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-eval-actor" className="form-label">
                    Evaluating Officer ID
                  </label>
                  <input
                    id="p14-eval-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evalActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setEvalActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-eval-time" className="form-label">
                    Evaluation Clock Time (UTC)
                  </label>
                  <input
                    id="p14-eval-time"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evalTimeInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setEvalTimeInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-evaluate-clocks-btn"
                  className="btn-batcave-primary"
                  onClick={handleEvaluateClocks}
                >
                  Run Deadline Sweep
                </button>
              </div>

              <hr />
              <h3 className="p03-section-title">Simulate Competing Allocation Elsewhere</h3>
              <div className="form-group">
                <label htmlFor="p14-consume-qty" className="form-label">
                  Quantity Taken by Another Order
                </label>
                <input
                  id="p14-consume-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={consumeQtyInput}
                  placeholder="e.g. 4"
                  onChange={(e) => setConsumeQtyInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-consume-elsewhere-btn"
                  className="btn-batcave-secondary"
                  onClick={handleConsumeElsewhere}
                >
                  Allocate Available Stock Elsewhere
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p14-late-heading">
              <h2 id="p14-late-heading" className="p03-section-title">
                Resolve Late Verified Payment
              </h2>
              <p className="p03-muted-copy">
                Rechecks live available stock before committing a late payment. Prevents
                over-allocation when stock has been claimed by another order.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-late-or-ref" className="form-label">
                    Late Payment OR Reference
                  </label>
                  <input
                    id="p14-late-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lateOrRefInput}
                    placeholder="e.g. CEBU-OR-2026-000009"
                    onChange={(e) => setLateOrRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-late-qty" className="form-label">
                    Requested Quantity
                  </label>
                  <input
                    id="p14-late-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lateQtyInput}
                    placeholder="e.g. 3"
                    onChange={(e) => setLateQtyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-late-at" className="form-label">
                    Late Verification Time (UTC)
                  </label>
                  <input
                    id="p14-late-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lateAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setLateAtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-late-fallback" className="form-label">
                    Fallback If Stock Unavailable
                  </label>
                  <select
                    id="p14-late-fallback"
                    className="form-control"
                    value={lateFallbackInput}
                    onChange={(e) =>
                      setLateFallbackInput(
                        e.target.value as 'convert_to_funded_backorder' | 'route_to_finance_refund'
                      )
                    }
                  >
                    <option value="route_to_finance_refund">Route to Finance Refund Resolution</option>
                    <option value="convert_to_funded_backorder">Convert to Accepted Funded Backorder</option>
                  </select>
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p14-resolve-late-btn"
                  className="btn-batcave-primary"
                  onClick={handleLatePayment}
                >
                  Check Stock &amp; Resolve Late Payment
                </button>
              </div>

              {snapshot.late_resolutions.length > 0 ? (
                <div className="p03-queue-list" data-testid="p14-late-list">
                  {snapshot.late_resolutions.map((l) => (
                    <div key={l.resolution_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {l.or_reference} — {l.outcome}
                        </strong>
                        <span>
                          Requested {l.requested_quantity} (Available at check: {l.available_at_check})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p14-history-heading">
              <h2 id="p14-history-heading" className="p03-section-title">
                Clock &amp; Funding Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p14-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p14-lookup-heading">
              <h2 id="p14-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p14-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p14-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p14-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p14-lookup-ulid-input"
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
                  id="p14-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p14-lookup-by-ulid-btn"
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
                        data-testid={`p14-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p14-lookup-result" aria-live="polite">
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
