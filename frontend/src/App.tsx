import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import type { HealthResult } from './health';
import { LoginPage } from './LoginPage';
import type { AuthScreenMode } from './LoginPage';
import { CreateChapterPage } from './CreateChapterPage';

const messages = {
  checking: { title: 'Checking connection', description: 'Contacting the service and checking database connectivity.' },
  connected: { title: 'Connection ready', description: 'The service responded and database connectivity was confirmed for this check.' },
  unavailable: { title: 'Connection unavailable', description: 'Connectivity could not be confirmed. Check that the local services are running, then try again.' },
};

export type AppRouteMode = 'login-flow' | 'create-chapter' | 'health';

interface ResolvedRoute {
  mode: AppRouteMode;
  screen: AuthScreenMode;
}

function resolveInitialRoute(): ResolvedRoute {
  if (typeof window === 'undefined') {
    return { mode: 'login-flow', screen: 'login' };
  }
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();

  if (params.get('view') === 'health' || path === '/health') {
    return { mode: 'health', screen: 'login' };
  }

  if (
    params.get('view') === 'create-chapter' ||
    params.get('view') === 'signup' ||
    params.get('screen') === 'signup' ||
    path === '/create-chapter' ||
    path === '/signup'
  ) {
    return { mode: 'create-chapter', screen: 'login' };
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
  const initial = resolveInitialRoute();
  const [routeMode, setRouteMode] = useState<AppRouteMode>(initial.mode);
  const [authScreen, setAuthScreen] = useState<AuthScreenMode>(initial.screen);
  const [status, setStatus] = useState<HealthResult['status'] | 'checking'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (routeMode !== 'health') return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    void checkHealth(signal).then((result) => {
      if (!controller.signal.aborted) setStatus(result.status);
    });
    return () => controller.abort();
  }, [attempt, routeMode]);

  if (routeMode === 'create-chapter') {
    return (
      <CreateChapterPage
        onNavigateToLogin={() => {
          setRouteMode('login-flow');
          setAuthScreen('login');
        }}
      />
    );
  }

  if (routeMode === 'login-flow') {
    return (
      <LoginPage
        initialScreen={authScreen}
        onNavigateToCreateChapter={() => setRouteMode('create-chapter')}
      />
    );
  }

  function retry() {
    setStatus('checking');
    setAttempt((previous) => previous + 1);
  }

  return (
    <main className="status-shell">
      <section className="status-card" aria-live="polite">
        <p className="eyebrow">Service status</p>
        <h1>{messages[status].title}</h1>
        <p className="message">{messages[status].description}</p>
        <div className="button-group">
          <button
            type="button"
            className="retry-button"
            onClick={retry}
            disabled={status === 'checking'}
          >
            Check again
          </button>
          <button
            type="button"
            className="login-toggle-button"
            onClick={() => {
              setRouteMode('login-flow');
              setAuthScreen('login');
            }}
          >
            Open Sign In
          </button>
          <button
            type="button"
            className="login-toggle-button"
            onClick={() => setRouteMode('create-chapter')}
          >
            Open Create Chapter
          </button>
        </div>
      </section>
    </main>
  );
}
