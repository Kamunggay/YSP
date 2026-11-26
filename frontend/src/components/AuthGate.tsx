import { useState } from 'react';
import { apiGet, apiMutate, ContractApiError, formatManilaTime, newActionKey } from '../api/client.ts';
import type {
  ConnectionState,
  MfaEnrollmentBegin,
  RecoveryDeliveryResult,
  RecoverySetInfo,
  SessionProjection,
} from '../api/types.ts';

interface AuthGateProps {
  connection: ConnectionState;
  onRetryHealth: () => void;
  session: SessionProjection | null;
  onSessionUpdated: (next: SessionProjection | null) => void;
}

export function AuthGate({ connection, onRetryHealth, session, onSessionUpdated }: AuthGateProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const [pendingEnrollment, setPendingEnrollment] = useState<MfaEnrollmentBegin | null>(null);
  const [recoveryCodesDelivery, setRecoveryCodesDelivery] = useState<RecoveryDeliveryResult | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoverySetInfo | null>(null);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    const key = pendingKey ?? newActionKey();
    setPendingKey(key);
    try {
      const { result } = await apiMutate<SessionProjection>('POST', '/api/v1/auth/sign-in', { login, password }, key);
      setPendingKey(null);
      setPassword('');
      onSessionUpdated(result.data);
      setInfoMsg(result.replayed ? 'Replayed existing sign-in snapshot (X-Action-Replayed: true).' : 'Signed in.');
    } catch (err) {
      if (err instanceof ContractApiError) {
        setErrorMsg(`${err.code}: ${err.message}${err.retryAfterSeconds ? ` (Retry in ${err.retryAfterSeconds}s)` : ''}`);
        if (err.status !== 503) {
          setPendingKey(null);
        }
      } else {
        setErrorMsg('Network failure during sign-in; retaining action key for safe retry.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleBeginEnrollment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const { result } = await apiMutate<MfaEnrollmentBegin>('POST', '/api/v1/auth/authenticator/enrollments', { password });
      setPendingEnrollment(result.data);
      setInfoMsg('Authenticator enrollment initialized. Scan/enter the secret in your TOTP app, then confirm below.');
    } catch (err) {
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
      setPassword('');
      setTotpCode('');
      const current = await apiGet<SessionProjection>('/api/v1/auth/session');
      onSessionUpdated(current.data);
      setInfoMsg('MFA confirmed! Save the 10 recovery codes offline now — they are not persisted in browser storage.');
    } catch (err) {
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Confirmation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleChallenge(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const { result } = useRecovery
        ? await apiMutate<SessionProjection>('POST', '/api/v1/auth/recovery/challenge', { recovery_code: recoveryCode.trim() })
        : await apiMutate<SessionProjection>('POST', '/api/v1/auth/authenticator/challenge', { authenticator_code: totpCode.trim() });
      setTotpCode('');
      setRecoveryCode('');
      onSessionUpdated(result.data);
    } catch (err) {
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckRecoveryStatus() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiGet<{ recovery_set: RecoverySetInfo | null }>('/api/v1/auth/recovery-codes');
      setRecoveryStatus(res.data.recovery_set);
    } catch (err) {
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Could not fetch recovery status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRotateRecoveryCodes(e: React.FormEvent) {
    e.preventDefault();
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
      setInfoMsg('Recovery set rotated atomically.');
    } catch (err) {
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Rotation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiMutate<void>('POST', '/api/v1/auth/sign-out', null);
      setPendingEnrollment(null);
      setRecoveryCodesDelivery(null);
      setRecoveryStatus(null);
      onSessionUpdated(null);
    } catch (err) {
      setErrorMsg(err instanceof ContractApiError ? `${err.code}: ${err.message}` : 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: '52rem', margin: '1.5rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h2>Service Connectivity</h2>
        <p role="status" className={`connection ${connection}`}>
          {connection === 'checking'
            ? 'Checking Laravel and MySQL connection...'
            : connection === 'connected'
              ? 'Laravel and MySQL are connected.'
              : 'Connection unavailable. Check that the local services are running, then try again.'}
        </p>
        <button className="btn secondary" disabled={connection === 'checking'} onClick={onRetryHealth}>
          Check connection
        </button>
      </div>

      {errorMsg && <div className="alert error" role="alert">{errorMsg}</div>}
      {infoMsg && <div className="alert info">{infoMsg}</div>}

      {recoveryCodesDelivery && (
        <div className="card">
          <h3>Recovery Codes (Save Offline Once)</h3>
          <p className="muted">Set ID: <span className="mono">{recoveryCodesDelivery.recovery_set.id}</span> · Expires {formatManilaTime(recoveryCodesDelivery.recovery_set.expires_at)}</p>
          <pre className="json-box">{recoveryCodesDelivery.codes.join('\n')}</pre>
          <button className="btn secondary" onClick={() => setRecoveryCodesDelivery(null)}>I have saved these codes</button>
        </div>
      )}

      {!session && (
        <div className="card">
          <h2>Officer Sign-In</h2>
          <p className="muted">Same-origin cookie session (`ysp_session` + CSRF + `X-Action-Key`). Pre-chapter authentication only.</p>
          <form onSubmit={handleSignIn}>
            <div className="row">
              <div className="field">
                <label htmlFor="auth-login">Login Email</label>
                <input id="auth-login" type="email" required value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
              </div>
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <input id="auth-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            </div>
            <div style={{ marginTop: '0.85rem' }}>
              <button className="btn" type="submit" disabled={busy}>Sign In</button>
            </div>
          </form>
        </div>
      )}

      {session && session.state === 'continuation' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Multifactor Authentication Required ({session.user.display_name})</h2>
            <button className="btn secondary" onClick={handleSignOut} disabled={busy}>Sign Out</button>
          </div>
          <p className="muted">Next step: <strong className="mono">{session.next_step}</strong> · Window expires {formatManilaTime(session.expires_at)}</p>

          {session.next_step === 'enroll_authenticator' ? (
            <>
              {!pendingEnrollment ? (
                <form onSubmit={handleBeginEnrollment}>
                  <div className="field" style={{ maxWidth: '22rem' }}>
                    <label htmlFor="enroll-pw">Re-enter Password to Begin Enrollment</label>
                    <input id="enroll-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button className="btn" type="submit" disabled={busy}>Begin Authenticator Enrollment</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleConfirmEnrollment}>
                  <div className="alert info">
                    <div><strong>Enrollment ID:</strong> <span className="mono">{pendingEnrollment.enrollment_id}</span></div>
                    <div><strong>TOTP Secret:</strong> <span className="mono">{pendingEnrollment.secret}</span></div>
                    <div><strong>Provisioning URI:</strong> <span className="mono" style={{ wordBreak: 'break-all' }}>{pendingEnrollment.provisioning_uri}</span></div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label htmlFor="confirm-pw">Password</label>
                      <input id="confirm-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="confirm-totp">6-Digit TOTP Code</label>
                      <input id="confirm-totp" type="text" inputMode="numeric" pattern="[0-9]{6}" required value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button className="btn" type="submit" disabled={busy}>Confirm Enrollment</button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <form onSubmit={handleChallenge}>
              <div className="row" style={{ marginBottom: '0.75rem' }}>
                <button type="button" className="btn secondary" onClick={() => setUseRecovery((v) => !v)}>
                  {useRecovery ? 'Use Authenticator TOTP Code' : 'Use Single-Use Recovery Code'}
                </button>
              </div>
              {useRecovery ? (
                <div className="field" style={{ maxWidth: '24rem' }}>
                  <label htmlFor="rec-code">Recovery Code (XXXX-XXXX-XXXX-XXXX)</label>
                  <input id="rec-code" type="text" required value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} />
                </div>
              ) : (
                <div className="field" style={{ maxWidth: '16rem' }}>
                  <label htmlFor="chal-totp">6-Digit TOTP Code</label>
                  <input id="chal-totp" type="text" inputMode="numeric" pattern="[0-9]{6}" required value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
                </div>
              )}
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn" type="submit" disabled={busy}>Verify MFA</button>
              </div>
            </form>
          )}
        </div>
      )}

      {session && session.state === 'authenticated' && (
        <div className="card">
          <h3>Recovery Code Status &amp; Rotation</h3>
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <button className="btn secondary" onClick={handleCheckRecoveryStatus} disabled={busy}>Check Recovery Set</button>
            <button className="btn secondary" onClick={handleSignOut} disabled={busy}>Sign Out</button>
          </div>
          {recoveryStatus && (
            <p className="muted">
              Set <span className="mono">{recoveryStatus.id}</span> · Remaining: <strong>{recoveryStatus.remaining}</strong> · Expires {formatManilaTime(recoveryStatus.expires_at)}
            </p>
          )}
          <form onSubmit={handleRotateRecoveryCodes}>
            <div className="row">
              <div className="field">
                <label htmlFor="rot-pw">Password</label>
                <input id="rot-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rot-totp">Current TOTP Code</label>
                <input id="rot-totp" type="text" inputMode="numeric" pattern="[0-9]{6}" required value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={busy}>Rotate Recovery Codes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
