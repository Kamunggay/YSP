import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP10SupplierReceivingEngine } from './p10SupplierReceivingSlice';
import type {
  OpenPurchaseOrderForReceiving,
  P10ActionResult,
  P10EngineSnapshot,
  P10LookupResult,
  SupplierClaimRecord,
} from './p10SupplierReceivingSlice';

type P10TabId = 'open-pos' | 'receiving' | 'claims' | 'history';

type ClaimResolutionKind = 'replacement_received' | 'credit_note' | 'returned_to_supplier';

interface P10SupplierReceivingWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const PO_STATUS_LABELS: Record<OpenPurchaseOrderForReceiving['status'], string> = {
  open: 'Open',
  partial: 'Partially Received',
  completed: 'Completed',
};

const RESOLUTION_LABELS: Record<ClaimResolutionKind, string> = {
  replacement_received: 'Replacement Shipment Received',
  credit_note: 'Supplier Credit Note Applied',
  returned_to_supplier: 'Rejected Goods Returned to Supplier',
};

export function P10SupplierReceivingWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P10SupplierReceivingWorkspaceProps) {
  const engine = useMemo(() => createP10SupplierReceivingEngine(), []);
  const [snapshot, setSnapshot] = useState<P10EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P10TabId>('open-pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P10ActionResult | null>(snapshot.last_action);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState('');

  // Tab 1: Open PO Registration (strictly empty by default)
  const [poRefInput, setPoRefInput] = useState('');
  const [poSupplierInput, setPoSupplierInput] = useState('');
  const [poVariantInput, setPoVariantInput] = useState('');
  const [poItemInput, setPoItemInput] = useState('');
  const [poQtyInput, setPoQtyInput] = useState('');
  const [poScaleInput, setPoScaleInput] = useState('');

  // Tab 2: Delivery Inspection & Partial RM Split (strictly empty by default)
  const [rmInspectorInput, setRmInspectorInput] = useState('');
  const [rmHasDrInput, setRmHasDrInput] = useState(false);
  const [rmDrRefInput, setRmDrRefInput] = useState('');
  const [rmVariantInput, setRmVariantInput] = useState('');
  const [rmDeliveredInput, setRmDeliveredInput] = useState('');
  const [rmAcceptedInput, setRmAcceptedInput] = useState('');
  const [rmHeldInput, setRmHeldInput] = useState('');
  const [rmRejectedInput, setRmRejectedInput] = useState('');
  const [rmMissingInput, setRmMissingInput] = useState('');
  const [rmTimestampInput, setRmTimestampInput] = useState('');
  const [rmNotesInput, setRmNotesInput] = useState('');
  const [rmEvidenceHashInput, setRmEvidenceHashInput] = useState('');
  const [rmDiscrepancyHashInput, setRmDiscrepancyHashInput] = useState('');

  // Tab 3: Discrepancies & Held Custody
  const [claimActorInput, setClaimActorInput] = useState('');
  const [claimClearanceNotesInput, setClaimClearanceNotesInput] = useState('');
  const [claimResolutionInput, setClaimResolutionInput] = useState<'' | ClaimResolutionKind>('');
  const [claimResolutionNotesInput, setClaimResolutionNotesInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P10ActionResult<P10LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P10ActionResult<T>): P10ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activePo: OpenPurchaseOrderForReceiving | undefined =
    snapshot.open_pos.find((p) => p.po_id === selectedPoId) ?? snapshot.open_pos[0];

  const activeClaim: SupplierClaimRecord | undefined =
    snapshot.supplier_claims.find((c) => c.claim_id === selectedClaimId) ??
    snapshot.supplier_claims[0];

  function handleRegisterPo() {
    playClickPen(soundEnabled);
    if (poScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the Purchase Order.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerOpenPoForReceiving({
        po_reference: poRefInput,
        supplier_name: poSupplierInput,
        variant_id: poVariantInput,
        item_name: poItemInput.trim() || undefined,
        ordered_quantity_value: poQtyInput,
        quantity_scale: Number(poScaleInput),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedPoId(res.data.po_id);
      setPoRefInput('');
      setPoSupplierInput('');
      setPoVariantInput('');
      setPoItemInput('');
      setPoQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostRm() {
    playClickPen(soundEnabled);
    if (!activePo) {
      const msg = 'Register or select an open Purchase Order before posting a receipt.';
      setLastResult({ ok: false, http_status: 409, code: 'MISSING_RECEIVING_SOURCE', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.inspectAndPostSupplierRm({
        inspector_user_id: rmInspectorInput,
        po_id: activePo.po_id,
        has_valid_supplier_dr: rmHasDrInput,
        supplier_dr_reference: rmDrRefInput,
        delivered_variant_id: rmVariantInput,
        delivered_value: rmDeliveredInput,
        accepted_value: rmAcceptedInput,
        held_value: rmHeldInput,
        rejected_value: rmRejectedInput,
        missing_value: rmMissingInput,
        inspection_at: rmTimestampInput,
        condition_notes: rmNotesInput,
        inspection_evidence_hash: rmEvidenceHashInput,
        discrepancy_evidence_hash: rmDiscrepancyHashInput.trim() || undefined,
        expected_po_version: activePo.version,
        idempotency_key: nextSequentialKey('p10-rm'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      const nextSnap = engine.getSnapshot();
      const newestClaim = nextSnap.supplier_claims[nextSnap.supplier_claims.length - 1];
      if (newestClaim) {
        setSelectedClaimId(newestClaim.claim_id);
      }
      setRmDeliveredInput('');
      setRmAcceptedInput('');
      setRmHeldInput('');
      setRmRejectedInput('');
      setRmMissingInput('');
      setRmNotesInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAcceptHeld() {
    playClickPen(soundEnabled);
    if (!activeClaim) {
      const msg = 'Select a discrepancy claim with held items first.';
      setLastResult({ ok: false, http_status: 404, code: 'CLAIM_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.acceptPreviouslyHeldCustody({
        actor_user_id: claimActorInput,
        claim_id: activeClaim.claim_id,
        clearance_notes: claimClearanceNotesInput,
        expected_claim_version: activeClaim.version,
        idempotency_key: nextSequentialKey('p10-accept-held'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setClaimClearanceNotesInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleResolveClaim() {
    playClickPen(soundEnabled);
    if (!activeClaim) {
      const msg = 'Select an open discrepancy claim to close first.';
      setLastResult({ ok: false, http_status: 404, code: 'CLAIM_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    if (claimResolutionInput === '') {
      const msg = 'Select how the supplier discrepancy was resolved.';
      setLastResult({ ok: false, http_status: 422, code: 'CLAIM_RESOLUTION_REQUIRED', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.resolveSupplierClaim({
        actor_user_id: claimActorInput,
        claim_id: activeClaim.claim_id,
        resolution_kind: claimResolutionInput,
        resolution_notes: claimResolutionNotesInput,
        expected_claim_version: activeClaim.version,
        idempotency_key: nextSequentialKey('p10-resolve-claim'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setClaimResolutionNotesInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupReceivingOperation({
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
      engine.lookupReceivingOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visiblePos = snapshot.open_pos.filter(
    (po) =>
      !normalizedSearch ||
      po.po_reference.toLowerCase().includes(normalizedSearch) ||
      po.supplier_name.toLowerCase().includes(normalizedSearch) ||
      (po.item_name ?? '').toLowerCase().includes(normalizedSearch)
  );
  const visibleReceipts = snapshot.receipts.filter(
    (rm) =>
      !normalizedSearch ||
      rm.rm_reference.toLowerCase().includes(normalizedSearch) ||
      rm.po_reference.toLowerCase().includes(normalizedSearch) ||
      rm.supplier_dr_reference.toLowerCase().includes(normalizedSearch)
  );
  const visibleClaims = snapshot.supplier_claims.filter(
    (c) =>
      !normalizedSearch ||
      c.rm_reference.toLowerCase().includes(normalizedSearch) ||
      c.po_reference.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p10-workspace">
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
                id="p10-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Purchase Orders, RM receipts, suppliers, or discrepancy claims"
                aria-label="Search supplier receiving records"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Supplier Delivery, Partial Receiving &amp; Discrepancies
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Supplier receiving workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p10-tab-open-pos"
                  aria-selected={activeTab === 'open-pos'}
                  className={`p03-filter-pill ${activeTab === 'open-pos' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('open-pos');
                  }}
                >
                  Open Purchase Orders &amp; Sources
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p10-tab-receiving"
                  aria-selected={activeTab === 'receiving'}
                  className={`p03-filter-pill ${activeTab === 'receiving' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('receiving');
                  }}
                >
                  Delivery Inspection &amp; Split
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p10-tab-claims"
                  aria-selected={activeTab === 'claims'}
                  className={`p03-filter-pill ${activeTab === 'claims' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('claims');
                  }}
                >
                  Discrepancies &amp; Held Custody
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p10-tab-history"
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
                id="p10-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p10-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p10-overview-heading" className="p03-section-title">
              Receiving &amp; Custody Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Open POs: <strong>{snapshot.open_pos.length}</strong>
              </span>
              <span className="p03-version-pill">
                RM Receipts: <strong>{snapshot.receipts.length}</strong>
              </span>
              <span className="p03-version-pill">
                Open Claims: <strong>{snapshot.summary.open_claims_count}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p10-usable-on-hand-val">
                {snapshot.summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Held Quarantined</span>
              <span className="p03-axis-val" data-testid="p10-held-val">
                {snapshot.summary.held_quarantined}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Rejected Non-Usable</span>
              <span className="p03-axis-val" data-testid="p10-rejected-val">
                {snapshot.summary.rejected_nonusable}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">PO Outstanding Balance</span>
              <span className="p03-axis-val" data-testid="p10-po-outstanding-val">
                {snapshot.summary.open_po_outstanding}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p10-feedback-banner"
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

        {/* TAB 1: Open Purchase Orders & Sources */}
        {activeTab === 'open-pos' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-register-po-heading">
                <h2 id="p10-register-po-heading" className="p03-section-title">
                  Register Approved Purchase Order for Receiving
                </h2>
                <p className="p03-muted-copy">
                  Incoming supplier shipments require an open Purchase Order and verified supplier
                  delivery documentation before accepted units enter usable stock.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-po-ref-input" className="form-label">
                      Purchase Order Reference
                    </label>
                    <input
                      id="p10-po-ref-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poRefInput}
                      placeholder="e.g. CEBU-PO-2026-000001"
                      onChange={(e) => setPoRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-po-supplier-input" className="form-label">
                      Supplier Name
                    </label>
                    <input
                      id="p10-po-supplier-input"
                      type="text"
                      className="form-control"
                      value={poSupplierInput}
                      placeholder="e.g. Visayas Medical Supply Co."
                      onChange={(e) => setPoSupplierInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-po-variant-input" className="form-label">
                      Ordered Variant ID
                    </label>
                    <input
                      id="p10-po-variant-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setPoVariantInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-po-item-input" className="form-label">
                      Item Description (Optional)
                    </label>
                    <input
                      id="p10-po-item-input"
                      type="text"
                      className="form-control"
                      value={poItemInput}
                      placeholder="e.g. Emergency Hygiene Kits"
                      onChange={(e) => setPoItemInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-po-qty-input" className="form-label">
                      Ordered Quantity
                    </label>
                    <input
                      id="p10-po-qty-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poQtyInput}
                      placeholder="e.g. 100"
                      onChange={(e) => setPoQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-po-scale-select" className="form-label">
                      Decimal Precision Scale
                    </label>
                    <select
                      id="p10-po-scale-select"
                      className="form-control"
                      value={poScaleInput}
                      onChange={(e) => setPoScaleInput(e.target.value)}
                    >
                      <option value="">Scale (0–6)</option>
                      <option value="0">0 — Whole units</option>
                      <option value="1">1 — Tenths (0.1)</option>
                      <option value="2">2 — Hundredths (0.01)</option>
                      <option value="3">3 — Thousandths (0.001)</option>
                      <option value="6">6 — Six decimals</option>
                    </select>
                  </div>
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p10-register-po-btn"
                    className="btn-batcave-primary"
                    onClick={handleRegisterPo}
                  >
                    Register Open PO
                  </button>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-open-pos-list-heading">
                <h2 id="p10-open-pos-list-heading" className="p03-section-title">
                  Open Purchase Orders &amp; Active Target
                </h2>
                <div className="form-group">
                  <label htmlFor="p10-active-po-select" className="form-label">
                    Active Purchase Order for Inspection
                  </label>
                  <select
                    id="p10-active-po-select"
                    className="form-control"
                    value={activePo?.po_id ?? ''}
                    onChange={(e) => setSelectedPoId(e.target.value)}
                  >
                    <option value="">Select Open Purchase Order</option>
                    {snapshot.open_pos.map((po) => (
                      <option key={po.po_id} value={po.po_id}>
                        {po.po_reference} — {po.supplier_name} ({po.outstanding_quantity}{' '}
                        outstanding, v{po.version})
                      </option>
                    ))}
                  </select>
                </div>

                {visiblePos.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p10-empty-pos-notice">
                    No open Purchase Orders registered yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p10-open-pos-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Supplier</th>
                          <th>Variant</th>
                          <th>Ordered</th>
                          <th>Accepted</th>
                          <th>Outstanding</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visiblePos.map((po) => (
                          <tr key={po.po_id}>
                            <td className="p03-mono-inline">{po.po_reference}</td>
                            <td>{po.supplier_name}</td>
                            <td className="p03-mono-inline">{po.variant_id}</td>
                            <td className="p03-mono-inline">{po.ordered_quantity}</td>
                            <td className="p03-mono-inline">{po.accepted_quantity}</td>
                            <td className="p03-mono-inline">{po.outstanding_quantity}</td>
                            <td>{PO_STATUS_LABELS[po.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Delivery Inspection & Split */}
        {activeTab === 'receiving' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-inspect-rm-heading">
                <h2 id="p10-inspect-rm-heading" className="p03-section-title">
                  Inspect Delivery &amp; Post Receiving Memo
                </h2>
                <p className="p03-muted-copy">
                  Accepted counts increase usable stock and reduce open Purchase Order balance; held,
                  rejected, and missing counts route to open supplier discrepancy claims.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-receiving-po-select" className="form-label">
                      Source Purchase Order
                    </label>
                    <select
                      id="p10-receiving-po-select"
                      className="form-control"
                      value={activePo?.po_id ?? ''}
                      onChange={(e) => setSelectedPoId(e.target.value)}
                    >
                      <option value="">Select Purchase Order</option>
                      {snapshot.open_pos.map((po) => (
                        <option key={po.po_id} value={po.po_id}>
                          {po.po_reference} ({po.outstanding_quantity} outstanding, v{po.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-rm-inspector-input" className="form-label">
                      Receiving Inspector ID
                    </label>
                    <input
                      id="p10-rm-inspector-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmInspectorInput}
                      placeholder="e.g. 401"
                      onChange={(e) => setRmInspectorInput(e.target.value)}
                    />
                  </div>
                </div>

                <label
                  className={`p03-checkbox-row ${rmHasDrInput ? 'is-checked' : ''}`}
                  htmlFor="p10-rm-has-dr-checkbox"
                >
                  <input
                    id="p10-rm-has-dr-checkbox"
                    type="checkbox"
                    className="p03-sr-checkbox"
                    checked={rmHasDrInput}
                    onChange={(e) => {
                      playClickPen(soundEnabled);
                      setRmHasDrInput(e.target.checked);
                    }}
                  />
                  <span className="p03-checkbox-main">
                    <span className="p03-check-indicator" aria-hidden="true">
                      {rmHasDrInput ? (
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>Valid supplier delivery receipt (DR / Invoice) verified</span>
                  </span>
                </label>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-rm-dr-ref-input" className="form-label">
                      Supplier DR / Invoice Number
                    </label>
                    <input
                      id="p10-rm-dr-ref-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmDrRefInput}
                      placeholder="e.g. DR-2026-8841"
                      onChange={(e) => setRmDrRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-rm-variant-input" className="form-label">
                      Delivered Variant ID
                    </label>
                    <input
                      id="p10-rm-variant-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmVariantInput}
                      placeholder="Must match ordered variant"
                      onChange={(e) => setRmVariantInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-rm-delivered-input" className="form-label">
                      Delivered Physically
                    </label>
                    <input
                      id="p10-rm-delivered-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmDeliveredInput}
                      placeholder="Accepted + Held + Rejected"
                      onChange={(e) => setRmDeliveredInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-rm-accepted-input" className="form-label">
                      Accepted into Usable Stock
                    </label>
                    <input
                      id="p10-rm-accepted-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmAcceptedInput}
                      placeholder="e.g. 40"
                      onChange={(e) => setRmAcceptedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-rm-held-input" className="form-label">
                      Held in Quarantine Custody
                    </label>
                    <input
                      id="p10-rm-held-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmHeldInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setRmHeldInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-rm-rejected-input" className="form-label">
                      Rejected (Damaged / Defective)
                    </label>
                    <input
                      id="p10-rm-rejected-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmRejectedInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setRmRejectedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-rm-missing-input" className="form-label">
                      Missing / Short-Shipped on DR
                    </label>
                    <input
                      id="p10-rm-missing-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmMissingInput}
                      placeholder="e.g. 40"
                      onChange={(e) => setRmMissingInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-rm-timestamp-input" className="form-label">
                      Inspection Timestamp (UTC)
                    </label>
                    <input
                      id="p10-rm-timestamp-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmTimestampInput}
                      placeholder="e.g. 2026-11-22T12:30:00Z"
                      onChange={(e) => setRmTimestampInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p10-rm-notes-input" className="form-label">
                    Physical Condition Notes
                  </label>
                  <input
                    id="p10-rm-notes-input"
                    type="text"
                    className="form-control"
                    value={rmNotesInput}
                    placeholder="Record seal numbers, packaging state, or damage details"
                    onChange={(e) => setRmNotesInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p10-rm-evidence-hash-input" className="form-label">
                    Inspection Photo Evidence Hash (SHA-256)
                  </label>
                  <input
                    id="p10-rm-evidence-hash-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmEvidenceHashInput}
                    placeholder="64 lowercase hex characters"
                    onChange={(e) => setRmEvidenceHashInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p10-rm-discrepancy-hash-input" className="form-label">
                    Discrepancy Evidence Hash (Required if Held / Rejected / Missing)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p10-rm-discrepancy-hash-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmDiscrepancyHashInput}
                      placeholder="64 lowercase hex characters when variance > 0"
                      onChange={(e) => setRmDiscrepancyHashInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p10-post-rm-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handlePostRm}
                    >
                      Post Receiving Memo
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-receipts-heading">
                <h2 id="p10-receipts-heading" className="p03-section-title">
                  Posted Receiving Memos
                </h2>
                {visibleReceipts.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p10-empty-receipts-notice">
                    No supplier receiving memos posted yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p10-receipts-table">
                      <thead>
                        <tr>
                          <th>RM Reference</th>
                          <th>PO / DR</th>
                          <th>Accepted</th>
                          <th>Held</th>
                          <th>Rejected</th>
                          <th>Missing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleReceipts.map((rm) => (
                          <tr key={rm.rm_id}>
                            <td className="p03-mono-inline">{rm.rm_reference}</td>
                            <td className="p03-mono-inline">
                              {rm.po_reference} / {rm.supplier_dr_reference}
                            </td>
                            <td className="p03-mono-inline">{rm.accepted_quantity}</td>
                            <td className="p03-mono-inline">{rm.held_quantity}</td>
                            <td className="p03-mono-inline">{rm.rejected_quantity}</td>
                            <td className="p03-mono-inline">{rm.missing_quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Discrepancies & Held Custody */}
        {activeTab === 'claims' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-claims-action-heading">
                <h2 id="p10-claims-action-heading" className="p03-section-title">
                  Held Custody Clearance &amp; Claim Resolution
                </h2>
                <p className="p03-muted-copy">
                  Held items transfer into usable stock once cleared without duplicating transfers;
                  rejected or short-shipped items remain tracked until formal claim resolution.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-claim-select" className="form-label">
                      Discrepancy Claim
                    </label>
                    <select
                      id="p10-claim-select"
                      className="form-control"
                      value={activeClaim?.claim_id ?? ''}
                      onChange={(e) => setSelectedClaimId(e.target.value)}
                    >
                      <option value="">Select Discrepancy Claim</option>
                      {snapshot.supplier_claims.map((c) => (
                        <option key={c.claim_id} value={c.claim_id}>
                          {c.rm_reference} — Held: {c.held_remaining} / Rejected:{' '}
                          {c.rejected_quantity} ({c.status}, v{c.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-claim-actor-input" className="form-label">
                      Handling Officer ID
                    </label>
                    <input
                      id="p10-claim-actor-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={claimActorInput}
                      placeholder="e.g. 402"
                      onChange={(e) => setClaimActorInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p10-claim-clearance-notes-input" className="form-label">
                    Held Custody Quality Clearance Notes
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p10-claim-clearance-notes-input"
                      type="text"
                      className="form-control"
                      value={claimClearanceNotesInput}
                      placeholder="Record quality clearance to release held stock"
                      onChange={(e) => setClaimClearanceNotesInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p10-accept-held-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleAcceptHeld}
                    >
                      Accept Held Custody to Usable
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p10-claim-resolution-select" className="form-label">
                    Supplier Claim Resolution Type
                  </label>
                  <select
                    id="p10-claim-resolution-select"
                    className="form-control"
                    value={claimResolutionInput}
                    onChange={(e) =>
                      setClaimResolutionInput(e.target.value as '' | ClaimResolutionKind)
                    }
                  >
                    <option value="">Select resolution outcome</option>
                    <option value="replacement_received">Replacement Shipment Received</option>
                    <option value="credit_note">Supplier Credit Note Applied</option>
                    <option value="returned_to_supplier">Rejected Goods Returned to Supplier</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="p10-claim-resolution-notes-input" className="form-label">
                    Claim Resolution Notes
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p10-claim-resolution-notes-input"
                      type="text"
                      className="form-control"
                      value={claimResolutionNotesInput}
                      placeholder="Record supplier settlement or return receipt details"
                      onChange={(e) => setClaimResolutionNotesInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p10-resolve-claim-btn"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={handleResolveClaim}
                    >
                      Resolve Discrepancy Claim
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-claims-queue-heading">
                <h2 id="p10-claims-queue-heading" className="p03-section-title">
                  Supplier Discrepancy Claims
                </h2>
                {visibleClaims.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p10-empty-claims-notice">
                    No discrepancy claims recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p10-claims-list">
                    {visibleClaims.map((c) => (
                      <article key={c.claim_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">{c.rm_reference}</span>
                          <span className="p03-version-pill">
                            {c.status === 'resolved' && c.resolution_kind
                              ? `Resolved — ${RESOLUTION_LABELS[c.resolution_kind]}`
                              : `Open (v${c.version})`}
                          </span>
                        </div>
                        <p className="p03-muted-copy">
                          PO {c.po_reference} &middot; Held Remaining: {c.held_remaining} (Initial:{' '}
                          {c.held_initial}) &middot; Rejected: {c.rejected_quantity} &middot;
                          Missing: {c.missing_quantity}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-history-heading">
                <h2 id="p10-history-heading" className="p03-section-title">
                  Receiving &amp; Custody Event Log
                </h2>
                {snapshot.history.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p10-empty-history-notice">
                    No receiving events recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p10-history-list">
                    {snapshot.history.map((h) => (
                      <article key={h.event_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            {h.rm_id ? `RM #${h.rm_id}` : `PO #${h.po_id}`}
                          </span>
                          <strong>{h.action}</strong>
                        </div>
                        <p className="p03-muted-copy">
                          Officer #{h.actor_user_id} &middot; {h.notes}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p10-lookup-heading">
                <h2 id="p10-lookup-heading" className="p03-section-title">
                  Operation Status Recovery
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p10-lookup-key-input" className="form-label">
                      Idempotency Key
                    </label>
                    <input
                      id="p10-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p10-lookup-ulid-input" className="form-label">
                      Operation ULID
                    </label>
                    <input
                      id="p10-lookup-ulid-input"
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
                    id="p10-lookup-key-btn"
                    className="btn-batcave-primary"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                  <button
                    type="button"
                    id="p10-lookup-ulid-btn"
                    className="btn-batcave-secondary"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Operation ID
                  </button>
                </div>
                {lookupResult ? (
                  <div
                    className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                    data-testid="p10-lookup-result"
                  >
                    <span className="p03-blocker-code">{lookupResult.code}</span>
                    <p className="p03-blocker-msg">{lookupResult.message}</p>
                  </div>
                ) : null}
                <div className="p03-ledger-chips" data-testid="p10-operation-ledger">
                  <span className="p03-eyebrow">Committed Receiving Operations</span>
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((e) => (
                      <button
                        key={e.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p10-ledger-fill-${e.operation_id}`}
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
