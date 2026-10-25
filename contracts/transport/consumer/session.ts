// Validation consumer only. No application client, persistence or automatic retries.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { components, operations } from '../generated/api.d.ts';
import { routes } from '../generated/routes.ts';
import schemas from '../generated/session-validation.json' with { type: 'json' };

export type Session = components['schemas']['SessionSnapshot'];
type Operation = keyof typeof schemas;
type Responses<K extends Operation> = operations[K]['responses'];
type Result<K extends Operation> = {
  [S in keyof Responses<K>]: { kind: 'response'; status: S }
    & (Responses<K>[S] extends { content: { 'application/json': infer B } } ? { body: B } : { body?: never })
    & (S extends 429 ? { retryAfter: Responses<K>[S] extends { headers: { 'Retry-After': infer H } } ? H : never } : {});
}[keyof Responses<K>];
type Failure = { kind: 'unresolved'; reason: 'transport' | 'protocol' | 'csrf_cookie' };
type Options<K extends Operation> = {
  origin: string; cookie: string; signal: AbortSignal;
  fetch: (url: URL, init: RequestInit) => Promise<Response>;
} & (operations[K] extends { requestBody: { content: { 'application/json': infer B } } } ? { body: B } : { body?: never });
export type ConsumerExample = { [K in Operation]: {
  operationId: K; request: Pick<Options<K>, 'body'>; response: Result<K>;
} }[Operation];

const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);

export async function exchangeSession<K extends Operation>(operation: K, options: Options<K>): Promise<Result<K> | Failure> {
  const route = routes[operation];
  const headers = new Headers({ Accept: 'application/json' });
  if (route.method === 'POST') {
    const encoded = options.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('XSRF-TOKEN='));
    if (encoded) {
      try { headers.set('X-XSRF-TOKEN', decodeURIComponent(encoded.slice('XSRF-TOKEN='.length))); }
      catch { return { kind: 'unresolved', reason: 'csrf_cookie' }; }
    }
  }
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await options.fetch(new URL(route.path, options.origin), {
      method: route.method, credentials: 'include', redirect: 'error', cache: 'no-store',
      headers, signal: options.signal,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch { return { kind: 'unresolved', reason: 'transport' }; }
  if (response.redirected || response.status >= 300 && response.status < 400
      || response.headers.get('Cache-Control') !== 'no-store') return { kind: 'unresolved', reason: 'protocol' };
  let candidate: unknown;
  try {
    if (response.status === 204) {
      if (await response.text() !== '' || response.headers.has('Content-Type')) return { kind: 'unresolved', reason: 'protocol' };
      candidate = { kind: 'response', status: 204 };
    } else {
      if (response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return { kind: 'unresolved', reason: 'protocol' };
      }
      const body: unknown = await response.json();
      candidate = { kind: 'response', status: response.status, body,
        ...(response.status === 429 ? { retryAfter: response.headers.get('Retry-After') } : {}) };
    }
  } catch { return { kind: 'unresolved', reason: 'protocol' }; }
  // The runtime guard and TypeScript result both come from the canonical operation.
  const validate = ajv.compile<Result<K>>(schemas[operation]);
  return validate(candidate) ? candidate : { kind: 'unresolved', reason: 'protocol' };
}

export function sessionNextAction(session: Session): string {
  switch (session.state) {
    case 'signed_out': return 'sign_in';
    case 'mfa_enrollment_required': return 'enroll_mfa';
    case 'mfa_challenge_required': return 'verify_mfa';
    case 'authenticated': return session.mfa.status === 'verified' ? 'authenticated_mfa_verified' : 'authenticated_mfa_not_required';
    default: return exhaustive(session);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unexpected authentication state: ${String(value)}`);
}
