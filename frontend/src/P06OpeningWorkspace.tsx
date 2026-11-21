import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP06OpeningEngine } from './p06OpeningSlice';
import type {
  AcceptOpeningInput,
  AcceptedOpeningResult,
  OpeningConditionCode,
  OpeningEvidencePin,
  P06ActionResult,
  P06EngineSnapshot,
  UnacceptedOpeningResult,
} from './p06OpeningSlice';

type P06TabId = 'ipc' | 'inspection' | 'acceptance' | 'lookup';

interface P06OpeningWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const CONDITION_LABELS: Record<OpeningConditionCode, string> = {
  usable: 'Usable',
  quarantine: 'Quarantine',
  damaged: 'Damaged',
  rejected: 'Rejected',
  held: 'Held / Segregated',
};

function formatConditionLabel(code: OpeningConditionCode): string {
  return CONDITION_LABELS[code];
}

function buildConditionBadgeText(code: OpeningConditionCode): string {
  switch (code) {
    case 'usable':
      return 'Usable';
    case 'quarantine':
      return 'Quarantine';
    case 'damaged':
      return 'Damaged';
    case 'rejected':
      return 'Rejected';
    case 'held':
      return 'Held';
  }
}

interface FrostedCheckboxRowProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function FrostedCheckboxRow({
  id,
  label,
  checked,
  onChange,
}: FrostedCheckboxRowProps) {
  return (
    <label className={`p03-checkbox-row ${checked ? 'is-checked' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="p03-sr-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="p03-checkbox-main">
        <span className="p03-check-indicator" aria-hidden="true">
          {checked ? (
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
        </span>
        <span>{label}</span>
      </span>
    </label>
  );
}

export function P06OpeningWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P06OpeningWorkspaceProps) {
  const engine = useMemo(() => createP06OpeningEngine(), []);
  const [snapshot, setSnapshot] = useState<P06EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P06TabId>('ipc');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P06ActionResult | null>(snapshot.last_action);

  // Tab 1: Counters & IPC lines (strictly empty by default)
  const [counterUserIdInput, setCounterUserIdInput] = useState('');
  const [counterNameInput, setCounterNameInput] = useState('');
  const [counterCustodianInput, setCounterCustodianInput] = useState(false);

  const [ipcLineIdInput, setIpcLineIdInput] = useState('');
  const [ipcVariantIdInput, setIpcVariantIdInput] = useState('');
  const [ipcSkuInput, setIpcSkuInput] = useState('');
  const [ipcItemNameInput, setIpcItemNameInput] = useState('');
  const [ipcLocationIdInput, setIpcLocationIdInput] = useState('');
  const [ipcCustodyIdInput, setIpcCustodyIdInput] = useState('');
  const [ipcConditionInput, setIpcConditionInput] = useState<'' | OpeningConditionCode>('');
  const [ipcQtyInput, setIpcQtyInput] = useState('');
  const [ipcScaleInput, setIpcScaleInput] = useState('');
  const [ipcValuationInput, setIpcValuationInput] = useState('');
  const [ipcValuationBasisInput, setIpcValuationBasisInput] = useState('');
  const [ipcRestrictionIdInput, setIpcRestrictionIdInput] = useState('');

  const [ipcRecordIdInput, setIpcRecordIdInput] = useState('');
  const [ipcCutoffAtInput, setIpcCutoffAtInput] = useState('');
  const [ipcCountedAtInput, setIpcCountedAtInput] = useState('');
  const [ipcPurposeInput, setIpcPurposeInput] = useState('');
  const [ipcPolicyIdInput, setIpcPolicyIdInput] = useState('');
  const [ipcHeadApprovedInput, setIpcHeadApprovedInput] = useState(false);
  const [ipcFinanceApprovedInput, setIpcFinanceApprovedInput] = useState(false);
  const [ipcSheetHashInput, setIpcSheetHashInput] = useState('');

  // Tab 2: Receiving inspection lines & receipt publication (strictly empty by default)
  const [rmSourceLineIdInput, setRmSourceLineIdInput] = useState('');
  const [rmLineIdInput, setRmLineIdInput] = useState('');
  const [rmDeliveredInput, setRmDeliveredInput] = useState('');
  const [rmAcceptedInput, setRmAcceptedInput] = useState('');
  const [rmRejectedInput, setRmRejectedInput] = useState('');
  const [rmHeldInput, setRmHeldInput] = useState('');
  const [rmMissingInput, setRmMissingInput] = useState('');
  const [rmNonusableInput, setRmNonusableInput] = useState('');
  const [rmConditionInput, setRmConditionInput] = useState<'' | OpeningConditionCode>('');
  const [rmNotesInput, setRmNotesInput] = useState('');

  const [rmRecordIdInput, setRmRecordIdInput] = useState('');
  const [rmInspectionAtInput, setRmInspectionAtInput] = useState('');
  const [rmInspectionHashInput, setRmInspectionHashInput] = useState('');
  const [rmDiscrepancyHashInput, setRmDiscrepancyHashInput] = useState('');

  // Tab 3: Acceptance & Replay (strictly empty by default)
  const [acceptKeyInput, setAcceptKeyInput] = useState('');
  const [acceptRmRowVerInput, setAcceptRmRowVerInput] = useState('');
  const [acceptRmMatVerInput, setAcceptRmMatVerInput] = useState('');
  const [acceptIpcRowVerInput, setAcceptIpcRowVerInput] = useState('');
  const [lastSubmittedAcceptInput, setLastSubmittedAcceptInput] = useState<AcceptOpeningInput | null>(
    null
  );

  // Tab 4: Durable Lookup (strictly empty by default)
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<
    P06ActionResult<AcceptedOpeningResult | UnacceptedOpeningResult> | null
  >(null);

  function refreshSnapshot<T>(res: P06ActionResult<T>): P06ActionResult<T> {
    const next = engine.getSnapshot();
    setSnapshot(next);
    setLastResult(res);
    return res;
  }

  function handleAddCounter() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.addCounter({
        user_id: counterUserIdInput,
        display_name: counterNameInput.trim() || undefined,
        is_regular_custodian: counterCustodianInput,
      })
    );
    if (res.ok) {
      setCounterUserIdInput('');
      setCounterNameInput('');
      setCounterCustodianInput(false);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAddIpcLine() {
    playClickPen(soundEnabled);
    if (ipcConditionInput === '' || ipcScaleInput === '') {
      const msg =
        ipcConditionInput === ''
          ? 'Please select an item condition for the count line.'
          : 'Please select a precision scale (0–6) for the count line.';
      const err: P06ActionResult = {
        ok: false,
        http_status: 422,
        code: 'IPC_LINE_FIELDS_REQUIRED',
        message: msg,
      };
      setLastResult(err);
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.addIpcLine({
        line_id: ipcLineIdInput.trim() || undefined,
        variant_id: ipcVariantIdInput,
        variant_sku: ipcSkuInput.trim() || undefined,
        item_name: ipcItemNameInput.trim() || undefined,
        location_id: ipcLocationIdInput,
        custody_assignment_id: ipcCustodyIdInput,
        condition_code: ipcConditionInput,
        counted_quantity_value: ipcQtyInput,
        quantity_scale: Number(ipcScaleInput),
        unit_valuation: ipcValuationInput,
        valuation_basis: ipcValuationBasisInput,
        restriction_version_id: ipcRestrictionIdInput,
      })
    );
    if (res.ok) {
      setIpcLineIdInput('');
      setIpcQtyInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePublishIpc() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.publishAndApproveIpc({
        ipc_record_id: ipcRecordIdInput.trim() || undefined,
        cutoff_at: ipcCutoffAtInput,
        counted_at: ipcCountedAtInput,
        purpose: ipcPurposeInput,
        policy_version_id: ipcPolicyIdInput,
        head_approved: ipcHeadApprovedInput,
        finance_approved: ipcFinanceApprovedInput,
        signed_sheet_hash: ipcSheetHashInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      const updated = engine.getSnapshot();
      if (updated.ipc_state) {
        setAcceptIpcRowVerInput(String(updated.ipc_state.row_version));
      }
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSaveRmLine() {
    playClickPen(soundEnabled);
    if (rmSourceLineIdInput === '' || rmConditionInput === '') {
      const msg =
        rmSourceLineIdInput === ''
          ? 'Select a source physical count line before saving inspection results.'
          : 'Select an inspected condition before saving inspection results.';
      const err: P06ActionResult = {
        ok: false,
        http_status: 422,
        code: 'INSPECTION_SELECTION_REQUIRED',
        message: msg,
      };
      setLastResult(err);
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.saveInspectionLine({
        rm_line_id: rmLineIdInput.trim() || undefined,
        source_line_id: rmSourceLineIdInput,
        delivered_value: rmDeliveredInput,
        accepted_value: rmAcceptedInput,
        rejected_value: rmRejectedInput,
        held_value: rmHeldInput,
        missing_value: rmMissingInput,
        nonusable_recorded_value: rmNonusableInput,
        condition_code: rmConditionInput,
        condition_notes: rmNotesInput,
      })
    );
    if (res.ok) {
      setRmLineIdInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePublishRm() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.publishInspectionReceipt({
        rm_record_id: rmRecordIdInput.trim() || undefined,
        inspection_at: rmInspectionAtInput,
        inspection_evidence_hash: rmInspectionHashInput,
        discrepancy_evidence_hash: rmDiscrepancyHashInput.trim() || undefined,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      const updated = engine.getSnapshot();
      if (updated.rm_state) {
        setAcceptRmRowVerInput(String(updated.rm_state.row_version));
        setAcceptRmMatVerInput(String(updated.rm_state.material_version));
      }
      if (updated.ipc_state) {
        setAcceptIpcRowVerInput(String(updated.ipc_state.row_version));
      }
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function buildAcceptPayload(overrideKey?: string): AcceptOpeningInput | null {
    const snap = engine.getSnapshot();
    if (!snap.rm_target || !snap.rm_state || !snap.ipc_target || !snap.ipc_state) {
      return null;
    }
    const key =
      overrideKey?.trim() ||
      acceptKeyInput.trim() ||
      `p06-accept-seq-${snap.operation_ledger.length + 1}`;
    const rmRowVer = Number(acceptRmRowVerInput.trim() || snap.rm_state.row_version);
    const rmMatVer = Number(acceptRmMatVerInput.trim() || snap.rm_state.material_version);
    const ipcRowVer = Number(acceptIpcRowVerInput.trim() || snap.ipc_state.row_version);

    const evidencePins: OpeningEvidencePin[] = snap.evidence_bindings.map((binding) => ({
      binding_id: binding.binding_id,
      target: binding.target,
      line: binding.line,
      evidence: binding.evidence,
      purpose_code: binding.purpose_code,
    }));

    return {
      context: {
        chapter_id: snap.chapter_id,
        action_code: 'purchasing.accept_opening_rm',
        idempotency_key: key,
        record: { id: snap.rm_state.reference.id, kind: 'RM' },
        expected_row_version: Number.isFinite(rmRowVer) ? rmRowVer : snap.rm_state.row_version,
        expected_material_version: Number.isFinite(rmMatVer)
          ? rmMatVer
          : snap.rm_state.material_version,
      },
      receipt: snap.rm_target,
      source: {
        source_kind: 'opening',
        target: snap.ipc_target,
        expected_row_version: Number.isFinite(ipcRowVer) ? ipcRowVer : snap.ipc_state.row_version,
      },
      evidence: evidencePins,
    };
  }

  function handleCommitBaseline() {
    playClickPen(soundEnabled);
    const payload = buildAcceptPayload();
    if (!payload) {
      const err: P06ActionResult = {
        ok: false,
        http_status: 409,
        code: 'INVALID_OPENING_SOURCE',
        message: 'Publish and approve both Opening Physical Count and Receiving Inspection first.',
      };
      setLastResult(err);
      onNotify('error', err.message);
      return;
    }

    setLastSubmittedAcceptInput(structuredClone(payload));
    if (!acceptKeyInput.trim()) {
      setAcceptKeyInput(payload.context.idempotency_key);
    }
    const res = refreshSnapshot(engine.acceptOpeningRm(payload));
    if (res.ok) {
      playScribblenauts(soundEnabled);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReplaySameKey() {
    playClickPen(soundEnabled);
    if (!lastSubmittedAcceptInput) {
      const err: P06ActionResult = {
        ok: false,
        http_status: 409,
        code: 'NO_PRIOR_ATTEMPT',
        message: 'Commit an opening acceptance request first before replaying the same key.',
      };
      setLastResult(err);
      onNotify('error', err.message);
      return;
    }

    const res = refreshSnapshot(engine.acceptOpeningRm(lastSubmittedAcceptInput));
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSimulateDuplicateBaseline() {
    playClickPen(soundEnabled);
    const freshKey = `p06-dup-seq-${snapshot.operation_ledger.length + 1}`;
    const payload = buildAcceptPayload(freshKey);
    if (!payload) {
      const err: P06ActionResult = {
        ok: false,
        http_status: 409,
        code: 'INVALID_OPENING_SOURCE',
        message: 'No approved count and inspection records available to attempt duplicate acceptance.',
      };
      setLastResult(err);
      onNotify('error', err.message);
      return;
    }

    const res = refreshSnapshot(engine.acceptOpeningRm(payload));
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupOpeningOperation({
        query_type: 'by_key',
        chapter_id: snapshot.chapter_id,
        action_code: 'purchasing.accept_opening_rm',
        idempotency_key: lookupKeyInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByUlid() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupOpeningOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredIpcLines = normalizedSearch
    ? snapshot.ipc_lines.filter(
        (line) =>
          line.reference.line_id.toLowerCase().includes(normalizedSearch) ||
          (line.variant_sku ?? '').toLowerCase().includes(normalizedSearch) ||
          (line.item_name ?? '').toLowerCase().includes(normalizedSearch) ||
          line.condition_code.toLowerCase().includes(normalizedSearch)
      )
    : snapshot.ipc_lines;

  const filteredRmLines = normalizedSearch
    ? snapshot.rm_lines.filter(
        (line) =>
          line.reference.line_id.toLowerCase().includes(normalizedSearch) ||
          line.condition_code.toLowerCase().includes(normalizedSearch) ||
          line.condition_notes.toLowerCase().includes(normalizedSearch)
      )
    : snapshot.rm_lines;

  const hasCustodian = snapshot.counters.some((c) => c.is_regular_custodian);
  const hasIndependent = snapshot.counters.some((c) => !c.is_regular_custodian);
  const independentPairReady = snapshot.counters.length >= 2 && hasCustodian && hasIndependent;
  const ipcApprovedReady =
    snapshot.ipc_state !== null &&
    snapshot.ipc_state.states.approval === 'approved' &&
    snapshot.ipc_head_approved &&
    snapshot.ipc_finance_approved;
  const rmPublishedReady =
    snapshot.rm_state !== null &&
    snapshot.rm_target !== null &&
    snapshot.rm_lines.length > 0 &&
    snapshot.rm_lines.length === snapshot.ipc_lines.length;
  const evidenceReadyCount = snapshot.evidence_bindings.filter((b) => b.ready).length;

  return (
    <main className="p03-workspace-shell" data-testid="p06-workspace">
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
                id="p06-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search count lines, SKUs, condition, or inspection notes"
                aria-label="Search opening physical count and inspection lines"
              />
            </div>

            {normalizedSearch ? (
              <div className="p03-search-meta">
                <span className="p03-version-pill">
                  {filteredIpcLines.length + filteredRmLines.length} match
                  {filteredIpcLines.length + filteredRmLines.length === 1 ? '' : 'es'}
                </span>
                <button
                  type="button"
                  id="p06-search-clear-btn"
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
              <h1 className="p03-main-title">Opening Physical Count &amp; Baseline Acceptance</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Opening inventory acceptance stages"
              >
                <button
                  type="button"
                  role="tab"
                  id="p06-tab-ipc"
                  aria-selected={activeTab === 'ipc'}
                  className={`p03-filter-pill ${activeTab === 'ipc' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('ipc');
                  }}
                >
                  Opening Physical Count
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p06-tab-inspection"
                  aria-selected={activeTab === 'inspection'}
                  className={`p03-filter-pill ${activeTab === 'inspection' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('inspection');
                  }}
                >
                  Receiving Inspection &amp; Split
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p06-tab-acceptance"
                  aria-selected={activeTab === 'acceptance'}
                  className={`p03-filter-pill ${activeTab === 'acceptance' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('acceptance');
                  }}
                >
                  Opening Baseline Acceptance
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p06-tab-lookup"
                  aria-selected={activeTab === 'lookup'}
                  className={`p03-filter-pill ${activeTab === 'lookup' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('lookup');
                  }}
                >
                  Operation Status Recovery
                </button>
              </div>

              <button
                type="button"
                id="p06-back-dashboard-btn"
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

        {/* Live Stock Projection & Gate Overview Strip */}
        <section className="p03-card surface-card" aria-labelledby="p06-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p06-overview-heading" className="p03-section-title">
              Opening Cutover Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p06-baseline-lock-pill">
                Baseline Status:{' '}
                <strong>{snapshot.baseline_locked ? `Locked (#${snapshot.baseline_id})` : 'Unlocked'}</strong>
              </span>
              <span className="p03-version-pill">
                Counters: <strong>{snapshot.counters.length}</strong>
              </span>
              <span className="p03-version-pill">
                Count Lines: <strong>{snapshot.ipc_lines.length}</strong>
              </span>
              <span className="p03-version-pill">
                Inspected Lines: <strong>{snapshot.rm_lines.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p06-usable-on-hand-val">
                {snapshot.stock_projection.usable_stockroom_on_hand}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val">
                {snapshot.stock_projection.available_to_allocate}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Quarantined / Non-Usable</span>
              <span className="p03-axis-val" data-testid="p06-quarantined-val">
                {snapshot.stock_projection.quarantined_rejected}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Open Discrepancies</span>
              <span className="p03-axis-val">
                {snapshot.discrepancy_ids.length} ({snapshot.stock_projection.open_discrepancy_units} units)
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p06-feedback-banner"
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

        {/* TAB 1: Opening Physical Count (Counters, Lines, Publish & Approve) */}
        {activeTab === 'ipc' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-counters-heading">
                <h2 id="p06-counters-heading" className="p03-section-title">
                  Independent Physical Counters
                </h2>
                <p className="p03-muted-copy">
                  Opening counts require at least two participating members, including one verifier
                  independent of regular chapter custody.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-counter-user-id" className="form-label">
                      Counter Member ID
                    </label>
                    <input
                      id="p06-counter-user-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={counterUserIdInput}
                      placeholder="e.g. 11"
                      onChange={(e) => setCounterUserIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-counter-name" className="form-label">
                      Display Name
                    </label>
                    <input
                      id="p06-counter-name"
                      type="text"
                      className="form-control"
                      value={counterNameInput}
                      placeholder="e.g. Officer Eleven"
                      onChange={(e) => setCounterNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-input-action-row">
                  <FrostedCheckboxRow
                    id="p06-counter-custodian-checkbox"
                    label="Assigned as Regular Stockroom Custodian"
                    checked={counterCustodianInput}
                    onChange={(nextChecked) => {
                      playClickPen(soundEnabled);
                      setCounterCustodianInput(nextChecked);
                    }}
                  />
                  <button
                    type="button"
                    id="p06-add-counter-btn"
                    className="btn-batcave-primary p03-shrink-btn"
                    onClick={handleAddCounter}
                  >
                    Add Participating Counter
                  </button>
                </div>

                {snapshot.counters.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p06-empty-counters-notice">
                    No physical counters recorded yet.
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p06-counters-list">
                    {snapshot.counters.map((counter) => (
                      <article key={counter.user_id} className="p03-history-card">
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <span className="p03-version-pill p03-mono-inline">
                              Member #{counter.user_id}
                            </span>
                            <strong>{counter.display_name ?? `Member ${counter.user_id}`}</strong>
                          </div>
                          <span className="p03-version-pill">
                            {counter.is_regular_custodian
                              ? 'Regular Custodian'
                              : 'Independent Verifier'}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="p03-card surface-card" aria-labelledby="p06-ipc-publish-heading">
                <h2 id="p06-ipc-publish-heading" className="p03-section-title">
                  Sign-Off &amp; Approve Opening Count Sheet
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-record-id" className="form-label">
                      Count Sheet Reference ID (Optional)
                    </label>
                    <input
                      id="p06-ipc-record-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcRecordIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setIpcRecordIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-policy-id" className="form-label">
                      Policy Version Reference
                    </label>
                    <input
                      id="p06-ipc-policy-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcPolicyIdInput}
                      placeholder="e.g. 42"
                      onChange={(e) => setIpcPolicyIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-cutoff-at" className="form-label">
                      Inventory Cutoff Instant (UTC)
                    </label>
                    <input
                      id="p06-ipc-cutoff-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcCutoffAtInput}
                      placeholder="e.g. 2026-10-23T23:00:00.000000Z"
                      onChange={(e) => setIpcCutoffAtInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-counted-at" className="form-label">
                      Physical Count Timestamp (UTC)
                    </label>
                    <input
                      id="p06-ipc-counted-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcCountedAtInput}
                      placeholder="e.g. 2026-10-24T06:00:00.000000Z"
                      onChange={(e) => setIpcCountedAtInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p06-ipc-purpose" className="form-label">
                    Count Purpose &amp; Scope
                  </label>
                  <input
                    id="p06-ipc-purpose"
                    type="text"
                    className="form-control"
                    value={ipcPurposeInput}
                    placeholder="e.g. Initial chapter stockroom baseline opening count"
                    onChange={(e) => setIpcPurposeInput(e.target.value)}
                  />
                </div>

                <div className="p03-two-col">
                  <FrostedCheckboxRow
                    id="p06-ipc-head-approved"
                    label="Chapter Head Approval Granted"
                    checked={ipcHeadApprovedInput}
                    onChange={(nextChecked) => {
                      playClickPen(soundEnabled);
                      setIpcHeadApprovedInput(nextChecked);
                    }}
                  />
                  <FrostedCheckboxRow
                    id="p06-ipc-finance-approved"
                    label="Finance Officer Approval Granted"
                    checked={ipcFinanceApprovedInput}
                    onChange={(nextChecked) => {
                      playClickPen(soundEnabled);
                      setIpcFinanceApprovedInput(nextChecked);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p06-ipc-sheet-hash" className="form-label">
                    Signed Count Sheet Digest (SHA-256 Hex)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p06-ipc-sheet-hash"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcSheetHashInput}
                      placeholder="64-character lowercase SHA-256 digest"
                      onChange={(e) => setIpcSheetHashInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p06-publish-ipc-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handlePublishIpc}
                    >
                      Publish &amp; Approve Opening Count
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-add-line-heading">
                <h2 id="p06-add-line-heading" className="p03-section-title">
                  Add Physical Count Line Item
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-line-id" className="form-label">
                      Line Reference ID (Optional)
                    </label>
                    <input
                      id="p06-ipc-line-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcLineIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setIpcLineIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-variant-id" className="form-label">
                      Catalog Variant ID
                    </label>
                    <input
                      id="p06-ipc-variant-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcVariantIdInput}
                      placeholder="e.g. 71"
                      onChange={(e) => setIpcVariantIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-sku" className="form-label">
                      Item SKU (Optional)
                    </label>
                    <input
                      id="p06-ipc-sku"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcSkuInput}
                      placeholder="e.g. TENT-4P"
                      onChange={(e) => setIpcSkuInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-item-name" className="form-label">
                      Item Name (Optional)
                    </label>
                    <input
                      id="p06-ipc-item-name"
                      type="text"
                      className="form-control"
                      value={ipcItemNameInput}
                      placeholder="e.g. Four-Person Field Tent"
                      onChange={(e) => setIpcItemNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-location-id" className="form-label">
                      Storage Location ID
                    </label>
                    <input
                      id="p06-ipc-location-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcLocationIdInput}
                      placeholder="e.g. 81"
                      onChange={(e) => setIpcLocationIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-custody-id" className="form-label">
                      Custody Assignment ID
                    </label>
                    <input
                      id="p06-ipc-custody-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcCustodyIdInput}
                      placeholder="e.g. 82"
                      onChange={(e) => setIpcCustodyIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-condition" className="form-label">
                      Counted Condition
                    </label>
                    <select
                      id="p06-ipc-condition"
                      className="form-control"
                      value={ipcConditionInput}
                      onChange={(e) =>
                        setIpcConditionInput(e.target.value as '' | OpeningConditionCode)
                      }
                    >
                      <option value="">Select item condition</option>
                      <option value="usable">Usable</option>
                      <option value="quarantine">Quarantine</option>
                      <option value="damaged">Damaged</option>
                      <option value="rejected">Rejected</option>
                      <option value="held">Held / Segregated</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-scale" className="form-label">
                      Decimal Precision Scale
                    </label>
                    <select
                      id="p06-ipc-scale"
                      className="form-control"
                      value={ipcScaleInput}
                      onChange={(e) => setIpcScaleInput(e.target.value)}
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
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-ipc-qty" className="form-label">
                      Counted Quantity
                    </label>
                    <input
                      id="p06-ipc-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcQtyInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setIpcQtyInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-ipc-valuation" className="form-label">
                      Approved Unit Valuation
                    </label>
                    <input
                      id="p06-ipc-valuation"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcValuationInput}
                      placeholder="e.g. 25"
                      onChange={(e) => setIpcValuationInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p06-ipc-valuation-basis" className="form-label">
                    Valuation Basis
                  </label>
                  <input
                    id="p06-ipc-valuation-basis"
                    type="text"
                    className="form-control"
                    value={ipcValuationBasisInput}
                    placeholder="e.g. Approved baseline schedule"
                    onChange={(e) => setIpcValuationBasisInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p06-ipc-restriction-id" className="form-label">
                    Restriction Version ID
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p06-ipc-restriction-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={ipcRestrictionIdInput}
                      placeholder="e.g. 83"
                      onChange={(e) => setIpcRestrictionIdInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p06-add-ipc-line-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleAddIpcLine}
                    >
                      Add Physical Count Line
                    </button>
                  </div>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p06-ipc-lines-heading">
                <div className="p03-card-header-row">
                  <h2 id="p06-ipc-lines-heading" className="p03-section-title">
                    Recorded Count Lines
                  </h2>
                  {snapshot.ipc_target ? (
                    <span className="p03-version-pill p03-mono-inline">
                      Snapshot #{snapshot.ipc_target.record.id} v{snapshot.ipc_target.material_version}
                    </span>
                  ) : null}
                </div>

                {filteredIpcLines.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p06-empty-ipc-lines-notice">
                    No physical count lines recorded yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p06-ipc-lines-table">
                      <thead>
                        <tr>
                          <th>Line ID</th>
                          <th>Variant / Item</th>
                          <th>Location</th>
                          <th>Condition</th>
                          <th>Quantity</th>
                          <th>Valuation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredIpcLines.map((line) => (
                          <tr key={line.reference.line_id}>
                            <td className="p03-mono-inline">#{line.reference.line_id}</td>
                            <td>
                              {line.variant_sku ? `${line.variant_sku} · ` : ''}
                              {line.item_name ?? `Variant #${line.reference.variant_id}`}
                            </td>
                            <td className="p03-mono-inline">{line.location_id}</td>
                            <td>{buildConditionBadgeText(line.condition_code)}</td>
                            <td className="p03-mono-inline">{line.counted_quantity.value}</td>
                            <td className="p03-mono-inline">{line.unit_valuation}</td>
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

        {/* TAB 2: Receiving Inspection & Condition Split */}
        {activeTab === 'inspection' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-rm-line-heading">
                <h2 id="p06-rm-line-heading" className="p03-section-title">
                  Inspect Source Count Line &amp; Record Outcome Split
                </h2>
                <p className="p03-muted-copy">
                  Reconcile counted quantities into accepted usable stock, quarantined damaged/held
                  items, or missing shortages. Damaged items must set accepted usable stock to zero.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-rm-source-line-select" className="form-label">
                      Source Count Line
                    </label>
                    <select
                      id="p06-rm-source-line-select"
                      className="form-control"
                      value={rmSourceLineIdInput}
                      onChange={(e) => setRmSourceLineIdInput(e.target.value)}
                    >
                      <option value="">Select source count line</option>
                      {snapshot.ipc_lines.map((line) => (
                        <option key={line.reference.line_id} value={line.reference.line_id}>
                          Line #{line.reference.line_id} —{' '}
                          {line.item_name ?? `Variant #${line.reference.variant_id}`} (
                          {buildConditionBadgeText(line.condition_code)}, qty {line.counted_quantity.value})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-rm-line-id" className="form-label">
                      Inspection Line ID (Optional)
                    </label>
                    <input
                      id="p06-rm-line-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmLineIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setRmLineIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-rm-delivered-qty" className="form-label">
                      Delivered Quantity
                    </label>
                    <input
                      id="p06-rm-delivered-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmDeliveredInput}
                      placeholder="e.g. 10"
                      onChange={(e) => setRmDeliveredInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-rm-accepted-qty" className="form-label">
                      Accepted Usable Quantity
                    </label>
                    <input
                      id="p06-rm-accepted-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmAcceptedInput}
                      placeholder="e.g. 10 (or 0 for damaged)"
                      onChange={(e) => setRmAcceptedInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-rm-rejected-qty" className="form-label">
                      Rejected / Damaged Quantity
                    </label>
                    <input
                      id="p06-rm-rejected-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmRejectedInput}
                      placeholder="e.g. 0"
                      onChange={(e) => setRmRejectedInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-rm-held-qty" className="form-label">
                      Held Quantity
                    </label>
                    <input
                      id="p06-rm-held-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmHeldInput}
                      placeholder="e.g. 0"
                      onChange={(e) => setRmHeldInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-rm-missing-qty" className="form-label">
                      Missing Quantity
                    </label>
                    <input
                      id="p06-rm-missing-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmMissingInput}
                      placeholder="e.g. 0"
                      onChange={(e) => setRmMissingInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-rm-nonusable-qty" className="form-label">
                      Non-Usable Recorded Quantity
                    </label>
                    <input
                      id="p06-rm-nonusable-qty"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmNonusableInput}
                      placeholder="e.g. 0 (or 2 for damaged)"
                      onChange={(e) => setRmNonusableInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p06-rm-condition" className="form-label">
                    Inspected Condition Classification
                  </label>
                  <select
                    id="p06-rm-condition"
                    className="form-control"
                    value={rmConditionInput}
                    onChange={(e) =>
                      setRmConditionInput(e.target.value as '' | OpeningConditionCode)
                    }
                  >
                    <option value="">Select inspected condition</option>
                    <option value="usable">Usable</option>
                    <option value="quarantine">Quarantine</option>
                    <option value="damaged">Damaged</option>
                    <option value="rejected">Rejected</option>
                    <option value="held">Held / Segregated</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="p06-rm-notes" className="form-label">
                    Condition &amp; Inspection Notes
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p06-rm-notes"
                      type="text"
                      className="form-control"
                      value={rmNotesInput}
                      placeholder="Document packaging integrity, segregation, or discrepancy findings"
                      onChange={(e) => setRmNotesInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p06-save-rm-line-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleSaveRmLine}
                    >
                      Save Line Inspection Result
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-rm-publish-heading">
                <h2 id="p06-rm-publish-heading" className="p03-section-title">
                  Publish Receiving Inspection &amp; Evidence Pins
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p06-rm-record-id" className="form-label">
                      Receiving Receipt ID (Optional)
                    </label>
                    <input
                      id="p06-rm-record-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmRecordIdInput}
                      placeholder="Auto-assigned if blank"
                      onChange={(e) => setRmRecordIdInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-rm-inspection-at" className="form-label">
                      Inspection Completion Timestamp (UTC)
                    </label>
                    <input
                      id="p06-rm-inspection-at"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmInspectionAtInput}
                      placeholder="e.g. 2026-10-24T06:30:00.000000Z"
                      onChange={(e) => setRmInspectionAtInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p06-rm-inspection-hash" className="form-label">
                    Inspection Report Evidence Digest (SHA-256 Hex)
                  </label>
                  <input
                    id="p06-rm-inspection-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={rmInspectionHashInput}
                    placeholder="64-character lowercase SHA-256 digest"
                    onChange={(e) => setRmInspectionHashInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p06-rm-discrepancy-hash" className="form-label">
                    Discrepancy / Damage Photograph Digest (Required When Non-Usable &gt; 0)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p06-rm-discrepancy-hash"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={rmDiscrepancyHashInput}
                      placeholder="64-character lowercase SHA-256 digest"
                      onChange={(e) => setRmDiscrepancyHashInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p06-publish-rm-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handlePublishRm}
                    >
                      Publish Receiving Inspection
                    </button>
                  </div>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p06-rm-lines-heading">
                <div className="p03-card-header-row">
                  <h2 id="p06-rm-lines-heading" className="p03-section-title">
                    Inspected Receiving Lines
                  </h2>
                  {snapshot.rm_target ? (
                    <span className="p03-version-pill p03-mono-inline">
                      Receipt #{snapshot.rm_target.record.id} v{snapshot.rm_target.material_version}
                    </span>
                  ) : null}
                </div>

                {filteredRmLines.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p06-empty-rm-lines-notice">
                    No receiving inspection lines saved yet.
                  </p>
                ) : (
                  <div className="p05-table-wrap">
                    <table className="p05-cells-table" data-testid="p06-rm-lines-table">
                      <thead>
                        <tr>
                          <th>Inspection Line</th>
                          <th>Source</th>
                          <th>Delivered</th>
                          <th>Accepted Usable</th>
                          <th>Non-Usable</th>
                          <th>Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRmLines.map((line) => (
                          <tr key={line.reference.line_id}>
                            <td className="p03-mono-inline">#{line.reference.line_id}</td>
                            <td className="p03-mono-inline">#{line.source_line.line_id}</td>
                            <td className="p03-mono-inline">{line.delivered_quantity.value}</td>
                            <td className="p03-mono-inline">{line.accepted_quantity.value}</td>
                            <td className="p03-mono-inline">
                              {line.nonusable_recorded_quantity.value}
                            </td>
                            <td>{formatConditionLabel(line.condition_code)}</td>
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

        {/* TAB 3: Atomic Opening Baseline Acceptance & Once-Only Fence */}
        {activeTab === 'acceptance' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-gate1-heading">
                <h2 id="p06-gate1-heading" className="p03-section-title">
                  Opening Baseline Readiness Checklist
                </h2>
                <div className="p03-history-list" data-testid="p06-gate1-checklist">
                  <div className="p03-history-card">
                    <div className="p03-history-head">
                      <strong>Independent Counter Pair</strong>
                      <span className="p03-version-pill">
                        {independentPairReady ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="p03-history-card">
                    <div className="p03-history-head">
                      <strong>Chapter Head &amp; Finance Approvals</strong>
                      <span className="p03-version-pill">
                        {ipcApprovedReady ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="p03-history-card">
                    <div className="p03-history-head">
                      <strong>Receiving Inspection Coverage</strong>
                      <span className="p03-version-pill">
                        {rmPublishedReady ? 'Complete' : 'Incomplete'}
                      </span>
                    </div>
                  </div>
                  <div className="p03-history-card">
                    <div className="p03-history-head">
                      <strong>Ready Evidence Attachments</strong>
                      <span className="p03-version-pill">{evidenceReadyCount} ready</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p06-commit-heading">
                <h2 id="p06-commit-heading" className="p03-section-title">
                  Commit Locked Opening Baseline
                </h2>
                <p className="p03-muted-copy">
                  Atomically posts accepted usable lots to on-hand inventory, segregates non-usable
                  items into quarantine, opens any discrepancy cases, and permanently locks this
                  chapter&apos;s opening cutover baseline.
                </p>

                <div className="form-group">
                  <label htmlFor="p06-accept-idempotency-key" className="form-label">
                    Idempotency Key (Auto-generated sequentially if left blank)
                  </label>
                  <input
                    id="p06-accept-idempotency-key"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={acceptKeyInput}
                    placeholder="Leave blank to assign sequential request key"
                    onChange={(e) => setAcceptKeyInput(e.target.value)}
                  />
                </div>

                <div className="p03-axes-bar">
                  <div className="form-group">
                    <label htmlFor="p06-accept-rm-row-ver" className="form-label">
                      Receipt Row Version
                    </label>
                    <input
                      id="p06-accept-rm-row-ver"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={acceptRmRowVerInput}
                      placeholder={snapshot.rm_state ? String(snapshot.rm_state.row_version) : '—'}
                      onChange={(e) => setAcceptRmRowVerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-accept-rm-mat-ver" className="form-label">
                      Receipt Material Version
                    </label>
                    <input
                      id="p06-accept-rm-mat-ver"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={acceptRmMatVerInput}
                      placeholder={
                        snapshot.rm_state ? String(snapshot.rm_state.material_version) : '—'
                      }
                      onChange={(e) => setAcceptRmMatVerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p06-accept-ipc-row-ver" className="form-label">
                      Count Source Row Version
                    </label>
                    <input
                      id="p06-accept-ipc-row-ver"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={acceptIpcRowVerInput}
                      placeholder={snapshot.ipc_state ? String(snapshot.ipc_state.row_version) : '—'}
                      onChange={(e) => setAcceptIpcRowVerInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p06-commit-baseline-btn"
                    className="btn-batcave-primary"
                    onClick={handleCommitBaseline}
                  >
                    Commit Opening Baseline
                  </button>
                  <button
                    type="button"
                    id="p06-replay-same-key-btn"
                    className="btn-batcave-secondary"
                    onClick={handleReplaySameKey}
                  >
                    Replay Same Request Key
                  </button>
                </div>

                <div className="p03-guard-strip">
                  <span className="p03-muted-copy">
                    Verify the once-only chapter baseline guard after commitment by attempting a
                    second acceptance with a new key.
                  </span>
                  <div>
                    <button
                      type="button"
                      id="p06-simulate-duplicate-baseline-btn"
                      className="btn-batcave-secondary"
                      onClick={handleSimulateDuplicateBaseline}
                    >
                      Attempt Second Opening Acceptance (New Key)
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p06-summary-result-heading">
                <h2 id="p06-summary-result-heading" className="p03-section-title">
                  Committed Baseline &amp; Stock Postings
                </h2>

                {!snapshot.accepted_result ? (
                  <p className="p03-muted-copy" data-testid="p06-uncommitted-notice">
                    No stock lots posted yet. Publishing counts and inspections computes material
                    hashes without modifying on-hand inventory balances until baseline acceptance.
                  </p>
                ) : (
                  <div className="p02-column-stack" data-testid="p06-accepted-summary">
                    <div className="p03-version-badges">
                      <span className="p03-version-pill p03-mono-inline">
                        Baseline #{snapshot.accepted_result.data.baseline_id}
                      </span>
                      <span className="p03-version-pill p03-mono-inline">
                        Cutover #{snapshot.accepted_result.data.cutover.id}
                      </span>
                      <span className="p03-version-pill p03-mono-inline">
                        Discrepancies:{' '}
                        {snapshot.accepted_result.data.discrepancy_ids.length === 0
                          ? 'None'
                          : snapshot.accepted_result.data.discrepancy_ids
                              .map((id) => `#${id}`)
                              .join(', ')}
                      </span>
                      <span className="p03-version-pill p03-mono-inline">
                        Operation: {snapshot.accepted_result.operation.identity.operation_id}
                      </span>
                    </div>

                    <div className="p05-table-wrap">
                      <table className="p05-cells-table">
                        <thead>
                          <tr>
                            <th>Posting ID</th>
                            <th>Lot ID</th>
                            <th>Allocation Type</th>
                            <th>Condition</th>
                            <th>Documented Qty</th>
                            <th>Usable Accepted Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.accepted_result.data.stock_effects.map((effect) => (
                            <tr key={effect.posting_id}>
                              <td className="p03-mono-inline">#{effect.posting_id}</td>
                              <td className="p03-mono-inline">#{effect.lot_id}</td>
                              <td>
                                {effect.lot_kind === 'accepted'
                                  ? 'Accepted On-Hand'
                                  : 'Non-Usable Quarantine'}
                              </td>
                              <td>{formatConditionLabel(effect.condition_code)}</td>
                              <td className="p03-mono-inline">
                                {effect.documented_quantity.value}
                              </td>
                              <td className="p03-mono-inline">{effect.accepted_quantity.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 4: Scoped Durable Operation Lookup */}
        {activeTab === 'lookup' ? (
          <div className="p03-action-stack">
            <section className="p03-card surface-card" aria-labelledby="p06-lookup-heading">
              <h2 id="p06-lookup-heading" className="p03-section-title">
                Operation Status Recovery
              </h2>
              <p className="p03-muted-copy">
                Verify whether an opening baseline acceptance committed before retrying after a
                network interruption. Failed lookups preserve existing draft state so physical
                counts do not need to be repeated.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p06-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p06-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Enter idempotency key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p06-lookup-ulid-input" className="form-label">
                    Operation Reference ID (ULID)
                  </label>
                  <input
                    id="p06-lookup-ulid-input"
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
                  id="p06-lookup-by-key-btn"
                  className="btn-batcave-primary"
                  onClick={handleLookupByKey}
                >
                  Lookup by Key
                </button>
                <button
                  type="button"
                  id="p06-lookup-by-ulid-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByUlid}
                >
                  Lookup by Operation ID
                </button>
              </div>

              {lookupResult ? (
                <div
                  className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                  data-testid="p06-lookup-result"
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

              <div className="p03-ledger-chips" data-testid="p06-operation-ledger">
                <span className="p03-eyebrow">Committed Opening Acceptances in Active Chapter</span>
                {snapshot.operation_ledger.length === 0 ? (
                  <p className="p03-muted-copy">No opening baseline acceptances committed yet.</p>
                ) : (
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((entry) => (
                      <button
                        key={entry.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p06-ledger-fill-${entry.operation_id}`}
                        onClick={() => {
                          setLookupKeyInput(entry.idempotency_key);
                          setLookupUlidInput(entry.operation_id);
                        }}
                      >
                        Baseline #{entry.result.data.baseline_id} &middot; {entry.idempotency_key}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
