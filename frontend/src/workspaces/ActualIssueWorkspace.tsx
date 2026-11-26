import { useState } from 'react';
import { apiGet, apiGetText, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';

interface ActualIssueWorkspaceProps {
  chapterId: string;
}

export function ActualIssueWorkspace({ chapterId }: ActualIssueWorkspaceProps) {
  const [rfId, setRfId] = useState('');
  const [issueId, setIssueId] = useState('');
  const [opKind, setOpKind] = useState<'prepare' | 'revise' | 'ack' | 'post' | 'reconcile'>('prepare');
  const [bodyJson, setBodyJson] = useState('{}');
  const [issuesJson, setIssuesJson] = useState<unknown>(null);
  const [detailJson, setDetailJson] = useState<unknown>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [lookupKey, setLookupKey] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  async function listRfIssues() {
    if (!rfId.trim()) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/actual-issues?limit=25`);
      setIssuesJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function readIssuePart(part: 'detail' | 'history' | 'movements' | 'related' | 'reconciliation' | 'print') {
    if (!issueId.trim()) {
      return;
    }
    setError(null);
    const prefix = `/api/v1/chapters/${chapterId}/actual-issues/${issueId.trim()}`;
    try {
      if (part === 'print') {
        const html = await apiGetText(`${prefix}/print`);
        setPrintHtml(html);
      } else {
        const suffix = part === 'detail' ? '' : `/${part}${part === 'reconciliation' ? '' : '?limit=25'}`;
        const res = await apiGet<unknown>(`${prefix}${suffix}`);
        setDetailJson(res.data);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function executeIssueOp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReplayed(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyJson);
    } catch {
      setBusy(false);
      setError(new Error('Body must be valid JSON.'));
      return;
    }

    const base = `/api/v1/chapters/${chapterId}`;
    const map: Record<typeof opKind, { method: 'POST' | 'PUT'; path: string }> = {
      prepare: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/actual-issues` },
      revise: { method: 'PUT', path: `${base}/actual-issues/${issueId.trim()}` },
      ack: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/acknowledgments` },
      post: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/post` },
      reconcile: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/reconciliations` },
    };
    const target = map[opKind];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, parsed, key);
      setReplayed(result.replayed);
      setDetailJson(result.data);
      setLookupKey(key);
      if (opKind === 'prepare' && typeof result.data.issue_id === 'string') {
        setIssueId(result.data.issue_id);
      }
      setStatusMessage(`Actual Issue '${opKind}' completed. Key: ${key}`);
      if (rfId.trim()) {
        await listRfIssues();
      }
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
        `/api/v1/chapters/${chapterId}/actual-issue-operations/by-key${buildQuery({ action_key: lookupKey.trim() })}`,
      );
      setDetailJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Signed Actual RF Issue (`Ticket 08` · Prepare → Print → Paper Match → Post)</h2>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <div className="field">
            <label htmlFor="iss-rf">rf_id UUID</label>
            <input id="iss-rf" value={rfId} onChange={(e) => setRfId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="iss-id">issue_id UUID</label>
            <input id="iss-id" value={issueId} onChange={(e) => setIssueId(e.target.value)} />
          </div>
          <button type="button" className="btn secondary" onClick={() => void listRfIssues()} disabled={!rfId.trim()}>
            List RF Issues
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('detail')} disabled={!issueId.trim()}>
            Read
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('print')} disabled={!issueId.trim()}>
            Print Sheet
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('movements')} disabled={!issueId.trim()}>
            Movements
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('reconciliation')} disabled={!issueId.trim()}>
            Reconciliation
          </button>
        </div>

        {issuesJson !== null && <pre className="json-box">{JSON.stringify(issuesJson, null, 2)}</pre>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Issue Transition (`X-Action-Key`)</h3>
          <form onSubmit={executeIssueOp}>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="iss-op">Operation</label>
              <select id="iss-op" value={opKind} onChange={(e) => setOpKind(e.target.value as typeof opKind)}>
                <option value="prepare">1. POST Prepare Actual Issue</option>
                <option value="revise">PUT Revise Prepared Issue</option>
                <option value="ack">2. POST Match Paper Acknowledgment</option>
                <option value="post">3. POST Commit Actual Issue</option>
                <option value="reconcile">POST Record Uncertain Reconciliation</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="iss-json">Canonical JSON Body</label>
              <textarea id="iss-json" rows={8} className="mono" value={bodyJson} onChange={(e) => setBodyJson(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Run Issue Operation
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Issue Outcome Lookup &amp; Printout</h3>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="iss-lkp">X-Action-Key UUID</label>
                <input id="iss-lkp" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Find Result
              </button>
            </div>
          </form>
          {detailJson !== null && <pre className="json-box">{JSON.stringify(detailJson, null, 2)}</pre>}
          {printHtml !== null && (
            <div style={{ marginTop: '0.65rem' }}>
              <iframe title="Actual Issue Printout" sandbox="" srcDoc={printHtml} style={{ width: '100%', height: '240px', border: '1px solid #cbd5e1' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
