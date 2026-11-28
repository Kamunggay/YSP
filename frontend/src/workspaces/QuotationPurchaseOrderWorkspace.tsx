import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { ContractApiError, formatManilaTime } from '../api/client.ts';
import {
  approvePurchaseOrder,
  approvePurchaseOrderAmendment,
  cancelPurchaseOrder,
  closeShortPurchaseOrder,
  createPurchaseOrder,
  createRepfQuotation,
  deleteRepfQuotation,
  findProcurementOperationByKey,
  listPurchaseOrderHistory,
  listPurchaseOrderRelatedRecords,
  listPurchaseOrders,
  listRepfQuotations,
  listRepfs,
  printPurchaseOrder,
  proposePurchaseOrderAmendment,
  readProcurementOperation,
  readPurchaseOrder,
  readPurchaseOrderVersion,
  recordPurchaseOrderAcknowledgment,
  recordSupplierSelection,
  rejectPurchaseOrder,
  replacePurchaseOrder,
  replaceRepfQuotation,
  returnPurchaseOrder,
  submitPurchaseOrder,
} from '../api/stage2Client.ts';
import type {
  ProcurementOperationName,
  PurchaseOrder,
  PurchaseOrderHistoryEntry,
  PurchaseOrderLineInput,
  PurchaseOrderRelatedRecord,
  PurchaseOrderStatus,
  Repf,
  RepfQuotation,
  RepfQuotationLineInput,
  Stage2EvidenceByteBinding,
  SupplierSubtype,
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

interface QuotationPurchaseOrderWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  domainSignal?: number;
  chapterAccess: ChapterAccessSnapshot | null;
  previewEnabled: boolean;
  initialRepfId?: string | null;
  initialPoId?: string | null;
  onNavigateTab: (tab: WorkspaceTab, opts?: { repfId?: string; poId?: string }) => void;
  onBackToDashboard?: () => void;
}

interface EditablePoLine {
  key: string;
  po_line_id: string | null;
  repf_line_id: string;
  quotation_line_id: string;
  variant_id: string;
  unit_id: string;
  ordered_quantity: string;
  unit_price_php: string;
  specifications: string;
  notes: string;
}

interface SavedPoDraft {
  selectedRepfId?: string;
  selectedPoId?: string;
  deliveryLocation?: string;
  expectedDeliveryDate?: string;
  paymentAndDeliveryTerms?: string;
  poLines?: EditablePoLine[];
}

const SUPPLIER_SUBTYPES: Array<{ value: SupplierSubtype; label: string }> = [
  { value: 'local_retailer', label: 'Local Retailer' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'other', label: 'Other' },
];

export function QuotationPurchaseOrderWorkspace({
  userId,
  chapterId,
  refreshSignal,
  domainSignal = 0,
  chapterAccess,
  previewEnabled,
  initialRepfId = null,
  initialPoId = null,
  onNavigateTab,
  onBackToDashboard,
}: QuotationPurchaseOrderWorkspaceProps) {
  const formKey = 'stage2_po_editor';
  const candidates = useStage2Candidates(chapterId, refreshSignal, previewEnabled, chapterAccess);
  const skipSaveRef = useRef(false);

  const initialDraft = useMemo<SavedPoDraft>(() => {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) return {};
    try {
      return JSON.parse(saved.payloadJson) as SavedPoDraft;
    } catch {
      return {};
    }
  }, [chapterId, userId]);

  const [subTab, setSubTab] = useState<'quotations' | 'purchase_orders'>(
    initialPoId ? 'purchase_orders' : 'quotations',
  );
  const [repfs, setRepfs] = useState<Repf[]>([]);
  const [selectedRepfId, setSelectedRepfId] = useState<string>(
    initialRepfId ?? initialDraft.selectedRepfId ?? '',
  );
  const [quotations, setQuotations] = useState<RepfQuotation[]>([]);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  // Quotation form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierSubtype, setSupplierSubtype] = useState<SupplierSubtype>('wholesaler');
  const [contactRef, setContactRef] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [quotedAt, setQuotedAt] = useState(new Date().toISOString().slice(0, 16));
  const [validUntil, setValidUntil] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('5');
  const [availabilitySummary, setAvailabilitySummary] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [quotePaymentTerms, setQuotePaymentTerms] = useState('');
  const [reliabilityNotes, setReliabilityNotes] = useState('');
  const [quoteEvidence, setQuoteEvidence] = useState<Stage2EvidenceByteBinding | null>(null);
  const [quoteRepfLineId, setQuoteRepfLineId] = useState('');
  const [quoteQty, setQuoteQty] = useState('40');
  const [quoteUnitPrice, setQuoteUnitPrice] = useState('240.00');
  const [quoteLineNotes, setQuoteLineNotes] = useState('');

  // Supplier selection state
  const [selectionQuoteId, setSelectionQuoteId] = useState('');
  const [comparableIds, setComparableIds] = useState<string[]>([]);
  const [selectionRationale, setSelectionRationale] = useState('');
  const [waiverEnabled, setWaiverEnabled] = useState(false);
  const [waiverReason, setWaiverReason] = useState('');
  const [policyHint, setPolicyHint] = useState<string | null>(null);

  // Purchase Order list & detail state
  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>(
    initialPoId ?? initialDraft.selectedPoId ?? '',
  );
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [poHistory, setPoHistory] = useState<PurchaseOrderHistoryEntry[]>([]);
  const [poRelated, setPoRelated] = useState<PurchaseOrderRelatedRecord[]>([]);

  // PO Editor & Amendment state
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState(
    initialDraft.deliveryLocation ?? 'Main Chapter Stockroom, Cebu City',
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    initialDraft.expectedDeliveryDate ?? '2026-12-10',
  );
  const [poPaymentTerms, setPoPaymentTerms] = useState(
    initialDraft.paymentAndDeliveryTerms ?? '50% upon delivery acceptance, 50% net 15 days',
  );
  const [poLines, setPoLines] = useState<EditablePoLine[]>(initialDraft.poLines ?? []);
  const [amendReason, setAmendReason] = useState('');

  // PO Review / Ack / Close-Short state
  const [poActionReason, setPoActionReason] = useState('');
  const [ackRef, setAckRef] = useState('');
  const [ackDate, setAckDate] = useState('');
  const [ackNotes, setAckNotes] = useState('');
  const [ackEvidence, setAckEvidence] = useState<Stage2EvidenceByteBinding | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastOpHint, setLastOpHint] = useState<{
    operationName: string;
    actionKey: string;
    operationId?: string;
  } | null>(null);

  const canQuote = !actionBlockReason(chapterAccess, 'quotation.manage');
  const canSelectSupplier = !actionBlockReason(chapterAccess, 'supplier_selection.record');
  const canPreparePo = !actionBlockReason(chapterAccess, 'po.prepare');
  const canSubmitPo = !actionBlockReason(chapterAccess, 'po.submit');
  const canApprovePo = !actionBlockReason(chapterAccess, 'po.approve');
  const canReturnPo = !actionBlockReason(chapterAccess, 'po.return');
  const canRejectPo = !actionBlockReason(chapterAccess, 'po.reject');
  const canAckPo = !actionBlockReason(chapterAccess, 'po.acknowledge');
  const canAmendPo = !actionBlockReason(chapterAccess, 'po.amend');
  const canApproveAmend = !actionBlockReason(chapterAccess, 'po.approve_amendment');
  const canCloseShortPo = !actionBlockReason(chapterAccess, 'po.close_short');
  const canCancelPo = !actionBlockReason(chapterAccess, 'po.cancel');

  const loadBase = useCallback(async () => {
    try {
      const [repfRes, poRes] = await Promise.all([
        listRepfs(chapterId, { limit: 50 }),
        listPurchaseOrders(chapterId, {
          status: (poStatusFilter || undefined) as PurchaseOrderStatus | undefined,
          q: poSearch.trim() || undefined,
          limit: 50,
        }),
      ]);
      const eligibleRepfs = repfRes.data.filter(
        (r) =>
          r.status === 'approved' ||
          r.status === 'partially_ordered' ||
          r.status === 'ordered',
      );
      setRepfs(eligibleRepfs);
      setPurchaseOrders(poRes.data);
      setSelectedRepfId((cur) => {
        if (initialRepfId && eligibleRepfs.some((r) => r.id === initialRepfId)) {
          return initialRepfId;
        }
        if (cur && eligibleRepfs.some((r) => r.id === cur)) {
          return cur;
        }
        return eligibleRepfs[0]?.id ?? '';
      });
      setSelectedPoId((cur) => {
        if (initialPoId && poRes.data.some((p) => p.id === initialPoId)) {
          return initialPoId;
        }
        if (cur && poRes.data.some((p) => p.id === cur)) {
          return cur;
        }
        return poRes.data[0]?.id ?? '';
      });
    } catch (err) {
      setError(err);
    }
  }, [chapterId, initialPoId, initialRepfId, poSearch, poStatusFilter]);

  const loadQuotations = useCallback(
    async (repfId: string) => {
      if (!repfId) {
        setQuotations([]);
        return;
      }
      try {
        const res = await listRepfQuotations(chapterId, repfId, { limit: 50 });
        setQuotations(res.data);
        setComparableIds(res.data.map((q) => q.id));
        const selected = res.data.find((q) => q.is_selected) ?? res.data[0];
        if (selected) {
          setSelectionQuoteId(selected.id);
        }
      } catch (err) {
        setError(err);
      }
    },
    [chapterId],
  );

  const loadSelectedPoDetail = useCallback(
    async (poId: string) => {
      if (!poId) {
        setSelectedPo(null);
        setPoHistory([]);
        setPoRelated([]);
        return;
      }
      try {
        const [detail, histRes, relRes] = await Promise.all([
          readPurchaseOrder(chapterId, poId),
          listPurchaseOrderHistory(chapterId, poId, { limit: 50 }),
          listPurchaseOrderRelatedRecords(chapterId, poId, { limit: 50 }),
        ]);
        setSelectedPo(detail);
        setPoHistory(histRes.data);
        setPoRelated(relRes.data);
      } catch (err) {
        setError(err);
      }
    },
    [chapterId],
  );

  useEffect(() => {
    void loadBase();
  }, [loadBase, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadQuotations(selectedRepfId);
  }, [loadQuotations, selectedRepfId, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadSelectedPoDetail(selectedPoId);
  }, [loadSelectedPoDetail, selectedPoId, refreshSignal, domainSignal]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    const payload: SavedPoDraft = {
      selectedRepfId,
      selectedPoId,
      deliveryLocation,
      expectedDeliveryDate,
      paymentAndDeliveryTerms: poPaymentTerms,
      poLines,
    };
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: 'PO Draft',
      baseVersion: selectedPo?.version ?? null,
      pendingActionKey,
      payloadJson: JSON.stringify(payload),
    });
  }, [
    chapterId,
    deliveryLocation,
    expectedDeliveryDate,
    poLines,
    poPaymentTerms,
    selectedPoId,
    selectedRepfId,
    userId,
  ]);

  const activeRepf = useMemo(
    () => repfs.find((r) => r.id === selectedRepfId) ?? null,
    [repfs, selectedRepfId],
  );

  const repfOptions = useMemo<Array<SearchablePickerOption<Repf>>>(
    () =>
      repfs.map((r) => ({
        id: r.id,
        primaryLabel: `${r.repf_reference ?? r.id.slice(0, 8)} · PHP ${r.estimated_total_php}`,
        secondaryLabel: `${r.lines.map((l) => l.variant_code).join(', ')} · Approved ${r.approved_budget_php ?? r.estimated_total_php}`,
        badge: r.status.replaceAll('_', ' '),
        badgeTone: r.linked_demand_canceled ? 'danger' : 'ready',
        meta: r,
      })),
    [repfs],
  );

  const repfLineOptions = useMemo<Array<SearchablePickerOption<string>>>(
    () =>
      (activeRepf?.lines ?? []).map((l) => ({
        id: l.id,
        primaryLabel: `#${l.line_number} ${l.variant_code} — Remaining ${l.remaining_to_order_quantity} ${l.unit_code}`,
        secondaryLabel: `${l.trigger_kind.replaceAll('_', ' ')} · Est PHP ${l.estimated_unit_cost_php}`,
        meta: l.id,
      })),
    [activeRepf],
  );

  const quotationOptions = useMemo<Array<SearchablePickerOption<RepfQuotation>>>(
    () =>
      quotations.map((q) => ({
        id: q.id,
        primaryLabel: `${q.supplier.supplier_name} — PHP ${q.total_amount_php}`,
        secondaryLabel: `${q.lead_time_days}d lead · ${q.supplier.supplier_reference ?? q.supplier.contact_reference}`,
        badge: q.is_selected ? 'Selected' : 'Candidate',
        badgeTone: q.is_selected ? 'ready' : 'neutral',
        meta: q,
      })),
    [quotations],
  );

  // OpenAPI /purchase-orders?q filters catalogue terms, so also match PO reference & supplier name locally.
  const filteredPos = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter((p) =>
      `${p.po_reference ?? ''} ${p.supplier.supplier_name} ${p.repf_reference}`
        .toLowerCase()
        .includes(q),
    );
  }, [poSearch, purchaseOrders]);

  const poOptions = useMemo<Array<SearchablePickerOption<PurchaseOrder>>>(
    () =>
      filteredPos.map((p) => ({
        id: p.id,
        primaryLabel: `${p.po_reference ?? 'Draft PO'} · ${p.supplier.supplier_name}`,
        secondaryLabel: `PHP ${p.total_amount_php} · RepF ${p.repf_reference}`,
        badge: p.linked_demand_canceled ? 'Demand Changed' : p.status.replaceAll('_', ' '),
        badgeTone: p.linked_demand_canceled
          ? 'danger'
          : p.status === 'issued' || p.status === 'receiving_complete'
            ? 'ready'
            : p.status === 'partially_received'
              ? 'warning'
              : 'neutral',
        searchText: `${p.po_reference ?? ''} ${p.supplier.supplier_name} ${p.repf_reference}`,
        meta: p,
      })),
    [filteredPos],
  );

  function handleSelectRepfChange(nextRepfId: string) {
    setSelectedRepfId(nextRepfId);
    // Clear dependent quotation/line choices when parent RepF changes.
    setEditingQuoteId(null);
    setSelectionQuoteId('');
    setQuoteRepfLineId('');
    setPolicyHint(null);
  }

  function handleSeedPoFromSelection() {
    const selectedQ = quotations.find((q) => q.id === selectionQuoteId || q.is_selected);
    if (!activeRepf || !selectedQ) {
      setError(new Error('Record a supplier selection on the RepF before creating a PO.'));
      return;
    }
    setEditingPoId(null);
    setPoPaymentTerms(selectedQ.payment_and_delivery_terms);
    setPoLines(
      selectedQ.lines.map((ql) => ({
        key: ql.id,
        po_line_id: null,
        repf_line_id: ql.repf_line_id,
        quotation_line_id: ql.id,
        variant_id: ql.variant_id,
        unit_id: ql.unit_id,
        ordered_quantity: ql.quoted_quantity,
        unit_price_php: ql.unit_price_php,
        specifications: `${candidates.describeVariant(ql.variant_id)} per selected quote ${selectedQ.supplier.supplier_reference ?? selectedQ.supplier.supplier_name}`,
        notes: ql.notes ?? '',
      })),
    );
    setSubTab('purchase_orders');
    setStatusMessage(`Prepared PO draft lines from ${selectedQ.supplier.supplier_name}.`);
  }

  async function handleSaveQuotation(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRepf) return;
    const targetRepfLine =
      activeRepf.lines.find((l) => l.id === quoteRepfLineId) ?? activeRepf.lines[0];
    if (!targetRepfLine) {
      setError(new Error('Selected RepF has no lines to quote against.'));
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const payloadLines: RepfQuotationLineInput[] = [
        {
          repf_line_id: targetRepfLine.id,
          variant_id: targetRepfLine.variant_id,
          unit_id: targetRepfLine.unit_id,
          quoted_quantity: quoteQty.trim(),
          unit_price_php: quoteUnitPrice.trim(),
          notes: quoteLineNotes.trim() || null,
        },
      ];
      const baseBody = {
        supplier: {
          supplier_name: supplierName.trim(),
          supplier_subtype: supplierSubtype,
          contact_reference: contactRef.trim(),
          supplier_reference: supplierRef.trim() || null,
        },
        quoted_at: quotedAt ? `${quotedAt}:00.000000Z` : new Date().toISOString(),
        valid_until: validUntil.trim() || null,
        lead_time_days: Number.parseInt(leadTimeDays, 10) || 1,
        availability_summary: availabilitySummary.trim(),
        quality_warranty_terms: warrantyTerms.trim(),
        payment_and_delivery_terms: quotePaymentTerms.trim(),
        reliability_notes: reliabilityNotes.trim() || null,
        evidence: quoteEvidence,
        lines: payloadLines,
      };
      const existingQuote = editingQuoteId
        ? quotations.find((q) => q.id === editingQuoteId)
        : null;
      if (existingQuote) {
        const { data, actionKey } = await replaceRepfQuotation(
          chapterId,
          activeRepf.id,
          existingQuote.id,
          {
            expected_version: existingQuote.version,
            expected_material_version: existingQuote.material_version,
            ...baseBody,
          },
        );
        setLastOpHint({
          operationName: 'replaceRepfQuotation',
          actionKey,
          operationId: data.operation_id,
        });
        setStatusMessage(`Updated quotation v${data.result.version}.`);
      } else {
        const { data, actionKey } = await createRepfQuotation(
          chapterId,
          activeRepf.id,
          baseBody,
        );
        setLastOpHint({
          operationName: 'createRepfQuotation',
          actionKey,
          operationId: data.operation_id,
        });
        setStatusMessage(`Recorded quotation from ${data.result.supplier.supplier_name}.`);
      }
      setEditingQuoteId(null);
      await loadQuotations(activeRepf.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordSelection() {
    if (!activeRepf || !selectionQuoteId) return;
    setBusy(true);
    setError(null);
    setPolicyHint(null);
    try {
      const { data, actionKey } = await recordSupplierSelection(chapterId, activeRepf.id, {
        expected_repf_version: activeRepf.version,
        expected_repf_material_version: activeRepf.material_version,
        selected_quotation_id: selectionQuoteId,
        comparable_quotation_ids:
          comparableIds.length > 0 ? comparableIds : [selectionQuoteId],
        selection_rationale: selectionRationale.trim(),
        emergency_waiver:
          waiverEnabled && waiverReason.trim() ? { reason: waiverReason.trim() } : null,
      });
      setLastOpHint({
        operationName: 'recordSupplierSelection',
        actionKey,
        operationId: data.operation_id,
      });
      setStatusMessage('Supplier selection recorded under chapter quotation policy.');
      await loadQuotations(activeRepf.id);
    } catch (err) {
      if (
        err instanceof ContractApiError &&
        (err.code === 'quotation_policy_unmet' || err.status === 409 || err.status === 422)
      ) {
        setPolicyHint(
          'Quotation policy minimum was not met. Attach more comparable quotes or provide an authorized Emergency Waiver reason (subject to Budget Approver / Chapter Head ceiling).',
        );
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePo(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRepf) return;
    const selectedQ = quotations.find((q) => q.is_selected) ?? quotations[0];
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const lineInputs: PurchaseOrderLineInput[] = poLines.map((l) => ({
        repf_line_id: l.repf_line_id,
        quotation_line_id: l.quotation_line_id,
        variant_id: l.variant_id,
        unit_id: l.unit_id,
        ordered_quantity: l.ordered_quantity.trim(),
        unit_price_php: l.unit_price_php.trim(),
        specifications: l.specifications.trim(),
        notes: l.notes.trim() || null,
      }));
      if (editingPoId && selectedPo && selectedPo.id === editingPoId) {
        const { data, actionKey } = await replacePurchaseOrder(chapterId, editingPoId, {
          expected_version: selectedPo.version,
          expected_material_version: selectedPo.material_version,
          delivery_location: deliveryLocation.trim(),
          expected_delivery_date: expectedDeliveryDate,
          payment_and_delivery_terms: poPaymentTerms.trim(),
          lines: lineInputs,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'replacePurchaseOrder',
          actionKey,
          operationId: data.operation_id,
        });
        setSelectedPoId(data.result.id);
        setStatusMessage(`Replaced PO draft revision v${data.result.version}.`);
      } else {
        const { data, actionKey } = await createPurchaseOrder(chapterId, {
          repf_id: activeRepf.id,
          supplier_selection_id: selectedQ?.id ?? selectionQuoteId,
          delivery_location: deliveryLocation.trim(),
          expected_delivery_date: expectedDeliveryDate,
          payment_and_delivery_terms: poPaymentTerms.trim(),
          lines: lineInputs,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'createPurchaseOrder',
          actionKey,
          operationId: data.operation_id,
        });
        setSelectedPoId(data.result.id);
        setStatusMessage('Created PO draft.');
      }
      skipSaveRef.current = true;
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      await loadBase();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runPoMutation(
    opName: ProcurementOperationName,
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
      setPoActionReason('');
      await loadBase();
      if (selectedPoId) {
        await loadSelectedPoDetail(selectedPoId);
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
        headingId="po-heading"
        title="Quotations, Supplier Selection & Purchase Orders"
        subtitle="Compare supplier quotes against policy tiers, record selections, and manage PO approvals, acknowledgments, and amendments."
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
          aria-selected={subTab === 'quotations'}
          className={`s2-tab-btn${subTab === 'quotations' ? ' is-active' : ''}`}
          onClick={() => setSubTab('quotations')}
        >
          1. Quotations &amp; Supplier Selection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'purchase_orders'}
          className={`s2-tab-btn${subTab === 'purchase_orders' ? ' is-active' : ''}`}
          onClick={() => setSubTab('purchase_orders')}
        >
          2. Purchase Orders ({filteredPos.length})
        </button>
      </div>

      {subTab === 'quotations' && (
        <>
          <section className="surface-card s2-section-card">
            <div className="s2-panel-header">
              <div>
                <h2 className="s2-panel-title">Approved RepF Quotations</h2>
                <p className="s2-panel-sub">
                  Pick an approved or partially ordered RepF to manage comparable quotes and record a policy-compliant supplier selection.
                </p>
              </div>
              <button
                type="button"
                className="btn-batcave-primary p02-compact-btn"
                disabled={!activeRepf || quotations.length === 0}
                onClick={handleSeedPoFromSelection}
              >
                Create PO from Selection →
              </button>
            </div>

            <SearchableRecordPicker
              id="po-repf-picker"
              label="Originating Approved RepF"
              valueId={selectedRepfId}
              options={repfOptions}
              onSelect={(opt) => handleSelectRepfChange(opt?.id ?? '')}
              placeholder="Select approved RepF..."
            />

            {quotations.length === 0 ? (
              <p className="s2-empty-hint">
                No supplier quotations recorded yet for this RepF. Add comparable quotes below.
              </p>
            ) : (
              <div className="s2-table-wrap">
                <table className="s2-table">
                  <thead>
                    <tr>
                      <th>Comparable</th>
                      <th>Supplier</th>
                      <th>Lead / Terms</th>
                      <th>Total (PHP)</th>
                      <th>Paper Evidence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map((q) => (
                      <tr key={q.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={comparableIds.includes(q.id)}
                            onChange={(e) =>
                              setComparableIds((prev) =>
                                e.target.checked
                                  ? [...prev, q.id]
                                  : prev.filter((id) => id !== q.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <strong>{q.supplier.supplier_name}</strong>
                          <div className="s2-muted-sm">
                            {q.supplier.supplier_subtype.replaceAll('_', ' ')} ·{' '}
                            {q.supplier.contact_reference}
                          </div>
                          {q.is_selected && <span className="s2-badge is-ready">Selected</span>}
                        </td>
                        <td>
                          {q.lead_time_days}d · {q.payment_and_delivery_terms}
                        </td>
                        <td>PHP {q.total_amount_php}</td>
                        <td>
                          {q.evidence_binding ? (
                            <span className="s2-badge is-ready">Bound</span>
                          ) : (
                            <span className="s2-badge is-neutral">None</span>
                          )}
                        </td>
                        <td>
                          <div className="s2-inline-actions">
                            <button
                              type="button"
                              className="btn-batcave-secondary p02-compact-btn"
                              disabled={!canQuote || q.is_selected || busy}
                              onClick={() => {
                                setEditingQuoteId(q.id);
                                setSupplierName(q.supplier.supplier_name);
                                setSupplierSubtype(q.supplier.supplier_subtype);
                                setContactRef(q.supplier.contact_reference);
                                setSupplierRef(q.supplier.supplier_reference ?? '');
                                setLeadTimeDays(String(q.lead_time_days));
                                setAvailabilitySummary(q.availability_summary);
                                setWarrantyTerms(q.quality_warranty_terms);
                                setQuotePaymentTerms(q.payment_and_delivery_terms);
                                setReliabilityNotes(q.reliability_notes ?? '');
                                setQuoteEvidence(q.evidence_binding);
                                const firstLine = q.lines[0];
                                if (firstLine) {
                                  setQuoteRepfLineId(firstLine.repf_line_id);
                                  setQuoteQty(firstLine.quoted_quantity);
                                  setQuoteUnitPrice(firstLine.unit_price_php);
                                  setQuoteLineNotes(firstLine.notes ?? '');
                                }
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-batcave-secondary p02-compact-btn"
                              disabled={!canQuote || q.is_selected || busy}
                              onClick={() =>
                                void runPoMutation(
                                  'deleteRepfQuotation',
                                  () =>
                                    deleteRepfQuotation(
                                      chapterId,
                                      selectedRepfId,
                                      q.id,
                                      q.version,
                                      q.material_version,
                                    ),
                                  'Deleted unselected quotation.',
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Policy-Gated Supplier Selection */}
            <div className="s2-breakdown-box">
              <h3>Record Policy-Gated Supplier Selection</h3>
              {policyHint && (
                <div className="s2-inline-alert is-warning" role="alert">
                  {policyHint}
                </div>
              )}
              <div className="s2-grid-2">
                <SearchableRecordPicker
                  id="po-win-quote-picker"
                  label="Winning Quotation"
                  valueId={selectionQuoteId}
                  options={quotationOptions}
                  onSelect={(opt) => setSelectionQuoteId(opt?.id ?? '')}
                  placeholder="Select quotation..."
                />
                <div className="form-group">
                  <label className="form-label" htmlFor="sel-rationale">
                    Selection Rationale
                  </label>
                  <input
                    id="sel-rationale"
                    className="form-control"
                    value={selectionRationale}
                    onChange={(e) => setSelectionRationale(e.target.value)}
                    placeholder="Price, lead time, warranty comparison..."
                  />
                </div>
              </div>
              <label className="s2-check-row">
                <input
                  type="checkbox"
                  checked={waiverEnabled}
                  onChange={(e) => setWaiverEnabled(e.target.checked)}
                />
                Use Emergency Quotation Waiver (requires reason and policy waiver ceiling)
              </label>
              {waiverEnabled && (
                <div className="form-group">
                  <label className="form-label" htmlFor="waiver-reason">
                    Emergency Waiver Justification
                  </label>
                  <input
                    id="waiver-reason"
                    className="form-control"
                    value={waiverReason}
                    onChange={(e) => setWaiverReason(e.target.value)}
                    placeholder="Document emergency sole-source or urgent relief rationale..."
                  />
                </div>
              )}
              <div className="s2-action-bar">
                <button
                  type="button"
                  className="btn-batcave-primary p02-compact-btn"
                  disabled={!canSelectSupplier || busy || !selectionQuoteId || !selectionRationale.trim()}
                  onClick={() => void handleRecordSelection()}
                >
                  Record Supplier Selection
                </button>
              </div>
            </div>
          </section>

          {/* Quotation Add/Edit Form */}
          <section className="surface-card s2-section-card">
            <h3 className="s2-panel-title">
              {editingQuoteId ? 'Edit Quotation' : 'Add Supplier Quotation'}
            </h3>
            <form onSubmit={(e) => void handleSaveQuotation(e)} className="s2-form-stack">
              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Supplier Name</label>
                  <input
                    className="form-control"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier Subtype</label>
                  <select
                    className="form-control"
                    value={supplierSubtype}
                    onChange={(e) => setSupplierSubtype(e.target.value as SupplierSubtype)}
                  >
                    {SUPPLIER_SUBTYPES.map((st) => (
                      <option key={st.value} value={st.value}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Reference</label>
                  <input
                    className="form-control"
                    required
                    value={contactRef}
                    onChange={(e) => setContactRef(e.target.value)}
                  />
                </div>
              </div>

              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Supplier Quote Reference</label>
                  <input
                    className="form-control"
                    value={supplierRef}
                    onChange={(e) => setSupplierRef(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quoted At</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={quotedAt}
                    onChange={(e) => setQuotedAt(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Lead Time (Days) / Valid Until</label>
                  <div className="s2-grid-2">
                    <input
                      type="number"
                      min={0}
                      className="form-control"
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                    />
                    <input
                      type="date"
                      className="form-control"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Availability Summary</label>
                  <input
                    className="form-control"
                    required
                    value={availabilitySummary}
                    onChange={(e) => setAvailabilitySummary(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quality / Warranty Terms</label>
                  <input
                    className="form-control"
                    required
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment &amp; Delivery Terms</label>
                  <input
                    className="form-control"
                    required
                    value={quotePaymentTerms}
                    onChange={(e) => setQuotePaymentTerms(e.target.value)}
                  />
                </div>
              </div>

              <div className="s2-grid-3">
                <SearchableRecordPicker
                  id="po-quote-repfline-picker"
                  label="Quoted RepF Line"
                  valueId={quoteRepfLineId || (activeRepf?.lines[0]?.id ?? '')}
                  options={repfLineOptions}
                  onSelect={(opt) => setQuoteRepfLineId(opt?.id ?? '')}
                  placeholder="Choose RepF line..."
                />
                <div className="form-group">
                  <label className="form-label">Quoted Quantity</label>
                  <input
                    className="form-control"
                    required
                    value={quoteQty}
                    onChange={(e) => setQuoteQty(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit Price (PHP)</label>
                  <input
                    className="form-control"
                    required
                    value={quoteUnitPrice}
                    onChange={(e) => setQuoteUnitPrice(e.target.value)}
                  />
                </div>
              </div>

              <Stage2EvidenceUploader
                chapterId={chapterId}
                purpose="quotation_attachment"
                recordId={activeRepf?.id ?? ''}
                recordLabel={supplierName || 'Supplier Quotation'}
                selectedBinding={quoteEvidence}
                onSelectBinding={setQuoteEvidence}
                helperText="Attach supplier PDF quote scan before recording selection."
              />

              <div className="s2-action-bar">
                {editingQuoteId && (
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    onClick={() => setEditingQuoteId(null)}
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  className="btn-batcave-primary"
                  disabled={!canQuote || busy || !activeRepf}
                >
                  {editingQuoteId ? 'Update Quotation' : 'Save Quotation'}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {subTab === 'purchase_orders' && (
        <>
          <section className="surface-card s2-section-card">
            <div className="s2-panel-header">
              <div>
                <h2 className="s2-panel-title">Purchase Orders &amp; Commitments</h2>
                <p className="s2-panel-sub">
                  Search POs by reference or supplier, verify independent approval, record supplier acknowledgment, or propose amendments.
                </p>
              </div>
              {selectedPo &&
                (selectedPo.status === 'issued' ||
                  selectedPo.status === 'partially_received') && (
                  <button
                    type="button"
                    className="btn-batcave-primary p02-compact-btn"
                    onClick={() => onNavigateTab('receiving_discrepancies')}
                  >
                    Receive Delivery in Stage 2 RM →
                  </button>
                )}
            </div>

            <div className="s2-grid-3">
              <SearchableRecordPicker
                id="po-record-picker"
                label="Select Purchase Order"
                valueId={selectedPoId}
                options={poOptions}
                onSelect={(opt) => setSelectedPoId(opt?.id ?? '')}
                placeholder="Search PO reference or supplier..."
              />
              <div className="form-group">
                <label className="form-label">Status Filter</label>
                <select
                  className="form-control"
                  value={poStatusFilter}
                  onChange={(e) => setPoStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="returned_for_revision">Returned</option>
                  <option value="issued">Issued</option>
                  <option value="partially_received">Partially Received</option>
                  <option value="receiving_complete">Receiving Complete</option>
                  <option value="closed_short">Closed Short</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Search PO / Supplier / Catalogue</label>
                <input
                  className="form-control"
                  value={poSearch}
                  onChange={(e) => setPoSearch(e.target.value)}
                  placeholder="PO-2026-..., supplier, or SKU..."
                />
              </div>
            </div>

            {selectedPo && (
              <div className="s2-detail-panel">
                {selectedPo.linked_demand_canceled && (
                  <div className="s2-inline-alert is-danger" role="alert">
                    <strong>Linked RF Demand Canceled:</strong> An originating RF linked to this PO was canceled. Amend quantity or cancel / close-short the open balance.
                  </div>
                )}

                <div className="s2-meta-grid">
                  <div>
                    <span className="s2-muted-sm">PO Reference</span>
                    <div>
                      <strong>{selectedPo.po_reference ?? 'Draft (Unissued)'}</strong>
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Status</span>
                    <div>
                      <span className="s2-badge">{selectedPo.status.replaceAll('_', ' ')}</span>
                    </div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Supplier</span>
                    <div>{selectedPo.supplier.supplier_name}</div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">PO Total (PHP)</span>
                    <div>PHP {selectedPo.total_amount_php}</div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Expected Delivery</span>
                    <div>{selectedPo.expected_delivery_date}</div>
                  </div>
                  <div>
                    <span className="s2-muted-sm">Acknowledgment (Non-Blocking)</span>
                    <div>
                      {selectedPo.acknowledgment
                        ? `${selectedPo.acknowledgment.supplier_confirmation_reference ?? 'Recorded'} (${formatManilaTime(selectedPo.acknowledgment.acknowledged_at)})`
                        : 'Pending / Optional'}
                    </div>
                  </div>
                </div>

                {/* Line conservation table */}
                <div className="s2-table-wrap">
                  <table className="s2-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Ordered</th>
                        <th>Accepted</th>
                        <th>Rejected/Disp.</th>
                        <th>Closed Short</th>
                        <th>Outstanding Open</th>
                        <th>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPo.lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <strong>{candidates.describeVariant(l.variant_id)}</strong>
                            <div className="s2-muted-sm">{l.specifications}</div>
                          </td>
                          <td>
                            {l.ordered_quantity} {candidates.describeUnit(l.unit_id)}
                          </td>
                          <td>{l.accepted_quantity}</td>
                          <td>{l.rejected_or_disputed_quantity}</td>
                          <td>{l.closed_short_quantity}</td>
                          <td>
                            <strong>{l.outstanding_quantity}</strong>
                          </td>
                          <td>PHP {l.line_total_php}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Lifecycle Buttons */}
                <div className="s2-action-bar">
                  {(selectedPo.status === 'draft' ||
                    selectedPo.status === 'returned_for_revision') && (
                    <>
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canPreparePo || busy}
                        onClick={() => {
                          setEditingPoId(selectedPo.id);
                          setDeliveryLocation(selectedPo.delivery_location);
                          setExpectedDeliveryDate(selectedPo.expected_delivery_date);
                          setPoPaymentTerms(selectedPo.payment_and_delivery_terms);
                          setPoLines(
                            selectedPo.lines.map((l) => ({
                              key: l.id,
                              po_line_id: l.id,
                              repf_line_id: l.repf_line_id,
                              quotation_line_id: l.quotation_line_id ?? '',
                              variant_id: l.variant_id,
                              unit_id: l.unit_id,
                              ordered_quantity: l.ordered_quantity,
                              unit_price_php: l.unit_price_php,
                              specifications: l.specifications,
                              notes: l.notes ?? '',
                            })),
                          );
                        }}
                      >
                        Load into Editor
                      </button>
                      <button
                        type="button"
                        className="btn-batcave-primary p02-compact-btn"
                        disabled={!canSubmitPo || busy}
                        onClick={() =>
                          void runPoMutation(
                            'submitPurchaseOrder',
                            () =>
                              submitPurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                              }),
                            'Submitted Purchase Order for independent approval.',
                          )
                        }
                      >
                        Submit PO
                      </button>
                    </>
                  )}

                  {selectedPo.status === 'pending_approval' && (
                    <>
                      <button
                        type="button"
                        className="btn-batcave-primary p02-compact-btn"
                        disabled={!canApprovePo || busy}
                        onClick={() =>
                          void runPoMutation(
                            'approvePurchaseOrder',
                            () =>
                              approvePurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                approval_notes: poActionReason.trim() || null,
                              }),
                            'Approved & issued Purchase Order.',
                          )
                        }
                      >
                        Approve &amp; Issue PO
                      </button>
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canReturnPo || busy || !poActionReason.trim()}
                        onClick={() =>
                          void runPoMutation(
                            'returnPurchaseOrder',
                            () =>
                              returnPurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                reason: poActionReason.trim(),
                              }),
                            'Returned PO for revision.',
                          )
                        }
                      >
                        Return
                      </button>
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canRejectPo || busy || !poActionReason.trim()}
                        onClick={() =>
                          void runPoMutation(
                            'rejectPurchaseOrder',
                            () =>
                              rejectPurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                reason: poActionReason.trim(),
                              }),
                            'Rejected Purchase Order.',
                          )
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {(selectedPo.status === 'issued' ||
                    selectedPo.status === 'partially_received') && (
                    <>
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canCloseShortPo || busy || !poActionReason.trim()}
                        onClick={() =>
                          void runPoMutation(
                            'closeShortPurchaseOrder',
                            () =>
                              closeShortPurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                reason: poActionReason.trim(),
                              }),
                            'Closed PO short for remaining open balance.',
                          )
                        }
                      >
                        Close Short
                      </button>
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canCancelPo || busy || !poActionReason.trim()}
                        onClick={() =>
                          void runPoMutation(
                            'cancelPurchaseOrder',
                            () =>
                              cancelPurchaseOrder(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                reason: poActionReason.trim(),
                              }),
                            'Canceled Purchase Order.',
                          )
                        }
                      >
                        Cancel PO
                      </button>
                    </>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Approval / Return / Reject / Close-Short Reason</label>
                  <input
                    className="form-control"
                    value={poActionReason}
                    onChange={(e) => setPoActionReason(e.target.value)}
                    placeholder="Notes for approval or mandatory reason for return, reject, close-short, or cancel..."
                  />
                </div>

                {/* Optional Supplier Acknowledgment */}
                {(selectedPo.status === 'issued' ||
                  selectedPo.status === 'partially_received') && (
                  <div className="s2-breakdown-box">
                    <h4>Optional Supplier Acknowledgment (Non-Blocking for Receiving)</h4>
                    <div className="s2-grid-3">
                      <div className="form-group">
                        <label className="form-label">Confirmation Reference</label>
                        <input
                          className="form-control"
                          value={ackRef}
                          onChange={(e) => setAckRef(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Revised Delivery Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={ackDate}
                          onChange={(e) => setAckDate(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Notes</label>
                        <input
                          className="form-control"
                          value={ackNotes}
                          onChange={(e) => setAckNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <Stage2EvidenceUploader
                      chapterId={chapterId}
                      purpose="po_supplier_dr"
                      recordId={selectedPo.id}
                      recordLabel={selectedPo.po_reference ?? 'PO Acknowledgment'}
                      selectedBinding={ackEvidence}
                      onSelectBinding={setAckEvidence}
                    />
                    <div className="s2-action-bar">
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canAckPo || busy}
                        onClick={() =>
                          void runPoMutation(
                            'recordPurchaseOrderAcknowledgment',
                            () =>
                              recordPurchaseOrderAcknowledgment(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                supplier_confirmation_reference: ackRef.trim() || null,
                                acknowledged_at: new Date().toISOString(),
                                revised_expected_delivery_date: ackDate || null,
                                notes: ackNotes.trim() || null,
                                evidence: ackEvidence,
                              }),
                            'Recorded non-blocking supplier acknowledgment.',
                          )
                        }
                      >
                        Record Supplier Acknowledgment
                      </button>
                    </div>
                  </div>
                )}

                {/* Pending / Propose Amendment */}
                {selectedPo.pending_amendment && (
                  <div className="s2-inline-alert is-warning">
                    <strong>
                      Pending Amendment #{selectedPo.pending_amendment.amendment_number}:
                    </strong>{' '}
                    Proposed PHP {selectedPo.pending_amendment.proposed_total_php} —{' '}
                    {selectedPo.pending_amendment.reason}
                    <div className="s2-action-bar">
                      <button
                        type="button"
                        className="btn-batcave-primary p02-compact-btn"
                        disabled={!canApproveAmend || busy}
                        onClick={() =>
                          void runPoMutation(
                            'approvePurchaseOrderAmendment',
                            () =>
                              approvePurchaseOrderAmendment(
                                chapterId,
                                selectedPo.id,
                                selectedPo.pending_amendment!.id,
                                {
                                  expected_version: selectedPo.version,
                                  expected_material_version: selectedPo.material_version,
                                  approval_notes: poActionReason.trim() || null,
                                },
                              ),
                            'Approved Purchase Order Amendment.',
                          )
                        }
                      >
                        Approve Amendment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* PO Draft / Amendment Form */}
          <section className="surface-card s2-section-card">
            <h3 className="s2-panel-title">
              {editingPoId ? 'Edit Draft Purchase Order' : 'Create / Propose PO Changes'}
            </h3>
            <form onSubmit={(e) => void handleSavePo(e)} className="s2-form-stack">
              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Delivery Location</label>
                  <input
                    className="form-control"
                    required
                    value={deliveryLocation}
                    onChange={(e) => setDeliveryLocation(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Expected Delivery Date</label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment &amp; Delivery Terms</label>
                  <input
                    className="form-control"
                    required
                    value={poPaymentTerms}
                    onChange={(e) => setPoPaymentTerms(e.target.value)}
                  />
                </div>
              </div>

              {poLines.map((line, i) => (
                <div key={line.key} className="s2-line-card">
                  <div className="s2-line-head">
                    <strong>
                      Line #{i + 1} · {candidates.describeVariant(line.variant_id)}
                    </strong>
                  </div>
                  <div className="s2-grid-3">
                    <div className="form-group">
                      <label className="form-label">Ordered Quantity</label>
                      <input
                        className="form-control"
                        required
                        value={line.ordered_quantity}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((pl) =>
                              pl.key === line.key
                                ? { ...pl, ordered_quantity: e.target.value }
                                : pl,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unit Price (PHP)</label>
                      <input
                        className="form-control"
                        required
                        value={line.unit_price_php}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((pl) =>
                              pl.key === line.key
                                ? { ...pl, unit_price_php: e.target.value }
                                : pl,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Specifications</label>
                      <input
                        className="form-control"
                        required
                        value={line.specifications}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((pl) =>
                              pl.key === line.key
                                ? { ...pl, specifications: e.target.value }
                                : pl,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="s2-action-bar">
                <button
                  type="submit"
                  className="btn-batcave-primary"
                  disabled={!canPreparePo || busy || poLines.length === 0}
                >
                  {editingPoId ? 'Replace Draft PO' : 'Create Draft PO'}
                </button>
                {selectedPo &&
                  (selectedPo.status === 'issued' ||
                    selectedPo.status === 'partially_received') && (
                    <div className="s2-inline-actions">
                      <input
                        className="form-control"
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        placeholder="Amendment reason..."
                      />
                      <button
                        type="button"
                        className="btn-batcave-secondary p02-compact-btn"
                        disabled={!canAmendPo || busy || !amendReason.trim()}
                        onClick={() =>
                          void runPoMutation(
                            'proposePurchaseOrderAmendment',
                            () =>
                              proposePurchaseOrderAmendment(chapterId, selectedPo.id, {
                                expected_version: selectedPo.version,
                                expected_material_version: selectedPo.material_version,
                                delivery_location: deliveryLocation.trim(),
                                expected_delivery_date: expectedDeliveryDate,
                                payment_and_delivery_terms: poPaymentTerms.trim(),
                                reason: amendReason.trim(),
                                lines: (poLines.length > 0
                                  ? poLines
                                  : selectedPo.lines.map((sl) => ({
                                      key: sl.id,
                                      po_line_id: sl.id,
                                      repf_line_id: sl.repf_line_id,
                                      quotation_line_id: sl.quotation_line_id ?? '',
                                      variant_id: sl.variant_id,
                                      unit_id: sl.unit_id,
                                      ordered_quantity: sl.ordered_quantity,
                                      unit_price_php: sl.unit_price_php,
                                      specifications: sl.specifications,
                                      notes: sl.notes ?? '',
                                    }))
                                ).map((l) => ({
                                  po_line_id: l.po_line_id,
                                  repf_line_id: l.repf_line_id,
                                  variant_id: l.variant_id,
                                  unit_id: l.unit_id,
                                  ordered_quantity: l.ordered_quantity,
                                  unit_price_php: l.unit_price_php,
                                  specifications: l.specifications,
                                  notes: l.notes || null,
                                })),
                              }),
                            'Proposed Purchase Order amendment.',
                          )
                        }
                      >
                        Propose Amendment
                      </button>
                    </div>
                  )}
              </div>
            </form>
          </section>

          {selectedPo && (
            <Stage2AuditPanels
              title={selectedPo.po_reference ?? 'Draft Purchase Order'}
              recordVersion={selectedPo.version}
              history={poHistory.map((h) => ({
                id: h.id,
                version: h.version,
                materialVersion: h.material_version,
                action: h.action,
                fromStatus: h.from_status,
                toStatus: h.to_status,
                actorName: h.actor.display_name,
                occurredAt: h.occurred_at,
                reason: h.reason,
              }))}
              related={poRelated.map((r) => ({
                kind: r.kind,
                id: r.id,
                reference: r.reference,
                state: r.state,
                materialVersion: r.material_version,
                lineRef: r.po_line_id,
                warning: r.linked_demand_canceled ? 'Demand Canceled' : null,
              }))}
              onRefreshAudit={() => loadSelectedPoDetail(selectedPo.id)}
              onLoadVersion={(v) => readPurchaseOrderVersion(chapterId, selectedPo.id, v)}
              onLoadPrintHtml={() => printPurchaseOrder(chapterId, selectedPo.id)}
              onOpenRelated={(kind, id) => {
                if (kind === 'repf') {
                  onNavigateTab('replenishment_repf', { repfId: id });
                } else if (kind === 'receiving_report' || kind === 'receiving_discrepancy') {
                  onNavigateTab('receiving_discrepancies');
                }
              }}
              recoveryOperations={[
                { value: 'createPurchaseOrder', label: 'Create PO Draft' },
                { value: 'submitPurchaseOrder', label: 'Submit PO' },
                { value: 'approvePurchaseOrder', label: 'Approve & Issue PO' },
                { value: 'proposePurchaseOrderAmendment', label: 'Propose PO Amendment' },
                { value: 'closeShortPurchaseOrder', label: 'Close Short PO' },
              ]}
              onLookupByActionKey={(op, key) =>
                findProcurementOperationByKey(chapterId, op as ProcurementOperationName, key)
              }
              onLookupByOperationId={(opId) => readProcurementOperation(chapterId, opId)}
              recentOperationHint={lastOpHint}
            />
          )}
        </>
      )}
    </div>
  );
}
