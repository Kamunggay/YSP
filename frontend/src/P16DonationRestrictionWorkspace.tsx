import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP16DonationRestrictionEngine } from './p16DonationRestrictionSlice';
import type {
  AllocationDemandKind,
  DonationAcknowledgment,
  DonorRestrictionMode,
  P16ActionResult,
  P16EngineSnapshot,
  P16LookupResult,
  ProvenanceStockLot,
} from './p16DonationRestrictionSlice';

type P16TabId = 'da' | 'lots' | 'allocate' | 'history';

interface P16DonationRestrictionWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P16DonationRestrictionWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P16DonationRestrictionWorkspaceProps) {
  const engine = useMemo(() => createP16DonationRestrictionEngine(), []);
  const [snapshot, setSnapshot] = useState<P16EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P16TabId>('da');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P16ActionResult | null>(snapshot.last_action);
  const [selectedDaId, setSelectedDaId] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');

  // Tab 1: Donation Acknowledgment (DA)
  const [daDonorInput, setDaDonorInput] = useState('');
  const [daOfficerInput, setDaOfficerInput] = useState('');
  const [daVariantInput, setDaVariantInput] = useState('');
  const [daItemInput, setDaItemInput] = useState('');
  const [daScaleInput, setDaScaleInput] = useState('');
  const [daQtyInput, setDaQtyInput] = useState('');
  const [daValueInput, setDaValueInput] = useState('');
  const [daBasisInput, setDaBasisInput] = useState('');
  const [daModeInput, setDaModeInput] = useState<DonorRestrictionMode>('distribution_only');
  const [daEventInput, setDaEventInput] = useState('');
  const [daUnitInput, setDaUnitInput] = useState('');
  const [daConditionInput, setDaConditionInput] = useState('');
  const [daAtInput, setDaAtInput] = useState('');

  // Tab 2: Receiving RM & Commercial Lot Comparison
  const [rmInspectorInput, setRmInspectorInput] = useState('');
  const [rmAcceptedInput, setRmAcceptedInput] = useState('');
  const [rmRejectedInput, setRmRejectedInput] = useState('');
  const [rmAtInput, setRmAtInput] = useState('');

  const [poRefInput, setPoRefInput] = useState('');
  const [poRmRefInput, setPoRmRefInput] = useState('');
  const [poVariantInput, setPoVariantInput] = useState('');
  const [poItemInput, setPoItemInput] = useState('');
  const [poQtyInput, setPoQtyInput] = useState('');

  // Tab 3: Allocation & Restriction Resolution
  const [allocDemandKindInput, setAllocDemandKindInput] = useState<AllocationDemandKind>('track1_sale');
  const [allocDemandRefInput, setAllocDemandRefInput] = useState('');
  const [allocEventInput, setAllocEventInput] = useState('');
  const [allocUnitInput, setAllocUnitInput] = useState('');
  const [allocQtyInput, setAllocQtyInput] = useState('');
  const [allocActorInput, setAllocActorInput] = useState('');
  const [allocOverrideInput, setAllocOverrideInput] = useState(false);
  const [allocAtInput, setAllocAtInput] = useState('');

  const [resApproverInput, setResApproverInput] = useState('');
  const [resNextModeInput, setResNextModeInput] = useState<DonorRestrictionMode>('scoped_predicate');
  const [resEventInput, setResEventInput] = useState('');
  const [resUnitInput, setResUnitInput] = useState('');
  const [resHashInput, setResHashInput] = useState('');
  const [resNotesInput, setResNotesInput] = useState('');
  const [resAtInput, setResAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P16ActionResult<P16LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P16ActionResult<T>): P16ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeDa: DonationAcknowledgment | undefined =
    snapshot.donation_records.find((d) => d.da_id === selectedDaId) ?? snapshot.donation_records[0];

  const activeLot: ProvenanceStockLot | undefined =
    snapshot.stock_lots.find((l) => l.lot_id === selectedLotId) ?? snapshot.stock_lots[0];

  function handleAcknowledgeDa() {
    playClickPen(soundEnabled);
    if (daScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the donation record.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.acknowledgeDonationSource({
        donor_name: daDonorInput,
        acknowledging_officer_id: daOfficerInput,
        variant_id: daVariantInput,
        item_name: daItemInput,
        quantity_scale: Number(daScaleInput),
        declared_quantity_value: daQtyInput,
        estimated_unit_value: daValueInput,
        valuation_basis: daBasisInput,
        restriction_mode: daModeInput,
        permitted_event_code: daEventInput.trim() || null,
        permitted_unit_id: daUnitInput.trim() || null,
        raw_donor_condition: daConditionInput,
        acknowledged_at: daAtInput,
        idempotency_key: nextSequentialKey('p16-da'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedDaId(res.data.da_id);
      setDaDonorInput('');
      setDaQtyInput('');
      setDaConditionInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostDaRm() {
    playClickPen(soundEnabled);
    if (!activeDa) return;
    const res = refreshSnapshot(
      engine.postDonatedRmReceipt({
        da_id: activeDa.da_id,
        inspector_user_id: rmInspectorInput,
        accepted_quantity_value: rmAcceptedInput,
        rejected_quantity_value: rmRejectedInput,
        inspected_at: rmAtInput,
        idempotency_key: nextSequentialKey('p16-da-rm'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedLotId(res.data.lot_id);
      setRmAcceptedInput('');
      setRmRejectedInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRegisterPoLot() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerUnrestrictedCommercialLot({
        po_reference: poRefInput,
        rm_reference: poRmRefInput,
        variant_id: poVariantInput,
        item_name: poItemInput,
        quantity_scale: 0,
        accepted_quantity_value: poQtyInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedLotId(res.data.lot_id);
      setPoQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAllocateLot() {
    playClickPen(soundEnabled);
    if (!activeLot) return;
    const res = refreshSnapshot(
      engine.allocateLotToDemand({
        lot_id: activeLot.lot_id,
        demand_kind: allocDemandKindInput,
        demand_reference: allocDemandRefInput,
        event_code: allocEventInput.trim() || null,
        unit_id: allocUnitInput.trim() || null,
        quantity_value: allocQtyInput,
        actor_user_id: allocActorInput,
        attempt_ordinary_override: allocOverrideInput,
        allocated_at: allocAtInput,
        idempotency_key: nextSequentialKey('p16-alloc'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleResolveRestriction() {
    playClickPen(soundEnabled);
    if (!activeLot) return;
    const res = refreshSnapshot(
      engine.resolveDonorRestrictionVersion({
        lot_id: activeLot.lot_id,
        approver_user_id: resApproverInput,
        next_mode: resNextModeInput,
        permitted_event_code: resEventInput.trim() || null,
        permitted_unit_id: resUnitInput.trim() || null,
        evidence_hash: resHashInput,
        resolution_notes: resNotesInput,
        resolved_at: resAtInput,
        expected_version: activeLot.version,
        idempotency_key: nextSequentialKey('p16-resolve'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupDonationOperation({
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
      engine.lookupDonationOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleLots = snapshot.stock_lots.filter(
    (l) =>
      !normalizedSearch ||
      l.rm_reference.toLowerCase().includes(normalizedSearch) ||
      l.source_reference.toLowerCase().includes(normalizedSearch) ||
      l.item_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p16-workspace">
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
                id="p16-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search donations, RM lots, or item names"
                aria-label="Search donation lots"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">In-Kind Donations &amp; Bounded Donor Restrictions</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Donation workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p16-tab-da"
                  aria-selected={activeTab === 'da'}
                  className={`p03-filter-pill ${activeTab === 'da' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('da');
                  }}
                >
                  Donation Acknowledgment
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p16-tab-lots"
                  aria-selected={activeTab === 'lots'}
                  className={`p03-filter-pill ${activeTab === 'lots' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('lots');
                  }}
                >
                  Receiving Inspection &amp; Lots
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p16-tab-allocate"
                  aria-selected={activeTab === 'allocate'}
                  className={`p03-filter-pill ${activeTab === 'allocate' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('allocate');
                  }}
                >
                  Restriction Gate &amp; Resolution
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p16-tab-history"
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
                id="p16-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p16-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p16-overview-heading" className="p03-section-title">
              Provenance &amp; Restriction Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                In-Kind DAs: <strong>{snapshot.donation_records.length}</strong>
              </span>
              <span className="p03-version-pill">
                Cash ORs Created: <strong data-testid="p16-cash-or-count-val">{snapshot.summary.cash_or_created_count}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Total Usable Available</span>
              <span className="p03-axis-val" data-testid="p16-usable-on-hand-val">
                {snapshot.summary.total_usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Unrestricted Saleable</span>
              <span className="p03-axis-val" data-testid="p16-saleable-val">
                {snapshot.summary.unrestricted_saleable}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Restricted Internal Only</span>
              <span className="p03-axis-val" data-testid="p16-restricted-val">
                {snapshot.summary.restricted_internal_only}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Uninterpreted Blocked</span>
              <span className="p03-axis-val" data-testid="p16-uninterpreted-val">
                {snapshot.summary.uninterpreted_blocked}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p16-feedback-banner"
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

        {/* TAB 1: Donation Acknowledgment */}
        {activeTab === 'da' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p16-da-intake-heading">
              <h2 id="p16-da-intake-heading" className="p03-section-title">
                Record In-Kind Donation Acknowledgment
              </h2>
              <p className="p03-muted-copy">
                Records donor goods, declared valuation basis, and permitted-use restrictions. Never
                creates cash receipts or customer payment credit.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-da-donor" className="form-label">
                    Donor / Sponsor Name
                  </label>
                  <input
                    id="p16-da-donor"
                    type="text"
                    className="form-control"
                    value={daDonorInput}
                    placeholder="e.g. Cebu Relief Org"
                    onChange={(e) => setDaDonorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-officer" className="form-label">
                    Acknowledging Officer ID
                  </label>
                  <input
                    id="p16-da-officer"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daOfficerInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setDaOfficerInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-da-variant" className="form-label">
                    Variant ID
                  </label>
                  <input
                    id="p16-da-variant"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daVariantInput}
                    placeholder="e.g. 71"
                    onChange={(e) => setDaVariantInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-item" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p16-da-item"
                    type="text"
                    className="form-control"
                    value={daItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setDaItemInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-da-qty" className="form-label">
                    Declared Quantity
                  </label>
                  <input
                    id="p16-da-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daQtyInput}
                    placeholder="e.g. 10"
                    onChange={(e) => setDaQtyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-scale" className="form-label">
                    Precision Scale
                  </label>
                  <select
                    id="p16-da-scale"
                    className="form-control"
                    value={daScaleInput}
                    onChange={(e) => setDaScaleInput(e.target.value)}
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
                  <label htmlFor="p16-da-val" className="form-label">
                    Estimated Unit Value (PHP)
                  </label>
                  <input
                    id="p16-da-val"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daValueInput}
                    placeholder="e.g. 250.00"
                    onChange={(e) => setDaValueInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-basis" className="form-label">
                    Valuation Basis
                  </label>
                  <input
                    id="p16-da-basis"
                    type="text"
                    className="form-control"
                    value={daBasisInput}
                    placeholder="e.g. Declared invoice value"
                    onChange={(e) => setDaBasisInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-da-mode" className="form-label">
                    Bounded Restriction Mode
                  </label>
                  <select
                    id="p16-da-mode"
                    className="form-control"
                    value={daModeInput}
                    onChange={(e) => setDaModeInput(e.target.value as DonorRestrictionMode)}
                  >
                    <option value="distribution_only">Distribution Only (Internal RF Only)</option>
                    <option value="scoped_predicate">Scoped Event / Unit Predicate</option>
                    <option value="unrestricted">Unrestricted Donation</option>
                    <option value="uninterpreted_condition">Uninterpreted Condition (Blocked)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-at" className="form-label">
                    Acknowledged Time (UTC)
                  </label>
                  <input
                    id="p16-da-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setDaAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-da-event" className="form-label">
                    Permitted Event Code (Optional)
                  </label>
                  <input
                    id="p16-da-event"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daEventInput}
                    placeholder="e.g. TY-MED-2026"
                    onChange={(e) => setDaEventInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-da-unit" className="form-label">
                    Permitted Unit ID (Optional)
                  </label>
                  <input
                    id="p16-da-unit"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={daUnitInput}
                    placeholder="e.g. UNIT-MED"
                    onChange={(e) => setDaUnitInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p16-da-condition" className="form-label">
                  Recorded Donor Condition Terms
                </label>
                <input
                  id="p16-da-condition"
                  type="text"
                  className="form-control"
                  value={daConditionInput}
                  placeholder="Donor terms description"
                  onChange={(e) => setDaConditionInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p16-ack-da-btn"
                  className="btn-batcave-primary"
                  onClick={handleAcknowledgeDa}
                >
                  Acknowledge In-Kind Donation
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p16-da-list-heading">
              <h2 id="p16-da-list-heading" className="p03-section-title">
                Acknowledged Donations ({snapshot.donation_records.length})
              </h2>
              {snapshot.donation_records.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p16-empty-da-notice">
                  No donation acknowledgments recorded yet.
                </p>
              ) : (
                <div className="p03-queue-list" data-testid="p16-da-list">
                  {snapshot.donation_records.map((da) => (
                    <div key={da.da_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong className="p03-mono-inline">{da.da_reference}</strong>
                        <span>
                          {da.donor_name} — {da.declared_quantity.value} {da.item_name} —{' '}
                          {da.restriction_mode}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => {
                          setSelectedDaId(da.da_id);
                          setActiveTab('lots');
                        }}
                      >
                        Inspect RM
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Receiving Inspection & Commercial Comparison Lots */}
        {activeTab === 'lots' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p16-da-rm-heading">
                <h2 id="p16-da-rm-heading" className="p03-section-title">
                  Inspect &amp; Post Donation Receiving Report
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p16-rm-inspector" className="form-label">
                      Inspector ID
                    </label>
                    <input
                      id="p16-rm-inspector"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmInspectorInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setRmInspectorInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p16-rm-at" className="form-label">
                      Inspection Time (UTC)
                    </label>
                    <input
                      id="p16-rm-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmAtInput}
                      placeholder="YYYY-MM-DDTHH:MM:SSZ"
                      onChange={(e) => setRmAtInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p16-rm-accepted" className="form-label">
                      Accepted Quantity
                    </label>
                    <input
                      id="p16-rm-accepted"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmAcceptedInput}
                      placeholder="e.g. 8"
                      onChange={(e) => setRmAcceptedInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p16-rm-rejected" className="form-label">
                      Rejected / Quarantined Qty
                    </label>
                    <input
                      id="p16-rm-rejected"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmRejectedInput}
                      placeholder="e.g. 2"
                      onChange={(e) => setRmRejectedInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p16-post-da-rm-btn"
                    className="btn-batcave-primary"
                    onClick={handlePostDaRm}
                  >
                    Post Donated RM Lot
                  </button>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p16-po-lot-heading">
                <h2 id="p16-po-lot-heading" className="p03-section-title">
                  Register Unrestricted Same-SKU Commercial Lot
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p16-po-ref" className="form-label">
                      PO Reference
                    </label>
                    <input
                      id="p16-po-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poRefInput}
                      placeholder="e.g. CEBU-PO-2026-000001"
                      onChange={(e) => setPoRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p16-po-rm-ref" className="form-label">
                      RM Reference
                    </label>
                    <input
                      id="p16-po-rm-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poRmRefInput}
                      placeholder="e.g. CEBU-RM-2026-000001"
                      onChange={(e) => setPoRmRefInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p16-po-variant" className="form-label">
                      Variant ID
                    </label>
                    <input
                      id="p16-po-variant"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setPoVariantInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p16-po-qty" className="form-label">
                      Saleable Quantity
                    </label>
                    <input
                      id="p16-po-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={poQtyInput}
                      placeholder="e.g. 5"
                      onChange={(e) => setPoQtyInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p16-po-item" className="form-label">
                    Item Description
                  </label>
                  <input
                    id="p16-po-item"
                    type="text"
                    className="form-control"
                    value={poItemInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setPoItemInput(e.target.value)}
                  />
                </div>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p16-register-po-lot-btn"
                    className="btn-batcave-secondary"
                    onClick={handleRegisterPoLot}
                  >
                    Register Unrestricted PO Lot
                  </button>
                </div>
              </section>
            </div>

            <section className="p03-card surface-card" aria-labelledby="p16-lots-table-heading">
              <h2 id="p16-lots-table-heading" className="p03-section-title">
                Provenance Stock Lots ({visibleLots.length})
              </h2>
              {visibleLots.length === 0 ? (
                <p className="p03-muted-copy">No provenance lots posted yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p16-lots-list">
                  {visibleLots.map((lot) => (
                    <div key={lot.lot_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong className="p03-mono-inline">
                          {lot.rm_reference} ({lot.source_kind})
                        </strong>
                        <span>
                          Available: {lot.available_quantity.value} — Mode: {lot.restriction_mode} (v
                          {lot.restriction_version})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        data-testid={`p16-select-lot-${lot.lot_id}`}
                        onClick={() => {
                          setSelectedLotId(lot.lot_id);
                          setActiveTab('allocate');
                        }}
                      >
                        Allocate / Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Restriction Gate & Resolution */}
        {activeTab === 'allocate' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p16-alloc-heading">
              <h2 id="p16-alloc-heading" className="p03-section-title">
                Test Demand Eligibility &amp; Allocate Lot
              </h2>
              {!activeLot ? (
                <p className="p03-muted-copy">Post or select a provenance lot first.</p>
              ) : (
                <>
                  <div className="session-ledger">
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Active Lot</span>
                      <span className="session-ledger-val p03-mono-inline">
                        {activeLot.rm_reference} ({activeLot.source_kind}) — {activeLot.restriction_mode}
                      </span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Available Eligible Qty</span>
                      <span className="session-ledger-val p03-mono-inline">
                        {activeLot.available_quantity.value}
                      </span>
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p16-alloc-kind" className="form-label">
                        Demand Kind
                      </label>
                      <select
                        id="p16-alloc-kind"
                        className="form-control"
                        value={allocDemandKindInput}
                        onChange={(e) =>
                          setAllocDemandKindInput(e.target.value as AllocationDemandKind)
                        }
                      >
                        <option value="track1_sale">Track 1 Customer Sale (SO)</option>
                        <option value="booth_sale">Track 2 Booth Sale</option>
                        <option value="internal_rf">Internal Distribution RF</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="p16-alloc-ref" className="form-label">
                        Demand Reference
                      </label>
                      <input
                        id="p16-alloc-ref"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={allocDemandRefInput}
                        placeholder="e.g. CEBU-RF-2026-000003"
                        onChange={(e) => setAllocDemandRefInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p16-alloc-event" className="form-label">
                        Target Event Code (Optional)
                      </label>
                      <input
                        id="p16-alloc-event"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={allocEventInput}
                        placeholder="e.g. TY-MED-2026"
                        onChange={(e) => setAllocEventInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p16-alloc-unit" className="form-label">
                        Target Unit ID (Optional)
                      </label>
                      <input
                        id="p16-alloc-unit"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={allocUnitInput}
                        placeholder="e.g. UNIT-MED"
                        onChange={(e) => setAllocUnitInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p16-alloc-qty" className="form-label">
                        Quantity
                      </label>
                      <input
                        id="p16-alloc-qty"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={allocQtyInput}
                        placeholder="e.g. 4"
                        onChange={(e) => setAllocQtyInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p16-alloc-actor" className="form-label">
                        Allocating Officer ID
                      </label>
                      <input
                        id="p16-alloc-actor"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={allocActorInput}
                        placeholder="e.g. 301"
                        onChange={(e) => setAllocActorInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p16-alloc-at" className="form-label">
                      Allocation Time (UTC)
                    </label>
                    <input
                      id="p16-alloc-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={allocAtInput}
                      placeholder="YYYY-MM-DDTHH:MM:SSZ"
                      onChange={(e) => setAllocAtInput(e.target.value)}
                    />
                  </div>

                  <div className="p03-checkbox-row">
                    <input
                      id="p16-alloc-override"
                      type="checkbox"
                      checked={allocOverrideInput}
                      onChange={(e) => setAllocOverrideInput(e.target.checked)}
                    />
                    <label htmlFor="p16-alloc-override">
                      Attempt ordinary stock override (must be rejected)
                    </label>
                  </div>

                  <div className="p03-guard-buttons">
                    <button
                      type="button"
                      id="p16-allocate-lot-btn"
                      className="btn-batcave-primary"
                      onClick={handleAllocateLot}
                    >
                      Allocate Lot Quantity
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p16-resolve-heading">
              <h2 id="p16-resolve-heading" className="p03-section-title">
                Authorized Donor Condition Resolution
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-res-approver" className="form-label">
                    Independent Approver ID
                  </label>
                  <input
                    id="p16-res-approver"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={resApproverInput}
                    placeholder="Approver ID (e.g. 202)"
                    onChange={(e) => setResApproverInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-res-next-mode" className="form-label">
                    Resolved Restriction Mode
                  </label>
                  <select
                    id="p16-res-next-mode"
                    className="form-control"
                    value={resNextModeInput}
                    onChange={(e) => setResNextModeInput(e.target.value as DonorRestrictionMode)}
                  >
                    <option value="scoped_predicate">Scoped Event / Unit Predicate</option>
                    <option value="distribution_only">Distribution Only (Internal)</option>
                    <option value="unrestricted">Unrestricted (Authorized Waiver)</option>
                    <option value="uninterpreted_condition">Uninterpreted Condition</option>
                  </select>
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-res-event" className="form-label">
                    Resolved Event Code
                  </label>
                  <input
                    id="p16-res-event"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={resEventInput}
                    placeholder="e.g. TY-MED-2026"
                    onChange={(e) => setResEventInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-res-unit" className="form-label">
                    Resolved Unit ID
                  </label>
                  <input
                    id="p16-res-unit"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={resUnitInput}
                    placeholder="e.g. UNIT-MED"
                    onChange={(e) => setResUnitInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-res-hash" className="form-label">
                    Authorization Evidence SHA-256
                  </label>
                  <input
                    id="p16-res-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={resHashInput}
                    placeholder="64 lowercase hex chars"
                    onChange={(e) => setResHashInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-res-at" className="form-label">
                    Resolution Time (UTC)
                  </label>
                  <input
                    id="p16-res-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={resAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setResAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p16-res-notes" className="form-label">
                  Authorized Resolution Notes
                </label>
                <input
                  id="p16-res-notes"
                  type="text"
                  className="form-control"
                  value={resNotesInput}
                  placeholder="Sponsor waiver reference"
                  onChange={(e) => setResNotesInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p16-resolve-restriction-btn"
                  className="btn-batcave-secondary"
                  onClick={handleResolveRestriction}
                >
                  Apply Authorized Restriction Update
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p16-history-heading">
              <h2 id="p16-history-heading" className="p03-section-title">
                Donation &amp; Provenance Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p16-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p16-lookup-heading">
              <h2 id="p16-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p16-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p16-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p16-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p16-lookup-ulid-input"
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
                  id="p16-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p16-lookup-by-ulid-btn"
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
                        data-testid={`p16-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p16-lookup-result" aria-live="polite">
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
