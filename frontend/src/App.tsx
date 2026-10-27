import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import type { HealthResult } from './health';
import { LoginPage } from './LoginPage';
import type { AuthScreenMode } from './LoginPage';

const messages = {
  checking: { title: 'Checking connection', description: 'Contacting the service and checking database connectivity.' },
  connected: { title: 'Connection ready', description: 'The service responded and database connectivity was confirmed for this check.' },
  unavailable: { title: 'Connection unavailable', description: 'Connectivity could not be confirmed. Check that the local services are running, then try again.' },
};

function resolveInitialRoute(): { mode: 'login-flow' | 'health'; screen: AuthScreenMode } {
  if (typeof window === 'undefined') {
    return { mode: 'login-flow', screen: 'login' };
  }
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  if (params.get('view') === 'health' || path === '/health') {
    return { mode: 'health', screen: 'login' };
  }
  const screenParam = params.get('screen');
  if (screenParam === 'mfa' || path === '/auth' || path === '/mfa') {
    return { mode: 'login-flow', screen: 'mfa' };
  }
  if (screenParam === 'recovery' || path === '/recovery') {
    return { mode: 'login-flow', screen: 'recovery' };
  }
  if (screenParam === 'revoked' || path === '/revoked') {
    return { mode: 'login-flow', screen: 'revoked' };
  }
  if (screenParam === 'verified' || path === '/verified') {
    return { mode: 'login-flow', screen: 'verified' };
  }
  return { mode: 'login-flow', screen: 'login' };
}

export function App() {
  const route = resolveInitialRoute();
  const [status, setStatus] = useState<HealthResult['status'] | 'checking'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (route.mode !== 'health') return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    void checkHealth(signal).then((result) => {
      if (!controller.signal.aborted) setStatus(result.status);
    });
    return () => controller.abort();
  }, [attempt, route.mode]);

  if (route.mode === 'login-flow') {
    return <LoginPage initialScreen={route.screen} />;
  }

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
