import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP07RequisitionEngine } from './p07RequisitionSlice';
import type {
  InternalRfRecord,
  P07ActionResult,
  P07EngineSnapshot,
  P07UncertainLookupResult,
  RfFulfillmentState,
  RfStatus,
} from './p07RequisitionSlice';

type P07TabId = 'intake' | 'review' | 'reservations' | 'history';
type P07QueueFilter = 'all' | 'action' | 'waiting' | 'approved' | 'history';

interface P07RequisitionWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const RF_STATUS_LABELS: Record<RfStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  returned: 'Returned',
  approved: 'Approved',
  canceled: 'Canceled',
};

const RF_FULFILLMENT_LABELS: Record<RfFulfillmentState, string> = {
  not_approved: 'Not Approved',
  outstanding: 'Outstanding',
  partially_issued: 'Partially Issued',
  fulfilled: 'Fulfilled',
  closed_canceled: 'Closed Canceled',
};

function formatRfStatus(status: RfStatus): string {
  return RF_STATUS_LABELS[status];
}

function formatFulfillmentState(state: RfFulfillmentState): string {
  return RF_FULFILLMENT_LABELS[state];
}

export function P07RequisitionWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P07RequisitionWorkspaceProps) {
  const engine = useMemo(() => createP07RequisitionEngine(), []);
  const [snapshot, setSnapshot] = useState<P07EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P07TabId>('intake');
  const [queueFilter, setQueueFilter] = useState<P07QueueFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P07ActionResult | null>(snapshot.last_action);
  const [selectedRfId, setSelectedRfId] = useState<string>('');

  // Tab 1: Draft Intake (strictly empty by default; preserved across tab switches)
  const [draftRequesterIdInput, setDraftRequesterIdInput] = useState('');
  const [draftUnitIdInput, setDraftUnitIdInput] = useState('');
  const [draftNeededAtInput, setDraftNeededAtInput] = useState('');
  const [draftJustificationInput, setDraftJustificationInput] = useState('');
  const [draftLineIdInput, setDraftLineIdInput] = useState('');
  const [draftVariantIdInput, setDraftVariantIdInput] = useState('');
  const [draftSkuInput, setDraftSkuInput] = useState('');
  const [draftItemNameInput, setDraftItemNameInput] = useState('');
  const [draftQtyInput, setDraftQtyInput] = useState('');
  const [draftScaleInput, setDraftScaleInput] = useState('');

  // Tab 2: Review, Return & Revision (strictly empty by default)
  const [reviewActorIdInput, setReviewActorIdInput] = useState('');
  const [reviewActorNameInput, setReviewActorNameInput] = useState('');
  const [reviewReasonInput, setReviewReasonInput] = useState('');
  const [reviseQtyInput, setReviseQtyInput] = useState('');
  const [reviseJustificationInput, setReviseJustificationInput] = useState('');
  const [reviseReasonInput, setReviseReasonInput] = useState('');

  // Tab 3: Stock Lots & Reservations (strictly empty by default)
  const [lotIdInput, setLotIdInput] = useState('');
  const [lotVariantIdInput, setLotVariantIdInput] = useState('');
  const [lotItemNameInput, setLotItemNameInput] = useState('');
  const [lotQtyInput, setLotQtyInput] = useState('');
  const [lotScaleInput, setLotScaleInput] = useState('');

  const [resRfIdInput, setResRfIdInput] = useState('');
  const [resLineIdInput, setResLineIdInput] = useState('');
  const [resLotIdInput, setResLotIdInput] = useState('');
  const [resActorIdInput, setResActorIdInput] = useState('');
  const [resOffsetInput, setResOffsetInput] = useState('');
  const [resQtyInput, setResQtyInput] = useState('');
  const [resActionReasonInput, setResActionReasonInput] = useState('');
  const [reallocTargetLotInput, setReallocTargetLotInput] = useState('');
  const [reallocOffsetInput, setReallocOffsetInput] = useState('');

  // Tab 4: History & Operation Recovery (strictly empty by default)
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P07ActionResult<P07UncertainLookupResult> | null>(
    null
  );

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P07ActionResult<T>): P07ActionResult<T> {
    const next = engine.getSnapshot();
    setSnapshot(next);
    setLastResult(res);
    return res;
  }

  const hasUnsavedDraftEdits = Boolean(
    draftRequesterIdInput.trim() ||
      draftUnitIdInput.trim() ||
      draftNeededAtInput.trim() ||
      draftJustificationInput.trim() ||
      draftVariantIdInput.trim() ||
      draftQtyInput.trim()
  );

  const selectedRf: InternalRfRecord | undefined =
    snapshot.requisitions.find((r) => r.rf_id === selectedRfId) ?? snapshot.requisitions[0];

  function handleClearDraftForm() {
    playClickPen(soundEnabled);
    setDraftRequesterIdInput('');
    setDraftUnitIdInput('');
    setDraftNeededAtInput('');
    setDraftJustificationInput('');
    setDraftLineIdInput('');
    setDraftVariantIdInput('');
    setDraftSkuInput('');
    setDraftItemNameInput('');
    setDraftQtyInput('');
    setDraftScaleInput('');
  }

  function handleCreateDraft() {
    playClickPen(soundEnabled);
    if (draftScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the requested item.';
      setLastResult({
        ok: false,
        http_status: 422,
        code: 'INVALID_SCALE',
        message: msg,
      });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.createInternalRf({
        requester_user_id: draftRequesterIdInput,
        requesting_unit_id: draftUnitIdInput.trim() || null,
        needed_at: draftNeededAtInput.trim() || null,
        justification: draftJustificationInput.trim() || null,
        lines: [
          {
            line_id: draftLineIdInput.trim() || null,
            variant_id: draftVariantIdInput,
            variant_sku: draftSkuInput.trim() || undefined,
            item_name: draftItemNameInput.trim() || undefined,
            requested_quantity_value: draftQtyInput,
            quantity_scale: Number(draftScaleInput),
          },
        ],
        idempotency_key: nextSequentialKey('p07-create'),
      })
    );

    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedRfId(res.data.rf_id);
      if (res.data.lines[0]) {
        setResRfIdInput(res.data.rf_id);
        setResLineIdInput(res.data.lines[0].line_id);
      }
      handleClearDraftForm();
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSubmitRf(rf: InternalRfRecord) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.submitInternalRf({
        rf_id: rf.rf_id,
        actor_user_id: rf.requester_user_id,
        expected_version: rf.version,
        expected_material_version: rf.material_version,
        idempotency_key: nextSequentialKey('p07-submit'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setSelectedRfId(rf.rf_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveSelectedRf() {
    playClickPen(soundEnabled);
    if (!selectedRf) {
      const msg = 'Select or create a requisition before recording an approval decision.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    const res = refreshSnapshot(
      engine.approveInternalRf({
        rf_id: selectedRf.rf_id,
        reviewer_user_id: reviewActorIdInput,
        reviewer_name: reviewActorNameInput.trim() || undefined,
        duty_code: 'RF_APPROVER',
        expected_version: selectedRf.version,
        expected_material_version: selectedRf.material_version,
        idempotency_key: nextSequentialKey('p07-approve'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setResRfIdInput(selectedRf.rf_id);
      if (selectedRf.lines[0]) {
        setResLineIdInput(selectedRf.lines[0].line_id);
      }
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReturnSelectedRf() {
    playClickPen(soundEnabled);
    if (!selectedRf) {
      const msg = 'Select or create a requisition before returning it.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    const res = refreshSnapshot(
      engine.returnInternalRf({
        rf_id: selectedRf.rf_id,
        reviewer_user_id: reviewActorIdInput,
        reason: reviewReasonInput,
        expected_version: selectedRf.version,
        expected_material_version: selectedRf.material_version,
        idempotency_key: nextSequentialKey('p07-return'),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReviseSelectedRf() {
    playClickPen(soundEnabled);
    if (!selectedRf) {
      const msg = 'Select a returned or uncommitted approved requisition to revise.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    const baseLine = selectedRf.lines[0];
    if (!baseLine) {
      const msg = 'Requisition has no lines to revise.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_LINE', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.reviseInternalRf({
        rf_id: selectedRf.rf_id,
        actor_user_id: selectedRf.requester_user_id,
        requesting_unit_id: selectedRf.requesting_unit_id,
        needed_at: selectedRf.needed_at,
        justification: reviseJustificationInput.trim() || selectedRf.justification,
        lines: [
          {
            line_id: baseLine.line_id,
            variant_id: baseLine.variant_id,
            variant_sku: baseLine.variant_sku,
            item_name: baseLine.item_name,
            requested_quantity_value:
              reviseQtyInput.trim() || baseLine.requested_quantity.value,
            quantity_scale: baseLine.requested_quantity.quantity_scale,
          },
        ],
        reason: reviseReasonInput,
        expected_version: selectedRf.version,
        expected_material_version: selectedRf.material_version,
        expected_progress_version: selectedRf.progress_version,
        idempotency_key: nextSequentialKey('p07-revise'),
      })
    );
    if (res.ok) {
      setReviseReasonInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCancelSelectedRf() {
    playClickPen(soundEnabled);
    if (!selectedRf) {
      const msg = 'Select a requisition to cancel.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    const res = refreshSnapshot(
      engine.cancelInternalRf({
        rf_id: selectedRf.rf_id,
        actor_user_id: selectedRf.requester_user_id,
        reason: reviewReasonInput,
        expected_version: selectedRf.version,
        expected_material_version: selectedRf.material_version,
        expected_progress_version: selectedRf.progress_version,
        idempotency_key: nextSequentialKey('p07-cancel'),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRegisterLot() {
    playClickPen(soundEnabled);
    if (lotScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the stock lot.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_SCALE', message: msg });
      onNotify('error', msg);
      return;
    }
    const res = refreshSnapshot(
      engine.registerEligibleStockLot({
        lot_id: lotIdInput.trim() || undefined,
        variant_id: lotVariantIdInput,
        item_name: lotItemNameInput.trim() || undefined,
        quantity_value: lotQtyInput,
        quantity_scale: Number(lotScaleInput),
      })
    );
    if (res.ok && res.data) {
      setResLotIdInput(res.data.lot_id);
      setLotIdInput('');
      setLotQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePrepareReservation() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.prepareRfReservation({
        actor_user_id: resActorIdInput,
        rf_id: resRfIdInput,
        rf_line_id: resLineIdInput,
        lot_id: resLotIdInput,
        offset_value: resOffsetInput,
        quantity_value: resQtyInput,
        idempotency_key: nextSequentialKey('p07-prep'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCommitPreparation(preparationId: string) {
    playClickPen(soundEnabled);
    const prep = snapshot.preparations.find((p) => p.preparation_id === preparationId);
    const actor = resActorIdInput.trim() || '301';
    const res = refreshSnapshot(
      engine.commitRfReservation({
        actor_user_id: actor,
        preparation_id: preparationId,
        expected_rf_version: prep?.prepared_rf_version,
        expected_material_version: prep?.prepared_material_version,
        expected_progress_version: prep?.prepared_progress_version,
        expected_stock_version: prep?.prepared_stock_version,
        idempotency_key: nextSequentialKey('p07-commit'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReleaseReservation(reservationId: string) {
    playClickPen(soundEnabled);
    const resObj = snapshot.reservations.find((r) => r.reservation_id === reservationId);
    const rfObj = resObj ? snapshot.requisitions.find((r) => r.rf_id === resObj.rf_id) : undefined;
    if (!resObj || !rfObj) return;

    const res = refreshSnapshot(
      engine.releaseRfReservation({
        actor_user_id: resActorIdInput.trim() || '301',
        reservation_id: reservationId,
        release_kind: 'release',
        reason: resActionReasonInput,
        expected_reservation_version: resObj.version,
        expected_rf_version: rfObj.version,
        expected_progress_version: rfObj.progress_version,
        idempotency_key: nextSequentialKey('p07-release'),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReallocateReservation(reservationId: string) {
    playClickPen(soundEnabled);
    const resObj = snapshot.reservations.find((r) => r.reservation_id === reservationId);
    const rfObj = resObj ? snapshot.requisitions.find((r) => r.rf_id === resObj.rf_id) : undefined;
    const srcLot = resObj ? snapshot.stock_lots.find((l) => l.lot_id === resObj.lot_id) : undefined;
    const dstLot = snapshot.stock_lots.find((l) => l.lot_id === reallocTargetLotInput);
    if (!resObj || !rfObj || !srcLot || !dstLot) {
      const msg = 'Select a valid destination stock lot before reallocating.';
      setLastResult({ ok: false, http_status: 422, code: 'TARGET_LOT_REQUIRED', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.reallocateRfReservation({
        actor_user_id: resActorIdInput.trim() || '301',
        reservation_id: reservationId,
        target_lot_id: dstLot.lot_id,
        target_offset_value: reallocOffsetInput.trim() || '0',
        quantity_value: resObj.active_quantity,
        reason: resActionReasonInput,
        expected_reservation_version: resObj.version,
        expected_rf_version: rfObj.version,
        expected_progress_version: rfObj.progress_version,
        expected_source_stock_version: srcLot.stock_version,
        expected_target_stock_version: dstLot.stock_version,
        idempotency_key: nextSequentialKey('p07-realloc'),
      })
    );
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupRequisitionOperation({
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
      engine.lookupRequisitionOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredRequisitions = snapshot.requisitions.filter((rf) => {
    if (queueFilter === 'action' && rf.status !== 'draft' && rf.status !== 'returned') {
      return false;
    }
    if (queueFilter === 'waiting' && rf.status !== 'submitted') {
      return false;
    }
    if (queueFilter === 'approved' && rf.status !== 'approved') {
      return false;
    }
    if (
      queueFilter === 'history' &&
      rf.status !== 'canceled' &&
      rf.fulfillment_state !== 'fulfilled'
    ) {
      return false;
    }
    if (!normalizedSearch) return true;
    return (
      (rf.reference ?? '').toLowerCase().includes(normalizedSearch) ||
      rf.rf_id.toLowerCase().includes(normalizedSearch) ||
      rf.requester_user_id.toLowerCase().includes(normalizedSearch) ||
      (rf.requesting_unit_id ?? '').toLowerCase().includes(normalizedSearch) ||
      (rf.justification ?? '').toLowerCase().includes(normalizedSearch) ||
      rf.lines.some(
        (l) =>
          (l.variant_sku ?? '').toLowerCase().includes(normalizedSearch) ||
          (l.item_name ?? '').toLowerCase().includes(normalizedSearch)
      )
    );
  });

  const selectedReservationRf =
    snapshot.requisitions.find((r) => r.rf_id === resRfIdInput) ??
    snapshot.requisitions.find((r) => r.status === 'approved');

  return (
    <main className="p03-workspace-shell" data-testid="p07-workspace">
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
                id="p07-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search requisition reference, requesting unit, item SKU, or justification"
                aria-label="Search internal requisitions"
              />
            </div>

            {normalizedSearch ? (
              <div className="p03-search-meta">
                <span className="p03-version-pill">
                  {filteredRequisitions.length} requisition
                  {filteredRequisitions.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  id="p07-search-clear-btn"
                  className="p03-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Internal Requisitions &amp; Stock Reservations</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Requisition demand workspace views"
              >
                <button
                  type="button"
                  role="tab"
                  id="p07-tab-intake"
                  aria-selected={activeTab === 'intake'}
                  className={`p03-filter-pill ${activeTab === 'intake' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('intake');
                  }}
                >
                  Requisition Intake &amp; Queue
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p07-tab-review"
                  aria-selected={activeTab === 'review'}
                  className={`p03-filter-pill ${activeTab === 'review' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('review');
                  }}
                >
                  Review, Return &amp; Revision
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p07-tab-reservations"
                  aria-selected={activeTab === 'reservations'}
                  className={`p03-filter-pill ${activeTab === 'reservations' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('reservations');
                  }}
                >
                  Stock Lots &amp; Reservations
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p07-tab-history"
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
                id="p07-back-dashboard-btn"
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

        {/* Live Demand & Eligibility Overview Strip */}
        <section className="p03-card surface-card" aria-labelledby="p07-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p07-overview-heading" className="p03-section-title">
              Requisition &amp; Reservation Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              {hasUnsavedDraftEdits ? (
                <span className="p03-version-pill" data-testid="p07-unsaved-draft-pill">
                  Unsaved Draft Edits Preserved
                </span>
              ) : null}
              <span className="p03-version-pill" data-testid="p07-rf-count-pill">
                Requisitions: <strong>{snapshot.requisitions.length}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p07-reservation-count-pill">
                Active Reservations:{' '}
                <strong>
                  {snapshot.reservations.filter((r) => r.status === 'active').length}
                </strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p07-usable-on-hand-val">
                {snapshot.stock_summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Requisition Reserved</span>
              <span className="p03-axis-val" data-testid="p07-rf-reserved-val">
                {snapshot.stock_summary.rf_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val" data-testid="p07-available-val">
                {snapshot.stock_summary.available_to_allocate}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Uncovered Shortage</span>
              <span className="p03-axis-val" data-testid="p07-shortage-val">
                {snapshot.stock_summary.uncovered_shortage}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p07-feedback-banner"
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

        {/* TAB 1: Requisition Intake & Work Queue */}
        {activeTab === 'intake' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-draft-heading">
                <div className="p03-card-header-row">
                  <h2 id="p07-draft-heading" className="p03-section-title">
                    Draft Internal Requisition
                  </h2>
                  {hasUnsavedDraftEdits ? (
                    <button
                      type="button"
                      id="p07-clear-draft-btn"
                      className="p03-search-clear-btn"
                      onClick={handleClearDraftForm}
                    >
                      Discard Edits
                    </button>
                  ) : null}
                </div>
                <p className="p03-muted-copy">
                  Incomplete drafts may be saved and edited across views without losing entries.
                  Formal reference numbers are assigned once upon submission.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-draft-requester-id" className="form-label">
                      Requester Member ID
                    </label>
                    <input
                      id="p07-draft-requester-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftRequesterIdInput}
                      placeholder="e.g. 101"
                      onChange={(e) => setDraftRequesterIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-draft-unit-id" className="form-label">
                      Requesting Committee / Unit
                    </label>
                    <input
                      id="p07-draft-unit-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftUnitIdInput}
                      placeholder="e.g. UNIT-LOGISTICS"
                      onChange={(e) => setDraftUnitIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-draft-needed-at" className="form-label">
                      Needed Date &amp; Time (UTC)
                    </label>
                    <input
                      id="p07-draft-needed-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftNeededAtInput}
                      placeholder="e.g. 2026-12-01T09:00:00.000000Z"
                      onChange={(e) => setDraftNeededAtInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-draft-line-id" className="form-label">
                      Line Reference ID (Optional)
                    </label>
                    <input
                      id="p07-draft-line-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftLineIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setDraftLineIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p07-draft-justification" className="form-label">
                    Operational Purpose &amp; Justification
                  </label>
                  <input
                    id="p07-draft-justification"
                    type="text"
                    className="form-control"
                    value={draftJustificationInput}
                    placeholder="State program activity or relief deployment reason"
                    onChange={(e) => setDraftJustificationInput(e.target.value)}
                  />
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-draft-variant-id" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p07-draft-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftVariantIdInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setDraftVariantIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-draft-sku" className="form-label">
                      Item SKU (Optional)
                    </label>
                    <input
                      id="p07-draft-sku"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftSkuInput}
                      placeholder="e.g. TENT-4P"
                      onChange={(e) => setDraftSkuInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p07-draft-item-name" className="form-label">
                    Item Name (Optional)
                  </label>
                  <input
                    id="p07-draft-item-name"
                    type="text"
                    className="form-control"
                    value={draftItemNameInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setDraftItemNameInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p07-draft-qty" className="form-label">
                    Requested Quantity &amp; Unit Scale
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p07-draft-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={draftQtyInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setDraftQtyInput(e.target.value)}
                    />
                    <select
                      id="p07-draft-scale"
                      className="form-control"
                      value={draftScaleInput}
                      onChange={(e) => setDraftScaleInput(e.target.value)}
                    >
                      <option value="">Scale (0–6)</option>
                      <option value="0">0 — Whole</option>
                      <option value="1">1 — 0.1</option>
                      <option value="2">2 — 0.01</option>
                      <option value="3">3 — 0.001</option>
                      <option value="4">4 — 0.0001</option>
                      <option value="5">5 — 0.00001</option>
                      <option value="6">6 — 0.000001</option>
                    </select>
                    <button
                      type="button"
                      id="p07-create-draft-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleCreateDraft}
                    >
                      Save Requisition Draft
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-queue-heading">
                <div className="p03-card-header-row">
                  <h2 id="p07-queue-heading" className="p03-section-title">
                    Requisition Work Queue
                  </h2>
                  <div className="p03-filter-pill-bar" role="group" aria-label="Filter queue">
                    <button
                      type="button"
                      id="p07-queue-filter-all"
                      className={`p03-filter-pill ${queueFilter === 'all' ? 'is-active' : ''}`}
                      onClick={() => setQueueFilter('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      id="p07-queue-filter-action"
                      className={`p03-filter-pill ${queueFilter === 'action' ? 'is-active' : ''}`}
                      onClick={() => setQueueFilter('action')}
                    >
                      Needs Action
                    </button>
                    <button
                      type="button"
                      id="p07-queue-filter-waiting"
                      className={`p03-filter-pill ${queueFilter === 'waiting' ? 'is-active' : ''}`}
                      onClick={() => setQueueFilter('waiting')}
                    >
                      Pending Review
                    </button>
                    <button
                      type="button"
                      id="p07-queue-filter-approved"
                      className={`p03-filter-pill ${queueFilter === 'approved' ? 'is-active' : ''}`}
                      onClick={() => setQueueFilter('approved')}
                    >
                      Approved
                    </button>
                    <button
                      type="button"
                      id="p07-queue-filter-history"
                      className={`p03-filter-pill ${queueFilter === 'history' ? 'is-active' : ''}`}
                      onClick={() => setQueueFilter('history')}
                    >
                      Closed
                    </button>
                  </div>
                </div>

                {filteredRequisitions.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p07-empty-queue-notice">
                    No requisitions match this filter yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p07-queue-list">
                    {filteredRequisitions.map((rf) => (
                      <article key={rf.rf_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <span className="p03-version-pill p03-mono-inline">
                              {rf.reference ?? `Draft #${rf.rf_id}`}
                            </span>
                            <strong>{rf.requesting_unit_id ?? 'Unassigned Unit'}</strong>
                          </div>
                          <div className="p03-version-badges">
                            <span className="p03-version-pill">{formatRfStatus(rf.status)}</span>
                            <span className="p03-version-pill">
                              {formatFulfillmentState(rf.fulfillment_state)}
                            </span>
                            <span className="p03-version-pill p03-mono-inline">
                              v{rf.version}/m{rf.material_version}/p{rf.progress_version}
                            </span>
                          </div>
                        </div>

                        <p className="p03-muted-copy">
                          Requester #{rf.requester_user_id} &middot;{' '}
                          {rf.justification ?? 'No justification recorded yet'}
                        </p>

                        {rf.lines.length > 0 ? (
                          <div className="p05-table-wrap">
                            <table className="p05-cells-table">
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  <th>Requested</th>
                                  <th>Reserved</th>
                                  <th>Unreserved</th>
                                  <th>Shortage</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rf.lines.map((line) => (
                                  <tr key={line.line_id}>
                                    <td>
                                      {line.variant_sku ? `${line.variant_sku} · ` : ''}
                                      {line.item_name ?? `Variant #${line.variant_id}`}
                                    </td>
                                    <td className="p03-mono-inline">
                                      {line.requested_quantity.value}
                                    </td>
                                    <td className="p03-mono-inline">{line.reserved_quantity}</td>
                                    <td className="p03-mono-inline">
                                      {line.unreserved_quantity ?? '—'}
                                    </td>
                                    <td className="p03-mono-inline">{line.uncovered_shortage}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        <div className="p03-guard-buttons">
                          {rf.status === 'draft' ? (
                            <button
                              type="button"
                              id={`p07-submit-rf-${rf.rf_id}`}
                              data-testid={`p07-submit-rf-${rf.rf_id}`}
                              className="btn-batcave-primary"
                              onClick={() => handleSubmitRf(rf)}
                            >
                              Submit for Review
                            </button>
                          ) : null}
                          <button
                            type="button"
                            data-testid={`p07-select-rf-${rf.rf_id}`}
                            className="btn-batcave-secondary"
                            onClick={() => {
                              playClickPen(soundEnabled);
                              setSelectedRfId(rf.rf_id);
                              setActiveTab('review');
                            }}
                          >
                            Open in Review Workspace
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

        {/* TAB 2: Independent Review, Return, Revision & Cancellation */}
        {activeTab === 'review' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-review-heading">
                <h2 id="p07-review-heading" className="p03-section-title">
                  Independent Approval &amp; Return Decision
                </h2>
                <p className="p03-muted-copy">
                  Requesters cannot approve their own requisitions. Approving establishes the
                  demand ceiling without automatically committing stock lots.
                </p>

                <div className="form-group">
                  <label htmlFor="p07-selected-rf-select" className="form-label">
                    Active Requisition Record
                  </label>
                  <select
                    id="p07-selected-rf-select"
                    className="form-control"
                    value={selectedRf?.rf_id ?? ''}
                    onChange={(e) => setSelectedRfId(e.target.value)}
                  >
                    <option value="">Select requisition</option>
                    {snapshot.requisitions.map((rf) => (
                      <option key={rf.rf_id} value={rf.rf_id}>
                        {rf.reference ?? `Draft #${rf.rf_id}`} — {formatRfStatus(rf.status)} (v
                        {rf.version}/m{rf.material_version})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRf ? (
                  <div className="p03-history-card" data-testid="p07-selected-rf-summary">
                    <div className="p03-history-head">
                      <span className="p03-version-pill p03-mono-inline">
                        {selectedRf.reference ?? `Draft #${selectedRf.rf_id}`}
                      </span>
                      <div className="p03-version-badges">
                        <span className="p03-version-pill">
                          {formatRfStatus(selectedRf.status)}
                        </span>
                        <span className="p03-version-pill p03-mono-inline">
                          Requester #{selectedRf.requester_user_id}
                        </span>
                      </div>
                    </div>
                    {selectedRf.return_reason ? (
                      <p className="p03-muted-copy">Return Note: {selectedRf.return_reason}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-review-actor-id" className="form-label">
                      Reviewer Member ID
                    </label>
                    <input
                      id="p07-review-actor-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={reviewActorIdInput}
                      placeholder="Must differ from requester (e.g. 202)"
                      onChange={(e) => setReviewActorIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-review-actor-name" className="form-label">
                      Reviewer Display Name (Optional)
                    </label>
                    <input
                      id="p07-review-actor-name"
                      type="text"
                      className="form-control"
                      value={reviewActorNameInput}
                      placeholder="e.g. Logistics Approver"
                      onChange={(e) => setReviewActorNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p07-review-reason" className="form-label">
                    Return or Cancellation Reason
                  </label>
                  <input
                    id="p07-review-reason"
                    type="text"
                    className="form-control"
                    value={reviewReasonInput}
                    placeholder="Required when returning or canceling a requisition"
                    onChange={(e) => setReviewReasonInput(e.target.value)}
                  />
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p07-approve-rf-btn"
                    className="btn-batcave-primary"
                    onClick={handleApproveSelectedRf}
                  >
                    Approve Requisition
                  </button>
                  <button
                    type="button"
                    id="p07-return-rf-btn"
                    className="btn-batcave-secondary"
                    onClick={handleReturnSelectedRf}
                  >
                    Return for Revision
                  </button>
                </div>

                <div className="p03-guard-strip">
                  <span className="p03-muted-copy">
                    Formally canceling an approved requisition requires releasing any active stock
                    reservations first.
                  </span>
                  <div className="p03-guard-buttons">
                    {selectedRf?.status === 'draft' ? (
                      <button
                        type="button"
                        id="p07-submit-selected-rf-btn"
                        className="btn-batcave-primary"
                        onClick={() => handleSubmitRf(selectedRf)}
                      >
                        Submit Draft
                      </button>
                    ) : null}
                    <button
                      type="button"
                      id="p07-cancel-rf-btn"
                      className="btn-batcave-secondary"
                      onClick={handleCancelSelectedRf}
                    >
                      Cancel Requisition Remainder
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-revise-heading">
                <h2 id="p07-revise-heading" className="p03-section-title">
                  Revise Returned or Uncommitted Demand
                </h2>
                <p className="p03-muted-copy">
                  Revising returns the requisition to draft, invalidates any prior approval, retains
                  its assigned reference number, and preserves line audit history.
                </p>

                <div className="form-group">
                  <label htmlFor="p07-revise-qty" className="form-label">
                    Revised Line Quantity
                  </label>
                  <input
                    id="p07-revise-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={reviseQtyInput}
                    placeholder="Leave blank to retain current quantity"
                    onChange={(e) => setReviseQtyInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p07-revise-justification" className="form-label">
                    Updated Justification
                  </label>
                  <input
                    id="p07-revise-justification"
                    type="text"
                    className="form-control"
                    value={reviseJustificationInput}
                    placeholder="Leave blank to retain current justification"
                    onChange={(e) => setReviseJustificationInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p07-revise-reason" className="form-label">
                    Revision Audit Note
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p07-revise-reason"
                      type="text"
                      className="form-control"
                      value={reviseReasonInput}
                      placeholder="Describe changes made for review"
                      onChange={(e) => setReviseReasonInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p07-revise-rf-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleReviseSelectedRf}
                    >
                      Revise to Draft
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Eligible Stock Lots, Preparation, Reservation Commit, Release & Reallocation */}
        {activeTab === 'reservations' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-lots-heading">
                <h2 id="p07-lots-heading" className="p03-section-title">
                  Eligible On-Hand Stock Lots
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-lot-id" className="form-label">
                      Lot ID (Optional)
                    </label>
                    <input
                      id="p07-lot-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lotIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setLotIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-lot-variant-id" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p07-lot-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lotVariantIdInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setLotVariantIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p07-lot-item-name" className="form-label">
                    Item Name (Optional)
                  </label>
                  <input
                    id="p07-lot-item-name"
                    type="text"
                    className="form-control"
                    value={lotItemNameInput}
                    placeholder="e.g. Four-Person Field Tent"
                    onChange={(e) => setLotItemNameInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p07-lot-qty" className="form-label">
                    Accepted Lot Quantity &amp; Scale
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p07-lot-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lotQtyInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setLotQtyInput(e.target.value)}
                    />
                    <select
                      id="p07-lot-scale"
                      className="form-control"
                      value={lotScaleInput}
                      onChange={(e) => setLotScaleInput(e.target.value)}
                    >
                      <option value="">Scale (0–6)</option>
                      <option value="0">0 — Whole</option>
                      <option value="1">1 — 0.1</option>
                      <option value="2">2 — 0.01</option>
                      <option value="3">3 — 0.001</option>
                      <option value="4">4 — 0.0001</option>
                      <option value="5">5 — 0.00001</option>
                      <option value="6">6 — 0.000001</option>
                    </select>
                    <button
                      type="button"
                      id="p07-register-lot-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleRegisterLot}
                    >
                      Register Stock Lot
                    </button>
                  </div>
                </div>

                {snapshot.stock_lots.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p07-empty-lots-notice">
                    No accepted stock lots registered yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p07-lots-table">
                      <thead>
                        <tr>
                          <th>Lot</th>
                          <th>Variant</th>
                          <th>Accepted</th>
                          <th>Reserved</th>
                          <th>Free</th>
                          <th>Version</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.stock_lots.map((lot) => (
                          <tr key={lot.lot_id}>
                            <td className="p03-mono-inline">#{lot.lot_id}</td>
                            <td className="p03-mono-inline">{lot.variant_id}</td>
                            <td className="p03-mono-inline">{lot.accepted_quantity}</td>
                            <td className="p03-mono-inline">{lot.reserved_quantity}</td>
                            <td className="p03-mono-inline">{lot.free_quantity}</td>
                            <td className="p03-mono-inline">v{lot.stock_version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="p03-card surface-card" aria-labelledby="p07-prepare-heading">
                <h2 id="p07-prepare-heading" className="p03-section-title">
                  Prepare &amp; Commit Exact Reservation
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-res-rf-select" className="form-label">
                      Approved Requisition
                    </label>
                    <select
                      id="p07-res-rf-select"
                      className="form-control"
                      value={resRfIdInput}
                      onChange={(e) => {
                        setResRfIdInput(e.target.value);
                        const matchRf = snapshot.requisitions.find(
                          (r) => r.rf_id === e.target.value
                        );
                        if (matchRf?.lines[0]) {
                          setResLineIdInput(matchRf.lines[0].line_id);
                        }
                      }}
                    >
                      <option value="">Select requisition</option>
                      {snapshot.requisitions.map((rf) => (
                        <option key={rf.rf_id} value={rf.rf_id}>
                          {rf.reference ?? `Draft #${rf.rf_id}`} ({formatRfStatus(rf.status)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-res-line-select" className="form-label">
                      Requisition Line
                    </label>
                    <select
                      id="p07-res-line-select"
                      className="form-control"
                      value={resLineIdInput}
                      onChange={(e) => setResLineIdInput(e.target.value)}
                    >
                      <option value="">Select demand line</option>
                      {(selectedReservationRf?.lines ?? []).map((l) => (
                        <option key={l.line_id} value={l.line_id}>
                          {l.item_name ?? `Variant #${l.variant_id}`} (unreserved:{' '}
                          {l.unreserved_quantity ?? l.requested_quantity.value})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-res-lot-select" className="form-label">
                      Source Stock Lot
                    </label>
                    <select
                      id="p07-res-lot-select"
                      className="form-control"
                      value={resLotIdInput}
                      onChange={(e) => setResLotIdInput(e.target.value)}
                    >
                      <option value="">Select lot</option>
                      {snapshot.stock_lots.map((l) => (
                        <option key={l.lot_id} value={l.lot_id}>
                          Lot #{l.lot_id} — free {l.free_quantity} (v{l.stock_version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-res-actor-id" className="form-label">
                      Allocator Member ID
                    </label>
                    <input
                      id="p07-res-actor-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={resActorIdInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setResActorIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p07-res-qty" className="form-label">
                    Interval Start Offset &amp; Reserve Quantity
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p07-res-offset"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={resOffsetInput}
                      placeholder="Offset e.g. 0"
                      onChange={(e) => setResOffsetInput(e.target.value)}
                    />
                    <input
                      id="p07-res-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={resQtyInput}
                      placeholder="Quantity e.g. 6"
                      onChange={(e) => setResQtyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p07-prepare-res-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handlePrepareReservation}
                    >
                      Prepare Selection
                    </button>
                  </div>
                </div>

                {snapshot.preparations.length > 0 ? (
                  <div className="p03-history-list" data-testid="p07-preparations-list">
                    {snapshot.preparations.map((prep) => (
                      <article key={prep.preparation_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            Prep #{prep.preparation_id} &middot; Lot #{prep.lot_id} [
                            {prep.offset_quantity}, {prep.quantity} units]
                          </span>
                          <span className="p03-version-pill">
                            {prep.state === 'prepared' ? 'Prepared' : 'Committed'}
                          </span>
                        </div>
                        {prep.state === 'prepared' ? (
                          <button
                            type="button"
                            data-testid={`p07-commit-prep-${prep.preparation_id}`}
                            className="btn-batcave-primary"
                            onClick={() => handleCommitPreparation(prep.preparation_id)}
                          >
                            Commit Reservation #{prep.preparation_id}
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-reservations-heading">
                <h2 id="p07-reservations-heading" className="p03-section-title">
                  Committed Reservations &amp; Lifecycle
                </h2>

                <div className="form-group">
                  <label htmlFor="p07-res-manage-reason" className="form-label">
                    Release or Reallocation Reason
                  </label>
                  <input
                    id="p07-res-manage-reason"
                    type="text"
                    className="form-control"
                    value={resActionReasonInput}
                    placeholder="Reason for releasing or switching lots"
                    onChange={(e) => setResActionReasonInput(e.target.value)}
                  />
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-realloc-target-lot" className="form-label">
                      Reallocation Target Lot
                    </label>
                    <select
                      id="p07-realloc-target-lot"
                      className="form-control"
                      value={reallocTargetLotInput}
                      onChange={(e) => setReallocTargetLotInput(e.target.value)}
                    >
                      <option value="">Select destination lot</option>
                      {snapshot.stock_lots.map((l) => (
                        <option key={l.lot_id} value={l.lot_id}>
                          Lot #{l.lot_id} (free: {l.free_quantity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-realloc-offset" className="form-label">
                      Target Start Offset
                    </label>
                    <input
                      id="p07-realloc-offset"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={reallocOffsetInput}
                      placeholder="e.g. 0"
                      onChange={(e) => setReallocOffsetInput(e.target.value)}
                    />
                  </div>
                </div>

                {snapshot.reservations.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p07-empty-reservations-notice">
                    No reservations committed yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p07-reservations-list">
                    {snapshot.reservations.map((res) => (
                      <article key={res.reservation_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            Reservation #{res.reservation_id} &middot; Lot #{res.lot_id}
                          </span>
                          <span className="p03-version-pill">
                            {res.status === 'active'
                              ? 'Active (No Expiry)'
                              : res.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="p03-muted-copy p03-mono-inline">
                          Offset {res.offset_quantity} &middot; Active: {res.active_quantity}{' '}
                          &middot; Released: {res.released_quantity} &middot; v{res.version}
                        </p>
                        {res.status === 'active' ? (
                          <div className="p03-guard-buttons">
                            <button
                              type="button"
                              data-testid={`p07-release-res-${res.reservation_id}`}
                              className="btn-batcave-secondary"
                              onClick={() => handleReleaseReservation(res.reservation_id)}
                            >
                              Release Reservation
                            </button>
                            <button
                              type="button"
                              data-testid={`p07-realloc-res-${res.reservation_id}`}
                              className="btn-batcave-primary"
                              onClick={() => handleReallocateReservation(res.reservation_id)}
                            >
                              Reallocate to Target Lot
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 4: Version Audit History & Durable Operation Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p07-history-heading">
                <h2 id="p07-history-heading" className="p03-section-title">
                  Requisition &amp; Reservation Audit Trail
                </h2>
                {snapshot.history.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p07-empty-history-notice">
                    No audit events recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p07-history-list">
                    {snapshot.history.map((entry) => (
                      <article key={entry.event_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            RF #{entry.rf_id} &middot; v{entry.version}/m{entry.material_version}/p
                            {entry.progress_version}
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
              <section className="p03-card surface-card" aria-labelledby="p07-lookup-heading">
                <h2 id="p07-lookup-heading" className="p03-section-title">
                  Operation Status Recovery
                </h2>
                <p className="p03-muted-copy">
                  Verify whether a requisition submission or reservation commit succeeded before
                  retrying after a timeout. Unseen operations preserve entered inputs.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p07-lookup-key-input" className="form-label">
                      Idempotency Key
                    </label>
                    <input
                      id="p07-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      placeholder="Enter request key"
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p07-lookup-ulid-input" className="form-label">
                      Operation Reference ID (ULID)
                    </label>
                    <input
                      id="p07-lookup-ulid-input"
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
                    id="p07-lookup-by-key-btn"
                    className="btn-batcave-primary"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                  <button
                    type="button"
                    id="p07-lookup-by-ulid-btn"
                    className="btn-batcave-secondary"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Operation ID
                  </button>
                </div>

                {lookupResult ? (
                  <div
                    className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                    data-testid="p07-lookup-result"
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

                <div className="p03-ledger-chips" data-testid="p07-operation-ledger">
                  <span className="p03-eyebrow">Committed Requisition Operations</span>
                  {snapshot.operation_ledger.length === 0 ? (
                    <p className="p03-muted-copy">No operations recorded yet.</p>
                  ) : (
                    <div className="p03-chip-wrap">
                      {snapshot.operation_ledger.map((entry) => (
                        <button
                          key={entry.operation_id}
                          type="button"
                          className="p03-ledger-chip-btn p03-mono-inline"
                          data-testid={`p07-ledger-fill-${entry.operation_id}`}
                          onClick={() => {
                            setLookupKeyInput(entry.idempotency_key);
                            setLookupUlidInput(entry.operation_id);
                          }}
                        >
                          {entry.code} &middot; {entry.idempotency_key}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
