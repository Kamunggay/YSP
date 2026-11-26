import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
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

interface CandidateLotInfo {
  stock_lot_id: string;
  basis_segment_id: string;
  quantity_on_hand: string;
  stock_version: number;
  material_version: number;
}

interface AllocationReviewLine {
  rf_line_id: string;
  variant_id: string;
  unit_id: string;
  candidate_lots?: CandidateLotInfo[];
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

export function ReservationAndHoldWorkspace({ userId, chapterId, refreshSignal, chapterAccess }: ReservationAndHoldWorkspaceProps) {
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
    setStatusMessage('Reservation/hold inputs held in chapter-scoped RAM only.');
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
    if (refreshSignal === 0 || !rfId.trim()) {
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
  }, [chapterId, rfId, refreshSignal]);

  function applyCandidateLot(lot: CandidateLotInfo) {
    setTargets([
      {
        stock_lot_id: lot.stock_lot_id,
        basis_segment_id: lot.basis_segment_id,
        offset_quantity: '0',
        quantity: lot.quantity_on_hand,
        expected_lot_material_version: String(lot.material_version),
        expected_stock_version: String(lot.stock_version),
      },
    ]);
    setStatusMessage(`Prefilled target from candidate lot ${lot.stock_lot_id.slice(0, 8)} (stock v${lot.stock_version}).`);
  }

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
      } else if (opKind === 'commit' && returnedId) {
        setReservationId(returnedId);
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
      setStatusMessage(`${opKind} executed cleanly. Key: ${key}`);
      await loadHolds();
      if (rfId.trim()) {
        await loadRfAllocations();
      }
    } catch (err) {
      setError(err);
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
    <div>
      <div className="card">
        <h2>Two-Step Reservations &amp; HTTP Stock Holds (`Ticket 07`)</h2>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <div className="field">
            <label htmlFor="res-rf">rf_id UUID</label>
            <input id="res-rf" value={rfId} onChange={(e) => setRfId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="res-prep">preparation_id UUID</label>
            <input id="res-prep" value={prepId} onChange={(e) => setPrepId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="res-id">reservation_id UUID</label>
            <input id="res-id" value={reservationId} onChange={(e) => setReservationId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hold-id">hold_id UUID</label>
            <input id="hold-id" value={holdId} onChange={(e) => setHoldId(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn secondary" onClick={() => void loadRfAllocations()} disabled={!rfId.trim()}>
            Load RF Allocation Review
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!rfId.trim() || !prepId.trim()}
            onClick={() => void inspectSubresource(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservation-preparations/${prepId.trim()}`)}
          >
            Read Preparation
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!rfId.trim() || !reservationId.trim()}
            onClick={() =>
              void inspectSubresource(
                `/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/history?limit=25`,
              )
            }
          >
            Reservation History
          </button>
          <button type="button" className="btn secondary" onClick={() => void loadHolds()}>
            Reload Holds
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={!holdId.trim()}
            onClick={() => void inspectSubresource(`/api/v1/chapters/${chapterId}/stock-holds/${holdId.trim()}/history?limit=25`)}
          >
            Hold History
          </button>
        </div>

        {reviewData?.lines && reviewData.lines.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <h4>Candidate Lots From Allocation Review</h4>
            {reviewData.lines.map((ln) => (
              <div key={ln.rf_line_id} className="row" style={{ marginBottom: '0.4rem' }}>
                <span className="mono muted">Line {ln.rf_line_id}</span>
                {(ln.candidate_lots ?? []).map((lot) => (
                  <button key={lot.stock_lot_id} type="button" className="btn secondary" onClick={() => applyCandidateLot(lot)}>
                    Prefill Lot {lot.stock_lot_id.slice(0, 8)} (qty {lot.quantity_on_hand})
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="grid-2">
          <div>
            <h4>RF Reservations ({reservations.length})</h4>
            <pre className="json-box">{JSON.stringify({ review: reviewData, reservations }, null, 2)}</pre>
          </div>
          <div>
            <h4>Chapter Stock Holds ({holds.length})</h4>
            <pre className="json-box">{JSON.stringify(holds, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Reservation or Stock Hold Action (`X-Action-Key`)</h3>
          <form onSubmit={executeAction}>
            <div className="field" style={{ marginBottom: '0.6rem' }}>
              <label htmlFor="rh-op">Operation</label>
              <select id="rh-op" value={opKind} onChange={(e) => setOpKind(e.target.value as ResHoldOp)}>
                <option value="prepare">1. POST Prepare Reservation</option>
                <option value="commit">2. POST Commit Prepared Reservation</option>
                <option value="release">POST Release Reservation Ranges</option>
                <option value="reallocate">POST Reallocate Reservation</option>
                <option value="placeHold">POST Place Stock Hold</option>
                <option value="proposeClear">PUT Propose Hold Clearance (Signatories)</option>
                <option value="clearHold">POST Clear Hold (matches_paper)</option>
              </select>
            </div>

            {(opKind === 'prepare' || opKind === 'commit' || opKind === 'release' || opKind === 'reallocate') && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>expected_rf_version</label>
                  <input type="number" min={1} required value={expectedRfVersion} onChange={(e) => setExpectedRfVersion(e.target.value)} />
                </div>
                <div className="field">
                  <label>expected_rf_material_version</label>
                  <input type="number" min={1} required value={expectedRfMaterialVersion} onChange={(e) => setExpectedRfMaterialVersion(e.target.value)} />
                </div>
                <div className="field">
                  <label>expected_rf_progress_version</label>
                  <input type="number" min={1} required value={expectedRfProgressVersion} onChange={(e) => setExpectedRfProgressVersion(e.target.value)} />
                </div>
              </div>
            )}

            {(opKind === 'release' || opKind === 'reallocate' || opKind === 'proposeClear' || opKind === 'clearHold') && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>expected_version</label>
                  <input type="number" min={1} required value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)} />
                </div>
                <div className="field">
                  <label>expected_material_version</label>
                  <input type="number" min={1} required value={expectedMaterialVersion} onChange={(e) => setExpectedMaterialVersion(e.target.value)} />
                </div>
              </div>
            )}

            {opKind === 'prepare' && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>rf_line_id UUID</label>
                <input required value={rfLineId} onChange={(e) => setRfLineId(e.target.value)} />
              </div>
            )}

            {opKind === 'commit' && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>expected_preparation_version</label>
                <input type="number" min={1} required value={expectedPrepVersion} onChange={(e) => setExpectedPrepVersion(e.target.value)} />
              </div>
            )}

            {(opKind === 'release' || opKind === 'reallocate') && <StockRangeRows label="Owned From Ranges" rows={ranges} onChange={setRanges} />}

            {(opKind === 'prepare' || opKind === 'reallocate' || opKind === 'placeHold') && (
              <StockTargetRows label="Selected Disjoint Stock Targets" rows={targets} onChange={setTargets} />
            )}

            {(opKind === 'prepare' || opKind === 'reallocate') && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>override_policy_id UUID (optional)</label>
                <input value={overridePolicyId} onChange={(e) => setOverridePolicyId(e.target.value)} />
              </div>
            )}

            {opKind === 'release' && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>release_kind</label>
                <select value={releaseKind} onChange={(e) => setReleaseKind(e.target.value as 'release' | 'cancel_commitment')}>
                  <option value="release">release</option>
                  <option value="cancel_commitment">cancel_commitment</option>
                </select>
              </div>
            )}

            {opKind === 'placeHold' && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>reason_code</label>
                <input required value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} />
              </div>
            )}

            {(opKind === 'prepare' || opKind === 'release' || opKind === 'reallocate' || opKind === 'placeHold') && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label>Reason</label>
                <input required value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}

            {opKind === 'proposeClear' && (
              <>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field">
                    <label>Clearance Resolution</label>
                    <input required value={resolution} onChange={(e) => setResolution(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>condition_treatment_source_id UUID (optional)</label>
                    <input value={treatmentSourceId} onChange={(e) => setTreatmentSourceId(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: '0.65rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <strong>Paper Signatories (1..10)</strong>
                    <button type="button" className="btn secondary" onClick={() => setSignatories((prev) => [...prev, emptySignatory()])}>
                      + Add Signatory
                    </button>
                  </div>
                  {signatories.map((s, idx) => (
                    <div key={idx} className="row" style={{ marginBottom: '0.35rem', padding: '0.4rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div className="field">
                        <label>user_id</label>
                        <input
                          required
                          value={s.user_id}
                          onChange={(e) => setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, user_id: e.target.value } : x)))}
                        />
                      </div>
                      <div className="field">
                        <label>membership_id</label>
                        <input
                          required
                          value={s.membership_id}
                          onChange={(e) => setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, membership_id: e.target.value } : x)))}
                        />
                      </div>
                      <div className="field">
                        <label>duty_grant_id</label>
                        <input
                          required
                          value={s.duty_grant_id}
                          onChange={(e) => setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, duty_grant_id: e.target.value } : x)))}
                        />
                      </div>
                      <div className="field">
                        <label>signed_at</label>
                        <input
                          required
                          value={s.signed_at}
                          onChange={(e) => setSignatories((p) => p.map((x, i) => (i === idx ? { ...x, signed_at: e.target.value } : x)))}
                        />
                      </div>
                      {signatories.length > 1 && (
                        <button type="button" className="btn secondary" onClick={() => setSignatories((p) => p.filter((_, i) => i !== idx))}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {opKind === 'clearHold' && (
              <>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field" style={{ maxWidth: '9rem' }}>
                    <label>Snapshot material_version</label>
                    <input type="number" min={1} required value={expectedSnapshotMatVer} onChange={(e) => setExpectedSnapshotMatVer(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>expected_snapshot.sha256</label>
                    <input required value={expectedSnapshotSha} onChange={(e) => setExpectedSnapshotSha(e.target.value)} />
                  </div>
                </div>
                <EvidenceBindingFields label="Ready Paper Evidence Binding" value={evidenceBinding} onChange={setEvidenceBinding} />
                <label className="row" style={{ marginBottom: '0.65rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={matchesPaper} onChange={(e) => setMatchesPaper(e.target.checked)} />
                  <span>Confirmed physically inspected paper matches proposal (`matches_paper: true`)</span>
                </label>
              </>
            )}

            {opBlockReason && <div className="alert info">{opBlockReason}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={busy || opBlockReason !== null} title={opBlockReason ?? undefined}>
                Run Action
              </button>
              <button className="btn secondary" type="button" onClick={parkDraftInMemory}>
                Hold Draft in RAM
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Reservation / Hold Outcome Recovery</h3>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="rh-lkp">X-Action-Key UUID</label>
                <input id="rh-lkp" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Lookup by Key
              </button>
            </div>
          </form>
          <form onSubmit={lookupByOpId}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="rh-opid">operation_id UUID</label>
                <input id="rh-opid" required value={lookupOpId} onChange={(e) => setLookupOpId(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Read Operation ID
              </button>
            </div>
          </form>
          {resultJson !== null && <pre className="json-box">{JSON.stringify(resultJson, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}
