import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import {
  createP05InventoryEngine,
} from './p05InventorySlice';
import type {
  EligibilityResult,
  P05ActionResult,
  P05EngineSnapshot,
  PurposeUse,
  UncertainLookupResponse,
} from './p05InventorySlice';

type P05TabId = 'catalog' | 'eligibility' | 'holds' | 'lookup';

interface P05InventoryWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const DEFAULT_FINDING_RECORD_ID = '9007199254740993';
const DEFAULT_CLEAR_RECORD_ID = '9007199254740994';
const ZERO_QTY_FALLBACK = '0';

export function P05InventoryWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P05InventoryWorkspaceProps) {
  const engine = useMemo(() => createP05InventoryEngine(), []);
  const [snapshot, setSnapshot] = useState<P05EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P05TabId>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P05ActionResult | null>(snapshot.last_action);
  const [queryResult, setQueryResult] = useState<EligibilityResult | null>(
    snapshot.last_query_result
  );

  // Tab 1: Catalog & Item Policy inputs (strictly empty by default)
  const [unitCodeInput, setUnitCodeInput] = useState('');
  const [unitNameInput, setUnitNameInput] = useState('');
  const [unitScaleInput, setUnitScaleInput] = useState('');

  const [locCodeInput, setLocCodeInput] = useState('');
  const [locNameInput, setLocNameInput] = useState('');
  const [locCustodyInput, setLocCustodyInput] = useState<'' | 'stockroom' | 'booth'>('');

  const [variantSkuInput, setVariantSkuInput] = useState('');
  const [variantNameInput, setVariantNameInput] = useState('');
  const [variantLabelInput, setVariantLabelInput] = useState('');
  const [variantUnitIdInput, setVariantUnitIdInput] = useState('');

  const [policyVariantIdInput, setPolicyVariantIdInput] = useState('');
  const [policyRopInput, setPolicyRopInput] = useState('');
  const [policyApproverDutyInput, setPolicyApproverDutyInput] = useState('CHAPTER_HEAD');

  // Tab 2: Eligibility query inputs (strictly empty by default)
  const [queryVariantIdInput, setQueryVariantIdInput] = useState('');
  const [queryPurposeInput, setQueryPurposeInput] = useState<'' | PurposeUse>('');
  const [queryQtyInput, setQueryQtyInput] = useState('');
  const [queryLotInput, setQueryLotInput] = useState('');
  const [queryLocationInput, setQueryLocationInput] = useState('');

  // Tab 3: Holds & Clearance inputs (strictly empty by default)
  const [holdVariantIdInput, setHoldVariantIdInput] = useState('');
  const [holdReasonInput, setHoldReasonInput] = useState('');
  const [holdLotInput, setHoldLotInput] = useState('');
  const [holdPositionInput, setHoldPositionInput] = useState('');
  const [holdStartInput, setHoldStartInput] = useState('');
  const [holdEndInput, setHoldEndInput] = useState('');
  const [holdEvidenceHashInput, setHoldEvidenceHashInput] = useState('');
  const [holdKeyInput, setHoldKeyInput] = useState('');

  const [clearReasonInput, setClearReasonInput] = useState('');
  const [clearEvidenceHashInput, setClearEvidenceHashInput] = useState('');
  const [clearKeyInput, setClearKeyInput] = useState('');

  // Tab 4: Scoped Durable Lookup inputs (strictly empty by default)
  const [lookupActionSelect, setLookupActionSelect] = useState<
    'inventory.record_stock_hold' | 'inventory.clear_stock_hold'
  >('inventory.record_stock_hold');
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P05ActionResult<UncertainLookupResponse> | null>(
    null
  );

  function refreshSnapshot<T>(res: P05ActionResult<T>): P05ActionResult<T> {
    const next = engine.getSnapshot();
    setSnapshot(next);
    setLastResult(res);
    return res;
  }

  function handleRegisterUnit() {
    playClickPen(soundEnabled);
    if (unitScaleInput === '') {
      const err: P05ActionResult = {
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY_SCALE',
        message: 'Select an integer quantity scale between 0 and 6.',
      };
      setLastResult(err);
      onNotify('error', err.message);
      return;
    }
    const res = refreshSnapshot(
      engine.registerUnit({
        code: unitCodeInput,
        name: unitNameInput,
        quantity_scale: Number(unitScaleInput),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setUnitCodeInput('');
      setUnitNameInput('');
      setUnitScaleInput('');
      setVariantUnitIdInput(res.data.unit_id);
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleRegisterLocation() {
    playClickPen(soundEnabled);
    if (locCustodyInput === '') {
      const err: P05ActionResult = {
        ok: false,
        http_status: 422,
        code: 'CUSTODY_KIND_REQUIRED',
        message: 'Select a custody kind (stockroom or booth).',
      };
      setLastResult(err);
      onNotify('error', err.message);
      return;
    }
    const res = refreshSnapshot(
      engine.registerLocation({
        code: locCodeInput,
        name: locNameInput,
        custody_kind: locCustodyInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setLocCodeInput('');
      setLocNameInput('');
      setLocCustodyInput('');
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleRegisterVariant() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerVariant({
        sku: variantSkuInput,
        item_name: variantNameInput,
        variant_label: variantLabelInput,
        unit_id: variantUnitIdInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setVariantSkuInput('');
      setVariantNameInput('');
      setVariantLabelInput('');
      setPolicyVariantIdInput(res.data.variant_id);
      setQueryVariantIdInput(res.data.variant_id);
      setHoldVariantIdInput(res.data.variant_id);
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handlePreparePolicy() {
    playClickPen(soundEnabled);
    const targetId = policyVariantIdInput;
    const res = refreshSnapshot(
      engine.prepareItemPolicy({
        variant_id: targetId,
        policy_version_id: `30${snapshot.variants.length + 1}`,
        rop_threshold_value: policyRopInput,
      })
    );
    if (res.ok) {
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleApprovePolicy() {
    playClickPen(soundEnabled);
    const targetVariant = snapshot.variants.find((v) => v.variant_id === policyVariantIdInput);
    const res = refreshSnapshot(
      engine.approveItemPolicy({
        variant_id: policyVariantIdInput,
        policy_version_id: targetVariant?.policy_version_id ?? '',
        approver_duty: policyApproverDutyInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleTestDirectBalanceSetter() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.attemptDirectBalanceSetter({
        variant_id: policyVariantIdInput || '0',
        arbitrary_quantity: '100',
      })
    );
    onNotify('error', res.message);
  }

  function handleRunEligibilityQuery() {
    playClickPen(soundEnabled);
    const targetVariant = snapshot.variants.find((v) => v.variant_id === queryVariantIdInput);
    const effectivePurpose: PurposeUse = queryPurposeInput || 'internal';
    const effectiveQty = queryQtyInput.trim() || ZERO_QTY_FALLBACK;
    const lotIds = queryLotInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const locationIds = queryLocationInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = refreshSnapshot(
      engine.queryEligibility({
        chapter_id: snapshot.chapter_id,
        variant_id: queryVariantIdInput,
        unit_id: targetVariant?.unit_id ?? '',
        purpose: {
          use: effectivePurpose,
          event_id: effectivePurpose === 'booth_sale' || effectivePurpose === 'booth_checkout' ? '501' : null,
          requesting_unit_id: '81',
          intended_use_at: '2026-11-21T12:00:00.000000Z',
        },
        requested_quantity: {
          value: effectiveQty,
          quantity_scale: targetVariant?.quantity_scale ?? 0,
        },
        lot_ids: lotIds,
        location_ids: locationIds,
      })
    );
    if (res.ok && res.data) {
      setQueryResult(res.data);
      playScribblenauts(soundEnabled);
      onNotify('success', res.message);
    } else {
      setQueryResult((prev) =>
        prev
          ? {
              ...prev,
              freshness: {
                ...prev.freshness,
                state: 'stale',
              },
            }
          : null
      );
      onNotify('error', res.message);
    }
  }

  function handleGenerateHoldKey() {
    playClickPen(soundEnabled);
    const suffix = String(snapshot.operation_ledger.length + 1).padStart(2, '0');
    setHoldKeyInput(`p05-hold-seq-${snapshot.holds.length + 1}-${suffix}`);
  }

  function handleRecordHold() {
    playClickPen(soundEnabled);
    const variant = snapshot.variants.find((v) => v.variant_id === holdVariantIdInput);
    const variantCells = snapshot.cells.filter(
      (c) => c.dimension.variant_id === holdVariantIdInput
    );
    const posIds = Array.from(new Set(variantCells.map((c) => c.dimension.position_id)));
    const positionVersions = posIds.map((pid) => ({
      position_id: pid,
      row_version: snapshot.position_versions[pid] ?? 1,
    }));
    const hash = holdEvidenceHashInput.trim();
    const res = refreshSnapshot(
      engine.recordStockHold({
        context: {
          chapter_id: snapshot.chapter_id,
          action_code: 'inventory.record_stock_hold',
          idempotency_key: holdKeyInput.trim(),
          record: { id: DEFAULT_FINDING_RECORD_ID, kind: 'IPC' },
          expected_row_version: 7,
          expected_material_version: 1,
        },
        finding: {
          chapter_id: snapshot.chapter_id,
          record: { id: DEFAULT_FINDING_RECORD_ID, kind: 'IPC' },
          material_version: 1,
          material_hash: hash || '0'.repeat(64),
        },
        reason_code: holdReasonInput.trim(),
        coverage: [
          {
            lot_id: holdLotInput.trim(),
            position_id: holdPositionInput.trim(),
            start: holdStartInput.trim(),
            end: holdEndInput.trim(),
          },
        ],
        expected_guards: {
          variant_id: holdVariantIdInput,
          eligibility_version: variant?.eligibility_version ?? 0,
          position_versions: positionVersions,
        },
        evidence: [
          {
            binding_id: '8801',
            target: {
              chapter_id: snapshot.chapter_id,
              record: { id: DEFAULT_FINDING_RECORD_ID, kind: 'IPC' },
              material_version: 1,
              material_hash: hash || '0'.repeat(64),
            },
            evidence: {
              evidence_id: '7701',
              storage_version: 'v1',
              content_hash: hash,
              capture_mode: 'paper_scan',
            },
            purpose_code: 'hold_finding',
          },
        ],
      })
    );

    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setLookupActionSelect('inventory.record_stock_hold');
      setLookupKeyInput(res.data.operation.identity.idempotency_key);
      setLookupUlidInput(res.data.operation.operation_id);
      if (queryVariantIdInput === holdVariantIdInput) {
        const refreshed = engine.queryEligibility({
          chapter_id: snapshot.chapter_id,
          variant_id: holdVariantIdInput,
          unit_id: variant?.unit_id ?? '',
          purpose: {
            use: queryPurposeInput || 'internal',
            event_id: null,
            requesting_unit_id: '81',
            intended_use_at: '2026-11-21T12:00:00.000000Z',
          },
          requested_quantity: {
            value: queryQtyInput.trim() || ZERO_QTY_FALLBACK,
            quantity_scale: variant?.quantity_scale ?? 0,
          },
          lot_ids: [],
          location_ids: [],
        });
        refreshSnapshot(res);
        if (refreshed.ok && refreshed.data) {
          setQueryResult(refreshed.data);
        }
      }
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleClearHold(holdId: string) {
    playClickPen(soundEnabled);
    const hold = snapshot.holds.find((h) => h.hold_id === holdId);
    const coveredCells = snapshot.cells.filter((c) => c.active_hold_ids.includes(holdId));
    const variantId =
      coveredCells[0]?.dimension.variant_id ?? holdVariantIdInput ?? queryVariantIdInput;
    const variant = snapshot.variants.find((v) => v.variant_id === variantId);
    const posIds = Array.from(
      new Set(
        snapshot.cells
          .filter((c) => c.dimension.variant_id === variantId)
          .map((c) => c.dimension.position_id)
      )
    );
    const positionVersions = posIds.map((pid) => ({
      position_id: pid,
      row_version: snapshot.position_versions[pid] ?? 1,
    }));
    const hash = clearEvidenceHashInput.trim();
    const key =
      clearKeyInput.trim() ||
      `clear-${holdId}-seq-${snapshot.operation_ledger.length + 1}`;

    const res = refreshSnapshot(
      engine.clearStockHold({
        context: {
          chapter_id: snapshot.chapter_id,
          action_code: 'inventory.clear_stock_hold',
          idempotency_key: key,
          record: { id: DEFAULT_CLEAR_RECORD_ID, kind: 'IPC' },
          expected_row_version: 8,
          expected_material_version: 1,
        },
        hold_id: holdId,
        expected_hold_row_version: hold?.row_version ?? 1,
        resolution: {
          chapter_id: snapshot.chapter_id,
          record: { id: DEFAULT_CLEAR_RECORD_ID, kind: 'IPC' },
          material_version: 1,
          material_hash: hash || '0'.repeat(64),
        },
        reason: clearReasonInput.trim(),
        expected_guards: {
          variant_id: variantId,
          eligibility_version: variant?.eligibility_version ?? 0,
          position_versions: positionVersions,
        },
        evidence: [
          {
            binding_id: '8802',
            target: {
              chapter_id: snapshot.chapter_id,
              record: { id: DEFAULT_CLEAR_RECORD_ID, kind: 'IPC' },
              material_version: 1,
              material_hash: hash || '0'.repeat(64),
            },
            evidence: {
              evidence_id: '7702',
              storage_version: 'v1',
              content_hash: hash,
              capture_mode: 'paper_scan',
            },
            purpose_code: 'hold_clearance',
          },
        ],
      })
    );

    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setLookupActionSelect('inventory.clear_stock_hold');
      setLookupKeyInput(res.data.operation.identity.idempotency_key);
      setLookupUlidInput(res.data.operation.operation_id);
      if (variantId && variant?.policy_status === 'approved') {
        const refreshed = engine.queryEligibility({
          chapter_id: snapshot.chapter_id,
          variant_id: variantId,
          unit_id: variant.unit_id,
          purpose: {
            use: queryPurposeInput || 'internal',
            event_id: null,
            requesting_unit_id: '81',
            intended_use_at: '2026-11-21T12:00:00.000000Z',
          },
          requested_quantity: {
            value: queryQtyInput.trim() || ZERO_QTY_FALLBACK,
            quantity_scale: variant.quantity_scale,
          },
          lot_ids: [],
          location_ids: [],
        });
        refreshSnapshot(res);
        if (refreshed.ok && refreshed.data) {
          setQueryResult(refreshed.data);
        }
      }
      onNotify('success', res.message);
    } else {
      onNotify('error', res.message);
    }
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupInventoryOperation({
        query_type: 'by_key',
        chapter_id: snapshot.chapter_id,
        action_code: lookupActionSelect,
        idempotency_key: lookupKeyInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByUlid() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupInventoryOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredVariants = normalizedSearch
    ? snapshot.variants.filter(
        (v) =>
          v.sku.toLowerCase().includes(normalizedSearch) ||
          v.item_name.toLowerCase().includes(normalizedSearch) ||
          v.variant_label.toLowerCase().includes(normalizedSearch)
      )
    : snapshot.variants;

  const filteredHolds = normalizedSearch
    ? snapshot.holds.filter(
        (h) =>
          h.hold_id.toLowerCase().includes(normalizedSearch) ||
          h.reason_code.toLowerCase().includes(normalizedSearch)
      )
    : snapshot.holds;

  const activeHolds = filteredHolds.filter((h) => (h.state ?? 'active') === 'active');

  return (
    <main className="p03-workspace-shell" data-testid="p05-workspace">
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
                id="p05-inventory-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog SKU, item name, or hold reason"
                aria-label="Search inventory catalog and holds"
              />
            </div>

            {normalizedSearch ? (
              <div className="p03-search-meta">
                <span className="p03-version-pill" data-testid="p05-search-match-count">
                  {filteredVariants.length} item{filteredVariants.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  id="p05-search-clear-btn"
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
              <h1 className="p03-main-title">Inventory Catalog &amp; Stock Eligibility</h1>
            </div>

            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Inventory workspace tabs">
                <button
                  type="button"
                  role="tab"
                  id="p05-tab-catalog"
                  aria-selected={activeTab === 'catalog'}
                  className={`p03-filter-pill ${activeTab === 'catalog' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('catalog');
                  }}
                >
                  Catalog &amp; Item Policy
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p05-tab-eligibility"
                  aria-selected={activeTab === 'eligibility'}
                  className={`p03-filter-pill ${activeTab === 'eligibility' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('eligibility');
                  }}
                >
                  Stock Views &amp; Eligibility
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p05-tab-holds"
                  aria-selected={activeTab === 'holds'}
                  className={`p03-filter-pill ${activeTab === 'holds' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('holds');
                  }}
                >
                  Holds &amp; Clearance
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p05-tab-lookup"
                  aria-selected={activeTab === 'lookup'}
                  className={`p03-filter-pill ${activeTab === 'lookup' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('lookup');
                  }}
                >
                  Operation Lookup
                </button>
              </div>

              <button
                type="button"
                id="p05-back-dashboard-btn"
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

        {/* Summary / Status Strip */}
        <section className="p03-card surface-card" aria-labelledby="p05-summary-heading">
          <div className="p03-card-header-row">
            <h2 id="p05-summary-heading" className="p03-section-title">
              Chapter Inventory Overview — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p05-variant-count-pill">
                Catalog Items: <strong>{snapshot.variants.length}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p05-unit-count-pill">
                Units of Measure: <strong>{snapshot.units.length}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p05-cell-count-pill">
                Stock Segments: <strong>{snapshot.cells.length}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p05-active-hold-count-pill">
                Active Holds:{' '}
                <strong>{snapshot.holds.filter((h) => (h.state ?? 'active') === 'active').length}</strong>
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p05-feedback-banner"
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

        {/* TAB 1: Catalog & Item Policy */}
        {activeTab === 'catalog' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p05-unit-loc-heading">
                <h2 id="p05-unit-loc-heading" className="p03-section-title">
                  Units of Measure &amp; Storage Locations
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p05-unit-code-input" className="form-label">
                      Unit Code
                    </label>
                    <input
                      id="p05-unit-code-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={unitCodeInput}
                      placeholder="e.g. PCS or KG"
                      onChange={(e) => setUnitCodeInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p05-unit-name-input" className="form-label">
                      Unit Name
                    </label>
                    <input
                      id="p05-unit-name-input"
                      type="text"
                      className="form-control"
                      value={unitNameInput}
                      placeholder="e.g. Pieces"
                      onChange={(e) => setUnitNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p05-unit-scale-select" className="form-label">
                    Decimal Precision Scale
                  </label>
                  <div className="p03-input-action-row">
                    <select
                      id="p05-unit-scale-select"
                      className="form-control"
                      aria-label="Unit precision scale"
                      value={unitScaleInput}
                      onChange={(e) => setUnitScaleInput(e.target.value)}
                    >
                      <option value="">Select precision scale (0–6)</option>
                      <option value="0">0 — Whole units (pieces/kits)</option>
                      <option value="1">1 — Tenths (0.1)</option>
                      <option value="2">2 — Hundredths (0.01)</option>
                      <option value="3">3 — Thousandths (0.001 kg/L)</option>
                      <option value="4">4 — Ten-thousandths</option>
                      <option value="5">5 — Hundred-thousandths</option>
                      <option value="6">6 — Six Decimal Places (0.000001)</option>
                    </select>
                    <button
                      type="button"
                      id="p05-add-unit-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleRegisterUnit}
                    >
                      Register Unit
                    </button>
                  </div>
                </div>

                <div className="p03-guard-strip">
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p05-location-code-input" className="form-label">
                        Location Code
                      </label>
                      <input
                        id="p05-location-code-input"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={locCodeInput}
                        placeholder="e.g. LOC-MAIN"
                        onChange={(e) => setLocCodeInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p05-location-name-input" className="form-label">
                        Location Name
                      </label>
                      <input
                        id="p05-location-name-input"
                        type="text"
                        className="form-control"
                        value={locNameInput}
                        placeholder="e.g. Chapter Stockroom"
                        onChange={(e) => setLocNameInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p05-location-custody-select" className="form-label">
                      Custody Classification
                    </label>
                    <div className="p03-input-action-row">
                      <select
                        id="p05-location-custody-select"
                        className="form-control"
                        aria-label="Custody kind"
                        value={locCustodyInput}
                        onChange={(e) =>
                          setLocCustodyInput(e.target.value as '' | 'stockroom' | 'booth')
                        }
                      >
                        <option value="">Select custody kind</option>
                        <option value="stockroom">Stockroom Custody</option>
                        <option value="booth">Booth Event Custody</option>
                      </select>
                      <button
                        type="button"
                        id="p05-add-location-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleRegisterLocation}
                      >
                        Register Location
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p05-catalog-items-heading">
                <div className="p03-card-header-row">
                  <h2 id="p05-catalog-items-heading" className="p03-section-title">
                    Registered Catalog Items ({filteredVariants.length})
                  </h2>
                </div>

                {filteredVariants.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p05-empty-catalog-notice">
                    {normalizedSearch
                      ? 'No catalog items match your search.'
                      : 'No catalog items registered yet. Register a unit and item variant to begin.'}
                  </p>
                ) : (
                  <div className="p03-history-list" data-testid="p05-catalog-list">
                    {filteredVariants.map((variant) => (
                      <article
                        key={variant.variant_id}
                        className="p03-history-card"
                        data-testid={`p05-variant-${variant.variant_id}`}
                      >
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <span className="p03-version-pill p03-mono-inline">{variant.sku}</span>
                            <strong>{variant.item_name}</strong>
                            <span className="p03-muted-inline">({variant.variant_label})</span>
                          </div>
                          <div className="p03-version-badges">
                            <span className="p03-version-pill">
                              Policy: <strong>{variant.policy_status.toUpperCase()}</strong>
                            </span>
                            <span className="p03-version-pill">
                              Version <strong>{variant.eligibility_version}</strong>
                            </span>
                          </div>
                        </div>
                        <p className="p03-muted-copy p03-mono-inline">
                          Decimal Places: {variant.quantity_scale} &middot; Reorder Threshold:{' '}
                          {variant.approved_rop_threshold
                            ? variant.approved_rop_threshold.value
                            : 'Pending Approval'}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p05-add-variant-heading">
                <h2 id="p05-add-variant-heading" className="p03-section-title">
                  Register Catalog Item
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p05-variant-sku-input" className="form-label">
                      Item SKU
                    </label>
                    <input
                      id="p05-variant-sku-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={variantSkuInput}
                      placeholder="e.g. YSP-SHIRT-M"
                      onChange={(e) => setVariantSkuInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p05-variant-name-input" className="form-label">
                      Item Name
                    </label>
                    <input
                      id="p05-variant-name-input"
                      type="text"
                      className="form-control"
                      value={variantNameInput}
                      placeholder="e.g. Chapter Relief T-Shirt"
                      onChange={(e) => setVariantNameInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p05-variant-label-input" className="form-label">
                      Variant Spec (Optional)
                    </label>
                    <input
                      id="p05-variant-label-input"
                      type="text"
                      className="form-control"
                      value={variantLabelInput}
                      placeholder="e.g. Size Medium"
                      onChange={(e) => setVariantLabelInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p05-variant-unit-select" className="form-label">
                      Base Unit of Measure
                    </label>
                    <select
                      id="p05-variant-unit-select"
                      className="form-control"
                      value={variantUnitIdInput}
                      onChange={(e) => setVariantUnitIdInput(e.target.value)}
                    >
                      <option value="">Select registered unit</option>
                      {snapshot.units.map((u) => (
                        <option key={u.unit_id} value={u.unit_id}>
                          {u.code} — {u.name} (scale {u.quantity_scale})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  id="p05-add-variant-btn"
                  className="btn-batcave-primary"
                  onClick={handleRegisterVariant}
                >
                  Register Catalog Item
                </button>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p05-policy-heading">
                <h2 id="p05-policy-heading" className="p03-section-title">
                  Reorder Policy &amp; Balance Controls
                </h2>
                <p className="p03-muted-copy">
                  Configure the Reorder Point (ROP) threshold and obtain officer approval before
                  querying stock availability.
                </p>

                <div className="form-group">
                  <label htmlFor="p05-policy-variant-select" className="form-label">
                    Target Variant
                  </label>
                  <select
                    id="p05-policy-variant-select"
                    className="form-control"
                    value={policyVariantIdInput}
                    onChange={(e) => setPolicyVariantIdInput(e.target.value)}
                  >
                    <option value="">Select catalog item</option>
                    {snapshot.variants.map((v) => (
                      <option key={v.variant_id} value={v.variant_id}>
                        {v.sku} — {v.item_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p05-policy-rop-input" className="form-label">
                      ROP Threshold Quantity
                    </label>
                    <input
                      id="p05-policy-rop-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={policyRopInput}
                      placeholder="e.g. 8"
                      onChange={(e) => setPolicyRopInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p05-policy-approver-select" className="form-label">
                      Approver Officer Role
                    </label>
                    <select
                      id="p05-policy-approver-select"
                      className="form-control"
                      value={policyApproverDutyInput}
                      onChange={(e) => setPolicyApproverDutyInput(e.target.value)}
                    >
                      <option value="CHAPTER_HEAD">Chapter Head</option>
                      <option value="INVENTORY">Inventory Officer</option>
                      <option value="FINANCE">Finance Officer</option>
                    </select>
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p05-prepare-policy-btn"
                    className="btn-batcave-secondary"
                    onClick={handlePreparePolicy}
                  >
                    Save Draft ROP
                  </button>
                  <button
                    type="button"
                    id="p05-approve-policy-btn"
                    className="btn-batcave-primary"
                    onClick={handleApprovePolicy}
                  >
                    Approve Item Policy
                  </button>
                </div>

                <div className="p03-guard-strip">
                  <button
                    type="button"
                    id="p05-test-direct-balance-btn"
                    className="btn-batcave-secondary"
                    onClick={handleTestDirectBalanceSetter}
                  >
                    Verify Direct Balance Protection
                  </button>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Stock Views & Eligibility */}
        {activeTab === 'eligibility' ? (
          <div className="p03-action-stack">
            <section className="p03-card surface-card" aria-labelledby="p05-query-form-heading">
              <h2 id="p05-query-form-heading" className="p03-section-title">
                Stock Availability &amp; Eligibility Query
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p05-query-variant-select" className="form-label">
                    Catalog Item
                  </label>
                  <select
                    id="p05-query-variant-select"
                    className="form-control"
                    value={queryVariantIdInput}
                    onChange={(e) => setQueryVariantIdInput(e.target.value)}
                  >
                    <option value="">Select catalog item</option>
                    {snapshot.variants.map((v) => (
                      <option key={v.variant_id} value={v.variant_id}>
                        {v.sku} — {v.item_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p05-query-purpose-select" className="form-label">
                    Intended Purpose
                  </label>
                  <select
                    id="p05-query-purpose-select"
                    className="form-control"
                    value={queryPurposeInput}
                    onChange={(e) => setQueryPurposeInput(e.target.value as '' | PurposeUse)}
                  >
                    <option value="">Select intended purpose</option>
                    <option value="internal">Internal Requisition</option>
                    <option value="sale">Customer Sales Order</option>
                    <option value="booth_checkout">Booth Event Checkout</option>
                    <option value="booth_sale">Booth Direct Sale</option>
                  </select>
                </div>
              </div>

              <div className="p03-axes-bar">
                <div className="form-group">
                  <label htmlFor="p05-query-qty-input" className="form-label">
                    Requested New Allocation
                  </label>
                  <input
                    id="p05-query-qty-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={queryQtyInput}
                    placeholder="e.g. 2"
                    onChange={(e) => setQueryQtyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p05-query-lot-input" className="form-label">
                    Lot ID Filter (Optional)
                  </label>
                  <input
                    id="p05-query-lot-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={queryLotInput}
                    placeholder="Comma-separated lot IDs"
                    onChange={(e) => setQueryLotInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p05-query-location-input" className="form-label">
                    Location ID Filter (Optional)
                  </label>
                  <input
                    id="p05-query-location-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={queryLocationInput}
                    placeholder="Comma-separated location IDs"
                    onChange={(e) => setQueryLocationInput(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                id="p05-run-query-btn"
                className="btn-batcave-primary"
                onClick={handleRunEligibilityQuery}
              >
                Check Stock Availability
              </button>
            </section>

            {queryResult ? (
              <>
                <section className="p03-card surface-card" aria-labelledby="p05-seven-views-heading">
                  <div className="p03-card-header-row">
                    <h2 id="p05-seven-views-heading" className="p03-section-title">
                      Stock Balance Views
                    </h2>
                    <div className="p03-version-badges">
                      <span
                        className="p03-version-pill p03-mono-inline"
                        data-testid="p05-freshness-state-pill"
                      >
                        Version {queryResult.freshness.guards.eligibility_version} &middot;{' '}
                        {queryResult.freshness.state.toUpperCase()}
                      </span>
                      <span
                        className="p03-version-pill p03-mono-inline"
                        data-testid="p05-freshness-policy-ver"
                      >
                        Policy v{queryResult.freshness.policy_version_id}
                      </span>
                    </div>
                  </div>

                  <p className="p03-muted-copy p03-mono-inline">
                    <span data-testid="p05-freshness-read-at">
                      Snapshot: {queryResult.freshness.read_at}
                    </span>{' '}
                    &middot;{' '}
                    <span data-testid="p05-freshness-restrictions">
                      Restrictions:{' '}
                      {queryResult.freshness.restriction_version_ids.length > 0
                        ? queryResult.freshness.restriction_version_ids.join(', ')
                        : 'None'}
                    </span>{' '}
                    &middot;{' '}
                    <span data-testid="p05-freshness-pos-guards">
                      Position Guards:{' '}
                      {queryResult.freshness.guards.position_versions.length > 0
                        ? queryResult.freshness.guards.position_versions
                            .map((pv) => `${pv.position_id}@v${pv.row_version}`)
                            .join(', ')
                        : 'None'}
                    </span>
                  </p>

                  <div className="p05-seven-views-grid" data-testid="p05-seven-views-grid">
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Usable Stockroom On-Hand</span>
                      <span className="p03-axis-val" data-testid="p05-view-usable-on-hand">
                        {queryResult.views.usable_stockroom_on_hand.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Available to Allocate</span>
                      <span className="p03-axis-val" data-testid="p05-view-available">
                        {queryResult.views.available_to_allocate.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Reserved for Requisitions</span>
                      <span className="p03-axis-val" data-testid="p05-view-rf-reserved">
                        {queryResult.views.rf_reserved.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Reserved for Sales Orders</span>
                      <span className="p03-axis-val" data-testid="p05-view-so-reserved">
                        {queryResult.views.so_reserved.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Booth Custody</span>
                      <span className="p03-axis-val" data-testid="p05-view-booth-custody">
                        {queryResult.views.booth_custody.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Quarantined / Rejected</span>
                      <span className="p03-axis-val" data-testid="p05-view-quarantined">
                        {queryResult.views.quarantined_rejected.value}
                      </span>
                    </div>
                    <div className="p03-axis-chip">
                      <span className="p03-axis-key">Inbound Open Purchase Orders</span>
                      <span className="p03-axis-val" data-testid="p05-view-inbound-po">
                        {queryResult.views.inbound_open_po.value}
                      </span>
                    </div>
                  </div>
                </section>

                <div className="p03-grid">
                  <section className="p03-card surface-card" data-testid="p05-union-panel">
                    <h2 className="p03-section-title">Eligibility &amp; Hold Breakdown</h2>
                    <div className="p03-axes-bar">
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Eligible Stockroom Base</span>
                        <span className="p03-axis-val" data-testid="p05-union-eligible">
                          {queryResult.union.eligible_before_holds_and_reservations.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Active Held Stock</span>
                        <span className="p03-axis-val" data-testid="p05-union-held">
                          {queryResult.union.active_held_union.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Reserved Eligible Stock</span>
                        <span className="p03-axis-val" data-testid="p05-union-reserved">
                          {queryResult.union.reserved_in_eligible.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Held &amp; Reserved Overlap</span>
                        <span className="p03-axis-val" data-testid="p05-union-intersection">
                          {queryResult.union.held_reserved_intersection.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Total Blocked Stock</span>
                        <span className="p03-axis-val" data-testid="p05-union-blocked">
                          {queryResult.union.blocked_union.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Net Available to Allocate</span>
                        <span className="p03-axis-val" data-testid="p05-union-available">
                          {queryResult.union.available_to_allocate.value}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="p03-card surface-card" data-testid="p05-rop-shortage-panel">
                    <h2 className="p03-section-title">Reorder Status &amp; Allocation Shortage</h2>
                    <div className="p03-axes-bar">
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Chapter Usable Stock</span>
                        <span className="p03-axis-val" data-testid="p05-rop-usable">
                          {queryResult.rop.usable_on_hand.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Reorder Threshold</span>
                        <span className="p03-axis-val" data-testid="p05-rop-threshold">
                          {queryResult.rop.approved_threshold.value}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Stock Status</span>
                        <span className="p03-axis-val" data-testid="p05-rop-low-stock">
                          {queryResult.rop.low_stock ? 'LOW STOCK' : 'ADEQUATE'}
                        </span>
                      </div>
                      <div className="p03-axis-chip">
                        <span className="p03-axis-key">Uncovered Shortage</span>
                        <span className="p03-axis-val" data-testid="p05-shortage-uncovered">
                          {queryResult.shortage.uncovered_quantity.value}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>

                <section className="p03-card surface-card" aria-labelledby="p05-cells-heading">
                  <h2 id="p05-cells-heading" className="p03-section-title">
                    Lot &amp; Location Stock Segments ({queryResult.cells.length})
                  </h2>

                  {queryResult.cells.length === 0 ? (
                    <p className="p03-muted-copy" data-testid="p05-zero-cells-notice">
                      No received stock lots recorded for this item yet.
                    </p>
                  ) : (
                    <div className="p05-table-wrap">
                      <table className="p05-cells-table" data-testid="p05-cells-table">
                        <thead>
                          <tr>
                            <th>Range</th>
                            <th>Qty</th>
                            <th>Lot / Position / Location</th>
                            <th>Source / Restriction</th>
                            <th>Custody / Condition</th>
                            <th>Active Holds</th>
                            <th>Reservation</th>
                            <th>Eligibility</th>
                            <th>Blocking Codes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.cells.map((cell) => (
                            <tr key={cell.cell_id} data-testid={`p05-cell-row-${cell.cell_id}`}>
                              <td className="p03-mono-inline">
                                {cell.start} &ndash; {cell.end}
                              </td>
                              <td className="p03-mono-inline">{cell.quantity.value}</td>
                              <td className="p03-mono-inline">
                                L{cell.dimension.lot_id} / P{cell.dimension.position_id} / Loc{cell.dimension.location_id}
                              </td>
                              <td className="p03-mono-inline">
                                RM #{cell.dimension.source.record.id}:{cell.dimension.source.line_id} &middot; R{cell.dimension.restriction_version_id}
                              </td>
                              <td className="p03-mono-inline">
                                {cell.dimension.custody_kind} ({cell.dimension.condition_code})
                              </td>
                              <td className="p03-mono-inline">
                                {cell.active_hold_ids.length > 0 ? cell.active_hold_ids.join(', ') : '—'}
                              </td>
                              <td className="p03-mono-inline">{cell.active_reservation_id ?? '—'}</td>
                              <td className="p03-mono-inline">{cell.non_hold_eligibility}</td>
                              <td className="p03-mono-inline">
                                {cell.blocking_codes.length > 0 ? cell.blocking_codes.join(', ') : 'None'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {queryResult.reservations.length > 0 || queryResult.inbound.length > 0 ? (
                    <div className="p03-ledger-chips" data-testid="p05-commitments-summary">
                      {queryResult.reservations.length > 0 ? (
                        <p className="p03-muted-copy p03-mono-inline">
                          Reservations:{' '}
                          {queryResult.reservations
                            .map(
                              (r) =>
                                `${r.kind} #${r.demand_line.record.id} (${r.protection}, ${r.quantity.value}${
                                  r.expires_at ? `, expires ${r.expires_at}` : ', protected'
                                })`
                            )
                            .join(' | ')}
                        </p>
                      ) : null}
                      {queryResult.inbound.length > 0 ? (
                        <p className="p03-muted-copy p03-mono-inline">
                          Inbound POs:{' '}
                          {queryResult.inbound
                            .map(
                              (line) =>
                                `PO #${line.po_line.record.id}:${line.po_line.line_id} (${line.open_quantity.value} to Loc ${line.expected_location_id})`
                            )
                            .join(' | ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {/* TAB 3: Stock Holds & Evidence-Linked Clearance */}
        {activeTab === 'holds' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p05-record-hold-heading">
              <h2 id="p05-record-hold-heading" className="p03-section-title">
                Place Stock Hold
              </h2>

              <div className="form-group">
                <label htmlFor="p05-hold-variant-select" className="form-label">
                  Target Catalog Item
                </label>
                <select
                  id="p05-hold-variant-select"
                  className="form-control"
                  value={holdVariantIdInput}
                  onChange={(e) => setHoldVariantIdInput(e.target.value)}
                >
                  <option value="">Select catalog item</option>
                  {snapshot.variants.map((v) => (
                    <option key={v.variant_id} value={v.variant_id}>
                      {v.sku} — {v.item_name} (Version {v.eligibility_version})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="p05-hold-reason-input" className="form-label">
                  Hold Reason
                </label>
                <input
                  id="p05-hold-reason-input"
                  type="text"
                  className="form-control"
                  value={holdReasonInput}
                  placeholder="e.g. Quality inspection hold"
                  onChange={(e) => setHoldReasonInput(e.target.value)}
                />
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p05-hold-lot-input" className="form-label">
                    Lot ID
                  </label>
                  <input
                    id="p05-hold-lot-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={holdLotInput}
                    placeholder="e.g. 1201"
                    onChange={(e) => setHoldLotInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p05-hold-position-input" className="form-label">
                    Position ID
                  </label>
                  <input
                    id="p05-hold-position-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={holdPositionInput}
                    placeholder="e.g. 1301"
                    onChange={(e) => setHoldPositionInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p05-hold-start-input" className="form-label">
                    Range Start
                  </label>
                  <input
                    id="p05-hold-start-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={holdStartInput}
                    placeholder="e.g. 0"
                    onChange={(e) => setHoldStartInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p05-hold-end-input" className="form-label">
                    Range End
                  </label>
                  <input
                    id="p05-hold-end-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={holdEndInput}
                    placeholder="e.g. 3"
                    onChange={(e) => setHoldEndInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p05-hold-evidence-hash-input" className="form-label">
                  Supporting Evidence SHA-256 Digest
                </label>
                <input
                  id="p05-hold-evidence-hash-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={holdEvidenceHashInput}
                  placeholder="64-character lowercase SHA-256 hex digest"
                  onChange={(e) => setHoldEvidenceHashInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="p05-hold-key-input" className="form-label">
                  Idempotency Key
                </label>
                <div className="p03-input-action-row">
                  <input
                    id="p05-hold-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={holdKeyInput}
                    placeholder="Enter or generate idempotency key"
                    onChange={(e) => setHoldKeyInput(e.target.value)}
                  />
                  <button
                    type="button"
                    id="p05-hold-gen-key-btn"
                    className="btn-batcave-secondary p03-shrink-btn"
                    onClick={handleGenerateHoldKey}
                  >
                    New Key
                  </button>
                </div>
              </div>

              <button
                type="button"
                id="p05-record-hold-btn"
                className="btn-batcave-primary"
                onClick={handleRecordHold}
              >
                Place Stock Hold
              </button>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p05-active-holds-heading">
              <div className="p03-card-header-row">
                <h2 id="p05-active-holds-heading" className="p03-section-title">
                  Active Stock Holds &amp; Clearance ({activeHolds.length})
                </h2>
              </div>

              <div className="form-group">
                <label htmlFor="p05-clear-reason-input" className="form-label">
                  Resolution Reason
                </label>
                <input
                  id="p05-clear-reason-input"
                  type="text"
                  className="form-control"
                  value={clearReasonInput}
                  placeholder="Enter verified inspection clearance reason"
                  onChange={(e) => setClearReasonInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="p05-clear-evidence-hash-input" className="form-label">
                  Clearance Evidence SHA-256 Digest
                </label>
                <input
                  id="p05-clear-evidence-hash-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={clearEvidenceHashInput}
                  placeholder="64-character lowercase SHA-256 hex digest"
                  onChange={(e) => setClearEvidenceHashInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="p05-clear-key-input" className="form-label">
                  Clearance Idempotency Key (Optional)
                </label>
                <input
                  id="p05-clear-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={clearKeyInput}
                  placeholder="Enter clearance key or auto-generate per click"
                  onChange={(e) => setClearKeyInput(e.target.value)}
                />
              </div>

              {filteredHolds.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p05-empty-holds-notice">
                  No holds recorded for the current chapter.
                </p>
              ) : (
                <div className="p03-history-list" data-testid="p05-holds-list">
                  {filteredHolds.map((hold) => (
                    <article
                      key={hold.hold_id}
                      className="p03-history-card"
                      data-testid={`p05-hold-card-${hold.hold_id}`}
                    >
                      <div className="p03-history-head">
                        <div className="p03-history-title-group">
                          <span className="p03-version-pill p03-mono-inline">
                            Hold #{hold.hold_id}
                          </span>
                          <strong>{hold.reason_code}</strong>
                        </div>
                        <div className="p03-version-badges">
                          <span className="p03-version-pill">
                            Version <strong>{hold.row_version}</strong>
                          </span>
                          <span className="p03-version-pill">
                            <strong>{(hold.state ?? 'active').toUpperCase()}</strong>
                          </span>
                        </div>
                      </div>
                      <p className="p03-muted-copy p03-mono-inline">
                        Segments: {hold.coverage_cell_ids.join(', ')} &middot; Qty: {hold.quantity.value}
                      </p>
                      {(hold.state ?? 'active') === 'active' ? (
                        <button
                          type="button"
                          data-testid={`p05-clear-hold-${hold.hold_id}`}
                          className="btn-batcave-secondary p03-inline-action-btn"
                          onClick={() => handleClearHold(hold.hold_id)}
                        >
                          Clear Hold #{hold.hold_id}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Scoped Durable Operation Lookup */}
        {activeTab === 'lookup' ? (
          <div className="p03-action-stack">
            <section className="p03-card surface-card" aria-labelledby="p05-lookup-heading">
              <h2 id="p05-lookup-heading" className="p03-section-title">
                Operation Status Recovery
              </h2>
              <p className="p03-muted-copy">
                Verify the status of a stock hold or clearance request by idempotency key or
                operation reference.
              </p>

              <div className="p03-lookup-row">
                <div className="form-group">
                  <label htmlFor="p05-lookup-action-select" className="form-label">
                    Operation Type
                  </label>
                  <select
                    id="p05-lookup-action-select"
                    className="form-control"
                    value={lookupActionSelect}
                    onChange={(e) =>
                      setLookupActionSelect(
                        e.target.value as 'inventory.record_stock_hold' | 'inventory.clear_stock_hold'
                      )
                    }
                  >
                    <option value="inventory.record_stock_hold">Place Stock Hold</option>
                    <option value="inventory.clear_stock_hold">Clear Stock Hold</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p05-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p05-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Enter key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p05-lookup-ulid-input" className="form-label">
                  Operation ULID
                </label>
                <input
                  id="p05-lookup-ulid-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupUlidInput}
                  placeholder="Enter operation ULID"
                  onChange={(e) => setLookupUlidInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p05-lookup-by-key-btn"
                  className="btn-batcave-primary"
                  onClick={handleLookupByKey}
                >
                  Lookup by Key
                </button>
                <button
                  type="button"
                  id="p05-lookup-by-ulid-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByUlid}
                >
                  Lookup by ULID
                </button>
              </div>

              {lookupResult ? (
                <div
                  className={`p03-blocker-panel surface-card ${lookupResult.ok ? '' : 'is-uncertain'}`}
                  data-testid="p05-lookup-result"
                >
                  <div className="p03-blocker-title-row">
                    <span className="p03-blocker-code">{lookupResult.code}</span>
                    <span className="p03-policy-chip">
                      {lookupResult.data?.action_result.toUpperCase()}
                    </span>
                    <span className="p03-policy-chip">
                      INPUT POLICY: {lookupResult.data?.input_policy.toUpperCase()}
                    </span>
                  </div>
                  <p className="p03-blocker-msg">{lookupResult.message}</p>
                </div>
              ) : null}

              <div className="p03-ledger-chips" data-testid="p05-operation-ledger">
                <span className="p03-eyebrow">Committed Operations in Active Chapter</span>
                {snapshot.operation_ledger.length === 0 ? (
                  <p className="p03-muted-copy">No hold or clearance operations committed yet.</p>
                ) : (
                  <div className="p03-chip-wrap">
                    {snapshot.operation_ledger.map((entry) => (
                      <button
                        key={entry.operation_id}
                        type="button"
                        className="p03-ledger-chip-btn p03-mono-inline"
                        data-testid={`p05-ledger-fill-${entry.operation_id}`}
                        onClick={() => {
                          setLookupActionSelect(entry.action_code);
                          setLookupKeyInput(entry.idempotency_key);
                          setLookupUlidInput(entry.operation_id);
                        }}
                      >
                        {entry.action_code} &middot; {entry.idempotency_key}
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
