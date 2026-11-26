import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiMutate, buildQuery, formatManilaTime, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface RfLineRow {
  line_id: string | null;
  variant_id: string | null;
  unit_id: string | null;
  quantity: string | null;
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

interface RequisitionWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
}

export function RequisitionWorkspace({ userId, chapterId, refreshSignal }: RequisitionWorkspaceProps) {
  const [statusFilter, setStatusFilter] = useState('');
  const [rfs, setRfs] = useState<InternalRfRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedRf, setSelectedRf] = useState<InternalRfRecord | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'history' | 'related'>('summary');
  const [subData, setSubData] = useState<unknown>(null);

  const formKey = 'internal_rf_editor';

  function readSavedRfDraft(): Record<string, string> {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as Record<string, string>;
    } catch {
      return {};
    }
  }

  const initialRf = readSavedRfDraft();
  const [requestingUnitId, setRequestingUnitId] = useState(initialRf.requestingUnitId ?? '');
  const [eventId, setEventId] = useState(initialRf.eventId ?? '');
  const [neededAt, setNeededAt] = useState(initialRf.neededAt ?? '');
  const [justification, setJustification] = useState(initialRf.justification ?? '');
  const [linesJson, setLinesJson] = useState(initialRf.linesJson ?? '[{"line_id":null,"variant_id":null,"unit_id":null,"quantity":null}]');
  const [reason, setReason] = useState(initialRf.reason ?? '');
  const [lookupKey, setLookupKey] = useState('');
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

  function saveMemoryBuffer() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: selectedRf ? `RF ${selectedRf.reference ?? selectedRf.id}` : 'New Internal RF Draft',
      baseVersion: selectedRf?.version ?? null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({ requestingUnitId, eventId, neededAt, justification, linesJson, reason }),
    });
    setStatusMessage('RF edits held in chapter-scoped memory only (quarantined per user + chapter).');
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
      setLinesJson(JSON.stringify(r.lines ?? [], null, 2));
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

  async function submitDraftOrReplace(mode: 'create' | 'replace' | 'revise') {
    setBusy(true);
    setError(null);
    setReplayed(false);
    let parsedLines: unknown;
    try {
      parsedLines = JSON.parse(linesJson);
    } catch {
      setBusy(false);
      setError(new Error('Lines JSON must be valid JSON array.'));
      return;
    }

    const basePayload = {
      purpose: 'internal_use',
      requesting_unit_id: requestingUnitId.trim() || null,
      event_id: eventId.trim() || null,
      needed_at: neededAt.trim() || null,
      justification: justification.trim() || null,
      lines: parsedLines,
    };

    const key = newActionKey();
    try {
      let resp: { result: { data: InternalRfRecord; replayed: boolean } };
      if (mode === 'create') {
        resp = await apiMutate<InternalRfRecord>('POST', `/api/v1/chapters/${chapterId}/internal-rfs`, basePayload, key);
      } else if (mode === 'replace' && selectedRf) {
        resp = await apiMutate<InternalRfRecord>(
          'PUT',
          `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}`,
          { ...basePayload, expected_version: selectedRf.version, expected_material_version: selectedRf.material_version, reason },
          key,
        );
      } else if (mode === 'revise' && selectedRf) {
        resp = await apiMutate<InternalRfRecord>(
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
        throw new Error('Select an RF first.');
      }

      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(resp.result.replayed);
      setSelectedRf(resp.result.data);
      setLookupKey(key);
      setStatusMessage(`RF ${resp.result.data.reference ?? resp.result.data.id} saved (v${resp.result.data.version}). Key: ${key}`);
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
      const { result } = await apiMutate<InternalRfRecord>(
        'POST',
        `/api/v1/chapters/${chapterId}/internal-rfs/${selectedRf.id}/${kind}`,
        payload,
        key,
      );
      setReplayed(result.replayed);
      setSelectedRf(result.data);
      setSubData(result.data);
      setLookupKey(key);
      setStatusMessage(`RF transition '${kind}' completed. Status: ${result.data.status}. Key: ${key}`);
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

  return (
    <div>
      <div className="card">
        <h2>Internal Requisition Forms (`Ticket 06` · S-03 &amp; S-04)</h2>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <div className="field" style={{ maxWidth: '16rem' }}>
            <label htmlFor="rf-status-f">Status Filter</label>
            <select id="rf-status-f" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All visible states</option>
              <option value="draft">draft</option>
              <option value="submitted">submitted</option>
              <option value="approved">approved</option>
              <option value="returned">returned</option>
              <option value="canceled">canceled</option>
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
                <th>Versions</th>
                <th>Needed At</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {rfs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No internal RFs visible in this chapter.
                  </td>
                </tr>
              ) : (
                rfs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.reference ?? r.id}</td>
                    <td>{r.status}</td>
                    <td>{r.fulfillment_status}</td>
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
          <h3>{selectedRf ? `RF Workspace: ${selectedRf.reference ?? selectedRf.id}` : 'Create Incomplete/Complete RF Draft'}</h3>
          <div className="field" style={{ marginBottom: '0.45rem' }}>
            <label htmlFor="rf-unit">requesting_unit_id UUID (nullable in draft)</label>
            <input id="rf-unit" value={requestingUnitId} onChange={(e) => setRequestingUnitId(e.target.value)} />
          </div>
          <div className="row" style={{ marginBottom: '0.45rem' }}>
            <div className="field">
              <label htmlFor="rf-event">event_id UUID (optional)</label>
              <input id="rf-event" value={eventId} onChange={(e) => setEventId(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rf-needed">needed_at (UTC microsecond)</label>
              <input id="rf-needed" value={neededAt} onChange={(e) => setNeededAt(e.target.value)} placeholder="2026-12-01T08:00:00.000000Z" />
            </div>
          </div>
          <div className="field" style={{ marginBottom: '0.45rem' }}>
            <label htmlFor="rf-just">Justification</label>
            <input id="rf-just" value={justification} onChange={(e) => setJustification(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: '0.45rem' }}>
            <label htmlFor="rf-lines">Lines JSON</label>
            <textarea id="rf-lines" rows={4} className="mono" value={linesJson} onChange={(e) => setLinesJson(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: '0.65rem' }}>
            <label htmlFor="rf-reason">Reason (required for replace / return / revise / cancel)</label>
            <input id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void submitDraftOrReplace('create')}>
              Create Draft
            </button>
            <button type="button" className="btn secondary" disabled={busy || !selectedRf} onClick={() => void submitDraftOrReplace('replace')}>
              Save Draft (`PUT`)
            </button>
            <button type="button" className="btn secondary" onClick={saveMemoryBuffer}>
              Park in RAM
            </button>
            {selectedRf && (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => void runTransition('submit')}>
                  Submit
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void runTransition('approve')}>
                  Approve (Independent)
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void runTransition('return')}>
                  Return
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void submitDraftOrReplace('revise')}>
                  Revise to Draft
                </button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => void runTransition('cancel')}>
                  Cancel Remainder
                </button>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Connected RF Tabs &amp; Operation Lookup</h3>
          <div className="tabs">
            {(['summary', 'history', 'related'] as const).map((t) => (
              <button key={t} type="button" className={`tab-btn ${activeSubTab === t ? 'active' : ''}`} onClick={() => void openSubTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          {subData !== null && <pre className="json-box">{JSON.stringify(subData, null, 2)}</pre>}

          <form onSubmit={lookupByKey} style={{ marginTop: '0.75rem' }}>
            <div className="row">
              <div className="field">
                <label htmlFor="rf-op-k">Lookup Operation by Key</label>
                <input id="rf-op-k" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button type="submit" className="btn secondary">
                Find Receipt
              </button>
            </div>
          </form>
          {lookupResult !== null && <pre className="json-box">{JSON.stringify(lookupResult, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}
