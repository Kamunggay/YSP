import { useRef, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import {
  CANONICAL_CHAPTER_DUTIES,
  createP02AdminEngine,
} from './p02AdminSlice';
import type {
  DutyGrantScopeKind,
  GlobalDisableBoundaryFeedback,
  P02ActionResult,
  P02OperationRecord,
  P02OperationScope,
  P02Snapshot,
} from './p02AdminSlice';

type P02TabId = 'memberships' | 'duties' | 'policies' | 'provider' | 'lookup';

interface P02AdminWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard?: (() => void) | undefined;
  onNotify?: ((tone: 'success' | 'warning' | 'error' | 'info', text: string) => void) | undefined;
}

function formatSevenDigitUserId(rawUserId: string): string {
  const trimmed = rawUserId.trim();
  if (!trimmed) {
    return '—';
  }
  if (/^\d{7}$/.test(trimmed)) {
    return trimmed;
  }
  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const sevenDigit = 1000000 + ((hash >>> 0) % 9000000);
  return String(sevenDigit);
}

function resolveInternalUserId(inputId: string): string {
  return inputId.trim();
}

function fallbackCopyText(value: string): boolean {
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

async function copyTextSafe(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return fallbackCopyText(value);
    }
  }
  return fallbackCopyText(value);
}

interface UserIdCopyPillProps {
  userId: string;
  pillKey: string;
  copiedKey: string | null;
  onCopy: (pillKey: string, value: string) => void;
  testId?: string | undefined;
}

function UserIdCopyPill({
  userId,
  pillKey,
  copiedKey,
  onCopy,
  testId,
}: UserIdCopyPillProps) {
  const displayId = formatSevenDigitUserId(userId);
  const copied = copiedKey === pillKey;
  return (
    <span
      className="p03-version-pill p03-hash-copy-pill p03-mono-inline p03-id-pill"
      data-testid={testId}
      title={`User ID: ${displayId}`}
    >
      <span>
        <span className="p03-id-prefix">ID:</span>{' '}
        <span className="p03-id-value">{displayId}</span>
      </span>
      <button
        type="button"
        className={`btn-copy-key p03-copy-btn${copied ? ' copied' : ''}`}
        aria-label={copied ? `Copied user ID ${displayId}` : `Copy user ID ${displayId}`}
        onClick={() => onCopy(pillKey, displayId)}
      >
        {copied ? (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </span>
  );
}

function formatReadableEnum(raw: string): string {
  return raw.replace(/_/g, ' ').toUpperCase();
}

function formatTitleEnum(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .map((part) => {
      if (!part) return '';
      if (part === 'rf') return 'RF';
      return `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`;
    })
    .join(' ');
}

export function P02AdminWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P02AdminWorkspaceProps) {
  const [engine] = useState(() => createP02AdminEngine());
  const [snapshot, setSnapshot] = useState<P02Snapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P02TabId>('memberships');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<P02ActionResult<unknown> | null>(null);
  const [copiedUserKey, setCopiedUserKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  // Membership form & action state (starts completely empty)
  const [memberReason, setMemberReason] = useState<string>('');
  const [authUserId, setAuthUserId] = useState<string>('');
  const [authDisplayName, setAuthDisplayName] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authReason, setAuthReason] = useState<string>('');

  // Duty grant & alternate state
  const [grantMembershipId, setGrantMembershipId] = useState<string>('');
  const [grantDutyCode, setGrantDutyCode] = useState<string>('');
  const [grantScopeKind, setGrantScopeKind] = useState<DutyGrantScopeKind>('chapter');
  const [grantUnitId, setGrantUnitId] = useState<string>('');
  const [grantMonetaryLimit, setGrantMonetaryLimit] = useState<string>('');
  const [grantReason, setGrantReason] = useState<string>('');
  const [alternateMembershipId, setAlternateMembershipId] = useState<string>('');
  const [dutyActionReason, setDutyActionReason] = useState<string>('');

  // Policy draft / review state
  const [policyReason, setPolicyReason] = useState<string>('');
  const [policySummaryEdits, setPolicySummaryEdits] = useState<Record<string, string>>({});

  // Provider provisioning state
  const [provCode, setProvCode] = useState<string>('');
  const [provName, setProvName] = useState<string>('');
  const [appointProvId, setAppointProvId] = useState<string>('');
  const [appointHeadId, setAppointHeadId] = useState<string>('');
  const [appointHeadName, setAppointHeadName] = useState<string>('');
  const [appointReason, setAppointReason] = useState<string>('');
  const [globalDisableUserId, setGlobalDisableUserId] = useState<string>('');

  async function handleCopyUserId(pillKey: string, value: string) {
    playClickPen(soundEnabled);
    const ok = await copyTextSafe(value);
    if (!ok) {
      onNotify?.('error', 'Unable to copy user ID to clipboard');
      return;
    }
    setCopiedUserKey(pillKey);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedUserKey((current) => (current === pillKey ? null : current));
      copyTimerRef.current = null;
    }, 2500);
    onNotify?.('info', `Copied ID ${value}`);
  }
  const [globalDisableReason, setGlobalDisableReason] = useState<string>('');
  const [globalDisableResult, setGlobalDisableResult] =
    useState<GlobalDisableBoundaryFeedback | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [dutyEndsAt, setDutyEndsAt] = useState<string>('');
  const [membershipIdentityNotice, setMembershipIdentityNotice] = useState<string | null>(null);
  const [provIdentityNotice, setProvIdentityNotice] = useState<string | null>(null);
  const [lookupScope, setLookupScope] = useState<P02OperationScope>('chapter');
  const [lookupActionCode, setLookupActionCode] = useState<string>('');
  const [lookupKeyInput, setLookupKeyInput] = useState<string>('');
  const [lookupOpIdInput, setLookupOpIdInput] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<P02ActionResult<P02OperationRecord> | null>(null);
  const keySeqRef = useRef<number>(0);

  function optionalKeyParam(): { idempotency_key?: string } {
    return idempotencyKey ? { idempotency_key: idempotencyKey } : {};
  }

  function handleGenerateIdempotencyKey() {
    playClickPen(soundEnabled);
    keySeqRef.current += 1;
    const prefix =
      activeTab === 'memberships'
        ? 'mem'
        : activeTab === 'duties'
          ? 'grant'
          : activeTab === 'policies'
            ? 'pol'
            : 'prov';
    setIdempotencyKey(`p02-${prefix}-${String(keySeqRef.current).padStart(2, '0')}`);
  }

  function syncSnapshot() {
    const next = engine.getSnapshot();
    setSnapshot(next);
    if (
      grantMembershipId &&
      !next.chapter_memberships.some(
        (m) => m.membership_id === grantMembershipId && m.status === 'active'
      )
    ) {
      setGrantMembershipId('');
    }
    if (
      alternateMembershipId &&
      !next.chapter_memberships.some(
        (m) => m.membership_id === alternateMembershipId && m.status === 'active'
      )
    ) {
      setAlternateMembershipId('');
    }
    if (appointProvId && !next.provisioned_chapters.some((p) => p.id === appointProvId)) {
      setAppointProvId('');
    }
  }

  function applyFeedback(res: P02ActionResult<unknown>) {
    setFeedback(res);
    if (res.operation_id) {
      setLookupOpIdInput(res.operation_id);
      if (res.action_code) {
        setLookupActionCode(res.action_code);
        setLookupScope(res.action_code.startsWith('provider.') ? 'provider' : 'chapter');
      }
      if (res.idempotency_key) {
        setLookupKeyInput(res.idempotency_key);
      }
    }
    syncSnapshot();
    if (res.ok) {
      playScribblenauts(soundEnabled);
      onNotify?.('success', res.message);
    } else if (res.status === 403) {
      onNotify?.('error', res.message);
    } else {
      onNotify?.('warning', res.message);
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

  function handleLookupMembershipIdentity() {
    playClickPen(soundEnabled);
    const res = engine.lookupMembershipIdentity({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      user_id: resolveInternalUserId(authUserId),
    });
    if (res.ok && res.data) {
      setAuthDisplayName(res.data.display_name);
      setMembershipIdentityNotice(`${res.data.display_name} (ID ${res.data.user_id})`);
    } else {
      setMembershipIdentityNotice(res.message);
    }
    applyFeedback(res);
  }

  function handleLookupProvisioningIdentity() {
    playClickPen(soundEnabled);
    const res = engine.lookupProvisioningIdentity({
      user_id: resolveInternalUserId(appointHeadId),
    });
    if (res.ok && res.data) {
      setAppointHeadName(res.data.display_name);
      setProvIdentityNotice(`${res.data.display_name} (ID ${res.data.user_id})`);
    } else {
      setProvIdentityNotice(res.message);
    }
    applyFeedback(res);
  }

  function handleAuthorizeMembership() {
    playClickPen(soundEnabled);
    const res = engine.authorizeMembership({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      user_id: resolveInternalUserId(authUserId),
      display_name: authDisplayName,
      email: authEmail,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: null,
      reason: authReason,
      ...optionalKeyParam(),
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
      ...optionalKeyParam(),
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
      ...optionalKeyParam(),
    });
    applyFeedback(res);
  }

  function handleAmendGrant(grantId: string, membershipId: string, grantVersion: number) {
    playClickPen(soundEnabled);
    const membership = snapshot.chapter_memberships.find(
      (m) => m.membership_id === membershipId
    );
    const cleanLimit = grantMonetaryLimit.trim();
    const res = engine.amendDutyGrant({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      grant_id: grantId,
      ends_at: dutyEndsAt.trim() || null,
      monetary_limit: cleanLimit ? { currency: 'PHP', amount: cleanLimit } : null,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membership?.version ?? 1,
      expected_grant_version: grantVersion,
      reason: dutyActionReason,
      ...optionalKeyParam(),
    });
    applyFeedback(res);
  }

  function handleEndGrant(grantId: string, membershipId: string, grantVersion: number) {
    playClickPen(soundEnabled);
    const membership = snapshot.chapter_memberships.find(
      (m) => m.membership_id === membershipId
    );
    const res = engine.endDutyGrant({
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      grant_id: grantId,
      ends_at: dutyEndsAt,
      expected_authority_version: snapshot.authority_version,
      expected_membership_version: membership?.version ?? 1,
      expected_grant_version: grantVersion,
      reason: dutyActionReason,
      ...optionalKeyParam(),
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
      ...optionalKeyParam(),
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
      ...optionalKeyParam(),
    });
    applyFeedback(res);
  }

  function handlePolicyAction(
    policyId: string,
    rowVersion: number,
    materialVersion: number | null,
    summary: string,
    action: 'draft' | 'submit' | 'review' | 'approve' | 'return'
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
        ...optionalKeyParam(),
      });
    } else if (action === 'submit') {
      res = engine.submitPolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
        ...optionalKeyParam(),
      });
    } else if (action === 'review') {
      res = engine.reviewPolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
        ...optionalKeyParam(),
      });
    } else if (action === 'approve') {
      res = engine.approvePolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
        ...optionalKeyParam(),
      });
    } else {
      res = engine.returnPolicyVersion({
        chapter_id: snapshot.selected_chapter_id ?? undefined,
        policy_id: policyId,
        expected_authority_version: snapshot.authority_version,
        expected_row_version: rowVersion,
        expected_material_version: materialVersion,
        reason: policyReason,
        ...optionalKeyParam(),
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
      ...optionalKeyParam(),
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
      initial_head_user_id: resolveInternalUserId(appointHeadId),
      initial_head_name: appointHeadName,
      expected_provider_authority_version: snapshot.provider_authority_version,
      expected_provisioning_version: targetProv?.version ?? 1,
      reason: appointReason,
      ...optionalKeyParam(),
    });
    applyFeedback(res);
  }

  function handleLookupOperationByKey() {
    playClickPen(soundEnabled);
    const res = engine.lookupOperationByKey({
      scope: lookupScope,
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      action_code: lookupActionCode,
      idempotency_key: lookupKeyInput,
    });
    setLookupResult(res);
  }

  function handleLookupOperationById() {
    playClickPen(soundEnabled);
    const res = engine.lookupOperationById({
      scope: lookupScope,
      chapter_id: snapshot.selected_chapter_id ?? undefined,
      operation_id: lookupOpIdInput,
    });
    setLookupResult(res);
  }

  function handleGlobalDisableBoundary() {
    playClickPen(soundEnabled);
    const resolvedId = resolveInternalUserId(globalDisableUserId);
    const res = engine.attemptGlobalIdentityDisable({
      user_id: resolvedId,
      expected_identity_version: 1,
      reason: globalDisableReason,
    });
    setGlobalDisableResult(res);
    syncSnapshot();
    onNotify?.('warning', `HTTP ${res.status} — Organization-wide lock unavailable`);
  }

  const activeMembers = snapshot.chapter_memberships.filter((m) => m.status === 'active');
  const totalActiveSessions = snapshot.chapter_memberships.reduce(
    (sum, m) => sum + m.active_sessions,
    0
  );
  const revokedOrDisabledCount = snapshot.chapter_memberships.length - activeMembers.length;
  const activeGrants = snapshot.chapter_duty_grants.filter((g) => g.revoked_at === null);
  const distinctAssignedDutiesCount = new Set(activeGrants.map((g) => g.duty_code)).size;
  const alternateGrantCount = activeGrants.filter((g) => g.alternate_for_grant_id !== null).length;
  const hasHeadAssigned = activeGrants.some((g) => g.duty_code === 'CHAPTER_HEAD');
  const hasFinanceAssigned = activeGrants.some((g) => g.duty_code === 'FINANCE');
  const approvedPolicies = snapshot.chapter_policies.filter((p) => p.status === 'approved');
  const allPoliciesApproved =
    snapshot.chapter_policies.length > 0 &&
    approvedPolicies.length === snapshot.chapter_policies.length;
  const stageReady =
    activeMembers.length >= 2 && hasHeadAssigned && hasFinanceAssigned && allPoliciesApproved;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredMemberships = normalizedQuery
    ? snapshot.chapter_memberships.filter(
        (m) =>
          m.display_name.toLowerCase().includes(normalizedQuery) ||
          m.email.toLowerCase().includes(normalizedQuery) ||
          m.status.toLowerCase().includes(normalizedQuery) ||
          m.user_id.toLowerCase().includes(normalizedQuery) ||
          formatSevenDigitUserId(m.user_id).includes(normalizedQuery)
      )
    : snapshot.chapter_memberships;

  const filteredGrants = normalizedQuery
    ? snapshot.chapter_duty_grants.filter(
        (g) =>
          g.duty_code.toLowerCase().includes(normalizedQuery) ||
          g.officer_name.toLowerCase().includes(normalizedQuery) ||
          g.scope_kind.toLowerCase().includes(normalizedQuery) ||
          g.user_id.toLowerCase().includes(normalizedQuery) ||
          formatSevenDigitUserId(g.user_id).includes(normalizedQuery)
      )
    : snapshot.chapter_duty_grants;

  const filteredPolicies = normalizedQuery
    ? snapshot.chapter_policies.filter(
        (p) =>
          p.name.toLowerCase().includes(normalizedQuery) ||
          p.policy_code.toLowerCase().includes(normalizedQuery) ||
          p.workflow_affected.toLowerCase().includes(normalizedQuery) ||
          p.status.toLowerCase().includes(normalizedQuery)
      )
    : snapshot.chapter_policies;

  const filteredProvisioned = normalizedQuery
    ? snapshot.provisioned_chapters.filter(
        (c) =>
          c.chapter_code.toLowerCase().includes(normalizedQuery) ||
          c.chapter_name.toLowerCase().includes(normalizedQuery) ||
          (c.initial_head_name ?? '').toLowerCase().includes(normalizedQuery) ||
          formatSevenDigitUserId(c.initial_head_user_id ?? c.provider_user_id).includes(
            normalizedQuery
          )
      )
    : snapshot.provisioned_chapters;

  const filteredOperations = normalizedQuery
    ? snapshot.operation_ledger.filter(
        (op) =>
          op.action_code.toLowerCase().includes(normalizedQuery) ||
          op.idempotency_key.toLowerCase().includes(normalizedQuery) ||
          op.operation_id.toLowerCase().includes(normalizedQuery) ||
          op.code.toLowerCase().includes(normalizedQuery)
      )
    : snapshot.operation_ledger;

  const activeSearchCount =
    activeTab === 'memberships'
      ? filteredMemberships.length
      : activeTab === 'duties'
        ? filteredGrants.length
        : activeTab === 'policies'
          ? filteredPolicies.length
          : activeTab === 'provider'
            ? filteredProvisioned.length
            : filteredOperations.length;

  const contextAttentionClass =
    feedback && !feedback.ok
      ? 'is-serious-attention'
      : snapshot.chapter_state !== 'selected'
        ? 'is-needs-action'
        : '';

  return (
    <main className="p03-workspace-shell" data-testid="p02-workspace">
      <div className="p03-workspace-inner">
        {/* Unified Header Matching P03 & P04 */}
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="p02-admin-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search active chapter memberships, duties, policies, or provisioned chapters"
                aria-label="Search chapter administration items"
              />
            </div>

            {normalizedQuery && (
              <div className="p03-search-meta">
                <span className="p03-version-pill" data-testid="p02-search-match-count">
                  {activeSearchCount} match{activeSearchCount === 1 ? '' : 'es'}
                </span>
                <button
                  type="button"
                  id="p02-search-clear-btn"
                  className="p03-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 id="p02-workspace-title" className="p03-main-title">
                Chapter Administration &amp; Setup
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Chapter administration views"
              >
                <button
                  type="button"
                  id="p02-tab-memberships"
                  role="tab"
                  aria-selected={activeTab === 'memberships'}
                  className={`p03-filter-pill ${activeTab === 'memberships' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('memberships');
                  }}
                >
                  Memberships
                </button>
                <button
                  type="button"
                  id="p02-tab-duties"
                  role="tab"
                  aria-selected={activeTab === 'duties'}
                  className={`p03-filter-pill ${activeTab === 'duties' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('duties');
                  }}
                >
                  Duty Grants
                </button>
                <button
                  type="button"
                  id="p02-tab-policies"
                  role="tab"
                  aria-selected={activeTab === 'policies'}
                  className={`p03-filter-pill ${activeTab === 'policies' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('policies');
                  }}
                >
                  Policies &amp; Readiness
                </button>
                <button
                  type="button"
                  id="p02-tab-provider"
                  role="tab"
                  aria-selected={activeTab === 'provider'}
                  className={`p03-filter-pill ${activeTab === 'provider' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('provider');
                  }}
                >
                  Provisioning
                </button>
                <button
                  type="button"
                  id="p02-tab-lookup"
                  role="tab"
                  aria-selected={activeTab === 'lookup'}
                  className={`p03-filter-pill ${activeTab === 'lookup' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('lookup');
                  }}
                >
                  Operation Lookup
                </button>
              </div>

              {onBackToDashboard ? (
                <button
                  type="button"
                  id="p02-back-dashboard-btn"
                  className="btn-batcave-secondary p03-shrink-btn p04-back-btn"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    onBackToDashboard();
                  }}
                >
                  Back to Chapter Workspace
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Active Identity & Chapter Context Card */}
        <section
          className={`p03-card surface-card ${contextAttentionClass}`}
          aria-labelledby="p02-context-heading"
          data-testid="p02-context-card"
        >
          <div className="p03-card-header-row">
            <div className="p03-state-title-group">
              <h2 id="p02-context-heading" className="p03-section-title">
                {snapshot.active_persona ? (
                  <>
                    {snapshot.active_persona.display_name}{' '}
                    <span className="p03-muted-inline">({snapshot.active_persona.email})</span>
                  </>
                ) : (
                  <>
                    No Active Officer Session{' '}
                    <span className="p03-muted-inline">(Sign in to load chapter context)</span>
                  </>
                )}
              </h2>
              <span className="p03-attention-badge" data-testid="p02-context-badge">
                <span
                  className={`toast-dot ${
                    feedback && !feedback.ok
                      ? 'toast-dot-error'
                      : snapshot.chapter_state !== 'selected'
                        ? 'toast-dot-warning'
                        : 'toast-dot-success'
                  }`}
                  aria-hidden="true"
                />
                <span>
                  {snapshot.chapter_state === 'selected'
                    ? 'Active Chapter Context'
                    : snapshot.chapter_state === 'no_authorized_memberships'
                      ? 'No Chapter Membership'
                      : 'Selection Required'}
                </span>
              </span>
            </div>

            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p02-chapter-state">
                chapter status: <strong>{formatReadableEnum(snapshot.chapter_state)}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p02-next-action">
                next step: <strong>{formatReadableEnum(snapshot.next_action)}</strong>
              </span>
              {snapshot.selection_revision ? (
                <span className="p03-version-pill p03-mono-inline" data-testid="p02-selection-revision">
                  context: <strong>{snapshot.selection_revision}</strong>
                </span>
              ) : null}
            </div>
          </div>

          <div className="p03-two-col">
            <div className="form-group">
              <label htmlFor="p02-persona-select" className="form-label">
                Acting Officer Identity
              </label>
              <select
                id="p02-persona-select"
                className="form-control"
                value={snapshot.active_persona?.key ?? ''}
                disabled={snapshot.available_personas.length === 0}
                onChange={(e) => handleSelectPersona(e.target.value)}
              >
                {snapshot.available_personas.length === 0 ? (
                  <option value="">No session identities loaded</option>
                ) : (
                  snapshot.available_personas.map((persona) => (
                    <option key={persona.key} value={persona.key}>
                      {persona.display_name} ({persona.email})
                      {persona.provider_roles.length > 0 ? ' — Provider' : ''}
                    </option>
                  ))
                )}
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
                <option value="">No Chapter Selected</option>
                {snapshot.all_chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.code} &mdash; {chapter.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p03-axes-bar">
            <div className="p03-axis-chip">
              <span className="p03-axis-key">ACTIVE CHAPTER</span>
              <span className="p03-axis-val">
                {snapshot.selected_chapter_name ?? 'None Selected'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">EFFECTIVE DUTIES IN CHAPTER</span>
              <span className="p03-axis-val" data-testid="p02-active-duties">
                {snapshot.active_user_duties.length > 0
                  ? snapshot.active_user_duties.map(formatTitleEnum).join(', ')
                  : 'None'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">PROVIDER AUTHORITY</span>
              <span className="p03-axis-val">
                {snapshot.active_persona && snapshot.active_persona.provider_roles.length > 0
                  ? snapshot.active_persona.provider_roles.map(formatTitleEnum).join(', ')
                  : 'None'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="p02-idempotency-key-input" className="form-label">
              Mutation Idempotency-Key (Optional &middot; Scoped by Chapter + Action)
            </label>
            <div className="p03-input-action-row">
              <input
                id="p02-idempotency-key-input"
                type="text"
                className="form-control p03-mono-inline"
                value={idempotencyKey}
                placeholder="Enter or generate idempotency key"
                onChange={(e) => setIdempotencyKey(e.target.value)}
              />
              <button
                type="button"
                id="p02-new-key-btn"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={handleGenerateIdempotencyKey}
              >
                New Key
              </button>
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
                  {feedback.code} (HTTP {feedback.status})
                  {feedback.replayed ? ' · REPLAYED' : ''}
                </strong>
                <div>{feedback.message}</div>
                {feedback.operation_id ? (
                  <div className="p03-formal-sub p03-mono-inline">
                    Op: {feedback.operation_id} ({feedback.action_code} &middot; Key:{' '}
                    {feedback.idempotency_key})
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* TAB 1: Memberships & Session Revocation */}
        {activeTab === 'memberships' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-members-heading">
              <div className="p03-card-header-row">
                <h2 id="p02-members-heading" className="p03-section-title">
                  Chapter Officer Roster
                </h2>
                <span className="p03-version-pill">
                  {activeMembers.length} active officer{activeMembers.length === 1 ? '' : 's'}
                </span>
              </div>

              {snapshot.chapter_state !== 'selected' ? (
                <div className="callout-banner is-error" data-testid="p02-no-chapter-access-notice">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>
                    {snapshot.chapter_state === 'no_authorized_memberships'
                      ? 'This identity currently holds no operational chapter membership. A Chapter Head must separately authorize membership before viewing chapter records.'
                      : 'Select an authorized chapter above to view and manage officer memberships.'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label htmlFor="p02-membership-action-reason" className="form-label">
                      Disable / Revoke Justification
                    </label>
                    <input
                      id="p02-membership-action-reason"
                      type="text"
                      className="form-control"
                      value={memberReason}
                      placeholder="Enter reason for disabling or revoking membership"
                      onChange={(e) => setMemberReason(e.target.value)}
                    />
                  </div>

                  {filteredMemberships.length === 0 ? (
                    <p className="p03-muted-copy" data-testid="p02-empty-members-notice">
                      {normalizedQuery
                        ? 'No chapter memberships match this search.'
                        : 'No chapter memberships loaded for the selected chapter.'}
                    </p>
                  ) : null}

                  <div className="p03-history-list">
                    {filteredMemberships.map((m) => (
                      <article
                        key={m.membership_id}
                        className="p03-history-card"
                        data-testid={`p02-member-${m.user_id}`}
                      >
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <UserIdCopyPill
                              userId={m.user_id}
                              pillKey={`member-${m.membership_id}`}
                              copiedKey={copiedUserKey}
                              onCopy={handleCopyUserId}
                              testId={`p02-member-uid-${m.membership_id}`}
                            />
                            <strong>{m.display_name}</strong>
                            <span className="p03-muted-inline">{m.email}</span>
                          </div>
                          <div className="p03-version-badges">
                            <span
                              className={
                                m.status === 'active'
                                  ? 'p03-current-badge'
                                  : 'p03-superseded-badge'
                              }
                            >
                              <span
                                className={`toast-dot ${
                                  m.status === 'active' ? 'toast-dot-success' : 'toast-dot-error'
                                }`}
                                aria-hidden="true"
                              />
                              <span>{m.status.toUpperCase()}</span>
                            </span>
                            <span className="p03-lineage-pill">
                              {m.active_sessions} SESSION{m.active_sessions === 1 ? '' : 'S'}
                            </span>
                          </div>
                        </div>

                        {m.status === 'active' ? (
                          <div className="p02-compact-actions">
                            <span className="p03-formal-sub">
                              Active chapter access &amp; session authority
                            </span>
                            <div className="p02-compact-btn-group">
                              <button
                                type="button"
                                data-testid={`p02-disable-${m.user_id}`}
                                className="p02-compact-btn"
                                onClick={() =>
                                  handleMembershipStatus(m.membership_id, m.version, 'disabled')
                                }
                              >
                                Disable &amp; Revoke Sessions
                              </button>
                              <button
                                type="button"
                                data-testid={`p02-revoke-${m.user_id}`}
                                className="p02-compact-btn is-subtle-danger"
                                onClick={() =>
                                  handleMembershipStatus(m.membership_id, m.version, 'revoked')
                                }
                              >
                                Revoke Membership
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p02-auth-member-heading">
                <div>
                  <h2 id="p02-auth-member-heading" className="p03-section-title">
                    Authorize Chapter Membership
                  </h2>
                  <p className="p03-muted-copy">
                    Only the Chapter Head may grant operational membership within a chapter. Provider provisioning roles do not inherit chapter access automatically.
                  </p>
                </div>

                <div className="form-stack">
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p02-auth-user-id" className="form-label">
                        User ID
                      </label>
                      <div className="p03-input-action-row">
                        <input
                          id="p02-auth-user-id"
                          type="text"
                          className="form-control p03-mono-inline"
                          value={authUserId}
                          placeholder="User ID"
                          onChange={(e) => {
                            setAuthUserId(e.target.value);
                            setMembershipIdentityNotice(null);
                          }}
                        />
                        <button
                          type="button"
                          id="p02-lookup-member-identity-btn"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={handleLookupMembershipIdentity}
                        >
                          Lookup
                        </button>
                      </div>
                      {membershipIdentityNotice ? (
                        <span className="p03-formal-sub" data-testid="p02-member-identity-notice">
                          {membershipIdentityNotice}
                        </span>
                      ) : null}
                    </div>
                    <div className="form-group">
                      <label htmlFor="p02-auth-display-name" className="form-label">
                        Full Name
                      </label>
                      <input
                        id="p02-auth-display-name"
                        type="text"
                        className="form-control"
                        value={authDisplayName}
                        placeholder="Full name"
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
                      placeholder="name@example.org"
                      onChange={(e) => setAuthEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="p02-auth-reason" className="form-label">
                      Authorization Justification
                    </label>
                    <input
                      id="p02-auth-reason"
                      type="text"
                      className="form-control"
                      value={authReason}
                      placeholder="Enter authorization justification"
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

              <section className="p03-card surface-card" aria-labelledby="p02-roster-summary-heading">
                <div className="p03-card-header-row">
                  <h2 id="p02-roster-summary-heading" className="p03-section-title">
                    Session &amp; Separation Controls
                  </h2>
                  <span className="p03-version-pill">
                    {activeMembers.length >= 2 ? 'Independence Met' : 'Need 2 Officers'}
                  </span>
                </div>
                <div className="p03-formal-grid">
                  <div className="p03-formal-cell">
                    <span className="p03-formal-key">ACTIVE ROSTER</span>
                    <span className="p03-formal-val">
                      {activeMembers.length} of {snapshot.chapter_memberships.length}
                    </span>
                    <span className="p03-formal-sub">
                      {revokedOrDisabledCount} disabled/revoked
                    </span>
                  </div>
                  <div className="p03-formal-cell">
                    <span className="p03-formal-key">LIVE SESSIONS</span>
                    <span className="p03-formal-val">{totalActiveSessions} Active</span>
                    <span className="p03-formal-sub">Revoked on disable</span>
                  </div>
                  <div className="p03-formal-cell is-span-2">
                    <span className="p03-formal-key">SEPARATION BOUNDARY</span>
                    <span className="p03-formal-val">Chapter Head Approval Only</span>
                    <span className="p03-formal-sub">
                      Provider provisioning accounts require explicit chapter authorization
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Duty Grants & Alternates */}
        {activeTab === 'duties' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-grants-heading">
              <div className="p03-card-header-row">
                <h2 id="p02-grants-heading" className="p03-section-title">
                  Scoped Duties &amp; Alternate Designation
                </h2>
                <span className="p03-version-pill">
                  {activeGrants.length} active grant{activeGrants.length === 1 ? '' : 's'}
                </span>
              </div>

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
                    <option value="">Select alternate officer</option>
                    {activeMembers.map((m) => (
                      <option key={m.membership_id} value={m.membership_id}>
                        {m.display_name} (ID: {formatSevenDigitUserId(m.user_id)})
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
                    placeholder="Enter reason for alternate assignment or revocation"
                    onChange={(e) => setDutyActionReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p02-duty-ends-at-input" className="form-label">
                  Scheduled End Timestamp (ISO UTC for Amend / End Grant)
                </label>
                <input
                  id="p02-duty-ends-at-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={dutyEndsAt}
                  placeholder="YYYY-MM-DDTHH:MM:SS.000000Z"
                  onChange={(e) => setDutyEndsAt(e.target.value)}
                />
              </div>

              {filteredGrants.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p02-empty-grants-notice">
                  {snapshot.chapter_state !== 'selected'
                    ? 'Select an authorized chapter to inspect duty grants.'
                    : normalizedQuery
                      ? 'No duty grants match this search.'
                      : 'No duty grants loaded for the selected chapter.'}
                </p>
              ) : null}

              <div className="p03-history-list">
                {filteredGrants.map((grant) => (
                  <article
                    key={grant.id}
                    className={`p03-history-card ${grant.revoked_at ? 'is-superseded' : ''}`}
                    data-testid={`p02-grant-${grant.id}`}
                  >
                    <div className="p03-history-head">
                      <div className="p03-history-title-group">
                        <UserIdCopyPill
                          userId={grant.user_id}
                          pillKey={`grant-${grant.id}`}
                          copiedKey={copiedUserKey}
                          onCopy={handleCopyUserId}
                        />
                        <span className="p03-version-badge">
                          {formatTitleEnum(grant.duty_code)}
                        </span>
                        <span className="p03-lineage-pill">{grant.officer_name}</span>
                        <span
                          className={
                            grant.revoked_at ? 'p03-superseded-badge' : 'p03-current-badge'
                          }
                        >
                          <span
                            className={`toast-dot ${
                              grant.revoked_at ? 'toast-dot-error' : 'toast-dot-success'
                            }`}
                            aria-hidden="true"
                          />
                          <span>{grant.revoked_at ? 'REVOKED' : 'ACTIVE'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="p02-three-col-grid">
                      <div className="p03-formal-cell">
                        <span className="p03-formal-key">SCOPE LEVEL</span>
                        <span className="p03-formal-val">
                          {formatTitleEnum(grant.scope_kind)}
                        </span>
                        {grant.requesting_unit_id ? (
                          <span className="p03-formal-sub">
                            Unit {grant.requesting_unit_id}
                          </span>
                        ) : null}
                      </div>
                      <div className="p03-formal-cell">
                        <span className="p03-formal-key">APPROVAL LIMIT</span>
                        <span className="p03-formal-val">
                          {grant.monetary_limit
                            ? `PHP ${grant.monetary_limit.amount}`
                            : 'No Monetary Cap'}
                        </span>
                      </div>
                      <div className="p03-formal-cell">
                        <span className="p03-formal-key">ALTERNATE COVERAGE</span>
                        <span className="p03-formal-val">
                          {grant.alternate_for_grant_id
                            ? `Alternate for Grant #${grant.alternate_for_grant_id}`
                            : 'Primary Duty Assignment'}
                        </span>
                      </div>
                    </div>

                    {grant.revoked_at === null ? (
                      <div className="p02-compact-actions">
                        <span className="p03-formal-sub">
                          {grant.ends_at
                            ? `Scheduled end: ${grant.ends_at}`
                            : 'Uses Target Alternate / End / Limit fields above'}
                        </span>
                        <div className="p02-compact-btn-group">
                          <button
                            type="button"
                            data-testid={`p02-amend-grant-${grant.id}`}
                            className="p02-compact-btn"
                            onClick={() =>
                              handleAmendGrant(grant.id, grant.membership_id, grant.version)
                            }
                          >
                            Amend Limit / Dates
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-end-grant-${grant.id}`}
                            className="p02-compact-btn"
                            onClick={() =>
                              handleEndGrant(grant.id, grant.membership_id, grant.version)
                            }
                          >
                            End Grant
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-substitute-${grant.id}`}
                            className="p02-compact-btn"
                            onClick={() =>
                              handleSubstituteGrant(grant.id, grant.membership_id, grant.version)
                            }
                          >
                            Assign Alternate Officer
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-revoke-grant-${grant.id}`}
                            className="p02-compact-btn is-subtle-danger"
                            onClick={() =>
                              handleRevokeGrant(grant.id, grant.membership_id, grant.version)
                            }
                          >
                            Revoke Grant
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p02-grant-form-heading">
                <div>
                  <h2 id="p02-grant-form-heading" className="p03-section-title">
                    Authorize New Duty Grant
                  </h2>
                  <p className="p03-muted-copy">
                    Assign one of the fourteen canonical operational chapter duties with optional unit scope or approval limit.
                  </p>
                </div>

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
                      <option value="">Select active officer</option>
                      {activeMembers.map((m) => (
                        <option key={m.membership_id} value={m.membership_id}>
                          {m.display_name} (ID: {formatSevenDigitUserId(m.user_id)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p02-grant-duty-select" className="form-label">
                        Operational Duty
                      </label>
                      <select
                        id="p02-grant-duty-select"
                        className="form-control"
                        value={grantDutyCode}
                        onChange={(e) => setGrantDutyCode(e.target.value)}
                      >
                        <option value="">Select operational duty</option>
                        {CANONICAL_CHAPTER_DUTIES.map((duty) => (
                          <option key={duty} value={duty}>
                            {formatTitleEnum(duty)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="p02-grant-scope-select" className="form-label">
                        Scope Level
                      </label>
                      <select
                        id="p02-grant-scope-select"
                        className="form-control"
                        value={grantScopeKind}
                        onChange={(e) => setGrantScopeKind(e.target.value as DutyGrantScopeKind)}
                      >
                        <option value="chapter">Chapter-Wide</option>
                        <option value="unit">Specific Requesting Unit</option>
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
                        className="form-control p03-mono-inline"
                        disabled={grantScopeKind !== 'unit'}
                        value={grantUnitId}
                        onChange={(e) => setGrantUnitId(e.target.value)}
                        placeholder="Requesting unit ID"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p02-grant-limit-input" className="form-label">
                        Monetary Limit (PHP)
                      </label>
                      <input
                        id="p02-grant-limit-input"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={grantMonetaryLimit}
                        onChange={(e) => setGrantMonetaryLimit(e.target.value)}
                        placeholder="0.00"
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
                      placeholder="Enter authorization justification"
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

              <section className="p03-card surface-card" aria-labelledby="p02-duty-summary-heading">
                <div className="p03-card-header-row">
                  <h2 id="p02-duty-summary-heading" className="p03-section-title">
                    Canonical Duty Coverage Overview
                  </h2>
                  <span className="p03-version-pill">
                    {distinctAssignedDutiesCount} / {CANONICAL_CHAPTER_DUTIES.length} duties staffed
                  </span>
                </div>
                <div className="p03-formal-grid">
                  <div className="p03-formal-cell">
                    <span className="p03-formal-key">ACTIVE GRANTS</span>
                    <span className="p03-formal-val">{activeGrants.length} Active</span>
                    <span className="p03-formal-sub">
                      {alternateGrantCount} alternate{alternateGrantCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="p03-formal-cell">
                    <span className="p03-formal-key">HEAD &amp; FINANCE GATE</span>
                    <span className="p03-formal-val">
                      {hasHeadAssigned && hasFinanceAssigned ? 'Both Active' : 'Incomplete'}
                    </span>
                    <span className="p03-formal-sub">Required chapter signers</span>
                  </div>
                  <div className="p03-formal-cell is-span-2">
                    <span className="p03-formal-key">SEGREGATION ENFORCEMENT</span>
                    <span className="p03-formal-val">Distinct Alternates Required</span>
                    <span className="p03-formal-sub">
                      Substitute duty grants reject assigning the same primary officer
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 3: Versioned Policies & Readiness Gates */}
        {activeTab === 'policies' ? (
          <>
            <section className="p03-card surface-card" aria-labelledby="p02-readiness-heading">
              <div className="p03-card-header-row">
                <div className="p03-state-title-group">
                  <h2 id="p02-readiness-heading" className="p03-section-title">
                    Chapter Operational Readiness Checklist
                  </h2>
                  <span className="p03-attention-badge" data-testid="p02-readiness-badge">
                    <span
                      className={`toast-dot ${
                        stageReady ? 'toast-dot-success' : 'toast-dot-warning'
                      }`}
                      aria-hidden="true"
                    />
                    <span>{stageReady ? 'Ready for Activation' : 'Setup Incomplete'}</span>
                  </span>
                </div>
                <span className="p03-version-pill">
                  {approvedPolicies.length} / {snapshot.chapter_policies.length} policies approved
                </span>
              </div>

              <div className="p03-formal-grid">
                <div className="p03-formal-cell">
                  <span className="p03-formal-key">OFFICER INDEPENDENCE</span>
                  <span className="p03-formal-val">
                    {activeMembers.length} / 2 Active Officers
                  </span>
                  <span className="p03-formal-sub">
                    {activeMembers.length >= 2 ? 'Requirement satisfied' : 'Minimum 2 officers needed'}
                  </span>
                </div>
                <div className="p03-formal-cell">
                  <span className="p03-formal-key">CHAPTER HEAD AUTHORITY</span>
                  <span className="p03-formal-val">
                    {hasHeadAssigned ? 'Assigned & Active' : 'Unassigned'}
                  </span>
                  <span className="p03-formal-sub">Approves operational policies</span>
                </div>
                <div className="p03-formal-cell">
                  <span className="p03-formal-key">FINANCE AUTHORITY</span>
                  <span className="p03-formal-val">
                    {hasFinanceAssigned ? 'Assigned & Active' : 'Unassigned'}
                  </span>
                  <span className="p03-formal-sub">Approves financial &amp; refund policies</span>
                </div>
                <div className="p03-formal-cell">
                  <span className="p03-formal-key">POLICY APPROVALS</span>
                  <span className="p03-formal-val">
                    {approvedPolicies.length} of {snapshot.chapter_policies.length} Approved
                  </span>
                  <span className="p03-formal-sub">
                    {allPoliciesApproved
                      ? 'All workflow gates cleared'
                      : 'Pending approval blocks affected commits'}
                  </span>
                </div>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-policies-heading">
              <div className="p02-policy-header-row">
                <div className="p02-policy-header-copy">
                  <h2 id="p02-policies-heading" className="p03-section-title">
                    Operational &amp; Financial Policy Governance
                  </h2>
                  <p className="p03-muted-copy">
                    Unapproved policies allow draft preparation while blocking final workflow commitments until signed off by Chapter Head (operational) or Finance Officer (financial).
                  </p>
                </div>

                <div className="form-group p02-policy-reason-inline">
                  <label htmlFor="p02-policy-reason-input" className="form-label">
                    Policy Review / Approval Reason
                  </label>
                  <input
                    id="p02-policy-reason-input"
                    type="text"
                    className="form-control"
                    value={policyReason}
                    placeholder="Enter review, submission, or approval reason"
                    onChange={(e) => setPolicyReason(e.target.value)}
                  />
                </div>
              </div>

              {filteredPolicies.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p02-empty-policies-notice">
                  {snapshot.chapter_state !== 'selected'
                    ? 'Select an authorized chapter to review operational and financial policies.'
                    : normalizedQuery
                      ? 'No policies match this search.'
                      : 'No chapter policies loaded for the selected chapter.'}
                </p>
              ) : null}

              <div className="p02-policies-grid">
                {filteredPolicies.map((policy) => {
                  const draftSummary = policySummaryEdits[policy.policy_id] ?? policy.summary;
                  const isApproved = policy.status === 'approved';
                  return (
                    <article
                      key={policy.policy_id}
                      className="p03-history-card"
                      data-testid={`p02-policy-${policy.policy_code}`}
                    >
                      <div className="p03-history-head">
                        <div className="p03-history-title-group">
                          <span className="p03-version-badge">
                            {policy.category === 'financial'
                              ? 'FINANCIAL POLICY'
                              : 'OPERATIONAL POLICY'}
                          </span>
                          <span className="p03-lineage-pill">
                            REQUIRES{' '}
                            {policy.category === 'financial'
                              ? 'FINANCE OFFICER'
                              : 'CHAPTER HEAD'}
                          </span>
                          <span
                            className={
                              isApproved ? 'p03-current-badge' : 'p03-superseded-badge'
                            }
                          >
                            <span
                              className={`toast-dot ${
                                isApproved ? 'toast-dot-success' : 'toast-dot-warning'
                              }`}
                              aria-hidden="true"
                            />
                            <span>
                              {isApproved
                                ? 'APPROVED · EFFECTIVE'
                                : policy.status === 'reviewed'
                                  ? 'REVIEWED · READY FOR APPROVAL'
                                  : policy.status === 'submitted'
                                    ? 'SUBMITTED · AWAITING APPROVAL'
                                    : policy.status === 'returned'
                                      ? 'RETURNED FOR REVISION'
                                      : 'DRAFT · PENDING APPROVAL'}
                            </span>
                          </span>
                        </div>
                        <div className="p03-version-badges">
                          <span className="p03-lineage-pill">ROW V{policy.row_version}</span>
                          <span className="p03-lineage-pill">
                            MATERIAL V{policy.material_version ?? 'DRAFT'}
                          </span>
                        </div>
                      </div>

                      <div className="p03-formal-grid">
                        <div className="p03-formal-cell is-span-2">
                          <span className="p03-formal-key">POLICY TITLE</span>
                          <span className="p03-formal-val">{policy.name}</span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">GOVERNED WORKFLOW</span>
                          <span className="p03-formal-val">{policy.workflow_affected}</span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">WORKFLOW COMMITMENT GATE</span>
                          <span className="p03-formal-val">
                            {isApproved
                              ? 'Cleared — Commitments Enabled'
                              : 'Blocked — Drafts Only Until Approved'}
                          </span>
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

                      <div className="p02-compact-actions">
                        <div className="p02-compact-btn-group">
                          <button
                            type="button"
                            data-testid={`p02-policy-draft-${policy.policy_code}`}
                            className="p02-compact-btn"
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
                            data-testid={`p02-policy-submit-${policy.policy_code}`}
                            className="p02-compact-btn"
                            onClick={() =>
                              handlePolicyAction(
                                policy.policy_id,
                                policy.row_version,
                                policy.material_version,
                                draftSummary,
                                'submit'
                              )
                            }
                          >
                            Submit Policy
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-policy-review-${policy.policy_code}`}
                            className="p02-compact-btn"
                            onClick={() =>
                              handlePolicyAction(
                                policy.policy_id,
                                policy.row_version,
                                policy.material_version,
                                draftSummary,
                                'review'
                              )
                            }
                          >
                            Review Policy
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-policy-return-${policy.policy_code}`}
                            className="p02-compact-btn"
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
                            Return for Revision
                          </button>
                          <button
                            type="button"
                            data-testid={`p02-gate-commit-${policy.policy_code}`}
                            className="p02-compact-btn"
                            onClick={() => handleEvaluateGate(policy.policy_code, 'commit')}
                          >
                            Verify Workflow Gate
                          </button>
                        </div>

                        <button
                          type="button"
                          data-testid={`p02-policy-approve-${policy.policy_code}`}
                          className={`p02-compact-btn ${isApproved ? '' : 'is-primary'}`}
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
                          {isApproved ? 'Re-Approve Version' : 'Approve Policy'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {/* TAB 4: Chapter Provisioning & Provider Controls */}
        {activeTab === 'provider' ? (
          <div className="p03-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-provider-heading">
              <div className="p03-card-header-row">
                <h2 id="p02-provider-heading" className="p03-section-title">
                  Chapter Provisioning &amp; Initial Head
                </h2>
              </div>
              <p className="p03-muted-copy">
                Creating a new chapter or designating its initial Chapter Head keeps provisioning separate from chapter operational access until explicitly activated.
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
                      className="form-control p03-mono-inline"
                      value={provCode}
                      placeholder="Chapter code"
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
                      placeholder="Chapter name"
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
                  Create Provisioned Chapter
                </button>
              </div>

              <div className="p03-guard-strip">
                <span className="p03-formal-key">APPOINT INITIAL CHAPTER HEAD</span>
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
                    <option value="">Select provisioned chapter</option>
                    {snapshot.provisioned_chapters.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.chapter_code} &mdash; {prov.chapter_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-appoint-head-id-input" className="form-label">
                      Head User ID
                    </label>
                    <div className="p03-input-action-row">
                      <input
                        id="p02-appoint-head-id-input"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={appointHeadId}
                        placeholder="User ID"
                        onChange={(e) => {
                          setAppointHeadId(e.target.value);
                          setProvIdentityNotice(null);
                        }}
                      />
                      <button
                        type="button"
                        id="p02-lookup-prov-identity-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleLookupProvisioningIdentity}
                      >
                        Lookup
                      </button>
                    </div>
                    {provIdentityNotice ? (
                      <span className="p03-formal-sub" data-testid="p02-prov-identity-notice">
                        {provIdentityNotice}
                      </span>
                    ) : null}
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
                      placeholder="Full name"
                      onChange={(e) => setAppointHeadName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="p02-appoint-reason-input" className="form-label">
                    Designation Justification
                  </label>
                  <input
                    id="p02-appoint-reason-input"
                    type="text"
                    className="form-control"
                    value={appointReason}
                    placeholder="Enter designation reason"
                    onChange={(e) => setAppointReason(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  id="p02-appoint-head-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAppointInitialHead}
                >
                  Appoint Initial Chapter Head
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-global-disable-heading">
              <div>
                <h2 id="p02-global-disable-heading" className="p03-section-title">
                  Global Account Disable Control
                </h2>
                <p className="p03-muted-copy">
                  Organization-wide identity suspension is disabled under current platform policy. Suspend or revoke officer access within each individual chapter roster instead.
                </p>
              </div>

              <div className="form-stack">
                <div className="form-group">
                  <label htmlFor="p02-global-disable-user-input" className="form-label">
                    Target Account Reference ID
                  </label>
                  <input
                    id="p02-global-disable-user-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={globalDisableUserId}
                    placeholder="Target user ID"
                    onChange={(e) => setGlobalDisableUserId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p02-global-disable-reason-input" className="form-label">
                    Request Reason
                  </label>
                  <input
                    id="p02-global-disable-reason-input"
                    type="text"
                    className="form-control"
                    value={globalDisableReason}
                    placeholder="Enter request reason"
                    onChange={(e) => setGlobalDisableReason(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  id="p02-global-disable-btn"
                  className="btn-batcave-secondary"
                  onClick={handleGlobalDisableBoundary}
                >
                  Check Global Disable Availability
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
                      HTTP {globalDisableResult.status} &middot; Outcome:{' '}
                      {globalDisableResult.original_outcome.toUpperCase()} &middot; Status:{' '}
                      {globalDisableResult.next_action.toUpperCase()}
                    </strong>
                    <div>{globalDisableResult.message}</div>
                  </div>
                </div>
              ) : null}

              <div className="p03-guard-strip">
                <span className="p03-formal-key">
                  PROVISIONED CHAPTERS ({filteredProvisioned.length})
                </span>
                {filteredProvisioned.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p02-empty-provisioned-notice">
                    {normalizedQuery
                      ? 'No provisioned chapters match this search.'
                      : 'No provisioned chapters created yet.'}
                  </p>
                ) : null}
                <div className="p03-history-list">
                  {filteredProvisioned.map((p) => (
                    <div key={p.id} className="p03-compare-col">
                      <div className="p03-compare-row">
                        <strong>
                          {p.chapter_code} &mdash; {p.chapter_name}
                        </strong>
                        <UserIdCopyPill
                          userId={p.initial_head_user_id ?? p.provider_user_id}
                          pillKey={`prov-${p.id}`}
                          copiedKey={copiedUserKey}
                          onCopy={handleCopyUserId}
                          testId={`p02-prov-uid-${p.id}`}
                        />
                      </div>
                      <span className="p03-formal-sub">
                        Initial Head: {p.initial_head_name ?? 'Pending Assignment'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {snapshot.audit_log.length > 0 && (
                <div className="p03-guard-strip" data-testid="p02-audit-log">
                  <span className="p03-formal-key">
                    RECENT GOVERNANCE AUDIT LOG ({snapshot.audit_log.length})
                  </span>
                  <div className="p03-history-list">
                    {snapshot.audit_log.slice(0, 4).map((ev) => (
                      <div key={ev.id} className="p03-compare-col">
                        <div className="p03-compare-row">
                          <strong>{ev.code}</strong>
                          <span className="p03-formal-sub">{ev.actor_name}</span>
                        </div>
                        <span className="p03-formal-sub">{ev.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 5: Scoped Durable Operation Lookup */}
        {activeTab === 'lookup' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p02-lookup-heading">
              <div>
                <h2 id="p02-lookup-heading" className="p03-section-title">
                  Scoped Durable Operation Lookup
                </h2>
                <p className="p03-muted-copy">
                  Recover previously committed or rejected chapter, provider provisioning, or global disable mutations by idempotency key or operation ULID. Uncommitted keys fail closed as pending or not visible.
                </p>
              </div>

              <div className="form-stack">
                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p02-lookup-scope" className="form-label">
                      Operation Scope
                    </label>
                    <select
                      id="p02-lookup-scope"
                      className="form-control"
                      value={lookupScope}
                      onChange={(e) => setLookupScope(e.target.value as P02OperationScope)}
                    >
                      <option value="chapter">Chapter Administration (chapter)</option>
                      <option value="provider">Provider Provisioning (provider)</option>
                      <option value="global_disable">Global Identity Disable (global_disable)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p02-lookup-action" className="form-label">
                      Canonical Action Code
                    </label>
                    <input
                      id="p02-lookup-action"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupActionCode}
                      placeholder="e.g. duty_grants.authorize"
                      onChange={(e) => setLookupActionCode(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p02-lookup-key-input" className="form-label">
                    Lookup by Idempotency-Key (Requires Scope + Action Code)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p02-lookup-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupKeyInput}
                      placeholder="Idempotency key"
                      onChange={(e) => setLookupKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p02-lookup-by-key-btn"
                      className="btn-batcave-primary p03-shrink-btn"
                      onClick={handleLookupOperationByKey}
                    >
                      Lookup by Key
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="p02-lookup-ulid-input" className="form-label">
                    Lookup by Operation ULID
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p02-lookup-ulid-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={lookupOpIdInput}
                      placeholder="Operation ID"
                      onChange={(e) => setLookupOpIdInput(e.target.value)}
                    />
                    <button
                      type="button"
                      id="p02-lookup-by-ulid-btn"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={handleLookupOperationById}
                    >
                      Lookup by ID
                    </button>
                  </div>
                </div>

                {lookupResult ? (
                  <div
                    className={`callout-banner ${lookupResult.ok ? '' : 'is-error'}`}
                    data-testid="p02-lookup-result"
                    aria-live="polite"
                  >
                    <span
                      className={`callout-dot ${lookupResult.ok ? 'dot-success' : 'dot-error'}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        {lookupResult.code} (HTTP {lookupResult.status})
                      </strong>
                      <div>{lookupResult.message}</div>
                      {lookupResult.data ? (
                        <div className="p03-formal-sub p03-mono-inline">
                          Op: {lookupResult.data.operation_id} &middot;{' '}
                          {lookupResult.data.action_code} &middot; Key:{' '}
                          {lookupResult.data.idempotency_key} &middot; Outcome:{' '}
                          {lookupResult.data.outcome}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p02-ledger-heading">
              <div className="p03-card-header-row">
                <h2 id="p02-ledger-heading" className="p03-section-title">
                  Session Operation Ledger ({filteredOperations.length})
                </h2>
              </div>

              {filteredOperations.length === 0 ? (
                <div className="p03-empty-state">
                  <div className="p03-empty-title">No Durable Operations Recorded Yet</div>
                  <p className="p03-muted-copy">
                    Execute any chapter, duty grant, policy, or provisioning mutation to populate the scoped durable operation ledger for recovery verification.
                  </p>
                </div>
              ) : (
                <div className="p03-history-list" data-testid="p02-operation-ledger">
                  {filteredOperations.map((op) => (
                    <div key={op.operation_id} className="p03-compare-col">
                      <div className="p03-compare-row">
                        <strong className="p03-mono-inline">{op.action_code}</strong>
                        <span className="p03-formal-sub">
                          {op.outcome} &middot; {op.code}
                        </span>
                      </div>
                      <div className="p03-formal-sub p03-mono-inline">
                        Scope: {op.scope} &middot; Key: {op.idempotency_key}
                      </div>
                      <div className="p03-compare-row">
                        <span className="p03-formal-sub p03-mono-inline">
                          ID: {op.operation_id}
                        </span>
                        <button
                          type="button"
                          data-testid={`p02-ledger-fill-${op.operation_id}`}
                          className="p02-compact-btn"
                          onClick={() => {
                            playClickPen(soundEnabled);
                            setLookupScope(op.scope);
                            setLookupActionCode(op.action_code);
                            setLookupKeyInput(op.idempotency_key);
                            setLookupOpIdInput(op.operation_id);
                          }}
                        >
                          Use Selector
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
