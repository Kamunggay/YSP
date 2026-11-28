import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { ContractApiError, formatManilaTime } from '../api/client.ts';
import {
  cancelRepf,
  createRepf,
  findProcurementOperationByKey,
  listRepfHistory,
  listRepfRelatedRecords,
  listRepfs,
  listReplenishmentNeeds,
  printRepf,
  readProcurementOperation,
  readRepf,
  readRepfVersion,
  replaceRepf,
  resumeRepfReview,
  reviewRepfBudget,
  reviseRepf,
  submitRepf,
} from '../api/stage2Client.ts';
import type {
  AdditionalPurchaseReason,
  ProcurementOperationName,
  Repf,
  RepfBudgetDecision,
  RepfHistoryEntry,
  RepfLineInput,
  RepfRelatedRecord,
  RepfStatus,
  RepfTriggerKind,
  RepfUrgency,
  ReplenishmentNeedItem,
  ReplenishmentTriggerFilter,
} from '../api/stage2Types.ts';
import type { ChapterAccessSnapshot, WorkspaceTab } from '../api/types.ts';
import { useStage2Candidates } from '../api/useStage2Candidates.ts';
import { NavFlowHeader } from '../components/NavFlowHeader.tsx';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker } from '../components/SearchableRecordPicker.tsx';
import type { SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
import { Stage2AuditPanels } from '../components/Stage2AuditPanels.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface ReplenishmentRepfWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  domainSignal?: number;
  chapterAccess: ChapterAccessSnapshot | null;
  previewEnabled: boolean;
  initialRepfId?: string | null;
  onNavigateTab: (tab: WorkspaceTab, opts?: { repfId?: string }) => void;
  onBackToDashboard?: () => void;
}

interface EditableRepfLine {
  key: string;
  trigger_kind: RepfTriggerKind;
  variant_id: string;
  unit_id: string;
  rf_id: string;
  rf_line_id: string;
  requested_quantity: string;
  estimated_unit_cost_php: string;
  needed_by: string;
  overrideEnabled: boolean;
  overrideCategory: AdditionalPurchaseReason['category'];
  overrideSourceIds: string[];
  overrideExplanation: string;
  notes: string;
}

interface SavedRepfDraft {
  editingRepfId?: string | null;
  urgency?: RepfUrgency;
  justification?: string;
  lines?: EditableRepfLine[];
}

function emptyLine(seed?: Partial<EditableRepfLine>): EditableRepfLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    trigger_kind: 'rop_replenishment',
    variant_id: '',
    unit_id: '',
    rf_id: '',
    rf_line_id: '',
    requested_quantity: '10',
    estimated_unit_cost_php: '100.00',
    needed_by: '',
    overrideEnabled: false,
    overrideCategory: 'late_supply',
    overrideSourceIds: [],
    overrideExplanation: '',
    notes: '',
    ...seed,
  };
}

export function ReplenishmentRepfWorkspace({
  userId,
  chapterId,
  refreshSignal,
  domainSignal = 0,
  chapterAccess,
  previewEnabled,
  initialRepfId = null,
  onNavigateTab,
  onBackToDashboard,
}: ReplenishmentRepfWorkspaceProps) {
  const formKey = 'stage2_repf_editor';
  const candidates = useStage2Candidates(chapterId, refreshSignal, previewEnabled, chapterAccess);
  const skipDraftSaveRef = useRef(false);

  const initialDraft = useMemo<SavedRepfDraft>(() => {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) return {};
    try {
      return JSON.parse(saved.payloadJson) as SavedRepfDraft;
    } catch {
      return {};
    }
  }, [chapterId, userId]);

  const [triggerFilter, setTriggerFilter] = useState<ReplenishmentTriggerFilter>('all');
  const [variantFilter, setVariantFilter] = useState('');
  const [needSearch, setNeedSearch] = useState('');
  const [needs, setNeeds] = useState<ReplenishmentNeedItem[]>([]);
  const [expandedNeedId, setExpandedNeedId] = useState<string | null>(null);

  const [repfStatusFilter, setRepfStatusFilter] = useState<string>('');
  const [repfSearch, setRepfSearch] = useState('');
  const [repfs, setRepfs] = useState<Repf[]>([]);
  const [selectedRepfId, setSelectedRepfId] = useState<string>(initialRepfId ?? '');
  const [selectedRepf, setSelectedRepf] = useState<Repf | null>(null);
  const [history, setHistory] = useState<RepfHistoryEntry[]>([]);
  const [related, setRelated] = useState<RepfRelatedRecord[]>([]);

  const [editingRepfId, setEditingRepfId] = useState<string | null>(
    initialDraft.editingRepfId ?? null,
  );
  const [urgency, setUrgency] = useState<RepfUrgency>(initialDraft.urgency ?? 'normal');
  const [justification, setJustification] = useState<string>(initialDraft.justification ?? '');
  const [lines, setLines] = useState<EditableRepfLine[]>(
    initialDraft.lines && initialDraft.lines.length > 0 ? initialDraft.lines : [emptyLine()],
  );
  const [duplicateConflictHint, setDuplicateConflictHint] = useState<string | null>(null);

  const [budgetDecision, setBudgetDecision] = useState<RepfBudgetDecision>('approve');
  const [transitionReason, setTransitionReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastOpHint, setLastOpHint] = useState<{
    operationName: string;
    actionKey: string;
    operationId?: string;
  } | null>(null);

  const canPrepare = !actionBlockReason(chapterAccess, 'repf.prepare');
  const canSubmit = !actionBlockReason(chapterAccess, 'repf.submit');
  const canReview = !actionBlockReason(chapterAccess, 'repf.budget_review');
  const canResume = !actionBlockReason(chapterAccess, 'repf.resume_review');
  const canRevise = !actionBlockReason(chapterAccess, 'repf.revise');
  const canCancel = !actionBlockReason(chapterAccess, 'repf.cancel');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [needRes, repfRes] = await Promise.all([
        listReplenishmentNeeds(chapterId, {
          trigger_filter: triggerFilter,
          variant_id: variantFilter || undefined,
          q: needSearch.trim() || undefined,
          limit: 50,
        }).catch(() => ({ data: [] as ReplenishmentNeedItem[], page: { next_cursor: null, snapshot_version: 1 } })),
        listRepfs(chapterId, {
          status: (repfStatusFilter || undefined) as RepfStatus | undefined,
          q: repfSearch.trim() || undefined,
          limit: 50,
        }),
      ]);
      setNeeds(needRes.data);
      setRepfs(repfRes.data);
      setSelectedRepfId((cur) => {
        if (initialRepfId && repfRes.data.some((r) => r.id === initialRepfId)) {
          return initialRepfId;
        }
        if (cur && repfRes.data.some((r) => r.id === cur)) {
          return cur;
        }
        return repfRes.data[0]?.id ?? '';
      });
    } catch (err) {
      setError(err);
    }
  }, [chapterId, initialRepfId, needSearch, repfSearch, repfStatusFilter, triggerFilter, variantFilter]);

  const loadSelectedDetail = useCallback(
    async (repfId: string) => {
      if (!repfId) {
        setSelectedRepf(null);
        setHistory([]);
        setRelated([]);
        return;
      }
      try {
        const [detail, histRes, relRes] = await Promise.all([
          readRepf(chapterId, repfId),
          listRepfHistory(chapterId, repfId, { limit: 50 }),
          listRepfRelatedRecords(chapterId, repfId, { limit: 50 }),
        ]);
        setSelectedRepf(detail);
        setHistory(histRes.data);
        setRelated(relRes.data);
      } catch (err) {
        setError(err);
      }
    },
    [chapterId],
  );

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadSelectedDetail(selectedRepfId);
  }, [loadSelectedDetail, selectedRepfId, refreshSignal, domainSignal]);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const payload: SavedRepfDraft = { editingRepfId, urgency, justification, lines };
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: 'RepF Draft',
      baseVersion: selectedRepf?.version ?? null,
      pendingActionKey,
      payloadJson: JSON.stringify(payload),
    });
  }, [chapterId, editingRepfId, justification, lines, urgency, userId]);

  const repfOptions = useMemo<Array<SearchablePickerOption<Repf>>>(
    () =>
      repfs.map((r) => ({
        id: r.id,
        primaryLabel: `${r.repf_reference ?? 'Draft RepF'} · PHP ${r.estimated_total_php}`,
        secondaryLabel: `${r.trigger_kinds.join(' + ')} · ${r.justification.slice(0, 72)}`,
        badge: r.linked_demand_canceled
          ? 'Demand Changed'
          : r.status.replaceAll('_', ' '),
        badgeTone: r.linked_demand_canceled
          ? 'danger'
          : r.status === 'approved' || r.status === 'partially_ordered'
            ? 'ready'
            : r.status === 'held' || r.status === 'returned_for_revision'
              ? 'warning'
              : 'neutral',
        searchText: `${r.repf_reference ?? ''} ${r.justification} ${r.lines.map((l) => l.variant_code).join(' ')}`,
        meta: r,
      })),
    [repfs],
  );

  const needsByVariant = useMemo(() => new Map(needs.map((n) => [n.variant_id, n])), [needs]);

  function handleSeedFromNeed(need: ReplenishmentNeedItem) {
    const nextLines: EditableRepfLine[] = [];
    const rfShort = Number.parseFloat(need.uncovered_rf_shortage_quantity);
    const ropShort = Number.parseFloat(need.uncovered_rop_replenishment_quantity);
    if (rfShort > 0) {
      const topRf = need.contributing_rf_lines[0];
      nextLines.push(
        emptyLine({
          trigger_kind: 'rf_shortage',
          variant_id: need.variant_id,
          unit_id: need.unit_id,
          rf_id: topRf?.rf_id ?? '',
          rf_line_id: topRf?.rf_line_id ?? '',
          requested_quantity: need.uncovered_rf_shortage_quantity,
          needed_by: topRf?.needed_at?.slice(0, 10) ?? '',
          notes: `Uncovered RF shortage for ${need.variant_code}`,
        }),
      );
    }
    if (ropShort > 0 || nextLines.length === 0) {
      nextLines.push(
        emptyLine({
          trigger_kind: 'rop_replenishment',
          variant_id: need.variant_id,
          unit_id: need.unit_id,
          requested_quantity:
            ropShort > 0 ? need.uncovered_rop_replenishment_quantity : '10',
          notes: `Non-overlapping ROP replenishment to target level ${need.approved_target_level ?? '—'}`,
        }),
      );
    }
    setEditingRepfId(null);
    setUrgency(rfShort > 0 ? 'urgent' : 'normal');
    setJustification(
      `Replenish ${need.variant_code} (${need.display_name}) covering ${need.proposed_uncovered_quantity} ${need.unit_code} uncovered need.`,
    );
    setLines(nextLines);
    setDuplicateConflictHint(null);
    setStatusMessage(`Drafted RepF lines from ${need.variant_code} net-shortage calculation.`);
  }

  function handleLoadSelectedForEdit(repf: Repf) {
    setEditingRepfId(repf.id);
    setUrgency(repf.urgency);
    setJustification(repf.justification);
    setLines(
      repf.lines.map((l) => ({
        key: l.id,
        trigger_kind: l.trigger_kind,
        variant_id: l.variant_id,
        unit_id: l.unit_id,
        rf_id: l.rf_id ?? '',
        rf_line_id: l.rf_line_id ?? '',
        requested_quantity: l.requested_quantity,
        estimated_unit_cost_php: l.estimated_unit_cost_php,
        needed_by: l.needed_by ? l.needed_by.slice(0, 10) : '',
        overrideEnabled: Boolean(l.additional_purchase_reason),
        overrideCategory: l.additional_purchase_reason?.category ?? 'late_supply',
        overrideSourceIds: l.additional_purchase_reason?.referenced_source_ids ?? [],
        overrideExplanation: l.additional_purchase_reason?.explanation ?? '',
        notes: l.notes ?? '',
      })),
    );
    setDuplicateConflictHint(null);
  }

  function updateLine(key: string, patch: Partial<EditableRepfLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function buildLineInputs(): RepfLineInput[] {
    return lines.map((l) => ({
      trigger_kind: l.trigger_kind,
      variant_id: l.variant_id,
      unit_id: l.unit_id,
      rf_id: l.trigger_kind === 'rf_shortage' && l.rf_id ? l.rf_id : null,
      rf_line_id: l.trigger_kind === 'rf_shortage' && l.rf_line_id ? l.rf_line_id : null,
      requested_quantity: l.requested_quantity.trim(),
      estimated_unit_cost_php: l.estimated_unit_cost_php.trim(),
      needed_by: l.needed_by.trim() ? `${l.needed_by.trim()}T01:00:00.000000Z` : null,
      additional_purchase_reason: l.overrideEnabled
        ? {
            category: l.overrideCategory,
            referenced_source_ids: l.overrideSourceIds,
            explanation: l.overrideExplanation.trim(),
          }
        : null,
      notes: l.notes.trim() || null,
    }));
  }

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    setDuplicateConflictHint(null);
    try {
      const payloadLines = buildLineInputs();
      if (editingRepfId && selectedRepf && selectedRepf.id === editingRepfId) {
        const { data, actionKey } = await replaceRepf(chapterId, editingRepfId, {
          expected_version: selectedRepf.version,
          expected_material_version: selectedRepf.material_version,
          funding_source: 'chapter_funds',
          urgency,
          justification: justification.trim(),
          lines: payloadLines,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'replaceRepf',
          actionKey,
          operationId: data.operation_id,
        });
        setStatusMessage(`Updated RepF revision v${data.result.version}.`);
        setSelectedRepfId(data.result.id);
      } else {
        const { data, actionKey } = await createRepf(chapterId, {
          funding_source: 'chapter_funds',
          urgency,
          justification: justification.trim(),
          lines: payloadLines,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'createRepf',
          actionKey,
          operationId: data.operation_id,
        });
        setEditingRepfId(data.result.id);
        setSelectedRepfId(data.result.id);
        setStatusMessage('Created draft RepF without deducting stock.');
      }
      skipDraftSaveRef.current = true;
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(false);
      await loadData();
    } catch (err) {
      if (err instanceof ContractApiError && err.code === 'duplicate_supply_coverage') {
        setDuplicateConflictHint(
          'Requested quantity exceeds uncovered need due to open inbound coverage. Enable "Additional Purchase Reason" on the exceeding line(s) — your unsaved draft has been preserved.',
        );
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runLifecycleAction(
    opName: ProcurementOperationName,
    fn: () => Promise<{ data: { operation_id: string; result: Repf }; actionKey: string }>,
    msg: string,
  ) {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    setDuplicateConflictHint(null);
    try {
      const { data, actionKey } = await fn();
      setPendingActionKey(actionKey);
      setLastOpHint({ operationName: opName, actionKey, operationId: data.operation_id });
      setStatusMessage(msg);
      setTransitionReason('');
      await loadData();
      await loadSelectedDetail(data.result.id);
    } catch (err) {
      if (err instanceof ContractApiError && err.code === 'duplicate_supply_coverage') {
        setDuplicateConflictHint(
          'Submit blocked by existing open inbound supply coverage. Edit the RepF line with an Additional Purchase Reason (late, disputed, or ineligible supply) and save before re-submitting.',
        );
        if (selectedRepf) {
          handleLoadSelectedForEdit(selectedRepf);
          setLines((prev) => prev.map((line) => ({ ...line, overrideEnabled: true })));
        }
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const estimatedDraftTotal = useMemo(
    () =>
      lines
        .reduce((acc, l) => {
          const q = Number.parseFloat(l.requested_quantity) || 0;
          const p = Number.parseFloat(l.estimated_unit_cost_php) || 0;
          return acc + q * p;
        }, 0)
        .toFixed(2),
    [lines],
  );

  return (
    <div className="workspace-stack">
      <NavFlowHeader
        headingId="repf-heading"
        title="Replenishment & Purchase Requisitions (RepF)"
        subtitle="Review net shortages without double-counting, draft multi-trigger requisitions, and complete independent budget review."
        onBack={onBackToDashboard}
      />

      <OperationBanner
        error={error}
        statusMessage={statusMessage}
        replayed={replayed}
        pendingActionKey={pendingActionKey}
      />

      {duplicateConflictHint && (
        <div className="s2-inline-alert is-warning" role="alert">
          <strong>Duplicate Supply Coverage Check:</strong> {duplicateConflictHint}
        </div>
      )}

      {/* Section A: Net Shortage & ROP Replenishment Needs */}
      <section className="surface-card s2-section-card">
        <div className="s2-panel-header">
          <div>
            <h2 className="s2-panel-title">Live Net Shortage &amp; ROP Replenishment Needs</h2>
            <p className="s2-panel-sub">
              Computes RF unreserved shortages alongside non-overlapping ROP top-ups, separating counted inbound coverage from late or disputed orders.
            </p>
          </div>
          <button
            type="button"
            className="btn-batcave-secondary p02-compact-btn"
            onClick={() => void loadData()}
          >
            Refresh Needs
          </button>
        </div>

        <div className="s2-grid-3">
          <div className="form-group">
            <label className="form-label" htmlFor="need-trig">
              Trigger Filter
            </label>
            <select
              id="need-trig"
              className="form-control"
              value={triggerFilter}
              onChange={(e) => setTriggerFilter(e.target.value as ReplenishmentTriggerFilter)}
            >
              <option value="all">All SKUs in scope</option>
              <option value="uncovered_only">Uncovered shortage only</option>
              <option value="rf_shortage">RF demand shortage</option>
              <option value="rop_breach">Low stock (ROP breach)</option>
            </select>
          </div>
          <SearchableRecordPicker
            id="repf-need-variant-picker"
            label="Filter by Variant"
            valueId={variantFilter}
            options={candidates.variantOptions}
            onSelect={(opt) => setVariantFilter(opt?.id ?? '')}
            placeholder="All variants..."
          />
          <div className="form-group">
            <label className="form-label" htmlFor="need-search">
              Search Catalogue
            </label>
            <input
              id="need-search"
              className="form-control"
              value={needSearch}
              onChange={(e) => setNeedSearch(e.target.value)}
              placeholder="Code or item name..."
            />
          </div>
        </div>

        {needs.length === 0 ? (
          <p className="s2-empty-hint">
            No replenishment needs match the current filter. When an approved RF lacks stock or usable stock drops below ROP, items appear here.
          </p>
        ) : (
          <div className="s2-table-wrap">
            <table className="s2-table">
              <thead>
                <tr>
                  <th>SKU / Variant</th>
                  <th>Usable / Free</th>
                  <th>ROP / Target</th>
                  <th>RF Shortage</th>
                  <th>Inbound (Counted / Excl.)</th>
                  <th>Net Uncovered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {needs.map((need) => (
                  <tr key={need.variant_id}>
                    <td>
                      <strong>{need.variant_code}</strong>
                      <div className="s2-muted-sm">{need.display_name}</div>
                      {need.setup_blockers.length > 0 && (
                        <span className="s2-badge is-warning">Setup blocker present</span>
                      )}
                    </td>
                    <td>
                      {need.usable_stockroom_on_hand} / {need.eligible_available_to_allocate}{' '}
                      {need.unit_code}
                    </td>
                    <td>
                      {need.approved_rop ?? '—'} / {need.approved_target_level ?? '—'}
                    </td>
                    <td>{need.unreserved_approved_rf_shortage}</td>
                    <td>
                      {need.total_open_inbound_coverage} / {need.excluded_inbound_quantity}
                    </td>
                    <td>
                      <span
                        className={`s2-badge ${
                          Number.parseFloat(need.proposed_uncovered_quantity) > 0
                            ? 'is-warning'
                            : 'is-ready'
                        }`}
                      >
                        {need.proposed_uncovered_quantity} {need.unit_code}
                      </span>
                      <div className="s2-muted-sm">
                        RF {need.uncovered_rf_shortage_quantity} + ROP{' '}
                        {need.uncovered_rop_replenishment_quantity}
                      </div>
                    </td>
                    <td>
                      <div className="s2-inline-actions">
                        <button
                          type="button"
                          className="btn-batcave-primary p02-compact-btn"
                          disabled={!canPrepare}
                          onClick={() => handleSeedFromNeed(need)}
                        >
                          Draft RepF
                        </button>
                        <button
                          type="button"
                          className="btn-batcave-secondary p02-compact-btn"
                          onClick={() =>
                            setExpandedNeedId((cur) =>
                              cur === need.variant_id ? null : need.variant_id,
                            )
                          }
                        >
                          {expandedNeedId === need.variant_id ? 'Hide Math' : 'Breakdown'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expandedNeedId && needsByVariant.get(expandedNeedId) && (
          <div className="s2-breakdown-box">
            {(() => {
              const n = needsByVariant.get(expandedNeedId)!;
              return (
                <>
                  <h4>{n.variant_code} — Contributing RF Lines &amp; Inbound Sources</h4>
                  <div className="s2-grid-2">
                    <div>
                      <strong>Contributing RFs ({n.contributing_rf_lines.length})</strong>
                      {n.contributing_rf_lines.length === 0 ? (
                        <p className="s2-muted-sm">No unreserved approved RF shortage lines.</p>
                      ) : (
                        <ul className="s2-compact-list">
                          {n.contributing_rf_lines.map((rl) => (
                            <li key={rl.rf_line_id}>
                              <strong>{rl.rf_reference}</strong> · Need{' '}
                              {rl.unreserved_outstanding_quantity} (Due{' '}
                              {formatManilaTime(rl.needed_at)})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <strong>Inbound Coverage ({n.inbound_sources.length})</strong>
                      {n.inbound_sources.length === 0 ? (
                        <p className="s2-muted-sm">No open RepF or PO inbound coverage.</p>
                      ) : (
                        <ul className="s2-compact-list">
                          {n.inbound_sources.map((src) => (
                            <li key={src.source_id}>
                              <span
                                className={`s2-badge ${
                                  src.coverage_state === 'counted' ? 'is-ready' : 'is-warning'
                                }`}
                              >
                                {src.coverage_state}
                              </span>{' '}
                              <strong>{src.source_reference}</strong> ({src.open_quantity} {n.unit_code})
                              {src.exclusion_reason ? ` — ${src.exclusion_reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </section>

      {/* Section B: Existing RepFs & Detail + Budget Review */}
      <section className="surface-card s2-section-card">
        <div className="s2-panel-header">
          <div>
            <h2 className="s2-panel-title">Chapter Replenishment Requisitions (RepF)</h2>
            <p className="s2-panel-sub">
              Search and inspect RepFs, check linked-demand cancellation alerts, and execute budget decisions.
            </p>
          </div>
          {selectedRepf &&
            (selectedRepf.status === 'approved' || selectedRepf.status === 'partially_ordered') && (
              <button
                type="button"
                className="btn-batcave-primary p02-compact-btn"
                onClick={() => onNavigateTab('quotations_po', { repfId: selectedRepf.id })}
              >
                Open Quotations &amp; POs →
              </button>
            )}
        </div>

        <div className="s2-grid-3">
          <SearchableRecordPicker
            id="repf-record-picker"
            label="Select Requisition (RepF)"
            valueId={selectedRepfId}
            options={repfOptions}
            onSelect={(opt) => setSelectedRepfId(opt?.id ?? '')}
            placeholder="Pick RepF by reference, status, or justification..."
          />
          <div className="form-group">
            <label className="form-label" htmlFor="repf-status-filter">
              Status Filter
            </label>
            <select
              id="repf-status-filter"
              className="form-control"
              value={repfStatusFilter}
              onChange={(e) => setRepfStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_budget_review">Pending Budget Review</option>
              <option value="held">Held</option>
              <option value="returned_for_revision">Returned for Revision</option>
              <option value="approved">Approved</option>
              <option value="partially_ordered">Partially Ordered</option>
              <option value="ordered">Ordered</option>
              <option value="rejected">Rejected</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="repf-q">
              Catalogue Search
            </label>
            <input
              id="repf-q"
              className="form-control"
              value={repfSearch}
              onChange={(e) => setRepfSearch(e.target.value)}
              placeholder="Filter RepFs..."
            />
          </div>
        </div>

        {selectedRepf && (
          <div className="s2-detail-panel">
            {selectedRepf.linked_demand_canceled && (
              <div className="s2-inline-alert is-danger" role="alert">
                <strong>Linked Demand Canceled:</strong> An originating RF linked to one or more lines on this RepF was canceled. Review before ordering or cancel the unordered remainder.
              </div>
            )}

            <div className="s2-meta-grid">
              <div>
                <span className="s2-muted-sm">Reference</span>
                <div>
                  <strong>{selectedRepf.repf_reference ?? 'Unnumbered Draft'}</strong>
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Status</span>
                <div>
                  <span className="s2-badge">{selectedRepf.status.replaceAll('_', ' ')}</span>
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Urgency / Funding</span>
                <div>
                  {selectedRepf.urgency} · Chapter Funds
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Estimated / Approved Budget</span>
                <div>
                  PHP {selectedRepf.estimated_total_php} /{' '}
                  {selectedRepf.approved_budget_php ? `PHP ${selectedRepf.approved_budget_php}` : '—'}
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Revision</span>
                <div>
                  v{selectedRepf.version} (material m{selectedRepf.material_version})
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Preparer / Reviewer</span>
                <div>
                  {selectedRepf.preparer.display_name}
                  {selectedRepf.budget_reviewer
                    ? ` → ${selectedRepf.budget_reviewer.display_name}`
                    : ''}
                </div>
              </div>
            </div>

            <div className="s2-table-wrap">
              <table className="s2-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Trigger / RF</th>
                    <th>Variant</th>
                    <th>Requested</th>
                    <th>Ordered</th>
                    <th>Remaining</th>
                    <th>Est. PHP</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRepf.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.line_number}</td>
                      <td>
                        {line.trigger_kind.replaceAll('_', ' ')}
                        {line.rf_reference && <div className="s2-muted-sm">{line.rf_reference}</div>}
                        {line.linked_demand_canceled && (
                          <span className="s2-badge is-danger">RF Canceled</span>
                        )}
                      </td>
                      <td>
                        <strong>{line.variant_code}</strong>
                        <div className="s2-muted-sm">{line.display_name}</div>
                      </td>
                      <td>
                        {line.requested_quantity} {line.unit_code}
                      </td>
                      <td>{line.ordered_quantity}</td>
                      <td>{line.remaining_to_order_quantity}</td>
                      <td>PHP {line.estimated_line_total_php}</td>
                      <td>
                        {line.additional_purchase_reason
                          ? line.additional_purchase_reason.category.replaceAll('_', ' ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Workflow transitions */}
            <div className="s2-action-bar">
              {(selectedRepf.status === 'draft' ||
                selectedRepf.status === 'returned_for_revision') && (
                <>
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canPrepare || busy}
                    onClick={() => handleLoadSelectedForEdit(selectedRepf)}
                  >
                    Load into Editor
                  </button>
                  {selectedRepf.status === 'draft' && (
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={!canSubmit || busy}
                      onClick={() =>
                        void runLifecycleAction(
                          'submitRepf',
                          () =>
                            submitRepf(chapterId, selectedRepf.id, {
                              expected_version: selectedRepf.version,
                              expected_material_version: selectedRepf.material_version,
                            }),
                          'Submitted RepF for independent budget review.',
                        )
                      }
                    >
                      Submit for Budget Review
                    </button>
                  )}
                  {selectedRepf.status === 'returned_for_revision' && (
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={!canRevise || busy}
                      onClick={() =>
                        void runLifecycleAction(
                          'reviseRepf',
                          () =>
                            reviseRepf(chapterId, selectedRepf.id, {
                              expected_version: selectedRepf.version,
                              expected_material_version: selectedRepf.material_version,
                              reason: transitionReason.trim() || 'Revising returned RepF.',
                            }),
                          'Moved RepF back to editable Draft status.',
                        )
                      }
                    >
                      Move to Draft for Revision
                    </button>
                  )}
                </>
              )}

              {selectedRepf.status === 'held' && (
                <button
                  type="button"
                  className="btn-batcave-primary p02-compact-btn"
                  disabled={!canResume || busy || !transitionReason.trim()}
                  onClick={() =>
                    void runLifecycleAction(
                      'resumeRepfReview',
                      () =>
                        resumeRepfReview(chapterId, selectedRepf.id, {
                          expected_version: selectedRepf.version,
                          expected_material_version: selectedRepf.material_version,
                          reason: transitionReason.trim(),
                        }),
                      'Resumed budget review on held RepF.',
                    )
                  }
                >
                  Resume Review
                </button>
              )}

              {selectedRepf.status !== 'canceled' &&
                selectedRepf.status !== 'rejected' &&
                selectedRepf.status !== 'ordered' && (
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canCancel || busy || !transitionReason.trim()}
                    onClick={() =>
                      void runLifecycleAction(
                        'cancelRepf',
                        () =>
                          cancelRepf(chapterId, selectedRepf.id, {
                            expected_version: selectedRepf.version,
                            expected_material_version: selectedRepf.material_version,
                            reason: transitionReason.trim(),
                          }),
                        'Canceled RepF unordered remainder.',
                      )
                    }
                  >
                    Cancel Unordered Remainder
                  </button>
                )}
            </div>

            <div className="s2-review-strip">
              <div className="form-group">
                <label className="form-label" htmlFor="repf-action-reason">
                  Decision / Revision / Cancel Reason
                </label>
                <input
                  id="repf-action-reason"
                  className="form-control"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  placeholder="Required for hold, return, reject, resume, revise, or cancel..."
                />
              </div>

              {selectedRepf.status === 'pending_budget_review' && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="repf-decision">
                      Independent Budget Decision
                    </label>
                    <select
                      id="repf-decision"
                      className="form-control"
                      value={budgetDecision}
                      onChange={(e) => setBudgetDecision(e.target.value as RepfBudgetDecision)}
                    >
                      <option value="approve">Approve Budget</option>
                      <option value="hold">Hold Review</option>
                      <option value="return">Return for Revision</option>
                      <option value="reject">Reject RepF</option>
                    </select>
                  </div>
                  <div className="s2-align-end">
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={
                        !canReview ||
                        busy ||
                        (budgetDecision !== 'approve' && !transitionReason.trim())
                      }
                      onClick={() =>
                        void runLifecycleAction(
                          'reviewRepfBudget',
                          () =>
                            reviewRepfBudget(chapterId, selectedRepf.id, {
                              expected_version: selectedRepf.version,
                              expected_material_version: selectedRepf.material_version,
                              decision: budgetDecision,
                              reason: transitionReason.trim() || null,
                            }),
                          `Recorded budget review decision: ${budgetDecision}.`,
                        )
                      }
                    >
                      Record Budget Decision
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Section C: Multi-Trigger RepF Draft Builder */}
      <section className="surface-card s2-section-card">
        <div className="s2-panel-header">
          <div>
            <h2 className="s2-panel-title">
              {editingRepfId ? 'Edit Draft RepF' : 'Create Chapter-Funded RepF Draft'}
            </h2>
            <p className="s2-panel-sub">
              Estimated draft total: <strong>PHP {estimatedDraftTotal}</strong> · Unsaved edits stay preserved in RAM across refreshes.
            </p>
          </div>
          <button
            type="button"
            className="btn-batcave-secondary p02-compact-btn"
            onClick={() => {
              setEditingRepfId(null);
              setUrgency('normal');
              setJustification('');
              setLines([emptyLine()]);
              setDuplicateConflictHint(null);
              memoryDraftStore.clearDraft(userId, chapterId, formKey);
            }}
          >
            New Blank Draft
          </button>
        </div>

        <form onSubmit={(e) => void handleSaveDraft(e)} className="s2-form-stack">
          <div className="s2-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="repf-urgency">
                Urgency
              </label>
              <select
                id="repf-urgency"
                className="form-control"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as RepfUrgency)}
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="repf-just">
                Justification
              </label>
              <input
                id="repf-just"
                className="form-control"
                required
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain operational demand or ROP replenishment basis..."
              />
            </div>
          </div>

          {lines.map((line, index) => {
            const matchedNeed = line.variant_id ? needsByVariant.get(line.variant_id) : undefined;
            const rfRecord = candidates.rfs.find((r) => r.id === line.rf_id);
            const rfLineOptions: Array<SearchablePickerOption<string>> = (rfRecord?.lines ?? []).map(
              (rl) => ({
                id: rl.id,
                primaryLabel: `${candidates.describeVariant(rl.variant_id)} (${rl.unreserved_outstanding_quantity ?? rl.approved_quantity ?? '?'} open)`,
                secondaryLabel: rl.id,
                meta: rl.id,
              }),
            );
            const sourceOptions: Array<SearchablePickerOption<string>> = (
              matchedNeed?.inbound_sources ?? []
            ).map((s) => ({
              id: s.source_id,
              primaryLabel: `${s.source_reference} (${s.open_quantity}, ${s.coverage_state})`,
              secondaryLabel: s.exclusion_reason ?? s.status,
              meta: s.source_id,
            }));

            return (
              <div key={line.key} className="s2-line-card">
                <div className="s2-line-head">
                  <strong>Line #{index + 1}</strong>
                  {matchedNeed && (
                    <span className="s2-muted-sm">
                      Uncovered net need: {matchedNeed.proposed_uncovered_quantity}{' '}
                      {matchedNeed.unit_code}
                    </span>
                  )}
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="btn-batcave-secondary p02-compact-btn"
                      onClick={() =>
                        setLines((prev) => prev.filter((item) => item.key !== line.key))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="s2-grid-3">
                  <div className="form-group">
                    <label className="form-label">Trigger Kind</label>
                    <select
                      className="form-control"
                      value={line.trigger_kind}
                      onChange={(e) =>
                        updateLine(line.key, {
                          trigger_kind: e.target.value as RepfTriggerKind,
                          rf_id: '',
                          rf_line_id: '',
                        })
                      }
                    >
                      <option value="rf_shortage">Approved RF Shortage</option>
                      <option value="rop_replenishment">ROP Replenishment</option>
                    </select>
                  </div>

                  <SearchableRecordPicker
                    id={`repf-line-var-${line.key}`}
                    label="Item Variant"
                    valueId={line.variant_id}
                    options={candidates.variantOptions}
                    onSelect={(opt) =>
                      updateLine(line.key, {
                        variant_id: opt?.id ?? '',
                        unit_id: opt?.meta.default_unit_id ?? line.unit_id,
                      })
                    }
                    required
                    placeholder="Select SKU variant..."
                  />

                  <SearchableRecordPicker
                    id={`repf-line-unit-${line.key}`}
                    label="Unit"
                    valueId={line.unit_id}
                    options={candidates.unitOptions}
                    onSelect={(opt) => updateLine(line.key, { unit_id: opt?.id ?? '' })}
                    required
                    placeholder="Select unit..."
                  />
                </div>

                {line.trigger_kind === 'rf_shortage' && (
                  <div className="s2-grid-2">
                    <SearchableRecordPicker
                      id={`repf-line-rf-${line.key}`}
                      label="Linked Approved Internal RF"
                      valueId={line.rf_id}
                      options={candidates.rfOptions}
                      onSelect={(opt) =>
                        updateLine(line.key, { rf_id: opt?.id ?? '', rf_line_id: '' })
                      }
                      placeholder="Select contributing RF..."
                    />
                    <SearchableRecordPicker
                      id={`repf-line-rfline-${line.key}`}
                      label="Linked RF Line"
                      valueId={line.rf_line_id}
                      options={rfLineOptions}
                      onSelect={(opt) =>
                        updateLine(line.key, { rf_line_id: opt?.id ?? '' })
                      }
                      disabled={!line.rf_id}
                      placeholder="Select RF line..."
                    />
                  </div>
                )}

                <div className="s2-grid-3">
                  <div className="form-group">
                    <label className="form-label">Requested Quantity</label>
                    <input
                      className="form-control"
                      required
                      value={line.requested_quantity}
                      onChange={(e) =>
                        updateLine(line.key, { requested_quantity: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Est. Unit Cost (PHP)</label>
                    <input
                      className="form-control"
                      required
                      value={line.estimated_unit_cost_php}
                      onChange={(e) =>
                        updateLine(line.key, { estimated_unit_cost_php: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Needed By (Date)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={line.needed_by}
                      onChange={(e) => updateLine(line.key, { needed_by: e.target.value })}
                    />
                  </div>
                </div>

                <label className="s2-check-row">
                  <input
                    type="checkbox"
                    checked={line.overrideEnabled}
                    onChange={(e) =>
                      updateLine(line.key, { overrideEnabled: e.target.checked })
                    }
                  />
                  Include Additional Purchase Reason (override duplicate inbound coverage check)
                </label>

                {line.overrideEnabled && (
                  <div className="s2-override-box">
                    <div className="s2-grid-2">
                      <div className="form-group">
                        <label className="form-label">Override Category</label>
                        <select
                          className="form-control"
                          value={line.overrideCategory}
                          onChange={(e) =>
                            updateLine(line.key, {
                              overrideCategory: e.target
                                .value as AdditionalPurchaseReason['category'],
                            })
                          }
                        >
                          <option value="late_supply">Late Inbound Supply</option>
                          <option value="disputed_supply">Disputed / Quarantined Supply</option>
                          <option value="ineligible_supply">Ineligible Restricted Supply</option>
                        </select>
                      </div>
                      <SearchableRecordPicker
                        id={`repf-line-src-${line.key}`}
                        label="Referenced Blocking Source (optional)"
                        valueId={line.overrideSourceIds[0] ?? ''}
                        options={sourceOptions}
                        onSelect={(opt) =>
                          updateLine(line.key, {
                            overrideSourceIds: opt?.id ? [opt.id] : [],
                          })
                        }
                        placeholder="Select existing inbound source..."
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Override Explanation</label>
                      <input
                        className="form-control"
                        required
                        value={line.overrideExplanation}
                        onChange={(e) =>
                          updateLine(line.key, { overrideExplanation: e.target.value })
                        }
                        placeholder="Explain why additional purchase is necessary despite open coverage..."
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="s2-action-bar">
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              + Add RepF Line
            </button>
            <button
              type="submit"
              className="btn-batcave-primary"
              disabled={!canPrepare || busy}
            >
              {busy ? 'Saving...' : editingRepfId ? 'Replace Draft RepF' : 'Save New Draft RepF'}
            </button>
          </div>
        </form>
      </section>

      {selectedRepf && (
        <Stage2AuditPanels
          title={selectedRepf.repf_reference ?? 'Draft RepF'}
          recordVersion={selectedRepf.version}
          history={history.map((h) => ({
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
          related={related.map((r) => ({
            kind: r.kind,
            id: r.id,
            reference: r.reference,
            state: r.state,
            materialVersion: r.material_version,
            lineRef: r.repf_line_id,
            warning: r.linked_demand_canceled ? 'Demand Canceled' : null,
          }))}
          onRefreshAudit={() => loadSelectedDetail(selectedRepf.id)}
          onLoadVersion={(ver) => readRepfVersion(chapterId, selectedRepf.id, ver)}
          onLoadPrintHtml={() => printRepf(chapterId, selectedRepf.id)}
          onOpenRelated={(kind) => {
            if (kind === 'quotation' || kind === 'purchase_order') {
              onNavigateTab('quotations_po', { repfId: selectedRepf.id });
            }
          }}
          recoveryOperations={[
            { value: 'createRepf', label: 'Create RepF Draft' },
            { value: 'replaceRepf', label: 'Replace RepF Draft' },
            { value: 'submitRepf', label: 'Submit RepF' },
            { value: 'reviewRepfBudget', label: 'Budget Review Decision' },
            { value: 'cancelRepf', label: 'Cancel RepF' },
          ]}
          onLookupByActionKey={(op, key) =>
            findProcurementOperationByKey(chapterId, op as ProcurementOperationName, key)
          }
          onLookupByOperationId={(opId) => readProcurementOperation(chapterId, opId)}
          recentOperationHint={lastOpHint}
        />
      )}
    </div>
  );
}
