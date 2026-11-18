import { describe, expect, it } from 'vitest';
import {
  chapterNextAction,
  chapterScopeMatches,
  createP02AdminEngine,
} from './p02AdminSlice';

describe('p02AdminSlice', () => {
  it('blocks provider-only access to chapter transactions until separately authorized (ADD-AC-09 & AC-19)', () => {
    const engine = createP02AdminEngine();

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
    const engine = createP02AdminEngine();

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
    const engine = createP02AdminEngine();
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
    const engine = createP02AdminEngine();
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
    const engine = createP02AdminEngine();
    const finPolicyId = 'pol-fin-2'; // RETURN_REFUND_VALUATION_POLICY (financial, initially draft)

    // Unapproved policy blocks commit but allows draft preparation
    const draftGate = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'draft');
    expect(draftGate.ok).toBe(true);
    expect(draftGate.permitted_draft).toBe(true);

    const blockedCommit = engine.evaluateWorkflowGate('RETURN_REFUND_VALUATION_POLICY', 'commit');
    expect(blockedCommit.ok).toBe(false);
    expect(blockedCommit.code).toBe('POLICY_NOT_EFFECTIVE');
    expect(blockedCommit.required_duty).toBe('FINANCE');

    // CHAPTER_HEAD cannot approve a FINANCIAL policy
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

    // Switch to FINANCE -> approval succeeds and unblocks commit gate
    engine.selectPersona('finance_22');
    const finApprove = engine.approvePolicyVersion({
      chapter_id: '1',
      policy_id: finPolicyId,
      expected_authority_version: engine.getSnapshot().authority_version,
      expected_row_version: 1,
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
    const engine = createP02AdminEngine();
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
});
