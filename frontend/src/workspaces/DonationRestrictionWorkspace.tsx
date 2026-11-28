import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { ContractApiError, formatManilaTime } from '../api/client.ts';
import {
  acknowledgeDonation,
  cancelDonation,
  closeShortDonation,
  createDonation,
  declineDonation,
  findDonationOperation,
  listDonationHistory,
  listDonationRelated,
  listDonations,
  printDonation,
  readDonation,
  readDonationOperation,
  readDonationVersion,
  replaceDonation,
  resolveDonationRestriction,
  returnDonation,
  reviseDonation,
  submitDonation,
} from '../api/stage2Client.ts';
import type {
  BoundedRestriction,
  Donation,
  DonationHistoryEntry,
  DonationLineInput,
  DonationMutationName,
  DonationRelatedEntry,
  DonationStatus,
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

interface DonationRestrictionWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  domainSignal?: number;
  chapterAccess: ChapterAccessSnapshot | null;
  previewEnabled: boolean;
  initialDaId?: string | null;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onBackToDashboard?: () => void;
}

interface EditableDonationLine {
  key: string;
  variant_id: string;
  unit_id: string;
  pledged_quantity: string;
  condition_notes: string;
  valuation_kind: 'declared' | 'estimated';
  unit_value_php: string;
  valuation_basis: string;
  restrictions: BoundedRestriction;
}

const ALLOWED_USE_CHOICES = [
  { value: 'internal_use', label: 'Internal Use / Distribution' },
  { value: 'booth_custody', label: 'Booth Custody / Event Issue' },
  { value: 'sale', label: 'Authorized Sale Eligible' },
] as const;

function emptyRestriction(): BoundedRestriction {
  return {
    state: 'unrestricted',
    allowed_uses: [],
    event_ids: [],
    requesting_unit_ids: [],
    effective_from: null,
    effective_until: null,
    interpretation_id: null,
    source_condition_reference: null,
  };
}

function emptyDaLine(seed?: Partial<EditableDonationLine>): EditableDonationLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    variant_id: '',
    unit_id: '',
    pledged_quantity: '10',
    condition_notes: 'New, sealed',
    valuation_kind: 'declared',
    unit_value_php: '150.00',
    valuation_basis: 'Chapter comparative valuation',
    restrictions: emptyRestriction(),
    ...seed,
  };
}

export function DonationRestrictionWorkspace({
  userId,
  chapterId,
  refreshSignal,
  domainSignal = 0,
  chapterAccess,
  previewEnabled,
  initialDaId = null,
  onNavigateTab,
  onBackToDashboard,
}: DonationRestrictionWorkspaceProps) {
  const formKey = 'stage2_da_editor';
  const candidates = useStage2Candidates(chapterId, refreshSignal, previewEnabled, chapterAccess);
  const skipSaveRef = useRef(false);

  const savedDraft = useMemo<{
    editingDaId?: string | null;
    donorName?: string;
    lines?: EditableDonationLine[];
  }>(() => {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) return {};
    try {
      return JSON.parse(saved.payloadJson) as {
        editingDaId?: string | null;
        donorName?: string;
        lines?: EditableDonationLine[];
      };
    } catch {
      return {};
    }
  }, [chapterId, userId]);

  const [statusFilter, setStatusFilter] = useState('');
  const [donations, setDonations] = useState<Donation[]>([]);
  const [selectedDaId, setSelectedDaId] = useState<string>(initialDaId ?? '');
  const [selectedDa, setSelectedDa] = useState<Donation | null>(null);
  const [history, setHistory] = useState<DonationHistoryEntry[]>([]);
  const [related, setRelated] = useState<DonationRelatedEntry[]>([]);

  // Draft Editor State
  const [editingDaId, setEditingDaId] = useState<string | null>(savedDraft.editingDaId ?? null);
  const [donorName, setDonorName] = useState(savedDraft.donorName ?? '');
  const [lines, setLines] = useState<EditableDonationLine[]>(
    savedDraft.lines && savedDraft.lines.length > 0 ? savedDraft.lines : [emptyDaLine()],
  );

  // Sign-off & Transition State
  const [ackEvidence, setAckEvidence] = useState<Stage2EvidenceByteBinding | null>(null);
  const [ackConfirmed, setAckConfirmed] = useState(false);
  const [reasonInput, setReasonInput] = useState('');

  // ADR 0004 Restriction Resolution State
  const [resLineId, setResLineId] = useState('');
  const [resKind, setResKind] = useState<'apply' | 'audit_review'>('apply');
  const [resTargetRestriction, setResTargetRestriction] =
    useState<BoundedRestriction>(emptyRestriction());
  const [resReason, setResReason] = useState('');
  const [resEvidence, setResEvidence] = useState<Stage2EvidenceByteBinding | null>(null);
  const [resConfirmed, setResConfirmed] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [lastOpHint, setLastOpHint] = useState<{
    operationName: string;
    actionKey: string;
    operationId?: string;
  } | null>(null);

  const canPrepare = !actionBlockReason(chapterAccess, 'donation.prepare');
  const canSubmit = !actionBlockReason(chapterAccess, 'donation.submit');
  const canAck = !actionBlockReason(chapterAccess, 'donation.acknowledge');
  const canReturn = !actionBlockReason(chapterAccess, 'donation.return');
  const canDecline = !actionBlockReason(chapterAccess, 'donation.decline');
  const canRevise = !actionBlockReason(chapterAccess, 'donation.revise');
  const canCloseShort = !actionBlockReason(chapterAccess, 'donation.close_short');
  const canCancel = !actionBlockReason(chapterAccess, 'donation.cancel');
  const canResolveRestriction = !actionBlockReason(
    chapterAccess,
    'donation.resolve_restriction',
  );

  const loadList = useCallback(async () => {
    try {
      const res = await listDonations(chapterId, {
        status: (statusFilter || undefined) as DonationStatus | undefined,
        limit: 50,
      });
      setDonations(res.data);
      setSelectedDaId((cur) => {
        if (initialDaId && res.data.some((d) => d.da_id === initialDaId)) {
          return initialDaId;
        }
        if (cur && res.data.some((d) => d.da_id === cur)) {
          return cur;
        }
        return res.data[0]?.da_id ?? '';
      });
    } catch (err) {
      setError(err);
    }
  }, [chapterId, initialDaId, statusFilter]);

  const loadDetail = useCallback(
    async (daId: string) => {
      if (!daId) {
        setSelectedDa(null);
        setHistory([]);
        setRelated([]);
        return;
      }
      try {
        const [detail, histRes, relRes] = await Promise.all([
          readDonation(chapterId, daId),
          listDonationHistory(chapterId, daId, { limit: 50 }),
          listDonationRelated(chapterId, daId, { limit: 50 }),
        ]);
        setSelectedDa(detail);
        setHistory(histRes.data);
        setRelated(relRes.data);
        const uninterpreted = detail.lines.find(
          (l) => l.restrictions.state === 'uninterpreted',
        );
        const targetLine = uninterpreted ?? detail.lines[0];
        if (targetLine) {
          setResLineId(targetLine.line_id);
          setResTargetRestriction({
            ...targetLine.restrictions,
            state:
              targetLine.restrictions.state === 'uninterpreted'
                ? 'bounded'
                : targetLine.restrictions.state,
          });
        }
      } catch (err) {
        setError(err);
      }
    },
    [chapterId],
  );

  useEffect(() => {
    void loadList();
  }, [loadList, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadDetail(selectedDaId);
  }, [loadDetail, selectedDaId, refreshSignal, domainSignal]);

  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: 'Donation Draft',
      baseVersion: selectedDa?.version ?? null,
      pendingActionKey,
      payloadJson: JSON.stringify({ editingDaId, donorName, lines }),
    });
  }, [chapterId, donorName, editingDaId, lines, userId]);

  const daOptions = useMemo<Array<SearchablePickerOption<Donation>>>(
    () =>
      donations.map((d) => ({
        id: d.da_id,
        primaryLabel: `${d.reference ?? 'Draft DA'} — ${d.donor_name}`,
        secondaryLabel: `PHP ${d.pledged_total_value_php} · ${d.lines.length} line(s)`,
        badge: d.status.replaceAll('_', ' '),
        badgeTone:
          d.status === 'acknowledged' || d.status === 'received'
            ? 'ready'
            : d.status === 'returned_for_revision'
              ? 'warning'
              : 'neutral',
        meta: d,
      })),
    [donations],
  );

  const selectedDaLineOptions = useMemo<Array<SearchablePickerOption<string>>>(
    () =>
      (selectedDa?.lines ?? []).map((l, idx) => ({
        id: l.line_id,
        primaryLabel: `#${idx + 1} ${candidates.describeVariant(l.variant_id)} — ${l.pledged_quantity} ${candidates.describeUnit(l.unit_id)}`,
        secondaryLabel: `${l.restrictions.state} · ${l.restrictions.source_condition_reference ?? 'General use'}`,
        badge: l.restrictions.state,
        badgeTone:
          l.restrictions.state === 'uninterpreted'
            ? 'danger'
            : l.restrictions.state === 'bounded'
              ? 'warning'
              : 'ready',
        meta: l.line_id,
      })),
    [candidates, selectedDa],
  );

  const skuBreakdown = useMemo(() => {
    if (!selectedDa) return [];
    const bySku = new Map<
      string,
      { variant: string; unrestricted: number; bounded: number; uninterpreted: number }
    >();
    for (const l of selectedDa.lines) {
      const existing = bySku.get(l.variant_id) ?? {
        variant: candidates.describeVariant(l.variant_id),
        unrestricted: 0,
        bounded: 0,
        uninterpreted: 0,
      };
      const qty = Number.parseFloat(l.pledged_quantity) || 0;
      if (l.restrictions.state === 'unrestricted') existing.unrestricted += qty;
      else if (l.restrictions.state === 'bounded') existing.bounded += qty;
      else existing.uninterpreted += qty;
      bySku.set(l.variant_id, existing);
    }
    return Array.from(bySku.values());
  }, [candidates, selectedDa]);

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const lineInputs: DonationLineInput[] = lines.map((l) => ({
        variant_id: l.variant_id,
        unit_id: l.unit_id,
        pledged_quantity: l.pledged_quantity.trim(),
        condition_notes: l.condition_notes.trim(),
        valuation_kind: l.valuation_kind,
        unit_value_php: l.unit_value_php.trim(),
        valuation_basis: l.valuation_basis.trim(),
        restrictions: l.restrictions,
      }));
      if (editingDaId && selectedDa && selectedDa.da_id === editingDaId) {
        const { data, actionKey } = await replaceDonation(chapterId, editingDaId, {
          expected_version: selectedDa.version,
          expected_material_version: selectedDa.material_version,
          donor_name: donorName.trim(),
          lines: lineInputs,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'replaceDonation',
          actionKey,
          operationId: data.operation_id,
        });
        setSelectedDaId(data.result.da_id);
        setStatusMessage(`Updated Donation Acknowledgment v${data.result.version}.`);
      } else {
        const { data, actionKey } = await createDonation(chapterId, {
          donor_name: donorName.trim(),
          lines: lineInputs,
        });
        setPendingActionKey(actionKey);
        setLastOpHint({
          operationName: 'createDonation',
          actionKey,
          operationId: data.operation_id,
        });
        setEditingDaId(data.result.da_id);
        setSelectedDaId(data.result.da_id);
        setStatusMessage('Created draft Donation Acknowledgment.');
      }
      skipSaveRef.current = true;
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      await loadList();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runDaAction(
    opName: DonationMutationName,
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
      setReasonInput('');
      await loadList();
      if (selectedDaId) {
        await loadDetail(selectedDaId);
      }
    } catch (err) {
      if (err instanceof ContractApiError && err.code === 'audit_unblock_forbidden') {
        setStatusMessage(null);
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-stack">
      <NavFlowHeader
        headingId="da-heading"
        title="Donation Acknowledgments & Donor Restrictions (ADR 0004)"
        subtitle="Record in-kind sponsorships with declared/estimated PHP values, capture signed acknowledgments, and resolve donor restrictions cleanly."
        onBack={onBackToDashboard}
      />

      <div className="callout-banner" role="note">
        <span className="callout-dot dot-info" aria-hidden="true" />
        <div>
          <strong>In-Kind Goods Only:</strong> No cash receipts or Official Receipts are issued in Stage 2. Uninterpreted donor restrictions remain blocked from allocation until signed resolution.
        </div>
      </div>

      <OperationBanner
        error={error}
        statusMessage={statusMessage}
        pendingActionKey={pendingActionKey}
      />

      {/* Selection & Detail */}
      <section className="surface-card s2-section-card">
        <div className="s2-panel-header">
          <div>
            <h2 className="s2-panel-title">Donation Acknowledgments (DA)</h2>
            <p className="s2-panel-sub">
              Inspect pledged goods, mixed-restriction lines on shared SKUs, and signed acknowledgments.
            </p>
          </div>
          {selectedDa &&
            (selectedDa.status === 'acknowledged' ||
              selectedDa.status === 'partially_received') && (
              <button
                type="button"
                className="btn-batcave-primary p02-compact-btn"
                onClick={() => onNavigateTab('receiving_discrepancies')}
              >
                Receive Donation Delivery →
              </button>
            )}
        </div>

        <div className="s2-grid-2">
          <SearchableRecordPicker
            id="da-record-picker"
            label="Select Donation Acknowledgment"
            valueId={selectedDaId}
            options={daOptions}
            onSelect={(opt) => setSelectedDaId(opt?.id ?? '')}
            placeholder="Search DA reference or donor..."
          />
          <div className="form-group">
            <label className="form-label">Status Filter</label>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_acknowledgment">Pending Acknowledgment</option>
              <option value="returned_for_revision">Returned for Revision</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="closed_short">Closed Short</option>
              <option value="declined">Declined</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>

        {selectedDa && (
          <div className="s2-detail-panel">
            <div className="s2-meta-grid">
              <div>
                <span className="s2-muted-sm">DA Reference</span>
                <div>
                  <strong>{selectedDa.reference ?? 'Draft (Pending Sign-off)'}</strong>
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Donor</span>
                <div>{selectedDa.donor_name}</div>
              </div>
              <div>
                <span className="s2-muted-sm">Status</span>
                <div>
                  <span className="s2-badge">{selectedDa.status.replaceAll('_', ' ')}</span>
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Pledged Total (In-Kind)</span>
                <div>PHP {selectedDa.pledged_total_value_php}</div>
              </div>
              <div>
                <span className="s2-muted-sm">Revision</span>
                <div>
                  v{selectedDa.version} / m{selectedDa.material_version}
                </div>
              </div>
              <div>
                <span className="s2-muted-sm">Signed Acknowledgment</span>
                <div>
                  {selectedDa.acknowledgment
                    ? formatManilaTime(selectedDa.acknowledgment.signed_at)
                    : 'Not yet signed'}
                </div>
              </div>
            </div>

            {skuBreakdown.length > 0 && (
              <div className="s2-kpi-strip">
                {skuBreakdown.map((b) => (
                  <div key={b.variant} className="s2-kpi-chip">
                    <strong>{b.variant}</strong>
                    <span className="s2-badge is-ready">Unrestricted: {b.unrestricted}</span>
                    <span className="s2-badge is-warning">Bounded: {b.bounded}</span>
                    <span className="s2-badge is-danger">Uninterpreted: {b.uninterpreted}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="s2-table-wrap">
              <table className="s2-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Pledged / Recv / Open</th>
                    <th>Valuation (PHP)</th>
                    <th>ADR 0004 Restriction</th>
                    <th>Condition / Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDa.lines.map((l) => (
                    <tr key={l.line_id}>
                      <td>{candidates.describeVariant(l.variant_id)}</td>
                      <td>
                        {l.pledged_quantity} / {l.received_quantity} / {l.outstanding_quantity}{' '}
                        {candidates.describeUnit(l.unit_id)}
                      </td>
                      <td>
                        PHP {l.pledged_value_php}
                        <div className="s2-muted-sm">
                          {l.valuation_kind} @ PHP {l.unit_value_php}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`s2-badge ${
                            l.restrictions.state === 'uninterpreted'
                              ? 'is-danger'
                              : l.restrictions.state === 'bounded'
                                ? 'is-warning'
                                : 'is-ready'
                          }`}
                        >
                          {l.restrictions.state}
                        </span>
                        {l.restrictions.source_condition_reference && (
                          <div className="s2-muted-sm">
                            {l.restrictions.source_condition_reference}
                          </div>
                        )}
                      </td>
                      <td>
                        {l.condition_notes}
                        <div className="s2-muted-sm">{l.valuation_basis}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Transitions */}
            <div className="s2-action-bar">
              {(selectedDa.status === 'draft' ||
                selectedDa.status === 'returned_for_revision') && (
                <>
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canPrepare || busy}
                    onClick={() => {
                      setEditingDaId(selectedDa.da_id);
                      setDonorName(selectedDa.donor_name);
                      setLines(
                        selectedDa.lines.map((l) => ({
                          key: l.line_id,
                          variant_id: l.variant_id,
                          unit_id: l.unit_id,
                          pledged_quantity: l.pledged_quantity,
                          condition_notes: l.condition_notes,
                          valuation_kind: l.valuation_kind,
                          unit_value_php: l.unit_value_php,
                          valuation_basis: l.valuation_basis,
                          restrictions: l.restrictions,
                        })),
                      );
                    }}
                  >
                    Load into Editor
                  </button>
                  {selectedDa.status === 'draft' && (
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={!canSubmit || busy}
                      onClick={() =>
                        void runDaAction(
                          'submitDonation',
                          () =>
                            submitDonation(chapterId, selectedDa.da_id, {
                              expected_version: selectedDa.version,
                              expected_material_version: selectedDa.material_version,
                            }),
                          'Submitted Donation Acknowledgment for chapter review.',
                        )
                      }
                    >
                      Submit DA
                    </button>
                  )}
                  {selectedDa.status === 'returned_for_revision' && (
                    <button
                      type="button"
                      className="btn-batcave-primary p02-compact-btn"
                      disabled={!canRevise || busy}
                      onClick={() =>
                        void runDaAction(
                          'reviseDonation',
                          () =>
                            reviseDonation(chapterId, selectedDa.da_id, {
                              expected_version: selectedDa.version,
                              expected_material_version: selectedDa.material_version,
                            }),
                          'Moved DA back to editable Draft status.',
                        )
                      }
                    >
                      Revise in Draft
                    </button>
                  )}
                </>
              )}
              {selectedDa.status === 'pending_acknowledgment' && (
                <>
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canReturn || busy || !reasonInput.trim()}
                    onClick={() =>
                      void runDaAction(
                        'returnDonation',
                        () =>
                          returnDonation(chapterId, selectedDa.da_id, {
                            expected_version: selectedDa.version,
                            expected_material_version: selectedDa.material_version,
                            reason: reasonInput.trim(),
                          }),
                        'Returned DA for revision.',
                      )
                    }
                  >
                    Return
                  </button>
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canDecline || busy || !reasonInput.trim()}
                    onClick={() =>
                      void runDaAction(
                        'declineDonation',
                        () =>
                          declineDonation(chapterId, selectedDa.da_id, {
                            expected_version: selectedDa.version,
                            expected_material_version: selectedDa.material_version,
                            reason: reasonInput.trim(),
                          }),
                        'Declined donation.',
                      )
                    }
                  >
                    Decline
                  </button>
                </>
              )}
              {(selectedDa.status === 'acknowledged' ||
                selectedDa.status === 'partially_received') && (
                <button
                  type="button"
                  className="btn-batcave-secondary p02-compact-btn"
                  disabled={!canCloseShort || busy || !reasonInput.trim()}
                  onClick={() =>
                    void runDaAction(
                      'closeShortDonation',
                      () =>
                        closeShortDonation(chapterId, selectedDa.da_id, {
                          expected_version: selectedDa.version,
                          expected_material_version: selectedDa.material_version,
                          reason: reasonInput.trim(),
                        }),
                      'Closed DA short for undelivered remainder.',
                    )
                  }
                >
                  Close Short
                </button>
              )}
              {selectedDa.status !== 'canceled' &&
                selectedDa.status !== 'received' &&
                selectedDa.status !== 'declined' && (
                  <button
                    type="button"
                    className="btn-batcave-secondary p02-compact-btn"
                    disabled={!canCancel || busy || !reasonInput.trim()}
                    onClick={() =>
                      void runDaAction(
                        'cancelDonation',
                        () =>
                          cancelDonation(chapterId, selectedDa.da_id, {
                            expected_version: selectedDa.version,
                            expected_material_version: selectedDa.material_version,
                            reason: reasonInput.trim(),
                          }),
                        'Canceled Donation Acknowledgment.',
                      )
                    }
                  >
                    Cancel DA
                  </button>
                )}
            </div>

            <div className="form-group">
              <label className="form-label">Transition Reason (Return / Decline / Close-Short / Cancel)</label>
              <input
                className="form-control"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
              />
            </div>

            {/* Signed Paper Acknowledgment Box */}
            {selectedDa.status === 'pending_acknowledgment' && (
              <div className="s2-breakdown-box">
                <h4>Signed Paper Acknowledgment</h4>
                <Stage2EvidenceUploader
                  chapterId={chapterId}
                  purpose="da_acknowledgment"
                  recordId={selectedDa.da_id}
                  recordLabel={selectedDa.donor_name}
                  selectedBinding={ackEvidence}
                  onSelectBinding={setAckEvidence}
                />
                <label className="s2-check-row">
                  <input
                    type="checkbox"
                    checked={ackConfirmed}
                    onChange={(e) => setAckConfirmed(e.target.checked)}
                  />
                  I confirm the uploaded signed paper matches the pledged items and donor terms.
                </label>
                <div className="s2-action-bar">
                  <button
                    type="button"
                    className="btn-batcave-primary p02-compact-btn"
                    disabled={!canAck || busy || !ackEvidence || !ackConfirmed}
                    onClick={() =>
                      void runDaAction(
                        'acknowledgeDonation',
                        () =>
                          acknowledgeDonation(chapterId, selectedDa.da_id, {
                            expected_version: selectedDa.version,
                            expected_material_version: selectedDa.material_version,
                            evidence: ackEvidence!,
                            signed_at: new Date().toISOString(),
                            confirm_paper_matches: true,
                          }),
                        'Signed and acknowledged Donation Acknowledgment.',
                      )
                    }
                  >
                    Sign &amp; Acknowledge DA
                  </button>
                </div>
              </div>
            )}

            {/* ADR 0004 Restriction Resolution */}
            <div className="s2-breakdown-box">
              <h4>ADR 0004 Signed Donor Restriction Resolution</h4>
              <div className="s2-grid-2">
                <SearchableRecordPicker
                  id="da-res-line-picker"
                  label="Target DA Line"
                  valueId={resLineId}
                  options={selectedDaLineOptions}
                  onSelect={(opt) => setResLineId(opt?.id ?? '')}
                  placeholder="Select DA line..."
                />
                <div className="form-group">
                  <label className="form-label">Resolution Action</label>
                  <select
                    className="form-control"
                    value={resKind}
                    onChange={(e) => {
                      const next = e.target.value as 'apply' | 'audit_review';
                      setResKind(next);
                      if (next === 'audit_review') {
                        setResTargetRestriction((prev) => ({
                          ...prev,
                          state: 'uninterpreted',
                        }));
                      } else if (resTargetRestriction.state === 'uninterpreted') {
                        setResTargetRestriction((prev) => ({ ...prev, state: 'bounded' }));
                      }
                    }}
                  >
                    <option value="apply">Apply Interpreted Rules (Unblock Eligible Lots)</option>
                    <option value="audit_review">
                      Audit Review Only (Keep Uninterpreted &amp; Blocked)
                    </option>
                  </select>
                </div>
              </div>

              {resKind === 'apply' && (
                <div className="s2-grid-2">
                  <div className="form-group">
                    <label className="form-label">Resolved State</label>
                    <select
                      className="form-control"
                      value={resTargetRestriction.state}
                      onChange={(e) =>
                        setResTargetRestriction((prev) => ({
                          ...prev,
                          state: e.target.value as BoundedRestriction['state'],
                        }))
                      }
                    >
                      <option value="unrestricted">Unrestricted (General Pool)</option>
                      <option value="bounded">Bounded (Scoped by Event / Unit / Use)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Source Condition Reference</label>
                    <input
                      className="form-control"
                      value={resTargetRestriction.source_condition_reference ?? ''}
                      onChange={(e) =>
                        setResTargetRestriction((prev) => ({
                          ...prev,
                          source_condition_reference: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Signed Resolution Justification</label>
                <input
                  className="form-control"
                  value={resReason}
                  onChange={(e) => setResReason(e.target.value)}
                  placeholder="Document chapter legal/coordinator sign-off..."
                />
              </div>

              <Stage2EvidenceUploader
                chapterId={chapterId}
                purpose="donor_restriction_resolution"
                recordId={selectedDa.da_id}
                recordLabel={`${selectedDa.reference ?? selectedDa.donor_name} Resolution`}
                selectedBinding={resEvidence}
                onSelectBinding={setResEvidence}
              />

              <label className="s2-check-row">
                <input
                  type="checkbox"
                  checked={resConfirmed}
                  onChange={(e) => setResConfirmed(e.target.checked)}
                />
                I confirm the signed restriction interpretation paper matches this resolution.
              </label>

              <div className="s2-action-bar">
                <button
                  type="button"
                  className="btn-batcave-primary p02-compact-btn"
                  disabled={
                    !canResolveRestriction ||
                    busy ||
                    !resLineId ||
                    !resReason.trim() ||
                    !resEvidence ||
                    !resConfirmed
                  }
                  onClick={() =>
                    void runDaAction(
                      'resolveDonationRestriction',
                      () =>
                        resolveDonationRestriction(chapterId, selectedDa.da_id, {
                          expected_version: selectedDa.version,
                          expected_material_version: selectedDa.material_version,
                          da_line_id: resLineId,
                          resolution_kind: resKind,
                          reason: resReason.trim(),
                          restrictions: resTargetRestriction,
                          evidence: resEvidence!,
                          signed_at: new Date().toISOString(),
                          confirm_paper_matches: true,
                        }),
                      'Recorded signed ADR 0004 restriction resolution.',
                    )
                  }
                >
                  Commit Restriction Resolution
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Draft DA Form */}
      <section className="surface-card s2-section-card">
        <div className="s2-panel-header">
          <h3 className="s2-panel-title">
            {editingDaId ? 'Edit Draft Donation' : 'Create In-Kind Donation Draft'}
          </h3>
          <button
            type="button"
            className="btn-batcave-secondary p02-compact-btn"
            onClick={() => {
              setEditingDaId(null);
              setDonorName('');
              setLines([emptyDaLine()]);
              memoryDraftStore.clearDraft(userId, chapterId, formKey);
            }}
          >
            New Blank Draft
          </button>
        </div>

        <form onSubmit={(e) => void handleSaveDraft(e)} className="s2-form-stack">
          <div className="form-group">
            <label className="form-label">Donor / Sponsor Name</label>
            <input
              className="form-control"
              required
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
            />
          </div>

          {lines.map((line, idx) => (
            <div key={line.key} className="s2-line-card">
              <div className="s2-line-head">
                <strong>Donation Line #{idx + 1}</strong>
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
                <SearchableRecordPicker
                  id={`da-line-var-${line.key}`}
                  label="Variant"
                  valueId={line.variant_id}
                  options={candidates.variantOptions}
                  onSelect={(opt) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? {
                              ...l,
                              variant_id: opt?.id ?? '',
                              unit_id: opt?.meta.default_unit_id ?? l.unit_id,
                            }
                          : l,
                      ),
                    )
                  }
                  required
                />
                <SearchableRecordPicker
                  id={`da-line-unit-${line.key}`}
                  label="Unit"
                  valueId={line.unit_id}
                  options={candidates.unitOptions}
                  onSelect={(opt) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, unit_id: opt?.id ?? '' } : l)),
                    )
                  }
                  required
                />
                <div className="form-group">
                  <label className="form-label">Pledged Quantity</label>
                  <input
                    className="form-control"
                    required
                    value={line.pledged_quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, pledged_quantity: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
              </div>

              <div className="s2-grid-3">
                <div className="form-group">
                  <label className="form-label">Valuation Kind</label>
                  <select
                    className="form-control"
                    value={line.valuation_kind}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? { ...l, valuation_kind: e.target.value as 'declared' | 'estimated' }
                            : l,
                        ),
                      )
                    }
                  >
                    <option value="declared">Donor Declared Value</option>
                    <option value="estimated">Chapter Estimated Value</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Unit Value (PHP)</label>
                  <input
                    className="form-control"
                    required
                    value={line.unit_value_php}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, unit_value_php: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ADR 0004 Restriction State</label>
                  <select
                    className="form-control"
                    value={line.restrictions.state}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                restrictions: {
                                  ...l.restrictions,
                                  state: e.target.value as BoundedRestriction['state'],
                                },
                              }
                            : l,
                        ),
                      )
                    }
                  >
                    <option value="unrestricted">Unrestricted</option>
                    <option value="bounded">Bounded Restriction</option>
                    <option value="uninterpreted">
                      Uninterpreted (Blocks Allocation Until Signed Resolution)
                    </option>
                  </select>
                </div>
              </div>

              <div className="s2-grid-2">
                <div className="form-group">
                  <label className="form-label">Condition Notes</label>
                  <input
                    className="form-control"
                    required
                    value={line.condition_notes}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, condition_notes: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valuation Basis</label>
                  <input
                    className="form-control"
                    required
                    value={line.valuation_basis}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, valuation_basis: e.target.value } : l,
                        ),
                      )
                    }
                  />
                </div>
              </div>

              {line.restrictions.state === 'bounded' && (
                <div className="s2-override-box">
                  <div className="s2-kpi-strip">
                    {ALLOWED_USE_CHOICES.map((choice) => {
                      const active = line.restrictions.allowed_uses.includes(choice.value);
                      return (
                        <label key={choice.value} className="s2-check-row">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key
                                    ? {
                                        ...l,
                                        restrictions: {
                                          ...l.restrictions,
                                          allowed_uses: e.target.checked
                                            ? [...l.restrictions.allowed_uses, choice.value]
                                            : l.restrictions.allowed_uses.filter(
                                                (u) => u !== choice.value,
                                              ),
                                        },
                                      }
                                    : l,
                                ),
                              )
                            }
                          />
                          {choice.label}
                        </label>
                      );
                    })}
                  </div>
                  <div className="s2-grid-2">
                    <SearchableRecordPicker
                      id={`da-line-ev-${line.key}`}
                      label="Scoped Event (optional)"
                      valueId={line.restrictions.event_ids[0] ?? ''}
                      options={candidates.eventOptions}
                      onSelect={(opt) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...l,
                                  restrictions: {
                                    ...l.restrictions,
                                    event_ids: opt?.id ? [opt.id] : [],
                                  },
                                }
                              : l,
                          ),
                        )
                      }
                    />
                    <SearchableRecordPicker
                      id={`da-line-unit-${line.key}`}
                      label="Scoped Requesting Unit (optional)"
                      valueId={line.restrictions.requesting_unit_ids[0] ?? ''}
                      options={candidates.requestingUnitOptions}
                      onSelect={(opt) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? {
                                  ...l,
                                  restrictions: {
                                    ...l.restrictions,
                                    requesting_unit_ids: opt?.id ? [opt.id] : [],
                                  },
                                }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {line.restrictions.state !== 'unrestricted' && (
                <div className="form-group">
                  <label className="form-label">Donor Condition Clause / Note</label>
                  <input
                    className="form-control"
                    value={line.restrictions.source_condition_reference ?? ''}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                restrictions: {
                                  ...l.restrictions,
                                  source_condition_reference: e.target.value || null,
                                },
                              }
                            : l,
                        ),
                      )
                    }
                  />
                </div>
              )}
            </div>
          ))}

          <div className="s2-action-bar">
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              onClick={() => setLines((prev) => [...prev, emptyDaLine()])}
            >
              + Add Donation Line
            </button>
            <button type="submit" className="btn-batcave-primary" disabled={!canPrepare || busy}>
              {editingDaId ? 'Replace Draft DA' : 'Create Draft DA'}
            </button>
          </div>
        </form>
      </section>

      {selectedDa && (
        <Stage2AuditPanels
          title={selectedDa.reference ?? 'Draft Donation Acknowledgment'}
          recordVersion={selectedDa.version}
          history={history.map((h, i) => ({
            id: `${h.version}-${i}`,
            version: h.version,
            materialVersion: h.material_version,
            action: h.action,
            fromStatus: null,
            toStatus: h.status,
            actorName: h.actor_id.slice(0, 8),
            occurredAt: h.committed_at,
            reason: h.reason,
          }))}
          related={related.map((r) => ({
            kind: r.resource_kind,
            id: r.resource_id,
            reference: r.resource_id.slice(0, 12),
            state: 'linked',
            lineRef: r.da_line_id,
          }))}
          onRefreshAudit={() => loadDetail(selectedDa.da_id)}
          onLoadVersion={(v) => readDonationVersion(chapterId, selectedDa.da_id, v)}
          onLoadPrintHtml={() => printDonation(chapterId, selectedDa.da_id)}
          onOpenRelated={(kind) => {
            if (kind === 'receiving_report' || kind === 'receiving_discrepancy') {
              onNavigateTab('receiving_discrepancies');
            } else if (kind === 'stock_lot') {
              onNavigateTab('stock');
            }
          }}
          recoveryOperations={[
            { value: 'createDonation', label: 'Create DA Draft' },
            { value: 'acknowledgeDonation', label: 'Acknowledge Signed DA' },
            { value: 'resolveDonationRestriction', label: 'Resolve ADR 0004 Restriction' },
          ]}
          onLookupByActionKey={(op, key) =>
            findDonationOperation(chapterId, op as DonationMutationName, key)
          }
          onLookupByOperationId={(opId) => readDonationOperation(chapterId, opId)}
          recentOperationHint={lastOpHint}
        />
      )}
    </div>
  );
}
