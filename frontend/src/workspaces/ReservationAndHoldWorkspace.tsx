import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiMutate, buildQuery, ContractApiError, newActionKey } from '../api/client.ts';
import type { ApiEnvelope, ChapterAccessSnapshot } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker } from '../components/SearchableRecordPicker.tsx';
import {
  emptyEvidenceBinding,
  emptyStockRange,
  emptyStockTarget,
  toWireEvidenceBinding,
  toWireRanges,
  toWireTargets,
  type StockRangeInput,
  type StockTargetInput,
} from '../components/structuredInputHelpers.ts';
import {
  EvidenceBindingFields,
  StockRangeRows,
  StockTargetRows,
} from '../components/StructuredInputRows.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface StockHoldRecord {
  id: string;
  status: string;
  version: number;
  material_version: number;
  reason_code: string;
  reason: string;
}

interface ReservationRecord {
  id: string;
  status: string;
  version: number;
  material_version: number;
  active_quantity: string;
  blocked_quantity: string;
}

interface FreeStockRange {
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
}

interface AllocationQueueEntry {
  rf_id: string;
  rf_line_id: string;
  rf_reference: string;
  item_code: string;
  variant_code: string;
  variant_label: string;
  unit_code: string;
  unreserved_outstanding_quantity: string;
  eligible_sources: {
    stock_lot_id: string;
    source_kind: 'opening_rm' | 'po_rm' | 'da_rm';
    source_reference: string;
    free_quantity: string;
  }[];
}

const sourceLabels = { opening_rm: 'Opening RM', po_rm: 'PO-RM', da_rm: 'DA-RM' };

interface CandidateLotInfo {
  stock_lot_id: string;
  basis_segment_id: string;
  free_intervals: FreeStockRange[];
  stock_version: number;
  material_version: number;
}

interface AllocationReviewLine {
  rf_line_id: string;
  variant_id: string;
  unit_id: string;
  candidate_lots?: CandidateLotInfo[];
}

interface RfAllocationReviewPins {
  rf_version: number;
  rf_material_version: number;
  rf_progress_version: number;
}

interface AllocationReviewData {
  rf?: {
    id: string;
    version: number;
    material_version: number;
    progress_version: number;
  };
  lines?: AllocationReviewLine[];
}

interface SignatoryInput {
  user_id: string;
  membership_id: string;
  duty_grant_id: string;
  signed_at: string;
}

type ResHoldOp = 'prepare' | 'commit' | 'release' | 'reallocate' | 'placeHold' | 'proposeClear' | 'clearHold';

interface ReservationAndHoldWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

const OP_REQUIRED_ACTIONS: Record<ResHoldOp, string[]> = {
  prepare: ['rf.reserve', 'rf.read', 'stock.read'],
  commit: ['rf.reserve', 'rf.read', 'stock.read'],
  release: ['rf.reserve', 'rf.read', 'stock.read'],
  reallocate: ['rf.reallocate', 'rf.read', 'stock.read'],
  placeHold: ['hold.place', 'stock.read'],
  proposeClear: ['hold.clear', 'stock.read'],
  clearHold: ['hold.clear', 'evidence.read', 'stock.read'],
};

function emptySignatory(): SignatoryInput {
  return {
    user_id: '',
    membership_id: '',
    duty_grant_id: '',
    signed_at: new Date().toISOString().replace(/\.\d+Z$/, '.000000Z'),
  };
}

export function ReservationAndHoldWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: ReservationAndHoldWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'actions' | 'records' | 'status'>('actions');
  const formKey = 'reservation_hold_editor';

  function readSavedDraft(): {
    rfId?: string;
    rfLineId?: string;
    prepId?: string;
    reservationId?: string;
    holdId?: string;
    opKind?: ResHoldOp;
    reasonCode?: string;
    reason?: string;
    resolution?: string;
    overridePolicyId?: string;
    treatmentSourceId?: string;
  } {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as {
        rfId?: string;
        rfLineId?: string;
        prepId?: string;
        reservationId?: string;
        holdId?: string;
        opKind?: ResHoldOp;
        reasonCode?: string;
        reason?: string;
        resolution?: string;
        overridePolicyId?: string;
        treatmentSourceId?: string;
      };
    } catch {
      return {};
    }
  }

  const initialDraft = readSavedDraft();
  const [rfId, setRfId] = useState(initialDraft.rfId ?? '');
  const [rfLineId, setRfLineId] = useState(initialDraft.rfLineId ?? '');
  const [prepId, setPrepId] = useState(initialDraft.prepId ?? '');
  const [reservationId, setReservationId] = useState(initialDraft.reservationId ?? '');
  const [holdId, setHoldId] = useState(initialDraft.holdId ?? '');

  const [queueResult, setQueueResult] = useState<{ generation: string; entries: AllocationQueueEntry[]; failed?: true }>();
  const [pickerRevision, setPickerRevision] = useState(0);
  const [reviewGeneration, setReviewGeneration] = useState('');
  const generation = `${refreshSignal}:${pickerRevision}`;
  const [reviewData, setReviewData] = useState<AllocationReviewData | null>(null);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [holds, setHolds] = useState<StockHoldRecord[]>([]);

  const [opKind, setOpKind] = useState<ResHoldOp>(initialDraft.opKind ?? 'prepare');
  const [expectedRfVersion, setExpectedRfVersion] = useState('1');
  const [expectedRfMaterialVersion, setExpectedRfMaterialVersion] = useState('1');
  const [expectedRfProgressVersion, setExpectedRfProgressVersion] = useState('1');
  const [expectedPrepVersion, setExpectedPrepVersion] = useState('1');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [expectedMaterialVersion, setExpectedMaterialVersion] = useState('1');
  const [overridePolicyId, setOverridePolicyId] = useState(initialDraft.overridePolicyId ?? '');
  const [releaseKind, setReleaseKind] = useState<'release' | 'cancel_commitment'>('release');
  const [reasonCode, setReasonCode] = useState(initialDraft.reasonCode ?? 'inspection_hold');
  const [reason, setReason] = useState(initialDraft.reason ?? '');
  const [resolution, setResolution] = useState(initialDraft.resolution ?? '');
  const [treatmentSourceId, setTreatmentSourceId] = useState(initialDraft.treatmentSourceId ?? '');
  const [expectedSnapshotMatVer, setExpectedSnapshotMatVer] = useState('1');
  const [expectedSnapshotSha, setExpectedSnapshotSha] = useState('');
  const [matchesPaper, setMatchesPaper] = useState(true);

  const [targets, setTargets] = useState<StockTargetInput[]>([emptyStockTarget()]);
  const [ranges, setRanges] = useState<StockRangeInput[]>([emptyStockRange()]);
  const [signatories, setSignatories] = useState<SignatoryInput[]>([emptySignatory()]);
  const [evidenceBinding, setEvidenceBinding] = useState(emptyEvidenceBinding);

  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');
  const [resultJson, setResultJson] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const loadHolds = useCallback(async () => {
    const res = await apiGet<StockHoldRecord[]>(`/api/v1/chapters/${chapterId}/stock-holds?limit=25`);
    setHolds(res.data);
    if (!holdId && res.data[0]?.id) {
      setHoldId(res.data[0].id);
      setExpectedVersion(String(res.data[0].version));
      setExpectedMaterialVersion(String(res.data[0].material_version));
    }
  }, [chapterId, holdId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadHolds();
        if (active) {
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadHolds, refreshSignal]);

  const opBlockReason = actionBlockReason(chapterAccess, ...OP_REQUIRED_ACTIONS[opKind]);

  useEffect(() => {
    if (opKind !== 'prepare' || opBlockReason) return;
    let current = true;
    const load = async () => {
      const entries: AllocationQueueEntry[] = [];
      let cursor: string | null = null;
      do {
        const response: ApiEnvelope<AllocationQueueEntry[]> = await apiGet(
          `/api/v1/chapters/${chapterId}/allocation-queue${buildQuery({ limit: '100', cursor })}`,
        );
        if (!current) return;
        entries.push(...response.data);
        cursor = response.page?.next_cursor ?? null;
      } while (cursor);
      setQueueResult({ generation, entries });
    };
    void load().catch((failure: unknown) => {
      if (current) {
        setQueueResult({ generation, entries: [], failed: true });
        setError(failure);
      }
    });
    return () => { current = false; };
  }, [chapterId, opKind, opBlockReason, generation]);

  const currentQueue = queueResult?.generation === generation ? queueResult : undefined;
  const queueState = currentQueue ? currentQueue.failed ? 'failed' : 'ready' : 'loading';
  const queue = currentQueue?.entries ?? [];
  const selectedLine = queue.find((entry) => entry.rf_id === rfId && entry.rf_line_id === rfLineId);

  const selectedRfId = selectedLine?.rf_id;
  const selectedRfLineId = selectedLine?.rf_line_id;
  const requestedReview = `${generation}:${selectedRfId ?? ''}:${selectedRfLineId ?? ''}`;
  useEffect(() => {
    if (opKind !== 'prepare' || opBlockReason || !selectedRfId || !selectedRfLineId) return;
    let current = true;
    const path = `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRfId}/allocation-review`;
    void Promise.all([
      apiGet<AllocationReviewData>(path),
      apiGet<RfAllocationReviewPins>(`${path}${buildQuery({ rf_line_id: selectedRfLineId })}`),
    ])
      .then(([ranges, { data: pins }]) => {
        if (!current || !ranges.data.rf) return;
        if (pins.rf_version !== ranges.data.rf.version || pins.rf_material_version !== ranges.data.rf.material_version
          || pins.rf_progress_version !== ranges.data.rf.progress_version) {
          setError(new Error('The RF changed while loading. Reload the allocation queue and choose again.'));
          return;
        }
        setReviewData(ranges.data);
        setExpectedRfVersion(String(pins.rf_version));
        setExpectedRfMaterialVersion(String(pins.rf_material_version));
        setExpectedRfProgressVersion(String(pins.rf_progress_version));
        setReviewGeneration(requestedReview);
      })
      .catch((failure: unknown) => {
        if (current) setError(failure);
      });
    return () => { current = false; };
  }, [chapterId, opKind, opBlockReason, selectedRfId, selectedRfLineId, requestedReview]);

  function chooseRfLine(id: string) {
    const line = queue.find((entry) => entry.rf_line_id === id);
    setRfId(line?.rf_id ?? '');
    setRfLineId(line?.rf_line_id ?? '');
    setPrepId('');
    setReservationId('');
    setReviewData(null);
    setReviewGeneration('');
    setTargets([emptyStockTarget()]);
    setError(null);
  }

  const candidateLots = requestedReview === reviewGeneration && reviewData?.rf?.id === selectedRfId
    ? reviewData?.lines?.find((line) => line.rf_line_id === rfLineId)?.candidate_lots ?? []
    : [];
  const stockChoices = selectedLine?.eligible_sources.flatMap((source) => {
    const lot = candidateLots.find((candidate) => candidate.stock_lot_id === source.stock_lot_id);
    return lot?.free_intervals.map((range) => ({
      id: `${lot.stock_lot_id}:${range.basis_segment_id}:${range.offset_quantity}`,
      label: `${source.source_reference} ? ${sourceLabels[source.source_kind]} ? ${range.quantity} ${selectedLine.unit_code} free at offset ${range.offset_quantity}`,
      lot,
      range,
    })) ?? [];
  }) ?? [];

  const allTargetsSelected = targets.every((target) => stockChoices.some(({ lot, range }) =>
    lot.stock_lot_id === target.stock_lot_id && range.basis_segment_id === target.basis_segment_id
    && range.offset_quantity === target.offset_quantity
    && String(lot.stock_version) === target.expected_stock_version
    && String(lot.material_version) === target.expected_lot_material_version,
  ));
  const canSubmit = !busy && !opBlockReason
    && (opKind !== 'prepare' || (queueState === 'ready' && selectedLine && allTargetsSelected))
    && (opKind !== 'commit' || (rfId && prepId));

  function reloadPicker() {
    setReviewData(null);
    setReviewGeneration('');
    setTargets([emptyStockTarget()]);
    setPickerRevision((revision) => revision + 1);
  }

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: `Reservation/Hold (${opKind})`,
      baseVersion: Number.parseInt(expectedVersion, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({
        rfId,
        rfLineId,
        prepId,
        reservationId,
        holdId,
        opKind,
        reasonCode,
        reason,
        resolution,
        overridePolicyId,
        treatmentSourceId,
      }),
    });
    setStatusMessage('Reservation and hold changes saved as a temporary draft for this session.');
  }

  const loadRfAllocations = useCallback(async () => {
    if (!rfId.trim()) {
      return;
    }
    setError(null);
    try {
      const [rev, resv] = await Promise.all([
        apiGet<AllocationReviewData>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/allocation-review`),
        apiGet<ReservationRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations?limit=25`),
      ]);
      setReviewData(rev.data);
      setReservations(resv.data);
      if (rev.data.rf) {
        setExpectedRfVersion(String(rev.data.rf.version));
        setExpectedRfMaterialVersion(String(rev.data.rf.material_version));
        setExpectedRfProgressVersion(String(rev.data.rf.progress_version));
      }
      if (!rfLineId && rev.data.lines?.[0]?.rf_line_id) {
        setRfLineId(rev.data.lines[0].rf_line_id);
      }
      if (!reservationId && resv.data[0]?.id) {
        setReservationId(resv.data[0].id);
      }
    } catch (err) {
      setError(err);
    }
  }, [chapterId, rfId, rfLineId, reservationId]);

  useEffect(() => {
    if (opKind === 'prepare' || opKind === 'commit' || refreshSignal === 0 || !rfId.trim()) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [rev, resv] = await Promise.all([
          apiGet<AllocationReviewData>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/allocation-review`),
          apiGet<ReservationRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations?limit=25`),
        ]);
        if (!active) {
          return;
        }
        setReviewData(rev.data);
        setReservations(resv.data);
        setError(null);
        if (rev.data.rf) {
          setExpectedRfVersion(String(rev.data.rf.version));
          setExpectedRfMaterialVersion(String(rev.data.rf.material_version));
          setExpectedRfProgressVersion(String(rev.data.rf.progress_version));
        }
      } catch (err) {
        if (active) {
          setError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterId, opKind, rfId, refreshSignal]);

  function buildBody(): Record<string, unknown> {
    const rfVers = {
      expected_rf_version: Number.parseInt(expectedRfVersion, 10) || 1,
      expected_rf_material_version: Number.parseInt(expectedRfMaterialVersion, 10) || 1,
      expected_rf_progress_version: Number.parseInt(expectedRfProgressVersion, 10) || 1,
    };
    const entVers = {
      expected_version: Number.parseInt(expectedVersion, 10) || 1,
      expected_material_version: Number.parseInt(expectedMaterialVersion, 10) || 1,
    };

    switch (opKind) {
      case 'prepare':
        return {
          ...rfVers,
          rf_line_id: rfLineId.trim(),
          targets: toWireTargets(targets),
          override_policy_id: overridePolicyId.trim() || null,
          reason: reason.trim(),
        };
      case 'commit':
        return { ...rfVers, expected_preparation_version: Number.parseInt(expectedPrepVersion, 10) || 1 };
      case 'release':
        return { ...entVers, ...rfVers, ranges: toWireRanges(ranges), reason: reason.trim(), release_kind: releaseKind };
      case 'reallocate':
        return {
          ...entVers,
          ...rfVers,
          from_ranges: toWireRanges(ranges),
          to_targets: toWireTargets(targets),
          override_policy_id: overridePolicyId.trim() || null,
          reason: reason.trim(),
        };
      case 'placeHold':
        return { targets: toWireTargets(targets), reason_code: reasonCode.trim(), reason: reason.trim() };
      case 'proposeClear':
        return {
          ...entVers,
          resolution: resolution.trim(),
          condition_treatment_source_id: treatmentSourceId.trim() || null,
          signatories: signatories.map((s) => ({
            user_id: s.user_id.trim(),
            membership_id: s.membership_id.trim(),
            duty_grant_id: s.duty_grant_id.trim(),
            signed_at: s.signed_at.trim(),
          })),
        };
      case 'clearHold':
        return {
          ...entVers,
          expected_snapshot: {
            target: { purpose: 'hold_clearance', record_id: holdId.trim() },
            material_version: Number.parseInt(expectedSnapshotMatVer, 10) || 1,
            sha256: expectedSnapshotSha.trim(),
          },
          evidence: toWireEvidenceBinding(evidenceBinding),
          matches_paper: matchesPaper,
        };
    }
  }

  async function executeAction(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setReplayed(false);

    const base = `/api/v1/chapters/${chapterId}`;
    const targetMap: Record<ResHoldOp, { method: 'POST' | 'PUT'; path: string }> = {
      prepare: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservation-preparations` },
      commit: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservation-preparations/${prepId.trim()}/commit` },
      release: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/release` },
      reallocate: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/reallocate` },
      placeHold: { method: 'POST', path: `${base}/stock-holds` },
      proposeClear: { method: 'PUT', path: `${base}/stock-holds/${holdId.trim()}/clearance-proposal` },
      clearHold: { method: 'POST', path: `${base}/stock-holds/${holdId.trim()}/clear` },
    };

    const target = targetMap[opKind];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, buildBody(), key);
      const { record, operationId } = unwrapMutationData<Record<string, unknown>>(result.data);
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(result.replayed);
      setResultJson(result.data);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      const returnedId =
        typeof record.id === 'string'
          ? record.id
          : typeof record.preparation_id === 'string'
            ? record.preparation_id
            : undefined;
      if (opKind === 'prepare' && returnedId) {
        setPrepId(returnedId);
        setExpectedPrepVersion(String(record.version));
        setOpKind('commit');
      } else if (opKind === 'commit' && returnedId) {
        setReservationId(returnedId);
        setPrepId('');
        setOpKind('prepare');
        reloadPicker();
      } else if (opKind === 'placeHold' && returnedId) {
        setHoldId(returnedId);
      }
      if (typeof record.version === 'number') {
        setExpectedVersion(String(record.version));
      }
      if (typeof record.material_version === 'number') {
        setExpectedMaterialVersion(String(record.material_version));
      }
      const proposal =
        record.clearance_proposal && typeof record.clearance_proposal === 'object'
          ? (record.clearance_proposal as Record<string, unknown>)
          : null;
      const clearanceSha =
        typeof proposal?.material_sha256 === 'string'
          ? proposal.material_sha256
          : typeof record.clearance_material_sha256 === 'string'
            ? record.clearance_material_sha256
            : undefined;
      if (clearanceSha) {
        setExpectedSnapshotSha(clearanceSha);
      }
      const actionLabels: Record<ResHoldOp, string> = {
        prepare: 'Reservation prepared',
        commit: 'Reservation confirmed',
        release: 'Reserved stock released',
        reallocate: 'Reservation moved',
        placeHold: 'Stock hold placed',
        proposeClear: 'Hold clearance submitted',
        clearHold: 'Stock hold cleared',
      };
      setStatusMessage(`${actionLabels[opKind]}. Reference: ${key}`);
      if (opKind !== 'prepare' && opKind !== 'commit') {
        await loadHolds();
        if (rfId.trim()) await loadRfAllocations();
      }
    } catch (err) {
      setError(err);
      if ((opKind === 'prepare' || opKind === 'commit') && err instanceof ContractApiError && [403, 404, 409].includes(err.status)) {
        setPrepId('');
        setOpKind('prepare');
        reloadPicker();
        setStatusMessage('Availability or access changed. Choose a current stock range and prepare again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function inspectSubresource(url: string) {
    setError(null);
    try {
      const res = await apiGet<unknown>(url);
      setResultJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/reservation-operations/by-key${buildQuery({ action_key: lookupKey.trim() })}`,
      );
      setResultJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function lookupByOpId(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupOpId.trim()) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/reservation-operations/${lookupOpId.trim()}`);
      setResultJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          {opKind === 'prepare' ? (
            <div className="form-stack">
              <SearchableRecordPicker
                label="Approved RF line"
                options={queue.map((entry) => ({
                  id: entry.rf_line_id,
                  label: `${entry.rf_reference} ? ${entry.item_code} / ${entry.variant_code} ? ${entry.variant_label} ? ${entry.unreserved_outstanding_quantity} ${entry.unit_code} needed`,
                }))}
                value={rfLineId}
                disabled={busy || queueState !== 'ready'}
                onSelect={chooseRfLine}
              />
              {queueState === 'loading' && !opBlockReason ? <p role="status">Loading allocation queue?</p> : null}
              {queueState === 'failed' ? <button type="button" onClick={reloadPicker}>Reload allocation queue</button> : null}
            </div>
          ) : opKind !== 'commit' && (
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                id="res-rf"
                className="form-control p03-search-input"
                value={rfId}
                onChange={(e) => setRfId(e.target.value)}
                placeholder="Enter requisition reference to load stock allocations..."
                aria-label="Enter requisition reference"
              />
            </div>

            <div className="p03-search-meta">
              {rfId.trim().length > 0 && (
                <button
                  type="button"
                  className="p03-search-clear-btn"
                  onClick={() => setRfId('')}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="p03-search-clear-btn"
                onClick={() => void loadHolds()}
              >
                Reload Holds
              </button>
              <button
                type="button"
                className="p03-search-action-btn"
                onClick={() => void loadRfAllocations()}
                disabled={!rfId.trim()}
              >
                Load Allocations
              </button>
            </div>
          </div>
          )}

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Stock Reservations &amp; Holds</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Reservations and holds views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'actions'}
                  className={`p03-filter-pill ${viewTab === 'actions' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('actions')}
                >
                  Reserve &amp; Hold Actions
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'records'}
                  className={`p03-filter-pill ${viewTab === 'records' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('records')}
                >
                  Reservations &amp; Holds ({reservations.length + holds.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'status'}
                  className={`p03-filter-pill ${viewTab === 'status' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('status')}
                >
                  History &amp; Status
                </button>
              </div>
              {onBackToDashboard && (
                <button
                  type="button"
                  className="btn-batcave-secondary p03-shrink-btn p04-back-btn"
                  onClick={onBackToDashboard}
                >
                  ← Back to My Work
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="p03-card surface-card form-stack" aria-label="Reservations and holds overview">
          <div className="p03-card-header-row">
            <div>
              <h2 className="p03-section-title">Allocations &amp; Custody Holds</h2>
              <p className="form-card-subtitle">
                Reserve available stock batches for approved requisitions or manage frozen stock holds.
              </p>
            </div>
            <div className="p03-chip-wrap">
              <span className="p03-version-pill">{reservations.length} Reservations</span>
              <span className="p03-version-pill">{holds.length} Holds</span>
            </div>
          </div>
          <OperationBanner
            error={error}
            statusMessage={statusMessage}
            replayed={replayed}
            onDismiss={() => setStatusMessage(null)}
          />
        </section>

        {viewTab === 'actions' && (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card form-stack" aria-label="Context references and holds">
                <h2 className="p03-section-title">
                  Active Context References
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="res-prep">
                      Preparation Reference
                    </label>
                    {opKind === 'prepare' || opKind === 'commit' ? (
                      <p id="res-prep">{prepId ? 'Ready to commit' : 'No reservation prepared'}</p>
                    ) : (
                      <input
                        id="res-prep"
                        className="form-control"
                        value={prepId}
                        onChange={(e) => setPrepId(e.target.value)}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="res-id">
                      Reservation Reference
                    </label>
                    <input
                      id="res-id"
                      className="form-control"
                      value={reservationId}
                      onChange={(e) => setReservationId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="hold-id">
                    Stock Hold Reference
                  </label>
                  <input
                    id="hold-id"
                    className="form-control"
                    value={holdId}
                    onChange={(e) => setHoldId(e.target.value)}
                  />
                </div>

                <div className="p03-next-actions-row">
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    disabled={!rfId.trim() || !prepId.trim()}
                    onClick={() => {
                      void inspectSubresource(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservation-preparations/${prepId.trim()}`);
                      setViewTab('status');
                    }}
                  >
                    Read Preparation
                  </button>
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    disabled={!rfId.trim() || !reservationId.trim()}
                    onClick={() => {
                      void inspectSubresource(
                        `/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/history?limit=25`,
                      );
                      setViewTab('status');
                    }}
                  >
                    Reservation History
                  </button>
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    disabled={!holdId.trim()}
                    onClick={() => {
                      void inspectSubresource(`/api/v1/chapters/${chapterId}/stock-holds/${holdId.trim()}/history?limit=25`);
                      setViewTab('status');
                    }}
                  >
                    Hold History
                  </button>
                </div>

                {holds.length > 0 && (
                  <div className="form-stack">
                    <h3 className="s02-drawer-subhead">
                      Chapter Stock Holds ({holds.length})
                    </h3>
                    <div className="p03-history-list">
                      {holds.slice(0, 6).map((hold) => (
                        <article
                          key={hold.id}
                          className={`p03-history-card ${holdId === hold.id ? 'is-search-match' : ''}`}
                        >
                          <div className="p03-history-head">
                            <div className="p03-history-title-group">
                              <strong>{hold.reason_code.replace(/_/g, ' ')}</strong>
                              <span className={`s02-status-tag ${hold.status === 'cleared' ? 'is-ready' : 'is-uncertain'}`}>
                                {hold.status}
                              </span>
                              <span className="p03-version-pill">rev. {hold.version}</span>
                            </div>
                            <button
                              type="button"
                              className="p02-compact-btn"
                              onClick={() => {
                                setHoldId(hold.id);
                                setExpectedVersion(String(hold.version));
                                setExpectedMaterialVersion(String(hold.material_version));
                              }}
                            >
                              Select
                            </button>
                          </div>
                          {hold.reason && <div className="p03-history-meta">{hold.reason}</div>}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card form-stack" aria-label="Update reservation or stock hold">
                <h2 className="p03-section-title">
                  Update Reservation or Stock Hold
                </h2>

                {opBlockReason && (
                  <div className="callout-banner is-warning">
                    <span className="callout-dot dot-warning" aria-hidden="true" />
                    <span>{opBlockReason}</span>
                  </div>
                )}

                <form onSubmit={executeAction} className="form-stack">
                  <div className="form-group">
                    <label className="form-label" htmlFor="rh-op">
                      Action
                    </label>
                    <select
                      id="rh-op"
                      className="form-control"
                      value={opKind}
                      onChange={(e) => setOpKind(e.target.value as ResHoldOp)}
                    >
                      <option value="prepare">1. Prepare Stock Reservation</option>
                      <option value="commit">2. Confirm Prepared Reservation</option>
                      <option value="release">Release Reserved Stock</option>
                      <option value="reallocate">Move Reservation to Another Batch</option>
                      <option value="placeHold">Place Stock on Hold</option>
                      <option value="proposeClear">Submit Hold Clearance &amp; Signatories</option>
                      <option value="clearHold">Finalize Stock Hold Clearance</option>
                    </select>
                  </div>

                  {(opKind === 'release' || opKind === 'reallocate') && (
                    <div className="p02-three-col-grid">
                      <div className="form-group">
                        <label className="form-label">Requisition Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedRfVersion}
                          onChange={(e) => setExpectedRfVersion(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Content Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedRfMaterialVersion}
                          onChange={(e) => setExpectedRfMaterialVersion(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Progress Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedRfProgressVersion}
                          onChange={(e) => setExpectedRfProgressVersion(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {(opKind === 'release' || opKind === 'reallocate' || opKind === 'proposeClear' || opKind === 'clearHold') && (
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label">Current Record Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedVersion}
                          onChange={(e) => setExpectedVersion(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Current Content Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedMaterialVersion}
                          onChange={(e) => setExpectedMaterialVersion(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {(opKind === 'release' || opKind === 'reallocate') && (
                    <StockRangeRows label="Stock Batches to Release" rows={ranges} onChange={setRanges} />
                  )}

                  {opKind === 'prepare' ? (
                      <div className="form-stack">
                        {targets.map((target, index) => {
                          const selection = stockChoices.find((choice) => choice.lot.stock_lot_id === target.stock_lot_id
                            && choice.range.basis_segment_id === target.basis_segment_id
                            && choice.range.offset_quantity === target.offset_quantity);
                          function updateTarget(next: StockTargetInput) {
                            setTargets((rows) => rows.map((row, position) => position === index ? next : row));
                          }
                          return (
                            <div className="form-stack" key={index}>
                              <SearchableRecordPicker
                                label={`Free stock range ${index + 1}`}
                                options={stockChoices}
                                value={selection?.id ?? ''}
                                onSelect={(id) => {
                                  const choice = stockChoices.find((option) => option.id === id);
                                  updateTarget(choice ? {
                                    stock_lot_id: choice.lot.stock_lot_id,
                                    basis_segment_id: choice.range.basis_segment_id,
                                    offset_quantity: choice.range.offset_quantity,
                                    quantity: choice.range.quantity,
                                    expected_lot_material_version: String(choice.lot.material_version),
                                    expected_stock_version: String(choice.lot.stock_version),
                                  } : emptyStockTarget());
                                }}
                                disabled={busy || !selectedLine || requestedReview !== reviewGeneration}
                              />
                              {selection ? (
                                <label className="form-group">
                                  <span className="form-label">Reserve quantity {index + 1}</span>
                                  <input
                                    className="form-control"
                                    inputMode="decimal"
                                    required
                                    value={target.quantity}
                                    onChange={(event) => updateTarget({ ...target, quantity: event.target.value })}
                                  />
                                </label>
                              ) : null}
                              {targets.length > 1 ? (
                                <button type="button" onClick={() => setTargets((rows) => rows.filter((_, position) => position !== index))}>
                                  Remove range {index + 1}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {stockChoices.length > 1 && targets.length < 50 ? (
                          <button type="button" onClick={() => setTargets((rows) => [...rows, emptyStockTarget()])}>Add range</button>
                        ) : null}
                      </div>
                    ) : (opKind === 'reallocate' || opKind === 'placeHold') && (
                      <StockTargetRows label="Selected Stock Batch Allocations" rows={targets} onChange={setTargets} />
                    )}

                  {(opKind === 'prepare' || opKind === 'reallocate') && (
                    <div className="form-group">
                      <label className="form-label">Override Policy Reference (optional)</label>
                      <input
                        className="form-control"
                        value={overridePolicyId}
                        onChange={(e) => setOverridePolicyId(e.target.value)}
                      />
                    </div>
                  )}

                  {opKind === 'release' && (
                    <div className="form-group">
                      <label className="form-label">Release Type</label>
                      <select
                        className="form-control"
                        value={releaseKind}
                        onChange={(e) => setReleaseKind(e.target.value as 'release' | 'cancel_commitment')}
                      >
                        <option value="release">Return Reserved Quantity</option>
                        <option value="cancel_commitment">Cancel Reservation</option>
                      </select>
                    </div>
                  )}

                  {opKind === 'placeHold' && (
                    <div className="form-group">
                      <label className="form-label">Hold Reason Category</label>
                      <input
                        className="form-control"
                        required
                        value={reasonCode}
                        onChange={(e) => setReasonCode(e.target.value)}
                      />
                    </div>
                  )}

                  {(opKind === 'prepare' || opKind === 'release' || opKind === 'reallocate' || opKind === 'placeHold') && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="reservation-reason">Reason</label>
                      <input
                        id="reservation-reason"
                        className="form-control"
                        required
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                  )}

                  {opKind === 'proposeClear' && (
                    <>
                      <div className="p03-two-col">
                        <div className="form-group">
                          <label className="form-label">Clearance Resolution</label>
                          <input
                            className="form-control"
                            required
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Related Treatment Reference (optional)</label>
                          <input
                            className="form-control"
                            value={treatmentSourceId}
                            onChange={(e) => setTreatmentSourceId(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-stack">
                        <div className="p04-line-top">
                          <span className="form-label">
                            Paper Signatories (1–10)
                          </span>
                          <button
                            type="button"
                            className="p02-compact-btn"
                            onClick={() => setSignatories((prev) => [...prev, emptySignatory()])}
                          >
                            + Add Signatory
                          </button>
                        </div>

                        <div className="p04-lines-list">
                          {signatories.map((s, idx) => (
                            <div key={idx} className="p04-line-card">
                              <div className="p04-line-top">
                                <span className="p03-version-pill">Signatory #{idx + 1}</span>
                                {signatories.length > 1 && (
                                  <button
                                    type="button"
                                    className="p02-compact-btn is-subtle-danger"
                                    onClick={() => setSignatories((p) => p.filter((_, i) => i !== idx))}
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <div className="p03-two-col">
                                <div className="form-group">
                                  <label className="form-label">Signatory Officer Reference</label>
                                  <input
                                    className="form-control"
                                    required
                                    value={s.user_id}
                                    onChange={(e) =>
                                      setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, user_id: e.target.value } : x)))
                                    }
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Membership Reference</label>
                                  <input
                                    className="form-control"
                                    required
                                    value={s.membership_id}
                                    onChange={(e) =>
                                      setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, membership_id: e.target.value } : x)))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="p03-two-col">
                                <div className="form-group">
                                  <label className="form-label">Role Assignment Reference</label>
                                  <input
                                    className="form-control"
                                    required
                                    value={s.duty_grant_id}
                                    onChange={(e) =>
                                      setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, duty_grant_id: e.target.value } : x)))
                                    }
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Date &amp; Time Signed</label>
                                  <input
                                    className="form-control"
                                    required
                                    value={s.signed_at}
                                    onChange={(e) =>
                                      setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, signed_at: e.target.value } : x)))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {opKind === 'clearHold' && (
                    <>
                      <div className="p03-two-col">
                        <div className="form-group">
                          <label className="form-label">Signed Document Version</label>
                          <input
                            className="form-control"
                            type="number"
                            min={1}
                            required
                            value={expectedSnapshotMatVer}
                            onChange={(e) => setExpectedSnapshotMatVer(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Signed Document Verification Tag</label>
                          <input
                            className="form-control"
                            required
                            value={expectedSnapshotSha}
                            onChange={(e) => setExpectedSnapshotSha(e.target.value)}
                          />
                        </div>
                      </div>
                      <EvidenceBindingFields
                        label="Ready Signed Document Binding"
                        value={evidenceBinding}
                        onChange={setEvidenceBinding}
                      />
                      <label className={`p03-checkbox-row ${matchesPaper ? 'is-checked' : ''}`}>
                        <input
                          type="checkbox"
                          className="p03-sr-checkbox"
                          checked={matchesPaper}
                          onChange={(e) => setMatchesPaper(e.target.checked)}
                        />
                        <span className={`p03-check-indicator ${matchesPaper ? 'is-checked' : ''}`} aria-hidden="true">
                          ✓
                        </span>
                        <span className="p03-checkbox-main">
                          I confirm the physically inspected paper form matches this clearance record
                        </span>
                      </label>
                    </>
                  )}

                  <div className="p03-guard-buttons">
                    <button
                      className="btn-batcave-primary"
                      type="submit"
                      disabled={!canSubmit}
                      title={opBlockReason ?? undefined}
                    >
                      {opKind === 'prepare' ? 'Prepare reservation' : opKind === 'commit' ? 'Commit reservation' : 'Run Action'}
                    </button>
                    <button
                      className="btn-batcave-secondary"
                      type="button"
                      onClick={parkDraftInMemory}
                    >
                      Save Temporary Draft
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {viewTab === 'records' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Requisition reservations">
              <h2 className="p03-section-title">
                Requisition Reservations ({reservations.length})
              </h2>
              {reservations.length === 0 && reviewData === null ? (
                <p className="p03-muted-copy">
                  No reservations loaded. Enter a requisition reference in the top search bar and click “Load Allocations”.
                </p>
              ) : (
                <pre className="json-box">{JSON.stringify({ review: reviewData, reservations }, null, 2)}</pre>
              )}
            </section>

            <section className="p03-card surface-card form-stack" aria-label="Chapter stock holds">
              <h2 className="p03-section-title">
                Chapter Stock Holds ({holds.length})
              </h2>
              {holds.length === 0 ? (
                <p className="p03-muted-copy">
                  No stock holds recorded. Active and historical stock holds appear here once recorded.
                </p>
              ) : (
                <pre className="json-box">{JSON.stringify(holds, null, 2)}</pre>
              )}
            </section>
          </div>
        )}

        {viewTab === 'status' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Check submitted action status">
              <h2 className="p03-section-title">
                Check Submitted Action Status
              </h2>
              <div className="form-stack">
                <form onSubmit={lookupByKey} className="form-group">
                  <label className="form-label" htmlFor="rh-lkp">
                    Submission Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="rh-lkp"
                      className="form-control"
                      required
                      value={lookupKey}
                      onChange={(e) => setLookupKey(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      Check Reference
                    </button>
                  </div>
                </form>

                <form onSubmit={lookupByOpId} className="form-group">
                  <label className="form-label" htmlFor="rh-opid">
                    Change Record Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="rh-opid"
                      className="form-control"
                      required
                      value={lookupOpId}
                      onChange={(e) => setLookupOpId(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      View Record
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="p03-card surface-card form-stack" aria-label="History and status output">
              <h2 className="p03-section-title">
                Status &amp; History Output
              </h2>
              {resultJson === null ? (
                <p className="p03-muted-copy">
                  No result loaded. Inspect a preparation or hold history, or search by submission reference on the left.
                </p>
              ) : (
                <pre className="json-box">{JSON.stringify(resultJson, null, 2)}</pre>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
