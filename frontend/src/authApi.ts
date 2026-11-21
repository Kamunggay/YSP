/**
 * Canonical Authentication & Chapter Administration API Client for Kamunggay
 * Matches OpenAPI specifications in contracts/transport/v1 and backend session controllers.
 */

import type { CreateChapterFormData, CreateOfficerFormData, InviteOfficerFormData } from './CreateChapterPage';
import {
  getAssistedRecoveryGuidanceApi,
  getChapterContextApi,
  getProvisioningContextApi,
  listChapterMembershipsApi,
  selectChapterContextApi,
} from './p02Api';
import type { AssistedRecoveryGuidance } from './p02Api';

export type { AssistedRecoveryGuidance };
export {
  getChapterContextApi,
  getProvisioningContextApi,
  listChapterMembershipsApi,
  selectChapterContextApi,
};

export type SessionState =
  | 'signed_out'
  | 'mfa_challenge_required'
  | 'mfa_enrollment_required'
  | 'authenticated';

export interface SessionUser {
  id: string;
  display_name: string;
}

export interface SessionMfa {
  status: 'not_required' | 'verified';
  verified_at?: string;
}

export interface AuthenticatedSession {
  state: 'authenticated';
  user: SessionUser;
  mfa: SessionMfa;
  active_chapter?: {
    id: string;
    code: string;
    name: string;
  };
  duties?: string[];
  governance_constraints?: string;
}

export interface ChallengeRequiredSession {
  state: 'mfa_challenge_required';
  challenge: {
    id: string;
    delivery: 'totp_app';
    issued_at?: string;
  };
}

export interface EnrollmentRequiredSession {
  state: 'mfa_enrollment_required';
  enrollment?: {
    id: string;
    setup_key?: string;
    qr_uri?: string;
  };
}

export interface SignedOutSession {
  state: 'signed_out';
}

export type SessionSnapshot =
  | AuthenticatedSession
  | ChallengeRequiredSession
  | EnrollmentRequiredSession
  | SignedOutSession;

export interface ApiFieldError {
  pointer: string;
  code: string;
  message: string;
}

export type SignInResult =
  | { kind: 'success'; session: SessionSnapshot }
  | { kind: 'invalid_credentials'; message: string }
  | { kind: 'forbidden'; message: string; isRevoked: boolean }
  | { kind: 'throttled'; retryAfterSeconds?: number; message: string }
  | { kind: 'invalid_input'; fieldErrors: ApiFieldError[]; message: string }
  | { kind: 'unavailable'; message: string };

export type MfaVerifyResult =
  | { kind: 'success'; session: AuthenticatedSession }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type RegenerateRecoveryResult =
  | { kind: 'success'; codes: string[] }
  | { kind: 'invalid_credentials'; message: string }
  | { kind: 'unavailable'; message: string };

export type MfaEnrollmentResult =
  | { kind: 'success'; enrollmentId: string; setupKey: string; setupUri?: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type MfaConfirmResult =
  | { kind: 'success'; session: AuthenticatedSession; recoveryCodes: string[] }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type ProvisionChapterResult =
  | { kind: 'success'; provisioningId: string; chapterCode: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type InviteOfficerResult =
  | { kind: 'success'; invitationId: string; officerEmail: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type CreateOfficerResult =
  | { kind: 'success'; userId: string; email: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

/**
 * Extracts the XSRF-TOKEN cookie value if present.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
  } catch {
    return null;
  }
}

/**
 * Common headers for JSON mutation requests.
 */
function buildHeaders(): Headers {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  const csrf = getCsrfToken();
  if (csrf) {
    headers.set('X-XSRF-TOKEN', csrf);
  }
  return headers;
}

function createTimeoutSignal(userSignal?: AbortSignal, ms = 2000): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return userSignal !== undefined
      ? AbortSignal.any([userSignal, AbortSignal.timeout(ms)])
      : AbortSignal.timeout(ms);
  }
  return userSignal ?? new AbortController().signal;
}

/**
 * Initializes the Laravel CSRF cookie before making POST requests.
 */
export async function initializeCsrf(signal?: AbortSignal): Promise<boolean> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 1500);
    const res = await fetch('/csrf-cookie', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: fetchSignal,
    });
    return res.status === 200 || res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Ensures CSRF token is present in document.cookie before mutating requests.
 */
export async function ensureCsrf(signal?: AbortSignal): Promise<void> {
  if (!getCsrfToken()) {
    await initializeCsrf(signal);
  }
}

async function parseErrorBody(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as { code?: string; message?: string };
    }
  } catch {
    // Ignore unparseable error bodies
  }
  return {};
}

/**
 * Submits user credentials to POST /api/v1/session/sign-in.
 */
export async function signIn(
  email: string,
  password: string,
  signal?: AbortSignal,
  retriedCsrf = false
): Promise<SignInResult> {
  // Attempt to initialize CSRF token first
  await initializeCsrf(signal);

  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session/sign-in', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify({ email: email.trim(), password }),
      signal: fetchSignal,
    });

    if (response.status === 200) {
      const data = (await response.json()) as SessionSnapshot;
      return { kind: 'success', session: data };
    }

    if (response.status === 401) {
      return { kind: 'invalid_credentials', message: 'Unable to sign in. Check your email and password.' };
    }

    if (response.status === 403) {
      const body = await parseErrorBody(response);
      if (body.code === 'origin_forbidden') {
        return {
          kind: 'forbidden',
          message: body.message ?? 'Session origin mismatch. Access using the configured application host.',
          isRevoked: false,
        };
      }
      return {
        kind: 'forbidden',
        message: 'Your membership in this chapter has been revoked or disabled.',
        isRevoked: true,
      };
    }

    if (response.status === 419 && !retriedCsrf) {
      await initializeCsrf(signal);
      return signIn(email, password, signal, true);
    }

    if (response.status === 422) {
      const body = (await response.json()) as { field_errors?: ApiFieldError[]; message?: string };
      return {
        kind: 'invalid_input',
        fieldErrors: body.field_errors ?? [],
        message: body.message ?? 'Please check the submitted fields.',
      };
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryHeader ? parseInt(retryHeader, 10) : undefined;
      return {
        kind: 'throttled',
        ...(retryAfterSeconds !== undefined && !Number.isNaN(retryAfterSeconds) ? { retryAfterSeconds } : {}),
        message: 'Too many sign-in attempts. Please try again in a few moments.',
      };
    }

    if (response.status >= 500 || response.status === 419) {
      const body = await parseErrorBody(response);
      return {
        kind: 'unavailable',
        message: body.message ?? 'Authentication service is temporarily unavailable.',
      };
    }

    return { kind: 'invalid_credentials', message: 'Unable to sign in. Check your email and password.' };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Authentication service is unavailable. Verify the backend server is running and try again.',
    };
  }
}

/**
 * Submits an MFA challenge verification code (authenticator OTP or recovery code).
 */
export async function verifyMfaChallenge(
  challengeId: string,
  method: 'authenticator' | 'recovery_code',
  code: string,
  signal?: AbortSignal
): Promise<MfaVerifyResult> {
  try {
    const payload =
      method === 'authenticator'
        ? { challenge_id: challengeId, method: 'authenticator' as const, authenticator_code: code }
        : { challenge_id: challengeId, method: 'recovery_code' as const, recovery_code: code };

    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session/mfa/challenge/verify', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: fetchSignal,
    });

    if (response.status === 200) {
      const session = (await response.json()) as AuthenticatedSession;
      return { kind: 'success', session };
    }

    if (response.status === 400 || response.status === 401 || response.status === 422) {
      return {
        kind: 'rejected',
        message: method === 'authenticator'
          ? 'The 6-digit code was invalid or expired. Check your Google Authenticator app.'
          : 'The recovery code is invalid, already used, or expired.',
      };
    }

    if (response.status === 403 || response.status === 409) {
      return {
        kind: 'rejected',
        message: 'This verification challenge expired or requires an active password sign-in session.',
      };
    }

    if (response.status === 419) {
      return {
        kind: 'rejected',
        message: 'Security token expired. Please return to Sign In and try again.',
      };
    }

    if (response.status === 429) {
      return {
        kind: 'rejected',
        message: 'Too many verification attempts. Please wait before trying again.',
      };
    }

    return {
      kind: 'unavailable',
      message: 'MFA verification service is currently unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'MFA verification service is unavailable. Verify the backend server is running and try again.',
    };
  }
}

/**
 * Begins or replaces authenticator enrollment.
 */
export async function prepareAuthenticatorEnrollment(
  intent: 'begin' | 'replace_unconfirmed' = 'begin',
  enrollmentId?: string,
  signal?: AbortSignal
): Promise<MfaEnrollmentResult> {
  try {
    const payload = intent === 'begin' ? { intent } : { intent, enrollment_id: enrollmentId };
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session/mfa/enrollment', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: fetchSignal,
    });

    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as {
        enrollment: { id: string; manual_key?: string; setup_key?: string; setup_uri?: string; otpauth_uri?: string };
      };
      const resolvedUri = body.enrollment.setup_uri ?? body.enrollment.otpauth_uri;
      return {
        kind: 'success',
        enrollmentId: body.enrollment.id,
        setupKey: body.enrollment.manual_key ?? body.enrollment.setup_key ?? '',
        ...(resolvedUri ? { setupUri: resolvedUri } : {}),
      };
    }

    if (response.status === 429) {
      return {
        kind: 'rejected',
        message: 'Too many authenticator setup attempts. Please wait a few moments.',
      };
    }

    const err = await parseErrorBody(response);
    if (response.status === 401 || response.status === 403 || response.status === 409 || response.status === 422) {
      return {
        kind: 'rejected',
        message: err.message ?? 'Unable to initialize authenticator enrollment.',
      };
    }

    return {
      kind: 'unavailable',
      message: err.message ?? 'Authenticator enrollment service is temporarily unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Authenticator enrollment service is unreachable.',
    };
  }
}

/**
 * Confirms Google Authenticator pairing with a 6-digit verification code.
 */
export async function confirmAuthenticatorEnrollment(
  enrollmentId: string,
  authenticatorCode: string,
  signal?: AbortSignal
): Promise<MfaConfirmResult> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session/mfa/enrollment/confirm', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify({ enrollment_id: enrollmentId, authenticator_code: authenticatorCode }),
      signal: fetchSignal,
    });

    if (response.status === 200) {
      const body = (await response.json()) as {
        session: AuthenticatedSession;
        recovery_codes: { codes: string[] };
      };
      return {
        kind: 'success',
        session: body.session,
        recoveryCodes: body.recovery_codes.codes,
      };
    }

    if (response.status === 400 || response.status === 422) {
      return {
        kind: 'rejected',
        message: 'Invalid 6-digit verification code. Verify the code in Google Authenticator and try again.',
      };
    }

    if (response.status === 429) {
      return {
        kind: 'rejected',
        message: 'Too many failed pairing attempts. Please wait before trying again.',
      };
    }

    if (response.status === 409) {
      return {
        kind: 'rejected',
        message: 'This authenticator pairing session expired or was already completed.',
      };
    }
    if (response.status === 401 || response.status === 403 || response.status === 419) {
      return {
        kind: 'rejected',
        message: 'Authenticator enrollment session expired. Please sign in again.',
      };
    }
    return {
      kind: 'unavailable',
      message: 'Authenticator confirmation service is currently unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Authenticator confirmation service is unreachable.',
    };
  }
}

/**
 * Signs out the current session and invalidates tokens.
 */
export async function signOut(signal?: AbortSignal): Promise<boolean> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 1500);
    const response = await fetch('/api/v1/session/sign-out', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      signal: fetchSignal,
    });
    return response.status === 200 || response.status === 204;
  } catch {
    return true;
  }
}

/**
 * Queries GET /api/v1/session to inspect the active browser session state.
 */
export async function getCurrentSession(signal?: AbortSignal): Promise<SessionSnapshot> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: fetchSignal,
    });
    if (response.status === 200) {
      return (await response.json()) as SessionSnapshot;
    }
  } catch {
    // Offline / unauthenticated fallback
  }
  return { state: 'signed_out' };
}

/**
 * Regenerates emergency recovery codes via POST /api/v1/session/mfa/recovery-codes/regenerate.
 */
export async function regenerateRecoveryCodes(
  password: string,
  authenticatorCode: string,
  signal?: AbortSignal
): Promise<RegenerateRecoveryResult> {
  await ensureCsrf(signal);
  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/session/mfa/recovery-codes/regenerate', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify({ password, authenticator_code: authenticatorCode.trim() }),
      signal: fetchSignal,
    });
    if (response.status === 200) {
      const body = (await response.json()) as { recovery_codes: { codes: string[] } };
      return { kind: 'success', codes: body.recovery_codes.codes };
    }
    if (response.status === 401) {
      return { kind: 'invalid_credentials', message: 'The submitted factor proof was not accepted.' };
    }
  } catch {
    return {
      kind: 'unavailable',
      message: 'Recovery code service is unreachable.',
    };
  }
  return {
    kind: 'unavailable',
    message: 'Recovery code regeneration is currently unavailable.',
  };
}

/**
 * Provisions a new chapter and initial Chapter Head.
 */
export async function provisionChapter(
  data: CreateChapterFormData & { expectedProviderAuthorityVersion?: number | undefined },
  signal?: AbortSignal
): Promise<ProvisionChapterResult> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/provider/provisionings', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: buildHeaders(),
      body: JSON.stringify({
        idempotency_key: `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        expected_provider_authority_version: data.expectedProviderAuthorityVersion ?? 1,
        chapter: {
          code: data.chapterCode.trim().toUpperCase(),
          name: data.chapterName.trim(),
        },
      }),
      signal: fetchSignal,
    });

    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as { provisioning?: { id: string } };
      return {
        kind: 'success',
        provisioningId: body.provisioning?.id ?? '',
        chapterCode: data.chapterCode.trim().toUpperCase(),
      };
    }

    const err = await parseErrorBody(response);
    if (response.status === 401 || response.status === 403 || response.status === 409 || response.status === 422) {
      return {
        kind: 'rejected',
        message: err.message ?? 'Chapter provisioning request was rejected.',
      };
    }

    return {
      kind: 'unavailable',
      message: err.message ?? 'Chapter provisioning service is currently unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Chapter provisioning service is unreachable.',
    };
  }
}

/**
 * Queries GET /api/v1/session/mfa/assisted-recovery per contracts/transport/generated/routes.ts.
 * Returns fail-closed guidance rather than bypassing authenticator proof.
 */
export async function getAssistedRecoveryGuidance(
  signal?: AbortSignal
): Promise<
  | { kind: 'ok'; guidance: AssistedRecoveryGuidance }
  | { kind: 'unavailable'; message: string }
> {
  const res = await getAssistedRecoveryGuidanceApi(signal);
  if (res.ok && res.body) {
    return { kind: 'ok', guidance: res.body };
  }
  return {
    kind: 'unavailable',
    message:
      res.message ||
      'Assisted recovery is unavailable until an authorized proof and reset procedure is approved.',
  };
}

/**
 * Authorizes an existing user identity into a chapter via POST /api/v1/chapters/{chapter_id}/memberships/authorize
 * matching AuthorizeMembershipRequest strictly.
 */
export async function inviteChapterOfficer(
  data: InviteOfficerFormData & {
    userId?: string | undefined;
    expectedAuthorityVersion?: number | undefined;
  },
  chapterId = '',
  signal?: AbortSignal
): Promise<InviteOfficerResult> {
  const cleanChapterId = chapterId.trim();
  if (!cleanChapterId) {
    return {
      kind: 'rejected',
      message: 'Chapter context ID is required before authorizing chapter membership.',
    };
  }

  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const chapterSegment = `/api/v1/chapters/${encodeURIComponent(cleanChapterId)}/memberships/authorize`;
    const response = await fetch(chapterSegment, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: buildHeaders(),
      body: JSON.stringify({
        idempotency_key: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        expected_authority_version: data.expectedAuthorityVersion ?? 1,
        expected_membership_version: null,
        identity: {
          user_id: data.userId?.trim() ?? '',
        },
      }),
      signal: fetchSignal,
    });

    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as { invitation_id?: string };
      return {
        kind: 'success',
        invitationId: body.invitation_id ?? '',
        officerEmail: data.officerEmail.trim(),
      };
    }

    const err = await parseErrorBody(response);
    if (response.status === 401 || response.status === 403 || response.status === 409 || response.status === 422) {
      return {
        kind: 'rejected',
        message: err.message ?? 'Officer membership authorization was rejected.',
      };
    }

    return {
      kind: 'unavailable',
      message: err.message ?? 'Membership authorization service is currently unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Membership authorization service is unreachable.',
    };
  }
}

/**
 * Creates officer account via invitation acceptance.
 * Note: POST /api/v1/auth/invitations/accept awaits backend route registration in contracts/transport/generated/routes.ts.
 */
export async function createOfficerAccount(
  data: CreateOfficerFormData,
  signal?: AbortSignal
): Promise<CreateOfficerResult> {
  try {
    const fetchSignal = createTimeoutSignal(signal, 2000);
    const response = await fetch('/api/v1/auth/invitations/accept', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: buildHeaders(),
      body: JSON.stringify({
        full_name: data.fullName.trim(),
        email: data.email.trim(),
        password: data.password,
      }),
      signal: fetchSignal,
    });

    if (response.status === 200 || response.status === 201) {
      const body = (await response.json()) as { user_id?: string };
      return {
        kind: 'success',
        userId: body.user_id ?? '',
        email: data.email.trim(),
      };
    }

    const err = await parseErrorBody(response);
    if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 409 || response.status === 422) {
      return {
        kind: 'rejected',
        message: err.message ?? 'Officer account creation was rejected.',
      };
    }

    return {
      kind: 'unavailable',
      message: err.message ?? 'Officer onboarding service is currently unavailable.',
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Officer onboarding service is unreachable.',
    };
  }
}
