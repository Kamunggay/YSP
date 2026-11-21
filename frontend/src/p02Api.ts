/**
 * Canonical Transport Client aligned with contracts/transport/generated/routes.ts & api.d.ts.
 * Enforces CSRF cookies, X-Chapter-Context revision headers, redirect: 'error', cache: 'no-store',
 * and fail-closed uncertain outcome semantics on transport or boundary errors.
 */

export const TRANSPORT_ROUTES = {
  lookupOperationByKey: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/operations/by-key',
  },
  lookupOperationById: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/operations/by-id/{operation_id}',
  },
  getSession: {
    method: 'GET',
    path: '/api/v1/session',
  },
  signIn: {
    method: 'POST',
    path: '/api/v1/session/sign-in',
  },
  signOut: {
    method: 'POST',
    path: '/api/v1/session/sign-out',
  },
  initializeCsrf: {
    method: 'GET',
    path: '/csrf-cookie',
  },
  prepareAuthenticatorEnrollment: {
    method: 'POST',
    path: '/api/v1/session/mfa/enrollment',
  },
  confirmAuthenticatorEnrollment: {
    method: 'POST',
    path: '/api/v1/session/mfa/enrollment/confirm',
  },
  verifyMfaChallenge: {
    method: 'POST',
    path: '/api/v1/session/mfa/challenge/verify',
  },
  regenerateRecoveryCodes: {
    method: 'POST',
    path: '/api/v1/session/mfa/recovery-codes/regenerate',
  },
  getAssistedRecoveryGuidance: {
    method: 'GET',
    path: '/api/v1/session/mfa/assisted-recovery',
  },
  listChapterMemberships: {
    method: 'GET',
    path: '/api/v1/session/chapter-memberships',
  },
  getChapterContext: {
    method: 'GET',
    path: '/api/v1/session/chapter-context',
  },
  selectChapter: {
    method: 'POST',
    path: '/api/v1/session/chapter-selection',
  },
  listMemberships: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/memberships',
  },
  readMembership: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/memberships/{membership_id}',
  },
  lookupMembershipIdentity: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/memberships/identity-reference',
  },
  authorizeMembership: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/memberships/authorize',
  },
  disableMembership: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/memberships/{membership_id}/disable',
  },
  revokeMembership: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/memberships/{membership_id}/revoke',
  },
  readDutyCatalogue: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/catalogue',
  },
  listDutyGrants: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/duty-grants',
  },
  readDutyGrant: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}',
  },
  authorizeDutyGrant: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/authorize',
  },
  amendDutyGrant: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/amend',
  },
  endDutyGrant: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/end',
  },
  revokeDutyGrant: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/revoke',
  },
  substituteDutyGrant: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/substitute',
  },
  readPolicyStatus: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/policy-status',
  },
  listPolicyRoots: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}',
  },
  readPolicyRoot: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}',
  },
  listPolicyVersions: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions',
  },
  readPolicyVersion: {
    method: 'GET',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}',
  },
  savePolicyDraft: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/draft',
  },
  submitPolicyVersion: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}/submit',
  },
  reviewPolicyVersion: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}/review',
  },
  approvePolicyVersion: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}/approve',
  },
  returnPolicyVersion: {
    method: 'POST',
    path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}/return',
  },
  getProvisioningContext: {
    method: 'GET',
    path: '/api/v1/provider/provisioning-context',
  },
  lookupProvisioningIdentity: {
    method: 'POST',
    path: '/api/v1/provider/provisioning-identities/lookup',
  },
  listProvisionings: {
    method: 'GET',
    path: '/api/v1/provider/provisionings',
  },
  createProvisionedChapter: {
    method: 'POST',
    path: '/api/v1/provider/provisionings',
  },
  appointInitialHead: {
    method: 'POST',
    path: '/api/v1/provider/provisionings/{provisioning_id}/initial-head',
  },
  readProvisioning: {
    method: 'GET',
    path: '/api/v1/provider/provisionings/{provisioning_id}',
  },
  lookupProvisioningByKey: {
    method: 'GET',
    path: '/api/v1/provider/provisioning-operations/by-key',
  },
  lookupProvisioningById: {
    method: 'GET',
    path: '/api/v1/provider/provisioning-operations/by-id/{operation_id}',
  },
  disableGlobalIdentity: {
    method: 'POST',
    path: '/api/v1/identities/disable',
  },
  lookupIdentityDisableByKey: {
    method: 'GET',
    path: '/api/v1/identity-disable-operations/by-key',
  },
  lookupIdentityDisableById: {
    method: 'GET',
    path: '/api/v1/identity-disable-operations/by-id/{operation_id}',
  },
} as const;

export type TransportRouteKey = keyof typeof TRANSPORT_ROUTES;

export interface TransportFieldError {
  path?: string;
  pointer?: string;
  code: string;
  message: string;
}

export interface TransportExchangeResult<T = unknown> {
  ok: boolean;
  status: number;
  outcome: 'committed' | 'rejected' | 'stale' | 'forbidden' | 'uncertain';
  code: string;
  message: string;
  next_action?: string | undefined;
  retry_after_seconds?: number | undefined;
  field_feedback?: ReadonlyArray<TransportFieldError> | undefined;
  body?: T | undefined;
}

export interface ExistingIdentityReference {
  user_id: string;
  display_name: string;
}

export interface AssistedRecoveryGuidance {
  availability: 'unavailable';
  blocker: 'assisted_recovery_not_approved';
  message: string;
  next_actions: ReadonlyArray<'bootstrap_session' | 'sign_out'>;
}

export function readCsrfCookie(): string | null {
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

export function createTransportTimeoutSignal(userSignal?: AbortSignal, ms = 3000): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return userSignal !== undefined
      ? AbortSignal.any([userSignal, AbortSignal.timeout(ms)])
      : AbortSignal.timeout(ms);
  }
  return userSignal ?? new AbortController().signal;
}

export async function refreshCsrfCookie(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(TRANSPORT_ROUTES.initializeCsrf.path, {
      method: TRANSPORT_ROUTES.initializeCsrf.method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: createTransportTimeoutSignal(signal, 2000),
    });
    return response.status === 204 || response.status === 200;
  } catch {
    return false;
  }
}

export function buildRoutePath(
  template: string,
  pathParams?: Record<string, string> | undefined,
  queryParams?: Record<string, string | number | undefined> | undefined
): string {
  let pathname = template;
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      pathname = pathname.replace(`{${key}}`, encodeURIComponent(value));
    }
  }
  if (queryParams) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) {
      pathname = `${pathname}?${qs}`;
    }
  }
  return pathname;
}

function classifyFailureOutcome(
  status: number,
  parsed: Record<string, unknown> | null
): TransportExchangeResult['outcome'] {
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 409) {
    const code = typeof parsed?.code === 'string' ? parsed.code : '';
    if (
      code.endsWith('_stale') ||
      code === 'idempotency_conflict' ||
      code === 'chapter_context_stale'
    ) {
      return 'stale';
    }
    return 'rejected';
  }
  if (status === 400 || status === 422) return 'rejected';
  return 'uncertain';
}

export async function exchangeTransport<T = unknown>(
  routeKey: TransportRouteKey,
  options?: {
    path?: Record<string, string> | undefined;
    query?: Record<string, string | number | undefined> | undefined;
    body?: unknown;
    contextRevision?: string | null | undefined;
    signal?: AbortSignal | undefined;
    skipAutoCsrf?: boolean | undefined;
    requireNoStore?: boolean | undefined;
  }
): Promise<TransportExchangeResult<T>> {
  const route = TRANSPORT_ROUTES[routeKey];
  if (route.method === 'POST' && !options?.skipAutoCsrf && !readCsrfCookie()) {
    await refreshCsrfCookie(options?.signal);
  }

  const headers = new Headers({ Accept: 'application/json' });
  if (options?.contextRevision) {
    headers.set('X-Chapter-Context', options.contextRevision);
  }
  if (route.method === 'POST') {
    const csrf = readCsrfCookie();
    if (csrf) {
      headers.set('X-XSRF-TOKEN', csrf);
    }
  }
  if (options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const url = buildRoutePath(route.path, options?.path, options?.query);
  let response: Response;
  try {
    response = await fetch(url, {
      method: route.method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers,
      signal: createTransportTimeoutSignal(options?.signal, 4000),
      ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      outcome: 'uncertain',
      code: 'transport_unavailable',
      message:
        'Transport error or timeout occurred. Original attempt outcome is uncertain; inspect via scoped operation lookup before retrying.',
      next_action: 'lookup_original_attempt',
    };
  }

  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    return {
      ok: false,
      status: 503,
      outcome: 'uncertain',
      code: 'protocol_error',
      message:
        'Unexpected redirect encountered; request aborted fail-closed. Inspect original attempt via lookup.',
      next_action: 'lookup_original_attempt',
    };
  }

  const cacheControl = response.headers.get('Cache-Control');
  const hasNoStore = cacheControl !== null && cacheControl.toLowerCase().includes('no-store');
  if ((cacheControl !== null && !hasNoStore) || (options?.requireNoStore && !hasNoStore)) {
    return {
      ok: false,
      status: response.status,
      outcome: 'uncertain',
      code: 'protocol_error',
      message:
        'Server response lacked required no-store cache directive; treating outcome as uncertain.',
      next_action: 'lookup_original_attempt',
    };
  }

  if (response.status === 204) {
    const bodyText = await response.text().catch(() => '');
    if (bodyText !== '' || response.headers.has('Content-Type')) {
      return {
        ok: false,
        status: 204,
        outcome: 'uncertain',
        code: 'protocol_error',
        message: 'Unexpected HTTP 204 body or Content-Type; treating outcome as uncertain.',
        next_action: 'lookup_original_attempt',
      };
    }
    return {
      ok: true,
      status: 204,
      outcome: 'committed',
      code: 'OK',
      message: 'Completed.',
    };
  }

  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return {
      ok: false,
      status: response.status,
      outcome: 'uncertain',
      code: 'protocol_error',
      message: 'Missing or non-JSON server response Content-Type; treating outcome as uncertain.',
      next_action: 'lookup_original_attempt',
    };
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      outcome: 'uncertain',
      code: 'protocol_error',
      message: 'Malformed JSON response received; treating outcome as uncertain.',
      next_action: 'lookup_original_attempt',
    };
  }

  const obj =
    typeof rawBody === 'object' && rawBody !== null ? (rawBody as Record<string, unknown>) : null;

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      outcome: 'committed',
      code: typeof obj?.code === 'string' ? obj.code : 'OK',
      message: typeof obj?.message === 'string' ? obj.message : 'Request completed.',
      body: rawBody as T,
    };
  }

  const retryHeader = response.headers.get('Retry-After');
  const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : undefined;
  const fieldFeedback = Array.isArray(obj?.field_feedback)
    ? (obj.field_feedback as TransportFieldError[])
    : Array.isArray(obj?.field_errors)
      ? (obj.field_errors as TransportFieldError[])
      : undefined;

  return {
    ok: false,
    status: response.status,
    outcome: classifyFailureOutcome(response.status, obj),
    code: typeof obj?.code === 'string' ? obj.code : `http_${response.status}`,
    message:
      typeof obj?.message === 'string'
        ? obj.message
        : `Request failed with HTTP ${response.status}.`,
    next_action: typeof obj?.next_action === 'string' ? obj.next_action : undefined,
    retry_after_seconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
    field_feedback: fieldFeedback,
    body: rawBody as T,
  };
}

export async function getAssistedRecoveryGuidanceApi(signal?: AbortSignal) {
  return exchangeTransport<AssistedRecoveryGuidance>('getAssistedRecoveryGuidance', { signal });
}

export async function getChapterContextApi(signal?: AbortSignal) {
  return exchangeTransport('getChapterContext', { signal });
}

export async function listChapterMembershipsApi(
  query?: { limit?: number | undefined; cursor?: string | undefined },
  signal?: AbortSignal
) {
  return exchangeTransport('listChapterMemberships', { query, signal });
}

export async function selectChapterContextApi(
  body: {
    chapter_id: string;
    membership_id: string;
    expected_membership_version: number;
  },
  signal?: AbortSignal
) {
  return exchangeTransport('selectChapter', { body, signal });
}

export async function lookupMembershipIdentityApi(
  chapterId: string,
  userId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport<{ identity: ExistingIdentityReference | null }>(
    'lookupMembershipIdentity',
    {
      path: { chapter_id: chapterId },
      body: { user_id: userId.trim() },
      contextRevision,
      signal,
    }
  );
}

export async function lookupProvisioningIdentityApi(userId: string, signal?: AbortSignal) {
  return exchangeTransport<{ identity: ExistingIdentityReference | null }>(
    'lookupProvisioningIdentity',
    {
      body: { user_id: userId.trim() },
      signal,
    }
  );
}

export async function amendDutyGrantApi(
  chapterId: string,
  grantId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
    expected_grant_version: number;
    reason: string;
    grant: {
      duty_code: string;
      scope_kind: 'chapter' | 'unit';
      requesting_unit_id: string | null;
      starts_at: string;
      ends_at: string | null;
      monetary_limit: { currency: 'PHP'; amount: string } | null;
    };
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('amendDutyGrant', {
    path: { chapter_id: chapterId, grant_id: grantId },
    body,
    contextRevision,
    signal,
  });
}

export async function endDutyGrantApi(
  chapterId: string,
  grantId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
    expected_grant_version: number;
    ends_at: string;
    reason: string;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('endDutyGrant', {
    path: { chapter_id: chapterId, grant_id: grantId },
    body,
    contextRevision,
    signal,
  });
}

export async function reviewPolicyVersionApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  versionId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_row_version: number;
    expected_material_version: number;
    material: {
      chapter_id: string;
      record: { id: string; kind: 'CONFIG' };
      material_version: number;
      material_hash: string;
    };
    effective_from: string;
    effective_until: string | null;
    reason: string;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('reviewPolicyVersion', {
    path: {
      chapter_id: chapterId,
      category,
      policy_code: policyCode,
      version_id: versionId,
    },
    body,
    contextRevision,
    signal,
  });
}

export async function lookupChapterOperationByKeyApi(
  chapterId: string,
  actionCode: string,
  idempotencyKey: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupOperationByKey', {
    path: { chapter_id: chapterId },
    query: { action_code: actionCode, idempotency_key: idempotencyKey },
    contextRevision,
    signal,
  });
}

export async function lookupChapterOperationByIdApi(
  chapterId: string,
  operationId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupOperationById', {
    path: { chapter_id: chapterId, operation_id: operationId },
    contextRevision,
    signal,
  });
}

export async function lookupProvisioningOperationByKeyApi(
  actionCode: 'provider.chapters.create' | 'provider.initial_head.appoint',
  idempotencyKey: string,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupProvisioningByKey', {
    query: { action_code: actionCode, idempotency_key: idempotencyKey },
    signal,
  });
}

export async function lookupProvisioningOperationByIdApi(
  operationId: string,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupProvisioningById', {
    path: { operation_id: operationId },
    signal,
  });
}

export async function disableGlobalIdentityApi(
  body: {
    idempotency_key: string;
    identity: { user_id: string };
    expected_identity_version: number;
    reason: string;
  },
  signal?: AbortSignal
) {
  return exchangeTransport('disableGlobalIdentity', {
    body,
    signal,
  });
}

export async function lookupIdentityDisableOperationByKeyApi(
  idempotencyKey: string,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupIdentityDisableByKey', {
    query: { action_code: 'identity.disable', idempotency_key: idempotencyKey },
    signal,
  });
}

export async function lookupIdentityDisableOperationByIdApi(
  operationId: string,
  signal?: AbortSignal
) {
  return exchangeTransport('lookupIdentityDisableById', {
    path: { operation_id: operationId },
    signal,
  });
}

export async function getSessionApi(signal?: AbortSignal) {
  return exchangeTransport('getSession', { signal });
}

export async function signInApi(
  body: { email: string; password: string },
  signal?: AbortSignal
) {
  return exchangeTransport('signIn', { body, signal });
}

export async function signOutApi(signal?: AbortSignal) {
  return exchangeTransport('signOut', { signal });
}

export async function prepareAuthenticatorEnrollmentApi(
  body:
    | { intent: 'begin' }
    | { intent: 'replace_unconfirmed'; enrollment_id: string },
  signal?: AbortSignal
) {
  return exchangeTransport('prepareAuthenticatorEnrollment', { body, signal });
}

export async function confirmAuthenticatorEnrollmentApi(
  body: { enrollment_id: string; authenticator_code: string },
  signal?: AbortSignal
) {
  return exchangeTransport('confirmAuthenticatorEnrollment', { body, signal });
}

export async function verifyMfaChallengeApi(
  body:
    | { challenge_id: string; method: 'authenticator'; authenticator_code: string }
    | { challenge_id: string; method: 'recovery_code'; recovery_code: string },
  signal?: AbortSignal
) {
  return exchangeTransport('verifyMfaChallenge', { body, signal });
}

export async function regenerateRecoveryCodesApi(
  body: { password: string; authenticator_code: string },
  signal?: AbortSignal
) {
  return exchangeTransport('regenerateRecoveryCodes', { body, signal });
}

export async function listMembershipsApi(
  chapterId: string,
  query?: { limit?: number | undefined; cursor?: string | undefined },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('listMemberships', {
    path: { chapter_id: chapterId },
    query,
    contextRevision,
    signal,
  });
}

export async function readMembershipApi(
  chapterId: string,
  membershipId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readMembership', {
    path: { chapter_id: chapterId, membership_id: membershipId },
    contextRevision,
    signal,
  });
}

export async function authorizeMembershipApi(
  chapterId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number | null;
    identity: { user_id: string };
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('authorizeMembership', {
    path: { chapter_id: chapterId },
    body,
    contextRevision,
    signal,
  });
}

export async function disableMembershipApi(
  chapterId: string,
  membershipId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('disableMembership', {
    path: { chapter_id: chapterId, membership_id: membershipId },
    body,
    contextRevision,
    signal,
  });
}

export async function revokeMembershipApi(
  chapterId: string,
  membershipId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('revokeMembership', {
    path: { chapter_id: chapterId, membership_id: membershipId },
    body,
    contextRevision,
    signal,
  });
}

export async function readDutyCatalogueApi(
  chapterId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readDutyCatalogue', {
    path: { chapter_id: chapterId },
    contextRevision,
    signal,
  });
}

export async function listDutyGrantsApi(
  chapterId: string,
  query?: { limit?: number | undefined; cursor?: string | undefined },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('listDutyGrants', {
    path: { chapter_id: chapterId },
    query,
    contextRevision,
    signal,
  });
}

export async function readDutyGrantApi(
  chapterId: string,
  grantId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readDutyGrant', {
    path: { chapter_id: chapterId, grant_id: grantId },
    contextRevision,
    signal,
  });
}

export interface DutyGrantTermsBody {
  duty_code: string;
  scope_kind: 'chapter' | 'unit';
  requesting_unit_id: string | null;
  starts_at: string;
  ends_at: string | null;
  monetary_limit: { currency: 'PHP'; amount: string } | null;
}

export async function authorizeDutyGrantApi(
  chapterId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
    expected_grant_version: null;
    membership_id: string;
    reason: string;
    grant: DutyGrantTermsBody;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('authorizeDutyGrant', {
    path: { chapter_id: chapterId },
    body,
    contextRevision,
    signal,
  });
}

export async function revokeDutyGrantApi(
  chapterId: string,
  grantId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
    expected_grant_version: number;
    reason: string;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('revokeDutyGrant', {
    path: { chapter_id: chapterId, grant_id: grantId },
    body,
    contextRevision,
    signal,
  });
}

export async function substituteDutyGrantApi(
  chapterId: string,
  grantId: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_membership_version: number;
    expected_grant_version: number;
    expected_target_membership_version: number;
    target_membership_id: string;
    grant: DutyGrantTermsBody;
    reason: string;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('substituteDutyGrant', {
    path: { chapter_id: chapterId, grant_id: grantId },
    body,
    contextRevision,
    signal,
  });
}

export async function readPolicyStatusApi(
  chapterId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readPolicyStatus', {
    path: { chapter_id: chapterId },
    contextRevision,
    signal,
  });
}

export async function listPolicyRootsApi(
  chapterId: string,
  category: 'operational' | 'financial',
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('listPolicyRoots', {
    path: { chapter_id: chapterId, category },
    contextRevision,
    signal,
  });
}

export async function readPolicyRootApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readPolicyRoot', {
    path: { chapter_id: chapterId, category, policy_code: policyCode },
    contextRevision,
    signal,
  });
}

export async function listPolicyVersionsApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  query?: { limit?: number | undefined; cursor?: string | undefined },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('listPolicyVersions', {
    path: { chapter_id: chapterId, category, policy_code: policyCode },
    query,
    contextRevision,
    signal,
  });
}

export async function readPolicyVersionApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  versionId: string,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('readPolicyVersion', {
    path: { chapter_id: chapterId, category, policy_code: policyCode, version_id: versionId },
    contextRevision,
    signal,
  });
}

export async function savePolicyDraftApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  body: {
    idempotency_key: string;
    expected_authority_version: number;
    expected_row_version: number | null;
    expected_material_version: number | null;
    metadata: {
      name: string;
      schema_id: string;
      schema_version: number;
      effective_from: string | null;
      effective_until: string | null;
      supersedes_version_id: string | null;
    };
    reason: string;
  },
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('savePolicyDraft', {
    path: { chapter_id: chapterId, category, policy_code: policyCode },
    body,
    contextRevision,
    signal,
  });
}

export interface PolicyTransitionBody {
  idempotency_key: string;
  expected_authority_version: number;
  expected_row_version: number;
  expected_material_version: number;
  material: {
    chapter_id: string;
    record: { id: string; kind: 'CONFIG' };
    material_version: number;
    material_hash: string;
  };
  effective_from: string;
  effective_until: string | null;
  reason: string;
}

export async function submitPolicyVersionApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  versionId: string,
  body: PolicyTransitionBody,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('submitPolicyVersion', {
    path: { chapter_id: chapterId, category, policy_code: policyCode, version_id: versionId },
    body,
    contextRevision,
    signal,
  });
}

export async function approvePolicyVersionApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  versionId: string,
  body: PolicyTransitionBody,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('approvePolicyVersion', {
    path: { chapter_id: chapterId, category, policy_code: policyCode, version_id: versionId },
    body,
    contextRevision,
    signal,
  });
}

export async function returnPolicyVersionApi(
  chapterId: string,
  category: 'operational' | 'financial',
  policyCode: string,
  versionId: string,
  body: PolicyTransitionBody,
  contextRevision?: string | null,
  signal?: AbortSignal
) {
  return exchangeTransport('returnPolicyVersion', {
    path: { chapter_id: chapterId, category, policy_code: policyCode, version_id: versionId },
    body,
    contextRevision,
    signal,
  });
}

export async function getProvisioningContextApi(signal?: AbortSignal) {
  return exchangeTransport<{ authority_version: number }>('getProvisioningContext', { signal });
}

export async function listProvisioningsApi(
  query?: { limit?: number | undefined; cursor?: string | undefined },
  signal?: AbortSignal
) {
  return exchangeTransport('listProvisionings', { query, signal });
}

export async function createProvisionedChapterApi(
  body: {
    idempotency_key: string;
    expected_provider_authority_version: number;
    chapter: { code: string; name: string };
  },
  signal?: AbortSignal
) {
  return exchangeTransport<{ provisioning?: { id: string; version: number } }>(
    'createProvisionedChapter',
    { body, signal }
  );
}

export async function appointInitialHeadApi(
  provisioningId: string,
  body: {
    idempotency_key: string;
    expected_provider_authority_version: number;
    expected_provisioning_version: number;
    identity: { user_id: string };
    reason: string;
  },
  signal?: AbortSignal
) {
  return exchangeTransport('appointInitialHead', {
    path: { provisioning_id: provisioningId },
    body,
    signal,
  });
}

export async function readProvisioningApi(provisioningId: string, signal?: AbortSignal) {
  return exchangeTransport('readProvisioning', {
    path: { provisioning_id: provisioningId },
    signal,
  });
}
