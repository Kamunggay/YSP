import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP20BoothCheckoutEngine } from './p20BoothCheckoutSlice';
import type {
  BoothEventRecord,
  CheckoutCaptureMode,
  LotRestrictionKind,
  P20ActionResult,
  P20EngineSnapshot,
  P20LookupResult,
  StockroomSourceLot,
} from './p20BoothCheckoutSlice';

type P20TabId = 'setup' | 'checkout' | 'history';

interface P20BoothCheckoutWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P20BoothCheckoutWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P20BoothCheckoutWorkspaceProps) {
  const engine = useMemo(() => createP20BoothCheckoutEngine(), []);
  const [snapshot, setSnapshot] = useState<P20EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P20TabId>('setup');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P20ActionResult | null>(snapshot.last_action);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');

  // Tab 1: Stockroom Lot & Event Booth Setup
  const [lotVariantInput, setLotVariantInput] = useState('');
  const [lotSkuInput, setLotSkuInput] = useState('');
  const [lotNameInput, setLotNameInput] = useState('');
  const [lotQtyInput, setLotQtyInput] = useState('');
  const [lotPriceInput, setLotPriceInput] = useState('');
  const [lotRestrictionInput, setLotRestrictionInput] =
    useState<LotRestrictionKind>('unrestricted_saleable');

  const [evNameInput, setEvNameInput] = useState('');
  const [evDatesInput, setEvDatesInput] = useState('');
  const [evRequesterInput, setEvRequesterInput] = useState('');
  const [evCustodianInput, setEvCustodianInput] = useState('');
  const [evCashierInput, setEvCashierInput] = useState('');
  const [evFloatInput, setEvFloatInput] = useState('');
  const [evScheduleInput, setEvScheduleInput] = useState('');
  const [evApproverInput, setEvApproverInput] = useState('');
  const [evApprovedAtInput, setEvApprovedAtInput] = useState('');

  // Tab 2: Signature Binding & Custody Checkout
  const [sigCustodianInput, setSigCustodianInput] = useState('');
  const [sigModeInput, setSigModeInput] = useState<CheckoutCaptureMode>('canvas_pad');
  const [sigHashInput, setSigHashInput] = useState('');
  const [sigQtyInput, setSigQtyInput] = useState('');
  const [sigAtInput, setSigAtInput] = useState('');

  const [chkExecActorInput, setChkExecActorInput] = useState('');
  const [chkQtyInput, setChkQtyInput] = useState('');
  const [chkAtInput, setChkAtInput] = useState('');

  // Tab 3: Operation Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P20ActionResult<P20LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P20ActionResult<T>): P20ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeLot: StockroomSourceLot | undefined =
    snapshot.stockroom_lots.find((l) => l.lot_id === selectedLotId) ??
    snapshot.stockroom_lots[0];

  const activeEvent: BoothEventRecord | undefined =
    snapshot.booth_events.find((e) => e.event_id === selectedEventId) ??
    snapshot.booth_events[0];

  function handleRegisterLot() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerStockroomSourceLot({
        variant_id: lotVariantInput,
        sku_code: lotSkuInput,
        item_name: lotNameInput,
        stockroom_usable_qty: lotQtyInput,
        approved_event_unit_price: lotPriceInput,
        restriction_kind: lotRestrictionInput,
        idempotency_key: nextSequentialKey('p20-reg-lot'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedLotId(res.data.lot_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCreateSetup() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.createBoothEventSetup({
        event_name: evNameInput,
        event_dates: evDatesInput,
        requester_user_id: evRequesterInput,
        custodian_user_id: evCustodianInput,
        cashier_user_id: evCashierInput,
        requested_float_amount: evFloatInput,
        remittance_schedule: evScheduleInput,
        idempotency_key: nextSequentialKey('p20-setup'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedEventId(res.data.event_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveSetup() {
    playClickPen(soundEnabled);
    if (!activeEvent) return;
    const res = refreshSnapshot(
      engine.approveBoothEventSetup({
        event_id: activeEvent.event_id,
        approver_user_id: evApproverInput,
        approved_at: evApprovedAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p20-approve'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleBindSignature() {
    playClickPen(soundEnabled);
    if (!activeEvent || !activeLot) return;
    const res = refreshSnapshot(
      engine.bindCustodianCheckoutSignature({
        event_id: activeEvent.event_id,
        lot_id: activeLot.lot_id,
        custodian_user_id: sigCustodianInput,
        capture_mode: sigModeInput,
        evidence_hash: sigHashInput,
        acknowledged_qty: sigQtyInput,
        signed_at: sigAtInput,
        idempotency_key: nextSequentialKey('p20-bind-sig'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleExecuteCheckout() {
    playClickPen(soundEnabled);
    if (!activeEvent || !activeLot) return;
    const res = refreshSnapshot(
      engine.executeBoothCustodyCheckout({
        event_id: activeEvent.event_id,
        lot_id: activeLot.lot_id,
        executed_by_user_id: chkExecActorInput,
        checkout_qty: chkQtyInput,
        executed_at: chkAtInput,
        expected_version: activeEvent.version,
        idempotency_key: nextSequentialKey('p20-checkout'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupBoothCheckoutOperation({
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
      engine.lookupBoothCheckoutOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleEvents = snapshot.booth_events.filter(
    (e) =>
      !normalizedSearch ||
      e.event_code.toLowerCase().includes(normalizedSearch) ||
      e.event_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p20-workspace">
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
                id="p20-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search booth events or codes"
                aria-label="Search booth events"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Approved Booth Setup &amp; Signed Custody Checkout</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Booth setup and custody workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p20-tab-setup"
                  aria-selected={activeTab === 'setup'}
                  className={`p03-filter-pill ${activeTab === 'setup' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('setup');
                  }}
                >
                  Stockroom Lots &amp; Event Setup
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p20-tab-checkout"
                  aria-selected={activeTab === 'checkout'}
                  className={`p03-filter-pill ${activeTab === 'checkout' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('checkout');
                  }}
                >
                  Signature &amp; Custody Checkout
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p20-tab-history"
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
                id="p20-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p20-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p20-overview-heading" className="p03-section-title">
              Booth Custody &amp; Float Readiness — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Events: <strong>{visibleEvents.length}</strong>
              </span>
              <span className="p03-version-pill">
                Sales Orders Created: <strong>{snapshot.summary.so_created_total}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Stockroom Usable</span>
              <span className="p03-axis-val" data-testid="p20-stockroom-usable-val">
                {snapshot.summary.stockroom_usable_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Booth Custody Total</span>
              <span className="p03-axis-val" data-testid="p20-booth-custody-val">
                {snapshot.summary.booth_custody_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Float Liability (PHP)</span>
              <span className="p03-axis-val" data-testid="p20-float-liability-val">
                {snapshot.summary.float_liability_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Sales Revenue (PHP)</span>
              <span className="p03-axis-val" data-testid="p20-sales-revenue-val">
                {snapshot.summary.sales_revenue_total}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p20-feedback-banner"
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

        {/* TAB 1: Stockroom Lots & Event Setup */}
        {activeTab === 'setup' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p20-lot-heading">
              <h2 id="p20-lot-heading" className="p03-section-title">
                Register Stockroom Source Lot
              </h2>
              <div className="form-group">
                <label htmlFor="p20-lot-variant" className="form-label">
                  Variant ID
                </label>
                <input
                  id="p20-lot-variant"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lotVariantInput}
                  placeholder="Variant ID"
                  onChange={(e) => setLotVariantInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lot-sku" className="form-label">
                  Item SKU Code
                </label>
                <input
                  id="p20-lot-sku"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lotSkuInput}
                  placeholder="MERCH-KIT-01"
                  onChange={(e) => setLotSkuInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lot-name" className="form-label">
                  Merchandise Item Name
                </label>
                <input
                  id="p20-lot-name"
                  type="text"
                  className="form-control"
                  value={lotNameInput}
                  placeholder="Event item description"
                  onChange={(e) => setLotNameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lot-qty" className="form-label">
                  Usable Stockroom Qty
                </label>
                <input
                  id="p20-lot-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lotQtyInput}
                  placeholder="150"
                  onChange={(e) => setLotQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lot-price" className="form-label">
                  Approved Event Price (PHP)
                </label>
                <input
                  id="p20-lot-price"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lotPriceInput}
                  placeholder="150.00"
                  onChange={(e) => setLotPriceInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lot-restriction" className="form-label">
                  Source Restriction Category
                </label>
                <select
                  id="p20-lot-restriction"
                  className="form-control"
                  value={lotRestrictionInput}
                  onChange={(e) => setLotRestrictionInput(e.target.value as LotRestrictionKind)}
                >
                  <option value="unrestricted_saleable">Unrestricted Saleable Stock</option>
                  <option value="distribution_only">Restricted Distribution-Only Donation</option>
                  <option value="uninterpreted_donor_condition">Uninterpreted Donor Condition</option>
                </select>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p20-register-lot-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRegisterLot}
                >
                  Register Source Lot
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p20-setup-heading">
              <h2 id="p20-setup-heading" className="p03-section-title">
                Create &amp; Approve Booth Event Setup
              </h2>
              <div className="form-group">
                <label htmlFor="p20-ev-name" className="form-label">
                  Event Name
                </label>
                <input
                  id="p20-ev-name"
                  type="text"
                  className="form-control"
                  value={evNameInput}
                  placeholder="Youth Summit Booth"
                  onChange={(e) => setEvNameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-dates" className="form-label">
                  Event Schedule Dates
                </label>
                <input
                  id="p20-ev-dates"
                  type="text"
                  className="form-control"
                  value={evDatesInput}
                  placeholder="2026-11-15 to 2026-11-16"
                  onChange={(e) => setEvDatesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-requester" className="form-label">
                  Requisition Officer ID
                </label>
                <input
                  id="p20-ev-requester"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evRequesterInput}
                  placeholder="101"
                  onChange={(e) => setEvRequesterInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-custodian" className="form-label">
                  Booth Custodian ID
                </label>
                <input
                  id="p20-ev-custodian"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCustodianInput}
                  placeholder="301"
                  onChange={(e) => setEvCustodianInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-cashier" className="form-label">
                  Assigned Booth Cashier ID
                </label>
                <input
                  id="p20-ev-cashier"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evCashierInput}
                  placeholder="302"
                  onChange={(e) => setEvCashierInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-float" className="form-label">
                  Approved Cash Float (PHP)
                </label>
                <input
                  id="p20-ev-float"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evFloatInput}
                  placeholder="2000.00"
                  onChange={(e) => setEvFloatInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-schedule" className="form-label">
                  Remittance Schedule
                </label>
                <input
                  id="p20-ev-schedule"
                  type="text"
                  className="form-control"
                  value={evScheduleInput}
                  placeholder="Same-day close-out"
                  onChange={(e) => setEvScheduleInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p20-create-setup-btn"
                  className="btn-batcave-secondary"
                  onClick={handleCreateSetup}
                >
                  Draft Booth Setup
                </button>
              </div>
              {snapshot.booth_events.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p20-empty-events-notice">
                  No booth events drafted or checked out yet.
                </p>
              ) : null}

              <hr />
              <h3 className="p03-section-title">Independent Setup &amp; Float Approval</h3>
              <div className="form-group">
                <label htmlFor="p20-ev-approver" className="form-label">
                  Approving Officer ID
                </label>
                <input
                  id="p20-ev-approver"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evApproverInput}
                  placeholder="202"
                  onChange={(e) => setEvApproverInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-ev-app-at" className="form-label">
                  Approval Timestamp (UTC)
                </label>
                <input
                  id="p20-ev-app-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evApprovedAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setEvApprovedAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p20-approve-setup-btn"
                  className="btn-batcave-primary"
                  onClick={handleApproveSetup}
                >
                  Approve Event &amp; Float
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Signature Binding & Custody Checkout */}
        {activeTab === 'checkout' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p20-sig-heading">
              <h2 id="p20-sig-heading" className="p03-section-title">
                Bind Custodian Issue &amp; Receipt Signature
              </h2>
              <div className="form-group">
                <label htmlFor="p20-active-event-select" className="form-label">
                  Target Booth Event
                </label>
                <select
                  id="p20-active-event-select"
                  className="form-control"
                  value={activeEvent?.event_id ?? ''}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {snapshot.booth_events.length === 0 ? (
                    <option value="">No events available</option>
                  ) : null}
                  {snapshot.booth_events.map((ev) => (
                    <option key={ev.event_id} value={ev.event_id}>
                      {ev.event_code} — {ev.event_name} ({ev.booth_custody_qty} in custody)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p20-active-lot-select" className="form-label">
                  Source Stockroom Lot
                </label>
                <select
                  id="p20-active-lot-select"
                  className="form-control"
                  value={activeLot?.lot_id ?? ''}
                  onChange={(e) => setSelectedLotId(e.target.value)}
                >
                  {snapshot.stockroom_lots.length === 0 ? (
                    <option value="">No source lots registered</option>
                  ) : null}
                  {snapshot.stockroom_lots.map((l) => (
                    <option key={l.lot_id} value={l.lot_id}>
                      {l.sku_code} — {l.stockroom_usable_qty} usable ({l.restriction_kind})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p20-sig-custodian" className="form-label">
                  Signing Custodian ID
                </label>
                <input
                  id="p20-sig-custodian"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigCustodianInput}
                  placeholder="301"
                  onChange={(e) => setSigCustodianInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-sig-mode" className="form-label">
                  Signature Capture Method
                </label>
                <select
                  id="p20-sig-mode"
                  className="form-control"
                  value={sigModeInput}
                  onChange={(e) => setSigModeInput(e.target.value as CheckoutCaptureMode)}
                >
                  <option value="canvas_pad">On-Device Signature Pad</option>
                  <option value="paper_upload">Signed Paper Scan Upload</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p20-sig-hash" className="form-label">
                  Signature Evidence SHA-256
                </label>
                <input
                  id="p20-sig-hash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigHashInput}
                  placeholder="64 lowercase hex chars"
                  onChange={(e) => setSigHashInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-sig-qty" className="form-label">
                  Acknowledged Checkout Qty
                </label>
                <input
                  id="p20-sig-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigQtyInput}
                  placeholder="100"
                  onChange={(e) => setSigQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-sig-at" className="form-label">
                  Signature Timestamp (UTC)
                </label>
                <input
                  id="p20-sig-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setSigAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p20-bind-sig-btn"
                  className="btn-batcave-secondary"
                  onClick={handleBindSignature}
                >
                  Bind Checkout Signature
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p20-chk-heading">
              <h2 id="p20-chk-heading" className="p03-section-title">
                Transfer Verified Stock to Booth Custody
              </h2>
              <p className="p03-muted-copy">
                Moves approved quantity out of usable stockroom balance into isolated booth event
                custody without creating sales orders or cash revenue.
              </p>
              <div className="form-group">
                <label htmlFor="p20-chk-actor" className="form-label">
                  Dispatching Officer ID
                </label>
                <input
                  id="p20-chk-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={chkExecActorInput}
                  placeholder="301"
                  onChange={(e) => setChkExecActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-chk-qty" className="form-label">
                  Checkout Quantity
                </label>
                <input
                  id="p20-chk-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={chkQtyInput}
                  placeholder="100"
                  onChange={(e) => setChkQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-chk-at" className="form-label">
                  Checkout Timestamp (UTC)
                </label>
                <input
                  id="p20-chk-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={chkAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setChkAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p20-execute-checkout-btn"
                  className="btn-batcave-primary"
                  onClick={handleExecuteCheckout}
                >
                  Execute Signed Checkout
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Audit History & Operation Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p20-audit-heading">
              <h2 id="p20-audit-heading" className="p03-section-title">
                Custody Checkout &amp; Event Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No booth setup or checkout events recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p20-lookup-heading">
              <h2 id="p20-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p20-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p20-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p20-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p20-lookup-ulid-input"
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
                  id="p20-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p20-lookup-by-ulid-btn"
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
                        data-testid={`p20-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p20-lookup-result" aria-live="polite">
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
