import { useCallback, useState } from 'react';
import { formatManilaTime } from '../api/client.ts';
import { SearchableRecordPicker } from './SearchableRecordPicker.tsx';
import type { SearchablePickerOption } from './SearchableRecordPicker.tsx';

export interface AuditHistoryEntryView {
  id: string;
  version: number;
  materialVersion: number;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string;
  occurredAt: string;
  reason: string | null;
  metaNote?: string | null;
}

export interface AuditRelatedRecordView {
  kind: string;
  id: string;
  reference: string | null;
  state: string;
  materialVersion?: number;
  lineRef?: string | null;
  warning?: string | null;
}

export interface AuditOperationRecoveryOption {
  value: string;
  label: string;
}

interface Stage2AuditPanelsProps {
  title: string;
  recordVersion: number;
  history: AuditHistoryEntryView[];
  related: AuditRelatedRecordView[];
  onRefreshAudit?: () => Promise<void>;
  onLoadVersion?: (version: number) => Promise<unknown>;
  onLoadPrintHtml?: () => Promise<string>;
  onOpenRelated?: (kind: string, id: string) => void;
  recoveryOperations?: AuditOperationRecoveryOption[];
  onLookupByActionKey?: (operationName: string, actionKey: string) => Promise<unknown>;
  onLookupByOperationId?: (operationId: string) => Promise<unknown>;
  recentOperationHint?: { operationName: string; actionKey: string; operationId?: string } | null;
}

type AuditTab = 'history' | 'versions' | 'related' | 'print' | 'recovery';

export function Stage2AuditPanels({
  title,
  recordVersion,
  history,
  related,
  onRefreshAudit,
  onLoadVersion,
  onLoadPrintHtml,
  onOpenRelated,
  recoveryOperations = [],
  onLookupByActionKey,
  onLookupByOperationId,
  recentOperationHint = null,
}: Stage2AuditPanelsProps) {
  const [tab, setTab] = useState<AuditTab>('history');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<string>(
    recordVersion > 0 ? String(recordVersion) : '',
  );
  const [versionSnapshot, setVersionSnapshot] = useState<unknown | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  const [recoveryOpName, setRecoveryOpName] = useState<string>(
    recentOperationHint?.operationName ?? recoveryOperations[0]?.value ?? '',
  );
  const [recoveryActionKey, setRecoveryActionKey] = useState<string>(
    recentOperationHint?.actionKey ?? '',
  );
  const [recoveryOpId, setRecoveryOpId] = useState<string>(
    recentOperationHint?.operationId ?? '',
  );
  const [recoveryResult, setRecoveryResult] = useState<unknown | null>(null);

  const versionOptions: Array<SearchablePickerOption<number>> = Array.from(
    { length: Math.max(recordVersion, 1) },
    (_, idx) => {
      const ver = recordVersion - idx;
      const entry = history.find((h) => h.version === ver);
      return {
        id: String(ver),
        primaryLabel: `Revision ${ver}${entry ? ` — ${entry.action}` : ''}`,
        secondaryLabel: entry
          ? `${formatManilaTime(entry.occurredAt)} by ${entry.actorName}`
          : undefined,
        badge: entry?.toStatus,
        meta: ver,
      };
    },
  );

  const recoveryOpOptions: Array<SearchablePickerOption<string>> = recoveryOperations.map(
    (op) => ({
      id: op.value,
      primaryLabel: op.label,
      secondaryLabel: op.value,
      meta: op.value,
    }),
  );

  const handleLoadVersion = useCallback(
    async (verStr: string) => {
      setSelectedVersion(verStr);
      const parsed = Number.parseInt(verStr, 10);
      if (!onLoadVersion || !Number.isFinite(parsed) || parsed < 1) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const snapshot = await onLoadVersion(parsed);
        setVersionSnapshot(snapshot);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load revision snapshot.');
      } finally {
        setBusy(false);
      }
    },
    [onLoadVersion],
  );

  const handleLoadPrint = useCallback(async () => {
    if (!onLoadPrintHtml) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const html = await onLoadPrintHtml();
      setPrintHtml(html);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate print preview.');
    } finally {
      setBusy(false);
    }
  }, [onLoadPrintHtml]);

  const handleLookupByKey = useCallback(async () => {
    if (!onLookupByActionKey || !recoveryOpName || !recoveryActionKey.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onLookupByActionKey(recoveryOpName, recoveryActionKey.trim());
      setRecoveryResult(res ?? { outcome: 'not_found', message: 'No committed operation found for that action key.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation lookup failed.');
    } finally {
      setBusy(false);
    }
  }, [onLookupByActionKey, recoveryActionKey, recoveryOpName]);

  const handleLookupById = useCallback(async () => {
    if (!onLookupByOperationId || !recoveryOpId.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onLookupByOperationId(recoveryOpId.trim());
      setRecoveryResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation lookup failed.');
    } finally {
      setBusy(false);
    }
  }, [onLookupByOperationId, recoveryOpId]);

  const handlePrintWindow = useCallback(() => {
    if (!printHtml) {
      return;
    }
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=920,height=720');
    if (popup) {
      popup.document.open();
      popup.document.write(printHtml);
      popup.document.close();
      popup.focus();
      popup.print();
    }
  }, [printHtml]);

  return (
    <section className="surface-card s2-audit-card" aria-label={`${title} audit and trace`}>
      <div className="s2-panel-header">
        <div>
          <h3 className="s2-panel-title">{title} — Audit, Links &amp; Print</h3>
          <p className="s2-panel-sub">
            Sandboxed printable view, immutable version history, linked records, and safe GET operation recovery.
          </p>
        </div>
        {onRefreshAudit && (
          <button
            type="button"
            className="btn-batcave-secondary p02-compact-btn"
            disabled={busy}
            onClick={() => void onRefreshAudit()}
          >
            Refresh Trace
          </button>
        )}
      </div>

      <div className="s2-tab-strip" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`s2-tab-btn${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          History ({history.length})
        </button>
        {onLoadVersion && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'versions'}
            className={`s2-tab-btn${tab === 'versions' ? ' is-active' : ''}`}
            onClick={() => setTab('versions')}
          >
            Revisions (v{recordVersion})
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'related'}
          className={`s2-tab-btn${tab === 'related' ? ' is-active' : ''}`}
          onClick={() => setTab('related')}
        >
          Related ({related.length})
        </button>
        {onLoadPrintHtml && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'print'}
            className={`s2-tab-btn${tab === 'print' ? ' is-active' : ''}`}
            onClick={() => {
              setTab('print');
              if (printHtml === null) {
                void handleLoadPrint();
              }
            }}
          >
            Print View
          </button>
        )}
        {(onLookupByActionKey || onLookupByOperationId) && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'recovery'}
            className={`s2-tab-btn${tab === 'recovery' ? ' is-active' : ''}`}
            onClick={() => setTab('recovery')}
          >
            Operation Recovery
          </button>
        )}
      </div>

      {error && (
        <div className="s2-inline-alert is-danger" role="alert">
          {error}
        </div>
      )}

      {tab === 'history' && (
        <div className="s2-audit-body">
          {history.length === 0 ? (
            <p className="s2-empty-hint">No revision events recorded yet.</p>
          ) : (
            <div className="s2-table-wrap">
              <table className="s2-table">
                <thead>
                  <tr>
                    <th>Ver / Mat</th>
                    <th>Action</th>
                    <th>Transition</th>
                    <th>Actor</th>
                    <th>Manila Time</th>
                    <th>Reason / Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <span className="s2-mono-pill">
                          v{entry.version} / m{entry.materialVersion}
                        </span>
                      </td>
                      <td>{entry.action}</td>
                      <td>
                        {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                      </td>
                      <td>{entry.actorName}</td>
                      <td>{formatManilaTime(entry.occurredAt)}</td>
                      <td>
                        {entry.reason ?? '—'}
                        {entry.metaNote && <div className="s2-muted-sm">{entry.metaNote}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && onLoadVersion && (
        <div className="s2-audit-body">
          <div className="s2-grid-2">
            <SearchableRecordPicker<number>
              id="s2-audit-ver-picker"
              label="Select Revision Snapshot"
              valueId={selectedVersion}
              options={versionOptions}
              onSelect={(opt) => void handleLoadVersion(opt?.id ?? '')}
              placeholder="Choose revision number..."
              emptyMessage="No revisions available."
            />
            <div className="s2-align-end">
              <button
                type="button"
                className="btn-batcave-secondary p02-compact-btn"
                disabled={busy || !selectedVersion}
                onClick={() => void handleLoadVersion(selectedVersion)}
              >
                {busy ? 'Loading...' : 'Fetch Revision'}
              </button>
            </div>
          </div>
          {versionSnapshot !== null && (
            <pre className="s2-json-pre">{JSON.stringify(versionSnapshot, null, 2)}</pre>
          )}
        </div>
      )}

      {tab === 'related' && (
        <div className="s2-audit-body">
          {related.length === 0 ? (
            <p className="s2-empty-hint">No linked downstream or upstream records found.</p>
          ) : (
            <div className="s2-related-list">
              {related.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="s2-related-row">
                  <div>
                    <div className="s2-related-head">
                      <span className="s2-badge is-neutral">{item.kind.replaceAll('_', ' ')}</span>
                      <strong>{item.reference ?? item.id}</strong>
                      <span className="s2-badge">{item.state.replaceAll('_', ' ')}</span>
                      {item.warning && <span className="s2-badge is-danger">{item.warning}</span>}
                    </div>
                    <div className="s2-muted-sm">
                      ID: {item.id}
                      {item.materialVersion ? ` · Material rev ${item.materialVersion}` : ''}
                      {item.lineRef ? ` · Line ${item.lineRef}` : ''}
                    </div>
                  </div>
                  {onOpenRelated && (
                    <button
                      type="button"
                      className="btn-batcave-secondary p02-compact-btn"
                      onClick={() => onOpenRelated(item.kind, item.id)}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'print' && onLoadPrintHtml && (
        <div className="s2-audit-body">
          <div className="s2-inline-actions">
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              disabled={busy}
              onClick={() => void handleLoadPrint()}
            >
              {busy ? 'Rendering...' : 'Reload Printable Document'}
            </button>
            {printHtml && (
              <button
                type="button"
                className="btn-batcave-primary p02-compact-btn"
                onClick={handlePrintWindow}
              >
                Print / Save PDF
              </button>
            )}
          </div>
          {printHtml ? (
            <iframe
              sandbox=""
              title={`${title} printable document`}
              srcDoc={printHtml}
              className="s2-print-frame"
            />
          ) : (
            <p className="s2-empty-hint">Click Reload Printable Document to preview escaped HTML.</p>
          )}
        </div>
      )}

      {tab === 'recovery' && (
        <div className="s2-audit-body">
          <p className="s2-muted-sm">
            When a submission times out or disconnects, verify its outcome safely by reading the committed operation record before retrying any mutation.
          </p>
          {onLookupByActionKey && recoveryOpOptions.length > 0 && (
            <div className="s2-grid-3">
              <SearchableRecordPicker<string>
                id="s2-audit-op-picker"
                label="Operation Type"
                valueId={recoveryOpName}
                options={recoveryOpOptions}
                onSelect={(opt) => setRecoveryOpName(opt?.id ?? '')}
                placeholder="Select operation..."
              />
              <div className="form-group">
                <label className="form-label" htmlFor="s2-rec-key">
                  Idempotency Action Key
                </label>
                <input
                  id="s2-rec-key"
                  className="form-control"
                  value={recoveryActionKey}
                  onChange={(e) => setRecoveryActionKey(e.target.value)}
                  placeholder="UUID returned / sent in X-Action-Key"
                />
              </div>
              <div className="s2-align-end">
                <button
                  type="button"
                  className="btn-batcave-secondary p02-compact-btn"
                  disabled={busy || !recoveryOpName || !recoveryActionKey.trim()}
                  onClick={() => void handleLookupByKey()}
                >
                  Check Action Key
                </button>
              </div>
            </div>
          )}

          {onLookupByOperationId && (
            <div className="s2-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="s2-rec-opid">
                  Or Lookup by Operation ID
                </label>
                <input
                  id="s2-rec-opid"
                  className="form-control"
                  value={recoveryOpId}
                  onChange={(e) => setRecoveryOpId(e.target.value)}
                  placeholder="Operation UUID"
                />
              </div>
              <div className="s2-align-end">
                <button
                  type="button"
                  className="btn-batcave-secondary p02-compact-btn"
                  disabled={busy || !recoveryOpId.trim()}
                  onClick={() => void handleLookupById()}
                >
                  Read Receipt
                </button>
              </div>
            </div>
          )}

          {recoveryResult !== null && (
            <pre className="s2-json-pre">{JSON.stringify(recoveryResult, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
