import { ContractApiError } from '../api/client.ts';

interface OperationBannerProps {
  error: unknown;
  statusMessage?: string | null;
  replayed?: boolean;
  pendingActionKey?: string | null;
  onDismiss?: () => void;
}

export function OperationBanner({ error, statusMessage, replayed, pendingActionKey, onDismiss }: OperationBannerProps) {
  return (
    <>
      {replayed && (
        <div className="alert info">
          Original committed outcome replayed (<code>X-Action-Replayed: true</code>). Refetch current detail before acting again.
        </div>
      )}
      {statusMessage && (
        <div className="alert success" role="status">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{statusMessage}</span>
            {onDismiss && (
              <button type="button" className="btn secondary" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
      {pendingActionKey && (
        <div className="alert warn">
          Retaining uncertain action key <span className="mono">{pendingActionKey}</span> in memory for safe lookup or retry.
        </div>
      )}
      {error !== null && error !== undefined && <ErrorAlert error={error} />}
    </>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  if (error instanceof ContractApiError) {
    return (
      <div className="alert error" role="alert">
        <div>
          <strong>
            HTTP {error.status} · <span className="mono">{error.code}</span>
          </strong>
          : {error.message}
          {error.retryAfterSeconds !== undefined && ` (Retry after ${error.retryAfterSeconds}s)`}
          {error.requestId && <span className="muted mono"> [req:{error.requestId}]</span>}
        </div>
        {error.fields.length > 0 && (
          <ul style={{ margin: '0.45rem 0 0 1.2rem' }}>
            {error.fields.map((f, idx) => (
              <li key={`${f.pointer}-${idx}`}>
                <span className="mono">{f.pointer || '/'}</span> ({f.code}): {f.message}
              </li>
            ))}
          </ul>
        )}
        {error.extra?.current !== undefined && error.extra.current !== null && (
          <details style={{ marginTop: '0.5rem' }}>
            <summary>Current server snapshot returned with conflict</summary>
            <pre className="json-box">{JSON.stringify(error.extra.current, null, 2)}</pre>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="alert error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
