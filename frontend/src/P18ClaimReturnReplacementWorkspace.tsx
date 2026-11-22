import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP18ClaimReturnReplacementEngine } from './p18ClaimReturnReplacementSlice';
import type {
  ClaimInspectionOutcome,
  ClaimSaleChannel,
  CompletedSaleForClaim,
  CustomerClaimAdjRecord,
  P18ActionResult,
  P18EngineSnapshot,
  P18LookupResult,
} from './p18ClaimReturnReplacementSlice';

type P18TabId = 'intake' | 'inspect' | 'replace' | 'history';

interface P18ClaimReturnReplacementWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P18ClaimReturnReplacementWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P18ClaimReturnReplacementWorkspaceProps) {
  const engine = useMemo(() => createP18ClaimReturnReplacementEngine(), []);
  const [snapshot, setSnapshot] = useState<P18EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P18TabId>('intake');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P18ActionResult | null>(snapshot.last_action);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState('');

  // Tab 1: Original Sales & Claim Intake
  const [saleChannelInput, setSaleChannelInput] = useState<ClaimSaleChannel>('track1_so_cdr');
  const [saleSoRefInput, setSaleSoRefInput] = useState('');
  const [saleOrRefInput, setSaleOrRefInput] = useState('');
  const [saleCdrRefInput, setSaleCdrRefInput] = useState('');
  const [saleVariantInput, setSaleVariantInput] = useState('');
  const [saleItemInput, setSaleItemInput] = useState('');
  const [saleScaleInput, setSaleScaleInput] = useState('');
  const [saleReleasedInput, setSaleReleasedInput] = useState('');
  const [saleStockInput, setSaleStockInput] = useState('');
  const [saleProvInput, setSaleProvInput] = useState('');
  const [saleWindowInput, setSaleWindowInput] = useState(true);

  const [clmPreparerInput, setClmPreparerInput] = useState('');
  const [clmQtyInput, setClmQtyInput] = useState('');
  const [clmReasonInput, setClmReasonInput] = useState('');
  const [clmAtInput, setClmAtInput] = useState('');

  // Tab 2: Inspection & Claim Approval
  const [inspActorInput, setInspActorInput] = useState('');
  const [inspOutcomeInput, setInspOutcomeInput] =
    useState<ClaimInspectionOutcome>('defective_confirmed');
  const [inspSupplierRmInput, setInspSupplierRmInput] = useState('');
  const [inspNotesInput, setInspNotesInput] = useState('');
  const [inspAtInput, setInspAtInput] = useState('');

  const [appActorInput, setAppActorInput] = useState('');
  const [appReasonInput, setAppReasonInput] = useState('');
  const [appAtInput, setAppAtInput] = useState('');

  // Tab 3: Signed Replacement Execution
  const [ackActorInput, setAckActorInput] = useState('');
  const [ackSigHashInput, setAckSigHashInput] = useState('');
  const [ackRecNameInput, setAckRecNameInput] = useState('');
  const [ackAtInput, setAckAtInput] = useState('');
  const [execActorInput, setExecActorInput] = useState('');
  const [execAtInput, setExecAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P18ActionResult<P18LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P18ActionResult<T>): P18ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeSale: CompletedSaleForClaim | undefined =
    snapshot.completed_sales.find((s) => s.sale_id === selectedSaleId) ??
    snapshot.completed_sales[0];

  const activeClaim: CustomerClaimAdjRecord | undefined =
    snapshot.claims.find((c) => c.claim_id === selectedClaimId) ?? snapshot.claims[0];

  function handleRegisterSale() {
    playClickPen(soundEnabled);
    if (saleScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the completed sale.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerOriginalSaleForClaim({
        sale_channel: saleChannelInput,
        so_reference: saleSoRefInput,
        or_reference: saleOrRefInput.trim() || null,
        signed_cdr_reference: saleCdrRefInput.trim() || null,
        variant_id: saleVariantInput,
        item_name: saleItemInput,
        quantity_scale: Number(saleScaleInput),
        actual_released_quantity_value: saleReleasedInput,
        eligible_replacement_stock_value: saleStockInput,
        original_lot_provenance: saleProvInput,
        within_return_window: saleWindowInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedSaleId(res.data.sale_id);
      setSaleSoRefInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleInitiateClaim() {
    playClickPen(soundEnabled);
    if (!activeSale) return;
    const res = refreshSnapshot(
      engine.initiateCustomerClaimAdj({
        sale_id: activeSale.sale_id,
        preparer_user_id: clmPreparerInput,
        claim_quantity_value: clmQtyInput,
        claim_reason: clmReasonInput,
        initiated_at: clmAtInput,
        idempotency_key: nextSequentialKey('p18-init'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedClaimId(res.data.claim_id);
      setClmReasonInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleInspectClaim() {
    playClickPen(soundEnabled);
    if (!activeClaim) return;
    const res = refreshSnapshot(
      engine.inspectReturnedClaimGoods({
        claim_id: activeClaim.claim_id,
        inspector_user_id: inspActorInput,
        inspection_outcome: inspOutcomeInput,
        linked_supplier_rm_ref: inspSupplierRmInput.trim() || null,
        inspection_notes: inspNotesInput,
        inspected_at: inspAtInput,
        expected_version: activeClaim.version,
        idempotency_key: nextSequentialKey('p18-inspect'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleDecideClaim(decision: 'approve' | 'decline') {
    playClickPen(soundEnabled);
    if (!activeClaim) return;
    const res = refreshSnapshot(
      engine.decideCustomerClaimApproval({
        claim_id: activeClaim.claim_id,
        approver_user_id: appActorInput,
        decision,
        decision_reason: appReasonInput,
        decided_at: appAtInput,
        expected_version: activeClaim.version,
        idempotency_key: nextSequentialKey(`p18-${decision}`),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleBindReplacementAck() {
    playClickPen(soundEnabled);
    if (!activeClaim) return;
    const res = refreshSnapshot(
      engine.bindReplacementAcknowledgment({
        claim_id: activeClaim.claim_id,
        actor_user_id: ackActorInput,
        signature_hash: ackSigHashInput,
        recipient_name: ackRecNameInput,
        acknowledged_at: ackAtInput,
        expected_version: activeClaim.version,
        idempotency_key: nextSequentialKey('p18-ack'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleExecuteReplacement() {
    playClickPen(soundEnabled);
    if (!activeClaim) return;
    const res = refreshSnapshot(
      engine.executeApprovedClaimReplacement({
        claim_id: activeClaim.claim_id,
        actor_user_id: execActorInput,
        executed_at: execAtInput,
        expected_version: activeClaim.version,
        idempotency_key: nextSequentialKey('p18-exec'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupClaimOperation({
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
      engine.lookupClaimOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleClaims = snapshot.claims.filter(
    (c) =>
      !normalizedSearch ||
      c.adj_reference.toLowerCase().includes(normalizedSearch) ||
      c.so_reference.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p18-workspace">
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
                id="p18-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer claims or original receipts"
                aria-label="Search customer claims"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Customer Claims, Inspected Returns &amp; Replacements</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Customer claim workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p18-tab-intake"
                  aria-selected={activeTab === 'intake'}
                  className={`p03-filter-pill ${activeTab === 'intake' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('intake');
                  }}
                >
                  Completed Sales &amp; Claim Intake
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p18-tab-inspect"
                  aria-selected={activeTab === 'inspect'}
                  className={`p03-filter-pill ${activeTab === 'inspect' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('inspect');
                  }}
                >
                  Inspection &amp; Claim Approval
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p18-tab-replace"
                  aria-selected={activeTab === 'replace'}
                  className={`p03-filter-pill ${activeTab === 'replace' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('replace');
                  }}
                >
                  Signed Replacement &amp; Quarantine
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p18-tab-history"
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
                id="p18-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p18-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p18-overview-heading" className="p03-section-title">
              Return Eligibility &amp; Defect Segregation — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Sales Registered: <strong>{snapshot.completed_sales.length}</strong>
              </span>
              <span className="p03-version-pill">
                Active Claims: <strong>{snapshot.claims.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Eligible Replacement Stock</span>
              <span className="p03-axis-val" data-testid="p18-eligible-stock-val">
                {snapshot.summary.eligible_replacement_stock}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Quarantined Defects</span>
              <span className="p03-axis-val" data-testid="p18-quarantined-defects-val">
                {snapshot.summary.quarantined_defects}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Resalable Returns Restored</span>
              <span className="p03-axis-val" data-testid="p18-resalable-restored-val">
                {snapshot.summary.resalable_restored}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Replacements Issued</span>
              <span className="p03-axis-val" data-testid="p18-replacements-issued-val">
                {snapshot.summary.total_replacements_issued}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p18-feedback-banner"
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

        {/* TAB 1: Completed Sales & Claim Intake */}
        {activeTab === 'intake' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p18-reg-sale-heading">
              <h2 id="p18-reg-sale-heading" className="p03-section-title">
                Register Completed Sale Evidence for Return Check
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-sale-channel" className="form-label">
                    Sale Channel Evidence Basis
                  </label>
                  <select
                    id="p18-sale-channel"
                    className="form-control"
                    value={saleChannelInput}
                    onChange={(e) => setSaleChannelInput(e.target.value as ClaimSaleChannel)}
                  >
                    <option value="track1_so_cdr">Track 1 (Requires OR + Signed DR)</option>
                    <option value="booth_or">Track 2 Booth Sale (Original OR Only)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p18-sale-so-ref" className="form-label">
                    Order / Event Reference
                  </label>
                  <input
                    id="p18-sale-so-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleSoRefInput}
                    placeholder="e.g. CEBU-SO-2026-000001"
                    onChange={(e) => setSaleSoRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-sale-or-ref" className="form-label">
                    Original Official Receipt
                  </label>
                  <input
                    id="p18-sale-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleOrRefInput}
                    placeholder="e.g. CEBU-OR-2026-000001"
                    onChange={(e) => setSaleOrRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-sale-cdr-ref" className="form-label">
                    Signed Customer DR (Track 1)
                  </label>
                  <input
                    id="p18-sale-cdr-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleCdrRefInput}
                    placeholder="Optional for Booth"
                    onChange={(e) => setSaleCdrRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-sale-variant" className="form-label">
                    Variant ID
                  </label>
                  <input
                    id="p18-sale-variant"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleVariantInput}
                    placeholder="e.g. 71"
                    onChange={(e) => setSaleVariantInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-sale-item" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p18-sale-item"
                    type="text"
                    className="form-control"
                    value={saleItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setSaleItemInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-sale-released" className="form-label">
                    Original Released Quantity
                  </label>
                  <input
                    id="p18-sale-released"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleReleasedInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setSaleReleasedInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-sale-stock" className="form-label">
                    Eligible Replacement Stock
                  </label>
                  <input
                    id="p18-sale-stock"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleStockInput}
                    placeholder="e.g. 5"
                    onChange={(e) => setSaleStockInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-sale-scale" className="form-label">
                    Precision Scale
                  </label>
                  <select
                    id="p18-sale-scale"
                    className="form-control"
                    value={saleScaleInput}
                    onChange={(e) => setSaleScaleInput(e.target.value)}
                  >
                    <option value="">Select scale...</option>
                    <option value="0">Scale 0 (Whole units)</option>
                    <option value="2">Scale 2 (0.01)</option>
                    <option value="3">Scale 3 (0.001)</option>
                    <option value="6">Scale 6 (0.000001)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p18-sale-prov" className="form-label">
                    Original Lot Provenance
                  </label>
                  <input
                    id="p18-sale-prov"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={saleProvInput}
                    placeholder="e.g. CEBU-RM-2026-000001"
                    onChange={(e) => setSaleProvInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p18-sale-window-checkbox"
                  type="checkbox"
                  checked={saleWindowInput}
                  onChange={(e) => setSaleWindowInput(e.target.checked)}
                />
                <label htmlFor="p18-sale-window-checkbox">
                  Within approved chapter return window
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-register-sale-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRegisterSale}
                >
                  Register Completed Sale
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p18-init-claim-heading">
              <h2 id="p18-init-claim-heading" className="p03-section-title">
                Initiate Return or Defect Claim Slip
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-clm-preparer" className="form-label">
                    Claim Preparer ID
                  </label>
                  <input
                    id="p18-clm-preparer"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={clmPreparerInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setClmPreparerInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-clm-qty" className="form-label">
                    Claimed Quantity
                  </label>
                  <input
                    id="p18-clm-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={clmQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setClmQtyInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-clm-reason" className="form-label">
                    Buyer Claim Reason
                  </label>
                  <input
                    id="p18-clm-reason"
                    type="text"
                    className="form-control"
                    value={clmReasonInput}
                    placeholder="e.g. Seam defect reported"
                    onChange={(e) => setClmReasonInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-clm-at" className="form-label">
                    Initiation Time (UTC)
                  </label>
                  <input
                    id="p18-clm-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={clmAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setClmAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-initiate-claim-btn"
                  className="btn-batcave-primary"
                  onClick={handleInitiateClaim}
                >
                  Initiate Claim ADJ
                </button>
              </div>

              {snapshot.completed_sales.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p18-empty-sales-notice">
                  No completed sales registered yet.
                </p>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Inspection & Claim Approval */}
        {activeTab === 'inspect' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p18-inspect-heading">
              <h2 id="p18-inspect-heading" className="p03-section-title">
                Inspect Returned Goods Prior to Approval
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-insp-actor" className="form-label">
                    Inventory Inspector ID
                  </label>
                  <input
                    id="p18-insp-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={inspActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setInspActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-insp-outcome" className="form-label">
                    Physical Inspection Finding
                  </label>
                  <select
                    id="p18-insp-outcome"
                    className="form-control"
                    value={inspOutcomeInput}
                    onChange={(e) =>
                      setInspOutcomeInput(e.target.value as ClaimInspectionOutcome)
                    }
                  >
                    <option value="defective_confirmed">Defective Confirmed (Quarantine)</option>
                    <option value="nondefective_resalable">Non-Defective Resalable Return</option>
                    <option value="nondefective_unsalable">Non-Defective Unsalable (Hold)</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-insp-rm-ref" className="form-label">
                    Supplier RM Link (Optional)
                  </label>
                  <input
                    id="p18-insp-rm-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={inspSupplierRmInput}
                    placeholder="e.g. CEBU-RM-2026-000001"
                    onChange={(e) => setInspSupplierRmInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-insp-at" className="form-label">
                    Inspection Time (UTC)
                  </label>
                  <input
                    id="p18-insp-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={inspAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setInspAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p18-insp-notes" className="form-label">
                  Inspection Notes
                </label>
                <input
                  id="p18-insp-notes"
                  type="text"
                  className="form-control"
                  value={inspNotesInput}
                  placeholder="Condition and damage details"
                  onChange={(e) => setInspNotesInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-record-inspection-btn"
                  className="btn-batcave-primary"
                  onClick={handleInspectClaim}
                >
                  Record Return Inspection
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p18-app-heading">
              <h2 id="p18-app-heading" className="p03-section-title">
                Configured Claim Approval (Single Independent Authority)
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-app-actor" className="form-label">
                    Independent Claim Approver ID
                  </label>
                  <input
                    id="p18-app-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={appActorInput}
                    placeholder="Approver ID (e.g. 202)"
                    onChange={(e) => setAppActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-app-at" className="form-label">
                    Decision Time (UTC)
                  </label>
                  <input
                    id="p18-app-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={appAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAppAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="p18-app-reason" className="form-label">
                  Decision Rationale
                </label>
                <input
                  id="p18-app-reason"
                  type="text"
                  className="form-control"
                  value={appReasonInput}
                  placeholder="Approval or decline note"
                  onChange={(e) => setAppReasonInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-approve-claim-btn"
                  className="btn-batcave-primary"
                  onClick={() => handleDecideClaim('approve')}
                >
                  Approve Claim
                </button>
                <button
                  type="button"
                  id="p18-decline-claim-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleDecideClaim('decline')}
                >
                  Decline Claim
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Signed Replacement & Quarantine */}
        {activeTab === 'replace' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p18-ack-heading">
              <h2 id="p18-ack-heading" className="p03-section-title">
                Bind Signed Replacement Acknowledgment
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-ack-actor" className="form-label">
                    Handover Officer ID
                  </label>
                  <input
                    id="p18-ack-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ackActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setAckActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-ack-rec-name" className="form-label">
                    Receiving Buyer Name
                  </label>
                  <input
                    id="p18-ack-rec-name"
                    type="text"
                    className="form-control"
                    value={ackRecNameInput}
                    placeholder="e.g. Maria Santos"
                    onChange={(e) => setAckRecNameInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-ack-hash" className="form-label">
                    Signed Evidence SHA-256
                  </label>
                  <input
                    id="p18-ack-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ackSigHashInput}
                    placeholder="64 lowercase hex chars"
                    onChange={(e) => setAckSigHashInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-ack-at" className="form-label">
                    Signature Time (UTC)
                  </label>
                  <input
                    id="p18-ack-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ackAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAckAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-bind-ack-btn"
                  className="btn-batcave-secondary"
                  onClick={handleBindReplacementAck}
                >
                  Bind Buyer Signature
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p18-exec-heading">
              <h2 id="p18-exec-heading" className="p03-section-title">
                Execute Approved Replacement &amp; Condition Treatment
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-exec-actor" className="form-label">
                    Executing Officer ID
                  </label>
                  <input
                    id="p18-exec-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={execActorInput}
                    placeholder="e.g. 301"
                    onChange={(e) => setExecActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-exec-at" className="form-label">
                    Execution Time (UTC)
                  </label>
                  <input
                    id="p18-exec-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={execAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setExecAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p18-execute-claim-btn"
                  className="btn-batcave-primary"
                  onClick={handleExecuteReplacement}
                >
                  Execute Signed Replacement
                </button>
              </div>

              {visibleClaims.length > 0 ? (
                <div className="p03-table-wrap" data-testid="p18-claims-table">
                  <table className="p03-table">
                    <thead>
                      <tr>
                        <th>Claim Ref</th>
                        <th>Qty</th>
                        <th>Inspection Outcome</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleClaims.map((c) => (
                        <tr key={c.claim_id}>
                          <td className="p03-mono-inline">{c.adj_reference}</td>
                          <td className="p03-mono-inline">{c.claim_quantity.value}</td>
                          <td>{c.inspection_outcome ?? 'Pending inspection'}</td>
                          <td>{c.status}</td>
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
            <section className="p03-card surface-card" aria-labelledby="p18-history-heading">
              <h2 id="p18-history-heading" className="p03-section-title">
                Customer Claims Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p18-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p18-lookup-heading">
              <h2 id="p18-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p18-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p18-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p18-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p18-lookup-ulid-input"
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
                  id="p18-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p18-lookup-by-ulid-btn"
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
                        data-testid={`p18-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p18-lookup-result" aria-live="polite">
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
