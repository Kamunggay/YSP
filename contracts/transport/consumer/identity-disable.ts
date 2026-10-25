// Contract exercise only. No enabled mutation, result store or automatic retry.
import type { components, operations } from '../generated/api.d.ts';
import { exchangeSession } from './session.ts';

type BoundaryReply = Awaited<ReturnType<typeof exchangeSession<'disableGlobalIdentity'>>>;
type Feedback = Readonly<{
  original_outcome: 'uncertain';
  next_action: 'retain_original_attempt' | 'sign_in' | 'forbidden' | 'unavailable'
    | 'refresh_csrf' | 'correct_fields' | 'correct_selectors' | 'wait';
}>;

// A new boundary error is never evidence that an earlier attempt was rejected.
export function identityDisableFeedback(reply: BoundaryReply): Feedback {
  if (reply.kind === 'unresolved') return { original_outcome: 'uncertain', next_action: 'retain_original_attempt' };
  const actions = {
    400: 'correct_selectors', 401: 'sign_in', 403: 'forbidden', 419: 'refresh_csrf',
    422: 'correct_fields', 429: 'wait', 503: 'unavailable',
  } as const satisfies Record<keyof operations['disableGlobalIdentity']['responses'], Feedback['next_action']>;
  return { original_outcome: 'uncertain', next_action: actions[reply.status] };
}

export async function compileIdentityDisable(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const body = {
    idempotency_key: 'synthetic-global-disable-key', identity: { user_id: '9007199254740994' },
    expected_identity_version: 7, reason: 'Synthetic requested disable',
  } satisfies components['schemas']['GlobalIdentityDisableRequest'];
  const reply = await exchangeSession('disableGlobalIdentity', { ...common, body });
  if (reply.kind === 'response') {
    const noSuccess: 400 | 401 | 403 | 419 | 422 | 429 | 503 = reply.status;
    // @ts-expect-error No identity or durable result can be disclosed by the unavailable boundary.
    reply.body.identity;
    void noSuccess;
  }
  const byKey = await exchangeSession('lookupIdentityDisableByKey', { ...common, query: { action_code: 'identity.disable', idempotency_key: body.idempotency_key } });
  const byId = await exchangeSession('lookupIdentityDisableById', { ...common, path: { operation_id: '01K8A6J0A00000000000000001' } });
  identityDisableFeedback(byKey);
  identityDisableFeedback(byId);
  // @ts-expect-error Global disable cannot be selected as a chapter action.
  await exchangeSession('disableGlobalIdentity', { ...common, body, contextRevision: 'ctx_synthetic' });
  // @ts-expect-error A missing target version cannot prepare even the inert request.
  await exchangeSession('disableGlobalIdentity', { ...common, body: { idempotency_key: 'key', identity: body.identity, reason: 'Synthetic' } });
  // @ts-expect-error Global lookup has no caller-supplied provider/chapter scope.
  await exchangeSession('lookupIdentityDisableByKey', { ...common, query: { action_code: 'identity.disable', idempotency_key: body.idempotency_key, organization_id: '1' } });
  // @ts-expect-error Key-only lookup is ambiguous.
  await exchangeSession('lookupIdentityDisableByKey', { ...common, query: { idempotency_key: body.idempotency_key } });
  // @ts-expect-error Membership disable is a different scoped action.
  await exchangeSession('lookupIdentityDisableByKey', { ...common, query: { action_code: 'memberships.disable', idempotency_key: body.idempotency_key } });
  // @ts-expect-error IDs remain exact canonical strings.
  const numeric: components['schemas']['GlobalIdentityDisableRequest'] = { ...body, identity: { user_id: 9007199254740994 } };
  // @ts-expect-error Global scope is server-bound, never caller input.
  const scope: components['schemas']['GlobalIdentityDisableRequest'] = { ...body, scope: { kind: 'global' } };
  // @ts-expect-error No 200 response is defined while success/lookup are unapproved.
  const success: keyof operations['disableGlobalIdentity']['responses'] = 200;
  void numeric; void scope; void success;
}
