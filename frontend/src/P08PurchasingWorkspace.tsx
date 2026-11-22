import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP08PurchasingEngine } from './p08PurchasingSlice';
import type {
  P08ActionResult,
  P08EngineSnapshot,
  P08LookupResult,
  RepfRecord,
  RepfStatus,
  RepfTriggerKind,
} from './p08PurchasingSlice';

type P08TabId = 'need' | 'intake' | 'budget' | 'history';

interface P08PurchasingWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const REPF_STATUS_LABELS: Record<RepfStatus, string> = {
  draft: 'Draft',
  submitted: 'Pending Budget Review',
  returned: 'Returned for Revision',
  held: 'Budget Hold',
  approved: 'Budget Approved',
  canceled: 'Canceled / Denied',
};

const TRIGGER_LABELS: Record<RepfTriggerKind, string> = {
  rf_shortage: 'Approved Requisition Shortage',
  rop_replenishment: 'Low-Stock ROP Replenishment',
  funded_so_shortage: 'Funded Sales Backorder',
  unpaid_so: 'Unpaid Sales Order Shortage',
};

export function P08PurchasingWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P08PurchasingWorkspaceProps) {
  const engine = useMemo(() => createP08PurchasingEngine(), []);
  const [snapshot, setSnapshot] = useState<P08EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P08TabId>('need');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P08ActionResult | null>(snapshot.last_action);
  const [selectedRepfId, setSelectedRepfId] = useState('');

  // Tab 1: Net-Need & ROP Profile inputs (strictly empty by default)
  const [profVariantIdInput, setProfVariantIdInput] = useState('');
  const [profItemNameInput, setProfItemNameInput] = useState('');
  const [profScaleInput, setProfScaleInput] = useState('');
  const [profUsableInput, setProfUsableInput] = useState('');
  const [profReservedInput, setProfReservedInput] = useState('');
  const [profDemandInput, setProfDemandInput] = useState('');
  const [profInboundInput, setProfInboundInput] = useState('');
  const [profRopInput, setProfRopInput] = useState('');
  const [profTargetInput, setProfTargetInput] = useState('');

  // Tab 2: RepF Creation (strictly empty by default)
  const [repfRequesterInput, setRepfRequesterInput] = useState('');
  const [repfVariantInput, setRepfVariantInput] = useState('');
  const [repfSourceKindInput, setRepfSourceKindInput] = useState<'' | RepfTriggerKind>('');
  const [repfLinkedRfInput, setRepfLinkedRfInput] = useState('');
  const [repfQtyInput, setRepfQtyInput] = useState('');
  const [repfScaleInput, setRepfScaleInput] = useState('');
  const [repfEstimateInput, setRepfEstimateInput] = useState('');
  const [repfPriorityInput, setRepfPriorityInput] = useState<'normal' | 'urgent'>('normal');
  const [repfEmergencyInput, setRepfEmergencyInput] = useState(false);
  const [repfEmergencyReasonInput, setRepfEmergencyReasonInput] = useState('');
  const [repfJustificationInput, setRepfJustificationInput] = useState('');

  // Tab 3: Budget Decision & Revision (strictly empty by default)
  const [budgetReviewerInput, setBudgetReviewerInput] = useState('');
  const [budgetApprovedAmtInput, setBudgetApprovedAmtInput] = useState('');
  const [budgetReasonInput, setBudgetReasonInput] = useState('');
  const [reviseQtyInput, setReviseQtyInput] = useState('');
  const [reviseEstInput, setReviseEstInput] = useState('');
  const [reviseReasonInput, setReviseReasonInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P08ActionResult<P08LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P08ActionResult<T>): P08ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const selectedRepf: RepfRecord | undefined =
    snapshot.repfs.find((r) => r.repf_id === selectedRepfId) ?? snapshot.repfs[0];

  function handleSaveProfile() {
    playClickPen(soundEnabled);
    if (profScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the supply profile.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.configureVariantSupplyProfile({
        variant_id: profVariantIdInput,
        item_name: profItemNameInput.trim() || undefined,
        quantity_scale: Number(profScaleInput),
        usable_on_hand_value: profUsableInput,
        active_rf_reserved_value: profReservedInput,
        approved_rf_demand_value: profDemandInput,
        existing_po_inbound_value: profInboundInput,
        rop_threshold_value: profRopInput,
        target_stock_level_value: profTargetInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setRepfVariantInput(res.data.variant_id);
      setRepfScaleInput(String(res.data.quantity_scale));
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCreateRepf() {
    playClickPen(soundEnabled);
    if (repfSourceKindInput === '' || repfScaleInput === '') {
      const msg =
        repfSourceKindInput === ''
          ? 'Select a trigger source before saving a purchase request.'
          : 'Select a unit precision scale (0–6) for the requested quantity.';
      setLastResult({ ok: false, http_status: 422, code: 'REPF_FIELDS_REQUIRED', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.createRepfDraft({
        requester_user_id: repfRequesterInput,
        variant_id: repfVariantInput,
        source_kind: repfSourceKindInput,
        linked_rf_reference: repfLinkedRfInput.trim() || null,
        requested_quantity_value: repfQtyInput,
        quantity_scale: Number(repfScaleInput),
        estimated_amount: repfEstimateInput,
        priority: repfPriorityInput,
        is_emergency: repfEmergencyInput,
        emergency_reason: repfEmergencyReasonInput.trim() || null,
        justification: repfJustificationInput,
        idempotency_key: nextSequentialKey('p08-repf-create'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedRepfId(res.data.repf_id);
      setRepfQtyInput('');
      setRepfEstimateInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSubmitRepf(repf: RepfRecord) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.submitRepfForBudget({
        repf_id: repf.repf_id,
        actor_user_id: repf.requester_user_id,
        expected_version: repf.version,
        expected_material_version: repf.material_version,
        idempotency_key: nextSequentialKey('p08-repf-submit'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setSelectedRepfId(repf.repf_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleBudgetDecision(decision: 'approve' | 'hold' | 'return' | 'reject_cancel') {
    playClickPen(soundEnabled);
    if (!selectedRepf) {
      const msg = 'Create and submit a purchase request first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.decideRepfBudget({
        repf_id: selectedRepf.repf_id,
        reviewer_user_id: budgetReviewerInput,
        decision,
        reason: budgetReasonInput,
        approved_budget_amount: budgetApprovedAmtInput.trim() || undefined,
        expected_version: selectedRepf.version,
        expected_material_version: selectedRepf.material_version,
        idempotency_key: nextSequentialKey(`p08-budget-${decision}`),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReviseRepf() {
    playClickPen(soundEnabled);
    if (!selectedRepf) return;
    const res = refreshSnapshot(
      engine.reviseRepf({
        repf_id: selectedRepf.repf_id,
        actor_user_id: selectedRepf.requester_user_id,
        requested_quantity_value: reviseQtyInput.trim() || selectedRepf.requested_quantity.value,
        estimated_amount: reviseEstInput.trim() || selectedRepf.estimated_amount,
        justification: selectedRepf.justification,
        reason: reviseReasonInput,
        expected_version: selectedRepf.version,
        expected_material_version: selectedRepf.material_version,
        idempotency_key: nextSequentialKey('p08-repf-revise'),
      })
    );
    if (res.ok) setReviseReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupPurchasingOperation({
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
      engine.lookupPurchasingOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredRepfs = normalizedSearch
    ? snapshot.repfs.filter(
        (r) =>
          (r.reference ?? '').toLowerCase().includes(normalizedSearch) ||
          r.variant_id.toLowerCase().includes(normalizedSearch) ||
          r.justification.toLowerCase().includes(normalizedSearch)
      )
    : snapshot.repfs;

  return (
    <main className="p03-workspace-shell" data-testid="p08-workspace">
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
                id="p08-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search purchase request reference, variant, or justification"
                aria-label="Search purchase requests"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Purchase Requests &amp; Budget Review</h1>
            </div>

            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Purchase request stages">
                <button
                  type="button"
                  role="tab"
                  id="p08-tab-need"
                  aria-selected={activeTab === 'need'}
                  className={`p03-filter-pill ${activeTab === 'need' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('need');
                  }}
                >
                  Supply Need &amp; Alerts
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p08-tab-intake"
                  aria-selected={activeTab === 'intake'}
                  className={`p03-filter-pill ${activeTab === 'intake' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('intake');
                  }}
                >
                  Purchase Request Intake
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p08-tab-budget"
                  aria-selected={activeTab === 'budget'}
                  className={`p03-filter-pill ${activeTab === 'budget' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('budget');
                  }}
                >
                  Budget Review &amp; Decisions
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p08-tab-history"
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
                id="p08-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p08-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p08-overview-heading" className="p03-section-title">
              Net Replenishment Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Requests: <strong>{snapshot.repfs.length}</strong>
              </span>
              <span className="p03-version-pill">
                Budget Approved: <strong>{snapshot.summary.approved_repfs}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Gross Uncovered Need</span>
              <span className="p03-axis-val" data-testid="p08-gross-uncovered-val">
                {snapshot.summary.total_gross_uncovered}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Claimed by Requests</span>
              <span className="p03-axis-val" data-testid="p08-claimed-val">
                {snapshot.summary.active_repf_claimed}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Remaining Net Need</span>
              <span className="p03-axis-val" data-testid="p08-remaining-uncovered-val">
                {snapshot.summary.remaining_uncovered}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Low-Stock Alerts</span>
              <span className="p03-axis-val" data-testid="p08-low-stock-count-val">
                {snapshot.summary.low_stock_alerts}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p08-feedback-banner"
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

        {/* TAB 1: Supply Need & Low-Stock Alerts */}
        {activeTab === 'need' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-profile-heading">
                <h2 id="p08-profile-heading" className="p03-section-title">
                  Configure Variant Net-Need &amp; ROP Inputs
                </h2>
                <p className="p03-muted-copy">
                  Computes deduplicated uncovered demand after accounting for usable stock, active
                  inbound PO supply, and existing active purchase requests.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-prof-variant-id" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p08-prof-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profVariantIdInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setProfVariantIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-prof-item-name" className="form-label">
                      Item Name (Optional)
                    </label>
                    <input
                      id="p08-prof-item-name"
                      type="text"
                      className="form-control"
                      value={profItemNameInput}
                      placeholder="e.g. Four-Person Field Tent"
                      onChange={(e) => setProfItemNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-prof-usable" className="form-label">
                      Usable Stockroom On-Hand
                    </label>
                    <input
                      id="p08-prof-usable"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profUsableInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setProfUsableInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-prof-reserved" className="form-label">
                      Active Requisition Reserved
                    </label>
                    <input
                      id="p08-prof-reserved"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profReservedInput}
                      placeholder="e.g. 4"
                      onChange={(e) => setProfReservedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-prof-demand" className="form-label">
                      Approved Demand Total
                    </label>
                    <input
                      id="p08-prof-demand"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profDemandInput}
                      placeholder="e.g. 15"
                      onChange={(e) => setProfDemandInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-prof-inbound" className="form-label">
                      Confirmed Inbound PO Supply
                    </label>
                    <input
                      id="p08-prof-inbound"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profInboundInput}
                      placeholder="e.g. 20"
                      onChange={(e) => setProfInboundInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-prof-rop" className="form-label">
                      Reorder Point (ROP) Threshold
                    </label>
                    <input
                      id="p08-prof-rop"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profRopInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setProfRopInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-prof-target" className="form-label">
                      Approved Target Stock Level
                    </label>
                    <input
                      id="p08-prof-target"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={profTargetInput}
                      placeholder="e.g. 40"
                      onChange={(e) => setProfTargetInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p08-prof-scale" className="form-label">
                    Unit Decimal Precision Scale
                  </label>
                  <div className="p03-input-action-row">
                    <select
                      id="p08-prof-scale"
                      className="form-control"
                      value={profScaleInput}
                      onChange={(e) => setProfScaleInput(e.target.value)}
                    >
                      <option value="">Select precision scale (0–6)</option>
                      <option value="0">0 — Whole units</option>
                      <option value="1">1 — Tenths (0.1)</option>
                      <option value="2">2 — Hundredths (0.01)</option>
                      <option value="3">3 — Thousandths (0.001)</option>
                      <option value="4">4 — Four decimals</option>
                      <option value="5">5 — Five decimals</option>
                      <option value="6">6 — Six decimals</option>
                    </select>
                    <button
                      type="button"
                      id="p08-save-profile-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleSaveProfile}
                    >
                      Calculate Net Need
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-profiles-list-heading">
                <h2 id="p08-profiles-list-heading" className="p03-section-title">
                  Computed Replenishment &amp; Alert Queue
                </h2>
                {snapshot.profiles.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p08-empty-profiles-notice">
                    No item supply profiles configured yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p08-profiles-table">
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th>On-Hand</th>
                          <th>Inbound</th>
                          <th>Target</th>
                          <th>Claimed</th>
                          <th>Uncovered Need</th>
                          <th>Alert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.profiles.map((p) => (
                          <tr key={p.profile_id}>
                            <td>
                              {p.item_name ?? `Variant #${p.variant_id}`}
                            </td>
                            <td className="p03-mono-inline">{p.usable_on_hand}</td>
                            <td className="p03-mono-inline">{p.existing_po_inbound}</td>
                            <td className="p03-mono-inline">{p.target_stock_level}</td>
                            <td className="p03-mono-inline">{p.active_repf_claimed}</td>
                            <td className="p03-mono-inline">{p.uncovered_net_need}</td>
                            <td>{p.low_stock_alert ? 'Low Stock' : 'Normal'}</td>
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

        {/* TAB 2: Purchase Request Intake */}
        {activeTab === 'intake' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-intake-heading">
                <h2 id="p08-intake-heading" className="p03-section-title">
                  Initiate Purchase Request
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-repf-requester-id" className="form-label">
                      Preparer Member ID
                    </label>
                    <input
                      id="p08-repf-requester-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repfRequesterInput}
                      placeholder="e.g. 101"
                      onChange={(e) => setRepfRequesterInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-repf-variant-id" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p08-repf-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repfVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setRepfVariantInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-repf-source-kind" className="form-label">
                      Demand Trigger Source
                    </label>
                    <select
                      id="p08-repf-source-kind"
                      className="form-control"
                      value={repfSourceKindInput}
                      onChange={(e) =>
                        setRepfSourceKindInput(e.target.value as '' | RepfTriggerKind)
                      }
                    >
                      <option value="">Select trigger source</option>
                      <option value="rf_shortage">Approved Requisition Shortage</option>
                      <option value="rop_replenishment">Low-Stock ROP Replenishment</option>
                      <option value="funded_so_shortage">Funded Sales Order Backorder</option>
                      <option value="unpaid_so">Unpaid Sales Order Shortage</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-repf-rf-ref" className="form-label">
                      Linked Demand Reference (Optional)
                    </label>
                    <input
                      id="p08-repf-rf-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repfLinkedRfInput}
                      placeholder="e.g. CEBU-RF-2026-000001"
                      onChange={(e) => setRepfLinkedRfInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-repf-qty" className="form-label">
                      Purchase Request Quantity
                    </label>
                    <input
                      id="p08-repf-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repfQtyInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setRepfQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-repf-scale" className="form-label">
                      Decimal Precision Scale
                    </label>
                    <select
                      id="p08-repf-scale"
                      className="form-control"
                      value={repfScaleInput}
                      onChange={(e) => setRepfScaleInput(e.target.value)}
                    >
                      <option value="">Scale (0–6)</option>
                      <option value="0">0 — Whole units</option>
                      <option value="1">1 — 0.1</option>
                      <option value="2">2 — 0.01</option>
                      <option value="3">3 — 0.001</option>
                      <option value="4">4 — 0.0001</option>
                      <option value="5">5 — 0.00001</option>
                      <option value="6">6 — 0.000001</option>
                    </select>
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-repf-estimate" className="form-label">
                      Estimated Total Cost (PHP)
                    </label>
                    <input
                      id="p08-repf-estimate"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repfEstimateInput}
                      placeholder="e.g. 2500.00"
                      onChange={(e) => setRepfEstimateInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-repf-priority" className="form-label">
                      Priority Level
                    </label>
                    <select
                      id="p08-repf-priority"
                      className="form-control"
                      value={repfPriorityInput}
                      onChange={(e) =>
                        setRepfPriorityInput(e.target.value as 'normal' | 'urgent')
                      }
                    >
                      <option value="normal">Normal Schedule</option>
                      <option value="urgent">Urgent Operations</option>
                    </select>
                  </div>
                </div>

                <label
                  className={`p03-checkbox-row ${repfEmergencyInput ? 'is-checked' : ''}`}
                  htmlFor="p08-repf-emergency-checkbox"
                >
                  <input
                    id="p08-repf-emergency-checkbox"
                    type="checkbox"
                    className="p03-sr-checkbox"
                    checked={repfEmergencyInput}
                    onChange={(e) => {
                      playClickPen(soundEnabled);
                      setRepfEmergencyInput(e.target.checked);
                    }}
                  />
                  <span className="p03-checkbox-main">
                    <span className="p03-check-indicator" aria-hidden="true">
                      {repfEmergencyInput ? (
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>Emergency Procurement Request</span>
                  </span>
                </label>

                {repfEmergencyInput ? (
                  <div className="form-group">
                    <label htmlFor="p08-repf-emergency-reason" className="form-label">
                      Emergency Rule Rationale
                    </label>
                    <input
                      id="p08-repf-emergency-reason"
                      type="text"
                      className="form-control"
                      value={repfEmergencyReasonInput}
                      placeholder="Specify verified emergency criteria"
                      onChange={(e) => setRepfEmergencyReasonInput(e.target.value)}
                    />
                  </div>
                ) : null}

                <div className="form-group">
                  <label htmlFor="p08-repf-justification" className="form-label">
                    Procurement Justification
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p08-repf-justification"
                      type="text"
                      className="form-control"
                      value={repfJustificationInput}
                      placeholder="Explain operational demand or replenishment need"
                      onChange={(e) => setRepfJustificationInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p08-create-repf-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleCreateRepf}
                    >
                      Save Purchase Request
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-repfs-heading">
                <h2 id="p08-repfs-heading" className="p03-section-title">
                  Purchase Request Queue
                </h2>
                {filteredRepfs.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p08-empty-repfs-notice">
                    No purchase requests recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p08-repf-list">
                    {filteredRepfs.map((repf) => (
                      <article key={repf.repf_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            {repf.reference ?? `Request #${repf.repf_id}`}
                          </span>
                          <span className="p03-version-pill">
                            {REPF_STATUS_LABELS[repf.status]}
                          </span>
                        </div>
                        <p className="p03-muted-copy">
                          {TRIGGER_LABELS[repf.source_kind]} &middot; Qty{' '}
                          {repf.requested_quantity.value} &middot; Est. PHP {repf.estimated_amount}
                        </p>
                        <div className="p03-guard-buttons">
                          {repf.status === 'draft' ? (
                            <button
                              type="button"
                              data-testid={`p08-submit-repf-${repf.repf_id}`}
                              className="btn-batcave-primary"
                              onClick={() => handleSubmitRepf(repf)}
                            >
                              Submit for Budget Review
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-batcave-secondary"
                            onClick={() => {
                              playClickPen(soundEnabled);
                              setSelectedRepfId(repf.repf_id);
                              setActiveTab('budget');
                            }}
                          >
                            Open in Budget Review
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Budget Review & Revision */}
        {activeTab === 'budget' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-budget-heading">
                <h2 id="p08-budget-heading" className="p03-section-title">
                  Independent Chapter Budget Review
                </h2>
                <div className="form-group">
                  <label htmlFor="p08-budget-repf-select" className="form-label">
                    Selected Purchase Request
                  </label>
                  <select
                    id="p08-budget-repf-select"
                    className="form-control"
                    value={selectedRepf?.repf_id ?? ''}
                    onChange={(e) => setSelectedRepfId(e.target.value)}
                  >
                    <option value="">Select purchase request</option>
                    {snapshot.repfs.map((r) => (
                      <option key={r.repf_id} value={r.repf_id}>
                        {r.reference ?? `Request #${r.repf_id}`} — {REPF_STATUS_LABELS[r.status]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-budget-reviewer-id" className="form-label">
                      Budget Reviewer Member ID
                    </label>
                    <input
                      id="p08-budget-reviewer-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={budgetReviewerInput}
                      placeholder="Must differ from preparer (e.g. 202)"
                      onChange={(e) => setBudgetReviewerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-budget-approved-amount" className="form-label">
                      Approved Budget Ceiling (PHP)
                    </label>
                    <input
                      id="p08-budget-approved-amount"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={budgetApprovedAmtInput}
                      placeholder="e.g. 2500.00"
                      onChange={(e) => setBudgetApprovedAmtInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p08-budget-reason" className="form-label">
                    Review / Hold / Denial Reason
                  </label>
                  <input
                    id="p08-budget-reason"
                    type="text"
                    className="form-control"
                    value={budgetReasonInput}
                    placeholder="Required when holding, returning, or denying budget"
                    onChange={(e) => setBudgetReasonInput(e.target.value)}
                  />
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p08-budget-approve-btn"
                    className="btn-batcave-primary"
                    onClick={() => handleBudgetDecision('approve')}
                  >
                    Approve Chapter Budget
                  </button>
                  <button
                    type="button"
                    id="p08-budget-return-btn"
                    className="btn-batcave-secondary"
                    onClick={() => handleBudgetDecision('return')}
                  >
                    Return for Revision
                  </button>
                  <button
                    type="button"
                    id="p08-budget-hold-btn"
                    className="btn-batcave-secondary"
                    onClick={() => handleBudgetDecision('hold')}
                  >
                    Hold Request
                  </button>
                  <button
                    type="button"
                    id="p08-budget-deny-btn"
                    className="btn-batcave-secondary"
                    onClick={() => handleBudgetDecision('reject_cancel')}
                  >
                    Deny &amp; Release Claim
                  </button>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-revise-heading">
                <h2 id="p08-revise-heading" className="p03-section-title">
                  Revise Returned or Held Purchase Request
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-revise-qty" className="form-label">
                      Revised Quantity
                    </label>
                    <input
                      id="p08-revise-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={reviseQtyInput}
                      placeholder="Leave blank to keep current"
                      onChange={(e) => setReviseQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-revise-estimate" className="form-label">
                      Revised Estimated Cost (PHP)
                    </label>
                    <input
                      id="p08-revise-estimate"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={reviseEstInput}
                      placeholder="e.g. 2000.00"
                      onChange={(e) => setReviseEstInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p08-revise-reason" className="form-label">
                    Revision Audit Reason
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p08-revise-reason"
                      type="text"
                      className="form-control"
                      value={reviseReasonInput}
                      placeholder="Document revision rationale"
                      onChange={(e) => setReviseReasonInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p08-revise-repf-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleReviseRepf}
                    >
                      Revise to Draft
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 4: History & Operation Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-history-heading">
                <h2 id="p08-history-heading" className="p03-section-title">
                  Purchase Request Audit History
                </h2>
                {snapshot.history.length === 0 ? (
                  <p className="p03-muted-copy">No audit events recorded yet.</p>
                ) : (
                  <div className="p03-history-list" data-testid="p08-history-list">
                    {snapshot.history.map((entry) => (
                      <article key={entry.event_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            Request #{entry.repf_id} &middot; v{entry.version}/m
                            {entry.material_version}
                          </span>
                          <strong>{entry.action}</strong>
                        </div>
                        <p className="p03-muted-copy">
                          Actor #{entry.actor_user_id}
                          {entry.reason ? ` · ${entry.reason}` : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p08-lookup-heading">
                <h2 id="p08-lookup-heading" className="p03-section-title">
                  Operation Status Recovery
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p08-lookup-key-input" className="form-label">
                      Idempotency Key
                    </label>
                    <input
                      id="p08-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      placeholder="Enter request key"
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p08-lookup-ulid-input" className="form-label">
                      Operation Reference ID (ULID)
                    </label>
                    <input
                      id="p08-lookup-ulid-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupUlidInput}
                      placeholder="Enter operation ULID"
                      onChange={(e) => setLookupUlidInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p08-lookup-by-key-btn"
                    className="btn-batcave-primary"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                  <button
                    type="button"
                    id="p08-lookup-by-ulid-btn"
                    className="btn-batcave-secondary"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Operation ID
                  </button>
                </div>
                {lookupResult ? (
                  <div
                    className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                    data-testid="p08-lookup-result"
                  >
                    <div className="p03-blocker-title-row">
                      <span className="p03-blocker-code">{lookupResult.code}</span>
                      <span className="p03-policy-chip">
                        {lookupResult.data?.action_result.toUpperCase()}
                      </span>
                      <span className="p03-policy-chip">
                        Input Policy:{' '}
                        {lookupResult.data?.input_policy.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="p03-blocker-msg">{lookupResult.message}</p>
                  </div>
                ) : null}
                <div className="p03-ledger-chips" data-testid="p08-operation-ledger">
                  <span className="p03-eyebrow">Committed Operations</span>
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((entry) => (
                      <button
                        key={entry.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p08-ledger-fill-${entry.operation_id}`}
                        onClick={() => {
                          setLookupKeyInput(entry.idempotency_key);
                          setLookupUlidInput(entry.operation_id);
                        }}
                      >
                        {entry.code} &middot; {entry.idempotency_key}
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
