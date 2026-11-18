import { useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import './login.css';
import { BatCaveShell, useBatCaveToast } from './BatCaveShell';
import { ColdCarbonCrystalCanvas } from './ColdCarbonCrystalCanvas';
import { NavFlowHeader } from './NavFlowHeader';
import {
  getInitialSoundsEnabled,
  handleGuardedHover,
  playApplePay,
  playClickPen,
  playErrorTone,
  playScribblenauts,
} from './batcaveAudio';
import { signIn, signOut, verifyMfaChallenge } from './authApi';
import type { AuthenticatedSession } from './authApi';

export type AuthScreenMode = 'login' | 'mfa' | 'recovery' | 'revoked' | 'verified';

export interface VerifiedSessionData {
  userName?: string | undefined;
  authenticatedUnder?: string | undefined;
  tierSummary?: string | undefined;
  activeChapter?: string | undefined;
  grantedDuties?: string | undefined;
  governanceConstraints?: string | undefined;
}

export interface ResolvedVerifiedSession {
  userName: string;
  authenticatedUnder: string;
  tierSummary: string;
  activeChapter: string;
  grantedDuties: string;
  governanceConstraints: string;
}

const EMPTY_VERIFIED_FALLBACK: ResolvedVerifiedSession = {
  userName: 'Verified Officer',
  authenticatedUnder: 'Verified Officer',
  tierSummary: 'Chapter Operations',
  activeChapter: 'Assigned Chapter',
  grantedDuties: 'Chapter Operations',
  governanceConstraints: 'Standard chapter governance rules apply',
};

interface LoginPageProps {
  initialScreen?: AuthScreenMode | undefined;
  verifiedSessionData?: VerifiedSessionData | undefined;
  onNavigateToCreateChapter?: (() => void) | undefined;
  onMfaEnrollmentRequired?: (() => void) | undefined;
  onSignInSuccess?: ((session: AuthenticatedSession) => void) | undefined;
  onEnterDashboard?: ((sessionData: ResolvedVerifiedSession) => void) | undefined;
}

export function LoginPage({
  initialScreen = 'login',
  verifiedSessionData: initialSessionData,
  onNavigateToCreateChapter,
  onMfaEnrollmentRequired,
  onSignInSuccess,
  onEnterDashboard,
}: LoginPageProps) {
  const [screen, setScreen] = useState<AuthScreenMode>(initialScreen);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [recoveryCode, setRecoveryCode] = useState('');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [activeChallengeId, setActiveChallengeId] = useState<string>('chl_active');
  const [hasActiveChallenge, setHasActiveChallenge] = useState<boolean>(initialScreen === 'mfa');
  const [recoveryOrigin, setRecoveryOrigin] = useState<'login' | 'mfa'>(
    initialScreen === 'mfa' ? 'mfa' : 'login'
  );
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [recoveryInvalid, setRecoveryInvalid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<VerifiedSessionData | undefined>(initialSessionData);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getInitialSoundsEnabled());
  const { toast, isExiting, showToast, dismissToast } = useBatCaveToast();

  function resetSensitiveInputs(clearEmail = false) {
    if (clearEmail) {
      setEmail('');
      setSessionData(undefined);
    }
    setPassword('');
    setShowPassword(false);
    setOtp(['', '', '', '', '', '']);
    setRecoveryCode('');
    setActiveChallengeId('chl_active');
    setHasActiveChallenge(false);
    setOtpInvalid(false);
    setRecoveryInvalid(false);
  }

  const effectiveSessionData: ResolvedVerifiedSession = {
    userName: sessionData?.userName || initialSessionData?.userName || EMPTY_VERIFIED_FALLBACK.userName,
    authenticatedUnder:
      sessionData?.authenticatedUnder ||
      initialSessionData?.authenticatedUnder ||
      EMPTY_VERIFIED_FALLBACK.authenticatedUnder,
    tierSummary: sessionData?.tierSummary || initialSessionData?.tierSummary || EMPTY_VERIFIED_FALLBACK.tierSummary,
    activeChapter:
      sessionData?.activeChapter || initialSessionData?.activeChapter || EMPTY_VERIFIED_FALLBACK.activeChapter,
    grantedDuties:
      sessionData?.grantedDuties || initialSessionData?.grantedDuties || EMPTY_VERIFIED_FALLBACK.grantedDuties,
    governanceConstraints:
      sessionData?.governanceConstraints ||
      initialSessionData?.governanceConstraints ||
      EMPTY_VERIFIED_FALLBACK.governanceConstraints,
  };

  function switchScreen(
    next: AuthScreenMode,
    toastInfo?: { tone: 'success' | 'warning' | 'error' | 'info'; text: string }
  ) {
    setErrorMessage(null);
    setEmailInvalid(false);
    setPasswordInvalid(false);
    setOtpInvalid(false);
    setRecoveryInvalid(false);
    setScreen(next);
    if (toastInfo) {
      showToast(toastInfo);
    }
  }

  function applyAuthenticatedSession(session: AuthenticatedSession) {
    const data: VerifiedSessionData = {
      userName: session.user.display_name,
      authenticatedUnder: session.user.display_name,
      tierSummary: session.duties && session.duties.length > 0 ? session.duties.join(', ') : 'Chapter Operations',
      activeChapter: session.active_chapter
        ? `${session.active_chapter.name} (${session.active_chapter.code})`
        : EMPTY_VERIFIED_FALLBACK.activeChapter,
      grantedDuties:
        session.duties && session.duties.length > 0
          ? session.duties.join(', ')
          : EMPTY_VERIFIED_FALLBACK.grantedDuties,
      governanceConstraints:
        session.governance_constraints ?? EMPTY_VERIFIED_FALLBACK.governanceConstraints,
    };
    setSessionData(data);
    onSignInSuccess?.(session);
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);
    setEmailInvalid(false);
    setPasswordInvalid(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      playErrorTone(soundEnabled);
      setEmailInvalid(!trimmedEmail);
      setPasswordInvalid(!password);
      setErrorMessage('Please enter both your email address and password.');
      showToast({ tone: 'warning', text: 'Enter email and password to sign in' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      playErrorTone(soundEnabled);
      setEmailInvalid(true);
      setErrorMessage('Please enter a valid email address.');
      showToast({ tone: 'warning', text: 'Invalid email address format' });
      return;
    }

    playApplePay(soundEnabled);
    setIsLoading(true);

    try {
      const result = await signIn(trimmedEmail, password);

      if (result.kind === 'success') {
        const session = result.session;
        setOtp(['', '', '', '', '', '']);
        setRecoveryCode('');
        if (session.state === 'mfa_challenge_required') {
          setActiveChallengeId(session.challenge.id);
          setHasActiveChallenge(true);
          setRecoveryOrigin('mfa');
          switchScreen('mfa', { tone: 'info', text: '2FA verification challenge active' });
        } else if (session.state === 'authenticated') {
          applyAuthenticatedSession(session);
          switchScreen('verified', { tone: 'success', text: 'Session authenticated' });
        } else if (session.state === 'mfa_enrollment_required') {
          setPassword('');
          setShowPassword(false);
          if (onMfaEnrollmentRequired) {
            onMfaEnrollmentRequired();
          } else {
            onNavigateToCreateChapter?.();
          }
        } else {
          setHasActiveChallenge(true);
          setRecoveryOrigin('mfa');
          switchScreen('mfa', { tone: 'info', text: '2FA verification challenge active' });
        }
      } else if (result.kind === 'forbidden') {
        playErrorTone(soundEnabled);
        if (result.isRevoked) {
          switchScreen('revoked', { tone: 'error', text: 'Membership access revoked' });
        } else {
          setErrorMessage(result.message);
          showToast({ tone: 'error', text: 'Session origin blocked' });
        }
      } else {
        playErrorTone(soundEnabled);
        setErrorMessage(result.message);
        showToast({ tone: 'error', text: 'Authentication rejected' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('Unable to connect to authentication service. Please check your connection.');
      showToast({ tone: 'error', text: 'Authentication service unavailable' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaVerify() {
    if (isLoading) return;
    setOtpInvalid(false);
    const code = otp.join('');
    if (code.length < 6) {
      playErrorTone(soundEnabled);
      setOtpInvalid(true);
      setErrorMessage('Please enter all 6 digits from your Google Authenticator app.');
      showToast({ tone: 'warning', text: 'Enter all 6 verification digits' });
      return;
    }
    playApplePay(soundEnabled);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await verifyMfaChallenge(activeChallengeId, 'authenticator', code);
      if (result.kind === 'success') {
        applyAuthenticatedSession(result.session);
        switchScreen('verified', { tone: 'success', text: 'Two-factor authentication verified' });
      } else {
        playErrorTone(soundEnabled);
        setOtpInvalid(true);
        setErrorMessage(result.message);
        showToast({ tone: 'error', text: 'Invalid authenticator code' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('MFA verification error. Please try again.');
      showToast({ tone: 'error', text: 'MFA verification failed' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRecoveryVerify() {
    if (isLoading) return;
    setRecoveryInvalid(false);
    const code = recoveryCode.replace(/\s+/g, '').toUpperCase();
    if (!code) {
      playErrorTone(soundEnabled);
      setRecoveryInvalid(true);
      setErrorMessage('Please enter your single-use backup recovery code.');
      showToast({ tone: 'warning', text: 'Recovery code required' });
      return;
    }
    playApplePay(soundEnabled);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await verifyMfaChallenge(activeChallengeId, 'recovery_code', code);
      if (result.kind === 'success') {
        applyAuthenticatedSession(result.session);
        switchScreen('verified', { tone: 'success', text: 'Identity restored via recovery code' });
      } else {
        playErrorTone(soundEnabled);
        setRecoveryInvalid(true);
        setErrorMessage(result.message);
        showToast({ tone: 'error', text: 'Recovery code rejected' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('Recovery code verification failed.');
      showToast({ tone: 'error', text: 'Recovery verification error' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOutAndReturn() {
    if (isLoading) return;
    playClickPen(soundEnabled);
    setIsLoading(true);
    try {
      await signOut();
    } finally {
      setIsLoading(false);
      resetSensitiveInputs(true);
      switchScreen('login', { tone: 'info', text: 'Returned to sign in' });
    }
  }

  function handleOtpChange(index: number, value: string) {
    setErrorMessage(null);
    setOtpInvalid(false);
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit) {
      playScribblenauts(soundEnabled);
      if (index < 5) {
        otpRefs.current[index + 1]?.focus();
      }
    }
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (event.key === 'Enter') {
      void handleMfaVerify();
    }
  }

  function handleOtpPaste(text: string, event: ClipboardEvent<HTMLInputElement>) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (digits.length < 2) return;
    event.preventDefault();
    const next = ['', '', '', '', '', ''];
    digits.split('').forEach((digit, i) => {
      next[i] = digit;
    });
    setOtp(next);
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  return (
    <BatCaveShell
      soundEnabled={soundEnabled}
      onToggleSound={setSoundEnabled}
      toast={toast}
      toastExiting={isExiting}
      onDismissToast={dismissToast}
    >
      {screen === 'login' ? (
        <main className="login-workspace">
          {/* Left Column: Interactive 3D Cold-Carbon Crystal & Cryo Vapor Showcase */}
          <section className="login-brand-stage" aria-label="Cold carbon crystal 3D showcase">
            <div className="login-characters-frame">
              <ColdCarbonCrystalCanvas />
            </div>
          </section>

          {/* Right Column: Frosted Glass Login Card */}
          <div className="login-card-col">
            <section
              className="surface-card"
              aria-label="Login your Account"
              onPointerEnter={(e) => handleGuardedHover(e, soundEnabled)}
            >
              <header className="form-card-header">
                <div>
                  <h1 className="form-card-title">Login your Account</h1>
                  <p className="form-card-subtitle">
                    Sign in with your assigned chapter credentials.
                  </p>
                </div>
              </header>

              <form className="form-stack" onSubmit={handleLoginSubmit} noValidate>
                {errorMessage && (
                  <div className="callout-banner is-error" role="alert" aria-live="polite">
                    <span className="callout-dot dot-error" aria-hidden="true" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="login-email-input" className="form-label">
                      <span>Enter Email</span>
                      <span className="required-star" aria-hidden="true">*</span>
                    </label>
                  </div>
                  <div className="input-control-wrap">
                    <input
                      id="login-email-input"
                      type="email"
                      className={`form-control ${emailInvalid ? 'input-invalid' : ''}`}
                      placeholder="name@example.org"
                      autoComplete="username"
                      disabled={isLoading}
                      value={email}
                      onChange={(e) => {
                        setErrorMessage(null);
                        setEmailInvalid(false);
                        setEmail(e.target.value);
                      }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="login-password-input" className="form-label">
                      <span>Enter Password</span>
                      <span className="required-star" aria-hidden="true">*</span>
                    </label>
                  </div>
                  <div className="input-control-wrap">
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      maxLength={72}
                      className={`form-control has-toggle ${passwordInvalid ? 'input-invalid' : ''}`}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      value={password}
                      onChange={(e) => {
                        setErrorMessage(null);
                        setPasswordInvalid(false);
                        setPassword(e.target.value);
                      }}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => {
                        playClickPen(soundEnabled);
                        setShowPassword((prev) => !prev);
                      }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-submit-request"
                  disabled={isLoading}
                  aria-label={isLoading ? 'Signing in...' : 'Login'}
                >
                  <span>{isLoading ? 'Signing in...' : 'Login'}</span>
                </button>

                <div className="auth-secondary-row">
                  <button
                    type="button"
                    disabled={isLoading}
                    className="btn-batcave-secondary"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setRecoveryOrigin('login');
                      setHasActiveChallenge(false);
                      switchScreen('recovery');
                    }}
                  >
                    Forgot Password
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    className="btn-batcave-secondary is-gold"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      onNavigateToCreateChapter?.();
                    }}
                  >
                    Create Account
                  </button>
                </div>
              </form>

              <footer className="card-emblem-footer">
                <img
                  src="/assets/kamunggay/3-of-clubs.png"
                  alt="3 of Clubs"
                  className="card-clubs-emblem"
                  draggable={false}
                />
              </footer>
            </section>
          </div>
        </main>
      ) : (
        <main className="auth-centered-stage">
          {screen === 'mfa' && (
            <section
              className="auth-centered-card"
              aria-labelledby="mfa-heading"
            >
              <NavFlowHeader
                headingId="mfa-heading"
                title="Two Factor Authentication"
                subtitle="Officers must verify identity via Google Authenticator."
                disabled={isLoading}
                onBack={() => {
                  playClickPen(soundEnabled);
                  resetSensitiveInputs(false);
                  switchScreen('login');
                }}
              />

              <div className="form-stack">
                {errorMessage && (
                  <div className="callout-banner is-error" role="alert" aria-live="polite">
                    <span className="callout-dot dot-error" aria-hidden="true" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="callout-banner">
                  <span className="callout-dot dot-info" aria-hidden="true" />
                  <span>
                    Enter the 6-digit code from your Google Authenticator app. Code changes automatically every 30 seconds.
                  </span>
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">
                      6-Digit Authenticator Code<span className="required-star" aria-hidden="true">*</span>
                    </span>
                  </div>
                  <div className="otp-digit-grid" role="group" aria-label="6-digit authenticator code">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        disabled={isLoading}
                        aria-label={`Digit ${index + 1}`}
                        className={`otp-digit-input ${otpInvalid ? 'input-invalid' : ''}`}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={(e) => handleOtpPaste(e.clipboardData.getData('text'), e)}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-primary"
                  aria-label={isLoading ? 'Verifying...' : 'Verify'}
                  onClick={() => void handleMfaVerify()}
                >
                  <span>{isLoading ? 'Verifying...' : 'Verify'}</span>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-secondary"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setRecoveryOrigin('mfa');
                    switchScreen('recovery');
                  }}
                >
                  Lost device? Use Emergency Recovery Code
                </button>
              </div>
            </section>
          )}

          {screen === 'recovery' && (
            <section
              className="auth-centered-card"
              aria-labelledby="recovery-heading"
            >
              <NavFlowHeader
                headingId="recovery-heading"
                title="Emergency Recovery Code"
                subtitle="Lost your authenticator device? Use a pre-generated backup code."
                disabled={isLoading}
                onBack={() => {
                  playClickPen(soundEnabled);
                  if (recoveryOrigin === 'mfa' && hasActiveChallenge) {
                    switchScreen('mfa');
                  } else {
                    resetSensitiveInputs(false);
                    switchScreen('login');
                  }
                }}
              />

              <div className="form-stack">
                {errorMessage && (
                  <div className="callout-banner is-error" role="alert" aria-live="polite">
                    <span className="callout-dot dot-error" aria-hidden="true" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="callout-banner">
                  <span className="callout-dot dot-warning" aria-hidden="true" />
                  <span>
                    {hasActiveChallenge
                      ? 'Recovery restores existing identity only. It never grants additional chapter duties or approval authority. Single-use code will be invalidated upon login.'
                      : 'Recovery codes bypass a lost 2FA device after verifying your password. If you forgot your password entirely, request assisted recovery from your Chapter Head or Identity Administrator.'}
                  </span>
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label htmlFor="recovery-code-input" className="form-label">
                      <span>Single-Use Backup Code</span>
                      <span className="required-star" aria-hidden="true">*</span>
                    </label>
                  </div>
                  <input
                    id="recovery-code-input"
                    type="text"
                    className={`form-control is-mono ${recoveryInvalid ? 'input-invalid' : ''}`}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={isLoading}
                    value={recoveryCode}
                    onChange={(e) => {
                      setErrorMessage(null);
                      setRecoveryInvalid(false);
                      setRecoveryCode(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRecoveryVerify();
                    }}
                  />
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-primary"
                  aria-label={isLoading ? 'Authenticating...' : 'Authenticate via Recovery Code'}
                  onClick={() => void handleRecoveryVerify()}
                >
                  <span>{isLoading ? 'Authenticating...' : 'Authenticate via Recovery Code'}</span>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-secondary"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    if (recoveryOrigin === 'mfa' && hasActiveChallenge) {
                      switchScreen('mfa');
                    } else {
                      resetSensitiveInputs(false);
                      switchScreen('login');
                    }
                  }}
                >
                  {recoveryOrigin === 'mfa' && hasActiveChallenge
                    ? 'Back to Authenticator App'
                    : 'Back to Sign In'}
                </button>
              </div>
            </section>
          )}

          {screen === 'revoked' && (
            <section
              className="auth-centered-card"
              aria-labelledby="revoked-heading"
            >
              <NavFlowHeader
                headingId="revoked-heading"
                title="Access Revoked"
                subtitle="Your chapter membership has been disabled by the Chapter Head."
                disabled={isLoading}
                onBack={() => void handleSignOutAndReturn()}
              />

              <div className="form-stack">
                <div className="callout-banner is-error">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>
                    Active Session Revoked. All active sessions and CSRF tokens have been terminated on the server. Cross-chapter document links return an access explanation without revealing protected chapter records.
                  </span>
                </div>

                <div className="session-ledger">
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Affected Officer</span>
                    <span className="session-ledger-val">
                      {email.trim() || 'Disabled Chapter Membership'}
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Action Taken By</span>
                    <span className="session-ledger-val">
                      Chapter Head Authority (Session Revocation Guard)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-primary"
                  onClick={() => void handleSignOutAndReturn()}
                >
                  <span>Sign out &amp; Return to Login</span>
                </button>
              </div>
            </section>
          )}

          {screen === 'verified' && (
            <section
              className="auth-centered-card"
              aria-labelledby="verified-heading"
            >
              <NavFlowHeader
                headingId="verified-heading"
                title="Authentication Verified"
                subtitle={
                  <>
                    Welcome back,{' '}
                    <span className="kamunggay-verified-name-slot">
                      {effectiveSessionData.userName}
                    </span>
                    . Your Chapter duties have been loaded.
                  </>
                }
              />

              <div className="form-stack">
                <div className="callout-banner">
                  <span className="callout-dot dot-success" aria-hidden="true" />
                  <span>
                    Server Session Established: Authenticated under{' '}
                    <strong>{effectiveSessionData.authenticatedUnder}</strong> ({effectiveSessionData.tierSummary}).
                  </span>
                </div>

                <div className="session-ledger">
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Active Chapter</span>
                    <span className="session-ledger-val slot-chapter">
                      {effectiveSessionData.activeChapter}
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Granted Duties</span>
                    <span className="session-ledger-val slot-duties">
                      {effectiveSessionData.grantedDuties}
                    </span>
                  </div>
                  <div className="session-ledger-row">
                    <span className="session-ledger-key">Governance Constraints</span>
                    <span className="session-ledger-val slot-constraints">
                      {effectiveSessionData.governanceConstraints}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-batcave-primary"
                  onClick={() => {
                    playApplePay(soundEnabled);
                    if (onEnterDashboard) {
                      onEnterDashboard(effectiveSessionData);
                    } else {
                      void handleSignOutAndReturn();
                    }
                  }}
                >
                  <span>Enter Dashboard</span>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  className="btn-batcave-secondary"
                  onClick={() => void handleSignOutAndReturn()}
                >
                  Sign Out
                </button>
              </div>
            </section>
          )}
        </main>
      )}
    </BatCaveShell>
  );
}
