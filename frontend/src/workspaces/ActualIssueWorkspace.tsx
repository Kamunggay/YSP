import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiGetText, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import {
  emptyEvidenceBinding,
  emptyStockRange,
  toWireEvidenceBinding,
  toWireRanges,
  type StockRangeInput,
} from '../components/structuredInputHelpers.ts';
import { EvidenceBindingFields, StockRangeRows } from '../components/StructuredInputRows.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

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
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

const ISSUE_REQUIRED_ACTIONS: Record<IssueOpKind, string[]> = {
  prepare: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read'],
  revise: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read'],
  ack: ['issue.prepare', 'rf.read', 'stock.read', 'evidence.read', 'issue.post'],
  post: ['issue.post', 'rf.read', 'stock.read', 'evidence.read'],
  reconcile: ['issue.post', 'rf.read', 'stock.read', 'evidence.read'],
};

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

export function ActualIssueWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: ActualIssueWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'workflow' | 'inspect' | 'status'>('workflow');
  const formKey = 'actual_issue_editor';

  function readSavedDraft(): {
    rfId?: string;
    issueId?: string;
    opKind?: IssueOpKind;
    recipientId?: string;
    reviseReason?: string;
    reconcileReason?: string;
    finding?: 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed';
    acknowledgmentId?: string;
    snapshotSha?: string;
  } {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as {
        rfId?: string;
        issueId?: string;
        opKind?: IssueOpKind;
        recipientId?: string;
        reviseReason?: string;
        reconcileReason?: string;
        finding?: 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed';
        acknowledgmentId?: string;
        snapshotSha?: string;
      };
    } catch {
      return {};
    }
  }

  const initialDraft = readSavedDraft();
  const [rfId, setRfId] = useState(initialDraft.rfId ?? '');
  const [issueId, setIssueId] = useState(initialDraft.issueId ?? '');
  const [opKind, setOpKind] = useState<IssueOpKind>(initialDraft.opKind ?? 'prepare');

  const [expectedRfVersion, setExpectedRfVersion] = useState('1');
  const [expectedRfMatVersion, setExpectedRfMatVersion] = useState('1');
  const [expectedRfProgressVersion, setExpectedRfProgressVersion] = useState('1');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [expectedMatVersion, setExpectedMatVersion] = useState('1');

  const [recipientId, setRecipientId] = useState(initialDraft.recipientId ?? '');
  const [handedOverAt, setHandedOverAt] = useState(nowUtcMicro);
  const [acknowledgedAt, setAcknowledgedAt] = useState(nowUtcMicro);
  const [acceptsPartial, setAcceptsPartial] = useState(false);
  const [reviseReason, setReviseReason] = useState(initialDraft.reviseReason ?? '');
  const [issueLines, setIssueLines] = useState<IssueLineSelectionInput[]>([emptyIssueLine()]);

  const [snapshotMatVer, setSnapshotMatVer] = useState('1');
  const [snapshotSha, setSnapshotSha] = useState(initialDraft.snapshotSha ?? '');
  const [matchesPaper, setMatchesPaper] = useState(true);
  const [acknowledgmentId, setAcknowledgmentId] = useState(initialDraft.acknowledgmentId ?? '');
  const [currentSources, setCurrentSources] = useState<SourcePinInput[]>([
    { stock_lot_id: '', expected_lot_material_version: '1', expected_stock_version: '1' },
  ]);

  const [finding, setFinding] = useState<'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed'>(
    initialDraft.finding ?? 'no_handover',
  );
  const [reconcileReason, setReconcileReason] = useState(initialDraft.reconcileReason ?? '');
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

  const opBlockReason = actionBlockReason(chapterAccess, ...ISSUE_REQUIRED_ACTIONS[opKind]);

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: issueId.trim() ? `Issue ${issueId.trim().slice(0, 8)} (${opKind})` : `Actual Issue (${opKind})`,
      baseVersion: Number.parseInt(expectedVersion, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({
        rfId,
        issueId,
        opKind,
        recipientId,
        reviseReason,
        reconcileReason,
        finding,
        acknowledgmentId,
        snapshotSha,
      }),
    });
    setStatusMessage('Issue handover details saved as a temporary draft for this session.');
  }

  const listRfIssues = useCallback(async () => {
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
  }, [chapterId, rfId]);

  useEffect(() => {
    if (refreshSignal === 0 || !rfId.trim()) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/actual-issues?limit=25`);
        if (active) {
          setIssuesJson(res.data);
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
  }, [chapterId, rfId, refreshSignal]);

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
      const { record, operationId } = unwrapMutationData<Record<string, unknown>>(result.data);
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(result.replayed);
      setDetailJson(result.data);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      const nextIssueId =
        typeof record.id === 'string'
          ? record.id
          : typeof record.issue_id === 'string'
            ? record.issue_id
            : undefined;
      if (opKind === 'prepare' && nextIssueId) {
        setIssueId(nextIssueId);
      }
      if (typeof record.version === 'number') {
        setExpectedVersion(String(record.version));
      }
      if (typeof record.material_version === 'number') {
        setExpectedMatVersion(String(record.material_version));
        setSnapshotMatVer(String(record.material_version));
      }
      const snap = record.snapshot && typeof record.snapshot === 'object' ? (record.snapshot as Record<string, unknown>) : null;
      if (snap && typeof snap.sha256 === 'string') {
        setSnapshotSha(snap.sha256);
      }
      const ack =
        record.acknowledgment && typeof record.acknowledgment === 'object'
          ? (record.acknowledgment as Record<string, unknown>)
          : null;
      const ackId =
        ack && typeof ack.acknowledgment_id === 'string'
          ? ack.acknowledgment_id
          : ack && typeof ack.id === 'string'
            ? ack.id
            : undefined;
      if (ackId) {
        setAcknowledgmentId(ackId);
      }
      const issueOpLabels: Record<IssueOpKind, string> = {
        prepare: 'Issue handover prepared',
        revise: 'Prepared issue updated',
        ack: 'Signed paper acknowledgment recorded',
        post: 'Stock issue completed',
        reconcile: 'Verification note recorded',
      };
      setStatusMessage(`${issueOpLabels[opKind]}. Reference: ${key}`);
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
                id="iss-rf"
                className="form-control p03-search-input"
                value={rfId}
                onChange={(e) => setRfId(e.target.value)}
                placeholder="Enter requisition reference to load issue handovers..."
                aria-label="Enter requisition reference"
              />
            </div>

            <button
              type="button"
              className="btn-batcave-primary p03-shrink-btn"
              onClick={() => {
                void listRfIssues();
                setViewTab('inspect');
              }}
              disabled={!rfId.trim()}
            >
              Load Handovers
            </button>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Stock Issue Handovers</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Issue handover views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'workflow'}
                  className={`p03-filter-pill ${viewTab === 'workflow' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('workflow')}
                >
                  Record Handover
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'inspect'}
                  className={`p03-filter-pill ${viewTab === 'inspect' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('inspect')}
                >
                  Inspect &amp; Movements
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'status'}
                  className={`p03-filter-pill ${viewTab === 'status' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('status')}
                >
                  Status &amp; Print
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

        {viewTab === 'workflow' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-label="Issue handover context references">
              <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
                Handover References &amp; Actions
              </h2>
              <div className="p02-column-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="iss-id">
                    Issue Handover Reference
                  </label>
                  <input
                    id="iss-id"
                    className="form-control"
                    value={issueId}
                    onChange={(e) => setIssueId(e.target.value)}
                  />
                </div>

                <div className="p02-compact-actions">
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('detail');
                      setViewTab('status');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Read Detail
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('history');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('movements');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Movements
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('related');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Related
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('reconciliation');
                      setViewTab('inspect');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Reconciliation
                  </button>
                  <button
                    type="button"
                    className="p02-compact-btn"
                    onClick={() => {
                      void readIssuePart('print');
                      setViewTab('status');
                    }}
                    disabled={!issueId.trim()}
                  >
                    Print Sheet
                  </button>
                </div>
              </div>
            </section>

            <section className="p03-card surface-card" aria-label="Record or update issue handover">
              <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
                Record or Update Issue Handover
              </h2>

              {opBlockReason && (
                <div className="callout-banner is-warning" style={{ marginBottom: '0.85rem' }}>
                  <span className="callout-dot dot-warning" aria-hidden="true" />
                  <span>{opBlockReason}</span>
                </div>
              )}

              <form onSubmit={executeIssueOp} className="p02-column-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="iss-op">
                    Workflow Step
                  </label>
                  <select
                    id="iss-op"
                    className="form-control"
                    value={opKind}
                    onChange={(e) => setOpKind(e.target.value as IssueOpKind)}
                  >
                    <option value="prepare">1. Prepare Issue Handover</option>
                    <option value="revise">Update Prepared Issue</option>
                    <option value="ack">2. Confirm Signed Paper Handover</option>
                    <option value="post">3. Complete &amp; Deduct Stock</option>
                    <option value="reconcile">Record Verification Note</option>
                  </select>
                </div>

                {opKind !== 'prepare' && (
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label className="form-label">Current Record Version</label>
                      <input
                        className="form-control"
                        type="number"
                        min={1}
                        required
                        value={expectedVersion}
                        onChange={(e) => setExpectedVersion(e.target.value)}
                      />
                    </div>
                    {opKind !== 'reconcile' && (
                      <div className="form-group">
                        <label className="form-label">Current Content Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={expectedMatVersion}
                          onChange={(e) => setExpectedMatVersion(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {(opKind === 'prepare' || opKind === 'revise' || opKind === 'post') && (
                  <div className="p02-three-col-grid">
                    <div className="form-group">
                      <label className="form-label">Requisition Version</label>
                      <input
                        className="form-control"
                        type="number"
                        min={1}
                        required
                        value={expectedRfVersion}
                        onChange={(e) => setExpectedRfVersion(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Content Version</label>
                      <input
                        className="form-control"
                        type="number"
                        min={1}
                        required
                        value={expectedRfMatVersion}
                        onChange={(e) => setExpectedRfMatVersion(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Progress Version</label>
                      <input
                        className="form-control"
                        type="number"
                        min={1}
                        required
                        value={expectedRfProgressVersion}
                        onChange={(e) => setExpectedRfProgressVersion(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {(opKind === 'prepare' || opKind === 'revise') && (
                  <>
                    <div className="p02-three-col-grid">
                      <div className="form-group">
                        <label className="form-label">Recipient Officer Reference</label>
                        <input
                          className="form-control"
                          required
                          value={recipientId}
                          onChange={(e) => setRecipientId(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date &amp; Time Handed Over</label>
                        <input
                          className="form-control"
                          required
                          value={handedOverAt}
                          onChange={(e) => setHandedOverAt(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date &amp; Time Acknowledged</label>
                        <input
                          className="form-control"
                          required
                          value={acknowledgedAt}
                          onChange={(e) => setAcknowledgedAt(e.target.value)}
                        />
                      </div>
                    </div>

                    <label className="p03-checkbox-row">
                      <input
                        type="checkbox"
                        className="p03-sr-checkbox"
                        checked={acceptsPartial}
                        onChange={(e) => setAcceptsPartial(e.target.checked)}
                      />
                      <span className={`p03-check-indicator ${acceptsPartial ? 'is-checked' : ''}`} aria-hidden="true">
                        ✓
                      </span>
                      <span className="p03-checkbox-main">Recipient agrees to partial handover</span>
                    </label>

                    {opKind === 'revise' && (
                      <div className="form-group">
                        <label className="form-label">Revision Reason</label>
                        <input
                          className="form-control"
                          required
                          value={reviseReason}
                          onChange={(e) => setReviseReason(e.target.value)}
                        />
                      </div>
                    )}

                    <div>
                      <div className="p03-card-header-row" style={{ marginBottom: '0.45rem' }}>
                        <strong className="form-label" style={{ margin: 0 }}>
                          Issue Batch Lines &amp; Targets
                        </strong>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={() => setIssueLines((p) => [...p, emptyIssueLine()])}
                        >
                          + Batch Line
                        </button>
                      </div>
                      <div className="p04-lines-list">
                        {issueLines.map((ln, idx) => (
                          <div key={idx} className="p04-line-card">
                            <div className="p03-two-col">
                              <div className="form-group">
                                <label className="form-label">Requisition Line Reference</label>
                                <input
                                  className="form-control"
                                  required
                                  value={ln.rf_line_id}
                                  onChange={(e) =>
                                    setIssueLines((p) =>
                                      p.map((x, i) => (i === idx ? { ...x, rf_line_id: e.target.value } : x)),
                                    )
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Reservation Reference</label>
                                <input
                                  className="form-control"
                                  required
                                  value={ln.reservation_id}
                                  onChange={(e) =>
                                    setIssueLines((p) =>
                                      p.map((x, i) => (i === idx ? { ...x, reservation_id: e.target.value } : x)),
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="p03-two-col">
                              <div className="form-group">
                                <label className="form-label">Reservation Version</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  min={1}
                                  required
                                  value={ln.expected_reservation_version}
                                  onChange={(e) =>
                                    setIssueLines((p) =>
                                      p.map((x, i) =>
                                        i === idx ? { ...x, expected_reservation_version: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Reservation Content Version</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  min={1}
                                  required
                                  value={ln.expected_reservation_material_version}
                                  onChange={(e) =>
                                    setIssueLines((p) =>
                                      p.map((x, i) =>
                                        i === idx ? { ...x, expected_reservation_material_version: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <StockRangeRows
                              label="Selected Reserved Ranges"
                              rows={ln.targets}
                              onChange={(next) =>
                                setIssueLines((p) => p.map((x, i) => (i === idx ? { ...x, targets: next } : x)))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {opKind === 'ack' && (
                  <>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label">Signed Document Version</label>
                        <input
                          className="form-control"
                          type="number"
                          min={1}
                          required
                          value={snapshotMatVer}
                          onChange={(e) => setSnapshotMatVer(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Signed Document Verification Tag</label>
                        <input
                          className="form-control"
                          required
                          value={snapshotSha}
                          onChange={(e) => setSnapshotSha(e.target.value)}
                        />
                      </div>
                    </div>
                    <EvidenceBindingFields
                      label="Signed Handover Document Binding"
                      value={evidenceBinding}
                      onChange={setEvidenceBinding}
                    />
                    <label className="p03-checkbox-row">
                      <input
                        type="checkbox"
                        className="p03-sr-checkbox"
                        checked={matchesPaper}
                        onChange={(e) => setMatchesPaper(e.target.checked)}
                      />
                      <span className={`p03-check-indicator ${matchesPaper ? 'is-checked' : ''}`} aria-hidden="true">
                        ✓
                      </span>
                      <span className="p03-checkbox-main">
                        I confirm the physically signed paper form matches this batch release
                      </span>
                    </label>
                  </>
                )}

                {opKind === 'post' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Signed Acknowledgment Reference</label>
                      <input
                        className="form-control"
                        required
                        value={acknowledgmentId}
                        onChange={(e) => setAcknowledgmentId(e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="p03-card-header-row" style={{ marginBottom: '0.45rem' }}>
                        <strong className="form-label" style={{ margin: 0 }}>
                          Batches to Deduct Stock From
                        </strong>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={() =>
                            setCurrentSources((p) => [
                              ...p,
                              { stock_lot_id: '', expected_lot_material_version: '1', expected_stock_version: '1' },
                            ])
                          }
                        >
                          + Batch
                        </button>
                      </div>
                      <div className="p04-lines-list">
                        {currentSources.map((src, idx) => (
                          <div key={idx} className="p04-line-card">
                            <div className="p02-three-col-grid">
                              <div className="form-group">
                                <label className="form-label">Stock Batch Reference</label>
                                <input
                                  className="form-control"
                                  required
                                  value={src.stock_lot_id}
                                  onChange={(e) =>
                                    setCurrentSources((p) =>
                                      p.map((x, i) => (i === idx ? { ...x, stock_lot_id: e.target.value } : x)),
                                    )
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Batch Content Version</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  min={1}
                                  required
                                  value={src.expected_lot_material_version}
                                  onChange={(e) =>
                                    setCurrentSources((p) =>
                                      p.map((x, i) =>
                                        i === idx ? { ...x, expected_lot_material_version: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label">Stock Version</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  min={1}
                                  required
                                  value={src.expected_stock_version}
                                  onChange={(e) =>
                                    setCurrentSources((p) =>
                                      p.map((x, i) => (i === idx ? { ...x, expected_stock_version: e.target.value } : x)),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {opKind === 'reconcile' && (
                  <>
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label">Verification Result</label>
                        <select
                          className="form-control"
                          value={finding}
                          onChange={(e) =>
                            setFinding(e.target.value as 'no_handover' | 'handed_over_unposted' | 'committed' | 'disputed')
                          }
                        >
                          <option value="no_handover">No Handover Occurred</option>
                          <option value="handed_over_unposted">Handed Over (Not Yet Recorded)</option>
                          <option value="committed">Completed &amp; Confirmed</option>
                          <option value="disputed">Disputed / Needs Review</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Reason</label>
                        <input
                          className="form-control"
                          required
                          value={reconcileReason}
                          onChange={(e) => setReconcileReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <label className="p03-checkbox-row">
                      <input
                        type="checkbox"
                        className="p03-sr-checkbox"
                        checked={attachReconcileEvidence}
                        onChange={(e) => setAttachReconcileEvidence(e.target.checked)}
                      />
                      <span
                        className={`p03-check-indicator ${attachReconcileEvidence ? 'is-checked' : ''}`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span className="p03-checkbox-main">Include signed document attachment</span>
                    </label>
                    {attachReconcileEvidence && (
                      <EvidenceBindingFields
                        label="Reconciliation Signed Document Binding"
                        value={evidenceBinding}
                        onChange={setEvidenceBinding}
                      />
                    )}
                  </>
                )}

                <div className="p03-action-pair">
                  <button
                    className="btn-batcave-primary p03-shrink-btn"
                    type="submit"
                    disabled={busy || opBlockReason !== null}
                    title={opBlockReason ?? undefined}
                  >
                    Submit Issue Action
                  </button>
                  <button
                    className="btn-batcave-secondary p03-shrink-btn"
                    type="button"
                    onClick={parkDraftInMemory}
                  >
                    Save Temporary Draft
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {viewTab === 'inspect' && (
          <section className="p03-card surface-card" aria-label="Handovers and movement records">
            <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
              Handover List, History &amp; Movements
            </h2>
            {issuesJson === null ? (
              <div className="s02-empty-state">
                <div className="s02-empty-heading">No handover records loaded</div>
                <div className="s02-empty-caption">
                  Enter a requisition reference in the search bar above and click “Load Handovers”.
                </div>
              </div>
            ) : (
              <pre className="json-box">{JSON.stringify(issuesJson, null, 2)}</pre>
            )}
          </section>
        )}

        {viewTab === 'status' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-label="Status lookup">
              <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
                Check Handover Submission Status
              </h2>
              <div className="p02-column-stack">
                <form onSubmit={lookupByKey} className="form-group">
                  <label className="form-label" htmlFor="iss-lkp">
                    Submission Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="iss-lkp"
                      className="form-control"
                      required
                      value={lookupKey}
                      onChange={(e) => setLookupKey(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      Check Status
                    </button>
                  </div>
                </form>

                <form onSubmit={lookupByOpId} className="form-group">
                  <label className="form-label" htmlFor="iss-opid">
                    Change Record Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="iss-opid"
                      className="form-control"
                      required
                      value={lookupOpId}
                      onChange={(e) => setLookupOpId(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      View Record
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="p03-card surface-card" aria-label="Detail and printable form">
              <h2 className="p03-section-title" style={{ marginBottom: '0.75rem' }}>
                Detail &amp; Printable Form
              </h2>
              {detailJson === null && printHtml === null ? (
                <div className="s02-empty-state">
                  <div className="s02-empty-heading">No result loaded</div>
                  <div className="s02-empty-caption">
                    Inspect a handover detail or check a submission reference on the left.
                  </div>
                </div>
              ) : (
                <div className="p02-column-stack">
                  {detailJson !== null && <pre className="json-box">{JSON.stringify(detailJson, null, 2)}</pre>}
                  {printHtml !== null && (
                    <iframe title="Actual Issue Printout" sandbox="" srcDoc={printHtml} className="stage1-print-frame" />
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
