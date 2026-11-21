import { describe, expect, it } from 'vitest';
import {
  chapterNextAction,
  chapterScopeMatches,
  createP02AdminEngine,
} from './p02AdminSlice';
import type { P02AdminEngine } from './p02AdminSlice';
import { computeDeterministicHash } from './p03RecordSlice';

function createTestP02Engine(): P02AdminEngine {
  return createP02AdminEngine({
    personas: [
      {
        key: 'head_21',
        user_id: '21',
        display_name: 'Laurence Parojinog',
        email: 'head@ysp.org',
        provider_roles: [],
      },
      {
        key: 'finance_22',
        user_id: '22',
        display_name: 'Maria Clara Santos',
        email: 'finance@ysp.org',
        provider_roles: [],
      },
      {
        key: 'receiving_11',
        user_id: '11',
        display_name: 'Ana Maria Reyes',
        email: 'receiving@ysp.org',
        provider_roles: [],
      },
      {
        key: 'provider_90',
        user_id: '90',
        display_name: 'Sam Provisioner',
        email: 'provider@ysp.org',
        provider_roles: ['provisioner'],
      },
    ],
    chapters: [
      { id: '1', code: 'CEB-01', name: 'YSP Cebu Chapter' },
      { id: '2', code: 'MNL-02', name: 'YSP Manila Chapter' },
    ],
    authority_versions: { '1': 3, '2': 2 },
    provider_authority_version: 5,
    active_persona_key: 'head_21',
    selected_chapter_id: '1',
    memberships: [
      {
        membership_id: '211',
        chapter_id: '1',
        chapter_code: 'CEB-01',
        chapter_name: 'YSP Cebu Chapter',
        user_id: '21',
        display_name: 'Laurence Parojinog',
        email: 'head@ysp.org',
        status: 'active',
        version: 1,
        active_sessions: 1,
      },
      {
        membership_id: '221',
        chapter_id: '1',
        chapter_code: 'CEB-01',
        chapter_name: 'YSP Cebu Chapter',
        user_id: '22',
        display_name: 'Maria Clara Santos',
        email: 'finance@ysp.org',
        status: 'active',
        version: 1,
        active_sessions: 1,
      },
      {
        membership_id: '111',
        chapter_id: '1',
        chapter_code: 'CEB-01',
        chapter_name: 'YSP Cebu Chapter',
        user_id: '11',
        display_name: 'Ana Maria Reyes',
        email: 'receiving@ysp.org',
        status: 'active',
        version: 1,
        active_sessions: 1,
      },
      {
        membership_id: '311',
        chapter_id: '1',
        chapter_code: 'CEB-01',
        chapter_name: 'YSP Cebu Chapter',
        user_id: '31',
        display_name: 'Pedro Penduko',
        email: 'pedro@ysp.org',
        status: 'active',
        version: 1,
        active_sessions: 2,
      },
      {
        membership_id: '212',
        chapter_id: '2',
        chapter_code: 'MNL-02',
        chapter_name: 'YSP Manila Chapter',
        user_id: '21',
        display_name: 'Laurence Parojinog',
        email: 'head@ysp.org',
        status: 'active',
        version: 1,
        active_sessions: 1,
      },
    ],
    duty_grants: [
      {
        id: '1001',
        chapter_id: '1',
        membership_id: '211',
        user_id: '21',
        officer_name: 'Laurence Parojinog',
        duty_code: 'CHAPTER_HEAD',
        scope_kind: 'chapter',
        requesting_unit_id: null,
        monetary_limit: null,
        starts_at: '2026-10-23T00:00:00.000000Z',
        ends_at: null,
        revoked_at: null,
        version: 1,
        alternate_for_grant_id: null,
      },
      {
        id: '1002',
        chapter_id: '1',
        membership_id: '221',
        user_id: '22',
        officer_name: 'Maria Clara Santos',
        duty_code: 'FINANCE',
        scope_kind: 'chapter',
        requesting_unit_id: null,
        monetary_limit: { currency: 'PHP', amount: '50000.00' },
        starts_at: '2026-10-23T00:00:00.000000Z',
        ends_at: null,
        revoked_at: null,
        version: 1,
        alternate_for_grant_id: null,
      },
      {
        id: '1003',
        chapter_id: '1',
        membership_id: '111',
        user_id: '11',
        officer_name: 'Ana Maria Reyes',
        duty_code: 'RECEIVING',
        scope_kind: 'chapter',
        requesting_unit_id: null,
        monetary_limit: null,
        starts_at: '2026-10-23T00:00:00.000000Z',
        ends_at: null,
        revoked_at: null,
        version: 1,
        alternate_for_grant_id: null,
      },
      {
        id: '1004',
        chapter_id: '1',
        membership_id: '311',
        user_id: '31',
        officer_name: 'Pedro Penduko',
        duty_code: 'INVENTORY',
        scope_kind: 'chapter',
        requesting_unit_id: null,
        monetary_limit: null,
        starts_at: '2026-10-23T00:00:00.000000Z',
        ends_at: null,
        revoked_at: null,
        version: 1,
        alternate_for_grant_id: null,
      },
    ],
    policies: [
      {
        policy_id: 'pol-fin-2',
        chapter_id: '1',
        category: 'financial',
        policy_code: 'RETURN_REFUND_VALUATION_POLICY',
        name: 'Return, Refund Execution & Residual Cent Rounding Policy',
        status: 'draft',
        row_version: 1,
        material_version: 1,
        material_hash: computeDeterministicHash({ code: 'RETURN_REFUND_VALUATION_POLICY', v: 1 }),
        summary: 'Governs Finance-approved refunds and unequal exchange rounding.',
        workflow_affected: 'Refund Execution & Unequal Exchange Settlement',
        approved_by_duty: null,
        effective_from: null,
        last_reason: null,
      },
    ],
    provisioned_chapters: [],
    organization_id: 'org-test',
  });
}

describe('p02AdminSlice', () => {
  it('starts completely unseeded with zero default personas, chapters, memberships, duties, or policies', () => {
    const engine = createP02AdminEngine();
    const snap = engine.getSnapshot();
    expect(snap.active_persona).toBeNull();
    expect(snap.available_personas).toEqual([]);
    expect(snap.all_chapters).toEqual([]);
    expect(snap.authorized_memberships_for_user).toEqual([]);
    expect(snap.selected_chapter_id).toBeNull();
    expect(snap.chapter_state).toBe('no_authorized_memberships');
    expect(snap.next_action).toBe('no_chapter_work');
    expect(snap.chapter_memberships).toEqual([]);
    expect(snap.chapter_duty_grants).toEqual([]);
    expect(snap.chapter_policies).toEqual([]);
    expect(snap.provisioned_chapters).toEqual([]);

    const gateRes = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'commit');
    expect(gateRes.ok).toBe(false);
    expect(gateRes.code).toBe('SESSION_REQUIRED');
  });

  it('blocks provider-only access to chapter transactions until separately authorized (ADD-AC-09 & AC-19)', () => {
    const engine = createTestP02Engine();

    // Switch to provider-only persona (Sam Provisioner, user_id 90)
    const switchRes = engine.selectPersona('provider_90');
    expect(switchRes.ok).toBe(true);
    const snapBefore = engine.getSnapshot();
    expect(snapBefore.chapter_state).toBe('no_authorized_memberships');
    expect(snapBefore.next_action).toBe('no_chapter_work');
    expect(snapBefore.chapter_memberships.length).toBe(0);

    // Selecting Chapter 1 or mutating Chapter 1 must reject cleanly
    const selectRes = engine.selectChapter('1');
    expect(selectRes.ok).toBe(false);
    expect(selectRes.status).toBe(403);
    expect(selectRes.code).toBe('PROVIDER_ONLY_NO_CHAPTER_ACCESS');

    // Provider CAN execute S-22 createProvisionedChapter & appointInitialHead
    const createRes = engine.createProvisionedChapter({
      chapter_code: 'DVO-03',
      chapter_name: 'YSP Davao Chapter',
      expected_provider_authority_version: snapBefore.provider_authority_version,
    });
    expect(createRes.ok).toBe(true);
    expect(createRes.data?.initial_head_membership_authorization).toBe('not_applicable');

    const appointRes = engine.appointInitialHead({
      provisioning_id: createRes.data?.id ?? '',
      initial_head_user_id: '55',
      initial_head_name: 'Davao Head',
      expected_provider_authority_version: engine.getSnapshot().provider_authority_version,
      expected_provisioning_version: 1,
      reason: 'Initial Head designation',
    });
    expect(appointRes.ok).toBe(true);
    expect(appointRes.data?.initial_head_membership_authorization).toBe('not_applicable');

    // Chapter Head separately authorizes Sam Provisioner in Chapter 1
    engine.selectPersona('head_21');
    const headSnap = engine.getSnapshot();
    const authRes = engine.authorizeMembership({
      chapter_id: '1',
      user_id: '90',
      display_name: 'Sam Provisioner',
      email: 'provider@ysp.org',
      expected_authority_version: headSnap.authority_version,
      expected_membership_version: null,
      reason: 'Approved separate chapter membership',
    });
    expect(authRes.ok).toBe(true);

    // Now Sam Provisioner can select Chapter 1 cleanly
    engine.selectPersona('provider_90');
    const selectAfter = engine.selectChapter('1');
    expect(selectAfter.ok).toBe(true);
    expect(selectAfter.data?.chapter_state).toBe('selected');
  });

  it('rejects cross-chapter access and unauthorized actors (AC-19)', () => {
    const engine = createTestP02Engine();

    // Switch to Finance officer (belongs ONLY to Chapter 1)
    engine.selectPersona('finance_22');
    const crossSelect = engine.selectChapter('2');
    expect(crossSelect.ok).toBe(false);
    expect(crossSelect.status).toBe(403);
    expect(crossSelect.code).toBe('CROSS_CHAPTER_FORBIDDEN');

    // Selecting non-existent chapter 999
    const unknownChapter = engine.selectChapter('999');
    expect(unknownChapter.ok).toBe(false);
    expect(unknownChapter.status).toBe(403);
    expect(unknownChapter.code).toBe('CROSS_CHAPTER_FORBIDDEN');

    // Finance cannot perform CHAPTER_HEAD-only membership authorization
    const nonHeadAuth = engine.authorizeMembership({
      chapter_id: '1',
      user_id: '99',
      display_name: 'Unauthorized',
      email: 'unauth@ysp.org',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_membership_version: null,
      reason: 'Attempted privilege escalation',
    });
    expect(nonHeadAuth.ok).toBe(false);
    expect(nonHeadAuth.status).toBe(403);
    expect(nonHeadAuth.code).toBe('DUTY_AUTHORITY_REQUIRED');
  });

  it('disables/revokes membership, revokes sessions, bumps authority_version, and blocks sole-Head self-revoke', () => {
    const engine = createTestP02Engine();
    const snap = engine.getSnapshot();

    // Sole Head self-disable must fail
    const soleHeadBlock = engine.disableOrRevokeMembership({
      chapter_id: '1',
      membership_id: '211',
      action: 'disabled',
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      reason: 'Trying to self-disable',
    });
    expect(soleHeadBlock.ok).toBe(false);
    expect(soleHeadBlock.code).toBe('SOLE_HEAD_SELF_REVOKE_FORBIDDEN');

    // Disable Pedro Penduko (membership 311, 2 active sessions)
    const disableRes = engine.disableOrRevokeMembership({
      chapter_id: '1',
      membership_id: '311',
      action: 'disabled',
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      reason: 'Term ended',
    });
    expect(disableRes.ok).toBe(true);
    expect(disableRes.code).toBe('MEMBERSHIP_DISABLED');
    expect(disableRes.revoked_sessions_count).toBe(2);
    expect(disableRes.data?.status).toBe('disabled');
    expect(disableRes.data?.active_sessions).toBe(0);
    expect(disableRes.authority_version).toBe(snap.authority_version + 1);
  });

  it('enforces duty grant contracts, rejects provisioner duty, requires unit scope, and enforces distinct alternate identity', () => {
    const engine = createTestP02Engine();
    const snap = engine.getSnapshot();

    // Reject provisioner as chapter duty
    const badDuty = engine.authorizeDutyGrant({
      chapter_id: '1',
      membership_id: '311',
      duty_code: 'provisioner',
      scope_kind: 'chapter',
      requesting_unit_id: null,
      monetary_limit: null,
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Invalid duty test',
    });
    expect(badDuty.ok).toBe(false);
    expect(badDuty.code).toBe('INVALID_CHAPTER_DUTY');

    // Require requesting_unit_id when scope_kind === 'unit'
    const missingUnit = engine.authorizeDutyGrant({
      chapter_id: '1',
      membership_id: '311',
      duty_code: 'RF_APPROVER',
      scope_kind: 'unit',
      requesting_unit_id: '',
      monetary_limit: { currency: 'PHP', amount: '1000.00' },
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Unit duty missing ID',
    });
    expect(missingUnit.ok).toBe(false);
    expect(missingUnit.code).toBe('UNIT_SCOPE_REQUIRED');

    // Valid unit-scoped RF_APPROVER grant for Pedro (311)
    const validGrant = engine.authorizeDutyGrant({
      chapter_id: '1',
      membership_id: '311',
      duty_code: 'RF_APPROVER',
      scope_kind: 'unit',
      requesting_unit_id: '9007199254740994',
      monetary_limit: { currency: 'PHP', amount: '1000.00' },
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Committee unit RF sign-off',
    });
    expect(validGrant.ok).toBe(true);
    const grantId = validGrant.data?.id ?? '';

    // Alternate cannot be same user identity (Pedro 311 -> 311)
    const samePersonAlt = engine.substituteDutyGrant({
      chapter_id: '1',
      grant_id: grantId,
      alternate_membership_id: '311',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_membership_version: 1,
      expected_grant_version: 1,
      reason: 'Self alternate forbidden',
    });
    expect(samePersonAlt.ok).toBe(false);
    expect(samePersonAlt.code).toBe('ALTERNATE_MUST_BE_DISTINCT_IDENTITY');

    // Distinct active alternate Ana Maria Reyes (111) succeeds
    const validAlt = engine.substituteDutyGrant({
      chapter_id: '1',
      grant_id: grantId,
      alternate_membership_id: '111',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_membership_version: 1,
      expected_grant_version: 1,
      reason: 'Leave coverage alternate',
    });
    expect(validAlt.ok).toBe(true);
    expect(validAlt.data?.alternate_for_grant_id).toBe(grantId);
    expect(validAlt.data?.duty_code).toBe('RF_APPROVER');
  });

  it('separates operational vs financial policy approvals and enforces POLICY_NOT_EFFECTIVE workflow gates', () => {
    const engine = createTestP02Engine();
    const finPolicyId = 'pol-fin-2'; // RETURN_REFUND_VALUATION_POLICY (financial, initially draft)

    // Unapproved policy blocks commit but allows draft preparation
    const draftGate = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'draft');
    expect(draftGate.ok).toBe(true);
    expect(draftGate.permitted_draft).toBe(true);

    const blockedCommit = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'commit');
    expect(blockedCommit.ok).toBe(false);
    expect(blockedCommit.code).toBe('POLICY_NOT_EFFECTIVE');
    expect(blockedCommit.required_duty).toBe('FINANCE');

    // CHAPTER_HEAD cannot approve or submit a FINANCIAL policy
    const snapHead = engine.getSnapshot();
    const headApproveFin = engine.approvePolicyVersion({
      chapter_id: '1',
      policy_id: finPolicyId,
      expected_authority_version: snapHead.authority_version,
      expected_row_version: 1,
      expected_material_version: 1,
      reason: 'Head attempting financial policy approval',
    });
    expect(headApproveFin.ok).toBe(false);
    expect(headApproveFin.status).toBe(403);
    expect(headApproveFin.code).toBe('POLICY_DUTY_FORBIDDEN');

    // Switch to FINANCE -> submit draft -> approval succeeds and unblocks commit gate
    engine.selectPersona('finance_22');
    const finSubmit = engine.submitPolicyVersion({
      chapter_id: '1',
      policy_id: finPolicyId,
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: 1,
      expected_material_version: 1,
      reason: 'Submit financial valuation policy for approval',
    });
    expect(finSubmit.ok).toBe(true);
    expect(finSubmit.data?.status).toBe('submitted');

    const finApprove = engine.approvePolicyVersion({
      chapter_id: '1',
      policy_id: finPolicyId,
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: finSubmit.data?.row_version ?? 2,
      expected_material_version: 1,
      reason: 'Finance approved refund & residual cent policy',
    });
    expect(finApprove.ok).toBe(true);
    expect(finApprove.data?.status).toBe('approved');

    const readyCommit = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'commit');
    expect(readyCommit.ok).toBe(true);
    expect(readyCommit.code).toBe('POLICY_EFFECTIVE');
  });

  it('keeps global identity disable boundary disabled with 503 uncertain guidance and verifies helpers', () => {
    const engine = createTestP02Engine();
    const res = engine.attemptGlobalIdentityDisable({
      user_id: '9007199254740994',
      expected_identity_version: 7,
      reason: 'Global boundary test',
    });
    expect(res.status).toBe(503);
    expect(res.original_outcome).toBe('uncertain');
    expect(res.next_action).toBe('unavailable');

    expect(chapterNextAction('no_authorized_memberships')).toBe('no_chapter_work');
    expect(chapterNextAction('selection_required')).toBe('select_chapter');
    expect(chapterNextAction('selected')).toBe('review_current_actions');

    expect(
      chapterScopeMatches({
        chapter_state: 'selected',
        context_chapter_id: '1',
        context_chapter_name: 'YSP Cebu Chapter',
        context_membership_id: '211',
        context_user_id: '21',
        membership_chapter_id: '1',
        membership_chapter_name: 'YSP Cebu Chapter',
        membership_id: '211',
        session_user_id: '21',
        requested_chapter_id: '1',
      })
    ).toBe(true);

    expect(
      chapterScopeMatches({
        chapter_state: 'selected',
        context_chapter_id: '1',
        context_chapter_name: 'YSP Cebu Chapter',
        context_membership_id: '211',
        context_user_id: '21',
        membership_chapter_id: '1',
        membership_chapter_name: 'YSP Cebu Chapter',
        membership_id: '211',
        session_user_id: '21',
        requested_chapter_id: '2',
      })
    ).toBe(false);
  });

  it('tracks selection_revision across chapter switches and resolves membership/provisioning identities', () => {
    const engine = createTestP02Engine();
    const initialRev = engine.getSnapshot().selection_revision;
    expect(initialRev).toBeTruthy();

    const switched = engine.selectChapter('2');
    expect(switched.ok).toBe(true);
    const revAfterSwitch = engine.getSnapshot().selection_revision;
    expect(revAfterSwitch).not.toBe(initialRev);

    engine.selectChapter('1');
    const memLookup = engine.lookupMembershipIdentity({ chapter_id: '1', user_id: '31' });
    expect(memLookup.ok).toBe(true);
    expect(memLookup.code).toBe('IDENTITY_REFERENCE_RESOLVED');
    expect(memLookup.data).toEqual({ user_id: '31', display_name: 'Pedro Penduko' });

    const missingMem = engine.lookupMembershipIdentity({ chapter_id: '1', user_id: '999999' });
    expect(missingMem.ok).toBe(true);
    expect(missingMem.code).toBe('IDENTITY_REFERENCE_NOT_FOUND');
    expect(missingMem.data).toBeNull();

    // Non-provider cannot perform provisioning identity lookup
    const deniedProv = engine.lookupProvisioningIdentity({ user_id: '31' });
    expect(deniedProv.ok).toBe(false);
    expect(deniedProv.status).toBe(403);
    expect(deniedProv.code).toBe('PROVIDER_AUTHORITY_REQUIRED');

    engine.selectPersona('provider_90');
    const okProv = engine.lookupProvisioningIdentity({ user_id: '22' });
    expect(okProv.ok).toBe(true);
    expect(okProv.code).toBe('IDENTITY_REFERENCE_RESOLVED');
    expect(okProv.data).toEqual({ user_id: '22', display_name: 'Maria Clara Santos' });
  });

  it('supports amendDutyGrant, endDutyGrant (forbidding extensions), and submitted->reviewed->approved policy flow', () => {
    const engine = createTestP02Engine();
    const snap = engine.getSnapshot();

    const amended = engine.amendDutyGrant({
      chapter_id: '1',
      idempotency_key: 'grant-amend-01',
      grant_id: '1002',
      ends_at: '2027-06-30T23:59:59.000000Z',
      monetary_limit: { currency: 'PHP', amount: '75000.00' },
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: 1,
      reason: 'Increase chapter finance ceiling for Q2',
    });
    expect(amended.ok).toBe(true);
    expect(amended.code).toBe('DUTY_GRANT_AMENDED');
    expect(amended.action_code).toBe('duty_grants.prepare');
    expect(amended.data?.monetary_limit).toEqual({ currency: 'PHP', amount: '75000.00' });
    expect(amended.data?.version).toBe(2);

    const ended = engine.endDutyGrant({
      chapter_id: '1',
      idempotency_key: 'grant-end-01',
      grant_id: '1002',
      ends_at: '2026-12-31T23:59:59.000000Z',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_membership_version: 1,
      expected_grant_version: 2,
      reason: 'Shorten finance grant end date to year end',
    });
    expect(ended.ok).toBe(true);
    expect(ended.code).toBe('DUTY_GRANT_ENDED');
    expect(ended.action_code).toBe('duty_grants.revoke');
    expect(ended.data?.ends_at).toBe('2026-12-31T23:59:59.000000Z');

    const extendRejected = engine.endDutyGrant({
      chapter_id: '1',
      idempotency_key: 'grant-extend-forbidden',
      grant_id: '1002',
      ends_at: '2027-12-31T23:59:59.000000Z',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_membership_version: 1,
      expected_grant_version: 3,
      reason: 'Attempting illegal extension via end action',
    });
    expect(extendRejected.ok).toBe(false);
    expect(extendRejected.status).toBe(409);
    expect(extendRejected.code).toBe('GRANT_END_EXTENSION_FORBIDDEN');

    engine.selectPersona('finance_22');
    const submitted = engine.submitPolicyVersion({
      chapter_id: '1',
      policy_id: 'pol-fin-2',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: 1,
      expected_material_version: 1,
      reason: 'Submit valuation policy for review',
    });
    expect(submitted.ok).toBe(true);
    expect(submitted.action_code).toBe('policy.financial.prepare');
    expect(submitted.data?.status).toBe('submitted');

    const reviewed = engine.reviewPolicyVersion({
      chapter_id: '1',
      idempotency_key: 'pol-shared-action-01',
      policy_id: 'pol-fin-2',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: submitted.data?.row_version ?? 2,
      expected_material_version: 1,
      reason: 'Verified rounding clause before approval',
    });
    expect(reviewed.ok).toBe(true);
    expect(reviewed.code).toBe('POLICY_REVIEWED');
    expect(reviewed.action_code).toBe('policy.financial.approve');
    expect(reviewed.data?.status).toBe('reviewed');

    // Reusing the same idempotency_key for approve (same action_code) must conflict cleanly
    const sameKeyApprove = engine.approvePolicyVersion({
      chapter_id: '1',
      idempotency_key: 'pol-shared-action-01',
      policy_id: 'pol-fin-2',
      expected_authority_version: submitted.authority_version ?? 1,
      expected_row_version: submitted.data?.row_version ?? 2,
      expected_material_version: 1,
      reason: 'Verified rounding clause before approval',
    });
    expect(sameKeyApprove.ok).toBe(false);
    expect(sameKeyApprove.status).toBe(409);
    expect(sameKeyApprove.code).toBe('IDEMPOTENCY_CONFLICT');

    const approved = engine.approvePolicyVersion({
      chapter_id: '1',
      policy_id: 'pol-fin-2',
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: reviewed.data?.row_version ?? 3,
      expected_material_version: 1,
      reason: 'Final finance approval',
    });
    expect(approved.ok).toBe(true);
    expect(approved.action_code).toBe('policy.financial.approve');
    expect(approved.data?.status).toBe('approved');
  });

  it('enforces explicit idempotency replay, IDEMPOTENCY_CONFLICT, and scoped durable operation lookup', () => {
    const engine = createTestP02Engine();
    const snap = engine.getSnapshot();

    const first = engine.authorizeDutyGrant({
      chapter_id: '1',
      idempotency_key: 'p02-grant-idem-01',
      membership_id: '311',
      duty_code: 'RF_APPROVER',
      scope_kind: 'chapter',
      requesting_unit_id: null,
      monetary_limit: null,
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Idempotent duty grant test',
    });
    expect(first.ok).toBe(true);
    expect(first.replayed).not.toBe(true);
    expect(first.operation_id).toBeTruthy();

    // Exact retry returns cached result with replayed: true despite incremented versions
    const replay = engine.authorizeDutyGrant({
      chapter_id: '1',
      idempotency_key: 'p02-grant-idem-01',
      membership_id: '311',
      duty_code: 'RF_APPROVER',
      scope_kind: 'chapter',
      requesting_unit_id: null,
      monetary_limit: null,
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Idempotent duty grant test',
    });
    expect(replay.ok).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(replay.operation_id).toBe(first.operation_id);

    // Same key with mutated payload returns 409 IDEMPOTENCY_CONFLICT
    const conflict = engine.authorizeDutyGrant({
      chapter_id: '1',
      idempotency_key: 'p02-grant-idem-01',
      membership_id: '111',
      duty_code: 'RF_APPROVER',
      scope_kind: 'chapter',
      requesting_unit_id: null,
      monetary_limit: null,
      expected_authority_version: snap.authority_version,
      expected_membership_version: 1,
      expected_grant_version: null,
      reason: 'Conflicting payload on same key',
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe('IDEMPOTENCY_CONFLICT');

    const byKey = engine.lookupOperationByKey({
      scope: 'chapter',
      chapter_id: '1',
      action_code: 'duty_grants.authorize',
      idempotency_key: 'p02-grant-idem-01',
    });
    expect(byKey.ok).toBe(true);
    expect(byKey.code).toBe('OPERATION_RECOVERED');
    expect(byKey.data?.operation_id).toBe(first.operation_id);

    const byId = engine.lookupOperationById({
      scope: 'chapter',
      chapter_id: '1',
      operation_id: first.operation_id ?? '',
    });
    expect(byId.ok).toBe(true);
    expect(byId.code).toBe('OPERATION_RECOVERED');
    expect(byId.data?.idempotency_key).toBe('p02-grant-idem-01');

    const missing = engine.lookupOperationByKey({
      scope: 'chapter',
      chapter_id: '1',
      action_code: 'duty_grants.authorize',
      idempotency_key: 'unseen-key-99',
    });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe('OPERATION_PENDING_OR_NOT_VISIBLE');
  });
});
