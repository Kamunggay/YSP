import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP12SalesOrderEngine } from './p12SalesOrderSlice';
import type {
  BuyerAcceptanceDecision,
  P12ActionResult,
  P12EngineSnapshot,
  P12LookupResult,
  SalesOrderRecord,
  SalesOrderStatus,
} from './p12SalesOrderSlice';

type P12TabId = 'intake' | 'review' | 'acceptance' | 'history';

interface P12SalesOrderWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const SO_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  returned: 'Returned for Revision',
  approved: 'Approved',
  canceled: 'Canceled',
};

export function P12SalesOrderWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P12SalesOrderWorkspaceProps) {
  const engine = useMemo(() => createP12SalesOrderEngine(), []);
  const [snapshot, setSnapshot] = useState<P12EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P12TabId>('intake');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P12ActionResult | null>(snapshot.last_action);
  const [selectedSoId, setSelectedSoId] = useState('');

  // Tab 1: Stock Pool & Sales Order Draft (strictly empty default)
  const [poolVariantInput, setPoolVariantInput] = useState('');
  const [poolItemInput, setPoolItemInput] = useState('');
  const [poolScaleInput, setPoolScaleInput] = useState('');
  const [poolUsableInput, setPoolUsableInput] = useState('');
  const [poolRfReservedInput, setPoolRfReservedInput] = useState('');
  const [poolUnitPriceInput, setPoolUnitPriceInput] = useState('');
  const [poolMaxDiscountInput, setPoolMaxDiscountInput] = useState('');

  const [soOfficerInput, setSoOfficerInput] = useState('');
  const [soBuyerNameInput, setSoBuyerNameInput] = useState('');
  const [soBuyerContactInput, setSoBuyerContactInput] = useState('');
  const [soVariantInput, setSoVariantInput] = useState('');
  const [soQtyInput, setSoQtyInput] = useState('');
  const [soScaleInput, setSoScaleInput] = useState('');
  const [soUnitPriceInput, setSoUnitPriceInput] = useState('');
  const [soDiscountInput, setSoDiscountInput] = useState('');
  const [soTermsInput, setSoTermsInput] = useState('');
  const [soRequestedAtInput, setSoRequestedAtInput] = useState('');
  const [soArrangementInput, setSoArrangementInput] = useState<'pickup' | 'delivery'>('pickup');

  // Tab 2: Review, Revision & Stock Split
  const [revReviewerInput, setRevReviewerInput] = useState('');
  const [revDutyInput, setRevDutyInput] = useState<'SALES_REVIEWER' | 'FINANCE_OFFICER'>(
    'SALES_REVIEWER'
  );
  const [revOverrideInput, setRevOverrideInput] = useState(false);
  const [revReasonInput, setRevReasonInput] = useState('');
  const [reviseQtyInput, setReviseQtyInput] = useState('');
  const [revisePriceInput, setRevisePriceInput] = useState('');
  const [reviseDiscountInput, setReviseDiscountInput] = useState('');
  const [reviseTermsInput, setReviseTermsInput] = useState('');
  const [splitActorInput, setSplitActorInput] = useState('');
  const [splitAtInput, setSplitAtInput] = useState('');

  // Tab 3: Buyer Acceptance & Full-Order SI
  const [accActorInput, setAccActorInput] = useState('');
  const [accDecisionInput, setAccDecisionInput] = useState<BuyerAcceptanceDecision>('accept_all');
  const [accChannelInput, setAccChannelInput] = useState('');
  const [accOutcomeInput, setAccOutcomeInput] = useState('');
  const [accRecordedAtInput, setAccRecordedAtInput] = useState('');
  const [siActorInput, setSiActorInput] = useState('');
  const [siIssuedAtInput, setSiIssuedAtInput] = useState('');

  // Tab 4: Operation Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P12ActionResult<P12LookupResult> | null>(null);

  const hasUnsavedDraft =
    soBuyerNameInput.trim().length > 0 ||
    soBuyerContactInput.trim().length > 0 ||
    soQtyInput.trim().length > 0 ||
    soTermsInput.trim().length > 0;

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P12ActionResult<T>): P12ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeSo: SalesOrderRecord | undefined =
    snapshot.sales_orders.find((s) => s.so_id === selectedSoId) ?? snapshot.sales_orders[0];

  function handleConfigurePool() {
    playClickPen(soundEnabled);
    if (poolScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the stock pool.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.configureSaleStockPool({
        variant_id: poolVariantInput,
        item_name: poolItemInput,
        quantity_scale: Number(poolScaleInput),
        usable_on_hand_value: poolUsableInput,
        existing_rf_reserved_value: poolRfReservedInput,
        unit_price: poolUnitPriceInput,
        max_discount_amount: poolMaxDiscountInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setPoolVariantInput('');
      setPoolItemInput('');
      setPoolUsableInput('');
      setPoolRfReservedInput('');
      setPoolUnitPriceInput('');
      setPoolMaxDiscountInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCreateSoDraft() {
    playClickPen(soundEnabled);
    if (soScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the sales order.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.createSalesOrderDraft({
        sales_officer_id: soOfficerInput,
        buyer_name: soBuyerNameInput,
        buyer_contact: soBuyerContactInput,
        variant_id: soVariantInput,
        ordered_quantity_value: soQtyInput,
        quantity_scale: Number(soScaleInput),
        unit_price: soUnitPriceInput,
        discount_amount: soDiscountInput,
        payment_terms: soTermsInput,
        requested_at: soRequestedAtInput,
        fulfillment_arrangement: soArrangementInput,
        idempotency_key: nextSequentialKey('p12-draft'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedSoId(res.data.so_id);
      setSoBuyerNameInput('');
      setSoBuyerContactInput('');
      setSoQtyInput('');
      setSoDiscountInput('');
      setSoTermsInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSubmitSo(so: SalesOrderRecord) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.submitSalesOrder({
        so_id: so.so_id,
        actor_user_id: soOfficerInput.trim() || so.sales_officer_id,
        expected_version: so.version,
        idempotency_key: nextSequentialKey('p12-submit'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setSelectedSoId(so.so_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveSo() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.approveSalesOrder({
        so_id: activeSo.so_id,
        reviewer_user_id: revReviewerInput,
        duty_code: revDutyInput,
        price_override_approved: revOverrideInput,
        expected_version: activeSo.version,
        expected_material_version: activeSo.material_version,
        idempotency_key: nextSequentialKey('p12-approve'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReturnSo() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.returnSalesOrder({
        so_id: activeSo.so_id,
        reviewer_user_id: revReviewerInput,
        reason: revReasonInput,
        expected_version: activeSo.version,
        idempotency_key: nextSequentialKey('p12-return'),
      })
    );
    if (res.ok) setRevReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReviseSo() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.reviseSalesOrder({
        so_id: activeSo.so_id,
        actor_user_id: soOfficerInput.trim() || activeSo.sales_officer_id,
        ordered_quantity_value: reviseQtyInput.trim() || activeSo.ordered_quantity.value,
        unit_price: revisePriceInput.trim() || activeSo.unit_price,
        discount_amount: reviseDiscountInput.trim() || activeSo.discount_amount,
        payment_terms: reviseTermsInput.trim() || activeSo.payment_terms,
        reason: revReasonInput,
        expected_version: activeSo.version,
        expected_material_version: activeSo.material_version,
        idempotency_key: nextSequentialKey('p12-revise'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setRevReasonInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCancelSo() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.cancelSalesOrder({
        so_id: activeSo.so_id,
        actor_user_id: revReviewerInput.trim() || activeSo.sales_officer_id,
        reason: revReasonInput,
        expected_version: activeSo.version,
        idempotency_key: nextSequentialKey('p12-cancel'),
      })
    );
    if (res.ok) setRevReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCommitSplit() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.commitSoStockSplit({
        so_id: activeSo.so_id,
        actor_user_id: splitActorInput,
        split_at: splitAtInput,
        expected_version: activeSo.version,
        idempotency_key: nextSequentialKey('p12-split'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordAcceptance() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.recordBuyerAcceptance({
        so_id: activeSo.so_id,
        actor_user_id: accActorInput,
        decision: accDecisionInput,
        contact_channel: accChannelInput,
        contact_outcome: accOutcomeInput,
        recorded_at: accRecordedAtInput,
        expected_version: activeSo.version,
        idempotency_key: nextSequentialKey('p12-accept'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleIssueSi() {
    playClickPen(soundEnabled);
    if (!activeSo) return;
    const res = refreshSnapshot(
      engine.issueFullOrderSalesInvoice({
        so_id: activeSo.so_id,
        actor_user_id: siActorInput,
        issued_at: siIssuedAtInput,
        expected_version: activeSo.version,
        idempotency_key: nextSequentialKey('p12-si'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupSalesOrderOperation({
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
      engine.lookupSalesOrderOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleOrders = snapshot.sales_orders.filter(
    (s) =>
      !normalizedSearch ||
      (s.reference ?? '').toLowerCase().includes(normalizedSearch) ||
      s.buyer_name.toLowerCase().includes(normalizedSearch) ||
      s.variant_id.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p12-workspace">
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
                id="p12-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sales orders, buyers, or variants"
                aria-label="Search sales orders"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Sales Orders, Buyer Acceptance &amp; Invoicing</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Sales order workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p12-tab-intake"
                  aria-selected={activeTab === 'intake'}
                  className={`p03-filter-pill ${activeTab === 'intake' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('intake');
                  }}
                >
                  Order Intake &amp; Stock Pool
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p12-tab-review"
                  aria-selected={activeTab === 'review'}
                  className={`p03-filter-pill ${activeTab === 'review' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('review');
                  }}
                >
                  Independent Review &amp; Stock Split
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p12-tab-acceptance"
                  aria-selected={activeTab === 'acceptance'}
                  className={`p03-filter-pill ${activeTab === 'acceptance' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('acceptance');
                  }}
                >
                  Buyer Acceptance &amp; Full-Order Invoice
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p12-tab-history"
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
                id="p12-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p12-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p12-overview-heading" className="p03-section-title">
              Sales Demand &amp; Billing Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              {hasUnsavedDraft ? (
                <span className="p03-version-pill" data-testid="p12-unsaved-draft-pill">
                  Unsaved Draft Edits Preserved
                </span>
              ) : null}
              <span className="p03-version-pill">
                Orders: <strong>{snapshot.sales_orders.length}</strong>
              </span>
              <span className="p03-version-pill">
                Issued Invoices: <strong>{snapshot.summary.issued_invoices}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p12-usable-on-hand-val">
                {snapshot.summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">SO Reserved</span>
              <span className="p03-axis-val" data-testid="p12-so-reserved-val">
                {snapshot.summary.so_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val" data-testid="p12-available-val">
                {snapshot.summary.available_to_allocate}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Accepted Backorders</span>
              <span className="p03-axis-val" data-testid="p12-backorders-val">
                {snapshot.summary.active_backorders}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p12-feedback-banner"
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

        {/* TAB 1: Order Intake & Stock Pool */}
        {activeTab === 'intake' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p12-pool-heading">
                <h2 id="p12-pool-heading" className="p03-section-title">
                  Configure Approved Sale Stock Pool &amp; Pricing Policy
                </h2>
                <p className="p03-muted-copy">
                  Register eligible usable stockroom quantities, existing RF commitments, approved
                  selling prices, and maximum allowed chapter discount per item variant.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-pool-variant-id" className="form-label">
                      Variant ID
                    </label>
                    <input
                      id="p12-pool-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poolVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setPoolVariantInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-pool-item-name" className="form-label">
                      Item Description
                    </label>
                    <input
                      id="p12-pool-item-name"
                      type="text"
                      className="form-control"
                      value={poolItemInput}
                      placeholder="e.g. Four-Person Field Tent"
                      onChange={(e) => setPoolItemInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-pool-usable" className="form-label">
                      Usable On-Hand
                    </label>
                    <input
                      id="p12-pool-usable"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poolUsableInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setPoolUsableInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-pool-rf-reserved" className="form-label">
                      Existing RF Reserved
                    </label>
                    <input
                      id="p12-pool-rf-reserved"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poolRfReservedInput}
                      placeholder="e.g. 6"
                      onChange={(e) => setPoolRfReservedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-pool-unit-price" className="form-label">
                      Approved Unit Price (PHP)
                    </label>
                    <input
                      id="p12-pool-unit-price"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poolUnitPriceInput}
                      placeholder="e.g. 250.00"
                      onChange={(e) => setPoolUnitPriceInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-pool-max-discount" className="form-label">
                      Max Approved Discount (PHP)
                    </label>
                    <input
                      id="p12-pool-max-discount"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poolMaxDiscountInput}
                      placeholder="e.g. 50.00"
                      onChange={(e) => setPoolMaxDiscountInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p12-pool-scale" className="form-label">
                    Unit Decimal Precision
                  </label>
                  <select
                    id="p12-pool-scale"
                    className="form-control"
                    value={poolScaleInput}
                    onChange={(e) => setPoolScaleInput(e.target.value)}
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
                    id="p12-configure-pool-btn"
                    className="btn-batcave-secondary"
                    onClick={handleConfigurePool}
                  >
                    Save Sale Stock Pool
                  </button>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p12-draft-heading">
                <h2 id="p12-draft-heading" className="p03-section-title">
                  Record Staff-Entered Buyer Sales Order
                </h2>
                <p className="p03-muted-copy">
                  Sales staff enter buyer orders directly; buyers require no login account. Only
                  independently approved orders can reserve stock or issue invoices.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-so-officer-id" className="form-label">
                      Recording Officer ID
                    </label>
                    <input
                      id="p12-so-officer-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soOfficerInput}
                      placeholder="e.g. 101"
                      onChange={(e) => setSoOfficerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-so-variant-id" className="form-label">
                      Variant ID
                    </label>
                    <input
                      id="p12-so-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setSoVariantInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-so-buyer-name" className="form-label">
                      Buyer Full Name
                    </label>
                    <input
                      id="p12-so-buyer-name"
                      type="text"
                      className="form-control"
                      value={soBuyerNameInput}
                      placeholder="e.g. Maria Santos"
                      onChange={(e) => setSoBuyerNameInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-so-buyer-contact" className="form-label">
                      Buyer Phone or Contact
                    </label>
                    <input
                      id="p12-so-buyer-contact"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soBuyerContactInput}
                      placeholder="e.g. 09171234567"
                      onChange={(e) => setSoBuyerContactInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-so-qty" className="form-label">
                      Ordered Quantity
                    </label>
                    <input
                      id="p12-so-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soQtyInput}
                      placeholder="e.g. 7"
                      onChange={(e) => setSoQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-so-scale" className="form-label">
                      Precision Scale
                    </label>
                    <select
                      id="p12-so-scale"
                      className="form-control"
                      value={soScaleInput}
                      onChange={(e) => setSoScaleInput(e.target.value)}
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
                    <label htmlFor="p12-so-unit-price" className="form-label">
                      Unit Price (PHP)
                    </label>
                    <input
                      id="p12-so-unit-price"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soUnitPriceInput}
                      placeholder="e.g. 250.00"
                      onChange={(e) => setSoUnitPriceInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-so-discount" className="form-label">
                      Total Discount (PHP)
                    </label>
                    <input
                      id="p12-so-discount"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soDiscountInput}
                      placeholder="e.g. 50.00"
                      onChange={(e) => setSoDiscountInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p12-so-arrangement" className="form-label">
                      Handover Arrangement
                    </label>
                    <select
                      id="p12-so-arrangement"
                      className="form-control"
                      value={soArrangementInput}
                      onChange={(e) =>
                        setSoArrangementInput(e.target.value as 'pickup' | 'delivery')
                      }
                    >
                      <option value="pickup">Chapter Pickup</option>
                      <option value="delivery">Direct Delivery</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p12-so-requested-at" className="form-label">
                      Order Timestamp (UTC)
                    </label>
                    <input
                      id="p12-so-requested-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={soRequestedAtInput}
                      placeholder="YYYY-MM-DDTHH:MM:SSZ"
                      onChange={(e) => setSoRequestedAtInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p12-so-terms" className="form-label">
                    Payment &amp; Backorder Terms
                  </label>
                  <input
                    id="p12-so-terms"
                    type="text"
                    className="form-control"
                    value={soTermsInput}
                    placeholder="e.g. Deposit within 48 hours"
                    onChange={(e) => setSoTermsInput(e.target.value)}
                  />
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p12-create-draft-btn"
                    className="btn-batcave-primary"
                    onClick={handleCreateSoDraft}
                  >
                    Save Sales Order Draft
                  </button>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p12-pools-list-heading">
                <h2 id="p12-pools-list-heading" className="p03-section-title">
                  Eligible Sale Stock Pools ({snapshot.stock_pools.length})
                </h2>
                {snapshot.stock_pools.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p12-empty-pools-notice">
                    No sale stock pools configured yet.
                  </p>
                ) : (
                  <div className="p03-table-wrap">
                    <table className="p03-table">
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th>Usable</th>
                          <th>RF Reserved</th>
                          <th>SO Reserved</th>
                          <th>Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.stock_pools.map((pool) => (
                          <tr key={pool.pool_id}>
                            <td>
                              {pool.item_name} ({pool.variant_id})
                            </td>
                            <td className="p03-mono-inline">{pool.usable_on_hand.value}</td>
                            <td className="p03-mono-inline">{pool.existing_rf_reserved.value}</td>
                            <td className="p03-mono-inline">{pool.so_reserved.value}</td>
                            <td className="p03-mono-inline">{pool.available_to_allocate.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="p03-card surface-card" aria-labelledby="p12-orders-list-heading">
                <h2 id="p12-orders-list-heading" className="p03-section-title">
                  Sales Orders Queue ({visibleOrders.length})
                </h2>
                {visibleOrders.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p12-empty-orders-notice">
                    No sales orders recorded yet. Save a draft to assign a sequential reference.
                  </p>
                ) : (
                  <div className="p03-queue-list" data-testid="p12-orders-list">
                    {visibleOrders.map((so) => (
                      <div key={so.so_id} className="p03-queue-item">
                        <div className="p03-queue-meta">
                          <strong>{so.reference ?? `Draft #${so.so_id}`}</strong>
                          <span>
                            Buyer: {so.buyer_name} — Qty {so.ordered_quantity.value} — Net PHP{' '}
                            {so.net_amount_due} — {SO_STATUS_LABELS[so.status]}
                          </span>
                        </div>
                        <div className="p03-queue-actions">
                          {so.status === 'draft' ? (
                            <button
                              type="button"
                              className="btn-batcave-secondary p03-shrink-btn"
                              data-testid={`p12-submit-so-${so.so_id}`}
                              onClick={() => handleSubmitSo(so)}
                            >
                              Submit for Review
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-batcave-secondary p03-shrink-btn"
                            data-testid={`p12-select-so-${so.so_id}`}
                            onClick={() => {
                              playClickPen(soundEnabled);
                              setSelectedSoId(so.so_id);
                              setActiveTab('review');
                            }}
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Independent Review & Stock Split */}
        {activeTab === 'review' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p12-review-heading">
              <h2 id="p12-review-heading" className="p03-section-title">
                Independent Review, Return &amp; Material Revision
              </h2>
              {!activeSo ? (
                <p className="p03-muted-copy">Select or create a sales order first.</p>
              ) : (
                <>
                  <div className="session-ledger" data-testid="p12-selected-so-summary">
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Order Reference</span>
                      <span className="session-ledger-val p03-mono-inline">
                        {activeSo.reference ?? `Draft #${activeSo.so_id}`}
                      </span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Status &amp; Material Version</span>
                      <span className="session-ledger-val">
                        {SO_STATUS_LABELS[activeSo.status]} (v{activeSo.material_version})
                      </span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Quantity &amp; Net Due</span>
                      <span className="session-ledger-val p03-mono-inline">
                        {activeSo.ordered_quantity.value} units — PHP {activeSo.net_amount_due}
                      </span>
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p12-review-actor-id" className="form-label">
                        Independent Reviewer ID
                      </label>
                      <input
                        id="p12-review-actor-id"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={revReviewerInput}
                        placeholder="Approver ID (e.g. 202)"
                        onChange={(e) => setRevReviewerInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p12-review-duty" className="form-label">
                        Reviewing Duty
                      </label>
                      <select
                        id="p12-review-duty"
                        className="form-control"
                        value={revDutyInput}
                        onChange={(e) =>
                          setRevDutyInput(e.target.value as 'SALES_REVIEWER' | 'FINANCE_OFFICER')
                        }
                      >
                        <option value="SALES_REVIEWER">Sales Reviewer</option>
                        <option value="FINANCE_OFFICER">Finance Reviewer</option>
                      </select>
                    </div>
                  </div>

                  <div className="p03-checkbox-row">
                    <input
                      id="p12-review-override"
                      type="checkbox"
                      checked={revOverrideInput}
                      onChange={(e) => setRevOverrideInput(e.target.checked)}
                    />
                    <label htmlFor="p12-review-override">
                      Authorized price or discount override granted
                    </label>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p12-review-reason" className="form-label">
                      Return / Revision / Cancellation Reason
                    </label>
                    <input
                      id="p12-review-reason"
                      type="text"
                      className="form-control"
                      value={revReasonInput}
                      placeholder="Required for return or revise"
                      onChange={(e) => setRevReasonInput(e.target.value)}
                    />
                  </div>

                  <div className="p03-guard-buttons">
                    <button
                      type="button"
                      id="p12-approve-so-btn"
                      className="btn-batcave-primary"
                      onClick={handleApproveSo}
                    >
                      Approve Sales Order
                    </button>
                    <button
                      type="button"
                      id="p12-return-so-btn"
                      className="btn-batcave-secondary"
                      onClick={handleReturnSo}
                    >
                      Return for Revision
                    </button>
                    <button
                      type="button"
                      id="p12-cancel-so-btn"
                      className="btn-batcave-secondary"
                      onClick={handleCancelSo}
                    >
                      Cancel Sales Order
                    </button>
                  </div>

                  <hr />
                  <h3 className="p03-section-title">Revise Returned Order</h3>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p12-revise-qty" className="form-label">
                        Revised Quantity
                      </label>
                      <input
                        id="p12-revise-qty"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={reviseQtyInput}
                        placeholder="Optional new qty"
                        onChange={(e) => setReviseQtyInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p12-revise-discount" className="form-label">
                        Revised Discount (PHP)
                      </label>
                      <input
                        id="p12-revise-discount"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={reviseDiscountInput}
                        placeholder="e.g. 50.00"
                        onChange={(e) => setReviseDiscountInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p12-revise-price" className="form-label">
                        Revised Unit Price (PHP)
                      </label>
                      <input
                        id="p12-revise-price"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={revisePriceInput}
                        placeholder="Optional unit price"
                        onChange={(e) => setRevisePriceInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p12-revise-terms" className="form-label">
                        Revised Terms
                      </label>
                      <input
                        id="p12-revise-terms"
                        type="text"
                        className="form-control"
                        value={reviseTermsInput}
                        placeholder="Optional new terms"
                        onChange={(e) => setReviseTermsInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-guard-buttons">
                    <button
                      type="button"
                      id="p12-revise-so-btn"
                      className="btn-batcave-secondary"
                      onClick={handleReviseSo}
                    >
                      Save Revision to Draft
                    </button>
                    {activeSo.status === 'draft' ? (
                      <button
                        type="button"
                        id="p12-resubmit-so-btn"
                        className="btn-batcave-secondary"
                        onClick={() => handleSubmitSo(activeSo)}
                      >
                        Resubmit for Review
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p12-split-heading">
              <h2 id="p12-split-heading" className="p03-section-title">
                Inventory Stock Split (Available vs. Backorder)
              </h2>
              <p className="p03-muted-copy">
                Reserves currently eligible stockroom units and separates any uncovered shortage.
                Available unpaid stock starts its 48-hour expiry clock immediately; the separate
                backorder deposit clock begins only after buyer acceptance.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p12-split-actor-id" className="form-label">
                    Inventory Officer ID
                  </label>
                  <input
                    id="p12-split-actor-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={splitActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setSplitActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p12-split-at" className="form-label">
                    Split Timestamp (UTC)
                  </label>
                  <input
                    id="p12-split-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={splitAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setSplitAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p12-commit-split-btn"
                  className="btn-batcave-primary"
                  onClick={handleCommitSplit}
                >
                  Commit Available &amp; Backorder Split
                </button>
              </div>

              {activeSo?.split_completed ? (
                <div className="session-ledger" data-testid="p12-split-ledger">
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Reserved Available</span>
                    <span className="session-ledger-val p03-mono-inline">
                      {activeSo.reserved_available_quantity} (Expires:{' '}
                      {activeSo.available_reservation_expires_at ?? 'N/A'})
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Backorder Shortage</span>
                    <span className="session-ledger-val p03-mono-inline">
                      {activeSo.backorder_shortage_quantity} (Deposit Deadline:{' '}
                      {activeSo.backorder_deposit_expires_at ?? 'Awaiting Acceptance'})
                    </span>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Buyer Acceptance & Full-Order Invoice */}
        {activeTab === 'acceptance' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p12-accept-heading">
              <h2 id="p12-accept-heading" className="p03-section-title">
                Record Buyer Split &amp; Backorder Acceptance
              </h2>
              <p className="p03-muted-copy">
                Recording full backorder acceptance starts the separate 48-hour deposit clock.
                Declined shortages are canceled and blocked from purchasing procurement.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p12-acc-actor-id" className="form-label">
                    Sales Officer ID
                  </label>
                  <input
                    id="p12-acc-actor-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={accActorInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setAccActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p12-acc-decision" className="form-label">
                    Buyer Decision
                  </label>
                  <select
                    id="p12-acc-decision"
                    className="form-control"
                    value={accDecisionInput}
                    onChange={(e) =>
                      setAccDecisionInput(e.target.value as BuyerAcceptanceDecision)
                    }
                  >
                    <option value="accept_all">Accept Available + Backorder</option>
                    <option value="accept_available_only">Accept Available Only (Decline Backorder)</option>
                    <option value="decline_all">Decline Entire Split &amp; Cancel</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p12-acc-channel" className="form-label">
                    Communication Channel
                  </label>
                  <input
                    id="p12-acc-channel"
                    type="text"
                    className="form-control"
                    value={accChannelInput}
                    placeholder="e.g. Phone Call or SMS"
                    onChange={(e) => setAccChannelInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p12-acc-recorded-at" className="form-label">
                    Acceptance Timestamp (UTC)
                  </label>
                  <input
                    id="p12-acc-recorded-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={accRecordedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAccRecordedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p12-acc-outcome" className="form-label">
                  Recorded Communication Summary
                </label>
                <input
                  id="p12-acc-outcome"
                  type="text"
                  className="form-control"
                  value={accOutcomeInput}
                  placeholder="Buyer confirmed terms"
                  onChange={(e) => setAccOutcomeInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p12-record-acceptance-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordAcceptance}
                >
                  Record Buyer Decision
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p12-si-heading">
              <h2 id="p12-si-heading" className="p03-section-title">
                Issue Full-Order Sales Invoice (Billing Notice Only)
              </h2>
              <p className="p03-muted-copy">
                Displays available and backordered quantities alongside total due. A Sales Invoice
                is never proof of payment and confers zero release authority.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p12-si-actor-id" className="form-label">
                    Billing Officer ID
                  </label>
                  <input
                    id="p12-si-actor-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={siActorInput}
                    placeholder="e.g. 401"
                    onChange={(e) => setSiActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p12-si-issued-at" className="form-label">
                    Issue Timestamp (UTC)
                  </label>
                  <input
                    id="p12-si-issued-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={siIssuedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setSiIssuedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p12-issue-si-btn"
                  className="btn-batcave-primary"
                  onClick={handleIssueSi}
                >
                  Issue Full-Order Sales Invoice
                </button>
              </div>

              {snapshot.invoices.length > 0 ? (
                <div className="p03-table-wrap" data-testid="p12-invoices-table">
                  <table className="p03-table">
                    <thead>
                      <tr>
                        <th>Invoice Ref</th>
                        <th>Available / Backorder</th>
                        <th>Net Due (PHP)</th>
                        <th>Release Authority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.invoices.map((inv) => (
                        <tr key={inv.si_id}>
                          <td className="p03-mono-inline">{inv.si_reference}</td>
                          <td className="p03-mono-inline">
                            {inv.available_quantity} / {inv.backordered_quantity}
                          </td>
                          <td className="p03-mono-inline">{inv.net_amount_due}</td>
                          <td>None (Billing Only)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Operation Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p12-history-heading">
              <h2 id="p12-history-heading" className="p03-section-title">
                Sales Order Audit Trail ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p12-history-list">
                  {snapshot.history.map((item) => (
                    <div key={item.event_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{item.action}</strong>
                        <span>
                          Actor {item.actor_user_id} — SO #{item.so_id} — v{item.version} / mat v
                          {item.material_version}
                          {item.reason ? ` — "${item.reason}"` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p12-lookup-heading">
              <h2 id="p12-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p12-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p12-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p12-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p12-lookup-ulid-input"
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
                  id="p12-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p12-lookup-by-ulid-btn"
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
                        data-testid={`p12-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p12-lookup-result" aria-live="polite">
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
