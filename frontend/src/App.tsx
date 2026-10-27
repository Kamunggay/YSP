import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import type { HealthResult } from './health';
import { LoginPage } from './LoginPage';
import type { AuthScreenMode, VerifiedSessionData } from './LoginPage';
import { CreateChapterPage } from './CreateChapterPage';
import type { SignupStepMode } from './CreateChapterPage';

const messages = {
  checking: { title: 'Checking connection', description: 'Contacting the service and checking database connectivity.' },
  connected: { title: 'Connection ready', description: 'The service responded and database connectivity was confirmed for this check.' },
  unavailable: { title: 'Connection unavailable', description: 'Connectivity could not be confirmed. Check that the local services are running, then try again.' },
};

export type AppRouteMode = 'login-flow' | 'create-chapter' | 'health';

interface ResolvedRoute {
  mode: AppRouteMode;
  screen: AuthScreenMode;
  signupStep: SignupStepMode;
}

function resolveInitialRoute(): ResolvedRoute {
  if (typeof window === 'undefined') {
    return { mode: 'login-flow', screen: 'login', signupStep: 'create-chapter' };
  }
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const view = params.get('view');

  if (view === 'health' || path === '/health') {
    return { mode: 'health', screen: 'login', signupStep: 'create-chapter' };
  }

  if (view === 'connect-auth' || path === '/connect-auth') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'connect-auth' };
  }
  if (view === 'save-recovery' || path === '/save-recovery') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'save-recovery' };
  }
  if (view === 'invite-officer' || path === '/invite-officer') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'invite-officer' };
  }
  if (view === 'create-officer' || path === '/create-officer') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'create-officer' };
  }

  if (
    view === 'create-chapter' ||
    view === 'signup' ||
    params.get('screen') === 'signup' ||
    path === '/create-chapter' ||
    path === '/signup'
  ) {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'create-chapter' };
  }

  const screenParam = params.get('screen');
  if (screenParam === 'mfa' || path === '/auth' || path === '/mfa') {
    return { mode: 'login-flow', screen: 'mfa', signupStep: 'create-chapter' };
  }
  if (screenParam === 'recovery' || path === '/recovery') {
    return { mode: 'login-flow', screen: 'recovery', signupStep: 'create-chapter' };
  }
  if (screenParam === 'revoked' || path === '/revoked') {
    return { mode: 'login-flow', screen: 'revoked', signupStep: 'create-chapter' };
  }
  if (screenParam === 'verified' || path === '/verified') {
    return { mode: 'login-flow', screen: 'verified', signupStep: 'create-chapter' };
  }
  return { mode: 'login-flow', screen: 'login', signupStep: 'create-chapter' };
}

export function App() {
  const initial = resolveInitialRoute();
  const [routeMode, setRouteMode] = useState<AppRouteMode>(initial.mode);
  const [authScreen, setAuthScreen] = useState<AuthScreenMode>(initial.screen);
  const [signupStep, setSignupStep] = useState<SignupStepMode>(initial.signupStep);
  const [verifiedSession, setVerifiedSession] = useState<VerifiedSessionData | undefined>();
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
        initialStep={signupStep}
        onNavigateToLogin={() => {
          setRouteMode('login-flow');
          setAuthScreen('login');
        }}
        onCompleteSignup={(sessionData) => {
          setVerifiedSession(sessionData);
          setRouteMode('login-flow');
          setAuthScreen('verified');
        }}
      />
    );
  }

  if (routeMode === 'login-flow') {
    return (
      <LoginPage
        initialScreen={authScreen}
        verifiedSessionData={verifiedSession}
        onNavigateToCreateChapter={() => {
          setSignupStep('create-chapter');
          setRouteMode('create-chapter');
        }}
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
            onClick={() => {
              setSignupStep('create-chapter');
              setRouteMode('create-chapter');
            }}
          >
            Open Create Chapter
          </button>
        </div>
      </section>
    </main>
  );
}
