export type HealthResult = { status: 'connected' } | { status: 'unavailable' };

// Infrastructure health is deliberately separate from the business ActionResult contract.
export async function checkHealth(signal: AbortSignal): Promise<HealthResult> {
  try {
    const response = await fetch('/api/v1/health', { signal, cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    const body: unknown = await response.json();
    if (response.status === 200 && typeof body === 'object' && body !== null
      && Object.keys(body).length === 2
      && 'status' in body && body.status === 'ok' && 'database' in body && body.database === 'ok') {
      return { status: 'connected' };
    }
  } catch {
    // Never render response bodies or exception messages from an untrusted boundary.
  }
  return { status: 'unavailable' };
}
