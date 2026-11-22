import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP09QuotationPoEngine } from './p09QuotationPoSlice';
import type {
  ApprovedRepfSource,
  P09ActionResult,
  P09EngineSnapshot,
  P09LookupResult,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
} from './p09QuotationPoSlice';

type P09TabId = 'quotations' | 'po-issue' | 'amendments' | 'history';

interface P09QuotationPoWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  issued: 'Issued (Inbound Open)',
  acknowledged: 'Supplier Acknowledged',
  canceled: 'Canceled',
};

export function P09QuotationPoWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P09QuotationPoWorkspaceProps) {
  const engine = useMemo(() => createP09QuotationPoEngine(), []);
  const [snapshot, setSnapshot] = useState<P09EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P09TabId>('quotations');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P09ActionResult | null>(snapshot.last_action);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedPoId, setSelectedPoId] = useState('');

  // Tab 1: Approved RepF Source & Supplier Quotations (strictly empty by default)
  const [srcRepfRefInput, setSrcRepfRefInput] = useState('');
  const [srcPreparerInput, setSrcPreparerInput] = useState('');
  const [srcVariantInput, setSrcVariantInput] = useState('');
  const [srcItemNameInput, setSrcItemNameInput] = useState('');
  const [srcQtyInput, setSrcQtyInput] = useState('');
  const [srcScaleInput, setSrcScaleInput] = useState('');
  const [srcCeilingInput, setSrcCeilingInput] = useState('');
  const [srcMinQuotesInput, setSrcMinQuotesInput] = useState('');
  const [srcEmergencyInput, setSrcEmergencyInput] = useState(false);

  const [quoteActorInput, setQuoteActorInput] = useState('');
  const [quoteSupplierInput, setQuoteSupplierInput] = useState('');
  const [quoteUnitPriceInput, setQuoteUnitPriceInput] = useState('');
  const [quoteTotalCostInput, setQuoteTotalCostInput] = useState('');
  const [quoteLeadDaysInput, setQuoteLeadDaysInput] = useState('');
  const [quoteWarrantyInput, setQuoteWarrantyInput] = useState('');
  const [quoteTermsInput, setQuoteTermsInput] = useState('');
  const [quoteSpecMatchesInput, setQuoteSpecMatchesInput] = useState(true);
  const [quoteRationaleInput, setQuoteRationaleInput] = useState('');

  // Tab 2: PO Issue (strictly empty by default)
  const [poApproverInput, setPoApproverInput] = useState('');
  const [poHasAuthInput, setPoHasAuthInput] = useState(true);
  const [poLocationInput, setPoLocationInput] = useState('');
  const [poExpectedAtInput, setPoExpectedAtInput] = useState('');

  // Tab 3: Acknowledgment & Amendments
  const [ackActorInput, setAckActorInput] = useState('');
  const [ackTimestampInput, setAckTimestampInput] = useState('');
  const [amendQtyInput, setAmendQtyInput] = useState('');
  const [amendDeliveryInput, setAmendDeliveryInput] = useState('');
  const [amendReasonInput, setAmendReasonInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P09ActionResult<P09LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P09ActionResult<T>): P09ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeSource: ApprovedRepfSource | undefined =
    snapshot.repf_sources.find((s) => s.source_id === selectedSourceId) ?? snapshot.repf_sources[0];

  const activePo: PurchaseOrderRecord | undefined =
    snapshot.purchase_orders.find((p) => p.po_id === selectedPoId) ?? snapshot.purchase_orders[0];

  function handleRegisterSource() {
    playClickPen(soundEnabled);
    if (srcScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the approved source.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const minQuotes = Number(srcMinQuotesInput.trim() || '2');
    const res = refreshSnapshot(
      engine.registerApprovedRepfSource({
        repf_reference: srcRepfRefInput,
        preparer_user_id: srcPreparerInput,
        variant_id: srcVariantInput,
        item_name: srcItemNameInput.trim() || undefined,
        approved_need_quantity_value: srcQtyInput,
        quantity_scale: Number(srcScaleInput),
        budget_ceiling_amount: srcCeilingInput,
        min_required_quotes: Number.isInteger(minQuotes) ? minQuotes : 0,
        is_emergency: srcEmergencyInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedSourceId(res.data.source_id);
      setSrcRepfRefInput('');
      setSrcQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordQuote() {
    playClickPen(soundEnabled);
    if (!activeSource) {
      const msg = 'Register a budget-approved purchase request source first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.recordSupplierQuotation({
        actor_user_id: quoteActorInput.trim() || '301',
        repf_source_id: activeSource.source_id,
        supplier_name: quoteSupplierInput,
        unit_price: quoteUnitPriceInput,
        total_cost: quoteTotalCostInput,
        lead_time_days: Number(quoteLeadDaysInput.trim() || '3'),
        warranty_terms: quoteWarrantyInput,
        payment_terms: quoteTermsInput,
        spec_matches_repf: quoteSpecMatchesInput,
        idempotency_key: nextSequentialKey('p09-quote'),
      })
    );
    if (res.ok) {
      setQuoteSupplierInput('');
      setQuoteUnitPriceInput('');
      setQuoteTotalCostInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSelectQuote(quotationId: string) {
    playClickPen(soundEnabled);
    if (!activeSource) return;
    const res = refreshSnapshot(
      engine.selectWinningQuotation({
        actor_user_id: quoteActorInput.trim() || '301',
        repf_source_id: activeSource.source_id,
        quotation_id: quotationId,
        selection_rationale: quoteRationaleInput,
        idempotency_key: nextSequentialKey('p09-select'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleIssuePo() {
    playClickPen(soundEnabled);
    if (!activeSource) {
      const msg = 'Select an approved purchase request with a winning supplier quote first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.issueApprovedPo({
        repf_source_id: activeSource.source_id,
        approver_user_id: poApproverInput,
        has_purchase_authority: poHasAuthInput,
        delivery_location: poLocationInput,
        expected_delivery_at: poExpectedAtInput,
        idempotency_key: nextSequentialKey('p09-issue'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedPoId(res.data.po_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAcknowledgePo() {
    playClickPen(soundEnabled);
    if (!activePo) return;
    const res = refreshSnapshot(
      engine.acknowledgeSupplierPo({
        actor_user_id: ackActorInput.trim() || '301',
        po_id: activePo.po_id,
        acknowledged_at: ackTimestampInput,
        expected_version: activePo.version,
        idempotency_key: nextSequentialKey('p09-ack'),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAmendOrCancelPo(actionType: 'amend' | 'cancel') {
    playClickPen(soundEnabled);
    if (!activePo) return;
    const res = refreshSnapshot(
      engine.amendOrCancelPo({
        actor_user_id: poApproverInput.trim() || activePo.approver_user_id,
        po_id: activePo.po_id,
        action_type: actionType,
        new_quantity_value: amendQtyInput.trim() || undefined,
        new_expected_delivery_at: amendDeliveryInput.trim() || undefined,
        reason: amendReasonInput,
        expected_version: activePo.version,
        idempotency_key: nextSequentialKey(`p09-${actionType}`),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupPoOperation({
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
      engine.lookupPoOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleQuotations = snapshot.quotations.filter(
    (q) =>
      (!activeSource || q.repf_source_id === activeSource.source_id) &&
      (!normalizedSearch ||
        q.supplier_name.toLowerCase().includes(normalizedSearch) ||
        q.warranty_terms.toLowerCase().includes(normalizedSearch))
  );

  return (
    <main className="p03-workspace-shell" data-testid="p09-workspace">
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
                id="p09-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search suppliers, warranty terms, or Purchase Order references"
                aria-label="Search supplier quotations and purchase orders"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Quotations, Supplier Selection &amp; Purchase Orders</h1>
            </div>

            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Quotation and PO stages">
                <button
                  type="button"
                  role="tab"
                  id="p09-tab-quotations"
                  aria-selected={activeTab === 'quotations'}
                  className={`p03-filter-pill ${activeTab === 'quotations' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('quotations');
                  }}
                >
                  Quotations &amp; Comparison
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p09-tab-po-issue"
                  aria-selected={activeTab === 'po-issue'}
                  className={`p03-filter-pill ${activeTab === 'po-issue' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('po-issue');
                  }}
                >
                  Purchase Order Issue
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p09-tab-amendments"
                  aria-selected={activeTab === 'amendments'}
                  className={`p03-filter-pill ${activeTab === 'amendments' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('amendments');
                  }}
                >
                  Acknowledgment &amp; Amendments
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p09-tab-history"
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
                id="p09-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p09-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p09-overview-heading" className="p03-section-title">
              Inbound Commitments &amp; Order Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Approved Sources: <strong>{snapshot.repf_sources.length}</strong>
              </span>
              <span className="p03-version-pill">
                Quotations: <strong>{snapshot.quotations.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p09-usable-on-hand-val">
                {snapshot.summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Confirmed Inbound PO</span>
              <span className="p03-axis-val" data-testid="p09-inbound-val">
                {snapshot.summary.confirmed_inbound_quantity}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Remaining Uncovered Need</span>
              <span className="p03-axis-val" data-testid="p09-uncovered-val">
                {snapshot.summary.uncovered_net_need}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Issued POs</span>
              <span className="p03-axis-val" data-testid="p09-issued-po-count-val">
                {snapshot.summary.issued_po_count}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p09-feedback-banner"
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

        {/* TAB 1: Approved Source Registration & Like-for-Like Quotations */}
        {activeTab === 'quotations' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-source-heading">
                <h2 id="p09-source-heading" className="p03-section-title">
                  Approved Purchase Request Source
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-src-ref" className="form-label">
                      Purchase Request Reference
                    </label>
                    <input
                      id="p09-src-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcRepfRefInput}
                      placeholder="e.g. CEBU-REPF-2026-000001"
                      onChange={(e) => setSrcRepfRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-src-preparer" className="form-label">
                      Preparer Member ID
                    </label>
                    <input
                      id="p09-src-preparer"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcPreparerInput}
                      placeholder="e.g. 101"
                      onChange={(e) => setSrcPreparerInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-src-variant" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p09-src-variant"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setSrcVariantInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-src-item-name" className="form-label">
                      Item Name (Optional)
                    </label>
                    <input
                      id="p09-src-item-name"
                      type="text"
                      className="form-control"
                      value={srcItemNameInput}
                      placeholder="e.g. Four-Person Field Tent"
                      onChange={(e) => setSrcItemNameInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-src-qty" className="form-label">
                      Approved Need Quantity
                    </label>
                    <input
                      id="p09-src-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcQtyInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setSrcQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-src-scale" className="form-label">
                      Unit Precision Scale
                    </label>
                    <select
                      id="p09-src-scale"
                      className="form-control"
                      value={srcScaleInput}
                      onChange={(e) => setSrcScaleInput(e.target.value)}
                    >
                      <option value="">Scale (0–6)</option>
                      <option value="0">0 — Whole units</option>
                      <option value="2">2 — Hundredths (0.01)</option>
                      <option value="3">3 — Thousandths (0.001)</option>
                    </select>
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-src-ceiling" className="form-label">
                      Budget Ceiling (PHP)
                    </label>
                    <input
                      id="p09-src-ceiling"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcCeilingInput}
                      placeholder="e.g. 2500.00"
                      onChange={(e) => setSrcCeilingInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-src-min-quotes" className="form-label">
                      Required Comparable Quotes
                    </label>
                    <input
                      id="p09-src-min-quotes"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={srcMinQuotesInput}
                      placeholder="e.g. 2"
                      onChange={(e) => setSrcMinQuotesInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-input-action-row">
                  <label
                    className={`p03-checkbox-row ${srcEmergencyInput ? 'is-checked' : ''}`}
                    htmlFor="p09-src-emergency-checkbox"
                  >
                    <input
                      id="p09-src-emergency-checkbox"
                      type="checkbox"
                      className="p03-sr-checkbox"
                      checked={srcEmergencyInput}
                      onChange={(e) => {
                        playClickPen(soundEnabled);
                        setSrcEmergencyInput(e.target.checked);
                      }}
                    />
                    <span className="p03-checkbox-main">
                      <span className="p03-check-indicator" aria-hidden="true">
                        {srcEmergencyInput ? (
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span>Emergency Procurement Waiver</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    id="p09-register-source-btn"
                    className="btn-batcave-primary p03-shrink-btn"
                    onClick={handleRegisterSource}
                  >
                    Register Approved Source
                  </button>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p09-record-quote-heading">
                <h2 id="p09-record-quote-heading" className="p03-section-title">
                  Record Like-for-Like Supplier Quotation
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-quote-supplier" className="form-label">
                      Supplier Name
                    </label>
                    <input
                      id="p09-quote-supplier"
                      type="text"
                      className="form-control"
                      value={quoteSupplierInput}
                      placeholder="e.g. Mactan Gear Supply"
                      onChange={(e) => setQuoteSupplierInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-quote-actor" className="form-label">
                      Purchasing Officer ID
                    </label>
                    <input
                      id="p09-quote-actor"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={quoteActorInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setQuoteActorInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-quote-unit-price" className="form-label">
                      Unit Price (PHP)
                    </label>
                    <input
                      id="p09-quote-unit-price"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={quoteUnitPriceInput}
                      placeholder="e.g. 240.00"
                      onChange={(e) => setQuoteUnitPriceInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-quote-total-cost" className="form-label">
                      Total Cost (PHP)
                    </label>
                    <input
                      id="p09-quote-total-cost"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={quoteTotalCostInput}
                      placeholder="e.g. 2400.00"
                      onChange={(e) => setQuoteTotalCostInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-quote-lead-days" className="form-label">
                      Lead Time (Days)
                    </label>
                    <input
                      id="p09-quote-lead-days"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={quoteLeadDaysInput}
                      placeholder="e.g. 5"
                      onChange={(e) => setQuoteLeadDaysInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-quote-warranty" className="form-label">
                      Warranty Coverage
                    </label>
                    <input
                      id="p09-quote-warranty"
                      type="text"
                      className="form-control"
                      value={quoteWarrantyInput}
                      placeholder="e.g. 1 year replacement"
                      onChange={(e) => setQuoteWarrantyInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p09-quote-terms" className="form-label">
                    Commercial Payment Terms
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p09-quote-terms"
                      type="text"
                      className="form-control"
                      value={quoteTermsInput}
                      placeholder="e.g. Net 15 on delivery"
                      onChange={(e) => setQuoteTermsInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p09-record-quote-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleRecordQuote}
                    >
                      Record Quotation
                    </button>
                  </div>
                </div>
                <label
                  className={`p03-checkbox-row ${quoteSpecMatchesInput ? 'is-checked' : ''}`}
                  htmlFor="p09-quote-spec-match"
                >
                  <input
                    id="p09-quote-spec-match"
                    type="checkbox"
                    className="p03-sr-checkbox"
                    checked={quoteSpecMatchesInput}
                    onChange={(e) => {
                      playClickPen(soundEnabled);
                      setQuoteSpecMatchesInput(e.target.checked);
                    }}
                  />
                  <span className="p03-checkbox-main">
                    <span className="p03-check-indicator" aria-hidden="true">
                      {quoteSpecMatchesInput ? (
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>Specification Matches Approved Item Requirements</span>
                  </span>
                </label>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-compare-heading">
                <h2 id="p09-compare-heading" className="p03-section-title">
                  Comparable Supplier Offers &amp; Selection Rationale
                </h2>
                <div className="form-group">
                  <label htmlFor="p09-quote-rationale" className="form-label">
                    Supplier Selection Rationale (Required)
                  </label>
                  <input
                    id="p09-quote-rationale"
                    type="text"
                    className="form-control"
                    value={quoteRationaleInput}
                    placeholder="Document cost, warranty, lead-time, and reliability rationale"
                    onChange={(e) => setQuoteRationaleInput(e.target.value)}
                  />
                </div>

                {visibleQuotations.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p09-empty-quotes-notice">
                    No supplier quotations recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p09-quotations-list">
                    {visibleQuotations.map((q) => (
                      <article key={q.quotation_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <strong>{q.supplier_name}</strong>
                          <span className="p03-version-pill">
                            {q.selected ? 'Selected Winner' : `PHP ${q.total_cost}`}
                          </span>
                        </div>
                        <p className="p03-muted-copy">
                          Unit: PHP {q.unit_price} &middot; Lead: {q.lead_time_days}d &middot;{' '}
                          {q.warranty_terms} &middot; {q.payment_terms}
                        </p>
                        {!q.selected ? (
                          <button
                            type="button"
                            data-testid={`p09-select-quote-${q.quotation_id}`}
                            className="btn-batcave-primary"
                            onClick={() => handleSelectQuote(q.quotation_id)}
                          >
                            Select Winning Supplier
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: PO Approval & Issuance */}
        {activeTab === 'po-issue' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-issue-po-heading">
                <h2 id="p09-issue-po-heading" className="p03-section-title">
                  Approve &amp; Issue Purchase Order
                </h2>
                <p className="p03-muted-copy">
                  Issuing a Purchase Order updates confirmed inbound supply and resolves uncovered
                  net need without adding usable on-hand stock until inspected receipt.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-po-approver" className="form-label">
                      Purchase Authority Approver ID
                    </label>
                    <input
                      id="p09-po-approver"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poApproverInput}
                      placeholder="Must differ from preparer (e.g. 202)"
                      onChange={(e) => setPoApproverInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-po-location" className="form-label">
                      Delivery Stockroom Location
                    </label>
                    <input
                      id="p09-po-location"
                      type="text"
                      className="form-control"
                      value={poLocationInput}
                      placeholder="e.g. Main Chapter Stockroom"
                      onChange={(e) => setPoLocationInput(e.target.value)}
                    />
                  </div>
                </div>

                <label
                  className={`p03-checkbox-row ${poHasAuthInput ? 'is-checked' : ''}`}
                  htmlFor="p09-po-auth-checkbox"
                >
                  <input
                    id="p09-po-auth-checkbox"
                    type="checkbox"
                    className="p03-sr-checkbox"
                    checked={poHasAuthInput}
                    onChange={(e) => {
                      playClickPen(soundEnabled);
                      setPoHasAuthInput(e.target.checked);
                    }}
                  />
                  <span className="p03-checkbox-main">
                    <span className="p03-check-indicator" aria-hidden="true">
                      {poHasAuthInput ? (
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>Valid Chapter Purchase Authority Granted</span>
                  </span>
                </label>

                <div className="form-group">
                  <label htmlFor="p09-po-expected-at" className="form-label">
                    Expected Supplier Delivery Timestamp (UTC)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p09-po-expected-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poExpectedAtInput}
                      placeholder="e.g. 2026-12-03T10:00:00.000000Z"
                      onChange={(e) => setPoExpectedAtInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p09-issue-po-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleIssuePo}
                    >
                      Approve &amp; Issue Purchase Order
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-po-list-heading">
                <h2 id="p09-po-list-heading" className="p03-section-title">
                  Issued Purchase Orders
                </h2>
                {snapshot.purchase_orders.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p09-empty-pos-notice">
                    No Purchase Orders issued yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p09-po-list">
                    {snapshot.purchase_orders.map((po) => (
                      <article key={po.po_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">{po.reference}</span>
                          <span className="p03-version-pill">
                            {PO_STATUS_LABELS[po.status]}
                          </span>
                        </div>
                        <p className="p03-muted-copy">
                          {po.supplier_name} &middot; Ordered {po.ordered_quantity.value} &middot;
                          Outstanding {po.outstanding_quantity} &middot; PHP {po.total_cost}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Acknowledgment & Amendments */}
        {activeTab === 'amendments' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-ack-heading">
                <h2 id="p09-ack-heading" className="p03-section-title">
                  Record Supplier Acknowledgment
                </h2>
                <div className="form-group">
                  <label htmlFor="p09-ack-po-select" className="form-label">
                    Purchase Order
                  </label>
                  <select
                    id="p09-ack-po-select"
                    className="form-control"
                    value={activePo?.po_id ?? ''}
                    onChange={(e) => setSelectedPoId(e.target.value)}
                  >
                    <option value="">Select Purchase Order</option>
                    {snapshot.purchase_orders.map((p) => (
                      <option key={p.po_id} value={p.po_id}>
                        {p.reference} — {PO_STATUS_LABELS[p.status]} (v{p.version})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-ack-actor" className="form-label">
                      Recording Officer ID
                    </label>
                    <input
                      id="p09-ack-actor"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ackActorInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setAckActorInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-ack-timestamp" className="form-label">
                      Acknowledged Timestamp (UTC)
                    </label>
                    <div className="p03-input-action-row">
                      <input
                        id="p09-ack-timestamp"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={ackTimestampInput}
                        placeholder="e.g. 2026-11-23T08:00:00.000000Z"
                        onChange={(e) => setAckTimestampInput(e.target.value)}
                      />
                      <button
                        type="button"
                        id="p09-ack-po-btn"
                        className="btn-batcave-primary p03-shrink-btn"
                        onClick={handleAcknowledgePo}
                      >
                        Record Acknowledgment
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-amend-heading">
                <h2 id="p09-amend-heading" className="p03-section-title">
                  Reviewed Amendment or Cancellation
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-amend-qty" className="form-label">
                      Amended Order Quantity
                    </label>
                    <input
                      id="p09-amend-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={amendQtyInput}
                      placeholder="Leave blank to keep current"
                      onChange={(e) => setAmendQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-amend-delivery" className="form-label">
                      Amended Delivery Date (UTC)
                    </label>
                    <input
                      id="p09-amend-delivery"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={amendDeliveryInput}
                      placeholder="Leave blank to keep current"
                      onChange={(e) => setAmendDeliveryInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p09-amend-reason" className="form-label">
                    Amendment or Cancellation Reason
                  </label>
                  <input
                    id="p09-amend-reason"
                    type="text"
                    className="form-control"
                    value={amendReasonInput}
                    placeholder="Document reviewed reason for commitment update"
                    onChange={(e) => setAmendReasonInput(e.target.value)}
                  />
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p09-amend-po-btn"
                    className="btn-batcave-primary"
                    onClick={() => handleAmendOrCancelPo('amend')}
                  >
                    Amend Purchase Order
                  </button>
                  <button
                    type="button"
                    id="p09-cancel-po-btn"
                    className="btn-batcave-secondary"
                    onClick={() => handleAmendOrCancelPo('cancel')}
                  >
                    Cancel Purchase Order
                  </button>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 4: History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-history-heading">
                <h2 id="p09-history-heading" className="p03-section-title">
                  Procurement Commitment History
                </h2>
                <div className="p03-history-list" data-testid="p09-history-list">
                  {snapshot.history.map((h) => (
                    <article key={h.event_id} className="p03-history-card">
                      <div className="p03-history-head">
                        <span className="p03-version-pill p03-mono-inline">
                          {h.po_id ? `PO #${h.po_id}` : `Source #${h.repf_source_id}`} &middot; v
                          {h.version}
                        </span>
                        <strong>{h.action}</strong>
                      </div>
                      <p className="p03-muted-copy">
                        Actor #{h.actor_user_id}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p09-lookup-heading">
                <h2 id="p09-lookup-heading" className="p03-section-title">
                  Operation Status Recovery
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p09-lookup-key-input" className="form-label">
                      Idempotency Key
                    </label>
                    <input
                      id="p09-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p09-lookup-ulid-input" className="form-label">
                      Operation ULID
                    </label>
                    <input
                      id="p09-lookup-ulid-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupUlidInput}
                      onChange={(e) => setLookupUlidInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p09-lookup-by-key-btn"
                    className="btn-batcave-primary"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                  <button
                    type="button"
                    id="p09-lookup-by-ulid-btn"
                    className="btn-batcave-secondary"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Operation ID
                  </button>
                </div>
                {lookupResult ? (
                  <div
                    className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                    data-testid="p09-lookup-result"
                  >
                    <span className="p03-blocker-code">{lookupResult.code}</span>
                    <p className="p03-blocker-msg">{lookupResult.message}</p>
                  </div>
                ) : null}
                <div className="p03-ledger-chips" data-testid="p09-operation-ledger">
                  <span className="p03-eyebrow">Committed PO Operations</span>
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((e) => (
                      <button
                        key={e.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p09-ledger-fill-${e.operation_id}`}
                        onClick={() => {
                          setLookupKeyInput(e.idempotency_key);
                          setLookupUlidInput(e.operation_id);
                        }}
                      >
                        {e.code} &middot; {e.idempotency_key}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
