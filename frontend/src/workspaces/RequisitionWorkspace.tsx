import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiMutate, buildQuery, formatManilaTime, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface RfLineRow {
  line_id: string | null;
  variant_id: string | null;
  unit_id: string | null;
  requested_quantity: string | null;
}

interface InternalRfRecord {
  id: string;
  reference: string | null;
  status: string;
  fulfillment_status: string;
  version: number;
  material_version: number;
  progress_version: number;
  purpose: string;
  requesting_unit_id: string | null;
  event_id: string | null;
  needed_at: string | null;
  justification: string | null;
  lines?: RfLineRow[];
}

interface CatalogueVariantOption {
  id: string;
  code: string;
  label: string;
  unit_id: string;
  quantity_scale: number;
}

interface CatalogueUnitOption {
  id: string;
  code: string;
  name: string;
  quantity_scale: number;
}

interface RequisitionWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

function emptyRfLine(): RfLineRow {
  return { line_id: null, variant_id: null, unit_id: null, requested_quantity: null };
}

export function RequisitionWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: RequisitionWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'workspace' | 'history'>('workspace');
  const [searchText, setSearchText] = useState('');
  const formKey = 'internal_rf_editor';
  const draftReason = actionBlockReason(chapterAccess, 'rf.draft');
  const submitReason = actionBlockReason(chapterAccess, 'rf.submit');
  const approveReason = actionBlockReason(chapterAccess, 'rf.approve');

  function readSavedRfDraft(): {
    requestingUnitId?: string;
    eventId?: string;
    neededAt?: string;
    justification?: string;
    lines?: RfLineRow[];
    reason?: string;
  } {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as {
        requestingUnitId?: string;
        eventId?: string;
        neededAt?: string;
        justification?: string;
        lines?: RfLineRow[];
        reason?: string;
      };
    } catch {
      return {};
    }
  }

  const initialRf = readSavedRfDraft();

  const [statusFilter, setStatusFilter] = useState('');
  const [rfs, setRfs] = useState<InternalRfRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedRf, setSelectedRf] = useState<InternalRfRecord | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'history' | 'related'>('summary');
  const [subData, setSubData] = useState<unknown>(null);

  const [variants, setVariants] = useState<CatalogueVariantOption[]>([]);
  const [units, setUnits] = useState<CatalogueUnitOption[]>([]);

  const [requestingUnitId, setRequestingUnitId] = useState(initialRf.requestingUnitId ?? '');
  const [eventId, setEventId] = useState(initialRf.eventId ?? '');
  const [neededAt, setNeededAt] = useState(initialRf.neededAt ?? '');
  const [justification, setJustification] = useState(initialRf.justification ?? '');
  const [lines, setLines] = useState<RfLineRow[]>(initialRf.lines && initialRf.lines.length > 0 ? initialRf.lines : [emptyRfLine()]);
  const [reason, setReason] = useState(initialRf.reason ?? '');

  const [exactVersion, setExactVersion] = useState('1');
  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');
  const [lookupResult, setLookupResult] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const loadRfs = useCallback(
    async (cursor?: string | null) => {
      const qs = buildQuery({ status: statusFilter || undefined, limit: 25, cursor: cursor ?? undefined });
      const res = await apiGet<InternalRfRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs${qs}`);
      setRfs((prev) => (cursor ? [...prev, ...res.data] : res.data));
      setNextCursor(res.page?.next_cursor ?? null);
    },
    [chapterId, statusFilter],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadRfs();
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
  }, [loadRfs, refreshSignal]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [varRes, unitRes] = await Promise.all([
          apiGet<CatalogueVariantOption[]>(`/api/v1/chapters/${chapterId}/catalogue/variants?state=all&limit=100`),
          apiGet<CatalogueUnitOption[]>(`/api/v1/chapters/${chapterId}/catalogue/units?state=all&limit=100`),
        ]);
        if (active) {
          setVariants(varRes.data);
          setUnits(unitRes.data);
        }
      } catch {
        // user may have rf.draft without catalogue.read; manual UUID entry remains available
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterId, refreshSignal]);

  function updateLine(idx: number, patch: Partial<RfLineRow>) {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) {
          return row;
        }
        const next = { ...row, ...patch };
        if (patch.variant_id !== undefined && patch.variant_id) {
          const matched = variants.find((v) => v.id === patch.variant_id);
          if (matched) {
            next.unit_id = matched.unit_id;
          }
        }
        return next;
      }),
    );
  }

  function saveMemoryBuffer() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: selectedRf ? `RF ${selectedRf.reference ?? selectedRf.id}` : 'New Internal RF Draft',
      baseVersion: selectedRf?.version ?? null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({ requestingUnitId, eventId, neededAt, justification, lines, reason }),
    });
    setStatusMessage('Requisition changes saved as a temporary draft for this chapter during your current session.');
  }

  async function selectRf(id: string) {
    setError(null);
    try {
      const res = await apiGet<InternalRfRecord>(`/api/v1/chapters/${chapterId}/internal-rfs/${id}`);
      const r = res.data;
      setSelectedRf(r);
      setRequestingUnitId(r.requesting_unit_id ?? '');
      setEventId(r.event_id ?? '');
      setNeededAt(r.needed_at ?? '');
      setJustification(r.justification ?? '');
      setLines(
        r.lines && r.lines.length > 0
          ? r.lines.map((l) => ({
              line_id: l.line_id ?? null,
              variant_id: l.variant_id ?? null,
              unit_id: l.unit_id ?? null,
              requested_quantity: l.requested_quantity ?? null,
            }))
          : [emptyRfLine()],
      );
      setExactVersion(String(r.version));
      setActiveSubTab('summary');
      setSubData(r);
    } catch (err) {
      setError(err);
    }
  }

  async function openSubTab(tab: 'summary' | 'history' | 'related') {
    setActiveSubTab(tab);
    if (!selectedRf) {
      return;
    }
    if (tab === 'summary') {
      setSubData(selectedRf);
      return;
    }
    const suffix = tab === 'history' ? 'history?limit=25' : 'related-records?limit=25';
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}/${suffix}`);
      setSubData(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function readExactRfVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRf) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}/versions/${exactVersion.trim()}`);
      setSubData(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function submitDraftOrReplace(mode: 'create' | 'replace' | 'revise') {
    setBusy(true);
    setError(null);
    setReplayed(false);

    const normalizedLines = lines.map((l) => ({
      line_id: mode === 'create' ? null : l.line_id?.trim() || null,
      variant_id: l.variant_id?.trim() || null,
      unit_id: l.unit_id?.trim() || null,
      requested_quantity: l.requested_quantity?.trim() || null,
    }));

    const basePayload = {
      purpose: 'internal_use',
      requesting_unit_id: requestingUnitId.trim() || null,
      event_id: eventId.trim() || null,
      needed_at: neededAt.trim() || null,
      justification: justification.trim() || null,
      lines: normalizedLines,
    };

    const key = newActionKey();
    try {
      let resp: { result: { data: unknown; replayed: boolean } };
      if (mode === 'create') {
        resp = await apiMutate<unknown>('POST', `/api/v1/chapters/${chapterId}/internal-rfs`, basePayload, key);
      } else if (mode === 'replace' && selectedRf) {
        resp = await apiMutate<unknown>(
          'PUT',
          `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}`,
          { ...basePayload, expected_version: selectedRf.version, expected_material_version: selectedRf.material_version, reason },
          key,
        );
      } else if (mode === 'revise' && selectedRf) {
        resp = await apiMutate<unknown>(
          'POST',
          `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}/revise`,
          {
            ...basePayload,
            expected_version: selectedRf.version,
            expected_material_version: selectedRf.material_version,
            expected_progress_version: selectedRf.progress_version,
            reason,
          },
          key,
        );
      } else {
        throw new Error('Select a requisition first.');
      }

      const { record, operationId } = unwrapMutationData<InternalRfRecord & Record<string, unknown>>(resp.result.data);
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(resp.result.replayed);
      setSelectedRf(record);
      setSubData(record);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      setStatusMessage(`Requisition ${record.reference ?? record.id} saved (rev. ${record.version}). Reference: ${key}`);
      await loadRfs();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runTransition(kind: 'submit' | 'approve' | 'return' | 'cancel') {
    if (!selectedRf) {
      return;
    }
    setBusy(true);
    setError(null);
    setReplayed(false);
    const key = newActionKey();
    const payload: Record<string, unknown> = {
      expected_version: selectedRf.version,
      expected_material_version: selectedRf.material_version,
    };
    if (kind === 'cancel') {
      payload.expected_progress_version = selectedRf.progress_version;
      payload.reason = reason.trim();
    } else if (kind === 'return') {
      payload.reason = reason.trim();
    }

    try {
      const { result } = await apiMutate<unknown>(
        'POST',
        `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}/${kind}`,
        payload,
        key,
      );
      const { record, operationId } = unwrapMutationData<InternalRfRecord & Record<string, unknown>>(result.data);
      setReplayed(result.replayed);
      setSelectedRf(record);
      setSubData(record);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      const actionWord =
        kind === 'submit' ? 'submitted' : kind === 'approve' ? 'approved' : kind === 'return' ? 'returned for revision' : 'cancelled';
      setStatusMessage(`Requisition ${actionWord}. Current status: ${record.status}. Reference: ${key}`);
      await loadRfs();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/internal-rfs/operation-results${buildQuery({ action_key: lookupKey.trim() })}`,
      );
      setLookupResult(res.data);
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
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/operation-results/${lookupOpId.trim()}`);
      setLookupResult(res.data);
    } catch (err) {
      setError(err);
    }
  }

  const filteredRfs = searchText.trim()
    ? rfs.filter((r) => {
        const needle = searchText.trim().toLowerCase();
        return (
          (r.reference ?? '').toLowerCase().includes(needle) ||
          (r.purpose ?? '').toLowerCase().includes(needle) ||
          r.status.toLowerCase().includes(needle)
        );
      })
    : rfs;

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
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
                className="form-control p03-search-input"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search requisitions by reference or status..."
                aria-label="Search requisitions by reference or status"
              />
            </div>

            <select
              id="rf-status-f"
              className="form-control p03-shrink-btn"
              style={{ width: 'auto', minHeight: '38px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter requisition status"
            >
              <option value="">All visible states</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="returned">Returned</option>
              <option value="canceled">Cancelled</option>
            </select>

            <button type="button" className="btn-batcave-secondary p03-shrink-btn" onClick={() => void loadRfs()}>
              Reload List
            </button>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Internal Requisitions</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Requisition workspace tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'workspace'}
                  className={`p03-filter-pill ${viewTab === 'workspace' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('workspace')}
                >
                  Queue &amp; Editor ({filteredRfs.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'history'}
                  className={`p03-filter-pill ${viewTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('history')}
                >
                  History &amp; Status
                </button>
              </div>
              {onBackToDashboard && (
                <button
                  type="button"
                  className="btn-batcave-secondary p03-shrink-btn"
                  onClick={onBackToDashboard}
                >
                  Back to Chapter Workspace
                </button>
              )}
            </div>
          </div>
        </header>

        <OperationBanner
          error={error}
          statusMessage={statusMessage}
          replayed={replayed}
          onDismiss={() => setStatusMessage(null)}
        />

        {viewTab === 'workspace' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-label="Requisitions queue">
                <div className="p03-card-header-row" style={{ marginBottom: '0.65rem' }}>
                  <div>
                    <h2 className="p03-section-title">Requisition Queue</h2>
                    <p className="form-card-subtitle">
                      Select an existing requisition to edit, submit, or review, or draft a new request on the right.
                    </p>
                  </div>
                </div>

                {filteredRfs.length === 0 ? (
                  <div className="s02-empty-state">
                    <div className="s02-empty-heading">No requisitions found</div>
                    <div className="s02-empty-caption">
                      Create a new requisition draft on the right or adjust your filter criteria above.
                    </div>
                  </div>
                ) : (
                  <div className="p03-history-list">
                    {filteredRfs.map((r) => (
                      <article
                        key={r.id}
                        className={`p03-history-card ${selectedRf?.id === r.id ? 'is-search-match' : ''}`}
                      >
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <span className="p03-id-pill">{r.reference ?? 'Draft'}</span>
                            <span
                              className={`s02-status-tag ${
                                r.status === 'approved'
                                  ? 'is-ready'
                                  : r.status === 'canceled' || r.status === 'returned'
                                    ? 'is-uncertain'
                                    : 'is-overdue'
                              }`}
                            >
                              {r.status}
                            </span>
                            <span className="p03-version-pill">rev. {r.version}</span>
                          </div>
                          <button
                            type="button"
                            className="p02-compact-btn"
                            onClick={() => void selectRf(r.id)}
                          >
                            Open
                          </button>
                        </div>
                        <div className="p03-history-meta">
                          <span>Fulfillment: {r.fulfillment_status.replace(/_/g, ' ')}</span>
                          <span>Needed: {formatManilaTime(r.needed_at)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {nextCursor && (
                  <div className="p03-action-pair" style={{ marginTop: '0.85rem' }}>
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={() => void loadRfs(nextCursor)}
                    >
                      Load Next Page
                    </button>
                  </div>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-label="Requisition editor">
                <div className="p03-card-header-row" style={{ marginBottom: '0.75rem' }}>
                  <h2 className="p03-section-title">
                    {selectedRf ? `Requisition: ${selectedRf.reference ?? 'Draft'}` : 'New Requisition'}
                  </h2>
                  {selectedRf && (
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={() => setSelectedRf(null)}
                    >
                      New Draft
                    </button>
                  )}
                </div>

                <div className="p02-column-stack">
                  <div className="form-group">
                    <label className="form-label" htmlFor="rf-unit">
                      Requesting Unit (optional for draft)
                    </label>
                    <input
                      id="rf-unit"
                      className="form-control"
                      value={requestingUnitId}
                      onChange={(e) => setRequestingUnitId(e.target.value)}
                    />
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label className="form-label" htmlFor="rf-event">
                        Event Reference (optional)
                      </label>
                      <input
                        id="rf-event"
                        className="form-control"
                        value={eventId}
                        onChange={(e) => setEventId(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="rf-needed">
                        Date &amp; Time Needed
                      </label>
                      <input
                        id="rf-needed"
                        className="form-control"
                        value={neededAt}
                        onChange={(e) => setNeededAt(e.target.value)}
                        placeholder="2026-12-01T08:00:00.000000Z"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="rf-just">
                      Justification
                    </label>
                    <input
                      id="rf-just"
                      className="form-control"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="p03-card-header-row" style={{ marginBottom: '0.45rem' }}>
                      <strong className="form-label" style={{ margin: 0 }}>
                        Requested Items &amp; Quantities
                      </strong>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={() => setLines((prev) => [...prev, emptyRfLine()])}
                      >
                        + Add Line
                      </button>
                    </div>

                    <div className="p04-lines-list">
                      {lines.map((line, idx) => (
                        <div key={idx} className="p04-line-card">
                          <div className="p04-line-top">
                            <span className="p03-version-pill">
                              Line #{idx + 1}{line.line_id ? ' (saved)' : ' (new)'}
                            </span>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                className="btn-batcave-secondary p03-shrink-btn"
                                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="p03-two-col">
                            <div className="form-group">
                              <label className="form-label">Item Variant</label>
                              {variants.length > 0 ? (
                                <select
                                  className="form-control"
                                  value={line.variant_id ?? ''}
                                  onChange={(e) => updateLine(idx, { variant_id: e.target.value || null })}
                                >
                                  <option value="">-- Select --</option>
                                  {variants.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.code} — {v.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="form-control"
                                  value={line.variant_id ?? ''}
                                  placeholder="Item Variant Reference"
                                  onChange={(e) => updateLine(idx, { variant_id: e.target.value || null })}
                                />
                              )}
                            </div>

                            <div className="form-group">
                              <label className="form-label">Unit</label>
                              {units.length > 0 ? (
                                <select
                                  className="form-control"
                                  value={line.unit_id ?? ''}
                                  onChange={(e) => updateLine(idx, { unit_id: e.target.value || null })}
                                >
                                  <option value="">-- Select --</option>
                                  {units.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.code} — {u.name} ({u.quantity_scale} decimals)
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  className="form-control"
                                  value={line.unit_id ?? ''}
                                  placeholder="Unit Reference"
                                  onChange={(e) => updateLine(idx, { unit_id: e.target.value || null })}
                                />
                              )}
                            </div>
                          </div>

                          <div className="form-group">
                            <label className="form-label">Requested Quantity</label>
                            <input
                              className="form-control"
                              value={line.requested_quantity ?? ''}
                              placeholder="e.g. 5"
                              onChange={(e) => updateLine(idx, { requested_quantity: e.target.value || null })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="rf-reason">
                      Reason (required when editing, returning, revising, or cancelling)
                    </label>
                    <input
                      id="rf-reason"
                      className="form-control"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  <div className="p03-action-pair">
                    <button
                      type="button"
                      className="btn-batcave-primary p03-shrink-btn"
                      disabled={busy || draftReason !== null}
                      title={draftReason ?? undefined}
                      onClick={() => void submitDraftOrReplace('create')}
                    >
                      Create Draft
                    </button>
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      disabled={busy || !selectedRf || draftReason !== null}
                      title={draftReason ?? undefined}
                      onClick={() => void submitDraftOrReplace('replace')}
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={saveMemoryBuffer}
                    >
                      Save Temporary Draft
                    </button>
                    {selectedRf && (
                      <>
                        <button
                          type="button"
                          className="btn-batcave-primary p03-shrink-btn"
                          disabled={busy || submitReason !== null}
                          title={submitReason ?? undefined}
                          onClick={() => void runTransition('submit')}
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          className="btn-batcave-primary p03-shrink-btn"
                          disabled={busy || approveReason !== null}
                          title={approveReason ?? undefined}
                          onClick={() => void runTransition('approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          disabled={busy || approveReason !== null}
                          title={approveReason ?? undefined}
                          onClick={() => void runTransition('return')}
                        >
                          Return
                        </button>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          disabled={busy || draftReason !== null}
                          title={draftReason ?? undefined}
                          onClick={() => void submitDraftOrReplace('revise')}
                        >
                          Revise to Draft
                        </button>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          disabled={busy || draftReason !== null}
                          title={draftReason ?? undefined}
                          onClick={() => void runTransition('cancel')}
                        >
                          Cancel Remainder
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-label="Requisition history and related records">
              <div className="p03-card-header-row" style={{ marginBottom: '0.75rem' }}>
                <h2 className="p03-section-title">History &amp; Related Records</h2>
                <div className="p03-filter-pill-bar">
                  {(['summary', 'history', 'related'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`p03-filter-pill ${activeSubTab === t ? 'is-active' : ''}`}
                      onClick={() => void openSubTab(t)}
                    >
                      {t === 'summary' ? 'Summary' : t === 'history' ? 'History' : 'Related'}
                    </button>
                  ))}
                </div>
              </div>

              {selectedRf && (
                <form onSubmit={readExactRfVersion} className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label" htmlFor="rf-exact-ver">
                    Read Revision Number
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="rf-exact-ver"
                      className="form-control"
                      type="number"
                      min={1}
                      value={exactVersion}
                      onChange={(e) => setExactVersion(e.target.value)}
                    />
                    <button type="submit" className="btn-batcave-secondary p03-shrink-btn">
                      Read Version
                    </button>
                  </div>
                </form>
              )}

              {subData === null ? (
                <div className="s02-empty-state">
                  <div className="s02-empty-heading">No requisition selected</div>
                  <div className="s02-empty-caption">
                    Open a requisition from the Queue &amp; Editor tab to inspect its revision history and linked records.
                  </div>
                </div>
              ) : (
                <pre className="json-box">{JSON.stringify(subData, null, 2)}</pre>
              )}
            </section>

            <section className="p03-card surface-card" aria-label="Check submitted requisition change">
              <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
                Check Submission Status
              </h2>
              <div className="p02-column-stack">
                <form onSubmit={lookupByKey} className="form-group">
                  <label className="form-label" htmlFor="rf-op-k">
                    Submission Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="rf-op-k"
                      className="form-control"
                      required
                      value={lookupKey}
                      onChange={(e) => setLookupKey(e.target.value)}
                    />
                    <button type="submit" className="btn-batcave-secondary p03-shrink-btn">
                      Check Status
                    </button>
                  </div>
                </form>

                <form onSubmit={lookupByOpId} className="form-group">
                  <label className="form-label" htmlFor="rf-op-id">
                    Change Record Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="rf-op-id"
                      className="form-control"
                      required
                      value={lookupOpId}
                      onChange={(e) => setLookupOpId(e.target.value)}
                    />
                    <button type="submit" className="btn-batcave-secondary p03-shrink-btn">
                      View Record
                    </button>
                  </div>
                </form>

                {lookupResult !== null && <pre className="json-box">{JSON.stringify(lookupResult, null, 2)}</pre>}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
