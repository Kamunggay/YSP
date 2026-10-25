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
