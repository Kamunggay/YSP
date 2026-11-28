import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { formatManilaTime } from '../api/client.ts';
import {
  cancelReceivingReport,
  createReceivingHold,
  createReceivingReport,
  findReceivingOperationByKey,
  inspectReceivingReport,
  linkReceivingHoldSource,
  listDonations,
  listPurchaseOrders,
  listReceivingDiscrepancies,
  listReceivingHoldHistory,
  listReceivingHolds,
  listReceivingReportDiscrepancies,
  listReceivingReportHistory,
  listReceivingReportMovements,
  listReceivingReportRelated,
  listReceivingReports,
  matchReceivingReportEvidence,
  notifySupplierOfReceivingDiscrepancy,
  postReceivingReport,
  printReceivingReport,
  readReceivingOperation,
  readReceivingReport,
  readReceivingReportVersion,
  rejectReturnReceivingHold,
  replaceReceivingReport,
  resolveReceivingDiscrepancy,
} from '../api/stage2Client.ts';
import type {
  Donation,
  PurchaseOrder,
  QuarantinedLotDisposition,
  ReceivingDiscrepancy,
  ReceivingDiscrepancyResolutionKind,
  ReceivingHold,
  ReceivingHoldHistoryEntry,
  ReceivingHoldItemInput,
  ReceivingMovement,
  ReceivingOperationName,
  ReceivingReport,
  ReceivingReportHistoryEntry,
  ReceivingReportLineInput,
  ReceivingReportRelatedRecord,
  ReceivingSourceKind,
  Stage2EvidenceByteBinding,
} from '../api/stage2Types.ts';
import type { ChapterAccessSnapshot, WorkspaceTab } from '../api/types.ts';
import { useStage2Candidates } from '../api/useStage2Candidates.ts';
import { NavFlowHeader } from '../components/NavFlowHeader.tsx';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker } from '../components/SearchableRecordPicker.tsx';
import type { SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
import { Stage2AuditPanels } from '../components/Stage2AuditPanels.tsx';
import { Stage2EvidenceUploader } from '../components/Stage2EvidenceUploader.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface ReceivingDiscrepancyHoldWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  domainSignal?: number;
  chapterAccess: ChapterAccessSnapshot | null;
  previewEnabled: boolean;
  initialSubTab?: 'reports' | 'discrepancies' | 'holds';
  onNavigateTab: (tab: WorkspaceTab) => void;
  onBackToDashboard?: () => void;
}

interface EditableRmLine {
  key: string;
  source_line_id: string;
  variant_id: string;
  unit_id: string;
  delivered_quantity: string;
  accepted_quantity: string;
  damaged_quantity: string;
  rejected_quantity: string;
  unit_valuation_php: string;
  discrepancy_notes: string;
  resolves_discrepancy_id: string;
}

export function ReceivingDiscrepancyHoldWorkspace({
  userId,
  chapterId,
  refreshSignal,
  domainSignal = 0,
  chapterAccess,
  previewEnabled,
  initialSubTab = 'reports',
  onNavigateTab,
  onBackToDashboard,
}: ReceivingDiscrepancyHoldWorkspaceProps) {
  const formKey = 'stage2_receiving_editor';
  const candidates = useStage2Candidates(chapterId, refreshSignal, previewEnabled, chapterAccess);
  const skipSaveRef = useRef(false);

  const savedDraft = useMemo<{
    sourceKind?: ReceivingSourceKind;
    sourceId?: string;
    supplierDrRef?: string;
    supplierDrDate?: string;
    locationId?: string;
    lines?: EditableRmLine[];
  }>(() => {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) return {};
    try {
      return JSON.parse(saved.payloadJson) as {
        sourceKind?: ReceivingSourceKind;
        sourceId?: string;
        supplierDrRef?: string;
        supplierDrDate?: string;
        locationId?: string;
        lines?: EditableRmLine[];
      };
    } catch {
      return {};
    }
  }, [chapterId, userId]);

  const [subTab, setSubTab] = useState<'reports' | 'discrepancies' | 'holds'>(initialSubTab);

  // Authorized sources & collections
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [reports, setReports] = useState<ReceivingReport[]>([]);
  const [selectedRmId, setSelectedRmId] = useState('');
  const [selectedRm, setSelectedRm] = useState<ReceivingReport | null>(null);
  const [movements, setMovements] = useState<ReceivingMovement[]>([]);
  const [rmDiscrepancies, setRmDiscrepancies] = useState<ReceivingDiscrepancy[]>([]);
  const [rmHistory, setRmHistory] = useState<ReceivingReportHistoryEntry[]>([]);
  const [rmRelated, setRmRelated] = useState<ReceivingReportRelatedRecord[]>([]);

  // RM Create/Replace Form
  const [editingRmId, setEditingRmId] = useState<string | null>(null);
  const [replaceInvalidateConfirmed, setReplaceInvalidateConfirmed] = useState(false);
  const [sourceKind, setSourceKind] = useState<ReceivingSourceKind>(
    savedDraft.sourceKind ?? 'po',
  );
  const [sourceId, setSourceId] = useState(savedDraft.sourceId ?? '');
  const [originatingHoldId, setOriginatingHoldId] = useState('');
  const [supplierDrRef, setSupplierDrRef] = useState(savedDraft.supplierDrRef ?? '');
  const [supplierDrDate, setSupplierDrDate] = useState(
    savedDraft.supplierDrDate ?? new Date().toISOString().slice(0, 10),
  );
  const [locationId, setLocationId] = useState(savedDraft.locationId ?? '');
  const [lines, setLines] = useState<EditableRmLine[]>(savedDraft.lines ?? []);

  // Inspection & Evidence Match state
  const [repId, setRepId] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [matchEvidence, setMatchEvidence] = useState<Stage2EvidenceByteBinding | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Discrepancy State
  const [discrepancies, setDiscrepancies] = useState<ReceivingDiscrepancy[]>([]);
  const [selectedDiscId, setSelectedDiscId] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [notifyNotes, setNotifyNotes] = useState('');
  const [expectedResDate, setExpectedResDate] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [resolutionKind, setResolutionKind] =
    useState<ReceivingDiscrepancyResolutionKind>('supplier_replacement_received');
  const [lotDisposition, setLotDisposition] =
    useState<QuarantinedLotDisposition>('returned_to_supplier_physically');
  const [replacementRmId, setReplacementRmId] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [discEvidence, setDiscEvidence] = useState<Stage2EvidenceByteBinding | null>(null);

  // Holds State
  const [holds, setHolds] = useState<ReceivingHold[]>([]);
  const [selectedHoldId, setSelectedHoldId] = useState('');
  const [holdHistory, setHoldHistory] = useState<ReceivingHoldHistoryEntry[]>([]);
  const [holdLocationId, setHoldLocationId] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [senderKind, setSenderKind] = useState<'supplier' | 'donor' | 'carrier' | 'unknown'>(
    'carrier',
  );
  const [holdDocRef, setHoldDocRef] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdItemVariantId, setHoldItemVariantId] = useState('');
  const [holdItemUnitId, setHoldItemUnitId] = useState('');
  const [holdItemDesc, setHoldItemDesc] = useState('');
  const [holdItemQty, setHoldItemQty] = useState('10');
  const [holdIntakeEvidence, setHoldIntakeEvidence] =
    useState<Stage2EvidenceByteBinding | null>(null);

  const [linkSourceKind, setLinkSourceKind] = useState<ReceivingSourceKind>('po');
  const [linkSourceId, setLinkSourceId] = useState('');
  const [linkDrRef, setLinkDrRef] = useState('');
  const [linkDrDate, setLinkDrDate] = useState(new Date().toISOString().slice(0, 10));
  const [linkNotes, setLinkNotes] = useState('');

  const [rejectReason, setRejectReason] = useState('');
  const [rejectRecipient, setRejectRecipient] = useState('');
  const [rejectEvidence, setRejectEvidence] = useState<Stage2EvidenceByteBinding | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastOpHint, setLastOpHint] = useState<{
    operationName: string;
    actionKey: string;
    operationId?: string;
  } | null>(null);

  const canPrepareRm = !actionBlockReason(chapterAccess, 'receiving_report.prepare');
  const canInspectRm = !actionBlockReason(chapterAccess, 'receiving_report.inspect');
  const canMatchRm = !actionBlockReason(chapterAccess, 'receiving_report.match_evidence');
  const canPostRm = !actionBlockReason(chapterAccess, 'receiving_report.post');
  const canCancelRm = !actionBlockReason(chapterAccess, 'receiving_report.cancel');
  const canManageDisc = !actionBlockReason(chapterAccess, 'receiving_discrepancy.manage');
  const canManageHold = !actionBlockReason(chapterAccess, 'receiving_hold.manage');

  const loadAll = useCallback(async () => {
    try {
      const [poRes, daRes, rmRes, discRes, holdRes] = await Promise.all([
        listPurchaseOrders(chapterId, { limit: 50 }).catch(() => ({
          data: [] as PurchaseOrder[],
        })),
        listDonations(chapterId, { limit: 50 }).catch(() => ({ data: [] as Donation[] })),
        listReceivingReports(chapterId, { limit: 50 }),
        listReceivingDiscrepancies(chapterId, { limit: 50 }),
        listReceivingHolds(chapterId, { limit: 50 }),
      ]);
      setPurchaseOrders(
        poRes.data.filter(
          (p) => p.status === 'issued' || p.status === 'partially_received',
        ),
      );
      setDonations(
        daRes.data.filter(
          (d) => d.status === 'acknowledged' || d.status === 'partially_received',
        ),
      );
      setReports(rmRes.data);
      setDiscrepancies(discRes.data);
      setHolds(holdRes.data);
      setSelectedRmId((cur) =>
        cur && rmRes.data.some((r) => r.id === cur) ? cur : (rmRes.data[0]?.id ?? ''),
      );
      setSelectedDiscId((cur) =>
        cur && discRes.data.some((d) => d.id === cur) ? cur : (discRes.data[0]?.id ?? ''),
      );
      setSelectedHoldId((cur) =>
        cur && holdRes.data.some((h) => h.id === cur) ? cur : (holdRes.data[0]?.id ?? ''),
      );
    } catch (err) {
      setError(err);
    }
  }, [chapterId]);

  const loadSelectedRmDetail = useCallback(
    async (rmId: string) => {
      if (!rmId) {
        setSelectedRm(null);
        setMovements([]);
        setRmDiscrepancies([]);
        setRmHistory([]);
        setRmRelated([]);
        return;
      }
      try {
        const [detail, movRes, discRes, histRes, relRes] = await Promise.all([
          readReceivingReport(chapterId, rmId),
          listReceivingReportMovements(chapterId, rmId, { limit: 50 }),
          listReceivingReportDiscrepancies(chapterId, rmId, { limit: 50 }),
          listReceivingReportHistory(chapterId, rmId, { limit: 50 }),
          listReceivingReportRelated(chapterId, rmId, { limit: 50 }),
        ]);
        setSelectedRm(detail);
        setMovements(movRes.data);
        setRmDiscrepancies(discRes.data);
        setRmHistory(histRes.data);
        setRmRelated(relRes.data);
      } catch (err) {
        setError(err);
      }
    },
    [chapterId],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadSelectedRmDetail(selectedRmId);
  }, [loadSelectedRmDetail, selectedRmId, refreshSignal, domainSignal]);

  useEffect(() => {
    if (!selectedHoldId) {
      setHoldHistory([]);
      return;
    }
    void listReceivingHoldHistory(chapterId, selectedHoldId, { limit: 25 })
      .then((res) => setHoldHistory(res.data))
      .catch(() => setHoldHistory([]));
  }, [chapterId, selectedHoldId, refreshSignal, domainSignal]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: 'Receiving Report Draft',
      baseVersion: selectedRm?.version ?? null,
      pendingActionKey,
      payloadJson: JSON.stringify({
        sourceKind,
        sourceId,
        supplierDrRef,
        supplierDrDate,
        locationId,
        lines,
      }),
    });
  }, [chapterId, lines, locationId, sourceId, sourceKind, supplierDrDate, supplierDrRef, userId]);

  const rmOptions = useMemo<Array<SearchablePickerOption<ReceivingReport>>>(
    () =>
      reports.map((r) => ({
        id: r.id,
        primaryLabel: `${r.rm_reference ?? 'Draft RM'} · ${r.source_kind.toUpperCase()} ${r.source_reference}`,
        secondaryLabel: `Accepted PHP ${r.accepted_total_value_php} · DR ${r.supplier_dr_reference ?? '—'}`,
        badge: r.status.replaceAll('_', ' '),
        badgeTone:
          r.status === 'posted'
            ? 'ready'
            : r.status === 'canceled'
              ? 'danger'
              : 'warning',
        meta: r,
      })),
    [reports],
  );

  const poSourceOptions = useMemo<Array<SearchablePickerOption<PurchaseOrder>>>(
    () =>
      purchaseOrders.map((p) => ({
        id: p.id,
        primaryLabel: `${p.po_reference ?? p.id.slice(0, 8)} — ${p.supplier.supplier_name}`,
        secondaryLabel: `Mat v${p.material_version} · PHP ${p.total_amount_php}`,
        badge: p.status.replaceAll('_', ' '),
        meta: p,
      })),
    [purchaseOrders],
  );

  const daSourceOptions = useMemo<Array<SearchablePickerOption<Donation>>>(
    () =>
      donations.map((d) => ({
        id: d.da_id,
        primaryLabel: `${d.reference ?? d.da_id.slice(0, 8)} — ${d.donor_name}`,
        secondaryLabel: `Mat v${d.material_version} · PHP ${d.pledged_total_value_php}`,
        badge: d.status.replaceAll('_', ' '),
        meta: d,
      })),
    [donations],
  );

  const openDiscrepancyOptions = useMemo<Array<SearchablePickerOption<ReceivingDiscrepancy>>>(
    () =>
      discrepancies.map((d) => ({
        id: d.id,
        primaryLabel: `${d.rm_reference} (${d.source_reference}) — ${d.total_discrepant_quantity} discrepant`,
        secondaryLabel: d.discrepancy_notes,
        badge: d.status.replaceAll('_', ' '),
        badgeTone: d.status === 'resolved' ? 'ready' : 'danger',
        meta: d,
      })),
    [discrepancies],
  );

  const linkedHoldOptions = useMemo<Array<SearchablePickerOption<ReceivingHold>>>(
    () =>
      holds
        .filter((h) => h.status === 'linked_to_source')
        .map((h) => ({
          id: h.id,
          primaryLabel: `${h.carrier_or_sender_name} — ${h.linked_source?.source_reference ?? h.id.slice(0, 8)}`,
          secondaryLabel: h.hold_reason,
          meta: h,
        })),
    [holds],
  );

  const allHoldOptions = useMemo<Array<SearchablePickerOption<ReceivingHold>>>(
    () =>
      holds.map((h) => ({
        id: h.id,
        primaryLabel: `${h.carrier_or_sender_name} (${h.delivery_document_reference ?? 'No Doc'})`,
        secondaryLabel: h.hold_reason,
        badge: h.status.replaceAll('_', ' '),
        badgeTone: h.status === 'held' ? 'warning' : 'neutral',
        meta: h,
      })),
    [holds],
  );

  const selectedDisc = useMemo(
    () => discrepancies.find((d) => d.id === selectedDiscId) ?? null,
    [discrepancies, selectedDiscId],
  );
  const selectedHold = useMemo(
    () => holds.find((h) => h.id === selectedHoldId) ?? null,
    [holds, selectedHoldId],
  );

  function handleSelectSource(nextKind: ReceivingSourceKind, nextSourceId: string) {
    setSourceKind(nextKind);
    setSourceId(nextSourceId);
    if (!nextSourceId) {
      setLines([]);
      return;
    }
    if (nextKind === 'po') {
      const po = purchaseOrders.find((p) => p.id === nextSourceId);
      setLines(
        (po?.lines ?? [])
          .filter((l) => Number.parseFloat(l.outstanding_quantity) > 0)
          .map((l) => ({
            key: l.id,
            source_line_id: l.id,
            variant_id: l.variant_id,
            unit_id: l.unit_id,
            delivered_quantity: l.outstanding_quantity,
            accepted_quantity: l.outstanding_quantity,
            damaged_quantity: '0',
            rejected_quantity: '0',
            unit_valuation_php: l.unit_price_php,
            discrepancy_notes: '',
            resolves_discrepancy_id: '',
          })),
      );
    } else {
      const da = donations.find((d) => d.da_id === nextSourceId);
      setLines(
        (da?.lines ?? [])
          .filter((l) => Number.parseFloat(l.outstanding_quantity) > 0)
          .map((l) => ({
            key: l.line_id,
            source_line_id: l.line_id,
            variant_id: l.variant_id,
            unit_id: l.unit_id,
            delivered_quantity: l.outstanding_quantity,
            accepted_quantity: l.outstanding_quantity,
            damaged_quantity: '0',
            rejected_quantity: '0',
            unit_valuation_php: l.unit_value_php,
            discrepancy_notes: '',
            resolves_discrepancy_id: '',
          })),
      );
    }
  }

  function buildRmLineInputs(): ReceivingReportLineInput[] {
    return lines.map((l) => ({
      source_line_id: l.source_line_id,
      variant_id: l.variant_id,
      unit_id: l.unit_id,
      delivered_quantity: l.delivered_quantity.trim(),
      accepted_quantity: l.accepted_quantity.trim(),
      damaged_quantity: l.damaged_quantity.trim(),
      rejected_quantity: l.rejected_quantity.trim(),
      unit_valuation_php: l.unit_valuation_php.trim(),
      discrepancy_notes: l.discrepancy_notes.trim() || null,
      resolves_discrepancy_id: l.resolves_discrepancy_id || null,
    }));
  }

  function getSourceMaterialVersion(): number {
    if (sourceKind === 'po') {
      return purchaseOrders.find((p) => p.id === sourceId)?.material_version ?? 1;
    }
    return donations.find((d) => d.da_id === sourceId)?.material_version ?? 1;
  }

  async function handleSaveRm(e: React.FormEvent) {
    e.preventDefault();
    if (
      editingRmId &&
      selectedRm &&
      (selectedRm.status === 'inspected' || selectedRm.status === 'evidence_matched') &&
      !replaceInvalidateConfirmed
    ) {
      setError(
        new Error(
          'Confirm the warning acknowledging that replacing an inspected or evidence-matched RM resets it to draft and clears its matched paper binding.',
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const payloadLines = buildRmLineInputs();
      if (editingRmId && selectedRm && selectedRm.id === editingRmId) {
        const { data, actionKey } = await replaceReceivingReport(chapterId, editingRmId, {
          expected_version: selectedRm.version,
          expected_material_version: selectedRm.material_version,
          source_material_version: selectedRm.source_material_version,
          supplier_dr_reference:
            sourceKind === 'po' ? supplierDrRef.trim() || null : supplierDrRef.trim() || null,
          supplier_dr_date: supplierDrDate || null,
          location_id: locationId,
          lines: payloadLines,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'replaceReceivingReport',
          actionKey,
          operationId: data.operation_id,
        });
        setSelectedRmId(data.result.id);
        setStatusMessage(`Replaced RM draft v${data.result.version}.`);
      } else {
        const { data, actionKey } = await createReceivingReport(chapterId, {
          source_kind: sourceKind,
          source_id: sourceId,
          source_material_version: getSourceMaterialVersion(),
          originating_hold_id: originatingHoldId || null,
          supplier_dr_reference: supplierDrRef.trim() || null,
          supplier_dr_date: supplierDrDate || null,
          location_id: locationId,
          lines: payloadLines,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'createReceivingReport',
          actionKey,
          operationId: data.operation_id,
        });
        setSelectedRmId(data.result.id);
        setStatusMessage('Created draft Receiving Report without posting stock yet.');
      }
      setEditingRmId(null);
      setReplaceInvalidateConfirmed(false);
      skipSaveRef.current = true;
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      await loadAll();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runReceivingAction(
    opName: ReceivingOperationName,
    fn: () => Promise<{ data: { operation_id: string }; actionKey: string }>,
    msg: string,
  ) {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const { data, actionKey } = await fn();
      setPendingActionKey(actionKey);
      setLastOpHint({ operationName: opName, actionKey, operationId: data.operation_id });
      setStatusMessage(msg);
      await loadAll();
      if (selectedRmId) {
        await loadSelectedRmDetail(selectedRmId);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-stack">
      <NavFlowHeader
        headingId="rcv-heading"
        title="Unified Receiving, Discrepancies & Missing-Source Holds"
        subtitle="Inspect PO and Donation deliveries, bind signed Delivery Receipts, post partial lots, resolve damaged/rejected goods, and quarantine undocumented arrivals."
        onBack={onBackToDashboard}
      />

      <OperationBanner
        error={error}
        statusMessage={statusMessage}
        pendingActionKey={pendingActionKey}
      />

      <div className="s2-tab-strip" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'reports'}
          className={`s2-tab-btn${subTab === 'reports' ? ' is-active' : ''}`}
          onClick={() => setSubTab('reports')}
        >
          Receiving Reports ({reports.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'discrepancies'}
          className={`s2-tab-btn${subTab === 'discrepancies' ? ' is-active' : ''}`}
          onClick={() => setSubTab('discrepancies')}
        >
          Discrepancies ({discrepancies.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'holds'}
          className={`s2-tab-btn${subTab === 'holds' ? ' is-active' : ''}`}
          onClick={() => setSubTab('holds')}
        >
          Missing-Source Holds ({holds.length})
        </button>
      </div>

      {subTab === 'reports' && (
        <>
          <section className="surface-card s2-section-card">
            <h2 className="s2-panel-title">Receiving Report Workspace (PO &amp; DA)</h2>
            <SearchableRecordPicker
              id="rcv-rm-picker"
              label="Select Receiving Report"
              valueId={selectedRmId}
              options={rmOptions}
              onSelect={(opt) => setSelectedRmId(opt?.id ?? '')}
              placeholder="Search RM reference, PO/DA source, or DR..."
            />

            {selectedRm && (
              <div className="s2-detail-panel">
                <div className="s2-meta-grid">
                  <div>
                    <span className="s2-muted-sm">RM Reference</span>
                    <div>
                      <strong>{selectedRm.rm_reference ?? 'Draft RM'}</strong>
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Source</span>
                    <div>
                      {selectedRm.source_kind.toUpperCase()} {selectedRm.source_reference} (mat m
                      {selectedRm.source_material_version})
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Status</span>
                    <div>
                      <span className="s2-badge">{selectedRm.status.replaceAll('_', ' ')}</span>
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Supplier DR</span>
                    <div>
                      {selectedRm.supplier_dr_reference ?? '—'} (
                      {selectedRm.supplier_dr_date ?? '—'})
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Accepted Value (PHP)</span>
                    <div>PHP {selectedRm.accepted_total_value_php}</div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Stockroom Location</span>
                    <div>{candidates.describeLocation(selectedRm.location_id)}</div>
                  </div>
                </div>

                <div className="s2-table-wrap">
                  <table className="s2-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Delivered</th>
                        <th>Accepted</th>
                        <th>Damaged</th>
                        <th>Rejected</th>
                        <th>Balance</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRm.lines.map((l) => {
                        const d = Number.parseFloat(l.delivered_quantity) || 0;
                        const sum =
                          (Number.parseFloat(l.accepted_quantity) || 0) +
                          (Number.parseFloat(l.damaged_quantity) || 0) +
                          (Number.parseFloat(l.rejected_quantity) || 0);
                        const balanced = Math.abs(d - sum) < 0.0001;
                        return (
                          <tr key={l.id}>
                            <td>{candidates.describeVariant(l.variant_id)}</td>
                            <td>
                              {l.delivered_quantity} {candidates.describeUnit(l.unit_id)}
                            </td>
                            <td>{l.accepted_quantity}</td>
                            <td>{l.damaged_quantity}</td>
                            <td>{l.rejected_quantity}</td>
                            <td>
                              <span
                                className={`s2-badge ${balanced ? 'is-ready' : 'is-danger'}`}
                              >
                                {balanced ? 'Balanced' : 'Mismatch'}
                              </span>
                            </td>
                            <td>{l.discrepancy_notes ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Receiving Stepper Actions */}
                <div className="s2-action-bar">
                  {selectedRm.status !== 'posted' && selectedRm.status !== 'canceled' && (
                    <button
                      type="button"
                      className="btn-batcave-secondary p02-compact-btn"
                      disabled={!canPrepareRm || busy}
                      onClick={() => {
                        setEditingRmId(selectedRm.id);
                        setReplaceInvalidateConfirmed(false);
                        setSourceKind(selectedRm.source_kind);
                        setSourceId(selectedRm.source_id);
                        setSupplierDrRef(selectedRm.supplier_dr_reference ?? '');
                        setSupplierDrDate(selectedRm.supplier_dr_date ?? '');
                        setLocationId(selectedRm.location_id);
                        setLines(
                          selectedRm.lines.map((l) => ({
                            key: l.id,
                            source_line_id: l.source_line_id,
                            variant_id: l.variant_id,
                            unit_id: l.unit_id,
                            delivered_quantity: l.delivered_quantity,
                            accepted_quantity: l.accepted_quantity,
                            damaged_quantity: l.damaged_quantity,
                            rejected_quantity: l.rejected_quantity,
                            unit_valuation_php: l.unit_valuation_php,
                            discrepancy_notes: l.discrepancy_notes ?? '',
                            resolves_discrepancy_id: l.resolves_discrepancy_id ?? '',
                          })),
                        );
                      }}
                    >
                      Load into Editor
                    </button>
                  )}

                  {(selectedRm.status === 'draft' ||
                    selectedRm.status === 'inspected' ||
                    selectedRm.status === 'evidence_matched') && (
                    <button
                      type="button"
                      className="btn-batcave-secondary p02-compact-btn"
                      disabled={!canCancelRm || busy || !cancelReason.trim()}
                      onClick={() =>
                        void runReceivingAction(
                          'cancelReceivingReport',
                          () =>
                            cancelReceivingReport(chapterId, selectedRm.id, {
                              expected_version: selectedRm.version,
                              expected_material_version: selectedRm.material_version,
                              reason: cancelReason.trim(),
                            }),
                          'Canceled draft Receiving Report.',
                        )
                      }
                    >
                      Cancel Pre-Post RM
                    </button>
                  )}
                </div>

                {selectedRm.status === 'draft' && (
                  <div className="s2-breakdown-box">
                    <h4>Step 1: Physical Inspection</h4>
                    <div className="s2-grid-2">
                      <SearchableRecordPicker
                        id="rcv-rep-picker"
                        label="Technical / Requesting Representative (optional)"
                        valueId={repId}
                        options={candidates.representativeOptions}
                        onSelect={(opt) => setRepId(opt?.id ?? '')}
                        placeholder="Select witness or representative..."
                      />
                      <div className="form-group">
                        <label className="form-label">Inspection Notes</label>
                        <input
                          className="form-control"
                          value={inspectionNotes}
                          onChange={(e) => setInspectionNotes(e.target.value)}
                          placeholder="Counted boxes, QA defects observed..."
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={!canInspectRm || busy || !inspectionNotes.trim()}
                      onClick={() =>
                        void runReceivingAction(
                          'inspectReceivingReport',
                          () =>
                            inspectReceivingReport(chapterId, selectedRm.id, {
                              expected_version: selectedRm.version,
                              expected_material_version: selectedRm.material_version,
                              source_material_version: selectedRm.source_material_version,
                              technical_or_requesting_representative_id: repId || null,
                              inspected_at: new Date().toISOString(),
                              inspection_notes: inspectionNotes.trim(),
                              lines: selectedRm.lines.map((l) => ({
                                source_line_id: l.source_line_id,
                                variant_id: l.variant_id,
                                unit_id: l.unit_id,
                                delivered_quantity: l.delivered_quantity,
                                accepted_quantity: l.accepted_quantity,
                                damaged_quantity: l.damaged_quantity,
                                rejected_quantity: l.rejected_quantity,
                                unit_valuation_php: l.unit_valuation_php,
                                discrepancy_notes: l.discrepancy_notes,
                                resolves_discrepancy_id: l.resolves_discrepancy_id,
                              })),
                            }),
                          'Recorded physical inspection results.',
                        )
                      }
                    >
                      Complete Inspection
                    </button>
                  </div>
                )}

                {selectedRm.status === 'inspected' && (
                  <div className="s2-breakdown-box">
                    <h4>Step 2: Bind Signed DR / Receipt Paper</h4>
                    <Stage2EvidenceUploader
                      chapterId={chapterId}
                      purpose={selectedRm.source_kind === 'po' ? 'po_supplier_dr' : 'da_receipt'}
                      recordId={selectedRm.id}
                      recordLabel={`${selectedRm.source_reference} Receipt`}
                      selectedBinding={matchEvidence}
                      onSelectBinding={setMatchEvidence}
                    />
                    <div className="s2-action-bar">
                      <button
                        type="button"
                        className="btn-batcave-primary p02-compact-btn"
                        disabled={!canMatchRm || busy || !matchEvidence}
                        onClick={() =>
                          void runReceivingAction(
                            'matchReceivingReportEvidence',
                            () =>
                              matchReceivingReportEvidence(chapterId, selectedRm.id, {
                                expected_version: selectedRm.version,
                                expected_material_version: selectedRm.material_version,
                                snapshot_sha256:
                                  selectedRm.snapshot?.sha256 ??
                                  matchEvidence!.attachments[0]?.sha256 ??
                                  'a'.repeat(64),
                                evidence: matchEvidence!,
                                acknowledged_at: new Date().toISOString(),
                              }),
                            'Matched paper evidence binding to inspected RM.',
                          )
                        }
                      >
                        Match Signed Evidence
                      </button>
                    </div>
                  </div>
                )}

                {selectedRm.status === 'evidence_matched' && (
                  <div className="s2-breakdown-box">
                    <h4>Step 3: Atomic Receiving Inventory Post</h4>
                    <p className="s2-muted-sm">
                      Posts accepted stock into usable lots, moves damaged/rejected units to quarantined/rejected lots, updates source open quantities, and opens discrepancies automatically.
                    </p>
                    <button
                      type="button"
                      className="btn-batcave-primary"
                      disabled={!canPostRm || busy || !selectedRm.evidence_acknowledgment}
                      onClick={() =>
                        void runReceivingAction(
                          'postReceivingReport',
                          () =>
                            postReceivingReport(chapterId, selectedRm.id, {
                              expected_version: selectedRm.version,
                              expected_material_version: selectedRm.material_version,
                              source_material_version: selectedRm.source_material_version,
                              acknowledgment_id:
                                selectedRm.evidence_acknowledgment!.acknowledgment_id,
                            }),
                          'Posted Receiving Report atomically to Stock & Discrepancies.',
                        )
                      }
                    >
                      Post Receiving Report to Stock
                    </button>
                  </div>
                )}

                {selectedRm.status !== 'posted' && selectedRm.status !== 'canceled' && (
                  <div className="form-group">
                    <label className="form-label">Cancel Reason (for pre-post cancelation)</label>
                    <input
                      className="form-control"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </div>
                )}

                {movements.length > 0 && (
                  <div className="s2-breakdown-box">
                    <h4>Posted Stock Movements ({movements.length})</h4>
                    <div className="s2-table-wrap">
                      <table className="s2-table">
                        <thead>
                          <tr>
                            <th>Movement</th>
                            <th>Condition</th>
                            <th>Restriction</th>
                            <th>Qty</th>
                            <th>Allocatable Now?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((mv) => (
                            <tr key={mv.id}>
                              <td>{mv.kind.replaceAll('_', ' ')}</td>
                              <td>{mv.condition}</td>
                              <td>{mv.restrictions.state}</td>
                              <td>
                                {mv.quantity} {candidates.describeUnit(mv.unit_id)}
                              </td>
                              <td>
                                <span
                                  className={`s2-badge ${
                                    mv.immediately_allocatable ? 'is-ready' : 'is-warning'
                                  }`}
                                >
                                  {mv.immediately_allocatable ? 'Yes' : 'Blocked / Held'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {rmDiscrepancies.length > 0 && (
                  <div className="s2-inline-alert is-warning">
                    This RM created {rmDiscrepancies.length} receiving discrepancy record(s). Switch to the <strong>Discrepancies</strong> tab to track supplier notice and resolution.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Prepare / Replace RM Form */}
          <section className="surface-card s2-section-card">
            <h3 className="s2-panel-title">
              {editingRmId ? 'Replace Draft Receiving Report' : 'Prepare New Receiving Report'}
            </h3>
            {editingRmId &&
              selectedRm &&
              (selectedRm.status === 'inspected' || selectedRm.status === 'evidence_matched') && (
                <div className="s2-inline-alert is-warning">
                  <label className="s2-check-row">
                    <input
                      type="checkbox"
                      checked={replaceInvalidateConfirmed}
                      onChange={(e) => setReplaceInvalidateConfirmed(e.target.checked)}
                    />
                    Replacing an inspected or evidence-matched RM resets it to draft and invalidates its matched paper binding. Check to proceed.
                  </label>
                </div>
              )}

            <form onSubmit={(e) => void handleSaveRm(e)} className="s2-form-stack">
              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Source Document Type</label>
                  <select
                    className="form-control"
                    disabled={Boolean(editingRmId)}
                    value={sourceKind}
                    onChange={(e) =>
                      handleSelectSource(e.target.value as ReceivingSourceKind, '')
                    }
                  >
                    <option value="po">Purchase Order (PO)</option>
                    <option value="da">Donation Acknowledgment (DA)</option>
                  </select>
                </div>

                {sourceKind === 'po' ? (
                  <SearchableRecordPicker
                    id="rcv-po-source-picker"
                    label="Authorized Purchase Order"
                    valueId={sourceId}
                    options={poSourceOptions}
                    onSelect={(opt) => handleSelectSource('po', opt?.id ?? '')}
                    disabled={Boolean(editingRmId)}
                    required
                    placeholder="Select issued/partially received PO..."
                  />
                ) : (
                  <SearchableRecordPicker
                    id="rcv-da-source-picker"
                    label="Authorized Donation Acknowledgment"
                    valueId={sourceId}
                    options={daSourceOptions}
                    onSelect={(opt) => handleSelectSource('da', opt?.id ?? '')}
                    disabled={Boolean(editingRmId)}
                    required
                    placeholder="Select acknowledged DA..."
                  />
                )}

                <SearchableRecordPicker
                  id="rcv-loc-picker"
                  label="Receiving Location"
                  valueId={locationId}
                  options={candidates.locationOptions}
                  onSelect={(opt) => setLocationId(opt?.id ?? '')}
                  required
                  placeholder="Select chapter stockroom..."
                />
              </div>

              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">
                    Supplier DR / Waybill Ref {sourceKind === 'po' ? '(Required)' : '(Optional)'}
                  </label>
                  <input
                    className="form-control"
                    required={sourceKind === 'po'}
                    value={supplierDrRef}
                    onChange={(e) => setSupplierDrRef(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">DR Date</label>
                  <input
                    type="date"
                    className="form-control"
                    required={sourceKind === 'po'}
                    value={supplierDrDate}
                    onChange={(e) => setSupplierDrDate(e.target.value)}
                  />
                </div>
                <SearchableRecordPicker
                  id="rcv-orig-hold-picker"
                  label="Originating Linked Hold (optional)"
                  valueId={originatingHoldId}
                  options={linkedHoldOptions}
                  onSelect={(opt) => setOriginatingHoldId(opt?.id ?? '')}
                  placeholder="Link prior missing-source hold..."
                />
              </div>

              {lines.map((line, i) => {
                const d = Number.parseFloat(line.delivered_quantity) || 0;
                const sum =
                  (Number.parseFloat(line.accepted_quantity) || 0) +
                  (Number.parseFloat(line.damaged_quantity) || 0) +
                  (Number.parseFloat(line.rejected_quantity) || 0);
                const balanced = Math.abs(d - sum) < 0.0001;
                return (
                  <div key={line.key} className="s2-line-card">
                    <div className="s2-line-head">
                      <strong>
                        Line #{i + 1} · {candidates.describeVariant(line.variant_id)}
                      </strong>
                      <span className={`s2-badge ${balanced ? 'is-ready' : 'is-danger'}`}>
                        {balanced
                          ? 'Delivered = Accepted + Damaged + Rejected'
                          : `Mismatch: ${d} vs ${sum}`}
                      </span>
                    </div>
                    <div className="s2-grid-3">
                      <div className="form-group">
                        <label className="form-label">Delivered Qty</label>
                        <input
                          className="form-control"
                          required
                          value={line.delivered_quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, delivered_quantity: e.target.value } : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Accepted Qty</label>
                        <input
                          className="form-control"
                          required
                          value={line.accepted_quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, accepted_quantity: e.target.value } : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Damaged / Rejected Qty</label>
                        <div className="s2-grid-2">
                          <input
                            className="form-control"
                            required
                            aria-label="Damaged quantity"
                            value={line.damaged_quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, damaged_quantity: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          />
                          <input
                            className="form-control"
                            required
                            aria-label="Rejected quantity"
                            value={line.rejected_quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? { ...l, rejected_quantity: e.target.value }
                                    : l,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="s2-grid-2">
                      <div className="form-group">
                        <label className="form-label">Discrepancy Notes</label>
                        <input
                          className="form-control"
                          value={line.discrepancy_notes}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, discrepancy_notes: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <SearchableRecordPicker
                        id={`rcv-line-disc-${line.key}`}
                        label="Resolves Open Discrepancy (Replacement Delivery)"
                        valueId={line.resolves_discrepancy_id}
                        options={openDiscrepancyOptions}
                        onSelect={(opt) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, resolves_discrepancy_id: opt?.id ?? '' }
                                : l,
                            ),
                          )
                        }
                        placeholder="Optional open discrepancy..."
                      />
                    </div>
                  </div>
                );
              })}

              <button
                type="submit"
                className="btn-batcave-primary"
                disabled={!canPrepareRm || busy || !sourceId || !locationId || lines.length === 0}
              >
                {editingRmId ? 'Replace Draft RM' : 'Create Draft Receiving Report'}
              </button>
            </form>
          </section>

          {selectedRm && (
            <Stage2AuditPanels
              title={selectedRm.rm_reference ?? 'Draft Receiving Report'}
              recordVersion={selectedRm.version}
              history={rmHistory.map((h) => ({
                id: h.id,
                version: h.version,
                materialVersion: h.material_version,
                action: h.action,
                fromStatus: h.from_status,
                toStatus: h.to_status,
                actorName: h.actor.display_name,
                occurredAt: h.occurred_at,
                reason: h.reason,
                metaNote: h.evidence_binding_invalidated
                  ? 'Evidence binding invalidated after draft change'
                  : null,
              }))}
              related={rmRelated.map((r) => ({
                kind: r.kind,
                id: r.id,
                reference: r.reference,
                state: r.state,
                materialVersion: r.material_version,
              }))}
              onRefreshAudit={() => loadSelectedRmDetail(selectedRm.id)}
              onLoadVersion={(v) => readReceivingReportVersion(chapterId, selectedRm.id, v)}
              onLoadPrintHtml={() => printReceivingReport(chapterId, selectedRm.id)}
              onOpenRelated={(kind) => {
                if (kind === 'purchase_order') onNavigateTab('quotations_po');
                else if (kind === 'donation') onNavigateTab('donations_restrictions');
                else if (kind === 'stock_lot') onNavigateTab('stock');
              }}
              recoveryOperations={[
                { value: 'createReceivingReport', label: 'Create RM Draft' },
                { value: 'inspectReceivingReport', label: 'Inspect RM' },
                { value: 'matchReceivingReportEvidence', label: 'Match RM Evidence' },
                { value: 'postReceivingReport', label: 'Post RM to Stock' },
              ]}
              onLookupByActionKey={(op, key) =>
                findReceivingOperationByKey(chapterId, op as ReceivingOperationName, key)
              }
              onLookupByOperationId={(opId) => readReceivingOperation(chapterId, opId)}
              recentOperationHint={lastOpHint}
            />
          )}
        </>
      )}

      {subTab === 'discrepancies' && (
        <section className="surface-card s2-section-card">
          <h2 className="s2-panel-title">Receiving Discrepancies &amp; Quarantined/Rejected Lots</h2>
          <div className="callout-banner" role="note">
            <span className="callout-dot dot-warning" aria-hidden="true" />
            <div>
              <strong>Custody Safeguard:</strong> Closing a Purchase Order or Donation short never auto-clears quarantined or rejected lots. Each discrepancy must be explicitly reviewed and resolved.
            </div>
          </div>

          <SearchableRecordPicker
            id="rcv-disc-picker"
            label="Select Discrepancy Record"
            valueId={selectedDiscId}
            options={openDiscrepancyOptions}
            onSelect={(opt) => setSelectedDiscId(opt?.id ?? '')}
          />

          {selectedDisc && (
            <div className="s2-detail-panel">
              <div className="s2-meta-grid">
                <div>
                  <span className="s2-muted-sm">Source / RM</span>
                  <div>
                    <strong>{selectedDisc.rm_reference}</strong> ({selectedDisc.source_reference})
                  </div>
                </div>
                <div>
                  <span className="s2-muted-sm">Status</span>
                  <div>
                    <span className="s2-badge">{selectedDisc.status.replaceAll('_', ' ')}</span>
                  </div>
                </div>
                <div>
                  <span className="s2-muted-sm">Damaged / Rejected</span>
                  <div>
                    {selectedDisc.damaged_quantity} damaged + {selectedDisc.rejected_quantity}{' '}
                    rejected ({selectedDisc.total_discrepant_quantity} total)
                  </div>
                </div>
                <div>
                  <span className="s2-muted-sm">Quarantined / Rejected Lots</span>
                  <div className="s2-mono-pill">
                    {selectedDisc.quarantined_lot_id?.slice(0, 8) ?? '—'} /{' '}
                    {selectedDisc.rejected_lot_id?.slice(0, 8) ?? '—'}
                  </div>
                </div>
              </div>

              {selectedDisc.status !== 'resolved' && (
                <>
                  <div className="s2-breakdown-box">
                    <h4>Notify Supplier (PO Only)</h4>
                    {selectedDisc.source_kind === 'da' ? (
                      <p className="s2-muted-sm">
                        Disabled for Donations — supplier notification applies only to PO receipts.
                      </p>
                    ) : (
                      <div className="s2-grid-3">
                        <div className="form-group">
                          <label className="form-label">Supplier Contact</label>
                          <input
                            className="form-control"
                            value={supplierContact}
                            onChange={(e) => setSupplierContact(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Notification Notes</label>
                          <input
                            className="form-control"
                            value={notifyNotes}
                            onChange={(e) => setNotifyNotes(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Expected Resolution Date</label>
                          <div className="s2-file-row">
                            <input
                              type="date"
                              className="form-control"
                              value={expectedResDate}
                              onChange={(e) => setExpectedResDate(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn-batcave-secondary p02-compact-btn"
                              disabled={!canManageDisc || busy || !supplierContact.trim()}
                              onClick={() =>
                                void runReceivingAction(
                                  'notifySupplierOfReceivingDiscrepancy',
                                  () =>
                                    notifySupplierOfReceivingDiscrepancy(
                                      chapterId,
                                      selectedDisc.id,
                                      {
                                        expected_version: selectedDisc.version,
                                        expected_material_version: selectedDisc.material_version,
                                        supplier_contact_reference: supplierContact.trim(),
                                        notification_notes: notifyNotes.trim(),
                                        expected_resolution_date: expectedResDate || null,
                                      },
                                    ),
                                  'Recorded supplier discrepancy notification.',
                                )
                              }
                            >
                              Notify Supplier
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="s2-breakdown-box">
                    <h4>Start Review or Resolve Discrepancy</h4>
                    <div className="s2-grid-2">
                      <div className="form-group">
                        <label className="form-label">Review Notes (Start Review)</label>
                        <div className="s2-file-row">
                          <input
                            className="form-control"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-batcave-secondary p02-compact-btn"
                            disabled={!canManageDisc || busy || !reviewNotes.trim()}
                            onClick={() =>
                              void runReceivingAction(
                                'resolveReceivingDiscrepancy',
                                () =>
                                  resolveReceivingDiscrepancy(chapterId, selectedDisc.id, {
                                    action: 'start_review',
                                    expected_version: selectedDisc.version,
                                    expected_material_version: selectedDisc.material_version,
                                    review_notes: reviewNotes.trim(),
                                  }),
                                'Discrepancy moved to under review.',
                              )
                            }
                          >
                            Start Review
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="s2-grid-3">
                      <div className="form-group">
                        <label className="form-label">Resolution Outcome</label>
                        <select
                          className="form-control"
                          value={resolutionKind}
                          onChange={(e) =>
                            setResolutionKind(e.target.value as ReceivingDiscrepancyResolutionKind)
                          }
                        >
                          <option value="supplier_replacement_received">
                            Supplier Replacement Received
                          </option>
                          <option value="returned_to_supplier">Returned to Supplier</option>
                          <option value="credit_or_short_closed">Credit / Short Closed</option>
                          <option value="donated_declined_or_disposed">
                            Donated Declined or Disposed
                          </option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Quarantined Lot Disposition</label>
                        <select
                          className="form-control"
                          value={lotDisposition}
                          onChange={(e) =>
                            setLotDisposition(e.target.value as QuarantinedLotDisposition)
                          }
                        >
                          <option value="retained_in_quarantine">Retained in Quarantine</option>
                          <option value="returned_to_supplier_physically">
                            Returned to Supplier Physically
                          </option>
                          <option value="disposed_per_policy">Disposed per Policy</option>
                        </select>
                      </div>
                      {resolutionKind === 'supplier_replacement_received' && (
                        <SearchableRecordPicker
                          id="rcv-disc-repl-picker"
                          label="Replacement Receiving Report"
                          valueId={replacementRmId}
                          options={rmOptions}
                          onSelect={(opt) => setReplacementRmId(opt?.id ?? '')}
                          required
                        />
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Signed Resolution Reason</label>
                      <input
                        className="form-control"
                        value={resolutionReason}
                        onChange={(e) => setResolutionReason(e.target.value)}
                      />
                    </div>

                    <Stage2EvidenceUploader
                      chapterId={chapterId}
                      purpose="receiving_discrepancy"
                      recordId={selectedDisc.id}
                      recordLabel={`${selectedDisc.rm_reference} Discrepancy Resolution`}
                      selectedBinding={discEvidence}
                      onSelectBinding={setDiscEvidence}
                    />

                    <button
                      type="button"
                      className="btn-batcave-primary"
                      disabled={
                        !canManageDisc ||
                        busy ||
                        !resolutionReason.trim() ||
                        !discEvidence ||
                        (resolutionKind === 'supplier_replacement_received' && !replacementRmId)
                      }
                      onClick={() =>
                        void runReceivingAction(
                          'resolveReceivingDiscrepancy',
                          () =>
                            resolveReceivingDiscrepancy(chapterId, selectedDisc.id, {
                              action: 'resolve',
                              expected_version: selectedDisc.version,
                              expected_material_version: selectedDisc.material_version,
                              resolution_kind: resolutionKind,
                              reason: resolutionReason.trim(),
                              replacement_rm_id:
                                resolutionKind === 'supplier_replacement_received'
                                  ? replacementRmId
                                  : null,
                              quarantined_lot_disposition: lotDisposition,
                              evidence: discEvidence!,
                              signed_at: new Date().toISOString(),
                            }),
                          'Resolved receiving discrepancy and updated quarantined lot disposition.',
                        )
                      }
                    >
                      Resolve Discrepancy
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {subTab === 'holds' && (
        <>
          <section className="surface-card s2-section-card">
            <h2 className="s2-panel-title">Missing-Source Receiving Holds</h2>
            <div className="callout-banner" role="note">
              <span className="callout-dot dot-warning" aria-hidden="true" />
              <div>
                <strong>Quarantine Rule:</strong> Missing-source holds never post usable stockroom inventory (<code>usable_stock_posted = false</code>) and cannot create Inventory Posting Confirmations (IPC creation prohibited). Link to an authorized PO/DA or reject and return.
              </div>
            </div>

            <SearchableRecordPicker
              id="rcv-hold-picker"
              label="Select Receiving Hold"
              valueId={selectedHoldId}
              options={allHoldOptions}
              onSelect={(opt) => setSelectedHoldId(opt?.id ?? '')}
            />

            {selectedHold && (
              <div className="s2-detail-panel">
                <div className="s2-meta-grid">
                  <div>
                    <span className="s2-muted-sm">Carrier / Sender</span>
                    <div>
                      <strong>{selectedHold.carrier_or_sender_name}</strong> ({selectedHold.sender_kind})
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Status</span>
                    <div>
                      <span className="s2-badge">{selectedHold.status.replaceAll('_', ' ')}</span>
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Usable Stock / IPC</span>
                    <div>Not Posted · IPC Prohibited</div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Holding Location</span>
                    <div>{candidates.describeLocation(selectedHold.holding_location_id)}</div>
                  </div>
                </div>

                {selectedHold.status === 'held' && (
                  <div className="s2-grid-2">
                    <div className="s2-breakdown-box">
                      <h4>Link Hold to Authorized Source</h4>
                      <div className="form-group">
                        <label className="form-label">Source Kind</label>
                        <select
                          className="form-control"
                          value={linkSourceKind}
                          onChange={(e) => {
                            setLinkSourceKind(e.target.value as ReceivingSourceKind);
                            setLinkSourceId('');
                          }}
                        >
                          <option value="po">Purchase Order</option>
                          <option value="da">Donation Acknowledgment</option>
                        </select>
                      </div>
                      {linkSourceKind === 'po' ? (
                        <SearchableRecordPicker<PurchaseOrder>
                          id="rcv-hold-link-po"
                          label="Purchase Order"
                          valueId={linkSourceId}
                          options={poSourceOptions}
                          onSelect={(opt) => setLinkSourceId(opt?.id ?? '')}
                        />
                      ) : (
                        <SearchableRecordPicker<Donation>
                          id="rcv-hold-link-da"
                          label="Donation"
                          valueId={linkSourceId}
                          options={daSourceOptions}
                          onSelect={(opt) => setLinkSourceId(opt?.id ?? '')}
                        />
                      )}
                      {linkSourceKind === 'po' && (
                        <div className="s2-grid-2">
                          <div className="form-group">
                            <label className="form-label">Supplier DR Reference</label>
                            <input
                              className="form-control"
                              value={linkDrRef}
                              onChange={(e) => setLinkDrRef(e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Supplier DR Date</label>
                            <input
                              type="date"
                              className="form-control"
                              value={linkDrDate}
                              onChange={(e) => setLinkDrDate(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">Link Verification Notes</label>
                        <input
                          className="form-control"
                          value={linkNotes}
                          onChange={(e) => setLinkNotes(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-primary p02-compact-btn"
                        disabled={!canManageHold || busy || !linkSourceId || !linkNotes.trim()}
                        onClick={() =>
                          void runReceivingAction(
                            'linkReceivingHoldSource',
                            () =>
                              linkReceivingHoldSource(chapterId, selectedHold.id, {
                                expected_version: selectedHold.version,
                                expected_material_version: selectedHold.material_version,
                                source_kind: linkSourceKind,
                                source_id: linkSourceId,
                                supplier_dr_reference:
                                  linkSourceKind === 'po' ? linkDrRef.trim() || null : null,
                                supplier_dr_date: linkSourceKind === 'po' ? linkDrDate || null : null,
                                link_notes: linkNotes.trim(),
                              }),
                            'Linked missing-source hold to authorized PO/DA.',
                          )
                        }
                      >
                        Link Source
                      </button>
                    </div>

                    <div className="s2-breakdown-box">
                      <h4>Reject &amp; Return Delivery</h4>
                      <div className="form-group">
                        <label className="form-label">Carrier / Recipient Name</label>
                        <input
                          className="form-control"
                          value={rejectRecipient}
                          onChange={(e) => setRejectRecipient(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Rejection Reason</label>
                        <input
                          className="form-control"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                      </div>
                      <Stage2EvidenceUploader
                        chapterId={chapterId}
                        purpose="missing_source_hold"
                        recordId={selectedHold.id}
                        recordLabel="Hold Return Signed Receipt"
                        selectedBinding={rejectEvidence}
                        onSelectBinding={setRejectEvidence}
                      />
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={
                          !canManageHold ||
                          busy ||
                          !rejectReason.trim() ||
                          !rejectRecipient.trim() ||
                          !rejectEvidence
                        }
                        onClick={() =>
                          void runReceivingAction(
                            'rejectReturnReceivingHold',
                            () =>
                              rejectReturnReceivingHold(chapterId, selectedHold.id, {
                                expected_version: selectedHold.version,
                                expected_material_version: selectedHold.material_version,
                                reason: rejectReason.trim(),
                                recipient_or_carrier_name: rejectRecipient.trim(),
                                evidence: rejectEvidence!,
                                signed_at: new Date().toISOString(),
                              }),
                            'Recorded signed rejection and physical return.',
                          )
                        }
                      >
                        Reject &amp; Return
                      </button>
                    </div>
                  </div>
                )}

                {holdHistory.length > 0 && (
                  <div className="s2-table-wrap">
                    <table className="s2-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>State</th>
                          <th>Actor</th>
                          <th>Time</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdHistory.map((hh) => (
                          <tr key={hh.id}>
                            <td>{hh.action}</td>
                            <td>{hh.to_status}</td>
                            <td>{hh.actor.display_name}</td>
                            <td>{formatManilaTime(hh.occurred_at)}</td>
                            <td>{hh.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="surface-card s2-section-card">
            <h3 className="s2-panel-title">Log Undocumented Delivery into Missing-Source Hold</h3>
            <div className="s2-form-stack">
              <div className="s2-grid-3">
                <SearchableRecordPicker
                  id="rcv-hold-loc"
                  label="Holding Location"
                  valueId={holdLocationId}
                  options={candidates.locationOptions}
                  onSelect={(opt) => setHoldLocationId(opt?.id ?? '')}
                  required
                />
                <div className="form-group">
                  <label className="form-label">Sender / Carrier Name</label>
                  <input
                    className="form-control"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sender Kind</label>
                  <select
                    className="form-control"
                    value={senderKind}
                    onChange={(e) =>
                      setSenderKind(
                        e.target.value as 'supplier' | 'donor' | 'carrier' | 'unknown',
                      )
                    }
                  >
                    <option value="carrier">Courier / Carrier</option>
                    <option value="supplier">Supplier</option>
                    <option value="donor">Donor</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div className="s2-grid-2">
                <div className="form-group">
                  <label className="form-label">Waybill / Delivery Doc Reference</label>
                  <input
                    className="form-control"
                    value={holdDocRef}
                    onChange={(e) => setHoldDocRef(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hold Reason</label>
                  <input
                    className="form-control"
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="s2-grid-3">
                <SearchableRecordPicker
                  id="rcv-hold-var"
                  label="Item Variant (if identifiable)"
                  valueId={holdItemVariantId}
                  options={candidates.variantOptions}
                  onSelect={(opt) => {
                    setHoldItemVariantId(opt?.id ?? '');
                    setHoldItemUnitId(opt?.meta.default_unit_id ?? holdItemUnitId);
                  }}
                />
                <div className="form-group">
                  <label className="form-label">Item Description</label>
                  <input
                    className="form-control"
                    value={holdItemDesc}
                    onChange={(e) => setHoldItemDesc(e.target.value)}
                    placeholder="e.g. 2 sealed cartons labeled Medium Shirts"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Arrived Quantity</label>
                  <input
                    className="form-control"
                    value={holdItemQty}
                    onChange={(e) => setHoldItemQty(e.target.value)}
                  />
                </div>
              </div>
              <Stage2EvidenceUploader
                chapterId={chapterId}
                purpose="missing_source_hold"
                recordId={holdLocationId || chapterId}
                recordLabel="Intake Photo / Waybill Scan"
                selectedBinding={holdIntakeEvidence}
                onSelectBinding={setHoldIntakeEvidence}
              />
              <button
                type="button"
                className="btn-batcave-primary"
                disabled={
                  !canManageHold ||
                  busy ||
                  !holdLocationId ||
                  !carrierName.trim() ||
                  !holdReason.trim() ||
                  !holdItemDesc.trim()
                }
                onClick={() => {
                  const items: ReceivingHoldItemInput[] = [
                    {
                      variant_id: holdItemVariantId || null,
                      unit_id: holdItemUnitId || null,
                      item_description: holdItemDesc.trim(),
                      arrived_quantity: holdItemQty.trim(),
                      condition_notes: 'Held outside usable stock pending verification.',
                    },
                  ];
                  void runReceivingAction(
                    'createReceivingHold',
                    () =>
                      createReceivingHold(chapterId, {
                        arrived_at: new Date().toISOString(),
                        holding_location_id: holdLocationId,
                        carrier_or_sender_name: carrierName.trim(),
                        sender_kind: senderKind,
                        delivery_document_reference: holdDocRef.trim() || null,
                        hold_reason: holdReason.trim(),
                        items,
                        intake_evidence: holdIntakeEvidence,
                      }),
                    'Placed undocumented delivery onto Missing-Source Hold.',
                  );
                }}
              >
                Create Missing-Source Hold
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
