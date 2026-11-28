import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiMutate, buildQuery, ContractApiError, formatManilaTime, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot, ChapterContext } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker, type SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
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
import { EvidenceBindingFields } from '../components/StructuredInputRows.tsx';
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
  rf_line_id?: string;
  allocations?: Array<{
    stock_lot_id: string;
    basis_segment_id: string;
    offset_quantity: string;
    quantity: string;
  }>;
}

interface CandidateFreeInterval {
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
  restriction_state: 'unrestricted' | 'bounded';
}

interface CandidateLotInfo {
  stock_lot_id: string;
  source_kind?: 'opening_rm' | 'po_rm' | 'da_rm';
  source_reference?: string;
  location_id?: string;
  basis_segment_id: string;
  quantity_on_hand: string;
  free_quantity?: string;
  restriction_state?: 'unrestricted' | 'bounded' | 'uninterpreted';
  free_intervals?: CandidateFreeInterval[];
  stock_version: number;
  material_version: number;
}

interface StockLotSummary {
  id: string;
  basis_segment_id: string;
  historical_variant_label?: string;
  quantity_on_hand: string;
  stock_version: number;
  material_version: number;
  source?: {
    type?: string;
    reference?: string;
  };
}

interface AllocationReviewLine {
  rf_line_id: string;
  variant_id: string;
  unit_id: string;
  views?: {
    eligible_available_to_allocate?: { quantity?: { value?: string } | string };
  };
  candidate_lots?: CandidateLotInfo[];
}

interface AllocationReviewData {
  rf?: {
    id: string;
    reference?: string | null;
    version: number;
    material_version: number;
    progress_version: number;
  };
  lines?: AllocationReviewLine[];
}

interface InternalRfOption {
  id: string;
  reference: string | null;
  status: string;
  fulfillment_status: string;
  requesting_unit_id: string | null;
  needed_at: string | null;
  justification?: string | null;
}

interface AllocationQueueHint {
  rf_id: string;
  rf_line_id: string;
  rf_reference: string;
  queue_position: number;
  allocation_tier: string;
  variant_label: string;
  unit_code: string;
  unreserved_outstanding_quantity: string;
  eligible_available_quantity: string;
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
  chapterContext: ChapterContext | null;
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

function sourceKindLabel(kind?: string): string {
  switch (kind) {
    case 'po_rm':
      return 'Purchase Delivery';
    case 'da_rm':
      return 'Donation Receipt';
    default:
      return 'Opening Balance';
  }
}

export function ReservationAndHoldWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterContext,
  chapterAccess,
  onBackToDashboard,
}: ReservationAndHoldWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'actions' | 'records' | 'status'>('actions');
  const formKey = 'reservation_hold_editor';

  const readSavedDraft = useCallback(() => {
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
        targets?: StockTargetInput[];
      };
    } catch {
      return {};
    }
  }, [userId, chapterId]);

  const initialDraft = readSavedDraft();
  const [rfId, setRfId] = useState(initialDraft.rfId ?? '');
  const [rfLineId, setRfLineId] = useState(initialDraft.rfLineId ?? '');
  const [prepId, setPrepId] = useState(initialDraft.prepId ?? '');
  const [reservationId, setReservationId] = useState(initialDraft.reservationId ?? '');
  const [holdId, setHoldId] = useState(initialDraft.holdId ?? '');

  const [rfList, setRfList] = useState<InternalRfOption[]>([]);
  const [queueHints, setQueueHints] = useState<AllocationQueueHint[]>([]);
  const [rfListLoading, setRfListLoading] = useState(false);
  const [rfListError, setRfListError] = useState<string | null>(null);

  const [chapterLots, setChapterLots] = useState<StockLotSummary[]>([]);
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
  const [overridePolicyId] = useState(initialDraft.overridePolicyId ?? '');
  const [releaseKind, setReleaseKind] = useState<'release' | 'cancel_commitment'>('release');
  const [reasonCode, setReasonCode] = useState(initialDraft.reasonCode ?? 'inspection_hold');
  const [reason, setReason] = useState(initialDraft.reason ?? '');
  const [resolution, setResolution] = useState(initialDraft.resolution ?? '');
  const [treatmentSourceId] = useState(initialDraft.treatmentSourceId ?? '');
  const [expectedSnapshotMatVer, setExpectedSnapshotMatVer] = useState('1');
  const [expectedSnapshotSha, setExpectedSnapshotSha] = useState('');
  const [matchesPaper, setMatchesPaper] = useState(true);

  const [targets, setTargets] = useState<StockTargetInput[]>(initialDraft.targets ?? [emptyStockTarget()]);
  const [ranges, setRanges] = useState<StockRangeInput[]>([emptyStockRange()]);
  const [signatories, setSignatories] = useState<SignatoryInput[]>([emptySignatory()]);
  const [evidenceBinding, setEvidenceBinding] = useState(emptyEvidenceBinding);
  const [clearanceFiles, setClearanceFiles] = useState<FileList | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');
  const [resultJson, setResultJson] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);
  const rfSelectGenRef = useRef(0);
  const skipNextAutoSaveRef = useRef(false);

  const canReadQueue = (chapterContext?.membership?.duties ?? []).some((d) =>
    ['INVENTORY', 'DISPATCH', 'RF_APPROVER', 'CHAPTER_HEAD'].includes(d),
  );

  const loadChapterDiscovery = useCallback(async () => {
    setRfListLoading(true);
    setRfListError(null);
    try {
      const [rfRes, lotsRes, holdsRes] = await Promise.all([
        apiGet<InternalRfOption[]>(`/api/v1/chapters/${chapterId}/internal-rfs?status=approved&limit=50`),
        apiGet<StockLotSummary[]>(`/api/v1/chapters/${chapterId}/stock/lots?limit=50`),
        apiGet<StockHoldRecord[]>(`/api/v1/chapters/${chapterId}/stock-holds?limit=50`),
      ]);
      setRfList(rfRes.data);
      setChapterLots(lotsRes.data);
      setHolds(holdsRes.data);
      if (canReadQueue) {
        try {
          const queueRes = await apiGet<AllocationQueueHint[]>(`/api/v1/chapters/${chapterId}/allocation-queue?limit=50`);
          setQueueHints(queueRes.data);
        } catch {
          setQueueHints([]);
        }
      } else {
        setQueueHints([]);
      }
    } catch (err) {
      setRfListError(err instanceof Error ? err.message : 'Unable to load authorized requisitions.');
    } finally {
      setRfListLoading(false);
    }
  }, [chapterId, canReadQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [rfRes, lotsRes, holdsRes] = await Promise.all([
          apiGet<InternalRfOption[]>(`/api/v1/chapters/${chapterId}/internal-rfs?status=approved&limit=50`),
          apiGet<StockLotSummary[]>(`/api/v1/chapters/${chapterId}/stock/lots?limit=50`),
          apiGet<StockHoldRecord[]>(`/api/v1/chapters/${chapterId}/stock-holds?limit=50`),
        ]);
        if (!active) {
          return;
        }
        setRfList(rfRes.data);
        setChapterLots(lotsRes.data);
        setHolds(holdsRes.data);
        setRfListError(null);
        if (canReadQueue) {
          try {
            const queueRes = await apiGet<AllocationQueueHint[]>(`/api/v1/chapters/${chapterId}/allocation-queue?limit=50`);
            if (active) {
              setQueueHints(queueRes.data);
            }
          } catch {
            if (active) {
              setQueueHints([]);
            }
          }
        }
      } catch (err) {
        if (active) {
          setRfListError(err instanceof Error ? err.message : 'Unable to load authorized requisitions.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterId, canReadQueue, refreshSignal]);

  const loadRfAllocations = useCallback(
    async (explicitRfId?: string) => {
      const targetRf = (explicitRfId ?? rfId).trim();
      if (!targetRf) {
        return;
      }
      setError(null);
      try {
        const [rev, resv] = await Promise.all([
          apiGet<AllocationReviewData>(`/api/v1/chapters/${chapterId}/internal-rfs/${targetRf}/allocation-review`),
          apiGet<ReservationRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs/${targetRf}/reservations?limit=50`),
        ]);
        setReviewData(rev.data);
        setReservations(resv.data);
        if (rev.data.rf) {
          setExpectedRfVersion(String(rev.data.rf.version));
          setExpectedRfMaterialVersion(String(rev.data.rf.material_version));
          setExpectedRfProgressVersion(String(rev.data.rf.progress_version));
        }
        const validLines = rev.data.lines ?? [];
        setRfLineId((prevLine) => {
          if (prevLine && validLines.some((l) => l.rf_line_id === prevLine)) {
            return prevLine;
          }
          return validLines[0]?.rf_line_id ?? '';
        });
        setReservationId((prevRes) => {
          const picked = prevRes && resv.data.some((r) => r.id === prevRes) ? resv.data.find((r) => r.id === prevRes)! : resv.data[0];
          if (picked?.allocations && picked.allocations.length > 0) {
            setExpectedVersion(String(picked.version));
            setExpectedMaterialVersion(String(picked.material_version));
            setRanges((prevRanges) => {
              if (prevRanges.length === 1 && !prevRanges[0].stock_lot_id) {
                return picked.allocations!.map((al) => ({
                  stock_lot_id: al.stock_lot_id,
                  basis_segment_id: al.basis_segment_id,
                  offset_quantity: String(al.offset_quantity),
                  quantity: String(al.quantity),
                }));
              }
              return prevRanges;
            });
          }
          return picked?.id ?? '';
        });
      } catch (err) {
        setError(err);
      }
    },
    [chapterId, rfId],
  );

  useEffect(() => {
    const targetRf = rfId.trim();
    if (!targetRf) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [rev, resv] = await Promise.all([
          apiGet<AllocationReviewData>(`/api/v1/chapters/${chapterId}/internal-rfs/${targetRf}/allocation-review`),
          apiGet<ReservationRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs/${targetRf}/reservations?limit=50`),
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
        const validLines = rev.data.lines ?? [];
        setRfLineId((prevLine) => {
          if (prevLine && validLines.some((l) => l.rf_line_id === prevLine)) {
            return prevLine;
          }
          return validLines[0]?.rf_line_id ?? '';
        });
        setReservationId((prevRes) => {
          const picked = prevRes && resv.data.some((r) => r.id === prevRes) ? resv.data.find((r) => r.id === prevRes)! : resv.data[0];
          if (picked?.allocations && picked.allocations.length > 0) {
            setExpectedVersion(String(picked.version));
            setExpectedMaterialVersion(String(picked.material_version));
            setRanges((prevRanges) => {
              if (prevRanges.length === 1 && !prevRanges[0].stock_lot_id) {
                return picked.allocations!.map((al) => ({
                  stock_lot_id: al.stock_lot_id,
                  basis_segment_id: al.basis_segment_id,
                  offset_quantity: String(al.offset_quantity),
                  quantity: String(al.quantity),
                }));
              }
              return prevRanges;
            });
          }
          return picked?.id ?? '';
        });
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

  function handleSelectRf(nextRfId: string) {
    if (nextRfId === rfId) {
      return;
    }
    rfSelectGenRef.current += 1;
    setRfId(nextRfId);
    // Clear dependent child selections while preserving unrelated form edits
    setRfLineId('');
    setPrepId('');
    setReservationId('');
    setReviewData(null);
    setReservations([]);
    setTargets([emptyStockTarget()]);
    setRanges([emptyStockRange()]);
  }

  // Continuously persist unsaved chapter edits in RAM so switching chapters preserves work automatically
  useEffect(() => {
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const hasUnsaved =
      rfId.trim() !== '' ||
      holdId.trim() !== '' ||
      reason.trim() !== '' ||
      resolution.trim() !== '' ||
      targets.some((t) => t.stock_lot_id.trim() !== '' || t.quantity !== '1');
    if (!hasUnsaved) {
      return;
    }
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
        targets,
      }),
    });
  }, [
    userId,
    chapterId,
    formKey,
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
    targets,
    expectedVersion,
  ]);

  function handleSelectRfLine(nextLineId: string) {
    setRfLineId(nextLineId);
    setTargets([emptyStockTarget()]);
  }

  const activeReviewLine = useMemo(
    () => reviewData?.lines?.find((l) => l.rf_line_id === rfLineId) ?? reviewData?.lines?.[0] ?? null,
    [reviewData, rfLineId],
  );

  const rfPickerOptions = useMemo<Array<SearchablePickerOption<InternalRfOption>>>(() => {
    const queueMap = new Map<string, AllocationQueueHint>();
    for (const q of queueHints) {
      if (!queueMap.has(q.rf_id)) {
        queueMap.set(q.rf_id, q);
      }
    }
    return rfList.map((rf) => {
      const hint = queueMap.get(rf.id);
      const refText = rf.reference ?? 'Draft Requisition';
      const neededText = rf.needed_at ? `Needed ${formatManilaTime(rf.needed_at)}` : 'No target date';
      return {
        id: rf.id,
        primaryLabel: refText,
        secondaryLabel: hint
          ? `${hint.variant_label} · Unreserved ${hint.unreserved_outstanding_quantity} ${hint.unit_code} · ${neededText}`
          : `${rf.justification ? `${rf.justification} · ` : ''}${neededText}`,
        badge: hint ? `Queue #${hint.queue_position}` : (rf.fulfillment_status ?? rf.status ?? 'approved').replaceAll('_', ' '),
        badgeTone: hint?.allocation_tier === 'active_commitment' ? 'ready' : hint?.allocation_tier === 'approved_override' ? 'warning' : 'neutral',
        searchText: `${refText} ${rf.justification ?? ''} ${hint?.variant_label ?? ''}`,
        meta: rf,
      };
    });
  }, [rfList, queueHints]);

  const rfLineOptions = useMemo<Array<SearchablePickerOption<AllocationReviewLine>>>(() => {
    const hintsByLine = new Map(queueHints.map((q) => [q.rf_line_id, q]));
    return (reviewData?.lines ?? []).map((line, index) => {
      const hint = hintsByLine.get(line.rf_line_id);
      const lotCount = line.candidate_lots?.length ?? 0;
      return {
        id: line.rf_line_id,
        primaryLabel: hint ? hint.variant_label : `Requisition Item Line #${index + 1}`,
        secondaryLabel: hint
          ? `Need ${hint.unreserved_outstanding_quantity} ${hint.unit_code} · ${lotCount} eligible stock ${lotCount === 1 ? 'batch' : 'batches'}`
          : `${lotCount} eligible stock ${lotCount === 1 ? 'batch' : 'batches'} ready`,
        badge: `${lotCount} Eligible`,
        badgeTone: lotCount > 0 ? 'ready' : 'warning',
        meta: line,
      };
    });
  }, [reviewData, queueHints]);

  interface LotTargetChoice {
    stock_lot_id: string;
    basis_segment_id: string;
    offset_quantity: string;
    max_quantity: string;
    expected_lot_material_version: string;
    expected_stock_version: string;
  }

  const batchPickerOptions = useMemo<Array<SearchablePickerOption<LotTargetChoice>>>(() => {
    if (opKind === 'placeHold') {
      return chapterLots.map((lot) => ({
        id: `${lot.id}|${lot.basis_segment_id}|0`,
        primaryLabel: `${lot.historical_variant_label ?? 'Stock Batch'} (${lot.source?.reference ?? sourceKindLabel(lot.source?.type)})`,
        secondaryLabel: `On hand: ${lot.quantity_on_hand} · ${sourceKindLabel(lot.source?.type)}`,
        badge: `${lot.quantity_on_hand} on hand`,
        badgeTone: 'neutral',
        meta: {
          stock_lot_id: lot.id,
          basis_segment_id: lot.basis_segment_id,
          offset_quantity: '0',
          max_quantity: lot.quantity_on_hand,
          expected_lot_material_version: String(lot.material_version),
          expected_stock_version: String(lot.stock_version),
        },
      }));
    }

    const candidates = activeReviewLine?.candidate_lots ?? [];
    const out: Array<SearchablePickerOption<LotTargetChoice>> = [];
    for (const lot of candidates) {
      const intervals = lot.free_intervals && lot.free_intervals.length > 0
        ? lot.free_intervals
        : [
            {
              basis_segment_id: lot.basis_segment_id,
              offset_quantity: '0',
              quantity: lot.free_quantity ?? lot.quantity_on_hand,
              restriction_state: (lot.restriction_state === 'bounded' ? 'bounded' : 'unrestricted') as 'bounded' | 'unrestricted',
            },
          ];

      for (const interval of intervals) {
        out.push({
          id: `${lot.stock_lot_id}|${interval.basis_segment_id}|${interval.offset_quantity}`,
          primaryLabel: `${lot.source_reference ?? sourceKindLabel(lot.source_kind)} · ${interval.quantity} free`,
          secondaryLabel: `${sourceKindLabel(lot.source_kind)} · Slice starting at ${interval.offset_quantity} · ${interval.restriction_state === 'bounded' ? 'Restricted to matching units/events' : 'General unrestricted stock'}`,
          badge: interval.restriction_state === 'bounded' ? 'Bounded Match' : 'Unrestricted',
          badgeTone: interval.restriction_state === 'bounded' ? 'warning' : 'ready',
          meta: {
            stock_lot_id: lot.stock_lot_id,
            basis_segment_id: interval.basis_segment_id,
            offset_quantity: interval.offset_quantity,
            max_quantity: interval.quantity,
            expected_lot_material_version: String(lot.material_version),
            expected_stock_version: String(lot.stock_version),
          },
        });
      }
    }
    return out;
  }, [opKind, chapterLots, activeReviewLine]);

  const reservationOptions = useMemo<Array<SearchablePickerOption<ReservationRecord>>>(() => {
    return reservations.map((r, idx) => ({
      id: r.id,
      primaryLabel: `Reservation #${idx + 1} (${r.active_quantity} active)`,
      secondaryLabel: `Status: ${r.status} · Blocked: ${r.blocked_quantity}`,
      badge: r.status,
      badgeTone: r.status === 'ACTIVE' ? 'ready' : 'neutral',
      meta: r,
    }));
  }, [reservations]);

  const releaseRangeOptions = useMemo<Array<SearchablePickerOption<LotTargetChoice>>>(() => {
    const selectedRes = reservations.find((r) => r.id === reservationId);
    const allocs = selectedRes?.allocations ?? [];
    if (allocs.length === 0) {
      return batchPickerOptions;
    }
    const lotLookup = new Map(chapterLots.map((l) => [l.id, l]));
    return allocs.map((al, idx) => {
      const lotInfo = lotLookup.get(al.stock_lot_id);
      return {
        id: `${al.stock_lot_id}|${al.basis_segment_id}|${al.offset_quantity}`,
        primaryLabel: `${lotInfo?.source?.reference ?? `Reserved Batch #${idx + 1}`} · ${al.quantity} reserved`,
        secondaryLabel: `Reserved slice starting at ${al.offset_quantity}`,
        badge: `${al.quantity} reserved`,
        badgeTone: 'ready',
        meta: {
          stock_lot_id: al.stock_lot_id,
          basis_segment_id: al.basis_segment_id,
          offset_quantity: al.offset_quantity,
          max_quantity: al.quantity,
          expected_lot_material_version: String(lotInfo?.material_version ?? 1),
          expected_stock_version: String(lotInfo?.stock_version ?? 1),
        },
      };
    });
  }, [reservations, reservationId, chapterLots, batchPickerOptions]);

  const holdOptions = useMemo<Array<SearchablePickerOption<StockHoldRecord>>>(() => {
    return holds.map((h) => ({
      id: h.id,
      primaryLabel: `${(h.reason_code ?? 'hold').replaceAll('_', ' ')} — ${h.reason ?? ''}`,
      secondaryLabel: `Hold status: ${h.status ?? 'active'}`,
      badge: h.status ?? 'active',
      badgeTone: h.status === 'active' ? 'warning' : 'ready',
      meta: h,
    }));
  }, [holds]);

  const signatoryGrantOptions = useMemo(() => {
    const membership = chapterContext?.membership;
    if (!membership) {
      return [];
    }
    return membership.duty_grants.map((grant) => ({
      id: grant.id,
      primaryLabel: `${grant.duty.replaceAll('_', ' ')} (Current Signed-in Officer)`,
      secondaryLabel: `Effective ${formatManilaTime(grant.effective_from)}`,
      badge: 'Verified Grant',
      badgeTone: 'ready' as const,
      meta: {
        user_id: chapterContext.user_id,
        membership_id: membership.id,
        duty_grant_id: grant.id,
      },
    }));
  }, [chapterContext]);

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
        targets,
      }),
    });
    setStatusMessage('Reservation and hold changes saved as a temporary draft for this session.');
  }

  async function handleInlineClearanceUpload() {
    if (!holdId.trim() || !clearanceFiles || clearanceFiles.length === 0) {
      setError(new Error('Select a stock hold and attach at least one signed clearance scan first.'));
      return;
    }
    setUploadingEvidence(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('purpose', 'hold_clearance');
      fd.append('record_id', holdId.trim());
      for (const file of Array.from(clearanceFiles)) {
        fd.append('attachments', file, file.name);
      }
      const { result } = await apiMutate<{
        evidence_id: string;
        version_id: string;
        attachments: Array<{ attachment_id: string; sha256: string }>;
      }>('POST', `/api/v1/chapters/${chapterId}/evidence`, fd);

      setEvidenceBinding({
        evidence_id: result.data.evidence_id,
        version_id: result.data.version_id,
        attachments: result.data.attachments.map((a) => ({
          attachment_id: a.attachment_id,
          sha256: a.sha256,
        })),
      });
      setStatusMessage(`Signed clearance paper uploaded and linked (${result.data.attachments.length} file).`);
    } catch (err) {
      setError(err);
      if (err instanceof ContractApiError && [403, 404, 409].includes(err.status)) {
        // Refresh live authorized choices without wiping unrelated form inputs
        void loadChapterDiscovery();
        if (rfId.trim()) {
          void loadRfAllocations(rfId);
        }
      }
    } finally {
      setUploadingEvidence(false);
    }
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
      skipNextAutoSaveRef.current = true;
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
        setExpectedPrepVersion('1');
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
        setExpectedSnapshotMatVer(String(record.material_version ?? expectedMaterialVersion));
      }
      const actionLabels: Record<ResHoldOp, string> = {
        prepare: 'Reservation prepared — ready to confirm',
        commit: 'Reservation confirmed',
        release: 'Reserved stock released',
        reallocate: 'Reservation moved',
        placeHold: 'Stock hold placed',
        proposeClear: 'Hold clearance submitted — attach signed paper to clear',
        clearHold: 'Stock hold cleared',
      };
      setStatusMessage(`${actionLabels[opKind]}. Reference: ${key}`);
      await loadChapterDiscovery();
      if (rfId.trim()) {
        await loadRfAllocations(rfId);
      }
    } catch (err) {
      setError(err);
      if (err instanceof ContractApiError && [403, 404, 409].includes(err.status)) {
        // Refresh live authorized choices without wiping unrelated form inputs
        void loadChapterDiscovery();
        if (rfId.trim()) {
          void loadRfAllocations(rfId);
        }
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
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap" style={{ flex: '1 1 360px' }}>
              <SearchableRecordPicker
                id="res-rf-picker"
                label="Select Approved Requisition"
                placeholder="Search approved requisition by number, item, or justification..."
                valueId={rfId}
                options={rfPickerOptions}
                loading={rfListLoading}
                errorMessage={rfListError}
                onRetry={() => void loadChapterDiscovery()}
                emptyMessage="No approved requisitions available in this chapter."
                onSelect={(opt) => handleSelectRf(opt ? opt.id : '')}
              />
            </div>

            <div className="p03-search-meta">
              <button
                type="button"
                className="p03-search-clear-btn"
                onClick={() => void loadChapterDiscovery()}
              >
                Refresh Lists
              </button>
              <button
                type="button"
                className="p03-search-action-btn"
                onClick={() => void loadRfAllocations()}
                disabled={!rfId.trim()}
              >
                Reload Allocations
              </button>
            </div>
          </div>

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
                Pick a requisition, line item, and eligible stock batch slice in plain English — versions and verification tags carry silently.
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
            <section className="p03-card surface-card form-stack" aria-label="Selected stock context">
              <div className="p04-line-top">
                <h2 className="p03-section-title">Selected Requisition &amp; Eligible Stock</h2>
                {rfId.trim() && (
                  <span className="p03-version-pill">
                    {rfPickerOptions.find((o) => o.id === rfId)?.primaryLabel ?? 'Loaded'}
                  </span>
                )}
              </div>

              {!activeReviewLine ? (
                <p className="p03-muted-copy">
                  Select an approved requisition above to load eligible stockroom batches and existing reservations.
                </p>
              ) : (
                <div className="form-stack">
                  <SearchableRecordPicker
                    id="res-rf-line-picker"
                    label="Requisition Line Item"
                    placeholder="Choose requisition item line..."
                    valueId={rfLineId}
                    options={rfLineOptions}
                    onSelect={(opt) => handleSelectRfLine(opt ? opt.id : '')}
                  />

                  <div className="p04-lines-list">
                    {(activeReviewLine.candidate_lots ?? []).length === 0 ? (
                      <p className="p03-muted-copy">No eligible unreserved stock batches are currently free for this requisition line.</p>
                    ) : (
                      (activeReviewLine.candidate_lots ?? []).map((lot) => (
                        <div key={lot.stock_lot_id} className="p04-line-card">
                          <div className="p04-line-top">
                            <strong>{lot.source_reference ?? sourceKindLabel(lot.source_kind)}</strong>
                            <span className="p03-version-pill">
                              {lot.free_quantity ?? lot.quantity_on_hand} free
                            </span>
                          </div>
                          <span className="picker-secondary-label">
                            {sourceKindLabel(lot.source_kind)} ·{' '}
                            {lot.restriction_state === 'bounded' ? 'Donor-restricted match' : 'Unrestricted stock'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="p02-compact-btn-group">
                <button
                  type="button"
                  className="p02-compact-btn"
                  disabled={!rfId.trim() || !prepId.trim()}
                  onClick={() => {
                    void inspectSubresource(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservation-preparations/${prepId.trim()}`);
                    setViewTab('status');
                  }}
                >
                  Inspect Prepared Reservation
                </button>
                <button
                  type="button"
                  className="p02-compact-btn"
                  disabled={!rfId.trim() || !reservationId.trim()}
                  onClick={() => {
                    void inspectSubresource(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/history`);
                    setViewTab('status');
                  }}
                >
                  Reservation History
                </button>
                <button
                  type="button"
                  className="p02-compact-btn"
                  disabled={!holdId.trim()}
                  onClick={() => {
                    void inspectSubresource(`/api/v1/chapters/${chapterId}/stock-holds/${holdId.trim()}/history`);
                    setViewTab('status');
                  }}
                >
                  Hold History
                </button>
              </div>
            </section>

            <section className="p03-card surface-card form-stack" aria-label="Execute reservation or hold action">
              <h2 className="p03-section-title">Run Action</h2>

              {opBlockReason && (
                <div className="callout-banner is-warning">
                  <span className="callout-dot dot-warning" aria-hidden="true" />
                  <span>{opBlockReason}</span>
                </div>
              )}

              <form onSubmit={executeAction} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="rh-op">
                    Action to Perform
                  </label>
                  <select
                    id="rh-op"
                    className="form-control"
                    value={opKind}
                    onChange={(e) => setOpKind(e.target.value as ResHoldOp)}
                  >
                    <option value="prepare">1. Reserve Stock for Requisition (Prepare)</option>
                    <option value="commit">2. Confirm Prepared Reservation</option>
                    <option value="release">Release Reserved Stock</option>
                    <option value="reallocate">Move Reserved Stock to Another Batch</option>
                    <option value="placeHold">Place Stock Hold (Quarantine / Check)</option>
                    <option value="proposeClear">Propose Clearance for Stock Hold</option>
                    <option value="clearHold">Attach Signed Paper &amp; Clear Hold</option>
                  </select>
                </div>

                {(opKind === 'release' || opKind === 'reallocate') && (
                  <SearchableRecordPicker
                    id="rh-resv-picker"
                    label="Select Existing Reservation"
                    placeholder="Search reservation for this requisition..."
                    valueId={reservationId}
                    options={reservationOptions}
                    emptyMessage="No reservations found for this requisition."
                    onSelect={(opt) => {
                      if (!opt) {
                        setReservationId('');
                        setRanges([emptyStockRange()]);
                        return;
                      }
                      setReservationId(opt.id);
                      setExpectedVersion(String(opt.meta.version));
                      setExpectedMaterialVersion(String(opt.meta.material_version));
                      if (opt.meta.allocations && opt.meta.allocations.length > 0) {
                        setRanges(
                          opt.meta.allocations.map((al) => ({
                            stock_lot_id: al.stock_lot_id,
                            basis_segment_id: al.basis_segment_id,
                            offset_quantity: String(al.offset_quantity),
                            quantity: String(al.quantity),
                          })),
                        );
                      }
                    }}
                  />
                )}

                {opKind === 'commit' && (
                  <div className="callout-banner is-info">
                    <span className="callout-dot dot-info" aria-hidden="true" />
                    <span>
                      {prepId.trim()
                        ? 'Prepared reservation is loaded and ready to confirm.'
                        : 'Run step "1. Reserve Stock for Requisition" first so the prepared reservation is ready to confirm.'}
                    </span>
                  </div>
                )}

                {(opKind === 'proposeClear' || opKind === 'clearHold') && (
                  <SearchableRecordPicker
                    id="rh-hold-picker"
                    label="Select Stock Hold"
                    placeholder="Search active or pending stock hold..."
                    valueId={holdId}
                    options={holdOptions}
                    emptyMessage="No stock holds recorded in this chapter."
                    onSelect={(opt) => {
                      if (!opt) {
                        setHoldId('');
                        return;
                      }
                      setHoldId(opt.id);
                      setExpectedVersion(String(opt.meta.version));
                      setExpectedMaterialVersion(String(opt.meta.material_version));
                    }}
                  />
                )}

                {(opKind === 'prepare' || opKind === 'reallocate' || opKind === 'placeHold') && (
                  <div className="p04-lines-list">
                    <div className="p04-line-top">
                      <span className="form-label">Selected Stock Batch Slices</span>
                      <button
                        type="button"
                        className="p02-compact-btn"
                        onClick={() => setTargets((prev) => [...prev, emptyStockTarget()])}
                      >
                        + Add Batch Slice
                      </button>
                    </div>
                    {targets.map((row, idx) => {
                      const pickedOptionId = row.stock_lot_id ? `${row.stock_lot_id}|${row.basis_segment_id}|${row.offset_quantity}` : '';
                      return (
                        <div key={idx} className="p04-line-card form-stack">
                          <div className="p04-line-top">
                            <span className="p03-version-pill">Batch Slice #{idx + 1}</span>
                            {targets.length > 1 && (
                              <button
                                type="button"
                                className="p02-compact-btn is-subtle-danger"
                                onClick={() => setTargets((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <SearchableRecordPicker
                            id={`rh-batch-picker-${idx}`}
                            label="Stock Batch"
                            placeholder="Search eligible stock batch by reference or free quantity..."
                            valueId={pickedOptionId}
                            options={batchPickerOptions}
                            emptyMessage="No eligible stock batches available for the current selection."
                            onSelect={(opt) => {
                              if (!opt) {
                                setTargets((prev) => prev.map((x, i) => (i === idx ? emptyStockTarget() : x)));
                                return;
                              }
                              setTargets((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        stock_lot_id: opt.meta.stock_lot_id,
                                        basis_segment_id: opt.meta.basis_segment_id,
                                        offset_quantity: opt.meta.offset_quantity,
                                        quantity: opt.meta.max_quantity,
                                        expected_lot_material_version: opt.meta.expected_lot_material_version,
                                        expected_stock_version: opt.meta.expected_stock_version,
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                          <div className="form-group">
                            <label className="form-label" htmlFor={`rh-qty-${idx}`}>
                              Quantity to {opKind === 'placeHold' ? 'Place on Hold' : 'Reserve'}
                            </label>
                            <input
                              id={`rh-qty-${idx}`}
                              className="form-control"
                              required
                              value={row.quantity}
                              onChange={(e) =>
                                setTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(opKind === 'release' || opKind === 'reallocate') && (
                  <div className="p04-lines-list">
                    <div className="p04-line-top">
                      <span className="form-label">Batch Range to {opKind === 'release' ? 'Release' : 'Move From'}</span>
                      <button
                        type="button"
                        className="p02-compact-btn"
                        onClick={() => setRanges((prev) => [...prev, emptyStockRange()])}
                      >
                        + Add Range
                      </button>
                    </div>
                    {ranges.map((r, idx) => {
                      const pickedOptionId = r.stock_lot_id ? `${r.stock_lot_id}|${r.basis_segment_id}|${r.offset_quantity}` : '';
                      return (
                        <div key={idx} className="p04-line-card form-stack">
                          <SearchableRecordPicker
                            id={`rh-range-picker-${idx}`}
                            label={`Source Batch #${idx + 1}`}
                            placeholder="Search reserved batch..."
                            valueId={pickedOptionId}
                            options={releaseRangeOptions}
                            onSelect={(opt) => {
                              if (!opt) {
                                return;
                              }
                              setRanges((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        stock_lot_id: opt.meta.stock_lot_id,
                                        basis_segment_id: opt.meta.basis_segment_id,
                                        offset_quantity: opt.meta.offset_quantity,
                                        quantity: opt.meta.max_quantity,
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                          <div className="form-group">
                            <label className="form-label">Quantity</label>
                            <input
                              className="form-control"
                              required
                              value={r.quantity}
                              onChange={(e) =>
                                setRanges((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
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
                    <select className="form-control" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                      <option value="inspection_hold">Inspection Hold</option>
                      <option value="damage_inspection">Damaged Packaging Check</option>
                      <option value="expiry_review">Expiry Review</option>
                      <option value="donor_clarification">Donor Clarification</option>
                    </select>
                  </div>
                )}

                {(opKind === 'prepare' || opKind === 'release' || opKind === 'reallocate' || opKind === 'placeHold') && (
                  <div className="form-group">
                    <label className="form-label">Reason / Notes</label>
                    <input
                      className="form-control"
                      required
                      placeholder="Brief operational note..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                )}

                {opKind === 'proposeClear' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Clearance Resolution</label>
                      <input
                        className="form-control"
                        required
                        placeholder="Describe inspection clearance outcome..."
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                      />
                    </div>

                    <div className="p04-lines-list">
                      <div className="p04-line-top">
                        <span className="form-label">Paper Signatories (1–10)</span>
                        <button
                          type="button"
                          className="p02-compact-btn"
                          onClick={() => setSignatories((prev) => [...prev, emptySignatory()])}
                        >
                          + Add Signatory
                        </button>
                      </div>
                      {signatories.map((s, idx) => (
                        <div key={idx} className="p04-line-card form-stack">
                          <SearchableRecordPicker
                            id={`rh-signatory-picker-${idx}`}
                            label={`Signatory #${idx + 1}`}
                            placeholder="Select authorized officer role grant..."
                            valueId={s.duty_grant_id}
                            options={signatoryGrantOptions}
                            onSelect={(opt) => {
                              if (!opt) {
                                return;
                              }
                              setSignatories((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        user_id: opt.meta.user_id,
                                        membership_id: opt.meta.membership_id,
                                        duty_grant_id: opt.meta.duty_grant_id,
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {opKind === 'clearHold' && (
                  <>
                    <div className="p04-line-card form-stack">
                      <span className="form-label">Upload Signed Clearance Paper</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        className="form-control"
                        onChange={(e) => setClearanceFiles(e.target.files)}
                      />
                      <div className="p02-compact-btn-group">
                        <button
                          type="button"
                          className="p02-compact-btn"
                          disabled={uploadingEvidence || !holdId.trim() || !clearanceFiles?.length}
                          onClick={() => void handleInlineClearanceUpload()}
                        >
                          {uploadingEvidence ? 'Uploading...' : 'Upload & Attach Signed Paper'}
                        </button>
                        {evidenceBinding.evidence_id && (
                          <span className="s02-status-tag is-ready">
                            Signed Document Ready ({evidenceBinding.attachments.length} file)
                          </span>
                        )}
                      </div>
                      <details>
                        <summary className="picker-secondary-label">Advanced: paste existing evidence binding</summary>
                        <EvidenceBindingFields
                          label="Existing Signed Document Reference"
                          value={evidenceBinding}
                          onChange={setEvidenceBinding}
                        />
                      </details>
                    </div>
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
                    disabled={busy || opBlockReason !== null}
                    title={opBlockReason ?? undefined}
                  >
                    Run Action
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
        )}

        {viewTab === 'records' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Requisition reservations">
              <h2 className="p03-section-title">
                Requisition Reservations ({reservations.length})
              </h2>
              {reservations.length === 0 && reviewData === null ? (
                <p className="p03-muted-copy">
                  No reservations loaded. Select a requisition above to inspect live allocations.
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
                  No stock holds recorded in this chapter.
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
