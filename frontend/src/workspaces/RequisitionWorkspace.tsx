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
}

function emptyRfLine(): RfLineRow {
  return { line_id: null, variant_id: null, unit_id: null, requested_quantity: null };
}

export function RequisitionWorkspace({ userId, chapterId, refreshSignal, chapterAccess }: RequisitionWorkspaceProps) {
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

  return (
    <div>
      <div className="card">
        <h2>Internal Requisitions</h2>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <div className="field" style={{ maxWidth: '16rem' }}>
            <label htmlFor="rf-status-f">Status Filter</label>
            <select id="rf-status-f" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All visible states</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="returned">Returned</option>
              <option value="canceled">Cancelled</option>
            </select>
          </div>
          <button type="button" className="btn secondary" onClick={() => void loadRfs()}>
            Reload List
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Status</th>
                <th>Fulfillment</th>
                <th>Revision</th>
                <th>Date Needed</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {rfs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No requisitions found in this chapter.
                  </td>
                </tr>
              ) : (
                rfs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.reference ?? r.id}</td>
                    <td>{r.status}</td>
                    <td>{r.fulfillment_status.replace(/_/g, ' ')}</td>
                    <td className="mono">
                      v{r.version}/m{r.material_version}/p{r.progress_version}
                    </td>
                    <td>{formatManilaTime(r.needed_at)}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => void selectRf(r.id)}>
                        Open Workspace
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <button type="button" className="btn secondary" style={{ marginTop: '0.5rem' }} onClick={() => void loadRfs(nextCursor)}>
            Load Next Page
          </button>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>{selectedRf ? `Requisition: ${selectedRf.reference ?? selectedRf.id}` : 'New Requisition'}</h3>
          <div className="field" style={{ marginBottom: '0.45rem' }}>
            <label htmlFor="rf-unit">Requesting Unit ID (optional for draft)</label>
            <input id="rf-unit" value={requestingUnitId} onChange={(e) => setRequestingUnitId(e.target.value)} />
          </div>
          <div className="row" style={{ marginBottom: '0.45rem' }}>
            <div className="field">
              <label htmlFor="rf-event">Event ID (optional)</label>
              <input id="rf-event" value={eventId} onChange={(e) => setEventId(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rf-needed">Date &amp; Time Needed</label>
              <input id="rf-needed" value={neededAt} onChange={(e) => setNeededAt(e.target.value)} placeholder="2026-12-01T08:00:00.000000Z" />
            </div>
          </div>
          <div className="field" style={{ marginBottom: '0.6rem' }}>
            <label htmlFor="rf-just">Justification</label>
            <input id="rf-just" value={justification} onChange={(e) => setJustification(e.target.value)} />
          </div>

          <div style={{ marginBottom: '0.65rem' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <strong>Requested Items &amp; Quantities</strong>
              <button type="button" className="btn secondary" onClick={() => setLines((prev) => [...prev, emptyRfLine()])}>
                + Add Line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="row nested-row-panel"
              >
                <div className="field">
                  <label>Item Variant {line.line_id ? `(existing ${line.line_id.slice(0, 8)})` : '(new)'}</label>
                  {variants.length > 0 ? (
                    <select value={line.variant_id ?? ''} onChange={(e) => updateLine(idx, { variant_id: e.target.value || null })}>
                      <option value="">-- Select --</option>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code} — {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={line.variant_id ?? ''}
                      placeholder="Item Variant ID"
                      onChange={(e) => updateLine(idx, { variant_id: e.target.value || null })}
                    />
                  )}
                </div>
                <div className="field">
                  <label>Unit</label>
                  {units.length > 0 ? (
                    <select value={line.unit_id ?? ''} onChange={(e) => updateLine(idx, { unit_id: e.target.value || null })}>
                      <option value="">-- Select --</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} — {u.name} (up to {u.quantity_scale} decimals)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={line.unit_id ?? ''}
                      placeholder="Unit ID"
                      onChange={(e) => updateLine(idx, { unit_id: e.target.value || null })}
                    />
                  )}
                </div>
                <div className="field" style={{ maxWidth: '8.5rem' }}>
                  <label>Requested Quantity</label>
                  <input
                    value={line.requested_quantity ?? ''}
                    placeholder="e.g. 5"
                    onChange={(e) => updateLine(idx, { requested_quantity: e.target.value || null })}
                  />
                </div>
                {lines.length > 1 && (
                  <button type="button" className="btn secondary" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="field" style={{ marginBottom: '0.65rem' }}>
            <label htmlFor="rf-reason">Reason (required when editing, returning, revising, or cancelling)</label>
            <input id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || draftReason !== null}
              title={draftReason ?? undefined}
              onClick={() => void submitDraftOrReplace('create')}
            >
              Create Draft
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !selectedRf || draftReason !== null}
              title={draftReason ?? undefined}
              onClick={() => void submitDraftOrReplace('replace')}
            >
              Save Draft
            </button>
            <button type="button" className="btn secondary" onClick={saveMemoryBuffer}>
              Save Temporary Draft
            </button>
            {selectedRf && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || submitReason !== null}
                  title={submitReason ?? undefined}
                  onClick={() => void runTransition('submit')}
                >
                  Submit
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || approveReason !== null}
                  title={approveReason ?? undefined}
                  onClick={() => void runTransition('approve')}
                >
                  Approve (Independent)
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || approveReason !== null}
                  title={approveReason ?? undefined}
                  onClick={() => void runTransition('return')}
                >
                  Return
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy || draftReason !== null}
                  title={draftReason ?? undefined}
                  onClick={() => void submitDraftOrReplace('revise')}
                >
                  Revise to Draft
                </button>
                <button
                  type="button"
                  className="btn danger"
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

        <div className="card">
          <h3>Requisition History, Related Records &amp; Status Check</h3>
          <div className="tabs">
            {(['summary', 'history', 'related'] as const).map((t) => (
              <button key={t} type="button" className={`tab-btn ${activeSubTab === t ? 'active' : ''}`} onClick={() => void openSubTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          {selectedRf && (
            <form onSubmit={readExactRfVersion} className="row" style={{ marginBottom: '0.6rem' }}>
              <div className="field" style={{ maxWidth: '8rem' }}>
                <label htmlFor="rf-exact-ver">Revision Number</label>
                <input id="rf-exact-ver" type="number" min={1} value={exactVersion} onChange={(e) => setExactVersion(e.target.value)} />
              </div>
              <button type="submit" className="btn secondary">
                Read Version
              </button>
            </form>
          )}
          {subData !== null && <pre className="json-box">{JSON.stringify(subData, null, 2)}</pre>}

          <form onSubmit={lookupByKey} style={{ marginTop: '0.75rem' }}>
            <div className="row">
              <div className="field">
                <label htmlFor="rf-op-k">Check by Submission Reference</label>
                <input id="rf-op-k" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button type="submit" className="btn secondary">
                Check Status
              </button>
            </div>
          </form>
          <form onSubmit={lookupByOpId} style={{ marginTop: '0.5rem' }}>
            <div className="row">
              <div className="field">
                <label htmlFor="rf-op-id">Check by Change Record ID</label>
                <input id="rf-op-id" required value={lookupOpId} onChange={(e) => setLookupOpId(e.target.value)} />
              </div>
              <button type="submit" className="btn secondary">
                View by Record ID
              </button>
            </div>
          </form>
          {lookupResult !== null && <pre className="json-box">{JSON.stringify(lookupResult, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}
