import { useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react';
import './login.css';
import { signIn, signOut, verifyMfaChallenge } from './authApi';
import type { AuthenticatedSession } from './authApi';

export type AuthScreenMode = 'login' | 'mfa' | 'recovery' | 'revoked' | 'verified';

export interface VerifiedSessionData {
  userName?: string;
  authenticatedUnder?: string;
  tierSummary?: string;
  activeChapter?: string;
  grantedDuties?: string;
  governanceConstraints?: string;
}

interface LoginPageProps {
  initialScreen?: AuthScreenMode;
  verifiedSessionData?: VerifiedSessionData;
  onNavigateToCreateChapter?: () => void;
  onSignInSuccess?: (session: AuthenticatedSession) => void;
  onEnterDashboard?: () => void;
}

interface PhotoButtonProps {
  type?: 'button' | 'submit';
  unclickedSrc: string;
  clickedSrc: string;
  alt: string;
  className?: string;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}

function PhotoButton({
  type = 'button',
  unclickedSrc,
  clickedSrc,
  alt,
  className = '',
  disabled = false,
  onClick,
}: PhotoButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      className={`kamunggay-photo-btn ${pressed ? 'is-active' : ''} ${className}`.trim()}
      aria-label={alt}
      onClick={onClick}
      onPointerDown={() => {
        if (!disabled) setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) setPressed(true);
      }}
      onKeyUp={() => setPressed(false)}
      onBlur={() => setPressed(false)}
    >
      <img src={unclickedSrc} alt={alt} className="btn-unclicked" draggable={false} />
      <img src={clickedSrc} alt="" aria-hidden="true" className="btn-clicked" draggable={false} />
    </button>
  );
}

export function LoginPage({
  initialScreen = 'login',
  verifiedSessionData: initialSessionData,
  onNavigateToCreateChapter,
  onSignInSuccess,
  onEnterDashboard,
}: LoginPageProps) {
  const [screen, setScreen] = useState<AuthScreenMode>(initialScreen);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [recoveryCode, setRecoveryCode] = useState('');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [activeChallengeId, setActiveChallengeId] = useState<string>('chl_active');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<VerifiedSessionData | undefined>(initialSessionData);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn(email, password);

      if (result.kind === 'success') {
        const session = result.session;
        if (session.state === 'mfa_challenge_required') {
          setActiveChallengeId(session.challenge.id);
          setScreen('mfa');
        } else if (session.state === 'authenticated') {
          applyAuthenticatedSession(session);
          setScreen('verified');
        } else if (session.state === 'mfa_enrollment_required') {
          onNavigateToCreateChapter?.();
        } else {
          setScreen('mfa');
        }
      } else if (result.kind === 'forbidden') {
        setScreen('revoked');
      } else if (result.kind === 'invalid_credentials') {
        setErrorMessage(result.message);
      } else if (result.kind === 'throttled') {
        setErrorMessage(result.message);
      } else if (result.kind === 'invalid_input') {
        setErrorMessage(result.message);
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('Unable to connect to authentication service. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  }

  function applyAuthenticatedSession(session: AuthenticatedSession) {
    const data: VerifiedSessionData = {
      userName: session.user.display_name,
      authenticatedUnder: session.user.display_name,
      tierSummary: session.duties && session.duties.length > 0 ? session.duties.join(', ') : 'Chapter Operations',
      activeChapter: session.active_chapter ? `${session.active_chapter.name} (${session.active_chapter.code})` : 'Cebu Chapter',
      grantedDuties: session.duties && session.duties.length > 0 ? session.duties.join(', ') : 'Full Operational & Governance Authority',
      governanceConstraints: session.governance_constraints ?? 'Requires dual-custody verification for transactions over PHP 50,000.00',
    };
    setSessionData(data);
    onSignInSuccess?.(session);
  }

  async function handleMfaVerify() {
    const code = otp.join('');
    if (code.length < 6) {
      setErrorMessage('Please enter all 6 digits from your Google Authenticator app.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await verifyMfaChallenge(activeChallengeId, 'authenticator', code);
      if (result.kind === 'success') {
        applyAuthenticatedSession(result.session);
        setScreen('verified');
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('MFA verification error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRecoveryVerify() {
    const code = recoveryCode.trim();
    if (!code) {
      setErrorMessage('Please enter your single-use backup recovery code.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await verifyMfaChallenge(activeChallengeId, 'recovery_code', code);
      if (result.kind === 'success') {
        applyAuthenticatedSession(result.session);
        setScreen('verified');
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('Recovery code verification failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSignOutAndReturn() {
    setIsLoading(true);
    try {
      await signOut();
    } finally {
      setIsLoading(false);
      setErrorMessage(null);
      setEmail('');
      setPassword('');
      setOtp(['', '', '', '', '', '']);
      setRecoveryCode('');
      setScreen('login');
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
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

  // Determine which user-provided input artwork image to show
  let inputArtworkSrc = '/assets/kamunggay/email-password.png';
  const hasBoth = Boolean(email && password);
  if (hasBoth) {
    inputArtworkSrc = '/assets/kamunggay/email-and-password-has-been-put.png';
  } else if (focusedField === 'email' || email) {
    inputArtworkSrc = '/assets/kamunggay/email-clicked.png';
  } else if (focusedField === 'password' || password) {
    inputArtworkSrc = '/assets/kamunggay/password-clicked.png';
  }

  return (
    <div className={`kamunggay-viewport ${screen !== 'login' ? 'centered-mode' : ''}`}>
      {screen === 'login' && (
        <>
          {/* Top-Left YSP Cebu Logo */}
          <img
            src="/assets/kamunggay/ysp-logo.png"
            alt="Youth Service Philippines Cebu"
            className="kamunggay-ysp-logo"
            draggable={false}
          />

          {/* Left-Center Characters Collage */}
          <img
            src="/assets/kamunggay/characters-elements.png"
            alt="Chapter Operations Illustration"
            className="kamunggay-characters-collage"
            draggable={false}
          />

          {/* Bottom-Left Hero Tagline in Roboto */}
          <div className="kamunggay-hero-tagline" aria-label="Empower Your Chapter Operations.">
            <span className="line">EMPOWER</span>
            <span className="line">YOUR</span>
            <span className="line">CHAPTER</span>
            <span className="line">
              <span className="operations-orange">OPERATIONS</span>
              <span className="operations-dot">.</span>
            </span>
          </div>

          {/* Right-Side Dark Login Card */}
          <section className="kamunggay-login-card" aria-label="Login your Account">
            <form className="kamunggay-card-body" onSubmit={handleLoginSubmit} noValidate>
              {errorMessage && (
                <div className="kamunggay-auth-error" role="alert" aria-live="polite">
                  {errorMessage}
                </div>
              )}

              {/* Input Art Container: exact image with transparent inputs overlaid */}
              <div className="kamunggay-input-artwork-container">
                <img
                  src={inputArtworkSrc}
                  alt="Login your Account - Enter Email and Password"
                  className="kamunggay-input-bg-img"
                  draggable={false}
                />
                <input
                  type="email"
                  className="kamunggay-overlay-input kamunggay-overlay-email"
                  aria-label="Enter Email"
                  autoComplete="username"
                  value={email}
                  disabled={isLoading}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
                <input
                  type="password"
                  className="kamunggay-overlay-input kamunggay-overlay-password"
                  aria-label="Enter Password"
                  autoComplete="current-password"
                  value={password}
                  disabled={isLoading}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>

              {/* Photo Button Stack */}
              <div className="kamunggay-btn-stack">
                <PhotoButton
                  type="submit"
                  disabled={isLoading}
                  unclickedSrc="/assets/kamunggay/login.png"
                  clickedSrc="/assets/kamunggay/login-when-clicked.png"
                  alt={isLoading ? 'Signing in...' : 'Login'}
                />
                <PhotoButton
                  type="button"
                  disabled={isLoading}
                  unclickedSrc="/assets/kamunggay/forgot-password.png"
                  clickedSrc="/assets/kamunggay/forgot-password-when-clicked.png"
                  alt="Forgot Password"
                  onClick={() => {
                    setErrorMessage(null);
                    setScreen('recovery');
                  }}
                />
                <PhotoButton
                  type="button"
                  disabled={isLoading}
                  className="btn-create-gap"
                  unclickedSrc="/assets/kamunggay/create-account.png"
                  clickedSrc="/assets/kamunggay/create-account-when-clicked.png"
                  alt="Create Account"
                  onClick={onNavigateToCreateChapter}
                />
              </div>
            </form>

            <div className="kamunggay-card-footer">
              <img
                src="/assets/kamunggay/3-of-clubs.png"
                alt="3 of Clubs"
                className="kamunggay-clubs-logo"
                draggable={false}
              />
            </div>
          </section>
        </>
      )}

      {screen === 'mfa' && (
        <section className="kamunggay-center-card" aria-labelledby="mfa-heading">
          <img
            src="/assets/kamunggay/lock.png"
            alt=""
            aria-hidden="true"
            className="kamunggay-auth-lock-img"
            draggable={false}
          />

          <h1 id="mfa-heading" className="kamunggay-auth-heading">
            Two Factor Authentication
          </h1>
          <p className="kamunggay-auth-sub">
            Officers must verify identity via Google
            <br />
            Authenticator.
          </p>

          {errorMessage && (
            <div className="kamunggay-auth-error" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <img
            src="/assets/kamunggay/auth-message.png"
            alt="Enter the 6-digit code from your Google Authenticator app. Code changes automatically every 30 seconds."
            className="kamunggay-message-banner-img"
            draggable={false}
          />

          <div className="kamunggay-otp-row" role="group" aria-label="6-digit authenticator code">
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
                className="kamunggay-otp-box"
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                onPaste={(e) => handleOtpPaste(e.clipboardData.getData('text'), e)}
              />
            ))}
          </div>

          <div className="kamunggay-auth-btn-stack">
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/verify-button.png"
              clickedSrc="/assets/kamunggay/verify-button-when-clicked.png"
              alt={isLoading ? 'Verifying...' : 'Verify'}
              onClick={handleMfaVerify}
            />
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/lost-device-button.png"
              clickedSrc="/assets/kamunggay/lost-device-button-when-clicked.png"
              alt="Lost device? Use Emergency Recovery Code"
              onClick={() => {
                setErrorMessage(null);
                setScreen('recovery');
              }}
            />
          </div>

          <div className="kamunggay-auth-clubs-footer">
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="kamunggay-auth-clubs-logo"
              draggable={false}
            />
          </div>
        </section>
      )}

      {screen === 'recovery' && (
        <section className="kamunggay-center-card" aria-labelledby="recovery-heading">
          <img
            src="/assets/kamunggay/bell.png"
            alt=""
            aria-hidden="true"
            className="kamunggay-auth-bell-img"
            draggable={false}
          />

          <h1 id="recovery-heading" className="kamunggay-auth-heading">
            Emergency Recovery Code
          </h1>
          <p className="kamunggay-auth-sub">
            Lost your authenticator device? Use a pre-generated
            <br />
            backup code.
          </p>

          {errorMessage && (
            <div className="kamunggay-auth-error" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <img
            src="/assets/kamunggay/recovery-message.png"
            alt="Recovery restores existing identity only. It never grants additional chapter duties or approval authority. Single-use code will be invalidated upon login."
            className="kamunggay-message-banner-img"
            draggable={false}
          />

          <div className="kamunggay-recovery-field-wrap">
            <label htmlFor="recovery-code-input" className="kamunggay-recovery-label">
              Single-Use Backup Code
            </label>
            <input
              id="recovery-code-input"
              type="text"
              className="kamunggay-recovery-input"
              placeholder="XXXX - XXXX - XXXX"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isLoading}
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRecoveryVerify();
              }}
            />
          </div>

          <div className="kamunggay-auth-btn-stack">
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/auth-button.png"
              clickedSrc="/assets/kamunggay/auth-button-when-clicked.png"
              alt={isLoading ? 'Authenticating...' : 'Authenticate via Recovery Code'}
              onClick={handleRecoveryVerify}
            />
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/back-to-button.png"
              clickedSrc="/assets/kamunggay/back-to-when-clicked.png"
              alt="Back to Authenticator App"
              onClick={() => {
                setErrorMessage(null);
                setScreen('mfa');
              }}
            />
          </div>

          <div className="kamunggay-auth-clubs-footer">
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="kamunggay-auth-clubs-logo"
              draggable={false}
            />
          </div>
        </section>
      )}

      {screen === 'revoked' && (
        <section className="kamunggay-center-card" aria-labelledby="revoked-heading">
          <img
            src="/assets/kamunggay/revoked-icon.png"
            alt=""
            aria-hidden="true"
            className="kamunggay-revoked-icon-img"
            draggable={false}
          />

          <h1 id="revoked-heading" className="kamunggay-revoked-heading">
            Acces Revoked
          </h1>
          <p className="kamunggay-auth-sub" style={{ marginBottom: 'clamp(14px, 2.2vh, 24px)' }}>
            Your membership in Cebu Chapter has been disabled
            <br />
            by the Chapter Head.
          </p>

          <img
            src="/assets/kamunggay/revoked-message.png"
            alt="Active Session Revoked. All active sessions and CSRF tokens have been terminated on the server. Cross-chapter document links return an access explanation without revealing protected chapter records."
            className="kamunggay-message-banner-img"
            style={{ marginBottom: 'clamp(8px, 1.3vh, 14px)' }}
            draggable={false}
          />

          <img
            src="/assets/kamunggay/affected-and-action-taken-by.png"
            alt="Affected Officer and Action Taken by details"
            className="kamunggay-revoked-details-img"
            draggable={false}
          />

          <div className="kamunggay-auth-btn-stack">
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/sign-out-and-return-to-login.png"
              clickedSrc="/assets/kamunggay/sign-out-and-return-to-login-when-clicked.png"
              alt="Sign out & Return to Login"
              onClick={handleSignOutAndReturn}
            />
          </div>

          <div className="kamunggay-auth-clubs-footer" style={{ marginTop: 'clamp(12px, 1.9vh, 20px)' }}>
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="kamunggay-auth-clubs-logo"
              draggable={false}
            />
          </div>
        </section>
      )}

      {screen === 'verified' && (
        <section className="kamunggay-center-card" aria-labelledby="verified-heading">
          <img
            src="/assets/kamunggay/verified-icon.png"
            alt=""
            aria-hidden="true"
            className="kamunggay-verified-icon-img"
            draggable={false}
          />

          <h1 id="verified-heading" className="kamunggay-revoked-heading">
            Authentication Verified
          </h1>
          <p className="kamunggay-verified-welcome">
            <span>Welcome back,</span>
            <span className="kamunggay-verified-name-slot">
              {sessionData?.userName ?? ''}
            </span>
            <span>Your Chapter duties have been loaded.</span>
          </p>

          <div className="kamunggay-verified-banner-wrap">
            <img
              src="/assets/kamunggay/verified-message.png"
              alt="Server Session Established: Authenticated under user with tier duties"
              className="kamunggay-verified-banner-img"
              draggable={false}
            />
            {sessionData?.authenticatedUnder && (
              <span className="kamunggay-verified-banner-slot-user">
                {sessionData.authenticatedUnder}
              </span>
            )}
            {sessionData?.tierSummary && (
              <span className="kamunggay-verified-banner-slot-tier">
                {sessionData.tierSummary}
              </span>
            )}
          </div>

          <div className="kamunggay-details-box-wrap">
            <img
              src="/assets/kamunggay/details-box.png"
              alt="Active Chapter, Granted Duties, and Governance Constraints"
              className="kamunggay-details-box-img"
              draggable={false}
            />
            {sessionData?.activeChapter && (
              <span className="kamunggay-details-slot slot-chapter">
                {sessionData.activeChapter}
              </span>
            )}
            {sessionData?.grantedDuties && (
              <span className="kamunggay-details-slot slot-duties">
                {sessionData.grantedDuties}
              </span>
            )}
            {sessionData?.governanceConstraints && (
              <span className="kamunggay-details-slot slot-constraints">
                {sessionData.governanceConstraints}
              </span>
            )}
          </div>

          <div className="kamunggay-auth-btn-stack">
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/dashboard-button.png"
              clickedSrc="/assets/kamunggay/dashboard-button-when-clicked.png"
              alt="Enter Dashboard"
              onClick={() => {
                if (onEnterDashboard) {
                  onEnterDashboard();
                } else {
                  setScreen('login');
                }
              }}
            />
          </div>

          <div className="kamunggay-auth-clubs-footer" style={{ marginTop: 'clamp(22px, 3.8vh, 42px)' }}>
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="kamunggay-auth-clubs-logo"
              draggable={false}
            />
          </div>
        </section>
      )}
    </div>
  );
}
