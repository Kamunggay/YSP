import { useState } from 'react';
import { apiGet, apiGetText, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import {
  emptyEvidenceBinding,
  emptyStockRange,
  toWireEvidenceBinding,
  toWireRanges,
  type StockRangeInput,
} from '../components/structuredInputHelpers.ts';
import { EvidenceBindingFields, StockRangeRows } from '../components/StructuredInputRows.tsx';

interface IssueLineSelectionInput {
  rf_line_id: string;
  reservation_id: string;
  expected_reservation_version: string;
  expected_reservation_material_version: string;
  targets: StockRangeInput[];
}

interface SourcePinInput {
  stock_lot_id: string;
  expected_lot_material_version: string;
  expected_stock_version: string;
}

type IssueOpKind = 'prepare' | 'revise' | 'ack' | 'post' | 'reconcile';

interface ActualIssueWorkspaceProps {
  chapterId: string;
}

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

export function ActualIssueWorkspace({ chapterId }: ActualIssueWorkspaceProps) {
  const [rfId, setRfId] = useState('');
  const [issueId, setIssueId] = useState('');
  const [opKind, setOpKind] = useState<IssueOpKind>('prepare');

  const [expectedRfVersion, setExpectedRfVersion] = useState('1');
  const [expectedRfMatVersion, setExpectedRfMatVersion] = useState('1');
  const [expectedRfProgressVersion, setExpectedRfProgressVersion] = useState('1');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [expectedMatVersion, setExpectedMatVersion] = useState('1');

  const [recipientId, setRecipientId] = useState('');
  const [handedOverAt, setHandedOverAt] = useState(nowUtcMicro);
  const [acknowledgedAt, setAcknowledgedAt] = useState(nowUtcMicro);
  const [acceptsPartial, setAcceptsPartial] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const [issueLines, setIssueLines] = useState<IssueLineSelectionInput[]>([emptyIssueLine()]);

  const [snapshotMatVer, setSnapshotMatVer] = useState('1');
  const [snapshotSha, setSnapshotSha] = useState('');
  const [matchesPaper, setMatchesPaper] = useState(true);
  const [acknowledgmentId, setAcknowledgmentId] = useState('');
  const [currentSources, setCurrentSources] = useState<SourcePinInput[]>([
    { stock_lot_id: '', expected_lot_material_version: '1', expected_stock_version: '1' },
  ]);

  const [finding, setFinding] = useState<'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed'>('no_handover');
  const [reconcileReason, setReconcileReason] = useState('');
  const [attachReconcileEvidence, setAttachReconcileEvidence] = useState(false);
  const [evidenceBinding, setEvidenceBinding] = useState(emptyEvidenceBinding);

  const [issuesJson, setIssuesJson] = useState<unknown>(null);
  const [detailJson, setDetailJson] = useState<unknown>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');

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

  function buildBody(): Record<string, unknown> {
    const rfVers = {
      expected_rf_version: Number.parseInt(expectedRfVersion, 10) || 1,
      expected_rf_material_version: Number.parseInt(expectedRfMatVersion, 10) || 1,
      expected_rf_progress_version: Number.parseInt(expectedRfProgressVersion, 10) || 1,
    };
    const issueVers = {
      expected_version: Number.parseInt(expectedVersion, 10) || 1,
      expected_material_version: Number.parseInt(expectedMatVersion, 10) || 1,
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
          current_sources: currentSources.map((s) => ({
            stock_lot_id: s.stock_lot_id.trim(),
            expected_lot_material_version: Number.parseInt(s.expected_lot_material_version, 10) || 1,
            expected_stock_version: Number.parseInt(s.expected_stock_version, 10) || 1,
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
    setBusy(true);
    setError(null);
    setReplayed(false);

    const base = `/api/v1/chapters/${chapterId}`;
    const map: Record<IssueOpKind, { method: 'POST' | 'PUT'; path: string }> = {
      prepare: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/actual-issues` },
      revise: { method: 'PUT', path: `${base}/actual-issues/${issueId.trim()}` },
      ack: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/acknowledgments` },
      post: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/post` },
      reconcile: { method: 'POST', path: `${base}/actual-issues/${issueId.trim()}/reconciliations` },
    };
    const target = map[opKind];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, buildBody(), key);
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
        </div>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn secondary" onClick={() => void listRfIssues()} disabled={!rfId.trim()}>
            List RF Issues
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('detail')} disabled={!issueId.trim()}>
            Read Detail
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('history')} disabled={!issueId.trim()}>
            History
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('movements')} disabled={!issueId.trim()}>
            Movements
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('related')} disabled={!issueId.trim()}>
            Related
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('reconciliation')} disabled={!issueId.trim()}>
            Reconciliation
          </button>
          <button type="button" className="btn secondary" onClick={() => void readIssuePart('print')} disabled={!issueId.trim()}>
            Print Sheet
          </button>
        </div>

        {issuesJson !== null && <pre className="json-box">{JSON.stringify(issuesJson, null, 2)}</pre>}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Issue Transition (`X-Action-Key`)</h3>
          <form onSubmit={executeIssueOp}>
            <div className="field" style={{ marginBottom: '0.55rem' }}>
              <label htmlFor="iss-op">Operation</label>
              <select id="iss-op" value={opKind} onChange={(e) => setOpKind(e.target.value as IssueOpKind)}>
                <option value="prepare">1. POST Prepare Actual Issue</option>
                <option value="revise">PUT Revise Prepared Issue</option>
                <option value="ack">2. POST Match Paper Acknowledgment</option>
                <option value="post">3. POST Commit Actual Issue</option>
                <option value="reconcile">POST Record Uncertain Reconciliation</option>
              </select>
            </div>

            {opKind !== 'prepare' && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>expected_version</label>
                  <input type="number" min={1} required value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)} />
                </div>
                {opKind !== 'reconcile' && (
                  <div className="field">
                    <label>expected_material_version</label>
                    <input type="number" min={1} required value={expectedMatVersion} onChange={(e) => setExpectedMatVersion(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {(opKind === 'prepare' || opKind === 'revise' || opKind === 'post') && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>expected_rf_version</label>
                  <input type="number" min={1} required value={expectedRfVersion} onChange={(e) => setExpectedRfVersion(e.target.value)} />
                </div>
                <div className="field">
                  <label>expected_rf_material_version</label>
                  <input type="number" min={1} required value={expectedRfMatVersion} onChange={(e) => setExpectedRfMatVersion(e.target.value)} />
                </div>
                <div className="field">
                  <label>expected_rf_progress_version</label>
                  <input type="number" min={1} required value={expectedRfProgressVersion} onChange={(e) => setExpectedRfProgressVersion(e.target.value)} />
                </div>
              </div>
            )}

            {(opKind === 'prepare' || opKind === 'revise') && (
              <>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field">
                    <label>recipient_id UUID</label>
                    <input required value={recipientId} onChange={(e) => setRecipientId(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>handed_over_at</label>
                    <input required value={handedOverAt} onChange={(e) => setHandedOverAt(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>acknowledged_at</label>
                    <input required value={acknowledgedAt} onChange={(e) => setAcknowledgedAt(e.target.value)} />
                  </div>
                </div>
                <label className="row" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={acceptsPartial} onChange={(e) => setAcceptsPartial(e.target.checked)} />
                  <span>recipient_accepts_partial</span>
                </label>
                {opKind === 'revise' && (
                  <div className="field" style={{ marginBottom: '0.5rem' }}>
                    <label>Revision Reason</label>
                    <input required value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} />
                  </div>
                )}

                <div style={{ marginBottom: '0.6rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <strong>Issue Batch Lines &amp; Targets</strong>
                    <button type="button" className="btn secondary" onClick={() => setIssueLines((p) => [...p, emptyIssueLine()])}>
                      + Batch Line
                    </button>
                  </div>
                  {issueLines.map((ln, idx) => (
                    <div key={idx} style={{ padding: '0.45rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.35rem', marginBottom: '0.45rem' }}>
                      <div className="row" style={{ marginBottom: '0.35rem' }}>
                        <div className="field">
                          <label>rf_line_id</label>
                          <input
                            required
                            value={ln.rf_line_id}
                            onChange={(e) => setIssueLines((p) => p.map((x, i) => (i === idx ? { ...x, rf_line_id: e.target.value } : x)))}
                          />
                        </div>
                        <div className="field">
                          <label>reservation_id</label>
                          <input
                            required
                            value={ln.reservation_id}
                            onChange={(e) => setIssueLines((p) => p.map((x, i) => (i === idx ? { ...x, reservation_id: e.target.value } : x)))}
                          />
                        </div>
                        <div className="field" style={{ maxWidth: '6.5rem' }}>
                          <label>res v</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={ln.expected_reservation_version}
                            onChange={(e) =>
                              setIssueLines((p) => p.map((x, i) => (i === idx ? { ...x, expected_reservation_version: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div className="field" style={{ maxWidth: '6.5rem' }}>
                          <label>res mVer</label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={ln.expected_reservation_material_version}
                            onChange={(e) =>
                              setIssueLines((p) =>
                                p.map((x, i) => (i === idx ? { ...x, expected_reservation_material_version: e.target.value } : x)),
                              )
                            }
                          />
                        </div>
                      </div>
                      <StockRangeRows
                        label="Selected Reserved Ranges"
                        rows={ln.targets}
                        onChange={(next) => setIssueLines((p) => p.map((x, i) => (i === idx ? { ...x, targets: next } : x)))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {opKind === 'ack' && (
              <>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field" style={{ maxWidth: '9rem' }}>
                    <label>Snapshot material_version</label>
                    <input type="number" min={1} required value={snapshotMatVer} onChange={(e) => setSnapshotMatVer(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>expected_snapshot.sha256</label>
                    <input required value={snapshotSha} onChange={(e) => setSnapshotSha(e.target.value)} />
                  </div>
                </div>
                <EvidenceBindingFields label="Signed IS/AR Evidence Binding" value={evidenceBinding} onChange={setEvidenceBinding} />
                <label className="row" style={{ marginBottom: '0.6rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={matchesPaper} onChange={(e) => setMatchesPaper(e.target.checked)} />
                  <span>Confirmed physically inspected paper matches batch (`matches_paper: true`)</span>
                </label>
              </>
            )}

            {opKind === 'post' && (
              <>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>acknowledgment_id UUID</label>
                  <input required value={acknowledgmentId} onChange={(e) => setAcknowledgmentId(e.target.value)} />
                </div>
                <div style={{ marginBottom: '0.6rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong>Current Sources Pin</strong>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setCurrentSources((p) => [...p, { stock_lot_id: '', expected_lot_material_version: '1', expected_stock_version: '1' }])
                      }
                    >
                      + Source
                    </button>
                  </div>
                  {currentSources.map((src, idx) => (
                    <div key={idx} className="row" style={{ marginBottom: '0.35rem' }}>
                      <div className="field">
                        <label>stock_lot_id</label>
                        <input
                          required
                          value={src.stock_lot_id}
                          onChange={(e) => setCurrentSources((p) => p.map((x, i) => (i === idx ? { ...x, stock_lot_id: e.target.value } : x)))}
                        />
                      </div>
                      <div className="field" style={{ maxWidth: '6.5rem' }}>
                        <label>lot mVer</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={src.expected_lot_material_version}
                          onChange={(e) =>
                            setCurrentSources((p) => p.map((x, i) => (i === idx ? { ...x, expected_lot_material_version: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="field" style={{ maxWidth: '6.5rem' }}>
                        <label>stockVer</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={src.expected_stock_version}
                          onChange={(e) =>
                            setCurrentSources((p) => p.map((x, i) => (i === idx ? { ...x, expected_stock_version: e.target.value } : x)))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {opKind === 'reconcile' && (
              <>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field">
                    <label>finding</label>
                    <select
                      value={finding}
                      onChange={(e) => setFinding(e.target.value as 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed')}
                    >
                      <option value="no_handover">no_handover</option>
                      <option value="handed_over_unposted">handed_over_unposted</option>
                      <option value="committed">committed</option>
                      <option value="disputed">disputed</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>reason</label>
                    <input required value={reconcileReason} onChange={(e) => setReconcileReason(e.target.value)} />
                  </div>
                </div>
                <label className="row" style={{ marginBottom: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={attachReconcileEvidence} onChange={(e) => setAttachReconcileEvidence(e.target.checked)} />
                  <span>Include evidence binding</span>
                </label>
                {attachReconcileEvidence && (
                  <EvidenceBindingFields label="Reconciliation Evidence Binding" value={evidenceBinding} onChange={setEvidenceBinding} />
                )}
              </>
            )}

            <button className="btn" type="submit" disabled={busy}>
              Run Issue Operation
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Issue Outcome Lookup &amp; Printout</h3>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="iss-lkp">X-Action-Key UUID</label>
                <input id="iss-lkp" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Find by Key
              </button>
            </div>
          </form>
          <form onSubmit={lookupByOpId}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="iss-opid">operation_id UUID</label>
                <input id="iss-opid" required value={lookupOpId} onChange={(e) => setLookupOpId(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Read Operation ID
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
