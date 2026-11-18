import { useState } from 'react';
import { NavFlowHeader } from './NavFlowHeader';
import { playClickPen } from './batcaveAudio';
import {
  CANONICAL_CHAPTER_DUTIES,
  createP02AdminEngine,
} from './p02AdminSlice';
import type {
  DutyGrantScopeKind,
  GlobalDisableBoundaryFeedback,
  P02ActionResult,
  P02Snapshot,
} from './p02AdminSlice';

type P02TabId = 'memberships' | 'duties' | 'policies' | 'provider';

interface P02AdminWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard?: (() => void) | undefined;
  onNotify?: ((tone: 'success' | 'warning' | 'error' | 'info', text: string) => void) | undefined;
}

export function P02AdminWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P02AdminWorkspaceProps) {
  const [engine] = useState(() => createP02AdminEngine());
  const [snapshot, setSnapshot] = useState<P02Snapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P02TabId>('memberships');
  const [feedback, setFeedback] = useState<P02ActionResult<unknown> | null>(null);

  // Membership form & action state
  const [memberReason, setMemberReason] = useState<string>('Role transition & session security cleanup');
  const [authUserId, setAuthUserId] = useState<string>('41');
  const [authDisplayName, setAuthDisplayName] = useState<string>('Jose Rizal');
  const [authEmail, setAuthEmail] = useState<string>('jose.rizal@ysp.org');
  const [authReason, setAuthReason] = useState<string>('Authorized chapter contributor appointment');

  // Duty grant & alternate state
  const [grantMembershipId, setGrantMembershipId] = useState<string>('311');
  const [grantDutyCode, setGrantDutyCode] = useState<string>('RF_APPROVER');
  const [grantScopeKind, setGrantScopeKind] = useState<DutyGrantScopeKind>('chapter');
  const [grantUnitId, setGrantUnitId] = useState<string>('');
  const [grantMonetaryLimit, setGrantMonetaryLimit] = useState<string>('1000.00');
  const [grantReason, setGrantReason] = useState<string>('Explicit chapter operational delegation');
  const [alternateMembershipId, setAlternateMembershipId] = useState<string>('111');
  const [dutyActionReason, setDutyActionReason] = useState<string>('Approved scheduled alternate coverage');

  // Policy draft / review state
  const [policyReason, setPolicyReason] = useState<string>('Reviewed against Stage 1 operational rules');
  const [policySummaryEdits, setPolicySummaryEdits] = useState<Record<string, string>>({});

  // Provider S-22 state
  const [provCode, setProvCode] = useState<string>('DVO-03');
  const [provName, setProvName] = useState<string>('YSP Davao Chapter');
  const [appointProvId, setAppointProvId] = useState<string>('prov-1');
  const [appointHeadId, setAppointHeadId] = useState<string>('21');
  const [appointHeadName, setAppointHeadName] = useState<string>('Laurence Parojinog');
  const [appointReason, setAppointReason] = useState<string>('Initial Chapter Head designation');
  const [globalDisableUserId, setGlobalDisableUserId] = useState<string>('9007199254740994');
  const [globalDisableReason, setGlobalDisableReason] = useState<string>('Emergency global identity lock test');
  const [globalDisableResult, setGlobalDisableResult] =
    useState<GlobalDisableBoundaryFeedback | null>(null);

  function syncSnapshot() {
    const next = engine.getSnapshot();
    setSnapshot(next);
    const firstActiveMember = next.chapter_memberships.find((m) => m.status === 'active');
    if (
      firstActiveMember &&
      !next.chapter_memberships.some((m) => m.membership_id === grantMembershipId && m.status === 'active')
    ) {
      setGrantMembershipId(firstActiveMember.membership_id);
    }
    if (
      next.provisioned_chapters.length > 0 &&
      !next.provisioned_chapters.some((p) => p.id === appointProvId)
    ) {
      setAppointProvId(next.provisioned_chapters[0]?.id ?? 'prov-1');
    }
  }

  function applyFeedback(res: P02ActionResult<unknown>) {
    setFeedback(res);
    syncSnapshot();
    if (res.ok) {
      onNotify?.('success', res.message);
    } else if (res.status === 403) {
      onNotify?.('error', res.code);
    } else {
      onNotify?.('warning', res.code);
    }
  }

  function handleSelectPersona(key: string) {
    playClickPen(soundEnabled);
    const res = engine.selectPersona(key);
    applyFeedback(res);
  }

  function handleSelectChapter(chapterId: string) {
    playClickPen(soundEnabled);
    const res = engine.selectChapter(chapterId === '' ? null : chapterId);
    applyFeedback(res);
  }

  function handlePresetSamProvisioner() {
    playClickPen(soundEnabled);
    setAuthUserId('90');
    setAuthDisplayName('Sam Provisioner');
    setAuthEmail('provider@ysp.org');
    setAuthReason('Grant separate chapter membership to provider identity (ADD-AC-09)');
  }

  function handleAuthorizeMembership() {
    playClickPen(soundEnabled);
    const res = engine.authorizeMembership({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      user_id: authUserId,
      display_name: authDisplayName,
      email: authEmail,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: null,
      reason: authReason,
    });
    applyFeedback(res);
  }

  function handleMembershipStatus(
    membershipId: string,
    membershipVersion: number,
    action: 'disabled' | 'revoked'
  ) {
    playClickPen(soundEnabled);
    const res = engine.disableOrRevokeMembership({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      membership_id: membershipId,
      action,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membershipVersion,
      reason: memberReason,
    });
    applyFeedback(res);
  }

  function handleAuthorizeDutyGrant() {
    playClickPen(soundEnabled);
    const membership = snapshot.chapter_memberships.find(
      (m) => m.membership_id === grantMembershipId
    );
    const cleanLimit = grantMonetaryLimit.trim();
    const res = engine.authorizeDutyGrant({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      membership_id: grantMembershipId,
      duty_code: grantDutyCode,
      scope_kind: grantScopeKind,
      requesting_unit_id: grantScopeKind === 'unit' ? grantUnitId : null,
      monetary_limit: cleanLimit ? { currency: 'PHP', amount: cleanLimit } : null,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membership?.version ?? 1,
      expected_grant_version: null,
      reason: grantReason,
    });
    applyFeedback(res);
  }

  function handleSubstituteGrant(grantId: string, membershipId: string, grantVersion: number) {
    playClickPen(soundEnabled);
    const membership = snapshot.chapter_memberships.find(
      (m) => m.membership_id === membershipId
    );
    const res = engine.substituteDutyGrant({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      grant_id: grantId,
      alternate_membership_id: alternateMembershipId,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membership?.version ?? 1,
      expected_grant_version: grantVersion,
      reason: dutyActionReason,
    });
    applyFeedback(res);
  }

  function handleRevokeGrant(grantId: string, membershipId: string, grantVersion: number) {
    playClickPen(soundEnabled);
    const membership = snapshot.chapter_memberships.find(
      (m) => m.membership_id === membershipId
    );
    const res = engine.revokeDutyGrant({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      grant_id: grantId,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membership?.version ?? 1,
      expected_grant_version: grantVersion,
      reason: dutyActionReason,
    });
    applyFeedback(res);
  }

  function handlePolicyAction(
    policyId: string,
    rowVersion: number,
    materialVersion: number | null,
    summary: string,
    action: 'draft' | 'approve' | 'return'
  ) {
    playClickPen(soundEnabled);
    let res: P02ActionResult<unknown>;
    if (action === 'draft') {
      res = engine.savePolicyDraft({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        summary,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
      });
    } else if (action === 'approve') {
      res = engine.approvePolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
      });
    } else {
      res = engine.returnPolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
      });
    }
    applyFeedback(res);
  }

  function handleEvaluateGate(policyCode: string, mode: 'draft' | 'commit') {
    playClickPen(soundEnabled);
    const res = engine.evaluateWorkflowGate(policyCode, mode);
    applyFeedback(res);
  }

  function handleCreateProvisionedChapter() {
    playClickPen(soundEnabled);
    const res = engine.createProvisionedChapter({
      chapter_code: provCode,
      chapter_name: provName,
      expected_provider_authority_version: snapshot.provider_authority_version,
    });
    if (res.ok && res.data) {
      setAppointProvId(res.data.id);
    }
    applyFeedback(res);
  }

  function handleAppointInitialHead() {
    playClickPen(soundEnabled);
    const targetProv = snapshot.provisioned_chapters.find((p) => p.id === appointProvId);
    const res = engine.appointInitialHead({
      provisioning_id: appointProvId,
      initial_head_user_id: appointHeadId,
      initial_head_name: appointHeadName,
      expected_provider_authority_version: snapshot.provider_authority_version,
      expected_provisioning_version: targetProv?.version ?? 1,
      reason: appointReason,
    });
    applyFeedback(res);
  }

  function handleGlobalDisableBoundary() {
    playClickPen(soundEnabled);
    const res = engine.attemptGlobalIdentityDisable({
      user_id: globalDisableUserId,
      expected_identity_version: 7,
      reason: globalDisableReason,
    });
    setGlobalDisableResult(res);
    syncSnapshot();
    onNotify?.('warning', `HTTP ${res.status} — Global disable boundary disabled`);
  }

  const activeMembers = snapshot.chapter_memberships.filter((m) => m.status === 'active');

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <div className="p03-top-header surface-card">
          <NavFlowHeader
            headingId="p02-workspace-title"
            title="P02 Chapter Administration, Readiness & Provider Surface"
            subtitle="S-01 Chapter Context Switcher, S-21 Officer Memberships, Canonical Duty Grants, Versioned Policy Approvals, and S-22 Provider Provisioning Boundary (GOV-01–GOV-09, AC-19, ADD-AC-09)."
            onBack={onBackToDashboard}
          />
          {onBackToDashboard ? (
            <button
              type="button"
              id="p02-back-dashboard-btn"
              className="btn-batcave-secondary p03-shrink-btn"
              onClick={() => {
                playClickPen(soundEnabled);
                onBackToDashboard();
              }}
            >
              Back to Chapter Workspace
            </button>
          ) : null}
        </div>

        {/* S-01 Identity & Chapter Context Selector Bar */}
        <section className="p03-card surface-card" aria-labelledby="p02-context-heading">
          <div className="p03-card-header-row">
            <div>
              <span className="p03-eyebrow">S-01 &middot; Active Identity &amp; Chapter Context</span>
              <h2 id="p02-context-heading" className="p03-section-title">
                {snapshot.active_persona.display_name}{' '}
                <span className="p03-muted-inline">({snapshot.active_persona.email})</span>
              </h2>
            </div>

            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p02-chapter-state">
                chapter_state: <strong>{snapshot.chapter_state}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p02-next-action">
                next_action: <strong>{snapshot.next_action}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p02-authority-version">
                authority_version: <strong>v{snapshot.authority_version}</strong>
              </span>
            </div>
          </div>

          <div className="p03-two-col">
            <div className="form-group">
              <label htmlFor="p02-persona-select" className="form-label">
                Acting Identity Persona
              </label>
              <select
                id="p02-persona-select"
                className="form-control"
                value={snapshot.active_persona.key}
                onChange={(e) => handleSelectPersona(e.target.value)}
              >
                {snapshot.available_personas.map((persona) => (
                  <option key={persona.key} value={persona.key}>
                    {persona.display_name} ({persona.email})
                    {persona.provider_roles.length > 0 ? ' [Provider]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="p02-chapter-select" className="form-label">
                Active Chapter Context
              </label>
              <select
                id="p02-chapter-select"
                className="form-control"
                value={snapshot.selected_chapter_id ?? ''}
                onChange={(e) => handleSelectChapter(e.target.value)}
              >
                <option value="">No Chapter Selected (selection_required)</option>
                {snapshot.all_chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.code} &mdash; {chapter.name}
                  </option>
                ))}
                <option value="999">Chapter 999 &mdash; Unauthorized Chapter (Test AC-19 403)</option>
              </select>
            </div>
          </div>

          <div className="p03-axes-bar">
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Active Chapter</span>
              <span className="p03-axis-val">
                {snapshot.selected_chapter_name ?? 'None Selected'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Effective Duties in Chapter</span>
              <span className="p03-axis-val" data-testid="p02-active-duties">
                {snapshot.active_user_duties.length > 0
                  ? snapshot.active_user_duties.join(', ')
                  : 'None'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Provider Roles</span>
              <span className="p03-axis-val">
                {snapshot.active_persona.provider_roles.length > 0
                  ? snapshot.active_persona.provider_roles.join(', ')
                  : 'None'}
              </span>
            </div>
          </div>

          {feedback ? (
            <div
              className={`callout-banner ${feedback.ok ? '' : 'is-error'}`}
              data-testid="p02-feedback-banner"
              aria-live="polite"
            >
              <span
                className={`callout-dot ${feedback.ok ? 'dot-success' : 'dot-error'}`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  [{feedback.status}] {feedback.code}
                </strong>
                <div>{feedback.message}</div>
              </div>
            </div>
          ) : null}
        </section>

        {/* Surface Navigation Tabs */}
        <div className="p03-next-actions-row" role="tablist" aria-label="P02 Administration Surfaces">
          <button
            type="button"
            id="p02-tab-memberships"
            role="tab"
            aria-selected={activeTab === 'memberships'}
            className={activeTab === 'memberships' ? 'btn-batcave-primary p03-inline-action-btn' : 'btn-batcave-secondary p03-inline-action-btn'}
            onClick={() => setActiveTab('memberships')}
          >
            S-21 Memberships &amp; Revocation
          </button>
          <button
            type="button"
            id="p02-tab-duties"
            role="tab"
            aria-selected={activeTab === 'duties'}
            className={activeTab === 'duties' ? 'btn-batcave-primary p03-inline-action-btn' : 'btn-batcave-secondary p03-inline-action-btn'}
            onClick={() => setActiveTab('duties')}
          >
            S-21 Duty Grants &amp; Alternates
          </button>
          <button
            type="button"
            id="p02-tab-policies"
            role="tab"
            aria-selected={activeTab === 'policies'}
            className={activeTab === 'policies' ? 'btn-batcave-primary p03-inline-action-btn' : 'btn-batcave-secondary p03-inline-action-btn'}
            onClick={() => setActiveTab('policies')}
          >
            S-21 Policies &amp; Readiness Gates
          </button>
          <button
            type="button"
            id="p02-tab-provider"
            role="tab"
            aria-selected={activeTab === 'provider'}
            className={activeTab === 'provider' ? 'btn-batcave-primary p03-inline-action-btn' : 'btn-batcave-secondary p03-inline-action-btn'}
            onClick={() => setActiveTab('provider')}
          >
            S-22 Provider &amp; Disable Boundary
          </button>
        </div>

        {/* TAB 1: Memberships & Session Revocation */}
        {activeTab === 'memberships' ? (
          <div className="p03-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-members-heading">
              <span className="p03-eyebrow">S-21 &middot; Active Memberships &amp; Session Guard</span>
              <h2 id="p02-members-heading" className="p03-section-title">
                Chapter Officer Roster
              </h2>

              {snapshot.chapter_state !== 'selected' ? (
                <div className="callout-banner is-error" data-testid="p02-no-chapter-access-notice">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>
                    {snapshot.chapter_state === 'no_authorized_memberships'
                      ? 'Provider-only or unassigned identity holds zero chapter operational memberships (ADD-AC-09). Switch to a Chapter Head to authorize membership.'
                      : 'Select an authorized chapter above to view and manage memberships.'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="p02-membership-action-reason" className="form-label">
                      Disable / Revoke Reason
                    </label>
                    <input
                      id="p02-membership-action-reason"
                      type="text"
                      className="form-control"
                      value={memberReason}
                      onChange={(e) => setMemberReason(e.target.value)}
                    />
                  </div>

                  <div className="p03-history-list">
                    {snapshot.chapter_memberships.map((m) => (
                      <article
                        key={m.membership_id}
                        className="p03-history-card"
                        data-testid={`p02-member-${m.user_id}`}
                      >
                        <div className="p03-history-head">
                          <div>
                            <strong>{m.display_name}</strong>{' '}
                            <span className="p03-mono-inline">(user {m.user_id})</span>
                            <div className="p03-muted-copy">{m.email}</div>
                          </div>
                          <div className="p03-version-badges">
                            <span className="p03-version-pill">status: {m.status}</span>
                            <span className="p03-version-pill">v{m.version}</span>
                            <span className="p03-version-pill">
                              sessions: {m.active_sessions}
                            </span>
                          </div>
                        </div>

                        {m.status === 'active' ? (
                          <div className="p03-next-actions-row">
                            <button
                              type="button"
                              data-testid={`p02-disable-${m.user_id}`}
                              className="btn-batcave-secondary p03-inline-action-btn"
                              onClick={() =>
                                handleMembershipStatus(m.membership_id, m.version, 'disabled')
                              }
                            >
                              Disable &amp; Revoke Sessions
                            </button>
                            <button
                              type="button"
                              data-testid={`p02-revoke-${m.user_id}`}
                              className="btn-batcave-secondary p03-inline-action-btn"
                              onClick={() =>
                                handleMembershipStatus(m.membership_id, m.version, 'revoked')
                              }
                            >
                              Revoke Membership
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-auth-member-heading">
              <span className="p03-eyebrow">S-21 &middot; Chapter Head Authorization</span>
              <h2 id="p02-auth-member-heading" className="p03-section-title">
                Authorize Chapter Membership
              </h2>
              <p className="p03-muted-copy">
                Requires <span className="p03-mono-inline">CHAPTER_HEAD</span> authority and current{' '}
                <span className="p03-mono-inline">expected_authority_version</span>. Use the preset to
                grant separate chapter membership to Sam Provisioner (ADD-AC-09).
              </p>

              <button
                type="button"
                id="p02-preset-sam-btn"
                className="btn-batcave-secondary"
                onClick={handlePresetSamProvisioner}
              >
                Fill Sam Provisioner (user 90) &mdash; Demonstrate ADD-AC-09
              </button>

              <div className="form-stack">
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-auth-user-id" className="form-label">
                      User ID
                    </label>
                    <input
                      id="p02-auth-user-id"
                      type="text"
                      className="form-control is-mono"
                      value={authUserId}
                      onChange={(e) => setAuthUserId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p02-auth-display-name" className="form-label">
                      Display Name
                    </label>
                    <input
                      id="p02-auth-display-name"
                      type="text"
                      className="form-control"
                      value={authDisplayName}
                      onChange={(e) => setAuthDisplayName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p02-auth-email" className="form-label">
                    Officer Email
                  </label>
                  <input
                    id="p02-auth-email"
                    type="email"
                    className="form-control"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p02-auth-reason" className="form-label">
                    Authorization Reason
                  </label>
                  <input
                    id="p02-auth-reason"
                    type="text"
                    className="form-control"
                    value={authReason}
                    onChange={(e) => setAuthReason(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  id="p02-authorize-member-btn"
                  className="btn-batcave-primary"
                  onClick={handleAuthorizeMembership}
                >
                  Authorize Chapter Membership
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Duty Grants & Alternates */}
        {activeTab === 'duties' ? (
          <div className="p03-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-grants-heading">
              <span className="p03-eyebrow">S-21 &middot; Active Duty Grants &amp; Alternates</span>
              <h2 id="p02-grants-heading" className="p03-section-title">
                Scoped Duties &amp; Alternate Designation
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p02-alternate-member-select" className="form-label">
                    Target Alternate Officer
                  </label>
                  <select
                    id="p02-alternate-member-select"
                    className="form-control"
                    value={alternateMembershipId}
                    onChange={(e) => setAlternateMembershipId(e.target.value)}
                  >
                    {activeMembers.map((m) => (
                      <option key={m.membership_id} value={m.membership_id}>
                        {m.display_name} (user {m.user_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p02-duty-action-reason" className="form-label">
                    Alternate / Revoke Reason
                  </label>
                  <input
                    id="p02-duty-action-reason"
                    type="text"
                    className="form-control"
                    value={dutyActionReason}
                    onChange={(e) => setDutyActionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-history-list">
                {snapshot.chapter_duty_grants.map((grant) => (
                  <article
                    key={grant.id}
                    className="p03-history-card"
                    data-testid={`p02-grant-${grant.id}`}
                  >
                    <div className="p03-history-head">
                      <div>
                        <strong>{grant.duty_code}</strong> &mdash; {grant.officer_name}
                        <div className="p03-muted-copy">
                          Scope: {grant.scope_kind}
                          {grant.requesting_unit_id ? ` (unit ${grant.requesting_unit_id})` : ''}
                          {grant.monetary_limit ? ` · Limit: PHP ${grant.monetary_limit.amount}` : ''}
                          {grant.alternate_for_grant_id
                            ? ` · Alternate for grant #${grant.alternate_for_grant_id}`
                            : ''}
                        </div>
                      </div>
                      <span className="p03-version-pill">
                        {grant.revoked_at ? 'REVOKED' : `Active v${grant.version}`}
                      </span>
                    </div>

                    {grant.revoked_at === null ? (
                      <div className="p03-next-actions-row">
                        <button
                          type="button"
                          data-testid={`p02-substitute-${grant.id}`}
                          className="btn-batcave-secondary p03-inline-action-btn"
                          onClick={() =>
                            handleSubstituteGrant(grant.id, grant.membership_id, grant.version)
                          }
                        >
                          Assign Alternate Officer
                        </button>
                        <button
                          type="button"
                          data-testid={`p02-revoke-grant-${grant.id}`}
                          className="btn-batcave-secondary p03-inline-action-btn"
                          onClick={() =>
                            handleRevokeGrant(grant.id, grant.membership_id, grant.version)
                          }
                        >
                          Revoke Grant
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-grant-form-heading">
              <span className="p03-eyebrow">S-21 &middot; 14 Canonical Duties</span>
              <h2 id="p02-grant-form-heading" className="p03-section-title">
                Authorize New Duty Grant
              </h2>

              <div className="form-stack">
                <div className="form-group">
                  <label htmlFor="p02-grant-member-select" className="form-label">
                    Active Officer Membership
                  </label>
                  <select
                    id="p02-grant-member-select"
                    className="form-control"
                    value={grantMembershipId}
                    onChange={(e) => setGrantMembershipId(e.target.value)}
                  >
                    {activeMembers.map((m) => (
                      <option key={m.membership_id} value={m.membership_id}>
                        {m.display_name} (membership {m.membership_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-grant-duty-select" className="form-label">
                      Canonical Duty
                    </label>
                    <select
                      id="p02-grant-duty-select"
                      className="form-control is-mono"
                      value={grantDutyCode}
                      onChange={(e) => setGrantDutyCode(e.target.value)}
                    >
                      {CANONICAL_CHAPTER_DUTIES.map((duty) => (
                        <option key={duty} value={duty}>
                          {duty}
                        </option>
                      ))}
                      <option value="provisioner">provisioner (Invalid Chapter Duty Test)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p02-grant-scope-select" className="form-label">
                      Scope Kind
                    </label>
                    <select
                      id="p02-grant-scope-select"
                      className="form-control"
                      value={grantScopeKind}
                      onChange={(e) => setGrantScopeKind(e.target.value as DutyGrantScopeKind)}
                    >
                      <option value="chapter">chapter</option>
                      <option value="unit">unit (requires requesting_unit_id)</option>
                    </select>
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-grant-unit-input" className="form-label">
                      Requesting Unit ID {grantScopeKind === 'unit' ? '*' : '(optional)'}
                    </label>
                    <input
                      id="p02-grant-unit-input"
                      type="text"
                      className="form-control is-mono"
                      disabled={grantScopeKind !== 'unit'}
                      value={grantUnitId}
                      onChange={(e) => setGrantUnitId(e.target.value)}
                      placeholder="e.g. 9007199254740994"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p02-grant-limit-input" className="form-label">
                      Monetary Limit (PHP)
                    </label>
                    <input
                      id="p02-grant-limit-input"
                      type="text"
                      className="form-control is-mono"
                      value={grantMonetaryLimit}
                      onChange={(e) => setGrantMonetaryLimit(e.target.value)}
                      placeholder="1000.00"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p02-grant-reason-input" className="form-label">
                    Grant Authorization Reason
                  </label>
                  <input
                    id="p02-grant-reason-input"
                    type="text"
                    className="form-control"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  id="p02-authorize-grant-btn"
                  className="btn-batcave-primary"
                  onClick={handleAuthorizeDutyGrant}
                >
                  Authorize Duty Grant
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Versioned Policies & Readiness Gates */}
        {activeTab === 'policies' ? (
          <section className="p03-card surface-card" aria-labelledby="p02-policies-heading">
            <span className="p03-eyebrow">S-21 &middot; Versioned Policies &amp; Missing-Input Blockers</span>
            <h2 id="p02-policies-heading" className="p03-section-title">
              Operational (CHAPTER_HEAD) &amp; Financial (FINANCE) Policies
            </h2>
            <p className="p03-muted-copy">
              Unapproved policies block dependent workflow commitments (<span className="p03-mono-inline">POLICY_NOT_EFFECTIVE</span>)
              while permitting draft preparation. Financial policies can only be approved by{' '}
              <span className="p03-mono-inline">FINANCE</span>.
            </p>

            <div className="form-group">
              <label htmlFor="p02-policy-reason-input" className="form-label">
                Policy Draft / Approval / Return Reason
              </label>
              <input
                id="p02-policy-reason-input"
                type="text"
                className="form-control"
                value={policyReason}
                onChange={(e) => setPolicyReason(e.target.value)}
              />
            </div>

            <div className="p03-history-list">
              {snapshot.chapter_policies.map((policy) => {
                const draftSummary = policySummaryEdits[policy.policy_id] ?? policy.summary;
                return (
                  <article
                    key={policy.policy_id}
                    className="p03-history-card"
                    data-testid={`p02-policy-${policy.policy_code}`}
                  >
                    <div className="p03-history-head">
                      <div>
                        <strong>{policy.name}</strong>{' '}
                        <span className="p03-mono-inline">({policy.policy_code})</span>
                        <div className="p03-muted-copy">
                          Category: <strong>{policy.category.toUpperCase()}</strong> (requires{' '}
                          {policy.category === 'financial' ? 'FINANCE' : 'CHAPTER_HEAD'}) &middot;
                          Governs: {policy.workflow_affected}
                        </div>
                      </div>
                      <div className="p03-version-badges">
                        <span className="p03-version-pill">status: {policy.status}</span>
                        <span className="p03-version-pill">row v{policy.row_version}</span>
                        <span className="p03-version-pill">mat v{policy.material_version ?? 'null'}</span>
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor={`p02-summary-${policy.policy_id}`} className="form-label">
                        Configured Policy Terms
                      </label>
                      <input
                        id={`p02-summary-${policy.policy_id}`}
                        type="text"
                        className="form-control"
                        value={draftSummary}
                        onChange={(e) =>
                          setPolicySummaryEdits((prev) => ({
                            ...prev,
                            [policy.policy_id]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="p03-next-actions-row">
                      <button
                        type="button"
                        data-testid={`p02-policy-draft-${policy.policy_code}`}
                        className="btn-batcave-secondary p03-inline-action-btn"
                        onClick={() =>
                          handlePolicyAction(
                            policy.policy_id,
                            policy.row_version,
                            policy.material_version,
                            draftSummary,
                            'draft'
                          )
                        }
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        data-testid={`p02-policy-approve-${policy.policy_code}`}
                        className="btn-batcave-primary p03-inline-action-btn"
                        onClick={() =>
                          handlePolicyAction(
                            policy.policy_id,
                            policy.row_version,
                            policy.material_version,
                            draftSummary,
                            'approve'
                          )
                        }
                      >
                        Approve Policy Version
                      </button>
                      <button
                        type="button"
                        data-testid={`p02-policy-return-${policy.policy_code}`}
                        className="btn-batcave-secondary p03-inline-action-btn"
                        onClick={() =>
                          handlePolicyAction(
                            policy.policy_id,
                            policy.row_version,
                            policy.material_version,
                            draftSummary,
                            'return'
                          )
                        }
                      >
                        Return Policy
                      </button>
                      <button
                        type="button"
                        data-testid={`p02-gate-draft-${policy.policy_code}`}
                        className="btn-batcave-secondary p03-inline-action-btn"
                        onClick={() => handleEvaluateGate(policy.policy_code, 'draft')}
                      >
                        Test Draft Preparation
                      </button>
                      <button
                        type="button"
                        data-testid={`p02-gate-commit-${policy.policy_code}`}
                        className="btn-batcave-secondary p03-inline-action-btn"
                        onClick={() => handleEvaluateGate(policy.policy_code, 'commit')}
                      >
                        Test Commit Gate
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* TAB 4: S-22 Provider Provisioning & Global Disable Boundary */}
        {activeTab === 'provider' ? (
          <div className="p03-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-provider-heading">
              <span className="p03-eyebrow">
                S-22 &middot; Separate Provider Surface (provider_authority_version v
                {snapshot.provider_authority_version})
              </span>
              <h2 id="p02-provider-heading" className="p03-section-title">
                Chapter Provisioning &amp; Initial Head Appointment
              </h2>
              <p className="p03-muted-copy">
                Creating a chapter or appointing its initial Head never grants the provisioner
                chapter operational membership (<span className="p03-mono-inline">not_applicable</span>).
              </p>

              <div className="form-stack">
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-prov-code-input" className="form-label">
                      Chapter Code
                    </label>
                    <input
                      id="p02-prov-code-input"
                      type="text"
                      className="form-control is-mono"
                      value={provCode}
                      onChange={(e) => setProvCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p02-prov-name-input" className="form-label">
                      Chapter Name
                    </label>
                    <input
                      id="p02-prov-name-input"
                      type="text"
                      className="form-control"
                      value={provName}
                      onChange={(e) => setProvName(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  id="p02-prov-create-btn"
                  className="btn-batcave-primary"
                  onClick={handleCreateProvisionedChapter}
                >
                  Create Provisioned Chapter (S-22)
                </button>
              </div>

              <div className="p03-guard-strip">
                <span className="session-ledger-key">Appoint Initial Head</span>
                <div className="form-group">
                  <label htmlFor="p02-appoint-prov-select" className="form-label">
                    Provisioned Chapter
                  </label>
                  <select
                    id="p02-appoint-prov-select"
                    className="form-control"
                    value={appointProvId}
                    onChange={(e) => setAppointProvId(e.target.value)}
                  >
                    {snapshot.provisioned_chapters.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.chapter_code} &mdash; {prov.chapter_name} (v{prov.version}, membership:{' '}
                        {prov.initial_head_membership_authorization})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-appoint-head-id-input" className="form-label">
                      Head User ID
                    </label>
                    <input
                      id="p02-appoint-head-id-input"
                      type="text"
                      className="form-control is-mono"
                      value={appointHeadId}
                      onChange={(e) => setAppointHeadId(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p02-appoint-head-name-input" className="form-label">
                      Head Display Name
                    </label>
                    <input
                      id="p02-appoint-head-name-input"
                      type="text"
                      className="form-control"
                      value={appointHeadName}
                      onChange={(e) => setAppointHeadName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p02-appoint-reason-input" className="form-label">
                    Designation Reason
                  </label>
                  <input
                    id="p02-appoint-reason-input"
                    type="text"
                    className="form-control"
                    value={appointReason}
                    onChange={(e) => setAppointReason(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  id="p02-appoint-head-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAppointInitialHead}
                >
                  Appoint Initial Head (No Auto-Membership)
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-global-disable-heading">
              <span className="p03-eyebrow">S-22 &middot; Disabled Global Boundary (enabled_boundary: false)</span>
              <h2 id="p02-global-disable-heading" className="p03-section-title">
                Global Identity Disable Boundary Check
              </h2>
              <p className="p03-muted-copy">
                Per <span className="p03-mono-inline">p02-action-catalogue.json</span> and{' '}
                <span className="p03-mono-inline">identity-disable.ts</span>,{' '}
                <span className="p03-mono-inline">identity.disable</span> returns HTTP 503 with
                uncertain/unavailable boundary guidance.
              </p>

              <div className="form-stack">
                <div className="form-group">
                  <label htmlFor="p02-global-disable-user-input" className="form-label">
                    Target User ID (Lossless Exact String)
                  </label>
                  <input
                    id="p02-global-disable-user-input"
                    type="text"
                    className="form-control is-mono"
                    value={globalDisableUserId}
                    onChange={(e) => setGlobalDisableUserId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p02-global-disable-reason-input" className="form-label">
                    Disable Justification
                  </label>
                  <input
                    id="p02-global-disable-reason-input"
                    type="text"
                    className="form-control"
                    value={globalDisableReason}
                    onChange={(e) => setGlobalDisableReason(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  id="p02-global-disable-btn"
                  className="btn-batcave-secondary"
                  onClick={handleGlobalDisableBoundary}
                >
                  Attempt Global Identity Disable (Test 503 Boundary)
                </button>
              </div>

              {globalDisableResult ? (
                <div
                  className="callout-banner is-error"
                  data-testid="p02-global-disable-result"
                  aria-live="polite"
                >
                  <span className="callout-dot dot-warning" aria-hidden="true" />
                  <div>
                    <strong>
                      HTTP {globalDisableResult.status} &middot; original_outcome:{' '}
                      {globalDisableResult.original_outcome} &middot; next_action:{' '}
                      {globalDisableResult.next_action}
                    </strong>
                    <div>{globalDisableResult.message}</div>
                  </div>
                </div>
              ) : null}

              <div className="session-ledger">
                <div className="session-ledger-row">
                  <span className="session-ledger-key">Provisioned Chapters ({snapshot.provisioned_chapters.length})</span>
                  {snapshot.provisioned_chapters.map((p) => (
                    <span key={p.id} className="session-ledger-val p03-mono-inline">
                      {p.chapter_code} ({p.chapter_name}) &middot; membership_auth:{' '}
                      {p.initial_head_membership_authorization}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
