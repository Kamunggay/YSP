import type { components, operations } from '../generated/api.d.ts';
import { exchangeSession, sessionNextAction } from './session.ts';

// Compiled, never invoked. @ts-expect-error becomes a failure if the error disappears.
export async function compileConsumer(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const result = await exchangeSession('signIn', { ...common, body: { email: 'officer@example.test', password: 'synthetic-only' } });
  if (result.kind === 'response') {
    switch (result.status) {
      case 200: sessionNextAction(result.body); break;
      case 401: { const code: 'invalid_credentials' = result.body.code; void code; break; }
      case 403: { const code: 'forbidden' | 'origin_forbidden' = result.body.code; void code; break; }
      case 419: { const code: 'csrf_mismatch' = result.body.code; void code; break; }
      case 422: result.body.field_errors.forEach(field => field.pointer); break;
      case 429: { const retryAfter: string = result.retryAfter; void retryAfter; break; }
      case 503: break;
      default: { const unreachable: never = result; void unreachable; }
    }
  }
  const logout = await exchangeSession('signOut', common);
  if (logout.kind === 'response' && logout.status === 204) {
    // @ts-expect-error Bodyless success cannot have session data.
    logout.body.state;
  }
  await exchangeSession('initializeCsrf', common);
  await exchangeSession('getSession', common);
  // @ts-expect-error Password is required.
  await exchangeSession('signIn', { ...common, body: { email: 'officer@example.test' } });
  // @ts-expect-error Logout accepts no request body.
  await exchangeSession('signOut', { ...common, body: {} });
  // @ts-expect-error Unsupported route spelling is not an operation.
  await exchangeSession('login', common);
}

// @ts-expect-error Unknown authentication discriminant.
const invalidState: components['schemas']['SessionSnapshot'] = { state: 'logged_in' };
// @ts-expect-error IDs remain exact strings, never JS numbers.
const numericUser: components['schemas']['SessionUser'] = { id: 9007199254740992, display_name: 'Synthetic' };
// @ts-expect-error A restricted literal cannot carry chapter data.
const leaked: components['schemas']['SessionSnapshot'] = { state: 'mfa_challenge_required', chapter_id: '1' };
// @ts-expect-error Verified MFA needs its exact server instant.
const invalidMfa: components['schemas']['SessionMfa'] = { status: 'verified' };
// @ts-expect-error A successful password exchange cannot return signed out.
const invalidSignIn: operations['signIn']['responses'][200]['content']['application/json'] = { state: 'signed_out' };
void [invalidState, numericUser, leaked, invalidMfa, invalidSignIn];

export async function compileEnrollment(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const preparation = await exchangeSession('prepareAuthenticatorEnrollment', { ...common, body: { intent: 'begin' } });
  if (preparation.kind === 'response' && preparation.status === 200) {
    const pending: 'mfa_enrollment_required' = preparation.body.state;
    const id = preparation.body.enrollment.id;
    await exchangeSession('prepareAuthenticatorEnrollment', { ...common, body: { intent: 'replace_unconfirmed', enrollment_id: id } });
    const confirmation = await exchangeSession('confirmAuthenticatorEnrollment', {
      ...common, body: { enrollment_id: id, authenticator_code: '123456' },
    });
    if (confirmation.kind === 'response' && confirmation.status === 200) {
      const verified: 'verified' = confirmation.body.session.mfa.status;
      sessionNextAction(confirmation.body.session);
      confirmation.body.recovery_codes.codes.forEach(code => code.toLowerCase());
      // @ts-expect-error Setup secrets are absent after confirmation.
      confirmation.body.enrollment.manual_key;
      void verified;
    }
    // @ts-expect-error Preparation is not authenticated and cannot issue recovery codes.
    preparation.body.recovery_codes;
    // @ts-expect-error A restricted preparation cannot substitute for a session with verified MFA.
    const authenticated: components['schemas']['AuthenticatedSession'] = preparation.body;
    void [pending, authenticated];
  }
  // @ts-expect-error Replacement requires the matching enrollment identifier.
  await exchangeSession('prepareAuthenticatorEnrollment', { ...common, body: { intent: 'replace_unconfirmed' } });
  // @ts-expect-error Caller-selected identity is forbidden.
  await exchangeSession('prepareAuthenticatorEnrollment', { ...common, body: { intent: 'begin', user_id: '1' } });
  // @ts-expect-error Confirmation requires authenticator proof.
  await exchangeSession('confirmAuthenticatorEnrollment', { ...common, body: { enrollment_id: 'enr_synthetic' } });
  // @ts-expect-error Enrollment identifiers are strings.
  await exchangeSession('confirmAuthenticatorEnrollment', { ...common, body: { enrollment_id: 123, authenticator_code: '123456' } });
  // @ts-expect-error Caller cannot assert verified status.
  await exchangeSession('confirmAuthenticatorEnrollment', { ...common, body: { enrollment_id: 'enr_synthetic', authenticator_code: '123456', verified: true } });
}
