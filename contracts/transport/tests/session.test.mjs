import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadContract, validateExchange } from '../validation/operation-examples.mjs';

const { api, ajv } = await loadContract();
const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('SEC-01/TR-16: session slice has exact operations and validating named exchanges', async () => {
  const inventory = [
    ['/session', 'get', 'getSession'], ['/session/sign-in', 'post', 'signIn'],
    ['/session/sign-out', 'post', 'signOut'], ['/csrf-cookie', 'get', 'initializeCsrf'],
  ];
  for (const [path, method, id] of inventory) assert.equal(api.paths[path]?.[method]?.operationId, id);
  assert.deepEqual(api.paths['/csrf-cookie'].get.servers, [{ url: '/' }]);
  const exchanges = await readJson('../v1/session-exchanges.json');
  for (const exchange of exchanges) validateExchange(api, ajv, exchange);
  assert.deepEqual(new Set(exchanges.filter(e => e.response.status === 200).map(e => e.response.body.state)),
    new Set(['signed_out', 'mfa_enrollment_required', 'mfa_challenge_required', 'authenticated']));
});

test('TR-03/UX-02: the consumer forwards browser credentials and decodes the CSRF cookie once', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const exchanges = await readJson('../v1/session-exchanges.json');
  const example = exchanges.find(e => e.name === 'sign-in-challenge');
  const result = await exchangeSession('signIn', {
    origin: example.browser.origin, cookie: example.browser.cookie,
    body: example.request.body, signal: new AbortController().signal,
    fetch: async (url, init) => {
      assert.equal(url.href, 'https://ysp.example.test/api/v1/session/sign-in');
      assert.equal(init.credentials, 'include');
      assert.equal(init.headers.get('X-XSRF-TOKEN'), 'encrypted+token=');
      return new Response(JSON.stringify(example.response.body), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    },
  });
  assert.deepEqual(result, { kind: 'response', status: 200, body: example.response.body });
});

test('SEC-01/SEC-03: restricted states reject authority disclosure and shared exact values stay strict', () => {
  const validate = ajv.compile(api.components.schemas.SessionSnapshot);
  for (const state of ['signed_out', 'mfa_enrollment_required', 'mfa_challenge_required']) {
    for (const field of ['chapter_choices', 'chapter_context', 'duties', 'permissions', 'provider_destinations', 'operation', 'user']) {
      assert.equal(validate({ state, [field]: [] }), false, `${state} leaks ${field}`);
    }
  }
  const authenticated = api.paths['/session'].get.responses[200].content['application/json'].examples['bootstrap-approver'].value;
  for (const change of [
    v => { v.user.id = 9007199254740992; },
    v => { v.user.id = '18446744073709551616'; },
    v => { v.user.id = '01'; },
    v => { v.mfa.verified_at = '2026-02-30T00:00:00.000000Z'; },
    v => { v.mfa.verified_at = '2026-10-25T14:00:00+08:00'; },
    v => { delete v.mfa.verified_at; },
    v => { v.mfa = { status: 'not_required', verified_at: '2026-10-25T06:00:00.000000Z' }; },
    v => { v.provider_destinations = [{ kind: 'chapter_provisioning', scope: { kind: 'chapter', chapter_id: '1' } }]; },
  ]) {
    const invalid = structuredClone(authenticated); change(invalid);
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
  }
  assert.equal(validate({ state: 'logged_in' }), false);
  const signIn = ajv.compile(api.paths['/session/sign-in'].post.responses[200].content['application/json'].schema);
  assert.equal(signIn({ state: 'signed_out' }), false);
});

test('TR-16/UX-03: every validated exchange drives the generated consumer without status collapse or unsafe retries', async () => {
  const { exchangeSession, sessionNextAction } = await import('../consumer/session.ts');
  const urls = {
    getSession: 'https://ysp.example.test/api/v1/session',
    signIn: 'https://ysp.example.test/api/v1/session/sign-in',
    signOut: 'https://ysp.example.test/api/v1/session/sign-out',
    initializeCsrf: 'https://ysp.example.test/csrf-cookie',
  };
  const exchanges = await readJson('../v1/session-exchanges.json');
  for (const example of exchanges) {
    validateExchange(api, ajv, example);
    let calls = 0;
    const result = await exchangeSession(example.operationId, {
      origin: example.browser.origin,
      cookie: example.request.header?.['X-XSRF-TOKEN'] ? example.browser.cookie : '',
      signal: new AbortController().signal,
      ...(example.request.body ? { body: example.request.body } : {}),
      fetch: async (url, init) => {
        calls++;
        assert.equal(url.href, urls[example.operationId]);
        assert.equal(init.method, example.method.toUpperCase());
        assert.equal(init.credentials, 'include');
        assert.equal(init.redirect, 'error');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.headers.get('Accept'), 'application/json');
        assert.equal(init.headers.get('X-XSRF-TOKEN'), example.request.header?.['X-XSRF-TOKEN'] ?? null);
        assert.equal(init.body, example.request.body ? JSON.stringify(example.request.body) : undefined);
        const headers = new Headers(example.response.headers);
        if (example.response.mediaType) headers.set('Content-Type', example.response.mediaType);
        return new Response(example.response.body ? JSON.stringify(example.response.body) : null, { status: example.response.status, headers });
      },
    });
    assert.equal(calls, 1, example.name);
    assert.deepEqual(result, { kind: 'response', status: example.response.status,
      ...(example.response.body ? { body: example.response.body } : {}),
      ...(example.response.status === 429 ? { retryAfter: '30' } : {}),
    }, example.name);
    if (result.status === 200) assert.ok(sessionNextAction(result.body));
  }
  const failures = exchanges.filter(e => ['sign-in-wrong-password', 'sign-in-unknown-email', 'sign-in-disabled-identity'].includes(e.name));
  assert.equal(failures.length, 3);
  assert.deepEqual(failures[0].response, failures[1].response);
  assert.deepEqual(failures[0].response, failures[2].response);
});

test('DOC-11/UX-02: HTML, redirects, broken JSON, invalid schemas and transport loss keep uncertainty', async () => {
  const { exchangeSession } = await import('../consumer/session.ts');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const responses = [
    () => new Response('<html>Sign in</html>', { status: 200, headers: { ...headers, 'Content-Type': 'text/html' } }),
    () => new Response(null, { status: 302, headers }),
    () => new Response('{', { status: 200, headers }),
    () => new Response('{"state":"logged_in"}', { status: 200, headers }),
    () => new Response('{"state":"signed_out"}', { status: 200, headers }),
    () => new Response('{"code":"throttled","message":"Try again after the indicated delay."}', { status: 429, headers }),
    () => new Response('{"code":"throttled","message":"Try again after the indicated delay."}', { status: 429, headers: { ...headers, 'Retry-After': '0' } }),
    () => new Response('{"state":"mfa_challenge_required"}', { status: 200, headers: { ...headers, 'Cache-Control': 'public' } }),
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
    () => { throw new TypeError('Connection lost'); },
    () => ({ status: 200, redirected: true, headers: new Headers(headers) }),
    () => ({ status: 200, redirected: false, headers: new Headers(headers), json: async () => { throw new TypeError('Body stream lost'); } }),
  ];
  for (const respond of responses) {
    let calls = 0;
    const result = await exchangeSession('signIn', {
      origin: 'https://ysp.example.test', cookie: 'XSRF-TOKEN=opaque', signal: new AbortController().signal,
      body: { email: 'officer@example.test', password: 'synthetic-only' },
      fetch: async () => { calls++; return respond(); },
    });
    assert.equal(result.kind, 'unresolved'); assert.equal(calls, 1);
  }
  for (const respond of [
    () => ({ status: 204, redirected: false, headers: new Headers({ 'Cache-Control': 'no-store' }), text: async () => '{}' }),
    () => new Response(null, { status: 204, headers }),
  ]) {
    const result = await exchangeSession('initializeCsrf', { origin: 'https://ysp.example.test', cookie: '',
      signal: new AbortController().signal, fetch: async () => respond() });
    assert.equal(result.kind, 'unresolved');
  }
  const earlier = await exchangeSession('signOut', { origin: 'https://ysp.example.test', cookie: '',
    signal: new AbortController().signal, fetch: async () => { throw new TypeError('Lost logout response'); } });
  const rejection = await exchangeSession('signOut', { origin: 'https://ysp.example.test', cookie: '',
    signal: new AbortController().signal,
    fetch: async () => new Response(JSON.stringify({ code: 'csrf_mismatch', message: 'Refresh CSRF before a reviewed new attempt.' }), { status: 419, headers }),
  });
  assert.equal(rejection.status, 419);
  assert.deepEqual(earlier, { kind: 'unresolved', reason: 'transport' });
});

test('TR-16: cookie and forgery proposals state their review gates and successful wire attributes', async () => {
  const contract = api['x-session-contract'];
  assert.equal(contract.cookies.production.session_store, 'Shared MySQL; no replica-local session state');
  assert.equal(contract.cookies.production.secure, true);
  assert.equal(contract.cookies.production.ysp_session.http_only, true);
  assert.equal(contract.cookies.production['XSRF-TOKEN'].http_only, false);
  assert.match(contract.review_status, /freeze blocked/);
  assert.match(contract.forgery_policy.same_origin_missing_token, /419/);
  const exchanges = await readJson('../v1/session-exchanges.json');
  for (const e of exchanges.filter(e => e.response.headers['set-cookie'])) {
    const cookies = e.response.headers['set-cookie'];
    assert.equal(cookies.length, 2);
    for (const cookie of cookies) {
      assert.match(cookie, /; Secure(?:;|$)/); assert.match(cookie, /; Path=\/(?:;|$)/);
      assert.match(cookie, /; SameSite=Lax(?:;|$)/); assert.doesNotMatch(cookie, /; Domain=/i);
    }
    assert.match(cookies[0], /^ysp_session=.+;.*HttpOnly/);
    assert.match(cookies[1], /^XSRF-TOKEN=/); assert.doesNotMatch(cookies[1], /HttpOnly/i);
  }
  const invalid = structuredClone(exchanges.find(e => e.name === 'sign-in-fields'));
  invalid.request.body = { email: 'valid@example.test', password: 'synthetic-only' };
  assert.throws(() => validateExchange(api, ajv, invalid), /validation rejection requires invalid request input/);
});
