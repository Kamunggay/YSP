import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiGetText, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';

interface OpeningRecord {
  id: string;
  reference?: string | null;
  status?: string;
  revision?: number;
  material_version?: number;
  ipc_id?: string;
}

interface OpeningBaselineWorkspaceProps {
  chapterId: string;
  refreshSignal: number;
}

export function OpeningBaselineWorkspace({ chapterId, refreshSignal }: OpeningBaselineWorkspaceProps) {
  const [baseline, setBaseline] = useState<unknown>(null);
  const [ipcs, setIpcs] = useState<OpeningRecord[]>([]);
  const [rms, setRms] = useState<OpeningRecord[]>([]);
  const [selectedIpcId, setSelectedIpcId] = useState('');
  const [selectedRmId, setSelectedRmId] = useState('');
  const [actionPayloadJson, setActionPayloadJson] = useState('{}');
  const [actionEndpoint, setActionEndpoint] = useState<'createIpc' | 'replaceIpc' | 'saveCount' | 'submitIpc' | 'authorizeIpc' | 'createRm' | 'replaceRm' | 'inspectRm' | 'matchRm' | 'postRm'>('createIpc');
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [detailJson, setDetailJson] = useState<unknown>(null);
  const [opName, setOpName] = useState('postOpeningRm');
  const [lookupKey, setLookupKey] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const loadAll = useCallback(async () => {
    const [baseRes, ipcRes, rmRes] = await Promise.all([
      apiGet<unknown>(`/api/v1/chapters/${chapterId}/opening-baseline`),
      apiGet<OpeningRecord[]>(`/api/v1/chapters/${chapterId}/ipcs?limit=25`),
      apiGet<OpeningRecord[]>(`/api/v1/chapters/${chapterId}/opening-rms?limit=25`),
    ]);
    setBaseline(baseRes.data);
    setIpcs(ipcRes.data);
    setRms(rmRes.data);
    if (!selectedIpcId && ipcRes.data[0]?.id) {
      setSelectedIpcId(ipcRes.data[0].id);
    }
    if (!selectedRmId && rmRes.data[0]?.id) {
      setSelectedRmId(rmRes.data[0].id);
    }
  }, [chapterId, selectedIpcId, selectedRmId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadAll();
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
  }, [loadAll, refreshSignal]);

  async function runOpeningAction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReplayed(false);
    setStatusMessage(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(actionPayloadJson);
    } catch {
      setBusy(false);
      setError(new Error('Action JSON payload is malformed.'));
      return;
    }

    const base = `/api/v1/chapters/${chapterId}`;
    const targetMap: Record<typeof actionEndpoint, { method: 'POST' | 'PUT'; path: string }> = {
      createIpc: { method: 'POST', path: `${base}/ipcs` },
      replaceIpc: { method: 'PUT', path: `${base}/ipcs/${selectedIpcId}` },
      saveCount: { method: 'PUT', path: `${base}/ipcs/${selectedIpcId}/my-count` },
      submitIpc: { method: 'POST', path: `${base}/ipcs/${selectedIpcId}/submit` },
      authorizeIpc: { method: 'POST', path: `${base}/ipcs/${selectedIpcId}/authorizations` },
      createRm: { method: 'POST', path: `${base}/opening-rms` },
      replaceRm: { method: 'PUT', path: `${base}/opening-rms/${selectedRmId}` },
      inspectRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/inspection` },
      matchRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/evidence-match` },
      postRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/post` },
    };

    const target = targetMap[actionEndpoint];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<unknown>(target.method, target.path, parsed, key);
      setReplayed(result.replayed);
      setDetailJson(result.data);
      setLookupKey(key);
      setStatusMessage(`${actionEndpoint} succeeded. Action key: ${key}`);
      await loadAll();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function loadOpeningRead(kind: 'ipc' | 'rm', mode: 'detail' | 'history' | 'movements' | 'findings' | 'print') {
    const id = kind === 'ipc' ? selectedIpcId : selectedRmId;
    if (!id) {
      return;
    }
    setError(null);
    const prefix = `/api/v1/chapters/${chapterId}/${kind === 'ipc' ? 'ipcs' : 'opening-rms'}/${id}`;
    try {
      if (mode === 'print') {
        const html = await apiGetText(`${prefix}/print`);
        setPrintHtml(html);
      } else {
        const suffix = mode === 'detail' ? '' : `/${mode}?limit=25`;
        const res = await apiGet<unknown>(`${prefix}${suffix}`);
        setDetailJson(res.data);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/opening-actions/by-key${buildQuery({ operation_name: opName })}`,
        { 'X-Action-Key': lookupKey.trim() },
      );
      setDetailJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Opening Inventory (`Ticket 05` · IPC → Inspected RM Baseline)</h2>
          <button type="button" className="btn secondary" onClick={() => void loadAll()}>
            Refresh Opening State
          </button>
        </div>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <h4>Chapter Opening Baseline (`GET /opening-baseline`)</h4>
        <pre className="json-box">{JSON.stringify(baseline, null, 2)}</pre>

        <div className="grid-2">
          <div>
            <h4>IPCs ({ipcs.length})</h4>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ipc-sel">Selected IPC</label>
              <select id="ipc-sel" value={selectedIpcId} onChange={(e) => setSelectedIpcId(e.target.value)}>
                <option value="">-- select IPC --</option>
                {ipcs.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.reference ?? i.id} ({i.status ?? '?'} r{i.revision ?? '?'} m{i.material_version ?? '?'})
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'detail')} disabled={!selectedIpcId}>
                Read
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'history')} disabled={!selectedIpcId}>
                History
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'print')} disabled={!selectedIpcId}>
                Print HTML
              </button>
            </div>
          </div>

          <div>
            <h4>Opening RMs ({rms.length})</h4>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="rm-sel">Selected Opening RM</label>
              <select id="rm-sel" value={selectedRmId} onChange={(e) => setSelectedRmId(e.target.value)}>
                <option value="">-- select RM --</option>
                {rms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference ?? r.id} ({r.status ?? '?'} r{r.revision ?? '?'} m{r.material_version ?? '?'})
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'detail')} disabled={!selectedRmId}>
                Read
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'movements')} disabled={!selectedRmId}>
                Movements
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'findings')} disabled={!selectedRmId}>
                Findings
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'print')} disabled={!selectedRmId}>
                Print HTML
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Opening Transition (`X-Action-Key`)</h3>
          <form onSubmit={runOpeningAction}>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="op-act">Operation</label>
              <select id="op-act" value={actionEndpoint} onChange={(e) => setActionEndpoint(e.target.value as typeof actionEndpoint)}>
                <option value="createIpc">POST /ipcs (createIpc)</option>
                <option value="replaceIpc">PUT /ipcs/:id (replaceIpc)</option>
                <option value="saveCount">PUT /ipcs/:id/my-count (saveMyIpcCount)</option>
                <option value="submitIpc">POST /ipcs/:id/submit (submitIpc)</option>
                <option value="authorizeIpc">POST /ipcs/:id/authorizations (authorizeIpc)</option>
                <option value="createRm">POST /opening-rms (createOpeningRm)</option>
                <option value="replaceRm">PUT /opening-rms/:id (replaceOpeningRm)</option>
                <option value="inspectRm">POST /opening-rms/:id/inspection (inspectOpeningRm)</option>
                <option value="matchRm">POST /opening-rms/:id/evidence-match (matchOpeningRmEvidence)</option>
                <option value="postRm">POST /opening-rms/:id/post (postOpeningRm)</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="op-json">Canonical JSON Body</label>
              <textarea id="op-json" rows={8} className="mono" value={actionPayloadJson} onChange={(e) => setActionPayloadJson(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Execute Opening Action
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Opening Outcome Lookup &amp; Inspection</h3>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="op-lkp-name">operation_name</label>
                <input id="op-lkp-name" value={opName} onChange={(e) => setOpName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="op-lkp-key">X-Action-Key UUID</label>
                <input id="op-lkp-key" value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} required />
              </div>
              <button className="btn secondary" type="submit">
                Lookup
              </button>
            </div>
          </form>
          {detailJson !== null && <pre className="json-box">{JSON.stringify(detailJson, null, 2)}</pre>}
          {printHtml !== null && (
            <div style={{ marginTop: '0.65rem' }}>
              <h4>Printable Document Preview (sandboxed)</h4>
              <iframe title="Opening Print Preview" sandbox="" srcDoc={printHtml} style={{ width: '100%', height: '240px', border: '1px solid #cbd5e1' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
