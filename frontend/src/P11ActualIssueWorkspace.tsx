import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP11ActualIssueEngine } from './p11ActualIssueSlice';
import type {
  ActualIssueBatch,
  ApprovedRfForIssue,
  P11ActionResult,
  P11EngineSnapshot,
  P11LookupResult,
  RfIssueStatus,
} from './p11ActualIssueSlice';

type P11TabId = 'rf-demand' | 'batches' | 'closure' | 'history';

interface P11ActualIssueWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const RF_STATUS_LABELS: Record<RfIssueStatus, string> = {
  open: 'Open',
  partially_fulfilled: 'Partially Fulfilled',
  fulfilled: 'Fulfilled',
  partially_fulfilled_and_canceled: 'Partially Fulfilled & Remainder Canceled',
  canceled: 'Canceled',
};

const BATCH_STATUS_LABELS: Record<ActualIssueBatch['status'], string> = {
  draft: 'Draft (Unsigned)',
  ready: 'Ready (Signed Evidence Bound)',
  posted: 'Posted (Stock Deducted)',
};

export function P11ActualIssueWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P11ActualIssueWorkspaceProps) {
  const engine = useMemo(() => createP11ActualIssueEngine(), []);
  const [snapshot, setSnapshot] = useState<P11EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P11TabId>('rf-demand');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P11ActionResult | null>(snapshot.last_action);
  const [selectedRfId, setSelectedRfId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');

  // Tab 1: Register Approved RF & Replenishment (strictly empty by default)
  const [rfRefInput, setRfRefInput] = useState('');
  const [rfRequesterInput, setRfRequesterInput] = useState('');
  const [rfVariantInput, setRfVariantInput] = useState('');
  const [rfItemInput, setRfItemInput] = useState('');
  const [rfRequestedInput, setRfRequestedInput] = useState('');
  const [rfReservedInput, setRfReservedInput] = useState('');
  const [rfUsableInput, setRfUsableInput] = useState('');
  const [rfScaleInput, setRfScaleInput] = useState('');

  const [repActorInput, setRepActorInput] = useState('');
  const [repRmRefInput, setRepRmRefInput] = useState('');
  const [repQtyInput, setRepQtyInput] = useState('');

  // Tab 2: Batch Preparation, Revision & Evidence Binding (strictly empty by default)
  const [batchPreparerInput, setBatchPreparerInput] = useState('');
  const [batchQtyInput, setBatchQtyInput] = useState('');
  const [batchRecNameInput, setBatchRecNameInput] = useState('');
  const [batchRecIdInput, setBatchRecIdInput] = useState('');
  const [batchRecCapInput, setBatchRecCapInput] = useState('');

  const [evKindInput, setEvKindInput] = useState<'IS_AR' | 'EL'>('IS_AR');
  const [evIssuerInput, setEvIssuerInput] = useState('');
  const [evRecipientInput, setEvRecipientInput] = useState('');
  const [evSigHashInput, setEvSigHashInput] = useState('');
  const [evPhotoHashInput, setEvPhotoHashInput] = useState('');
  const [evSignedAtInput, setEvSignedAtInput] = useState('');
  const [evSnapshotHashInput, setEvSnapshotHashInput] = useState('');
  const [evAckInput, setEvAckInput] = useState(false);

  // Tab 3: Formal Closure / Cancellation of Remainder
  const [cancelActorInput, setCancelActorInput] = useState('');
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P11ActionResult<P11LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P11ActionResult<T>): P11ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeRf: ApprovedRfForIssue | undefined =
    snapshot.approved_rfs.find((r) => r.rf_id === selectedRfId) ?? snapshot.approved_rfs[0];

  const activeBatch: ActualIssueBatch | undefined =
    snapshot.batches.find((b) => b.batch_id === selectedBatchId) ?? snapshot.batches[0];

  function handleRegisterRf() {
    playClickPen(soundEnabled);
    if (rfScaleInput === '') {
      const msg = 'Select a unit decimal precision scale (0–6) for the requisition line.';
      setLastResult({ ok: false, http_status: 422, code: 'INVALID_PRECISION', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.registerApprovedRfForIssue({
        rf_reference: rfRefInput,
        requester_user_id: rfRequesterInput,
        variant_id: rfVariantInput,
        item_name: rfItemInput.trim() || undefined,
        requested_quantity_value: rfRequestedInput,
        initial_reserved_value: rfReservedInput,
        initial_usable_on_hand_value: rfUsableInput.trim() || undefined,
        quantity_scale: Number(rfScaleInput),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedRfId(res.data.rf_id);
      setRfRefInput('');
      setRfRequestedInput('');
      setRfReservedInput('');
      setRfUsableInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReplenish() {
    playClickPen(soundEnabled);
    if (!activeRf) {
      const msg = 'Register or select an approved requisition line first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.replenishRfReservationFromRm({
        actor_user_id: repActorInput,
        rf_id: activeRf.rf_id,
        rm_reference: repRmRefInput,
        replenished_quantity_value: repQtyInput,
        expected_rf_version: activeRf.version,
        idempotency_key: nextSequentialKey('p11-replenish'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setRepRmRefInput('');
      setRepQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePrepareBatch() {
    playClickPen(soundEnabled);
    if (!activeRf) {
      const msg = 'Select an approved requisition line before preparing a batch.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.prepareActualIssueBatch({
        prepared_by_user_id: batchPreparerInput,
        rf_id: activeRf.rf_id,
        batch_quantity_value: batchQtyInput,
        recipient_name: batchRecNameInput,
        recipient_user_id: batchRecIdInput.trim() || undefined,
        recipient_capacity: batchRecCapInput,
        expected_rf_version: activeRf.version,
        idempotency_key: nextSequentialKey('p11-prepare'),
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
    if (!activeBatch) {
      const msg = 'Prepare or select an unposted issue batch first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.reviseActualIssueBatch({
        actor_user_id: batchPreparerInput,
        batch_id: activeBatch.batch_id,
        batch_quantity_value: batchQtyInput,
        recipient_name: batchRecNameInput,
        recipient_user_id: batchRecIdInput.trim() || undefined,
        recipient_capacity: batchRecCapInput,
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p11-revise'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setEvAckInput(false);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLoadCurrentHash() {
    playClickPen(soundEnabled);
    if (!activeBatch) {
      const msg = 'Prepare or select an issue batch first to read its snapshot digest.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }
    setEvSnapshotHashInput(activeBatch.batch_snapshot_hash);
  }

  function handleBindEvidence() {
    playClickPen(soundEnabled);
    if (!activeBatch) {
      const msg = 'Select an issue batch before binding signed evidence.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.bindReadyIssueEvidence({
        batch_id: activeBatch.batch_id,
        evidence_kind: evKindInput,
        signature_evidence_hash: evSigHashInput,
        photo_evidence_hash: evPhotoHashInput.trim() || undefined,
        issuer_user_id: evIssuerInput,
        recipient_user_id: evRecipientInput,
        recipient_acknowledged: evAckInput,
        signed_at: evSignedAtInput,
        linked_batch_snapshot_hash: evSnapshotHashInput,
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p11-bind'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePostBatch() {
    playClickPen(soundEnabled);
    if (!activeBatch) {
      const msg = 'Select a signed issue batch to post stock deduction.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.postActualIssueBatch({
        actor_user_id: evIssuerInput.trim() || batchPreparerInput,
        batch_id: activeBatch.batch_id,
        expected_snapshot_hash: evSnapshotHashInput.trim() || undefined,
        expected_batch_version: activeBatch.version,
        idempotency_key: nextSequentialKey('p11-post'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCancelRemainder() {
    playClickPen(soundEnabled);
    if (!activeRf) {
      const msg = 'Select an approved requisition line to close remaining demand.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.cancelRemainingRfDemand({
        actor_user_id: cancelActorInput,
        rf_id: activeRf.rf_id,
        cancellation_reason: cancelReasonInput,
        expected_rf_version: activeRf.version,
        idempotency_key: nextSequentialKey('p11-cancel'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setCancelReasonInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupIssueOperation({
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
      engine.lookupIssueOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleRfs = snapshot.approved_rfs.filter(
    (rf) =>
      !normalizedSearch ||
      rf.rf_reference.toLowerCase().includes(normalizedSearch) ||
      (rf.item_name ?? '').toLowerCase().includes(normalizedSearch) ||
      rf.variant_id.toLowerCase().includes(normalizedSearch)
  );
  const visibleBatches = snapshot.batches.filter(
    (b) =>
      !normalizedSearch ||
      b.isar_reference.toLowerCase().includes(normalizedSearch) ||
      b.rf_reference.toLowerCase().includes(normalizedSearch) ||
      b.recipient_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p11-workspace">
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
                id="p11-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Requisition references, IS/AR batches, recipients, or items"
                aria-label="Search material issuance records"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Signed Material Issues &amp; Partial Fulfillment</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Material issue workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p11-tab-rf-demand"
                  aria-selected={activeTab === 'rf-demand'}
                  className={`p03-filter-pill ${activeTab === 'rf-demand' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('rf-demand');
                  }}
                >
                  Approved Requisitions &amp; Replenishment
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p11-tab-batches"
                  aria-selected={activeTab === 'batches'}
                  className={`p03-filter-pill ${activeTab === 'batches' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('batches');
                  }}
                >
                  Issue Batches &amp; Signatures
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p11-tab-closure"
                  aria-selected={activeTab === 'closure'}
                  className={`p03-filter-pill ${activeTab === 'closure' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('closure');
                  }}
                >
                  Partial Fulfillment Closure
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p11-tab-history"
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
                id="p11-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p11-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p11-overview-heading" className="p03-section-title">
              Issuance &amp; Fulfillment Balance — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Requisition Lines: <strong>{snapshot.approved_rfs.length}</strong>
              </span>
              <span className="p03-version-pill">
                Issue Batches: <strong>{snapshot.batches.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p11-usable-on-hand-val">
                {snapshot.summary.usable_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Reserved</span>
              <span className="p03-axis-val" data-testid="p11-active-reserved-val">
                {snapshot.summary.active_reserved}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Total Issued</span>
              <span className="p03-axis-val" data-testid="p11-total-issued-val">
                {snapshot.summary.total_issued}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Open RF Remaining</span>
              <span className="p03-axis-val" data-testid="p11-open-rf-remaining-val">
                {snapshot.summary.open_rf_remaining}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p11-feedback-banner"
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

        {/* TAB 1: Approved Requisitions & Replenishment */}
        {activeTab === 'rf-demand' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-register-rf-heading">
                <h2 id="p11-register-rf-heading" className="p03-section-title">
                  Register Approved Requisition Line for Issue
                </h2>
                <p className="p03-muted-copy">
                  Stockroom batches can only draw against active reserved quantity; any uncovered
                  shortage remains tracked for incoming RM replenishment or partial cancellation.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-rf-ref-input" className="form-label">
                      Requisition Reference
                    </label>
                    <input
                      id="p11-rf-ref-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfRefInput}
                      placeholder="e.g. CEBU-RF-2026-000001"
                      onChange={(e) => setRfRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-rf-requester-input" className="form-label">
                      Requester Member ID
                    </label>
                    <input
                      id="p11-rf-requester-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfRequesterInput}
                      placeholder="e.g. 101"
                      onChange={(e) => setRfRequesterInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-rf-variant-input" className="form-label">
                      Variant ID
                    </label>
                    <input
                      id="p11-rf-variant-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfVariantInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setRfVariantInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-rf-item-input" className="form-label">
                      Item Description (Optional)
                    </label>
                    <input
                      id="p11-rf-item-input"
                      type="text"
                      className="form-control"
                      value={rfItemInput}
                      placeholder="e.g. Field Sleeping Pad"
                      onChange={(e) => setRfItemInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-rf-requested-input" className="form-label">
                      Approved Requested Quantity
                    </label>
                    <input
                      id="p11-rf-requested-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfRequestedInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setRfRequestedInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-rf-reserved-input" className="form-label">
                      Initial Active Reserved Quantity
                    </label>
                    <input
                      id="p11-rf-reserved-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfReservedInput}
                      placeholder="e.g. 6"
                      onChange={(e) => setRfReservedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-rf-usable-input" className="form-label">
                      Usable Stockroom On-Hand Added
                    </label>
                    <input
                      id="p11-rf-usable-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rfUsableInput}
                      placeholder="e.g. 6"
                      onChange={(e) => setRfUsableInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-rf-scale-select" className="form-label">
                      Decimal Precision Scale
                    </label>
                    <div className="p03-input-action-row">
                      <select
                        id="p11-rf-scale-select"
                        className="form-control"
                        value={rfScaleInput}
                        onChange={(e) => setRfScaleInput(e.target.value)}
                      >
                        <option value="">Scale (0–6)</option>
                        <option value="0">0 — Whole units</option>
                        <option value="2">2 — Hundredths (0.01)</option>
                        <option value="3">3 — Thousandths (0.001)</option>
                      </select>
                      <button
                        type="button"
                        id="p11-register-rf-btn"
                        className="btn-batcave-primary p03-shrink-btn"
                        onClick={handleRegisterRf}
                      >
                        Register Requisition Line
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p11-replenish-heading">
                <h2 id="p11-replenish-heading" className="p03-section-title">
                  Replenish Active Reservation from Posted Receiving Memo
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-replenish-rf-select" className="form-label">
                      Target Requisition Line
                    </label>
                    <select
                      id="p11-replenish-rf-select"
                      className="form-control"
                      value={activeRf?.rf_id ?? ''}
                      onChange={(e) => setSelectedRfId(e.target.value)}
                    >
                      <option value="">Select Requisition Line</option>
                      {snapshot.approved_rfs.map((rf) => (
                        <option key={rf.rf_id} value={rf.rf_id}>
                          {rf.rf_reference} — Uncovered: {rf.uncovered_shortage_quantity} (v
                          {rf.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-replenish-actor-input" className="form-label">
                      Stockroom Officer ID
                    </label>
                    <input
                      id="p11-replenish-actor-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repActorInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setRepActorInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-replenish-rm-ref-input" className="form-label">
                      Posted Receiving Memo Reference
                    </label>
                    <input
                      id="p11-replenish-rm-ref-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={repRmRefInput}
                      placeholder="e.g. CEBU-RM-2026-000001"
                      onChange={(e) => setRepRmRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-replenish-qty-input" className="form-label">
                      Replenished Usable Quantity
                    </label>
                    <div className="p03-input-action-row">
                      <input
                        id="p11-replenish-qty-input"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={repQtyInput}
                        placeholder="e.g. 4"
                        onChange={(e) => setRepQtyInput(e.target.value)}
                      />
                      <button
                        type="button"
                        id="p11-replenish-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleReplenish}
                      >
                        Replenish Reservation
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-rfs-list-heading">
                <h2 id="p11-rfs-list-heading" className="p03-section-title">
                  Approved Requisition Balances
                </h2>
                {visibleRfs.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p11-empty-rfs-notice">
                    No approved requisition lines registered yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p11-rfs-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Requested</th>
                          <th>Reserved</th>
                          <th>Issued</th>
                          <th>Canceled</th>
                          <th>Remaining</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRfs.map((rf) => (
                          <tr key={rf.rf_id}>
                            <td className="p03-mono-inline">{rf.rf_reference}</td>
                            <td className="p03-mono-inline">{rf.requested_quantity}</td>
                            <td className="p03-mono-inline">{rf.active_reserved_quantity}</td>
                            <td className="p03-mono-inline">{rf.issued_quantity}</td>
                            <td className="p03-mono-inline">{rf.canceled_quantity}</td>
                            <td className="p03-mono-inline">{rf.remaining_demand_quantity}</td>
                            <td>{RF_STATUS_LABELS[rf.status]}</td>
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

        {/* TAB 2: Issue Batches & Signatures */}
        {activeTab === 'batches' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-prepare-batch-heading">
                <h2 id="p11-prepare-batch-heading" className="p03-section-title">
                  Prepare or Revise Physical Issue Batch
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-batch-rf-select" className="form-label">
                      Requisition Line
                    </label>
                    <select
                      id="p11-batch-rf-select"
                      className="form-control"
                      value={activeRf?.rf_id ?? ''}
                      onChange={(e) => setSelectedRfId(e.target.value)}
                    >
                      <option value="">Select Requisition Line</option>
                      {snapshot.approved_rfs.map((rf) => (
                        <option key={rf.rf_id} value={rf.rf_id}>
                          {rf.rf_reference} (Reserved: {rf.active_reserved_quantity}, v{rf.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-batch-preparer-input" className="form-label">
                      Issuing Custodian ID
                    </label>
                    <input
                      id="p11-batch-preparer-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={batchPreparerInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setBatchPreparerInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-batch-qty-input" className="form-label">
                      Batch Issue Quantity
                    </label>
                    <input
                      id="p11-batch-qty-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={batchQtyInput}
                      placeholder="e.g. 4"
                      onChange={(e) => setBatchQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-batch-recipient-id-input" className="form-label">
                      Recipient Account ID (Optional)
                    </label>
                    <input
                      id="p11-batch-recipient-id-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={batchRecIdInput}
                      placeholder="e.g. 102"
                      onChange={(e) => setBatchRecIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-batch-recipient-name-input" className="form-label">
                      Recipient Full Name
                    </label>
                    <input
                      id="p11-batch-recipient-name-input"
                      type="text"
                      className="form-control"
                      value={batchRecNameInput}
                      placeholder="e.g. Maria Santos"
                      onChange={(e) => setBatchRecNameInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-batch-recipient-cap-input" className="form-label">
                      Recipient Chapter Capacity
                    </label>
                    <input
                      id="p11-batch-recipient-cap-input"
                      type="text"
                      className="form-control"
                      value={batchRecCapInput}
                      placeholder="e.g. Relief Team Lead"
                      onChange={(e) => setBatchRecCapInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p11-prepare-batch-btn"
                    className="btn-batcave-primary"
                    onClick={handlePrepareBatch}
                  >
                    Prepare Issue Batch
                  </button>
                  <button
                    type="button"
                    id="p11-revise-batch-btn"
                    className="btn-batcave-secondary"
                    onClick={handleReviseBatch}
                  >
                    Revise Selected Unposted Batch
                  </button>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p11-bind-evidence-heading">
                <h2 id="p11-bind-evidence-heading" className="p03-section-title">
                  Bind Signed Acknowledgment &amp; Post Stock Deduction
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-evidence-batch-select" className="form-label">
                      Target Issue Batch
                    </label>
                    <select
                      id="p11-evidence-batch-select"
                      className="form-control"
                      value={activeBatch?.batch_id ?? ''}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                    >
                      <option value="">Select Issue Batch</option>
                      {snapshot.batches.map((b) => (
                        <option key={b.batch_id} value={b.batch_id}>
                          {b.isar_reference} — {b.batch_quantity} ({BATCH_STATUS_LABELS[b.status]}, v
                          {b.material_version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-ev-kind-select" className="form-label">
                      Signed Document Type
                    </label>
                    <select
                      id="p11-ev-kind-select"
                      className="form-control"
                      value={evKindInput}
                      onChange={(e) => setEvKindInput(e.target.value as 'IS_AR' | 'EL')}
                    >
                      <option value="IS_AR">IS/AR — Consumable Issue Slip &amp; Receipt</option>
                      <option value="EL">EL — Equipment Custody Loan Log</option>
                    </select>
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-ev-issuer-input" className="form-label">
                      Issuing Signatory ID
                    </label>
                    <input
                      id="p11-ev-issuer-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={evIssuerInput}
                      placeholder="e.g. 301"
                      onChange={(e) => setEvIssuerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-ev-recipient-input" className="form-label">
                      Receiving Signatory ID
                    </label>
                    <input
                      id="p11-ev-recipient-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={evRecipientInput}
                      placeholder="Must differ from issuer (e.g. 102)"
                      onChange={(e) => setEvRecipientInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-ev-sig-hash-input" className="form-label">
                      Signed Form Hash (SHA-256)
                    </label>
                    <input
                      id="p11-ev-sig-hash-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={evSigHashInput}
                      placeholder="64 lowercase hex characters"
                      onChange={(e) => setEvSigHashInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-ev-photo-hash-input" className="form-label">
                      Handover Photo Hash (Optional SHA-256)
                    </label>
                    <input
                      id="p11-ev-photo-hash-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={evPhotoHashInput}
                      placeholder="64 lowercase hex characters"
                      onChange={(e) => setEvPhotoHashInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-ev-signed-at-input" className="form-label">
                      Signature Timestamp (UTC)
                    </label>
                    <input
                      id="p11-ev-signed-at-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={evSignedAtInput}
                      placeholder="e.g. 2026-11-22T12:40:00Z"
                      onChange={(e) => setEvSignedAtInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-ev-snapshot-hash-input" className="form-label">
                      Linked Batch Snapshot Digest
                    </label>
                    <div className="p03-input-action-row">
                      <input
                        id="p11-ev-snapshot-hash-input"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={evSnapshotHashInput}
                        placeholder="Load or paste current batch snapshot digest"
                        onChange={(e) => setEvSnapshotHashInput(e.target.value)}
                      />
                      <button
                        type="button"
                        id="p11-load-current-hash-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleLoadCurrentHash}
                      >
                        Load Current Digest
                      </button>
                    </div>
                  </div>
                </div>

                <label
                  className={`p03-checkbox-row ${evAckInput ? 'is-checked' : ''}`}
                  htmlFor="p11-ev-ack-checkbox"
                >
                  <input
                    id="p11-ev-ack-checkbox"
                    type="checkbox"
                    className="p03-sr-checkbox"
                    checked={evAckInput}
                    onChange={(e) => {
                      playClickPen(soundEnabled);
                      setEvAckInput(e.target.checked);
                    }}
                  />
                  <span className="p03-checkbox-main">
                    <span className="p03-check-indicator" aria-hidden="true">
                      {evAckInput ? (
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span>Recipient signature and physical handover acknowledged</span>
                  </span>
                </label>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p11-bind-evidence-btn"
                    className="btn-batcave-secondary"
                    onClick={handleBindEvidence}
                  >
                    Bind Ready Issue Evidence
                  </button>
                  <button
                    type="button"
                    id="p11-post-batch-btn"
                    className="btn-batcave-primary"
                    onClick={handlePostBatch}
                  >
                    Post Signed Issue Batch
                  </button>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-batches-heading">
                <h2 id="p11-batches-heading" className="p03-section-title">
                  Prepared &amp; Posted Issue Batches
                </h2>
                {visibleBatches.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p11-empty-batches-notice">
                    No issue batches prepared yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p11-batches-list">
                    {visibleBatches.map((b) => (
                      <article key={b.batch_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            {b.isar_reference}
                          </span>
                          <span className="p03-version-pill">{BATCH_STATUS_LABELS[b.status]}</span>
                        </div>
                        <p className="p03-muted-copy">
                          RF {b.rf_reference} &middot; Qty {b.batch_quantity} &middot;{' '}
                          {b.recipient_name} ({b.recipient_capacity}) &middot; Material v
                          {b.material_version}
                        </p>
                        <p
                          className="p03-muted-copy p03-mono-inline"
                          data-testid={`p11-batch-hash-${b.batch_id}`}
                        >
                          Snapshot: {b.batch_snapshot_hash.slice(0, 16)}&hellip;
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Partial Fulfillment Closure */}
        {activeTab === 'closure' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-closure-heading">
                <h2 id="p11-closure-heading" className="p03-section-title">
                  Formally Close Remaining Unissued Demand
                </h2>
                <p className="p03-muted-copy">
                  Cancels unissued demand after partial deliveries and releases any unposted active
                  reservation while preserving all previously posted signed issue batches.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-cancel-rf-select" className="form-label">
                      Requisition Line to Close
                    </label>
                    <select
                      id="p11-cancel-rf-select"
                      className="form-control"
                      value={activeRf?.rf_id ?? ''}
                      onChange={(e) => setSelectedRfId(e.target.value)}
                    >
                      <option value="">Select Requisition Line</option>
                      {snapshot.approved_rfs.map((rf) => (
                        <option key={rf.rf_id} value={rf.rf_id}>
                          {rf.rf_reference} — Issued: {rf.issued_quantity} / Remaining:{' '}
                          {rf.remaining_demand_quantity} (v{rf.version})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-cancel-actor-input" className="form-label">
                      Closing Approver ID
                    </label>
                    <input
                      id="p11-cancel-actor-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={cancelActorInput}
                      placeholder="e.g. 201"
                      onChange={(e) => setCancelActorInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p11-cancel-reason-input" className="form-label">
                    Formal Remainder Cancellation Rationale
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p11-cancel-reason-input"
                      type="text"
                      className="form-control"
                      value={cancelReasonInput}
                      placeholder="Document why remaining unissued quantity is no longer required"
                      onChange={(e) => setCancelReasonInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p11-cancel-remainder-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleCancelRemainder}
                    >
                      Cancel Remaining Demand
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p11-closure-list-heading">
                <h2 id="p11-closure-list-heading" className="p03-section-title">
                  Fulfillment &amp; Cancellation Summary
                </h2>
                {visibleRfs.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p11-empty-closure-notice">
                    No requisition closure records yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p11-closure-list">
                    {visibleRfs.map((rf) => (
                      <article key={rf.rf_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">{rf.rf_reference}</span>
                          <span className="p03-version-pill">{RF_STATUS_LABELS[rf.status]}</span>
                        </div>
                        <p className="p03-muted-copy">
                          Requested: {rf.requested_quantity} &middot; Issued: {rf.issued_quantity}{' '}
                          &middot; Canceled: {rf.canceled_quantity} &middot; Remaining:{' '}
                          {rf.remaining_demand_quantity}
                        </p>
                        {rf.closure_reason ? (
                          <p className="p03-muted-copy">Closure note: {rf.closure_reason}</p>
                        ) : null}
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
              <section className="p03-card surface-card" aria-labelledby="p11-history-heading">
                <h2 id="p11-history-heading" className="p03-section-title">
                  Issuance Event Log
                </h2>
                {snapshot.history.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p11-empty-history-notice">
                    No issuance events recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p11-history-list">
                    {snapshot.history.map((h) => (
                      <article key={h.event_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <span className="p03-version-pill p03-mono-inline">
                            {h.batch_id ? `Batch #${h.batch_id}` : `RF #${h.rf_id}`}
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
              <section className="p03-card surface-card" aria-labelledby="p11-lookup-heading">
                <h2 id="p11-lookup-heading" className="p03-section-title">
                  Operation Status Recovery
                </h2>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p11-lookup-key-input" className="form-label">
                      Idempotency Key
                    </label>
                    <input
                      id="p11-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p11-lookup-ulid-input" className="form-label">
                      Operation ULID
                    </label>
                    <input
                      id="p11-lookup-ulid-input"
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
                    id="p11-lookup-key-btn"
                    className="btn-batcave-primary"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                  <button
                    type="button"
                    id="p11-lookup-ulid-btn"
                    className="btn-batcave-secondary"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Operation ID
                  </button>
                </div>
                {lookupResult ? (
                  <div
                    className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                    data-testid="p11-lookup-result"
                  >
                    <span className="p03-blocker-code">{lookupResult.code}</span>
                    <p className="p03-blocker-msg">{lookupResult.message}</p>
                  </div>
                ) : null}
                <div className="p03-ledger-chips" data-testid="p11-operation-ledger">
                  <span className="p03-eyebrow">Committed Issuance Operations</span>
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((e) => (
                      <button
                        key={e.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p11-ledger-fill-${e.operation_id}`}
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
