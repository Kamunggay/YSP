import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmAuthenticatorEnrollment,
  createOfficerAccount,
  initializeCsrf,
  inviteChapterOfficer,
  prepareAuthenticatorEnrollment,
  provisionChapter,
  signIn,
  signOut,
  verifyMfaChallenge,
} from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes CSRF cookie successfully', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    const ok = await initializeCsrf();
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/csrf-cookie', expect.objectContaining({ method: 'GET' }));
  });

  it('handles signIn 200 with mfa_challenge_required', async () => {
    vi.spyOn(globalThis, 'fetch')
      // csrf call
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      // sign-in call
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            state: 'mfa_challenge_required',
            challenge: { id: 'chl_123', delivery: 'totp_app' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const result = await signIn('officer@example.com', 'ValidPass123!');
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.session.state).toBe('mfa_challenge_required');
    }
  });

  it('handles signIn 401 invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'invalid_credentials', message: 'Unable to sign in.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const result = await signIn('wrong@example.com', 'badpass');
    expect(result.kind).toBe('invalid_credentials');
  });

  it('handles signIn 403 forbidden (membership revoked)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'forbidden', message: 'This request is not permitted.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const result = await signIn('revoked@example.com', 'pass123');
    expect(result.kind).toBe('forbidden');
    if (result.kind === 'forbidden') {
      expect(result.isRevoked).toBe(true);
    }
  });

  it('handles signIn 429 throttled', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'throttled', message: 'Try again after the indicated delay.' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }
        )
      );

    const result = await signIn('spam@example.com', 'pass123');
    expect(result.kind).toBe('throttled');
    if (result.kind === 'throttled') {
      expect(result.retryAfterSeconds).toBe(30);
    }
  });

  it('handles verifyMfaChallenge with authenticator code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          state: 'authenticated',
          user: { id: 'usr_1', display_name: 'Maria Santos' },
          mfa: { status: 'verified', verified_at: '2026-10-28T04:00:00Z' },
          active_chapter: { id: 'chp_1', code: 'CEB-01', name: 'Cebu Central' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await verifyMfaChallenge('chl_123', 'authenticator', '123456');
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.session.user.display_name).toBe('Maria Santos');
    }
  });

  it('handles verifyMfaChallenge rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'invalid_code' }), { status: 401 })
    );

    const result = await verifyMfaChallenge('chl_123', 'authenticator', '000000');
    expect(result.kind).toBe('rejected');
  });

  it('handles prepareAuthenticatorEnrollment and confirmAuthenticatorEnrollment', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            enrollment: { id: 'enr_456', manual_key: 'TEST-KEY-1234' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              state: 'authenticated',
              user: { id: 'usr_2', display_name: 'Juan Dela Cruz' },
              mfa: { status: 'verified' },
            },
            recovery_codes: { codes: ['KMG9-4821', 'YSP3-7740'] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const prep = await prepareAuthenticatorEnrollment('begin');
    expect(prep.kind).toBe('success');
    if (prep.kind === 'success') {
      expect(prep.enrollmentId).toBe('enr_456');
      expect(prep.setupKey).toBe('TEST-KEY-1234');
    }

    const conf = await confirmAuthenticatorEnrollment('enr_456', '654321');
    expect(conf.kind).toBe('success');
    if (conf.kind === 'success') {
      expect(conf.recoveryCodes).toEqual(['KMG9-4821', 'YSP3-7740']);
    }
  });

  it('handles signOut', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    const ok = await signOut();
    expect(ok).toBe(true);
  });

  it('handles provisionChapter, inviteChapterOfficer, and createOfficerAccount', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ provisioning: { id: 'prov_999' } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    const prov = await provisionChapter({
      chapterName: 'YSP Mandaue',
      chapterCode: 'MAN-01',
      headName: 'Ana Reyes',
      headEmail: 'ana@ysp.org',
      initialPassword: 'Password123!',
    });
    expect(prov.kind).toBe('success');
    if (prov.kind === 'success') {
      expect(prov.provisioningId).toBe('prov_999');
    }

    const inv = await inviteChapterOfficer({
      officerName: 'Pedro Penduko',
      officerEmail: 'pedro@ysp.org',
      duties: ['Inventory Custodian', 'Finance Officer'],
    });
    expect(inv.kind).toBe('success');

    const acct = await createOfficerAccount({
      fullName: 'Pedro Penduko',
      email: 'pedro@ysp.org',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    });
    expect(acct.kind).toBe('success');
  });
});
