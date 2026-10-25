import type { components, operations } from '../generated/api.d.ts';
import { exchangeSession, sessionNextAction } from './session.ts';
import { chapterNextAction, chapterScopeMatches } from './chapter-context.ts';

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

export async function compileMfaRecovery(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const bootstrap = await exchangeSession('getSession', common);
  if (bootstrap.kind === 'response' && bootstrap.status === 200 && bootstrap.body.state === 'mfa_challenge_required') {
    const challenge_id = bootstrap.body.challenge.id;
    await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id, method: 'authenticator', authenticator_code: '123456' } });
    const proof = await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id, method: 'recovery_code', recovery_code: 'DEMO-CODE-0001-AAAA' } });
    if (proof.kind === 'response' && proof.status === 200) {
      const verified: 'verified' = proof.body.mfa.status;
      sessionNextAction(proof.body);
      // @ts-expect-error Challenge success cannot issue or retrieve recovery codes.
      proof.body.recovery_codes;
      void verified;
    }
  }
  const regeneration = await exchangeSession('regenerateRecoveryCodes', { ...common, body: { password: 'synthetic-only', authenticator_code: '123456' } });
  if (regeneration.kind === 'response' && regeneration.status === 200) {
    regeneration.body.recovery_codes.codes.forEach(code => code.toLowerCase());
    const verified: 'verified' = regeneration.body.session.mfa.status;
    void verified;
  }
  const guidance = await exchangeSession('getAssistedRecoveryGuidance', common);
  if (guidance.kind === 'response' && guidance.status === 200) {
    const blocked: 'unavailable' = guidance.body.availability;
    const actions: readonly ('bootstrap_session' | 'sign_out')[] = guidance.body.next_actions;
    // @ts-expect-error No reset URL or procedure is authorized.
    guidance.body.reset_url;
    void [blocked, actions];
  }
  // @ts-expect-error Missing matching authenticator proof.
  await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id: 'chl_synthetic', method: 'authenticator' } });
  // @ts-expect-error A recovery method cannot carry authenticator proof.
  await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id: 'chl_synthetic', method: 'recovery_code', authenticator_code: '123456' } });
  // @ts-expect-error Mixed proof literal is forbidden.
  await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id: 'chl_synthetic', method: 'authenticator', authenticator_code: '123456', recovery_code: 'DEMO-CODE-0001-AAAA' } });
  const mixed: { challenge_id: string; method: 'recovery_code'; authenticator_code: string; recovery_code: string } = {
    challenge_id: 'chl_synthetic', method: 'recovery_code', authenticator_code: '123456', recovery_code: 'DEMO-CODE-0001-AAAA',
  };
  // @ts-expect-error Explicit forbidden opposite field rejects mixed proof variables too.
  await exchangeSession('verifyMfaChallenge', { ...common, body: mixed });
  // @ts-expect-error Account identity is always server/session-owned.
  await exchangeSession('verifyMfaChallenge', { ...common, body: { challenge_id: 'chl_synthetic', method: 'authenticator', authenticator_code: '123456', user_id: '1' } });
  // @ts-expect-error Regeneration requires a password as well as authenticator proof.
  await exchangeSession('regenerateRecoveryCodes', { ...common, body: { authenticator_code: '123456' } });
  // @ts-expect-error A recovery code cannot substitute for an authenticator in regeneration.
  await exchangeSession('regenerateRecoveryCodes', { ...common, body: { password: 'synthetic-only', recovery_code: 'DEMO-CODE-0001-AAAA' } });
  // @ts-expect-error Recent proof time is server-owned.
  await exchangeSession('regenerateRecoveryCodes', { ...common, body: { password: 'synthetic-only', authenticator_code: '123456', recent_proof_at: '2026-10-25T06:00:00.000000Z' } });
  // @ts-expect-error Guidance accepts no identity/proof upload body.
  await exchangeSession('getAssistedRecoveryGuidance', { ...common, body: { user_id: '1' } });
}

export async function compileChapterContext(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const current = await exchangeSession('getChapterContext', { ...common, query: { chapter_id: '1' } });
  if (current.kind === 'response') {
    switch (current.status) {
      case 200:
        chapterNextAction(current.body);
        chapterScopeMatches(current.body, '1');
        if (current.body.chapter_state === 'selected') {
          const authorityVersion: number = current.body.context.authority_version;
          const chapterId: string = current.body.context.chapter_id;
          const action: components['schemas']['P02ChapterAction'] | undefined = current.body.context.available_actions[0];
          const selected = await exchangeSession('selectChapter', { ...common,
            contextRevision: current.body.selection_revision,
            body: { chapter_id: chapterId, membership_id: current.body.membership.membership_id,
              expected_membership_version: current.body.membership.membership_version } });
          if (selected.kind === 'response' && selected.status === 409) {
            const next: 'refresh_context' = selected.body.next_action;
            // @ts-expect-error Stale feedback discloses no current chapter or replacement revision.
            selected.body.selection_revision;
            void next;
          }
          void [authorityVersion, action];
        } else {
          // @ts-expect-error Empty/selection-required states have no checked chapter authority.
          current.body.context.available_actions;
        }
        break;
      case 400: break;
      case 401: break;
      case 403: break;
      case 409: break;
      case 429: break;
      case 503: break;
      default: { const exhaustive: never = current; void exhaustive; }
    }
  }
  const page = await exchangeSession('listChapterMemberships', { ...common, query: { limit: 1 } });
  if (page.kind === 'response' && page.status === 200 && page.body.next_cursor !== null) {
    await exchangeSession('listChapterMemberships', { ...common, query: { limit: page.body.limit, cursor: page.body.next_cursor } });
  }
  // @ts-expect-error Required server selection guard cannot be omitted.
  await exchangeSession('selectChapter', { ...common, body: { chapter_id: '1', membership_id: '2', expected_membership_version: 1 } });
  // @ts-expect-error Chapter selection requires membership version.
  await exchangeSession('selectChapter', { ...common, contextRevision: 'ctx_synthetic', body: { chapter_id: '1', membership_id: '2' } });
  // @ts-expect-error Numeric chapter IDs lose exactness.
  await exchangeSession('getChapterContext', { ...common, query: { chapter_id: 1 } });
  // @ts-expect-error No caller-selected user/duty filter exists.
  await exchangeSession('listChapterMemberships', { ...common, query: { user_id: '1' } });
  // @ts-expect-error Browser-selected duty is not authority.
  const badSelection: components['schemas']['SelectChapterRequest'] = { chapter_id: '1', membership_id: '2', expected_membership_version: 1, duty_code: 'CHAPTER_HEAD' };
  // @ts-expect-error Catalogue is finite; no arbitrary action or wildcard.
  const badAction: components['schemas']['P02Action'] = '*';
  // @ts-expect-error Provider authority is separate from chapter actions.
  const providerInChapter: components['schemas']['P02ChapterAction'] = 'provider.chapters.create';
  // @ts-expect-error Provider is not a fifteenth chapter duty.
  const badDuty: components['schemas']['ChapterDuty'] = 'provisioner';
  void [badSelection, badAction, providerInChapter, badDuty];
}
