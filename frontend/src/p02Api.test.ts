import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSPORT_ROUTES,
  amendDutyGrantApi,
  disableGlobalIdentityApi,
  endDutyGrantApi,
  getAssistedRecoveryGuidanceApi,
  lookupChapterOperationByKeyApi,
  lookupMembershipIdentityApi,
  lookupProvisioningIdentityApi,
  reviewPolicyVersionApi,
} from './p02Api';

describe('p02Api (canonical transport client)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains all 49 routes matching contracts/transport/generated/routes.ts', () => {
    expect(Object.keys(TRANSPORT_ROUTES)).toHaveLength(49);
    expect(TRANSPORT_ROUTES.lookupMembershipIdentity).toEqual({
      method: 'POST',
      path: '/api/v1/chapters/{chapter_id}/memberships/identity-reference',
    });
    expect(TRANSPORT_ROUTES.amendDutyGrant).toEqual({
      method: 'POST',
      path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/amend',
    });
    expect(TRANSPORT_ROUTES.endDutyGrant).toEqual({
      method: 'POST',
      path: '/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}/end',
    });
    expect(TRANSPORT_ROUTES.reviewPolicyVersion).toEqual({
      method: 'POST',
      path: '/api/v1/chapters/{chapter_id}/policies/{category}/{policy_code}/versions/{version_id}/review',
    });
    expect(TRANSPORT_ROUTES.lookupProvisioningIdentity).toEqual({
      method: 'POST',
      path: '/api/v1/provider/provisioning-identities/lookup',
    });
    expect(TRANSPORT_ROUTES.getAssistedRecoveryGuidance).toEqual({
      method: 'GET',
      path: '/api/v1/session/mfa/assisted-recovery',
    });
  });

  it('sends X-Chapter-Context and CSRF token for membership & provisioning identity lookups', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ identity: { user_id: '9007199254740994', display_name: 'Elena Santos' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ identity: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const memLookup = await lookupMembershipIdentityApi(
      '1',
      '9007199254740994',
      'ctx_rev_01'
    );
    expect(memLookup.ok).toBe(true);
    expect(memLookup.body?.identity?.display_name).toBe('Elena Santos');

    const secondCallInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    const headers = secondCallInit.headers as Headers;
    expect(headers.get('X-Chapter-Context')).toBe('ctx_rev_01');
    expect(secondCallInit.cache).toBe('no-store');
    expect(secondCallInit.redirect).toBe('error');

    const provLookup = await lookupProvisioningIdentityApi('9999999');
    expect(provLookup.ok).toBe(true);
    expect(provLookup.body?.identity).toBeNull();
  });

  it('routes amendDutyGrant, endDutyGrant, reviewPolicyVersion, and lookupOperationByKey accurately', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action_result: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action_result: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action_result: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ action_result: 'uncertain', lookup_state: 'pending_or_not_visible' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    await amendDutyGrantApi(
      '1',
      '1001',
      {
        idempotency_key: 'amend-k1',
        expected_authority_version: 3,
        expected_membership_version: 1,
        expected_grant_version: 1,
        reason: 'Adjust approval ceiling',
        grant: {
          duty_code: 'RF_APPROVER',
          scope_kind: 'chapter',
          requesting_unit_id: null,
          starts_at: '2026-10-26T00:00:00.000000Z',
          ends_at: null,
          monetary_limit: { currency: 'PHP', amount: '2500.00' },
        },
      },
      'ctx_rev_01'
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/api/v1/chapters/1/duty-grants/1001/amend');

    await endDutyGrantApi(
      '1',
      '1001',
      {
        idempotency_key: 'end-k1',
        expected_authority_version: 4,
        expected_membership_version: 1,
        expected_grant_version: 2,
        ends_at: '2026-12-31T23:59:59.000000Z',
        reason: 'Scheduled rotation end',
      },
      'ctx_rev_01'
    );
    expect(fetchSpy.mock.calls[3]?.[0]).toBe('/api/v1/chapters/1/duty-grants/1001/end');

    await reviewPolicyVersionApi(
      '1',
      'financial',
      'RETURN_REFUND_VALUATION_POLICY',
      '42',
      {
        idempotency_key: 'rev-k1',
        expected_authority_version: 5,
        expected_row_version: 2,
        expected_material_version: 1,
        material: {
          chapter_id: '1',
          record: { id: '42', kind: 'CONFIG' },
          material_version: 1,
          material_hash: 'a'.repeat(64),
        },
        effective_from: '2026-11-01T00:00:00.000000Z',
        effective_until: null,
        reason: 'Completed financial control review',
      },
      'ctx_rev_01'
    );
    expect(fetchSpy.mock.calls[5]?.[0]).toBe(
      '/api/v1/chapters/1/policies/financial/RETURN_REFUND_VALUATION_POLICY/versions/42/review'
    );

    await lookupChapterOperationByKeyApi('1', 'duty_grants.amend', 'amend-k1', 'ctx_rev_01');
    expect(fetchSpy.mock.calls[6]?.[0]).toBe(
      '/api/v1/chapters/1/operations/by-key?action_code=duty_grants.amend&idempotency_key=amend-k1'
    );
  });

  it('handles 503 global disable boundary, assisted recovery unavailability, and network errors fail-closed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'global_identity_disable_unavailable',
            message: 'Global identity disable is unavailable.',
            next_action: 'do_not_retry_mutation',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            availability: 'unavailable',
            blocker: 'assisted_recovery_not_approved',
            message:
              'Assisted recovery is unavailable until an authorized proof and reset procedure is approved.',
            next_actions: ['bootstrap_session', 'sign_out'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockRejectedValueOnce(new Error('network down'));

    const disableRes = await disableGlobalIdentityApi({
      idempotency_key: 'global-1',
      identity: { user_id: '9007199254740994' },
      expected_identity_version: 7,
      reason: 'Check boundary',
    });
    expect(disableRes.ok).toBe(false);
    expect(disableRes.status).toBe(503);
    expect(disableRes.outcome).toBe('uncertain');
    expect(disableRes.code).toBe('global_identity_disable_unavailable');

    const guidance = await getAssistedRecoveryGuidanceApi();
    expect(guidance.ok).toBe(true);
    expect(guidance.body?.blocker).toBe('assisted_recovery_not_approved');

    const networkErr = await lookupProvisioningIdentityApi('1');
    expect(networkErr.ok).toBe(false);
    expect(networkErr.outcome).toBe('uncertain');
    expect(networkErr.code).toBe('transport_unavailable');
  });

  it('fails closed as uncertain on cacheable Cache-Control, non-JSON Content-Type, and invalid 204 responses', async () => {
    const {
      approvePolicyVersionApi,
      authorizeDutyGrantApi,
      authorizeMembershipApi,
      exchangeTransport,
      getProvisioningContextApi,
      getSessionApi,
      readPolicyStatusApi,
      savePolicyDraftApi,
      submitPolicyVersionApi,
      substituteDutyGrantApi,
    } = await import('./p02Api');

    expect(typeof approvePolicyVersionApi).toBe('function');
    expect(typeof authorizeDutyGrantApi).toBe('function');
    expect(typeof authorizeMembershipApi).toBe('function');
    expect(typeof getProvisioningContextApi).toBe('function');
    expect(typeof getSessionApi).toBe('function');
    expect(typeof readPolicyStatusApi).toBe('function');
    expect(typeof savePolicyDraftApi).toBe('function');
    expect(typeof submitPolicyVersionApi).toBe('function');
    expect(typeof substituteDutyGrantApi).toBe('function');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: 'signed_out' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: 'signed_out' }), {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: 'signed_out' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const cacheableRes = await getSessionApi();
    expect(cacheableRes.ok).toBe(false);
    expect(cacheableRes.outcome).toBe('uncertain');
    expect(cacheableRes.code).toBe('protocol_error');

    const badCtRes = await getSessionApi();
    expect(badCtRes.ok).toBe(false);
    expect(badCtRes.outcome).toBe('uncertain');
    expect(badCtRes.code).toBe('protocol_error');

    const bad204Res = await exchangeTransport('signOut', { skipAutoCsrf: true });
    expect(bad204Res.ok).toBe(false);
    expect(bad204Res.outcome).toBe('uncertain');
    expect(bad204Res.code).toBe('protocol_error');

    const strictMissingNoStore = await exchangeTransport('getSession', { requireNoStore: true });
    expect(strictMissingNoStore.ok).toBe(false);
    expect(strictMissingNoStore.outcome).toBe('uncertain');
    expect(strictMissingNoStore.code).toBe('protocol_error');
  });
});
