import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import type { HealthResult } from './health';
import { LoginPage } from './LoginPage';
import type { AuthScreenMode, ResolvedVerifiedSession, VerifiedSessionData } from './LoginPage';
import { CreateChapterPage } from './CreateChapterPage';
import type { SignupStepMode } from './CreateChapterPage';
import { initializeCsrf, signOut } from './authApi';
import { BatCaveShell, useBatCaveToast } from './BatCaveShell';
import { S02OfficerDashboard } from './S02OfficerDashboard';
import { getInitialSoundsEnabled, playClickPen } from './batcaveAudio';
import { HalftoneWaveCanvas } from './HalftoneWaveCanvas';
import { useBatCaveTheme } from './batcaveTheme';
import { P03RecordWorkspace } from './P03RecordWorkspace';
import { P02AdminWorkspace } from './P02AdminWorkspace';
import { P04EvidenceWorkspace } from './P04EvidenceWorkspace';
import { P05InventoryWorkspace } from './P05InventoryWorkspace';
import { P06OpeningWorkspace } from './P06OpeningWorkspace';
import { P07RequisitionWorkspace } from './P07RequisitionWorkspace';
import { P08PurchasingWorkspace } from './P08PurchasingWorkspace';
import { P09QuotationPoWorkspace } from './P09QuotationPoWorkspace';
import { P10SupplierReceivingWorkspace } from './P10SupplierReceivingWorkspace';
import { P11ActualIssueWorkspace } from './P11ActualIssueWorkspace';
import { P12SalesOrderWorkspace } from './P12SalesOrderWorkspace';
import { P13PaymentVerificationWorkspace } from './P13PaymentVerificationWorkspace';
import { P14TwoClocksExpiryWorkspace } from './P14TwoClocksExpiryWorkspace';
import { P15CustomerReleaseWorkspace } from './P15CustomerReleaseWorkspace';
import { P16DonationRestrictionWorkspace } from './P16DonationRestrictionWorkspace';
import { P17CountVarianceAdjWorkspace } from './P17CountVarianceAdjWorkspace';
import { P18ClaimReturnReplacementWorkspace } from './P18ClaimReturnReplacementWorkspace';
import { P19RefundExceptionWorkspace } from './P19RefundExceptionWorkspace';
import { P20BoothCheckoutWorkspace } from './P20BoothCheckoutWorkspace';
import { P21BoothSaleOrWorkspace } from './P21BoothSaleOrWorkspace';
import { P22ManualOutageWorkspace } from './P22ManualOutageWorkspace';
import { P23BoothCloseoutWorkspace } from './P23BoothCloseoutWorkspace';
import { P24ReportsQueuesWorkspace } from './P24ReportsQueuesWorkspace';
import { P25OperationsMapWorkspace } from './P25OperationsMapWorkspace';
import { P26CutoverSubscriptionWorkspace } from './P26CutoverSubscriptionWorkspace';
import { P27HostReleaseWorkspace } from './P27HostReleaseWorkspace';
import { P28RecoveryHandoffWorkspace } from './P28RecoveryHandoffWorkspace';
import { P29AcceptanceDossierWorkspace } from './P29AcceptanceDossierWorkspace';

const messages = {
  checking: { title: 'Checking connection', description: 'Contacting the service and checking database connectivity.' },
  connected: { title: 'Connection ready', description: 'The service responded and database connectivity was confirmed for this check.' },
  unavailable: { title: 'Connection unavailable', description: 'Connectivity could not be confirmed. Check that the local services are running, then try again.' },
};

export type AppRouteMode =
  | 'login-flow'
  | 'create-chapter'
  | 'dashboard'
  | 'p02-admin'
  | 'p03-records'
  | 'p04-evidence'
  | 'p05-inventory'
  | 'p06-opening'
  | 'p07-requisitions'
  | 'p08-purchasing'
  | 'p09-quotations'
  | 'p10-receiving'
  | 'p11-issues'
  | 'p12-sales'
  | 'p13-payments'
  | 'p14-clocks'
  | 'p15-releases'
  | 'p16-donations'
  | 'p17-variance-adj'
  | 'p18-claims'
  | 'p19-refunds'
  | 'p20-booth-checkout'
  | 'p21-booth-sale'
  | 'p22-manual-outage'
  | 'p23-booth-closeout'
  | 'p24-reports'
  | 'p25-operations-map'
  | 'p26-cutover'
  | 'p27-host-release'
  | 'p28-recovery'
  | 'p29-acceptance'
  | 'health';

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
  if (view === 'dashboard' || view === 'my-work' || path === '/dashboard' || path === '/my-work') {
    return { mode: 'dashboard', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p02' || view === 'admin' || path === '/p02' || path === '/admin') {
    return { mode: 'p02-admin', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p03' || view === 'records' || path === '/p03' || path === '/records') {
    return { mode: 'p03-records', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p04' || view === 'evidence' || path === '/p04' || path === '/evidence') {
    return { mode: 'p04-evidence', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p05' || view === 'inventory' || path === '/p05' || path === '/inventory') {
    return { mode: 'p05-inventory', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p06' || view === 'opening' || path === '/p06' || path === '/opening') {
    return { mode: 'p06-opening', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p07' || view === 'requisitions' || path === '/p07' || path === '/requisitions') {
    return { mode: 'p07-requisitions', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p08' || view === 'purchasing' || path === '/p08' || path === '/purchasing') {
    return { mode: 'p08-purchasing', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p09' || view === 'quotations' || path === '/p09' || path === '/quotations') {
    return { mode: 'p09-quotations', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p10' || view === 'receiving' || path === '/p10' || path === '/receiving') {
    return { mode: 'p10-receiving', screen: 'login', signupStep: 'create-chapter' };
  }
  if (
    view === 'p11' ||
    view === 'issues' ||
    view === 'issuance' ||
    path === '/p11' ||
    path === '/issues' ||
    path === '/issuance'
  ) {
    return { mode: 'p11-issues', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p12' || view === 'sales-orders' || path === '/p12' || path === '/sales-orders') {
    return { mode: 'p12-sales', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p13' || view === 'payments' || path === '/p13' || path === '/payments') {
    return { mode: 'p13-payments', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p14' || view === 'clocks' || path === '/p14' || path === '/clocks') {
    return { mode: 'p14-clocks', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p15' || view === 'releases' || path === '/p15' || path === '/releases') {
    return { mode: 'p15-releases', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p16' || view === 'donations' || path === '/p16' || path === '/donations') {
    return { mode: 'p16-donations', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p17' || view === 'variance-adj' || path === '/p17' || path === '/variance-adj') {
    return { mode: 'p17-variance-adj', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p18' || view === 'claims' || path === '/p18' || path === '/claims') {
    return { mode: 'p18-claims', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p19' || view === 'refunds' || path === '/p19' || path === '/refunds') {
    return { mode: 'p19-refunds', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p20' || view === 'booth-checkout' || path === '/p20' || path === '/booth-checkout') {
    return { mode: 'p20-booth-checkout', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p21' || view === 'booth-sale' || path === '/p21' || path === '/booth-sale') {
    return { mode: 'p21-booth-sale', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p22' || view === 'manual-outage' || path === '/p22' || path === '/manual-outage') {
    return { mode: 'p22-manual-outage', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p23' || view === 'booth-closeout' || path === '/p23' || path === '/booth-closeout') {
    return { mode: 'p23-booth-closeout', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p24' || view === 'reports' || path === '/p24' || path === '/reports') {
    return { mode: 'p24-reports', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p25' || view === 'operations-map' || path === '/p25' || path === '/operations-map') {
    return { mode: 'p25-operations-map', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p26' || view === 'cutover' || path === '/p26' || path === '/cutover') {
    return { mode: 'p26-cutover', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p27' || view === 'host-release' || path === '/p27' || path === '/host-release') {
    return { mode: 'p27-host-release', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p28' || view === 'recovery-handoff' || path === '/p28' || path === '/recovery-handoff') {
    return { mode: 'p28-recovery', screen: 'login', signupStep: 'create-chapter' };
  }
  if (view === 'p29' || view === 'acceptance' || path === '/p29' || path === '/acceptance') {
    return { mode: 'p29-acceptance', screen: 'login', signupStep: 'create-chapter' };
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
  if (view === 'officer-connect-auth' || path === '/officer-connect-auth') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'officer-connect-auth' };
  }
  if (view === 'officer-save-recovery' || path === '/officer-save-recovery') {
    return { mode: 'create-chapter', screen: 'login', signupStep: 'officer-save-recovery' };
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
  const [dashboardSession, setDashboardSession] = useState<ResolvedVerifiedSession | undefined>();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [status, setStatus] = useState<HealthResult['status'] | 'checking'>('checking');
  const [attempt, setAttempt] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getInitialSoundsEnabled());
  const { toast, isExiting, showToast, dismissToast } = useBatCaveToast();
  const { resolvedTheme } = useBatCaveTheme();

  useEffect(() => {
    void initializeCsrf();
  }, []);

  useEffect(() => {
    if (routeMode !== 'health') return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
    void checkHealth(signal).then((result) => {
      if (!controller.signal.aborted) setStatus(result.status);
    });
    return () => controller.abort();
  }, [attempt, routeMode]);

  async function handleDashboardSignOut() {
    if (isSigningOut) return;
    playClickPen(soundEnabled);
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
      setVerifiedSession(undefined);
      setDashboardSession(undefined);
      setAuthScreen('login');
      setRouteMode('login-flow');
      showToast({ tone: 'info', text: 'Signed out safely' });
    }
  }

  if (routeMode === 'create-chapter') {
    return (
      <CreateChapterPage
        key={signupStep}
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

  if (routeMode === 'dashboard') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <S02OfficerDashboard
          dashboardSession={dashboardSession}
          soundEnabled={soundEnabled}
          isSigningOut={isSigningOut}
          onOpenRoute={(nextRoute) => setRouteMode(nextRoute)}
          onSignOut={() => void handleDashboardSignOut()}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p02-admin') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P02AdminWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p03-records') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P03RecordWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p04-evidence') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P04EvidenceWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p05-inventory') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P05InventoryWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p06-opening') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P06OpeningWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p07-requisitions') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P07RequisitionWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p08-purchasing') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P08PurchasingWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p09-quotations') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P09QuotationPoWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p10-receiving') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P10SupplierReceivingWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p11-issues') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P11ActualIssueWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p12-sales') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P12SalesOrderWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p13-payments') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P13PaymentVerificationWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p14-clocks') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P14TwoClocksExpiryWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p15-releases') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P15CustomerReleaseWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p16-donations') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P16DonationRestrictionWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p17-variance-adj') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P17CountVarianceAdjWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p18-claims') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P18ClaimReturnReplacementWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p19-refunds') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P19RefundExceptionWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p20-booth-checkout') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P20BoothCheckoutWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p21-booth-sale') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P21BoothSaleOrWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p22-manual-outage') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P22ManualOutageWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p23-booth-closeout') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P23BoothCloseoutWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p24-reports') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P24ReportsQueuesWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p25-operations-map') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P25OperationsMapWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p26-cutover') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P26CutoverSubscriptionWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p27-host-release') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P27HostReleaseWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p28-recovery') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P28RecoveryHandoffWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'p29-acceptance') {
    return (
      <BatCaveShell
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
        toast={toast}
        toastExiting={isExiting}
        onDismissToast={dismissToast}
      >
        <P29AcceptanceDossierWorkspace
          soundEnabled={soundEnabled}
          onBackToDashboard={() => setRouteMode('dashboard')}
          onNotify={(tone, text) => showToast({ tone, text })}
        />
      </BatCaveShell>
    );
  }

  if (routeMode === 'login-flow') {
    return (
      <LoginPage
        key={authScreen}
        initialScreen={authScreen}
        verifiedSessionData={verifiedSession}
        onNavigateToCreateChapter={() => {
          setSignupStep('create-chapter');
          setRouteMode('create-chapter');
        }}
        onMfaEnrollmentRequired={() => {
          setSignupStep('connect-auth');
          setRouteMode('create-chapter');
        }}
        onEnterDashboard={(resolved) => {
          setDashboardSession(resolved);
          setRouteMode('dashboard');
        }}
      />
    );
  }

  function retry() {
    setStatus('checking');
    setAttempt((previous) => previous + 1);
  }

  return (
    <>
      <div aria-hidden="true" className="backdrop-halftone-container has-canvas">
        <div className="stitch-flare-layer">
          <div className="stitch-flare stitch-flare-left" />
          <div className="stitch-flare stitch-flare-right" />
          <div className="stitch-flare stitch-flare-ambient" />
        </div>
        <HalftoneWaveCanvas theme={resolvedTheme} />
      </div>
      <main className="status-shell">
        <section className="surface-card status-card" aria-live="polite">
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
    </>
  );
}
