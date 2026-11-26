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
        <div className="callout-banner" role="status">
          <span className="callout-dot dot-info" aria-hidden="true" />
          <div>
            This request was already saved earlier, so the previous result is shown again. Refresh before making further changes.
          </div>
        </div>
      )}
      {statusMessage && (
        <div className="callout-banner" role="status">
          <span className="callout-dot dot-success" aria-hidden="true" />
          <div style={{ flex: 1 }}>{statusMessage}</div>
          {onDismiss && (
            <button type="button" className="p02-compact-btn" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
      {pendingActionKey && (
        <div className="callout-banner is-warning" role="status">
          <span className="callout-dot dot-warning" aria-hidden="true" />
          <div>
            Waiting for confirmation. Reference <span className="p03-mono-inline">{pendingActionKey}</span> is saved for this
            session so you can check status or safely retry.
          </div>
        </div>
      )}
      {error !== null && error !== undefined && <ErrorAlert error={error} />}
    </>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  if (error instanceof ContractApiError) {
    return (
      <div className="callout-banner is-error" role="alert">
        <span className="callout-dot dot-error" aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div>
            <strong>Action could not be completed:</strong> {error.message}
            {error.retryAfterSeconds !== undefined && ` (Please wait ${error.retryAfterSeconds}s before trying again)`}
            {error.requestId && <span className="p03-muted-copy"> · Ref: {error.requestId}</span>}
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
              <summary>View current server details</summary>
              <pre className="json-box">{JSON.stringify(error.extra.current, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="callout-banner is-error" role="alert">
      <span className="callout-dot dot-error" aria-hidden="true" />
      <div>{error instanceof Error ? error.message : String(error)}</div>
    </div>
  );
}
