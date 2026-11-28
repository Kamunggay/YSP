import type { ApiEnvelope, ApiErrorEnvelope, ConnectionState } from './types.ts';

export class ContractApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Array<{ pointer: string; code: string; message: string }>;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly extra: ApiErrorEnvelope | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: {
      fields?: Array<{ pointer: string; code: string; message: string }>;
      requestId?: string;
      retryAfterSeconds?: number;
      extra?: ApiErrorEnvelope;
    },
  ) {
    super(message);
    this.name = 'ContractApiError';
    this.status = status;
    this.code = code;
    this.fields = options?.fields ?? [];
    this.requestId = options?.requestId;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.extra = options?.extra;
  }
}

export function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('XSRF-TOKEN=')) {
      const raw = trimmed.slice('XSRF-TOKEN='.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function newActionKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-000000000000';
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function formatManilaTime(utcIso: string | null | undefined): string {
  if (!utcIso) {
    return '—';
  }
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  return (
    new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date) + ' PHT (+08:00)'
  );
}

let csrfPromise: Promise<void> | null = null;

export async function ensureCsrf(force = false): Promise<void> {
  if (!force && readXsrfCookie() !== null) {
    return;
  }
  if (!csrfPromise) {
    csrfPromise = (async () => {
      const response = await fetch('/api/v1/auth/csrf', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        await throwParsedError(response);
      }
    })().finally(() => {
      csrfPromise = null;
    });
  }
  await csrfPromise;
}

async function throwParsedError(response: Response): Promise<never> {
  const retryRaw = response.headers.get('Retry-After');
  const retryAfterSeconds = retryRaw && /^\d+$/.test(retryRaw) ? Number.parseInt(retryRaw, 10) : undefined;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload && typeof payload === 'object' && 'error' in payload) {
    const rawPayload = payload as { error?: unknown; message?: unknown; request_id?: string };
    if (rawPayload.error && typeof rawPayload.error === 'object' && 'code' in rawPayload.error) {
      const errObj = payload as ApiErrorEnvelope;
      if (errObj.error && typeof errObj.error.code === 'string') {
        throw new ContractApiError(response.status, errObj.error.code, errObj.error.message || 'Request rejected.', {
          fields: Array.isArray(errObj.error.fields) ? errObj.error.fields : [],
          requestId: errObj.request_id,
          retryAfterSeconds,
          extra: errObj,
        });
      }
    }
    if (typeof rawPayload.error === 'string') {
      const message = typeof rawPayload.message === 'string' && rawPayload.message !== '' ? rawPayload.message : rawPayload.error;
      throw new ContractApiError(response.status, rawPayload.error, message, {
        requestId: rawPayload.request_id,
        retryAfterSeconds,
      });
    }
  }

  throw new ContractApiError(response.status, `http_${response.status}`, `HTTP ${response.status} error.`, {
    retryAfterSeconds,
  });
}

export async function checkHealth(signal?: AbortSignal): Promise<ConnectionState> {
  try {
    const combinedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
      signal: combinedSignal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const result: unknown = await response.json();
    return response.ok && typeof result === 'object' && result !== null && 'database' in result && result.database === 'connected'
      ? 'connected'
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function apiGetRaw<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(extraHeaders ?? {}),
    },
  });
  if (!response.ok) {
    await throwParsedError(response);
  }
  return (await response.json()) as T;
}

export async function apiGet<T>(path: string, extraHeaders?: Record<string, string>): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(extraHeaders ?? {}),
    },
  });
  if (!response.ok) {
    await throwParsedError(response);
  }
  const json = (await response.json()) as { data?: T; page?: ApiEnvelope<T>['page'] };
  return {
    data: (json.data !== undefined ? json.data : json) as T,
    page: json.page,
    replayed: response.headers.get('X-Action-Replayed') === 'true',
  };
}

export async function apiGetText(path: string, accept = 'text/html'): Promise<string> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: accept },
  });
  if (!response.ok) {
    await throwParsedError(response);
  }
  return response.text();
}

export async function apiGetBlob(path: string): Promise<{ blob: Blob; contentType: string }> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwParsedError(response);
  }
  return {
    blob: await response.blob(),
    contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
  };
}

export async function apiMutate<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown | null,
  actionKey?: string,
): Promise<{ result: ApiEnvelope<T>; actionKey: string }> {
  await ensureCsrf();
  const key = actionKey ?? newActionKey();
  const xsrf = readXsrfCookie() ?? '';

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-XSRF-TOKEN': xsrf,
    'X-Action-Key': key,
  };
  let payloadBody: BodyInit | undefined;
  if (body instanceof FormData) {
    payloadBody = body;
  } else if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payloadBody = JSON.stringify(body);
  }

  let response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    body: payloadBody,
  });

  if (response.status === 419) {
    await ensureCsrf(true);
    const refreshedXsrf = readXsrfCookie() ?? '';
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { ...headers, 'X-XSRF-TOKEN': refreshedXsrf },
      body: payloadBody,
    });
  }

  if (!response.ok) {
    await throwParsedError(response);
  }

  if (response.status === 204) {
    return {
      actionKey: key,
      result: { data: undefined as T, replayed: response.headers.get('X-Action-Replayed') === 'true' },
    };
  }

  const json = (await response.json()) as { data?: T; page?: ApiEnvelope<T>['page'] };
  return {
    actionKey: key,
    result: {
      data: (json.data !== undefined ? json.data : json) as T,
      page: json.page,
      replayed: response.headers.get('X-Action-Replayed') === 'true',
    },
  };
}

export async function apiAuthorizeChannel(path: string, body: { socket_id: string; channel_name: string }): Promise<string> {
  await ensureCsrf();
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-XSRF-TOKEN': readXsrfCookie() ?? '',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwParsedError(response);
  }
  const json = (await response.json()) as { auth?: string };
  if (!json.auth) {
    throw new ContractApiError(503, 'unavailable', 'Missing notification channel signature.');
  }
  return json.auth;
}
