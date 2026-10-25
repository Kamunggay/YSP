import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import type { HealthResult } from './health';

const messages = {
  checking: { title: 'Checking connection', description: 'Contacting the service and checking database connectivity.' },
  connected: { title: 'Connection ready', description: 'The service responded and database connectivity was confirmed for this check.' },
  unavailable: { title: 'Connection unavailable', description: 'Connectivity could not be confirmed. Check that the local services are running, then try again.' },
};

export function App() {
  const [status, setStatus] = useState<HealthResult['status'] | 'checking'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    void checkHealth(signal).then((result) => {
      if (!controller.signal.aborted) setStatus(result.status);
    });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setStatus('checking');
    setAttempt((previous) => previous + 1);
  }

  const message = messages[status];
  return (
    <>
      <header className="masthead"><div className="brand">YSP <span>Cebu</span></div><span>Local development</span></header>
      <main>
        <div className="intro">
          <h1>A connected starting point.</h1>
          <p>Confirm the local connection before continuing development.</p>
        </div>
        <section className="connection" aria-labelledby="connection-title">
          <div className={`status-mark ${status}`} aria-hidden="true" />
          <div className="status-copy" role="status" aria-live="polite" aria-atomic="true">
            <h2 id="connection-title">{message.title}</h2>
            <p>{message.description}</p>
          </div>
          <button type="button" disabled={status === 'checking'} onClick={retry}>
            {status === 'checking' ? 'Checking…' : 'Check again'}
          </button>
        </section>
        <aside className="scope" aria-label="Development scope">
          <h2>Development baseline</h2>
          <p>Local setup only. Business operations are not available yet.</p>
          <p>This check does not sign you in or confirm a stock, payment, or posting action.</p>
        </aside>
      </main>
      <footer>YSP development baseline</footer>
    </>
  );
}
