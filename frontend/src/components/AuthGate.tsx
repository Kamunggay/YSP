import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { apiGet, apiMutate, ContractApiError, formatManilaTime, newActionKey } from '../api/client.ts';
import type {
  ConnectionState,
  MfaEnrollmentBegin,
  RecoveryDeliveryResult,
  RecoverySetInfo,
  SessionProjection,
} from '../api/types.ts';
import { playApplePay, playClickPen, playErrorTone } from '../theme/batcaveAudio.ts';
import { ColdCarbonCrystalCanvas } from './ColdCarbonCrystalCanvas.tsx';
import { NavFlowHeader } from './NavFlowHeader.tsx';

interface AuthGateProps {
  connection: ConnectionState;
  onRetryHealth: () => void;
  session: SessionProjection | null;
  onSessionUpdated: (next: SessionProjection | null) => void;
  soundEnabled?: boolean;
  onNotify?: (tone: 'success' | 'warning' | 'error' | 'info', text: string) => void;
}

export function AuthGate({
  connection,
  onRetryHealth,
  session,
  onSessionUpdated,
  soundEnabled = true,
  onNotify,
}: AuthGateProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const [pendingEnrollment, setPendingEnrollment] = useState<MfaEnrollmentBegin | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [recoveryCodesDelivery, setRecoveryCodesDelivery] = useState<RecoveryDeliveryResult | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoverySetInfo | null>(null);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    const uri = pendingEnrollment?.provisioning_uri;
    if (!uri) {
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(uri, { width: 184, margin: 1 })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pendingEnrollment?.provisioning_uri]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    const key = pendingKey ?? newActionKey();
    setPendingKey(key);
    try {
      const { result } = await apiMutate<SessionProjection>('POST', '/api/v1/auth/sign-in', { login, password }, key);
      setPendingKey(null);
      setPassword('');
      setShowPassword(false);
      onSessionUpdated(result.data);
      const msg = result.replayed ? 'Replayed existing sign-in snapshot (X-Action-Replayed: true).' : 'Signed in cleanly.';
      setInfoMsg(msg);
      playApplePay(soundEnabled);
      onNotify?.('success', msg);
    } catch (err) {
      playErrorTone(soundEnabled);
      if (err instanceof ContractApiError) {
        const msg = `${err.code}: ${err.message}${err.retryAfterSeconds ? ` (Retry in ${err.retryAfterSeconds}s)` : ''}`;
        setErrorMsg(msg);
        onNotify?.('error', msg);
        if (err.status !== 503) {
          setPendingKey(null);
        }
      } else {
        const msg = 'Network failure during sign-in; retaining action key for safe retry.';
        setErrorMsg(msg);
        onNotify?.('warning', msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBeginEnrollment(e: React.FormEvent) {
    e.preventDefault();
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    setQrDataUrl(null);
    try {
      const { result } = await apiMutate<MfaEnrollmentBegin>('POST', '/api/v1/auth/authenticator/enrollments', { password });
      setPendingEnrollment(result.data);
      const msg = 'Authenticator enrollment initialized. Scan the QR code or enter the secret in your TOTP app, then confirm below.';
      setInfoMsg(msg);
      onNotify?.('info', 'Authenticator enrollment initialized.');
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Failed to begin enrollment.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingEnrollment) {
      return;
    }
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    try {
      const { result } = await apiMutate<RecoveryDeliveryResult>('POST', '/api/v1/auth/authenticator/enrollments/confirm', {
        enrollment_id: pendingEnrollment.enrollment_id,
        password,
        authenticator_code: totpCode.trim(),
      });
      setRecoveryCodesDelivery(result.data);
      setPendingEnrollment(null);
      setQrDataUrl(null);
      setPassword('');
      setTotpCode('');
      const current = await apiGet<SessionProjection>('/api/v1/auth/session');
      onSessionUpdated(current.data);
      playApplePay(soundEnabled);
      setInfoMsg('MFA confirmed! Save the 10 recovery codes offline now — they are never persisted in browser storage.');
      onNotify?.('success', 'Authenticator MFA confirmed.');
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Confirmation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleChallenge(e: React.FormEvent) {
    e.preventDefault();
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    try {
      const { result } = useRecovery
        ? await apiMutate<SessionProjection>('POST', '/api/v1/auth/recovery/challenge', { recovery_code: recoveryCode.trim() })
        : await apiMutate<SessionProjection>('POST', '/api/v1/auth/authenticator/challenge', { authenticator_code: totpCode.trim() });
      setTotpCode('');
      setRecoveryCode('');
      playApplePay(soundEnabled);
      onSessionUpdated(result.data);
      onNotify?.('success', 'MFA verification completed.');
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckRecoveryStatus() {
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiGet<{ recovery_set: RecoverySetInfo | null }>('/api/v1/auth/recovery-codes');
      setRecoveryStatus(res.data.recovery_set);
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Could not fetch recovery status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRotateRecoveryCodes(e: React.FormEvent) {
    e.preventDefault();
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    try {
      const { result } = await apiMutate<RecoveryDeliveryResult>('POST', '/api/v1/auth/recovery-codes/rotate', {
        password,
        authenticator_code: totpCode.trim(),
        expected_recovery_set_id: recoveryStatus?.id ?? null,
      });
      setRecoveryCodesDelivery(result.data);
      setPassword('');
      setTotpCode('');
      await handleCheckRecoveryStatus();
      playApplePay(soundEnabled);
      setInfoMsg('Recovery set rotated atomically.');
      onNotify?.('success', 'Recovery codes rotated atomically.');
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Rotation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    playClickPen(soundEnabled);
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiMutate<void>('POST', '/api/v1/auth/sign-out', null);
      setPendingEnrollment(null);
      setQrDataUrl(null);
      setRecoveryCodesDelivery(null);
      setRecoveryStatus(null);
      onSessionUpdated(null);
      onNotify?.('info', 'Signed out cleanly.');
    } catch (err) {
      playErrorTone(soundEnabled);
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  const feedbackBanners = (
    <>
      {errorMsg && (
        <div className="callout-banner is-error" role="alert">
          <span className="callout-dot dot-error" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && (
        <div className="callout-banner" role="status">
          <span className="callout-dot dot-success" aria-hidden="true" />
          <span>{infoMsg}</span>
        </div>
      )}
    </>
  );

  const recoveryCodesPanel = recoveryCodesDelivery && (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3>Recovery Codes (Save Offline Once)</h3>
      <p className="muted" style={{ marginBottom: '0.65rem' }}>
        Set ID: <span className="mono">{recoveryCodesDelivery.recovery_set.id}</span> · Expires{' '}
        {formatManilaTime(recoveryCodesDelivery.recovery_set.expires_at)}
      </p>
      <pre className="json-box">{recoveryCodesDelivery.codes.join('\n')}</pre>
      <div style={{ marginTop: '0.75rem' }}>
        <button className="btn-batcave-secondary" type="button" onClick={() => setRecoveryCodesDelivery(null)}>
          I have saved these codes
        </button>
      </div>
    </div>
  );

  // 1. Pre-auth BatCave split showcase: Cold Carbon Crystal + Frosted Acrylic Sign-In Panel
  if (!session) {
    return (
      <main className="login-workspace">
        <section className="login-brand-stage" aria-label="Cold Carbon Security Display">
          <div className="login-characters-frame">
            <div className="login-crystal-stage">
              <ColdCarbonCrystalCanvas />
            </div>
          </div>
        </section>

        <section className="login-card-col" aria-label="Officer authentication panel">
          <div className="surface-card">
            <NavFlowHeader
              headingId="officer-signin-heading"
              title="Officer Sign-In"
              subtitle="Same-origin cookie session (ysp_session + CSRF + X-Action-Key). Pre-chapter authentication only."
            />

            <div className="form-stack">
              <div
                className="callout-banner"
                style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    className={`callout-dot ${
                      connection === 'connected' ? 'dot-success' : connection === 'unavailable' ? 'dot-error' : 'dot-warning'
                    }`}
                    style={{ marginTop: 0 }}
                    aria-hidden="true"
                  />
                  <span role="status">
                    {connection === 'checking'
                      ? 'Checking Laravel & MySQL connection...'
                      : connection === 'connected'
                        ? 'Laravel and MySQL are connected.'
                        : 'Service unavailable — verify local stack.'}
                  </span>
                </div>
                <button
                  type="button"
                  className="password-toggle-btn"
                  style={{ position: 'static' }}
                  disabled={connection === 'checking'}
                  onClick={onRetryHealth}
                >
                  Recheck
                </button>
              </div>

              {feedbackBanners}
              {recoveryCodesPanel}

              <form className="form-stack" onSubmit={handleSignIn}>
                <div className="form-group">
                  <label className="form-label" htmlFor="auth-login">
                    Login Email <span className="required-star">*</span>
                  </label>
                  <input
                    id="auth-login"
                    className="form-control"
                    type="email"
                    required
                    placeholder="officer@ysp.example"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="username"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="auth-password">
                    Password <span className="required-star">*</span>
                  </label>
                  <div className="input-control-wrap">
                    <input
                      id="auth-password"
                      className="form-control has-toggle"
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter account password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>

                <button id="btn-submit-request" className="btn-batcave-primary" type="submit" disabled={busy}>
                  {busy ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>
            </div>

            <div className="card-emblem-footer">
              <img src="/assets/kamunggay/3-of-clubs.png" alt="3 of Clubs" className="card-clubs-emblem" draggable={false} />
            </div>
          </div>
        </section>
      </main>
    );
  }

  // 2. MFA Continuation (Enrollment or Challenge) inside centered BatCave glass layout
  if (session.state === 'continuation') {
    return (
      <main className="auth-centered-stage">
        <div className="auth-centered-card surface-card">
          <NavFlowHeader
            headingId="mfa-heading"
            title={session.next_step === 'enroll_authenticator' ? 'Authenticator Enrollment' : 'MFA Verification'}
            subtitle={`${session.user.display_name} · Next step: ${session.next_step} · Expires ${formatManilaTime(session.expires_at)}`}
          />

          <div className="form-stack">
            {feedbackBanners}
            {recoveryCodesPanel}

            {session.next_step === 'enroll_authenticator' ? (
              !pendingEnrollment ? (
                <form className="form-stack" onSubmit={handleBeginEnrollment}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="enroll-pw">
                      Re-enter Password to Begin Enrollment
                    </label>
                    <input
                      id="enroll-pw"
                      className="form-control"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <button className="btn-batcave-primary" type="submit" disabled={busy}>
                    Begin Authenticator Enrollment
                  </button>
                </form>
              ) : (
                <form className="form-stack" onSubmit={handleConfirmEnrollment}>
                  <div className="session-ledger">
                    {qrDataUrl && (
                      <div className="session-ledger-row" style={{ alignItems: 'center', padding: '1rem' }}>
                        <img
                          src={qrDataUrl}
                          alt="Authenticator QR code"
                          style={{ width: 176, height: 176, borderRadius: 10, background: '#fff', padding: 6 }}
                        />
                      </div>
                    )}
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Enrollment ID</span>
                      <span className="session-ledger-val mono">{pendingEnrollment.enrollment_id}</span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">TOTP Secret</span>
                      <span className="session-ledger-val mono">{pendingEnrollment.secret}</span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Provisioning URI</span>
                      <span className="session-ledger-val mono">{pendingEnrollment.provisioning_uri}</span>
                    </div>
                  </div>

                  <div className="row">
                    <div className="field">
                      <label htmlFor="confirm-pw">Password</label>
                      <input id="confirm-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="confirm-totp">6-Digit TOTP Code</label>
                      <input
                        id="confirm-totp"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        required
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                      />
                    </div>
                  </div>
                  <button className="btn-batcave-primary" type="submit" disabled={busy}>
                    Confirm Enrollment
                  </button>
                </form>
              )
            ) : (
              <form className="form-stack" onSubmit={handleChallenge}>
                <button
                  type="button"
                  className="btn-batcave-secondary"
                  onClick={() => setUseRecovery((v) => !v)}
                >
                  {useRecovery ? 'Use Authenticator TOTP Code' : 'Use Single-Use Recovery Code'}
                </button>
                {useRecovery ? (
                  <div className="form-group">
                    <label className="form-label" htmlFor="rec-code">
                      Recovery Code (XXXX-XXXX-XXXX-XXXX)
                    </label>
                    <input
                      id="rec-code"
                      className="form-control is-mono"
                      type="text"
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label" htmlFor="chal-totp">
                      6-Digit TOTP Code
                    </label>
                    <input
                      id="chal-totp"
                      className="form-control is-mono"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                    />
                  </div>
                )}
                <button className="btn-batcave-primary" type="submit" disabled={busy}>
                  Verify MFA
                </button>
              </form>
            )}

            <button type="button" className="btn-batcave-secondary" onClick={handleSignOut} disabled={busy}>
              Sign Out
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 3. Authenticated Security & Recovery Controls (rendered in My Work tab)
  return (
    <div className="card">
      <div className="form-card-header" style={{ marginBottom: '1rem', paddingBottom: '0.75rem' }}>
        <div>
          <h2 className="form-card-title">Session Security &amp; Recovery Controls</h2>
          <p className="form-card-subtitle">
            Authenticated as {session.user.display_name} ({session.authentication_method}) · Window expires{' '}
            {formatManilaTime(session.expires_at)}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn secondary" onClick={handleCheckRecoveryStatus} disabled={busy}>
            Check Recovery Set
          </button>
          <button type="button" className="btn secondary" onClick={handleSignOut} disabled={busy}>
            Sign Out
          </button>
        </div>
      </div>

      <div className="form-stack">
        {feedbackBanners}
        {recoveryCodesPanel}

        {recoveryStatus && (
          <div className="session-ledger">
            <div className="session-ledger-row">
              <span className="session-ledger-key">Active Recovery Set</span>
              <span className="session-ledger-val mono">
                {recoveryStatus.id} · {recoveryStatus.remaining} remaining · Expires {formatManilaTime(recoveryStatus.expires_at)}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleRotateRecoveryCodes}>
          <div className="row">
            <div className="field">
              <label htmlFor="rot-pw">Password</label>
              <input id="rot-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rot-totp">Current TOTP Code</label>
              <input
                id="rot-totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Rotate Recovery Codes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
