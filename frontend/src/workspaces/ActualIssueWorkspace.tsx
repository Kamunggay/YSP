import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiGetText, apiMutate, buildQuery, ContractApiError, formatManilaTime, newActionKey } from '../api/client.ts';
import { fetchAllAuthorizedPages } from '../api/pagination.ts';
import type { ChapterAccessSnapshot, ChapterContext } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker, type SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
import {
  emptyEvidenceBinding,
  emptyStockRange,
  toWireEvidenceBinding,
  toWireRanges,
  type EvidenceBindingValue,
  type StockRangeInput,
} from '../components/structuredInputHelpers.ts';
import { EvidenceBindingFields } from '../components/StructuredInputRows.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface IssueLineSelectionInput {
  rf_line_id: string;
  reservation_id: string;
  expected_reservation_version: string;
  expected_reservation_material_version: string;
  targets: StockRangeInput[];
}

interface PostTargetPinInput {
  stock_lot_id: string;
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
  expected_lot_material_version: string;
  expected_stock_version: string;
  label?: string;
}

interface PostSourcePinInput {
  reservation_id: string;
  expected_version: string;
  expected_material_version: string;
  targets: PostTargetPinInput[];
}

interface InternalRfOption {
  id: string;
  reference: string | null;
  status: string;
  fulfillment_status: string;
  requesting_unit_id: string | null;
  requester_id?: string | null;
  requester_user_id?: string | null;
  needed_at: string | null;
  justification?: string | null;
  version?: number;
  material_version?: number;
  progress_version?: number;
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
}

interface ReservationAllocItem {
  stock_lot_id: string;
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
}

interface ReservationOptionRecord {
  id: string;
  rf_line_id: string;
  status: string;
  version: number;
  material_version: number;
  active_quantity: string;
  blocked_quantity?: string;
  active_hold_ids?: string[];
  allocations?: ReservationAllocItem[];
}

interface ActiveHoldRangeRecord {
  stock_lot_id?: string;
  lot_id?: string;
  offset_quantity: string;
  quantity: string;
}

interface ActiveHoldRecord {
  id: string;
  status: string;
  ranges?: ActiveHoldRangeRecord[];
}

interface AllocationReviewData {
  rf?: {
    id: string;
    reference?: string | null;
    requester_id?: string | null;
    requester_user_id?: string | null;
    version: number;
    material_version: number;
    progress_version: number;
  };
  lines?: Array<{
    rf_line_id: string;
    variant_id: string;
    unit_id: string;
    candidate_lots?: Array<{
      stock_lot_id: string;
      source_reference?: string;
      basis_segment_id: string;
      free_quantity?: string;
      quantity_on_hand: string;
      stock_version: number;
      material_version: number;
    }>;
  }>;
}

interface ActualIssueLineRecord {
  id?: string;
  rf_line_id: string;
  reservation_id: string | null;
  stock_lot_id: string | null;
  basis_segment_id: string | null;
  offset_quantity: string;
  allocated_quantity: string;
  issued_quantity: string;
}

interface ActualIssueRecord {
  id: string;
  issue_reference?: string | null;
  reference?: string | null;
  status: string;
  version: number;
  material_version: number;
  recipient_id?: string;
  handed_over_at?: string | null;
  acknowledged_at?: string | null;
  recipient_accepts_partial?: boolean;
  snapshot?: { sha256?: string; material_version?: number };
  acknowledgment?: { acknowledgment_id?: string; id?: string } | null;
  lines?: ActualIssueLineRecord[];
}

interface ScopedIssueRelatedResponse {
  issue?: ActualIssueRecord;
  rf?: InternalRfOption | null;
  reservations?: Array<{
    id: string;
    version: number;
    material_version: number;
  }>;
  lots?: Array<{
    id: string;
    lot_code?: string;
    source_reference?: string | null;
    material_version: number;
    stock_version: number;
  }>;
  evidence_binding?: {
    id: string;
    version_id?: string | null;
  } | null;
}

type IssueOpKind = 'prepare' | 'revise' | 'ack' | 'post' | 'reconcile';

interface ActualIssueWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterContext: ChapterContext | null;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

interface SavedIssueDraft {
  rfId?: string;
  issueId?: string;
  opKind?: IssueOpKind;
  recipientId?: string;
  handedOverAt?: string;
  acknowledgedAt?: string;
  acceptsPartial?: boolean;
  issueLines?: IssueLineSelectionInput[];
  reviseReason?: string;
  reconcileReason?: string;
  finding?: 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed';
  matchesPaper?: boolean;
  attachReconcileEvidence?: boolean;
  acknowledgmentId?: string;
  snapshotSha?: string;
}

const ISSUE_REQUIRED_ACTIONS: Record<IssueOpKind, string[]> = {
  prepare: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read'],
  revise: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read'],
  ack: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read', 'issue.post'],
  post: ['issue.post', 'rf.read', 'stock.read', 'evidence.read'],
  reconcile: ['issue.post', 'rf.read', 'stock.read', 'evidence.read'],
};

const FORM_KEY = 'actual_issue_editor';

function nowUtcMicro(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, '.000000Z');
}

function emptyIssueLine(): IssueLineSelectionInput {
  return {
    rf_line_id: '',
    reservation_id: '',
    expected_reservation_version: '1',
    expected_reservation_material_version: '1',
    targets: [emptyStockRange()],
  };
}

function parseSavedDraft(userId: string, chapterId: string): SavedIssueDraft {
  const saved = memoryDraftStore.getDraft(userId, chapterId, FORM_KEY);
  if (!saved) {
    return {};
  }
  try {
    return JSON.parse(saved.payloadJson) as SavedIssueDraft;
  } catch {
    return {};
  }
}

function intervalsOverlap(offsetA: string, qtyA: string, offsetB: string, qtyB: string): boolean {
  const startA = Number(offsetA);
  const endA = startA + Number(qtyA);
  const startB = Number(offsetB);
  const endB = startB + Number(qtyB);
  if (!Number.isFinite(startA) || !Number.isFinite(endA) || !Number.isFinite(startB) || !Number.isFinite(endB)) {
    return false;
  }
  return Math.max(startA, startB) < Math.min(endA, endB);
}

function filterEligibleReservationRanges(
  res: ReservationOptionRecord,
  activeHolds: ActiveHoldRecord[],
): ReservationAllocItem[] {
  if (res.status.toUpperCase() !== 'ACTIVE' || !(Number(res.active_quantity) > 0)) {
    return [];
  }
  const allocs = (res.allocations ?? []).filter((a) => Number(a.quantity) > 0);
  if (allocs.length === 0) {
    return [];
  }
  const eligible = allocs.filter((al) => {
    for (const hold of activeHolds) {
      if ((hold.status ?? 'active').toLowerCase() !== 'active') {
        continue;
      }
      for (const hr of hold.ranges ?? []) {
        const holdLotId = hr.stock_lot_id ?? hr.lot_id;
        if (holdLotId === al.stock_lot_id && intervalsOverlap(al.offset_quantity, al.quantity, hr.offset_quantity, hr.quantity)) {
          return false;
        }
      }
    }
    return true;
  });
  return eligible;
}

function buildPostPinsFromRelated(related: ScopedIssueRelatedResponse): PostSourcePinInput[] {
  const issueLines = related.issue?.lines ?? [];
  if (issueLines.length === 0) {
    return [];
  }
  const resById = new Map((related.reservations ?? []).map((r) => [r.id, r]));
  const lotById = new Map((related.lots ?? []).map((l) => [l.id, l]));
  const grouped = new Map<string, PostSourcePinInput>();

  for (const line of issueLines) {
    const resId = line.reservation_id ?? '';
    const lotId = line.stock_lot_id ?? '';
    if (!resId || !lotId) {
      continue;
    }
    const resMeta = resById.get(resId);
    const lotMeta = lotById.get(lotId);
    let bucket = grouped.get(resId);
    if (!bucket) {
      bucket = {
        reservation_id: resId,
        expected_version: String(resMeta?.version ?? 1),
        expected_material_version: String(resMeta?.material_version ?? 1),
        targets: [],
      };
      grouped.set(resId, bucket);
    }
    bucket.targets.push({
      stock_lot_id: lotId,
      basis_segment_id: line.basis_segment_id || lotId,
      offset_quantity: String(line.offset_quantity ?? '0'),
      quantity: String(line.issued_quantity || line.allocated_quantity || '1'),
      expected_lot_material_version: String(lotMeta?.material_version ?? 1),
      expected_stock_version: String(lotMeta?.stock_version ?? 1),
      label: lotMeta?.source_reference || lotMeta?.lot_code || `Batch ${lotId.slice(0, 8)}`,
    });
  }

  return Array.from(grouped.values());
}

export function ActualIssueWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterContext,
  chapterAccess,
  onBackToDashboard,
}: ActualIssueWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'workflow' | 'inspect' | 'status'>('workflow');

  const initialDraft = parseSavedDraft(userId, chapterId);
  const [rfId, setRfId] = useState(initialDraft.rfId ?? '');
  const [issueId, setIssueId] = useState(initialDraft.issueId ?? '');
  const [opKind, setOpKind] = useState<IssueOpKind>(initialDraft.opKind ?? 'prepare');

  const [rfList, setRfList] = useState<InternalRfOption[]>([]);
  const [queueHints, setQueueHints] = useState<AllocationQueueHint[]>([]);
  const [activeHolds, setActiveHolds] = useState<ActiveHoldRecord[]>([]);
  const [rfLoading, setRfLoading] = useState(false);
  const [rfLoadError, setRfLoadError] = useState<string | null>(null);

  const [reviewData, setReviewData] = useState<AllocationReviewData | null>(null);
  const [reservations, setReservations] = useState<ReservationOptionRecord[]>([]);
  const [issuesList, setIssuesList] = useState<ActualIssueRecord[]>([]);

  const [expectedRfVersion, setExpectedRfVersion] = useState('1');
  const [expectedRfMatVersion, setExpectedRfMatVersion] = useState('1');
  const [expectedRfProgressVersion, setExpectedRfProgressVersion] = useState('1');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [expectedMatVersion, setExpectedMatVersion] = useState('1');

  const [recipientId, setRecipientId] = useState(initialDraft.recipientId ?? '');
  const [handedOverAt, setHandedOverAt] = useState(() => initialDraft.handedOverAt ?? nowUtcMicro());
  const [acknowledgedAt, setAcknowledgedAt] = useState(() => initialDraft.acknowledgedAt ?? nowUtcMicro());
  const [acceptsPartial, setAcceptsPartial] = useState(initialDraft.acceptsPartial ?? false);
  const [reviseReason, setReviseReason] = useState(initialDraft.reviseReason ?? '');
  const [issueLines, setIssueLines] = useState<IssueLineSelectionInput[]>(
    initialDraft.issueLines && initialDraft.issueLines.length > 0 ? initialDraft.issueLines : [emptyIssueLine()],
  );

  const [snapshotMatVer, setSnapshotMatVer] = useState('1');
  const [snapshotSha, setSnapshotSha] = useState(initialDraft.snapshotSha ?? '');
  const [matchesPaper, setMatchesPaper] = useState(initialDraft.matchesPaper ?? true);
  const [acknowledgmentId, setAcknowledgmentId] = useState(initialDraft.acknowledgmentId ?? '');
  const [currentSources, setCurrentSources] = useState<PostSourcePinInput[]>([]);
  const [batchHydrating, setBatchHydrating] = useState(false);

  const [finding, setFinding] = useState<'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed'>(
    initialDraft.finding ?? 'no_handover',
  );
  const [reconcileReason, setReconcileReason] = useState(initialDraft.reconcileReason ?? '');
  const [attachReconcileEvidence, setAttachReconcileEvidence] = useState(initialDraft.attachReconcileEvidence ?? false);
  const [evidenceBinding, setEvidenceBinding] = useState<EvidenceBindingValue>(emptyEvidenceBinding);
  const [handoverFiles, setHandoverFiles] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const [issuesJson, setIssuesJson] = useState<unknown>(null);
  const [detailJson, setDetailJson] = useState<unknown>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  // Refs for async race protection and per-chapter draft restoration
  const contextRef = useRef({ userId, chapterId, rfId, issueId, recipientId });
  useEffect(() => {
    contextRef.current = { userId, chapterId, rfId, issueId, recipientId };
  }, [userId, chapterId, rfId, issueId, recipientId]);
  const discoveryGenRef = useRef(0);
  const rfSelectGenRef = useRef(0);
  const issueSelectGenRef = useRef(0);
  const uploadGenRef = useRef(0);
  const skipNextAutoSaveRef = useRef(false);
  const lastChapterKeyRef = useRef(`${userId}::${chapterId}`);

  const canReadQueue = (chapterContext?.membership?.duties ?? []).some((d) =>
    ['INVENTORY', 'DISPATCH', 'RF_APPROVER', 'CHAPTER_HEAD'].includes(d),
  );

  const clearBatchDependentState = useCallback(() => {
    setExpectedVersion('1');
    setExpectedMatVersion('1');
    setSnapshotMatVer('1');
    setSnapshotSha('');
    setAcknowledgmentId('');
    setCurrentSources([]);
    setEvidenceBinding(emptyEvidenceBinding());
    setHandoverFiles(null);
    setFileInputKey((k) => k + 1);
    setUploadingEvidence(false);
    setDetailJson(null);
    setPrintHtml(null);
  }, []);

  // Restore full chapter draft cleanly when switching User/Chapter (A -> B -> A)
  useEffect(() => {
    const key = `${userId}::${chapterId}`;
    if (lastChapterKeyRef.current === key) {
      return;
    }
    lastChapterKeyRef.current = key;
    skipNextAutoSaveRef.current = true;
    rfSelectGenRef.current += 1;
    issueSelectGenRef.current += 1;
    uploadGenRef.current += 1;

    const restored = parseSavedDraft(userId, chapterId);
    setRfId(restored.rfId ?? '');
    setIssueId(restored.issueId ?? '');
    setOpKind(restored.opKind ?? 'prepare');
    setRecipientId(restored.recipientId ?? '');
    setHandedOverAt(restored.handedOverAt ?? nowUtcMicro());
    setAcknowledgedAt(restored.acknowledgedAt ?? nowUtcMicro());
    setAcceptsPartial(restored.acceptsPartial ?? false);
    setIssueLines(restored.issueLines && restored.issueLines.length > 0 ? restored.issueLines : [emptyIssueLine()]);
    setReviseReason(restored.reviseReason ?? '');
    setReconcileReason(restored.reconcileReason ?? '');
    setFinding(restored.finding ?? 'no_handover');
    setMatchesPaper(restored.matchesPaper ?? true);
    setAttachReconcileEvidence(restored.attachReconcileEvidence ?? false);
    setAcknowledgmentId(restored.acknowledgmentId ?? '');
    setSnapshotSha(restored.snapshotSha ?? '');

    setReviewData(null);
    setReservations([]);
    setIssuesList([]);
    setIssuesJson(null);
    setCurrentSources([]);
    setEvidenceBinding(emptyEvidenceBinding());
    setHandoverFiles(null);
    setFileInputKey((k) => k + 1);
    setDetailJson(null);
    setPrintHtml(null);
    setError(null);
    setStatusMessage(null);
  }, [userId, chapterId]);

  const hydrateIssueBatch = useCallback(
    async (targetIssueId: string, expectedChapterId = chapterId, expectedRfId = rfId) => {
      const cleanIssueId = targetIssueId.trim();
      if (!cleanIssueId) {
        clearBatchDependentState();
        return;
      }
      const gen = issueSelectGenRef.current;
      setBatchHydrating(true);
      try {
        const res = await apiGet<ScopedIssueRelatedResponse>(
          `/api/v1/chapters/${expectedChapterId}/actual-issues/${cleanIssueId}/related`,
        );
        if (
          contextRef.current.chapterId !== expectedChapterId ||
          contextRef.current.rfId !== expectedRfId ||
          contextRef.current.issueId !== cleanIssueId ||
          issueSelectGenRef.current !== gen
        ) {
          return;
        }
        const issue = res.data.issue;
        if (!issue) {
          return;
        }
        setExpectedVersion(String(issue.version));
        setExpectedMatVersion(String(issue.material_version));
        setSnapshotMatVer(String(issue.snapshot?.material_version ?? issue.material_version));
        setSnapshotSha(issue.snapshot?.sha256 ?? '');
        const ackId = issue.acknowledgment?.acknowledgment_id ?? issue.acknowledgment?.id ?? '';
        setAcknowledgmentId(ackId);
        if (issue.recipient_id) {
          setRecipientId(issue.recipient_id);
        }
        if (issue.handed_over_at) {
          setHandedOverAt(issue.handed_over_at);
        }
        if (issue.acknowledged_at) {
          setAcknowledgedAt(issue.acknowledged_at);
        }
        if (typeof issue.recipient_accepts_partial === 'boolean') {
          setAcceptsPartial(issue.recipient_accepts_partial);
        }
        if (res.data.evidence_binding?.id) {
          setEvidenceBinding((prev) => ({
            ...prev,
            evidence_id: res.data.evidence_binding!.id,
            version_id: res.data.evidence_binding!.version_id ?? prev.version_id,
          }));
        } else {
          setEvidenceBinding(emptyEvidenceBinding());
        }
        const pins = buildPostPinsFromRelated(res.data);
        setCurrentSources(pins);
      } catch (err) {
        if (
          contextRef.current.chapterId !== expectedChapterId ||
          contextRef.current.rfId !== expectedRfId ||
          contextRef.current.issueId !== cleanIssueId ||
          issueSelectGenRef.current !== gen
        ) {
          return;
        }
        if (err instanceof ContractApiError && (err.status === 403 || err.status === 404)) {
          setIssueId('');
          clearBatchDependentState();
          setError(err);
          setStatusMessage('Selected issue handover is no longer available and was cleared; unrelated edits were preserved.');
        }
      } finally {
        if (
          contextRef.current.chapterId === expectedChapterId &&
          contextRef.current.issueId === cleanIssueId &&
          issueSelectGenRef.current === gen
        ) {
          setBatchHydrating(false);
        }
      }
    },
    [chapterId, rfId, clearBatchDependentState],
  );

  const loadChapterDiscovery = useCallback(async () => {
    const targetChapter = chapterId;
    const gen = ++discoveryGenRef.current;
    setRfLoading(true);
    setRfLoadError(null);
    try {
      const guard = () =>
        contextRef.current.chapterId === targetChapter && discoveryGenRef.current === gen;
      const [allRfs, allHolds] = await Promise.all([
        fetchAllAuthorizedPages<InternalRfOption>(
          `/api/v1/chapters/${targetChapter}/internal-rfs?status=approved`,
          { shouldContinue: guard },
        ),
        fetchAllAuthorizedPages<ActiveHoldRecord>(
          `/api/v1/chapters/${targetChapter}/stock-holds?status=active`,
          { shouldContinue: guard },
        ),
      ]);
      if (!guard()) {
        return;
      }
      setRfList(allRfs);
      setActiveHolds(allHolds);

      let notices: string[] = [];
      const selectedRf = contextRef.current.rfId.trim();
      if (selectedRf && !allRfs.some((r) => r.id === selectedRf)) {
        rfSelectGenRef.current += 1;
        issueSelectGenRef.current += 1;
        setRfId('');
        setIssueId('');
        setReviewData(null);
        setReservations([]);
        setIssuesList([]);
        setIssuesJson(null);
        clearBatchDependentState();
        notices.push('Previously selected requisition is no longer available or authorized and was cleared.');
      }

      if (canReadQueue) {
        try {
          const allQueue = await fetchAllAuthorizedPages<AllocationQueueHint>(
            `/api/v1/chapters/${targetChapter}/allocation-queue`,
            { shouldContinue: guard },
          );
          if (guard()) {
            setQueueHints(allQueue);
          }
        } catch {
          if (guard()) {
            setQueueHints([]);
          }
        }
      } else {
        setQueueHints([]);
      }

      if (notices.length > 0 && guard()) {
        setStatusMessage(notices.join(' '));
      }
    } catch (err) {
      if (contextRef.current.chapterId === targetChapter && discoveryGenRef.current === gen) {
        setRfLoadError(err instanceof Error ? err.message : 'Unable to load approved requisitions.');
      }
    } finally {
      if (contextRef.current.chapterId === targetChapter && discoveryGenRef.current === gen) {
        setRfLoading(false);
      }
    }
  }, [chapterId, canReadQueue, clearBatchDependentState]);

  useEffect(() => {
    void loadChapterDiscovery();
  }, [loadChapterDiscovery, refreshSignal]);

  const revalidateAndSeedFromReservations = useCallback(
    (resvList: ReservationOptionRecord[], holdsList: ActiveHoldRecord[]) => {
      const eligibleResvs = resvList.filter((r) => filterEligibleReservationRanges(r, holdsList).length > 0);
      const resById = new Map(eligibleResvs.map((r) => [r.id, r]));

      let clearedStale = false;
      setIssueLines((prev) => {
        if (prev.length === 1 && !prev[0].reservation_id) {
          const first = eligibleResvs[0];
          if (!first) {
            return prev;
          }
          const ranges = filterEligibleReservationRanges(first, holdsList);
          return [
            {
              rf_line_id: first.rf_line_id,
              reservation_id: first.id,
              expected_reservation_version: String(first.version),
              expected_reservation_material_version: String(first.material_version),
              targets: ranges.map((al) => ({
                stock_lot_id: al.stock_lot_id,
                basis_segment_id: al.basis_segment_id,
                offset_quantity: String(al.offset_quantity),
                quantity: String(al.quantity),
              })),
            },
          ];
        }

        return prev.map((ln) => {
          if (!ln.reservation_id) {
            return ln;
          }
          const matched = resById.get(ln.reservation_id);
          if (!matched) {
            clearedStale = true;
            return {
              ...ln,
              reservation_id: '',
              expected_reservation_version: '1',
              expected_reservation_material_version: '1',
              targets: ln.targets.map((t) => ({
                ...emptyStockRange(),
                quantity: t.quantity,
              })),
            };
          }
          const validRanges = filterEligibleReservationRanges(matched, holdsList);
          const refreshedTargets = ln.targets.map((t) => {
            if (!t.stock_lot_id) {
              return t;
            }
            const stillValid = validRanges.find(
              (r) =>
                r.stock_lot_id === t.stock_lot_id &&
                r.basis_segment_id === t.basis_segment_id &&
                r.offset_quantity === t.offset_quantity,
            );
            if (!stillValid) {
              clearedStale = true;
              return { ...emptyStockRange(), quantity: t.quantity };
            }
            return t;
          });
          return {
            ...ln,
            rf_line_id: matched.rf_line_id,
            expected_reservation_version: String(matched.version),
            expected_reservation_material_version: String(matched.material_version),
            targets: refreshedTargets,
          };
        });
      });

      if (clearedStale) {
        setStatusMessage(
          'A previously selected reservation or batch range became held, depleted, or ineligible and was cleared while keeping your other inputs.',
        );
      }
    },
    [],
  );

  const listRfIssues = useCallback(
    async (explicitRfId?: string, opts?: { preserveError?: boolean }) => {
      const targetChapter = chapterId;
      const targetRf = (explicitRfId ?? rfId).trim();
      if (!targetRf) {
        return;
      }
      const gen = ++rfSelectGenRef.current;
      const guard = () =>
        contextRef.current.chapterId === targetChapter &&
        contextRef.current.rfId.trim() === targetRf &&
        rfSelectGenRef.current === gen;

      if (!opts?.preserveError) {
        setError(null);
      }
      try {
        const [revRes, allResv, allIss, freshHolds] = await Promise.all([
          apiGet<AllocationReviewData>(`/api/v1/chapters/${targetChapter}/internal-rfs/${targetRf}/allocation-review`),
          fetchAllAuthorizedPages<ReservationOptionRecord>(
            `/api/v1/chapters/${targetChapter}/internal-rfs/${targetRf}/reservations`,
            { shouldContinue: guard },
          ),
          fetchAllAuthorizedPages<ActualIssueRecord>(
            `/api/v1/chapters/${targetChapter}/internal-rfs/${targetRf}/actual-issues`,
            { shouldContinue: guard },
          ),
          fetchAllAuthorizedPages<ActiveHoldRecord>(
            `/api/v1/chapters/${targetChapter}/stock-holds?status=active`,
            { shouldContinue: guard },
          ),
        ]);
        if (!guard()) {
          return;
        }
        setReviewData(revRes.data);
        setReservations(allResv);
        setIssuesList(allIss);
        setIssuesJson(allIss);
        setActiveHolds(freshHolds);

        if (revRes.data.rf) {
          setExpectedRfVersion(String(revRes.data.rf.version));
          setExpectedRfMatVersion(String(revRes.data.rf.material_version));
          setExpectedRfProgressVersion(String(revRes.data.rf.progress_version));
        }

        const wfRequester =
          revRes.data.rf?.requester_id ?? revRes.data.rf?.requester_user_id ?? null;
        const currentRecipient = contextRef.current.recipientId;
        if (currentRecipient && wfRequester && currentRecipient !== wfRequester && !allIss.some((i) => i.id === contextRef.current.issueId && i.recipient_id === currentRecipient)) {
          setRecipientId('');
        }

        const currentIssueId = contextRef.current.issueId.trim();
        if (currentIssueId) {
          const matchedIssue = allIss.find((i) => i.id === currentIssueId);
          if (!matchedIssue) {
            issueSelectGenRef.current += 1;
            setIssueId('');
            clearBatchDependentState();
            setStatusMessage('Selected issue handover does not belong to this requisition and was cleared.');
          } else {
            void hydrateIssueBatch(matchedIssue.id, targetChapter, targetRf);
          }
        }

        revalidateAndSeedFromReservations(allResv, freshHolds);
      } catch (err) {
        if (!guard()) {
          return;
        }
        setError(err);
        if (err instanceof ContractApiError && [403, 404].includes(err.status)) {
          setRfId('');
          setIssueId('');
          setReviewData(null);
          setReservations([]);
          setIssuesList([]);
          setIssuesJson(null);
          clearBatchDependentState();
        }
      }
    },
    [chapterId, rfId, clearBatchDependentState, hydrateIssueBatch, revalidateAndSeedFromReservations],
  );

  useEffect(() => {
    if (!rfId.trim()) {
      return;
    }
    void listRfIssues(rfId);
  }, [chapterId, rfId, refreshSignal, listRfIssues]);

  function handleSelectRf(nextRfId: string) {
    if (nextRfId === rfId) {
      return;
    }
    rfSelectGenRef.current += 1;
    issueSelectGenRef.current += 1;
    uploadGenRef.current += 1;
    setRfId(nextRfId);
    // Clear dependent child selections (batch, evidence, ack, snapshot, pins) while preserving unrelated form edits
    setIssueId('');
    setIssueLines([emptyIssueLine()]);
    setRecipientId('');
    setReviewData(null);
    setReservations([]);
    setIssuesList([]);
    setIssuesJson(null);
    clearBatchDependentState();
  }

  function handleSelectIssue(opt: SearchablePickerOption<ActualIssueRecord> | null) {
    issueSelectGenRef.current += 1;
    uploadGenRef.current += 1;
    clearBatchDependentState();
    if (!opt) {
      setIssueId('');
      return;
    }
    setIssueId(opt.id);
    setExpectedVersion(String(opt.meta.version));
    setExpectedMatVersion(String(opt.meta.material_version));
    setSnapshotMatVer(String(opt.meta.snapshot?.material_version ?? opt.meta.material_version));
    setSnapshotSha(opt.meta.snapshot?.sha256 ?? '');
    setAcknowledgmentId(opt.meta.acknowledgment?.acknowledgment_id ?? opt.meta.acknowledgment?.id ?? '');
    if (opt.meta.recipient_id) {
      setRecipientId(opt.meta.recipient_id);
    }
    void hydrateIssueBatch(opt.id, chapterId, rfId);
  }

  // Persist full editable chapter fields in RAM per officer and chapter (A -> B -> A)
  useEffect(() => {
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const payload: SavedIssueDraft = {
      rfId,
      issueId,
      opKind,
      recipientId,
      handedOverAt,
      acknowledgedAt,
      acceptsPartial,
      issueLines,
      reviseReason,
      reconcileReason,
      finding,
      matchesPaper,
      attachReconcileEvidence,
      acknowledgmentId,
      snapshotSha,
    };
    const hasUnsaved =
      rfId.trim() !== '' ||
      issueId.trim() !== '' ||
      recipientId.trim() !== '' ||
      reviseReason.trim() !== '' ||
      reconcileReason.trim() !== '' ||
      acceptsPartial ||
      issueLines.some((l) => l.reservation_id !== '' || l.targets.some((t) => t.quantity !== '1'));
    if (!hasUnsaved) {
      return;
    }
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey: FORM_KEY,
      label: issueId.trim() ? `Issue Handover (${opKind})` : `Actual Issue (${opKind})`,
      baseVersion: Number.parseInt(expectedVersion, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify(payload),
    });
  }, [
    userId,
    chapterId,
    rfId,
    issueId,
    opKind,
    recipientId,
    handedOverAt,
    acknowledgedAt,
    acceptsPartial,
    issueLines,
    reviseReason,
    reconcileReason,
    finding,
    matchesPaper,
    attachReconcileEvidence,
    acknowledgmentId,
    snapshotSha,
    expectedVersion,
  ]);

  const opBlockReason = actionBlockReason(chapterAccess, ...ISSUE_REQUIRED_ACTIONS[opKind]);

  const rfPickerOptions = useMemo<Array<SearchablePickerOption<InternalRfOption>>>(() => {
    const queueMap = new Map<string, AllocationQueueHint>();
    for (const q of queueHints) {
      if (!queueMap.has(q.rf_id)) {
        queueMap.set(q.rf_id, q);
      }
    }
    return rfList.map((rf) => {
      const hint = queueMap.get(rf.id);
      const refText = rf.reference ?? 'Approved Requisition';
      return {
        id: rf.id,
        primaryLabel: refText,
        secondaryLabel: hint
          ? `${hint.variant_label} · Unreserved ${hint.unreserved_outstanding_quantity} ${hint.unit_code}`
          : `${rf.justification ? `${rf.justification} · ` : ''}${rf.needed_at ? `Needed ${formatManilaTime(rf.needed_at)}` : 'Approved'}`,
        badge: hint ? `Queue #${hint.queue_position}` : (rf.fulfillment_status ?? rf.status ?? 'approved').replaceAll('_', ' '),
        badgeTone: hint?.allocation_tier === 'active_commitment' ? 'ready' : 'neutral',
        searchText: `${refText} ${rf.justification ?? ''} ${hint?.variant_label ?? ''}`,
        meta: rf,
      };
    });
  }, [rfList, queueHints]);

  const issuePickerOptions = useMemo<Array<SearchablePickerOption<ActualIssueRecord>>>(() => {
    return issuesList.map((iss, idx) => ({
      id: iss.id,
      primaryLabel: iss.reference ?? iss.issue_reference ?? `Handover Draft #${idx + 1}`,
      secondaryLabel: `Status: ${iss.status} · v${iss.version}`,
      badge: iss.status.replaceAll('_', ' '),
      badgeTone: iss.status === 'posted' ? 'ready' : 'warning',
      meta: iss,
    }));
  }, [issuesList]);

  // Only server-authorized, workflow-established recipient options for the selected RF/batch
  const recipientOptions = useMemo<Array<SearchablePickerOption<{ user_id: string }>>>(() => {
    const out: Array<SearchablePickerOption<{ user_id: string }>> = [];
    const seen = new Set<string>();
    const addCandidate = (id: string | null | undefined, label: string, detail: string, badge: string) => {
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      const isSelf = id === chapterContext?.user_id;
      out.push({
        id,
        primaryLabel: label,
        secondaryLabel: detail,
        badge: isSelf ? 'Cannot Issue to Self' : badge,
        badgeTone: isSelf ? 'warning' : 'ready',
        disabled: isSelf,
        disabledReason: isSelf ? 'Issuing officer cannot be the recipient of their own actual issue.' : undefined,
        meta: { user_id: id },
      });
    };

    const selectedRf = rfList.find((r) => r.id === rfId);
    const requesterId =
      reviewData?.rf?.requester_id ??
      reviewData?.rf?.requester_user_id ??
      selectedRf?.requester_id ??
      selectedRf?.requester_user_id;
    addCandidate(
      requesterId,
      `Requisition Requester (${selectedRf?.reference ?? 'Selected RF'})`,
      'Workflow-established requesting committee representative',
      'Eligible Recipient',
    );
    const selectedIssue = issuesList.find((i) => i.id === issueId);
    if (selectedIssue?.recipient_id && !seen.has(selectedIssue.recipient_id)) {
      addCandidate(
        selectedIssue.recipient_id,
        `Handover Recipient (${selectedIssue.reference ?? selectedIssue.issue_reference ?? 'Selected Batch'})`,
        'Recorded field-eligible recipient for selected handover batch',
        'Batch Recipient',
      );
    }
    return out;
  }, [rfList, rfId, issueId, issuesList, reviewData, chapterContext]);

  const lotLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of reviewData?.lines ?? []) {
      for (const lot of line.candidate_lots ?? []) {
        if (lot.source_reference) {
          map.set(lot.stock_lot_id, lot.source_reference);
        }
      }
    }
    return map;
  }, [reviewData]);

  const eligibleReservations = useMemo(() => {
    return reservations
      .map((r) => ({
        reservation: r,
        eligibleRanges: filterEligibleReservationRanges(r, activeHolds),
      }))
      .filter((entry) => entry.eligibleRanges.length > 0);
  }, [reservations, activeHolds]);

  const reservationOptions = useMemo<Array<SearchablePickerOption<{ reservation: ReservationOptionRecord; eligibleRanges: ReservationAllocItem[] }>>>(() => {
    return eligibleReservations.map((entry, idx) => ({
      id: entry.reservation.id,
      primaryLabel: `Reservation #${idx + 1} (${entry.reservation.active_quantity} active · ${entry.eligibleRanges.length} ${entry.eligibleRanges.length === 1 ? 'range' : 'ranges'})`,
      secondaryLabel: `Active unheld ranges ready · v${entry.reservation.version}`,
      badge: 'ACTIVE',
      badgeTone: 'ready',
      meta: entry,
    }));
  }, [eligibleReservations]);

  function getRangeOptionsForReservation(reservationId: string): Array<SearchablePickerOption<ReservationAllocItem>> {
    const found = eligibleReservations.find((e) => e.reservation.id === reservationId);
    if (!found) {
      return [];
    }
    return found.eligibleRanges.map((al, rIdx) => {
      const lotLabel = lotLabelMap.get(al.stock_lot_id) ?? `Lot ${al.stock_lot_id.slice(0, 8)}`;
      return {
        id: `${al.stock_lot_id}|${al.basis_segment_id}|${al.offset_quantity}`,
        primaryLabel: `${lotLabel} · Slice #${rIdx + 1} (${al.quantity} reserved)`,
        secondaryLabel: `Offset ${al.offset_quantity} · Active & unheld`,
        badge: `${al.quantity} avail`,
        badgeTone: 'ready',
        meta: al,
      };
    });
  }

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey: FORM_KEY,
      label: issueId.trim() ? `Issue Handover (${opKind})` : `Actual Issue (${opKind})`,
      baseVersion: Number.parseInt(expectedVersion, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({
        rfId,
        issueId,
        opKind,
        recipientId,
        handedOverAt,
        acknowledgedAt,
        acceptsPartial,
        issueLines,
        reviseReason,
        reconcileReason,
        finding,
        matchesPaper,
        attachReconcileEvidence,
        acknowledgmentId,
        snapshotSha,
      } satisfies SavedIssueDraft),
    });
    setStatusMessage('Issue handover details saved as a temporary draft for this session.');
  }

  async function handleInlineHandoverUpload() {
    const capChapter = chapterId;
    const capRf = rfId.trim();
    const capIssue = issueId.trim();
    const capIssueGen = issueSelectGenRef.current;
    const capUploadGen = ++uploadGenRef.current;

    if (!capIssue || !handoverFiles || handoverFiles.length === 0) {
      setError(new Error('Select an issue handover and attach the signed handover scan first.'));
      return;
    }
    setUploadingEvidence(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('purpose', 'actual_issue');
      fd.append('record_id', capIssue);
      for (const f of Array.from(handoverFiles)) {
        fd.append('attachments', f, f.name);
      }
      const { result } = await apiMutate<{
        evidence_id: string;
        version_id: string;
        attachments: Array<{ attachment_id: string; sha256: string }>;
      }>('POST', `/api/v1/chapters/${capChapter}/evidence`, fd);

      // Discard late upload response if chapter, RF, or batch changed while in flight
      if (
        contextRef.current.chapterId !== capChapter ||
        contextRef.current.rfId.trim() !== capRf ||
        contextRef.current.issueId.trim() !== capIssue ||
        issueSelectGenRef.current !== capIssueGen ||
        uploadGenRef.current !== capUploadGen
      ) {
        return;
      }

      setEvidenceBinding({
        evidence_id: result.data.evidence_id,
        version_id: result.data.version_id,
        attachments: result.data.attachments.map((a) => ({
          attachment_id: a.attachment_id,
          sha256: a.sha256,
        })),
      });
      setStatusMessage(`Signed handover slip uploaded (${result.data.attachments.length} file).`);
    } catch (err) {
      if (
        contextRef.current.chapterId !== capChapter ||
        contextRef.current.rfId.trim() !== capRf ||
        contextRef.current.issueId.trim() !== capIssue ||
        issueSelectGenRef.current !== capIssueGen
      ) {
        return;
      }
      setStatusMessage(null);
      setError(err);
      if (err instanceof ContractApiError && [403, 404, 409].includes(err.status)) {
        void loadChapterDiscovery();
        if (capRf) {
          void listRfIssues(capRf, { preserveError: true });
        }
      }
    } finally {
      if (
        contextRef.current.chapterId === capChapter &&
        contextRef.current.issueId.trim() === capIssue &&
        issueSelectGenRef.current === capIssueGen
      ) {
        setUploadingEvidence(false);
      }
    }
  }

  function buildBody(): Record<string, unknown> {
    const issueVers = {
      expected_version: Number.parseInt(expectedVersion, 10) || 1,
      expected_material_version: Number.parseInt(expectedMatVersion, 10) || 1,
    };
    const rfVers = {
      expected_rf_version: Number.parseInt(expectedRfVersion, 10) || 1,
      expected_rf_material_version: Number.parseInt(expectedRfMatVersion, 10) || 1,
      expected_rf_progress_version: Number.parseInt(expectedRfProgressVersion, 10) || 1,
    };
    const mappedLines = issueLines.map((ln) => ({
      rf_line_id: ln.rf_line_id.trim(),
      reservation_id: ln.reservation_id.trim(),
      expected_reservation_version: Number.parseInt(ln.expected_reservation_version, 10) || 1,
      expected_reservation_material_version: Number.parseInt(ln.expected_reservation_material_version, 10) || 1,
      targets: toWireRanges(ln.targets),
    }));

    switch (opKind) {
      case 'prepare':
        return {
          ...rfVers,
          recipient_id: recipientId.trim(),
          lines: mappedLines,
          handed_over_at: handedOverAt.trim(),
          acknowledged_at: acknowledgedAt.trim(),
          recipient_accepts_partial: acceptsPartial,
        };
      case 'revise':
        return {
          ...issueVers,
          ...rfVers,
          recipient_id: recipientId.trim(),
          lines: mappedLines,
          handed_over_at: handedOverAt.trim(),
          acknowledged_at: acknowledgedAt.trim(),
          recipient_accepts_partial: acceptsPartial,
          reason: reviseReason.trim(),
        };
      case 'ack':
        return {
          ...issueVers,
          expected_snapshot: {
            target: { purpose: 'actual_issue', record_id: issueId.trim() },
            material_version: Number.parseInt(snapshotMatVer, 10) || 1,
            sha256: snapshotSha.trim(),
          },
          evidence: toWireEvidenceBinding(evidenceBinding),
          matches_paper: matchesPaper,
        };
      case 'post':
        return {
          ...issueVers,
          ...rfVers,
          acknowledgment_id: acknowledgmentId.trim(),
          current_sources: currentSources.map((src) => ({
            reservation_id: src.reservation_id.trim(),
            expected_version: Number.parseInt(src.expected_version, 10) || 1,
            expected_material_version: Number.parseInt(src.expected_material_version, 10) || 1,
            targets: src.targets.map((t) => ({
              stock_lot_id: t.stock_lot_id.trim(),
              basis_segment_id: t.basis_segment_id.trim(),
              offset_quantity: t.offset_quantity.trim(),
              quantity: t.quantity.trim(),
              expected_lot_material_version: Number.parseInt(t.expected_lot_material_version, 10) || 1,
              expected_stock_version: Number.parseInt(t.expected_stock_version, 10) || 1,
            })),
          })),
        };
      case 'reconcile':
        return {
          expected_version: Number.parseInt(expectedVersion, 10) || 1,
          finding,
          reason: reconcileReason.trim(),
          evidence: attachReconcileEvidence ? toWireEvidenceBinding(evidenceBinding) : null,
        };
    }
  }

  async function executeIssueOp(e: React.FormEvent) {
    e.preventDefault();
    const capChapter = chapterId;
    const capRf = rfId.trim();
    const capIssue = issueId.trim();
    setBusy(true);
    setError(null);
    setReplayed(false);

    const base = `/api/v1/chapters/${capChapter}`;
    const map: Record<IssueOpKind, { method: 'POST' | 'PUT'; path: string }> = {
      prepare: { method: 'POST', path: `${base}/internal-rfs/${capRf}/actual-issues` },
      revise: { method: 'PUT', path: `${base}/actual-issues/${capIssue}` },
      ack: { method: 'POST', path: `${base}/actual-issues/${capIssue}/acknowledgments` },
      post: { method: 'POST', path: `${base}/actual-issues/${capIssue}/post` },
      reconcile: { method: 'POST', path: `${base}/actual-issues/${capIssue}/reconciliations` },
    };
    const target = map[opKind];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, buildBody(), key);
      if (contextRef.current.chapterId !== capChapter) {
        return;
      }
      const { record, operationId } = unwrapMutationData<Record<string, unknown>>(result.data);
      skipNextAutoSaveRef.current = true;
      memoryDraftStore.clearDraft(userId, capChapter, FORM_KEY);
      setReplayed(result.replayed);
      setDetailJson(result.data);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      const nextIssueId =
        typeof record.id === 'string'
          ? record.id
          : typeof record.issue_id === 'string'
            ? record.issue_id
            : undefined;
      const effectiveIssueId = opKind === 'prepare' && nextIssueId ? nextIssueId : capIssue;
      if (opKind === 'prepare' && nextIssueId) {
        setIssueId(nextIssueId);
      }
      if (typeof record.version === 'number') {
        setExpectedVersion(String(record.version));
      }
      if (typeof record.material_version === 'number') {
        setExpectedMatVersion(String(record.material_version));
        setSnapshotMatVer(String(record.material_version));
      }
      const snap = record.snapshot && typeof record.snapshot === 'object' ? (record.snapshot as Record<string, unknown>) : null;
      if (snap && typeof snap.sha256 === 'string') {
        setSnapshotSha(snap.sha256);
      }
      const ack =
        record.acknowledgment && typeof record.acknowledgment === 'object'
          ? (record.acknowledgment as Record<string, unknown>)
          : null;
      const ackId =
        ack && typeof ack.acknowledgment_id === 'string'
          ? ack.acknowledgment_id
          : ack && typeof ack.id === 'string'
            ? ack.id
            : undefined;
      if (ackId) {
        setAcknowledgmentId(ackId);
      }
      const issueOpLabels: Record<IssueOpKind, string> = {
        prepare: 'Issue handover prepared — print sheet and upload signed paper next',
        revise: 'Prepared issue updated',
        ack: 'Signed paper handover confirmed — ready to post & deduct stock',
        post: 'Stock issue completed',
        reconcile: 'Verification note recorded',
      };
      setStatusMessage(`${issueOpLabels[opKind]}. Reference: ${key}`);
      if (capRf) {
        await listRfIssues(capRf);
      }
      if (effectiveIssueId) {
        await hydrateIssueBatch(effectiveIssueId, capChapter, capRf);
      }
    } catch (err) {
      if (contextRef.current.chapterId !== capChapter) {
        return;
      }
      setStatusMessage(null);
      setError(err);
      if (err instanceof ContractApiError && [403, 404, 409].includes(err.status)) {
        // Revalidate live authorized choices without wiping unrelated form edits or the error banner
        void loadChapterDiscovery();
        if (capRf) {
          void listRfIssues(capRf, { preserveError: true });
        }
        if (capIssue) {
          void hydrateIssueBatch(capIssue, capChapter, capRf);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/actual-issue-operations/by-key${buildQuery({ action_key: lookupKey.trim() })}`,
      );
      setDetailJson(res.data);
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
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/actual-issue-operations/${lookupOpId.trim()}`);
      setDetailJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function readIssuePart(kind: 'detail' | 'history' | 'movements' | 'related' | 'reconciliation' | 'print') {
    if (!issueId.trim()) {
      return;
    }
    setError(null);
    const id = issueId.trim();
    const base = `/api/v1/chapters/${chapterId}/actual-issues/${id}`;
    try {
      if (kind === 'print') {
        const html = await apiGetText(`${base}/print`);
        setPrintHtml(html);
        setDetailJson(null);
        return;
      }
      setPrintHtml(null);
      const pathMap: Record<Exclude<typeof kind, 'print'>, string> = {
        detail: base,
        history: `${base}/history`,
        movements: `${base}/movements`,
        related: `${base}/related`,
        reconciliation: `${base}/reconciliation`,
      };
      const res = await apiGet<unknown>(pathMap[kind]);
      if (kind === 'history' || kind === 'movements' || kind === 'related' || kind === 'reconciliation') {
        setIssuesJson(res.data);
      } else {
        setDetailJson(res.data);
      }
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
                id="iss-rf-picker"
                label="Select Approved Requisition"
                placeholder="Search approved requisition by number, item, or justification..."
                valueId={rfId}
                options={rfPickerOptions}
                loading={rfLoading}
                errorMessage={rfLoadError}
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
                Refresh RFs
              </button>
              <button
                type="button"
                className="p03-search-action-btn"
                onClick={() => void listRfIssues()}
                disabled={!rfId.trim()}
              >
                Reload Handovers
              </button>
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Actual Issue &amp; Handover</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Actual issue views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'workflow'}
                  className={`p03-filter-pill ${viewTab === 'workflow' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('workflow')}
                >
                  Issue Steps
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'inspect'}
                  className={`p03-filter-pill ${viewTab === 'inspect' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('inspect')}
                >
                  Handover History &amp; Movements
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'status'}
                  className={`p03-filter-pill ${viewTab === 'status' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('status')}
                >
                  Submission Status
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

        <section className="p03-card surface-card form-stack" aria-label="Stock issue handover overview">
          <div className="p03-card-header-row">
            <div>
              <h2 className="p03-section-title">Issue Handover Execution</h2>
              <p className="form-card-subtitle">
                Select a requisition, pick active unheld reservations and workflow-eligible recipients, attach signed handover paper, and complete stock deduction from pinned batch versions.
              </p>
            </div>
            <div className="p03-chip-wrap">
              {rfId.trim() && (
                <span className="p03-version-pill">
                  {rfPickerOptions.find((o) => o.id === rfId)?.primaryLabel ?? 'Requisition Loaded'}
                </span>
              )}
              {issueId.trim() && (
                <span className="p03-version-pill">
                  {issuePickerOptions.find((o) => o.id === issueId)?.primaryLabel ?? 'Handover Selected'}
                </span>
              )}
            </div>
          </div>
          <OperationBanner
            error={error}
            statusMessage={statusMessage}
            replayed={replayed}
            onDismiss={() => setStatusMessage(null)}
          />
        </section>

        {viewTab === 'workflow' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Issue handover context references">
              <h2 className="p03-section-title">Handover Selection &amp; Shortcuts</h2>
              <div className="form-stack">
                <SearchableRecordPicker
                  id="iss-issue-picker"
                  label="Existing Issue Handover"
                  placeholder="Select an existing handover for this requisition..."
                  valueId={issueId}
                  options={issuePickerOptions}
                  emptyMessage="No handover records exist yet for this requisition."
                  onSelect={handleSelectIssue}
                />

                <div className="p02-compact-btn-group">
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('detail');
                      setViewTab('status');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Read Detail
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('history');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('movements');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Movements
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('related');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Related
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('reconciliation');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Reconciliation
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('print');
                      setViewTab('status');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Print Sheet
                  </button>
                </div>
              </div>
            </section>

            <section className="p03-card surface-card form-stack" aria-label="Record or update issue handover">
              <h2 className="p03-section-title">Record or Update Issue Handover</h2>

              {opBlockReason && (
                <div className="callout-banner is-warning">
                  <span className="callout-dot dot-warning" aria-hidden="true" />
                  <span>{opBlockReason}</span>
                </div>
              )}

              <form onSubmit={executeIssueOp} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="iss-op">
                    Workflow Step
                  </label>
                  <select
                    id="iss-op"
                    className="form-control"
                    value={opKind}
                    onChange={(e) => setOpKind(e.target.value as IssueOpKind)}
                  >
                    <option value="prepare">1. Prepare Issue Handover</option>
                    <option value="revise">Update Prepared Issue</option>
                    <option value="ack">2. Confirm Signed Paper Handover</option>
                    <option value="post">3. Complete &amp; Deduct Stock</option>
                    <option value="reconcile">Record Verification Note</option>
                  </select>
                </div>

                {(opKind === 'prepare' || opKind === 'revise') && (
                  <>
                    <SearchableRecordPicker
                      id="iss-recipient-picker"
                      label="Recipient Officer"
                      placeholder="Select receiving officer..."
                      valueId={recipientId}
                      options={recipientOptions}
                      emptyMessage="Select an approved requisition to view its authorized recipient."
                      helperText="Shows the field-eligible recipient established by this requisition workflow; broader recipient lookup requires Leader's scoped candidate endpoint (#30)."
                      onSelect={(opt) => setRecipientId(opt ? opt.id : '')}
                    />

                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label" htmlFor="iss-handed-over-at">Handover Timestamp</label>
                        <input
                          id="iss-handed-over-at"
                          className="form-control"
                          required
                          value={handedOverAt}
                          onChange={(e) => setHandedOverAt(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="iss-acknowledged-at">Acknowledgment Timestamp</label>
                        <input
                          id="iss-acknowledged-at"
                          className="form-control"
                          required
                          value={acknowledgedAt}
                          onChange={(e) => setAcknowledgedAt(e.target.value)}
                        />
                      </div>
                    </div>

                    <label className={`p03-checkbox-row ${acceptsPartial ? 'is-checked' : ''}`}>
                      <input
                        id="iss-accepts-partial"
                        type="checkbox"
                        className="p03-sr-checkbox"
                        checked={acceptsPartial}
                        onChange={(e) => setAcceptsPartial(e.target.checked)}
                      />
                      <span className={`p03-check-indicator ${acceptsPartial ? 'is-checked' : ''}`} aria-hidden="true">
                        ✓
                      </span>
                      <span className="p03-checkbox-main">Recipient agrees to partial handover</span>
                    </label>

                    {opKind === 'revise' && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="iss-revise-reason">Revision Reason</label>
                        <input
                          id="iss-revise-reason"
                          className="form-control"
                          required
                          value={reviseReason}
                          onChange={(e) => setReviseReason(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="form-stack">
                      <div className="p04-line-top">
                        <span className="form-label">Reserved Batch Releases</span>
                        <button
                          type="button"
                          className="p02-compact-btn"
                          onClick={() => setIssueLines((p) => [...p, emptyIssueLine()])}
                        >
                          + Add Line
                        </button>
                      </div>
                      <div className="p04-lines-list">
                        {issueLines.map((ln, idx) => {
                          const rangeOpts = ln.reservation_id ? getRangeOptionsForReservation(ln.reservation_id) : [];
                          return (
                            <div key={idx} className="p04-line-card form-stack">
                              <SearchableRecordPicker
                                id={`iss-resv-picker-${idx}`}
                                label={`Active Reservation #${idx + 1}`}
                                placeholder="Select active eligible reservation for this requisition..."
                                valueId={ln.reservation_id}
                                options={reservationOptions}
                                emptyMessage="No active unheld reservations found for this requisition."
                                onSelect={(opt) => {
                                  if (!opt) {
                                    setIssueLines((p) => p.map((x, i) => (i === idx ? emptyIssueLine() : x)));
                                    return;
                                  }
                                  const { reservation: res, eligibleRanges } = opt.meta;
                                  setIssueLines((p) =>
                                    p.map((x, i) =>
                                      i === idx
                                        ? {
                                            rf_line_id: res.rf_line_id,
                                            reservation_id: res.id,
                                            expected_reservation_version: String(res.version),
                                            expected_reservation_material_version: String(res.material_version),
                                            targets: eligibleRanges.map((al) => ({
                                              stock_lot_id: al.stock_lot_id,
                                              basis_segment_id: al.basis_segment_id,
                                              offset_quantity: String(al.offset_quantity),
                                              quantity: String(al.quantity),
                                            })),
                                          }
                                        : x,
                                    ),
                                  );
                                }}
                              />

                              {ln.reservation_id && rangeOpts.length > 1 && (
                                <div className="p02-compact-btn-group">
                                  <button
                                    type="button"
                                    className="p02-compact-btn"
                                    onClick={() =>
                                      setIssueLines((p) =>
                                        p.map((x, i) =>
                                          i === idx ? { ...x, targets: [...x.targets, emptyStockRange()] } : x,
                                        ),
                                      )
                                    }
                                  >
                                    + Add Reserved Range
                                  </button>
                                </div>
                              )}

                              {ln.targets.map((tgt, tIdx) => {
                                const pickedRangeId = tgt.stock_lot_id
                                  ? `${tgt.stock_lot_id}|${tgt.basis_segment_id}|${tgt.offset_quantity}`
                                  : '';
                                return (
                                  <div key={tIdx} className="p04-line-card form-stack">
                                    {rangeOpts.length > 0 && (
                                      <SearchableRecordPicker
                                        id={`iss-resv-range-${idx}-${tIdx}`}
                                        label={`Reserved Range #${tIdx + 1}`}
                                        placeholder="Select active unheld reserved slice..."
                                        valueId={pickedRangeId}
                                        options={rangeOpts}
                                        emptyMessage="No active eligible ranges in selected reservation."
                                        onSelect={(rangeOpt) => {
                                          setIssueLines((p) =>
                                            p.map((x, i) =>
                                              i === idx
                                                ? {
                                                    ...x,
                                                    targets: x.targets.map((row, rIdx) =>
                                                      rIdx === tIdx
                                                        ? rangeOpt
                                                          ? {
                                                              stock_lot_id: rangeOpt.meta.stock_lot_id,
                                                              basis_segment_id: rangeOpt.meta.basis_segment_id,
                                                              offset_quantity: String(rangeOpt.meta.offset_quantity),
                                                              quantity: String(rangeOpt.meta.quantity),
                                                            }
                                                          : emptyStockRange()
                                                        : row,
                                                    ),
                                                  }
                                                : x,
                                            ),
                                          );
                                        }}
                                      />
                                    )}
                                    <div className="p04-line-top">
                                      <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" htmlFor={`iss-qty-${idx}-${tIdx}`}>
                                          Quantity to Issue from Range #{tIdx + 1}
                                        </label>
                                        <input
                                          id={`iss-qty-${idx}-${tIdx}`}
                                          className="form-control"
                                          required
                                          value={tgt.quantity}
                                          onChange={(e) =>
                                            setIssueLines((p) =>
                                              p.map((x, i) =>
                                                i === idx
                                                  ? {
                                                      ...x,
                                                      targets: x.targets.map((row, rIdx) =>
                                                        rIdx === tIdx ? { ...row, quantity: e.target.value } : row,
                                                      ),
                                                    }
                                                  : x,
                                              ),
                                            )
                                          }
                                        />
                                      </div>
                                      {ln.targets.length > 1 && (
                                        <button
                                          type="button"
                                          className="p02-compact-btn is-subtle-danger"
                                          onClick={() =>
                                            setIssueLines((p) =>
                                              p.map((x, i) =>
                                                i === idx
                                                  ? { ...x, targets: x.targets.filter((_, rIdx) => rIdx !== tIdx) }
                                                  : x,
                                              ),
                                            )
                                          }
                                        >
                                          Remove Range
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {opKind === 'ack' && (
                  <>
                    <div className="p04-line-card form-stack">
                      <span className="form-label">Upload Signed Handover Paper</span>
                      <input
                        key={fileInputKey}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        className="form-control"
                        onChange={(e) => setHandoverFiles(e.target.files)}
                      />
                      <div className="p02-compact-btn-group">
                        <button
                          type="button"
                          className="p02-compact-btn"
                          disabled={uploadingEvidence || !issueId.trim() || !handoverFiles?.length}
                          onClick={() => void handleInlineHandoverUpload()}
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
                          label="Signed Handover Document Binding"
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
                        I confirm the physically signed paper form matches this batch release
                      </span>
                    </label>
                  </>
                )}

                {opKind === 'post' && (
                  <div className="form-stack">
                    <div className="callout-banner is-info">
                      <span className="callout-dot dot-info" aria-hidden="true" />
                      <span>
                        {acknowledgmentId.trim()
                          ? 'Signed handover acknowledgment is attached and ready for stock deduction.'
                          : 'Confirm step "2. Confirm Signed Paper Handover" first so the signed acknowledgment links automatically.'}
                      </span>
                    </div>
                    <div className="p04-lines-list">
                      <div className="p04-line-top">
                        <span className="form-label">Pinned Batch Releases for Deduction</span>
                        <button
                          type="button"
                          className="p02-compact-btn"
                          disabled={!issueId.trim() || batchHydrating}
                          onClick={() => void hydrateIssueBatch(issueId, chapterId, rfId)}
                        >
                          {batchHydrating ? 'Refreshing...' : 'Refresh Batch Versions'}
                        </button>
                      </div>
                      {currentSources.length === 0 ? (
                        <p className="p03-muted-copy">
                          Select the prepared &amp; acknowledged issue handover above to carry its pinned reservation and batch versions automatically.
                        </p>
                      ) : (
                        currentSources.map((src) => (
                          <div key={src.reservation_id} className="p04-line-card form-stack">
                            <div className="p04-line-top">
                              <strong>Reservation Pin {src.reservation_id.slice(0, 8)}</strong>
                              <span className="p03-version-pill">
                                v{src.expected_version} · mat v{src.expected_material_version}
                              </span>
                            </div>
                            {src.targets.map((tgt, tIdx) => (
                              <span key={tIdx} className="picker-secondary-label">
                                {tgt.label ?? tgt.stock_lot_id.slice(0, 8)} · Slice [{tgt.offset_quantity}, +{tgt.quantity}] · Lot v{tgt.expected_stock_version}
                              </span>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {opKind === 'reconcile' && (
                  <>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label">Verification Result</label>
                        <select
                          className="form-control"
                          value={finding}
                          onChange={(e) =>
                            setFinding(e.target.value as 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed')
                          }
                        >
                          <option value="no_handover">No Handover Occurred</option>
                          <option value="handed_over_unposted">Handed Over (Not Yet Recorded)</option>
                          <option value="committed">Completed &amp; Confirmed</option>
                          <option value="disputed">Disputed / Needs Review</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Reason</label>
                        <input
                          className="form-control"
                          required
                          value={reconcileReason}
                          onChange={(e) => setReconcileReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <label className={`p03-checkbox-row ${attachReconcileEvidence ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        className="p03-sr-checkbox"
                        checked={attachReconcileEvidence}
                        onChange={(e) => setAttachReconcileEvidence(e.target.checked)}
                      />
                      <span
                        className={`p03-check-indicator ${attachReconcileEvidence ? 'is-checked' : ''}`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span className="p03-checkbox-main">Include signed document attachment</span>
                    </label>
                    {attachReconcileEvidence && (
                      <div className="p04-line-card form-stack">
                        <input
                          key={fileInputKey}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          multiple
                          className="form-control"
                          onChange={(e) => setHandoverFiles(e.target.files)}
                        />
                        <button
                          type="button"
                          className="p02-compact-btn"
                          disabled={uploadingEvidence || !issueId.trim() || !handoverFiles?.length}
                          onClick={() => void handleInlineHandoverUpload()}
                        >
                          {uploadingEvidence ? 'Uploading...' : 'Upload & Attach Signed Paper'}
                        </button>
                      </div>
                    )}
                  </>
                )}

                <div className="p03-guard-buttons">
                  <button
                    className="btn-batcave-primary"
                    type="submit"
                    disabled={busy || opBlockReason !== null}
                    title={opBlockReason ?? undefined}
                  >
                    Submit Issue Action
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

        {viewTab === 'inspect' && (
          <section className="p03-card surface-card form-stack" aria-label="Handovers and movement records">
            <h2 className="p03-section-title">Handover List, History &amp; Movements</h2>
            {issuesJson === null ? (
              <p className="p03-muted-copy">
                No handover records loaded. Select an approved requisition above to inspect live handovers.
              </p>
            ) : (
              <pre className="json-box">{JSON.stringify(issuesJson, null, 2)}</pre>
            )}
          </section>
        )}

        {viewTab === 'status' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Status lookup">
              <h2 className="p03-section-title">Check Handover Submission Status</h2>
              <div className="form-stack">
                <form onSubmit={lookupByKey} className="form-group">
                  <label className="form-label" htmlFor="iss-lkp">
                    Submission Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="iss-lkp"
                      className="form-control"
                      required
                      value={lookupKey}
                      onChange={(e) => setLookupKey(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      Check Status
                    </button>
                  </div>
                </form>

                <form onSubmit={lookupByOpId} className="form-group">
                  <label className="form-label" htmlFor="iss-opid">
                    Change Record Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="iss-opid"
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

            <section className="p03-card surface-card form-stack" aria-label="Detail and printable form">
              <h2 className="p03-section-title">Detail &amp; Printable Form</h2>
              {detailJson === null && printHtml === null ? (
                <p className="p03-muted-copy">
                  No result loaded. Inspect a handover detail or check a submission reference on the left.
                </p>
              ) : (
                <div className="form-stack">
                  {detailJson !== null && <pre className="json-box">{JSON.stringify(detailJson, null, 2)}</pre>}
                  {printHtml !== null && (
                    <iframe title="Actual Issue Printout" sandbox="" srcDoc={printHtml} className="stage1-print-frame" />
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
