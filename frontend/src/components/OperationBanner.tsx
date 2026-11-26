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
          This request was already saved earlier, so the previous result is shown again. Refresh before making further changes.
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
          Waiting for confirmation. Reference <span className="mono">{pendingActionKey}</span> is saved for this session so you can check status or safely retry.
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
          <strong>Action could not be completed:</strong> {error.message}
          {error.retryAfterSeconds !== undefined && ` (Please wait ${error.retryAfterSeconds}s before trying again)`}
          {error.requestId && <span className="muted"> · Ref: {error.requestId}</span>}
        </div>
        {error.fields.length > 0 && (
          <ul style={{ margin: '0.45rem 0 0 1.2rem' }}>
            {error.fields.map((f, idx) => (
              <li key={`${f.pointer}-${idx}`}>
                {f.pointer ? `${f.pointer.replace(/^\//, '').replace(/[/_]/g, ' ')}: ` : ''}
                {f.message}
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
