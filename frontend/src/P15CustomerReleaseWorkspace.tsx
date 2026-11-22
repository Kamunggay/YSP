import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP15CustomerReleaseEngine } from './p15CustomerReleaseSlice';
import type {
  CustomerReleaseBatch,
  P15ActionResult,
  P15EngineSnapshot,
  P15LookupResult,
  ReleasableSalesOrder,
} from './p15CustomerReleaseSlice';

type P15TabId = 'orders' | 'batches' | 'coverage' | 'history';

interface P15CustomerReleaseWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P15CustomerReleaseWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P15CustomerReleaseWorkspaceProps) {
  const engine = useMemo(() => createP15CustomerReleaseEngine(), []);
  const [snapshot, setSnapshot] = useState<P15EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P15TabId>('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P15ActionResult | null>(snapshot.last_action);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');

  // Tab 1: Orders & RM Allocation
  const [ordSoRefInput, setOrdSoRefInput] = useState('');
  const [ordSiRefInput, setOrdSiRefInput] = useState('');
  const [ordOrRefInput, setOrdOrRefInput] = useState('');
  const [ordHasOrInput, setOrdHasOrInput] = useState(false);
  const [ordDepOnlyInput, setOrdDepOnlyInput] = useState(false);
  const [ordVariantInput, setOrdVariantInput] = useState('');
  const [ordItemInput, setOrdItemInput] = useState('');
  const [ordScaleInput, setOrdScaleInput] = useState('');
  const [ordPriceInput, setOrdPriceInput] = useState('');
  const [ordAcceptedInput, setOrdAcceptedInput] = useState('');
  const [ordReservedInput, setOrdReservedInput] = useState('');
  const [ordUsableInput, setOrdUsableInput] = useState('');
  const [ordRopInput, setOrdRopInput] = useState('');
  const [ordCovInput, setOrdCovInput] = useState('');
  const [ordDepTotalInput, setOrdDepTotalInput] = useState('');

  const [rmActorInput, setRmActorInput] = useState('');
  const [rmRefInput, setRmRefInput] = useState('');
  const [rmQtyInput, setRmQtyInput] = useState('');
  const [rmAtInput, setRmAtInput] = useState('');

  // Tab 2: Customer DR Batch Preparation & Evidence
  const [batchPrepActorInput, setBatchPrepActorInput] = useState('');
  const [batchQtyInput, setBatchQtyInput] = useState('');
  const [batchRecNameInput, setBatchRecNameInput] = useState('');
  const [batchRecIdInput, setBatchRecIdInput] = useState('');
  const [batchRecCapInput, setBatchRecCapInput] = useState('');

  const [evModeInput, setEvModeInput] = useState<'canvas_signature' | 'paper_upload'>(
    'canvas_signature'
  );
  const [evHashInput, setEvHashInput] = useState('');
  const [evRelOfficerInput, setEvRelOfficerInput] = useState('');
  const [evRecIdInput, setEvRecIdInput] = useState('');
  const [evSignedAtInput, setEvSignedAtInput] = useState('');
  const [evSnapHashInput, setEvSnapHashInput] = useState('');
  const [evAckInput, setEvAckInput] = useState(false);

  // Tab 3: Post & Coverage Ledger
  const [postActorInput, setPostActorInput] = useState('');
  const [postAtInput, setPostAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P15ActionResult<P15LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P15ActionResult<T>): P15ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeOrder: ReleasableSalesOrder | undefined =
    snapshot.releasable_orders.find((o) => o.order_id === selectedOrderId) ??
    snapshot.releasable_orders[0];

  const activeBatch: CustomerReleaseBatch | undefined =
    snapshot.release_batches.find((b) => b.batch_id === selectedBatchId) ??
    snapshot.release_batches[0];

  function handleRegisterOrder() {
    playClickPen(soundEnabled);
    if (ordScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the sales order.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerReleasableSalesOrder({
        so_reference: ordSoRefInput,
        si_reference: ordSiRefInput,
        or_reference: ordOrRefInput.trim() || null,
        has_verified_or: ordHasOrInput,
        is_procurement_deposit_only: ordDepOnlyInput,
        variant_id: ordVariantInput,
        item_name: ordItemInput,
        quantity_scale: Number(ordScaleInput),
        unit_net_price: ordPriceInput,
        accepted_quantity_value: ordAcceptedInput,
        protected_reserved_value: ordReservedInput,
        usable_on_hand_value: ordUsableInput,
        rop_threshold_value: ordRopInput,
        verified_release_coverage_amount: ordCovInput,
        deposit_credit_total: ordDepTotalInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedOrderId(res.data.order_id);
      setOrdSoRefInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAllocateRm() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.allocateIncomingRmToFundedSo({
        order_id: activeOrder.order_id,
        rm_reference: rmRefInput,
        quantity_value: rmQtyInput,
        actor_user_id: rmActorInput,
        allocated_at: rmAtInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p15-rm'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setRmRefInput('');
      setRmQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePrepareBatch() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.prepareCustomerReleaseBatch({
        order_id: activeOrder.order_id,
        prepared_by_user_id: batchPrepActorInput,
        batch_quantity_value: batchQtyInput,
        recipient_name: batchRecNameInput,
        recipient_id: batchRecIdInput,
        recipient_capacity: batchRecCapInput.trim() || undefined,
        idempotency_key: nextSequentialKey('p15-prep'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedBatchId(res.data.batch_id);
      setBatchQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReviseBatch() {
    playClickPen(soundEnabled);
    if (!activeBatch) return;
    const res = refreshSnapshot(
      engine.reviseCustomerReleaseBatch({
        batch_id: activeBatch.batch_id,
        actor_user_id: batchPrepActorInput,
        batch_quantity_value: batchQtyInput,
        recipient_name: batchRecNameInput,
        recipient_id: batchRecIdInput,
        recipient_capacity: batchRecCapInput.trim() || undefined,
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p15-rev'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setEvAckInput(false);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLoadHash() {
    playClickPen(soundEnabled);
    if (!activeBatch) return;
    setEvSnapHashInput(activeBatch.batch_snapshot_hash);
  }

  function handleBindEvidence() {
    playClickPen(soundEnabled);
    if (!activeBatch) return;
    const res = refreshSnapshot(
      engine.bindCustomerDrEvidence({
        batch_id: activeBatch.batch_id,
        capture_mode: evModeInput,
        evidence_hash: evHashInput,
        releasing_officer_id: evRelOfficerInput,
        recipient_id: evRecIdInput,
        recipient_acknowledged: evAckInput,
        signed_at: evSignedAtInput,
        linked_batch_snapshot_hash: evSnapHashInput,
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p15-bind'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostRelease() {
    playClickPen(soundEnabled);
    if (!activeBatch) return;
    const res = refreshSnapshot(
      engine.postCustomerReleaseBatch({
        batch_id: activeBatch.batch_id,
        actor_user_id: postActorInput.trim() || evRelOfficerInput.trim() || '301',
        expected_snapshot_hash: evSnapHashInput.trim() || undefined,
        posted_at: postAtInput.trim() || '2026-11-04T09:12:00Z',
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p15-post'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupCustomerReleaseOperation({
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
      engine.lookupCustomerReleaseOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleBatches = snapshot.release_batches.filter(
    (b) =>
      !normalizedSearch ||
      b.cdr_reference.toLowerCase().includes(normalizedSearch) ||
      b.so_reference.toLowerCase().includes(normalizedSearch) ||
      b.recipient_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p15-workspace">
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
                id="p15-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer DRs, orders, or recipients"
                aria-label="Search customer release batches"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Covered Customer Releases &amp; Repeated Partials</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Customer release workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p15-tab-orders"
                  aria-selected={activeTab === 'orders'}
                  className={`p03-filter-pill ${activeTab === 'orders' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('orders');
                  }}
                >
                  Verified Orders &amp; Replenishment
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p15-tab-batches"
                  aria-selected={activeTab === 'batches'}
                  className={`p03-filter-pill ${activeTab === 'batches' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('batches');
                  }}
                >
                  Customer DR &amp; Signatures
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p15-tab-coverage"
                  aria-selected={activeTab === 'coverage'}
                  className={`p03-filter-pill ${activeTab === 'coverage' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('coverage');
                  }}
                >
                  Coverage Consumption &amp; Progress
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p15-tab-history"
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
                id="p15-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p15-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p15-overview-heading" className="p03-section-title">
              Customer Release Gate &amp; Coverage — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Orders: <strong>{snapshot.releasable_orders.length}</strong>
              </span>
              <span className="p03-version-pill">
                Customer DR Batches: <strong>{snapshot.release_batches.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p15-usable-on-hand-val">
                {snapshot.summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Protected SO Reserved</span>
              <span className="p03-axis-val" data-testid="p15-protected-reserved-val">
                {snapshot.summary.protected_so_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Total Released Qty</span>
              <span className="p03-axis-val" data-testid="p15-total-released-val">
                {snapshot.summary.total_released_qty}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Remaining Coverage (PHP)</span>
              <span className="p03-axis-val" data-testid="p15-remaining-coverage-val">
                {snapshot.summary.remaining_release_coverage}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p15-feedback-banner"
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

        {/* TAB 1: Verified Orders & Replenishment */}
        {activeTab === 'orders' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p15-reg-order-heading">
              <h2 id="p15-reg-order-heading" className="p03-section-title">
                Register Sales Order for Release Check
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ord-so-ref" className="form-label">
                    Sales Order Reference
                  </label>
                  <input
                    id="p15-ord-so-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordSoRefInput}
                    placeholder="e.g. CEBU-SO-2026-000001"
                    onChange={(e) => setOrdSoRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-si-ref" className="form-label">
                    Sales Invoice Reference
                  </label>
                  <input
                    id="p15-ord-si-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordSiRefInput}
                    placeholder="e.g. CEBU-SI-2026-000001"
                    onChange={(e) => setOrdSiRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ord-or-ref" className="form-label">
                    Verified OR Reference (If Any)
                  </label>
                  <input
                    id="p15-ord-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordOrRefInput}
                    placeholder="Optional OR reference"
                    onChange={(e) => setOrdOrRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-variant-id" className="form-label">
                    Variant ID
                  </label>
                  <input
                    id="p15-ord-variant-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordVariantInput}
                    placeholder="e.g. 71"
                    onChange={(e) => setOrdVariantInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ord-item-name" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p15-ord-item-name"
                    type="text"
                    className="form-control"
                    value={ordItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setOrdItemInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-scale" className="form-label">
                    Precision Scale
                  </label>
                  <select
                    id="p15-ord-scale"
                    className="form-control"
                    value={ordScaleInput}
                    onChange={(e) => setOrdScaleInput(e.target.value)}
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
                  <label htmlFor="p15-ord-price" className="form-label">
                    Approved Net Unit Price (PHP)
                  </label>
                  <input
                    id="p15-ord-price"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordPriceInput}
                    placeholder="e.g. 250.00"
                    onChange={(e) => setOrdPriceInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-accepted" className="form-label">
                    Accepted Total Quantity
                  </label>
                  <input
                    id="p15-ord-accepted"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordAcceptedInput}
                    placeholder="e.g. 6"
                    onChange={(e) => setOrdAcceptedInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ord-reserved" className="form-label">
                    Protected Reserved Quantity
                  </label>
                  <input
                    id="p15-ord-reserved"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordReservedInput}
                    placeholder="e.g. 4"
                    onChange={(e) => setOrdReservedInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-usable" className="form-label">
                    Stockroom Usable On-Hand
                  </label>
                  <input
                    id="p15-ord-usable"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordUsableInput}
                    placeholder="e.g. 4"
                    onChange={(e) => setOrdUsableInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ord-rop" className="form-label">
                    Reorder Threshold (ROP)
                  </label>
                  <input
                    id="p15-ord-rop"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordRopInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setOrdRopInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ord-coverage" className="form-label">
                    Merchandise Release Coverage (PHP)
                  </label>
                  <input
                    id="p15-ord-coverage"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ordCovInput}
                    placeholder="e.g. 1500.00"
                    onChange={(e) => setOrdCovInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p15-ord-deposit" className="form-label">
                  Preserved Customer Deposit Credit (PHP)
                </label>
                <input
                  id="p15-ord-deposit"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ordDepTotalInput}
                  placeholder="e.g. 400.00"
                  onChange={(e) => setOrdDepTotalInput(e.target.value)}
                />
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p15-ord-has-or"
                  type="checkbox"
                  checked={ordHasOrInput}
                  onChange={(e) => setOrdHasOrInput(e.target.checked)}
                />
                <label htmlFor="p15-ord-has-or">
                  Official Receipt verified (uncheck to test SI or screenshot-only block)
                </label>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p15-ord-dep-only"
                  type="checkbox"
                  checked={ordDepOnlyInput}
                  onChange={(e) => setOrdDepOnlyInput(e.target.checked)}
                />
                <label htmlFor="p15-ord-dep-only">
                  Procurement-only deposit without release merchandise coverage
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p15-register-order-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterOrder}
                >
                  Register Sales Order
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p15-rm-replenish-heading">
              <h2 id="p15-rm-replenish-heading" className="p03-section-title">
                Allocate Accepted RM Arrival to Funded Order
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-rm-actor" className="form-label">
                    Inventory Officer ID
                  </label>
                  <input
                    id="p15-rm-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setRmActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-rm-ref" className="form-label">
                    Receiving Report Reference
                  </label>
                  <input
                    id="p15-rm-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmRefInput}
                    placeholder="e.g. CEBU-RM-2026-000001"
                    onChange={(e) => setRmRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-rm-qty" className="form-label">
                    Allocated Quantity
                  </label>
                  <input
                    id="p15-rm-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setRmQtyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-rm-at" className="form-label">
                    Allocation Timestamp (UTC)
                  </label>
                  <input
                    id="p15-rm-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRmAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p15-allocate-rm-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAllocateRm}
                >
                  Allocate Incoming RM Stock
                </button>
              </div>

              <hr />
              <h3 className="p03-section-title">Registered Sales Orders ({snapshot.releasable_orders.length})</h3>
              {snapshot.releasable_orders.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p15-empty-orders-notice">
                  No sales orders registered for release yet.
                </p>
              ) : (
                <div className="p03-queue-list" data-testid="p15-orders-list">
                  {snapshot.releasable_orders.map((ord) => (
                    <div key={ord.order_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {ord.so_reference} ({ord.status})
                        </strong>
                        <span>
                          Released {ord.released_quantity.value} / {ord.accepted_quantity.value} — Coverage PHP{' '}
                          {ord.remaining_release_coverage}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        data-testid={`p15-select-order-${ord.order_id}`}
                        onClick={() => {
                          setSelectedOrderId(ord.order_id);
                          setActiveTab('batches');
                        }}
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Customer DR & Signatures */}
        {activeTab === 'batches' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p15-prep-batch-heading">
              <h2 id="p15-prep-batch-heading" className="p03-section-title">
                Prepare or Revise Customer DR Batch
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-batch-preparer" className="form-label">
                    Preparing Officer ID
                  </label>
                  <input
                    id="p15-batch-preparer"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={batchPrepActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setBatchPrepActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-batch-qty" className="form-label">
                    Actual Release Quantity
                  </label>
                  <input
                    id="p15-batch-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={batchQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setBatchQtyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-batch-rec-name" className="form-label">
                    Recipient Full Name
                  </label>
                  <input
                    id="p15-batch-rec-name"
                    type="text"
                    className="form-control"
                    value={batchRecNameInput}
                    placeholder="e.g. Maria Santos"
                    onChange={(e) => setBatchRecNameInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-batch-rec-id" className="form-label">
                    Recipient Identity ID
                  </label>
                  <input
                    id="p15-batch-rec-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={batchRecIdInput}
                    placeholder="e.g. 9001"
                    onChange={(e) => setBatchRecIdInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p15-batch-rec-cap" className="form-label">
                  Recipient Capacity (Optional)
                </label>
                <input
                  id="p15-batch-rec-cap"
                  type="text"
                  className="form-control"
                  value={batchRecCapInput}
                  placeholder="e.g. Authorized Buyer"
                  onChange={(e) => setBatchRecCapInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p15-prepare-batch-btn"
                  className="btn-batcave-primary"
                  onClick={handlePrepareBatch}
                >
                  Prepare Customer DR Batch
                </button>
                <button
                  type="button"
                  id="p15-revise-batch-btn"
                  className="btn-batcave-secondary"
                  onClick={handleReviseBatch}
                >
                  Revise Active Batch
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p15-bind-ev-heading">
              <h2 id="p15-bind-ev-heading" className="p03-section-title">
                Bind Signed Customer DR Evidence &amp; Release
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ev-mode" className="form-label">
                    Signature Capture Method
                  </label>
                  <select
                    id="p15-ev-mode"
                    className="form-control"
                    value={evModeInput}
                    onChange={(e) =>
                      setEvModeInput(e.target.value as 'canvas_signature' | 'paper_upload')
                    }
                  >
                    <option value="canvas_signature">On-Device Signature Pad</option>
                    <option value="paper_upload">Signed Paper Scan Upload</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ev-signed-at" className="form-label">
                    Acknowledgment Time (UTC)
                  </label>
                  <input
                    id="p15-ev-signed-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evSignedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setEvSignedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ev-officer" className="form-label">
                    Releasing Officer ID
                  </label>
                  <input
                    id="p15-ev-officer"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evRelOfficerInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setEvRelOfficerInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ev-recipient" className="form-label">
                    Recipient Signatory ID
                  </label>
                  <input
                    id="p15-ev-recipient"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evRecIdInput}
                    placeholder="e.g. 9001"
                    onChange={(e) => setEvRecIdInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-ev-hash" className="form-label">
                    Evidence File SHA-256 Digest
                  </label>
                  <input
                    id="p15-ev-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evHashInput}
                    placeholder="64 lowercase hex chars"
                    onChange={(e) => setEvHashInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-ev-snap-hash" className="form-label">
                    Batch Snapshot Digest
                  </label>
                  <input
                    id="p15-ev-snap-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={evSnapHashInput}
                    placeholder="Load current digest"
                    onChange={(e) => setEvSnapHashInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p15-ev-ack-checkbox"
                  type="checkbox"
                  checked={evAckInput}
                  onChange={(e) => setEvAckInput(e.target.checked)}
                />
                <label htmlFor="p15-ev-ack-checkbox">
                  Recipient inspected actual goods and signed Customer DR batch
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p15-load-current-hash-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLoadHash}
                >
                  Load Current Snapshot Digest
                </button>
                <button
                  type="button"
                  id="p15-bind-evidence-btn"
                  className="btn-batcave-secondary"
                  onClick={handleBindEvidence}
                >
                  Bind Signed Evidence
                </button>
                <button
                  type="button"
                  id="p15-post-release-btn"
                  className="btn-batcave-primary"
                  onClick={handlePostRelease}
                >
                  Post Signed Customer Release
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Coverage Consumption & Progress */}
        {activeTab === 'coverage' ? (
          <section className="p03-card surface-card" aria-labelledby="p15-cov-heading">
            <h2 id="p15-cov-heading" className="p03-section-title">
              Customer DR Release Batches &amp; Coverage Ledger ({visibleBatches.length})
            </h2>

            <div className="p03-two-col">
              <div className="form-group">
                <label htmlFor="p15-post-actor" className="form-label">
                  Confirming Officer ID
                </label>
                <input
                  id="p15-post-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={postActorInput}
                  placeholder="e.g. 301"
                  onChange={(e) => setPostActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p15-post-at" className="form-label">
                  Posting Time (UTC)
                </label>
                <input
                  id="p15-post-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={postAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setPostAtInput(e.target.value)}
                />
              </div>
            </div>

            {visibleBatches.length === 0 ? (
              <p className="p03-muted-copy">No Customer DR release batches prepared yet.</p>
            ) : (
              <div className="p03-table-wrap" data-testid="p15-batches-table">
                <table className="p03-table">
                  <thead>
                    <tr>
                      <th>Customer DR</th>
                      <th>Recipient</th>
                      <th>Batch Qty</th>
                      <th>Coverage Value (PHP)</th>
                      <th>Material Ver</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBatches.map((b) => (
                      <tr key={b.batch_id}>
                        <td className="p03-mono-inline">{b.cdr_reference}</td>
                        <td>{b.recipient_name}</td>
                        <td className="p03-mono-inline">{b.batch_quantity.value}</td>
                        <td className="p03-mono-inline">{b.merchandise_value}</td>
                        <td className="p03-mono-inline">v{b.material_version}</td>
                        <td>{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p15-history-heading">
              <h2 id="p15-history-heading" className="p03-section-title">
                Customer Release Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p15-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p15-lookup-heading">
              <h2 id="p15-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p15-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p15-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p15-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p15-lookup-ulid-input"
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
                  id="p15-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p15-lookup-by-ulid-btn"
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
                        data-testid={`p15-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p15-lookup-result" aria-live="polite">
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
