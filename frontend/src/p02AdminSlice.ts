import { computeDeterministicHash } from './p03RecordSlice';
import type { DutyCode } from './p03RecordSlice';

export const CANONICAL_CHAPTER_DUTIES: ReadonlyArray<DutyCode> = [
  'COMMITTEE_REQUESTER',
  'RF_APPROVER',
  'SALES_OFFICER',
  'SALES_REVIEWER',
  'FINANCE',
  'INVENTORY',
  'PURCHASING',
  'BUDGET_APPROVER',
  'RECEIVING',
  'DISPATCH',
  'BOOTH_CUSTODIAN',
  'BOOTH_CASHIER',
  'INDEPENDENT_REVIEWER',
  'CHAPTER_HEAD',
];

export type ProviderAuthority = 'provisioner' | 'billing_admin' | 'recovery_operator';
export type ChapterSelectionState =
  | 'no_authorized_memberships'
  | 'selection_required'
  | 'selected';
export type DutyGrantScopeKind = 'chapter' | 'unit';
export type PolicyCategory = 'operational' | 'financial';
export type PolicyLifecycleStatus =
  | 'missing'
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'returned';

export interface PostedMoney {
  currency: 'PHP';
  amount: string;
}

export interface ChapterInfo {
  id: string;
  code: string;
  name: string;
}

export interface P02Persona {
  key: string;
  user_id: string;
  display_name: string;
  email: string;
  provider_roles: ReadonlyArray<ProviderAuthority>;
}

export interface ChapterMembershipSummary {
  membership_id: string;
  chapter_id: string;
  chapter_code: string;
  chapter_name: string;
  user_id: string;
  display_name: string;
  email: string;
  status: 'active' | 'disabled' | 'revoked';
  version: number;
  active_sessions: number;
}

export interface AdminDutyGrant {
  id: string;
  chapter_id: string;
  membership_id: string;
  user_id: string;
  officer_name: string;
  duty_code: DutyCode;
  scope_kind: DutyGrantScopeKind;
  requesting_unit_id: string | null;
  monetary_limit: PostedMoney | null;
  starts_at: string;
  ends_at: string | null;
  revoked_at: string | null;
  version: number;
  alternate_for_grant_id: string | null;
}

export interface PolicyRecordItem {
  policy_id: string;
  chapter_id: string;
  category: PolicyCategory;
  policy_code: string;
  name: string;
  status: PolicyLifecycleStatus;
  row_version: number;
  material_version: number | null;
  material_hash: string | null;
  summary: string;
  workflow_affected: string;
  approved_by_duty: DutyCode | null;
  effective_from: string | null;
  last_reason: string | null;
}

export interface ProvisionedChapterRecord {
  id: string;
  organization_id: string;
  provider_user_id: string;
  chapter_code: string;
  chapter_name: string;
  version: number;
  initial_head_user_id: string | null;
  initial_head_name: string | null;
  initial_head_membership_authorization: 'not_applicable';
}

export interface GlobalDisableBoundaryFeedback {
  status: 503;
  original_outcome: 'uncertain';
  next_action: 'unavailable';
  message: string;
}

export interface P02ActionResult<T = undefined> {
  ok: boolean;
  status: 200 | 400 | 403 | 409 | 422 | 503;
  code: string;
  message: string;
  authority_version?: number | undefined;
  revoked_sessions_count?: number | undefined;
  permitted_draft?: boolean | undefined;
  required_duty?: DutyCode | undefined;
  link_screen?: 'S-01' | 'S-21' | 'S-22' | undefined;
  data?: T | undefined;
}

export interface P02AuditEvent {
  id: string;
  timestamp: string;
  actor_name: string;
  code: string;
  summary: string;
}

export interface P02Snapshot {
  active_persona: P02Persona;
  available_personas: ReadonlyArray<P02Persona>;
  all_chapters: ReadonlyArray<ChapterInfo>;
  authorized_memberships_for_user: ReadonlyArray<ChapterMembershipSummary>;
  selected_chapter_id: string | null;
  selected_chapter_name: string | null;
  chapter_state: ChapterSelectionState;
  next_action: 'no_chapter_work' | 'select_chapter' | 'review_current_actions';
  authority_version: number;
  provider_authority_version: number;
  active_user_duties: ReadonlyArray<DutyCode>;
  chapter_memberships: ReadonlyArray<ChapterMembershipSummary>;
  chapter_duty_grants: ReadonlyArray<AdminDutyGrant>;
  chapter_policies: ReadonlyArray<PolicyRecordItem>;
  provisioned_chapters: ReadonlyArray<ProvisionedChapterRecord>;
  audit_log: ReadonlyArray<P02AuditEvent>;
}

export interface AuthorizeMembershipInput {
  chapter_id?: string | undefined;
  user_id: string;
  display_name: string;
  email: string;
  expected_authority_version: number;
  expected_membership_version: null;
  reason: string;
}

export interface DisableOrRevokeMembershipInput {
  chapter_id?: string | undefined;
  membership_id: string;
  action: 'disabled' | 'revoked';
  expected_authority_version: number;
  expected_membership_version: number;
  reason: string;
}

export interface AuthorizeDutyGrantInput {
  chapter_id?: string | undefined;
  membership_id: string;
  duty_code: string;
  scope_kind: DutyGrantScopeKind;
  requesting_unit_id: string | null;
  monetary_limit: PostedMoney | null;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: null;
  reason: string;
}

export interface SubstituteDutyGrantInput {
  chapter_id?: string | undefined;
  grant_id: string;
  alternate_membership_id: string;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface RevokeDutyGrantInput {
  chapter_id?: string | undefined;
  grant_id: string;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface SavePolicyDraftInput {
  chapter_id?: string | undefined;
  policy_id: string;
  summary: string;
  expected_authority_version: number;
  expected_row_version: number;
  expected_material_version: number | null;
  reason: string;
}

export interface ReviewPolicyVersionInput {
  chapter_id?: string | undefined;
  policy_id: string;
  expected_authority_version: number;
  expected_row_version: number;
  expected_material_version: number | null;
  reason: string;
}

export interface CreateProvisionedChapterInput {
  chapter_code: string;
  chapter_name: string;
  expected_provider_authority_version: number;
}

export interface AppointInitialHeadInput {
  provisioning_id: string;
  initial_head_user_id: string;
  initial_head_name: string;
  expected_provider_authority_version: number;
  expected_provisioning_version: number;
  reason: string;
}

export interface GlobalDisableAttemptInput {
  user_id: string;
  expected_identity_version: number;
  reason: string;
}

export function chapterNextAction(
  chapterState: ChapterSelectionState
): 'no_chapter_work' | 'select_chapter' | 'review_current_actions' {
  switch (chapterState) {
    case 'no_authorized_memberships':
      return 'no_chapter_work';
    case 'selection_required':
      return 'select_chapter';
    case 'selected':
      return 'review_current_actions';
  }
}

export function chapterScopeMatches(params: {
  chapter_state: ChapterSelectionState;
  context_chapter_id?: string | undefined;
  context_chapter_name?: string | undefined;
  context_membership_id?: string | undefined;
  context_user_id?: string | undefined;
  membership_chapter_id?: string | undefined;
  membership_chapter_name?: string | undefined;
  membership_id?: string | undefined;
  session_user_id: string;
  requested_chapter_id?: string | undefined;
}): boolean {
  if (params.chapter_state !== 'selected') {
    return params.requested_chapter_id === undefined;
  }
  return (
    (params.requested_chapter_id === undefined ||
      params.context_chapter_id === params.requested_chapter_id) &&
    params.context_chapter_id === params.membership_chapter_id &&
    params.context_chapter_name === params.membership_chapter_name &&
    params.context_membership_id === params.membership_id &&
    params.context_user_id === params.session_user_id
  );
}

const VALID_PHP_AMOUNT_RE = /^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/;
const VALID_CHAPTER_CODE_RE = /^[A-Z0-9_-]{2,16}$/;

function nowUtcSix(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, (ms) => `${ms.slice(0, 4)}000Z`);
}

function isCanonicalDuty(code: string): code is DutyCode {
  return (CANONICAL_CHAPTER_DUTIES as ReadonlyArray<string>).includes(code);
}

const INITIAL_PERSONAS: ReadonlyArray<P02Persona> = [
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
];

const INITIAL_CHAPTERS: ReadonlyArray<ChapterInfo> = [
  { id: '1', code: 'CEB-01', name: 'YSP Cebu Chapter' },
  { id: '2', code: 'MNL-02', name: 'YSP Manila Chapter' },
];

export interface P02AdminEngine {
  getSnapshot: () => P02Snapshot;
  selectPersona: (personaKey: string) => P02ActionResult<P02Snapshot>;
  selectChapter: (chapterId: string | null) => P02ActionResult<P02Snapshot>;
  authorizeMembership: (input: AuthorizeMembershipInput) => P02ActionResult<ChapterMembershipSummary>;
  disableOrRevokeMembership: (
    input: DisableOrRevokeMembershipInput
  ) => P02ActionResult<ChapterMembershipSummary>;
  authorizeDutyGrant: (input: AuthorizeDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  substituteDutyGrant: (input: SubstituteDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  revokeDutyGrant: (input: RevokeDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  savePolicyDraft: (input: SavePolicyDraftInput) => P02ActionResult<PolicyRecordItem>;
  approvePolicyVersion: (input: ReviewPolicyVersionInput) => P02ActionResult<PolicyRecordItem>;
  returnPolicyVersion: (input: ReviewPolicyVersionInput) => P02ActionResult<PolicyRecordItem>;
  evaluateWorkflowGate: (policyCode: string, mode: 'draft' | 'commit') => P02ActionResult;
  createProvisionedChapter: (
    input: CreateProvisionedChapterInput
  ) => P02ActionResult<ProvisionedChapterRecord>;
  appointInitialHead: (
    input: AppointInitialHeadInput
  ) => P02ActionResult<ProvisionedChapterRecord>;
  attemptGlobalIdentityDisable: (input: GlobalDisableAttemptInput) => GlobalDisableBoundaryFeedback;
}

export function createP02AdminEngine(): P02AdminEngine {
  const chapters: ChapterInfo[] = INITIAL_CHAPTERS.map((c) => ({ ...c }));
  const authorityVersionByChapter = new Map<string, number>([
    ['1', 3],
    ['2', 2],
  ]);
  let providerAuthorityVersion = 5;
  let activePersonaKey = 'head_21';
  let selectedChapterId: string | null = '1';
  let nextSeq = 400;

  const memberships: ChapterMembershipSummary[] = [
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
  ];

  const grants: AdminDutyGrant[] = [
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
    {
      id: '2001',
      chapter_id: '2',
      membership_id: '212',
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
  ];

  const policies: PolicyRecordItem[] = [
    {
      policy_id: 'pol-op-1',
      chapter_id: '1',
      category: 'operational',
      policy_code: 'ITEM_CATALOGUE_UNIT_POLICY',
      name: 'Item Catalogue, Unit Precision & Custody Rules',
      status: 'approved',
      row_version: 2,
      material_version: 1,
      material_hash: computeDeterministicHash({ code: 'ITEM_CATALOGUE_UNIT_POLICY', v: 1 }),
      summary: 'Allowed unit scales 0..6, SKU variant uniqueness, and default stockroom custody.',
      workflow_affected: 'S-08 Item Catalogue & Inventory Eligibility',
      approved_by_duty: 'CHAPTER_HEAD',
      effective_from: '2026-10-23T00:00:00.000000Z',
      last_reason: 'Approved for Stage 1 catalogue readiness.',
    },
    {
      policy_id: 'pol-op-2',
      chapter_id: '1',
      category: 'operational',
      policy_code: 'OPENING_CUTOFF_POLICY',
      name: 'Opening Count Cutoff & Two-Counter Independence Policy',
      status: 'approved',
      row_version: 2,
      material_version: 1,
      material_hash: computeDeterministicHash({ code: 'OPENING_CUTOFF_POLICY', v: 1 }),
      summary: 'Requires two counters (at least one independent of regular custody) and Head/Finance signatures.',
      workflow_affected: 'P06 IPC → RM Opening Baseline',
      approved_by_duty: 'CHAPTER_HEAD',
      effective_from: '2026-10-23T00:00:00.000000Z',
      last_reason: 'Approved for Stage 1 opening count walkthrough.',
    },
    {
      policy_id: 'pol-op-3',
      chapter_id: '1',
      category: 'operational',
      policy_code: 'QUOTATION_EMERGENCY_POLICY',
      name: 'Comparable Quotation & Emergency Purchase Policy',
      status: 'draft',
      row_version: 1,
      material_version: 1,
      material_hash: computeDeterministicHash({ code: 'QUOTATION_EMERGENCY_POLICY', v: 1 }),
      summary: 'Requires 3 comparable quotes above PHP 2,500 unless emergency waiver approved.',
      workflow_affected: 'PRC-05 PO Issuance (Stage 2 Purchasing)',
      approved_by_duty: null,
      effective_from: null,
      last_reason: null,
    },
    {
      policy_id: 'pol-fin-1',
      chapter_id: '1',
      category: 'financial',
      policy_code: 'OFFICIAL_PAYMENT_ACCOUNT_POLICY',
      name: 'Official Chapter Receipt & Verified GCash Account Policy',
      status: 'approved',
      row_version: 2,
      material_version: 1,
      material_hash: computeDeterministicHash({ code: 'OFFICIAL_PAYMENT_ACCOUNT_POLICY', v: 1 }),
      summary: 'Restricts verified collections to registered chapter bank/GCash accounts with unique reference numbers.',
      workflow_affected: 'PAY-01..07 Payment Verification & OR Issuance',
      approved_by_duty: 'FINANCE',
      effective_from: '2026-10-23T00:00:00.000000Z',
      last_reason: 'Finance verified official collection accounts.',
    },
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
      summary: 'Governs Finance-approved refunds, unequal replacement credits, and PHP 0.01 rounding.',
      workflow_affected: 'ADJ-07 Refund Execution & Unequal Replacement',
      approved_by_duty: null,
      effective_from: null,
      last_reason: null,
    },
    {
      policy_id: 'pol-op-m2',
      chapter_id: '2',
      category: 'operational',
      policy_code: 'OPENING_CUTOFF_POLICY',
      name: 'Opening Count Cutoff & Two-Counter Independence Policy',
      status: 'approved',
      row_version: 2,
      material_version: 1,
      material_hash: computeDeterministicHash({ code: 'OPENING_CUTOFF_POLICY_M2', v: 1 }),
      summary: 'Manila chapter approved opening baseline policy.',
      workflow_affected: 'P06 IPC → RM Opening Baseline',
      approved_by_duty: 'CHAPTER_HEAD',
      effective_from: '2026-10-23T00:00:00.000000Z',
      last_reason: 'Manila Head sign-off.',
    },
  ];

  const provisionedChapters: ProvisionedChapterRecord[] = [
    {
      id: 'prov-1',
      organization_id: 'org-ysp-ph',
      provider_user_id: '90',
      chapter_code: 'CEB-01',
      chapter_name: 'YSP Cebu Chapter',
      version: 2,
      initial_head_user_id: '21',
      initial_head_name: 'Laurence Parojinog',
      initial_head_membership_authorization: 'not_applicable',
    },
  ];

  const auditLog: P02AuditEvent[] = [];

  function pushAudit(actorName: string, code: string, summary: string) {
    nextSeq += 1;
    auditLog.unshift({
      id: String(nextSeq),
      timestamp: nowUtcSix(),
      actor_name: actorName,
      code,
      summary,
    });
  }

  function getActivePersona(): P02Persona {
    return (
      INITIAL_PERSONAS.find((p) => p.key === activePersonaKey) ??
      (INITIAL_PERSONAS[0] as P02Persona)
    );
  }

  function getAuthorizedMembershipsFor(userId: string): ChapterMembershipSummary[] {
    return memberships
      .filter((m) => m.user_id === userId && m.status === 'active')
      .map((m) => ({ ...m }));
  }

  function resolveChapterState(): {
    state: ChapterSelectionState;
    selectedId: string | null;
    duties: DutyCode[];
  } {
    const user = getActivePersona();
    const userMemberships = getAuthorizedMembershipsFor(user.user_id);
    if (userMemberships.length === 0) {
      return { state: 'no_authorized_memberships', selectedId: null, duties: [] };
    }
    if (
      selectedChapterId !== null &&
      userMemberships.some((m) => m.chapter_id === selectedChapterId)
    ) {
      const myMembership = userMemberships.find((m) => m.chapter_id === selectedChapterId);
      const duties = myMembership
        ? grants
            .filter(
              (g) =>
                g.chapter_id === selectedChapterId &&
                g.membership_id === myMembership.membership_id &&
                g.revoked_at === null
            )
            .map((g) => g.duty_code)
        : [];
      return { state: 'selected', selectedId: selectedChapterId, duties };
    }
    return { state: 'selection_required', selectedId: null, duties: [] };
  }

  function getSnapshot(): P02Snapshot {
    const user = getActivePersona();
    const { state, selectedId, duties } = resolveChapterState();
    const selectedChapter = chapters.find((c) => c.id === selectedId) ?? null;

    // Provider-only or unselected sessions NEVER expose chapter operational rows
    const canViewChapterRows = state === 'selected' && selectedId !== null;
    const chapterMemberships = canViewChapterRows
      ? memberships.filter((m) => m.chapter_id === selectedId).map((m) => ({ ...m }))
      : [];
    const chapterGrants = canViewChapterRows
      ? grants
          .filter((g) => g.chapter_id === selectedId)
          .map((g) => ({
            ...g,
            monetary_limit: g.monetary_limit ? { ...g.monetary_limit } : null,
          }))
      : [];
    const chapterPolicies = canViewChapterRows
      ? policies.filter((p) => p.chapter_id === selectedId).map((p) => ({ ...p }))
      : [];

    const authVer = selectedId ? (authorityVersionByChapter.get(selectedId) ?? 1) : 0;

    return {
      active_persona: { ...user, provider_roles: [...user.provider_roles] },
      available_personas: INITIAL_PERSONAS.map((p) => ({
        ...p,
        provider_roles: [...p.provider_roles],
      })),
      all_chapters: chapters.map((c) => ({ ...c })),
      authorized_memberships_for_user: getAuthorizedMembershipsFor(user.user_id),
      selected_chapter_id: selectedId,
      selected_chapter_name: selectedChapter?.name ?? null,
      chapter_state: state,
      next_action: chapterNextAction(state),
      authority_version: authVer,
      provider_authority_version: providerAuthorityVersion,
      active_user_duties: duties,
      chapter_memberships: chapterMemberships,
      chapter_duty_grants: chapterGrants,
      chapter_policies: chapterPolicies,
      provisioned_chapters: provisionedChapters.map((p) => ({ ...p })),
      audit_log: auditLog.map((a) => ({ ...a })),
    };
  }

  function ensureChapterAuthority(
    requestedChapterId: string | undefined,
    requiredDuty?: DutyCode
  ):
    | { ok: true; chapterId: string; user: P02Persona; duties: DutyCode[]; authVersion: number }
    | { ok: false; result: P02ActionResult<never> } {
    const user = getActivePersona();
    const { state, selectedId, duties } = resolveChapterState();

    if (user.provider_roles.length > 0 && state === 'no_authorized_memberships') {
      return {
        ok: false,
        result: {
          ok: false,
          status: 403,
          code: 'PROVIDER_ONLY_NO_CHAPTER_ACCESS',
          message:
            'Provider role alone grants zero operational chapter access (ADD-AC-09). Authorize a separate active chapter membership first.',
          link_screen: 'S-21',
        },
      };
    }

    const targetChapter = requestedChapterId ?? selectedId;
    if (!targetChapter || state !== 'selected' || targetChapter !== selectedId) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 403,
          code: 'CROSS_CHAPTER_FORBIDDEN',
          message: 'Unauthorized or cross-chapter request rejected and redacted (AC-19).',
          link_screen: 'S-01',
        },
      };
    }

    if (requiredDuty && !duties.includes(requiredDuty)) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 403,
          code: 'DUTY_AUTHORITY_REQUIRED',
          message: `Action requires active ${requiredDuty} grant in ${targetChapter}.`,
          required_duty: requiredDuty,
          link_screen: 'S-21',
        },
      };
    }

    const authVersion = authorityVersionByChapter.get(targetChapter) ?? 1;
    return { ok: true, chapterId: targetChapter, user, duties, authVersion };
  }

  function selectPersona(personaKey: string): P02ActionResult<P02Snapshot> {
    const target = INITIAL_PERSONAS.find((p) => p.key === personaKey);
    if (!target) {
      return {
        ok: false,
        status: 400,
        code: 'UNKNOWN_PERSONA',
        message: 'Unknown actor persona requested.',
      };
    }
    activePersonaKey = target.key;
    const myMemberships = getAuthorizedMembershipsFor(target.user_id);
    if (myMemberships.length === 0) {
      selectedChapterId = null;
    } else if (
      selectedChapterId === null ||
      !myMemberships.some((m) => m.chapter_id === selectedChapterId)
    ) {
      selectedChapterId = myMemberships[0]?.chapter_id ?? null;
    }

    const snap = getSnapshot();
    pushAudit(
      target.display_name,
      'SESSION_PERSONA_SWITCHED',
      `Active identity: ${target.display_name} (${snap.chapter_state})`
    );
    return {
      ok: true,
      status: 200,
      code: 'PERSONA_SELECTED',
      message: `Switched identity to ${target.display_name}.`,
      authority_version: snap.authority_version,
      data: snap,
    };
  }

  function selectChapter(chapterId: string | null): P02ActionResult<P02Snapshot> {
    const user = getActivePersona();
    if (chapterId === null || chapterId === '') {
      selectedChapterId = null;
      return {
        ok: true,
        status: 200,
        code: 'CHAPTER_CLEARED',
        message: 'Cleared chapter selection.',
        data: getSnapshot(),
      };
    }

    const myMemberships = getAuthorizedMembershipsFor(user.user_id);
    if (myMemberships.length === 0 && user.provider_roles.length > 0) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_ONLY_NO_CHAPTER_ACCESS',
        message:
          'Provider authority cannot select or read chapter operations without a separate approved chapter membership (ADD-AC-09).',
        link_screen: 'S-21',
      };
    }

    const match = myMemberships.find((m) => m.chapter_id === chapterId);
    if (!match) {
      return {
        ok: false,
        status: 403,
        code: 'CROSS_CHAPTER_FORBIDDEN',
        message: `Access denied: ${user.display_name} holds no active membership in Chapter ${chapterId} (AC-19).`,
        link_screen: 'S-01',
      };
    }

    selectedChapterId = match.chapter_id;
    const snap = getSnapshot();
    pushAudit(
      user.display_name,
      'CHAPTER_SELECTED',
      `Selected Chapter ${match.chapter_code} (${match.chapter_name})`
    );
    return {
      ok: true,
      status: 200,
      code: 'CHAPTER_SELECTED',
      message: `Selected ${match.chapter_name}.`,
      authority_version: snap.authority_version,
      data: snap,
    };
  }

  function authorizeMembership(
    input: AuthorizeMembershipInput
  ): P02ActionResult<ChapterMembershipSummary> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: `Authority version changed (expected v${input.expected_authority_version}, current v${auth.authVersion}).`,
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Provide an authorization reason.',
      };
    }
    if (!input.user_id.trim() || !input.display_name.trim() || !input.email.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'User ID, display name, and email are required.',
      };
    }

    const existing = memberships.find(
      (m) => m.chapter_id === auth.chapterId && m.user_id === input.user_id.trim()
    );
    if (existing && existing.status === 'active') {
      return {
        ok: false,
        status: 409,
        code: 'MEMBERSHIP_ALREADY_ACTIVE',
        message: `${existing.display_name} already holds an active membership in this chapter.`,
      };
    }

    const chapter = chapters.find((c) => c.id === auth.chapterId);
    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    let resultRecord: ChapterMembershipSummary;
    if (existing) {
      existing.status = 'active';
      existing.version += 1;
      existing.active_sessions = 1;
      resultRecord = { ...existing };
    } else {
      nextSeq += 1;
      resultRecord = {
        membership_id: String(nextSeq),
        chapter_id: auth.chapterId,
        chapter_code: chapter?.code ?? `CHP-${auth.chapterId}`,
        chapter_name: chapter?.name ?? `Chapter ${auth.chapterId}`,
        user_id: input.user_id.trim(),
        display_name: input.display_name.trim(),
        email: input.email.trim().toLowerCase(),
        status: 'active',
        version: 1,
        active_sessions: 1,
      };
      memberships.push(resultRecord);
    }

    pushAudit(
      auth.user.display_name,
      'MEMBERSHIP_AUTHORIZED',
      `Authorized membership for ${resultRecord.display_name} (user ${resultRecord.user_id}) in ${resultRecord.chapter_code}: ${input.reason.trim()}`
    );

    return {
      ok: true,
      status: 200,
      code: 'MEMBERSHIP_AUTHORIZED',
      message: `Authorized chapter membership for ${resultRecord.display_name}.`,
      authority_version: nextAuth,
      data: { ...resultRecord },
    };
  }

  function disableOrRevokeMembership(
    input: DisableOrRevokeMembershipInput
  ): P02ActionResult<ChapterMembershipSummary> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: `Authority version changed (expected v${input.expected_authority_version}, current v${auth.authVersion}).`,
      };
    }

    const target = memberships.find(
      (m) => m.chapter_id === auth.chapterId && m.membership_id === input.membership_id
    );
    if (!target) {
      return {
        ok: false,
        status: 403,
        code: 'CROSS_CHAPTER_FORBIDDEN',
        message: 'Target membership does not belong to the authorized chapter.',
      };
    }

    if (input.expected_membership_version !== target.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_MEMBERSHIP_VERSION',
        message: `Membership version changed (expected v${input.expected_membership_version}, current v${target.version}).`,
      };
    }

    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Provide a reason before disabling or revoking chapter membership.',
      };
    }

    if (target.user_id === auth.user.user_id) {
      const otherActiveHead = memberships.some(
        (m) =>
          m.chapter_id === auth.chapterId &&
          m.status === 'active' &&
          m.membership_id !== target.membership_id &&
          grants.some(
            (g) =>
              g.membership_id === m.membership_id &&
              g.duty_code === 'CHAPTER_HEAD' &&
              g.revoked_at === null
          )
      );
      if (!otherActiveHead) {
        return {
          ok: false,
          status: 409,
          code: 'SOLE_HEAD_SELF_REVOKE_FORBIDDEN',
          message: 'Sole active Chapter Head cannot self-disable or self-revoke without an alternate Head.',
        };
      }
    }

    const revokedSessions = target.active_sessions;
    target.status = input.action;
    target.active_sessions = 0;
    target.version += 1;

    const revokedAt = nowUtcSix();
    for (const grant of grants) {
      if (grant.membership_id === target.membership_id && grant.revoked_at === null) {
        grant.revoked_at = revokedAt;
        grant.version += 1;
      }
    }

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    const code = input.action === 'disabled' ? 'MEMBERSHIP_DISABLED' : 'MEMBERSHIP_REVOKED';
    pushAudit(
      auth.user.display_name,
      code,
      `${input.action.toUpperCase()} ${target.display_name} (revoked ${revokedSessions} session(s)): ${input.reason.trim()}`
    );

    return {
      ok: true,
      status: 200,
      code,
      message: `${target.display_name} membership ${input.action}; ${revokedSessions} active session(s) revoked.`,
      authority_version: nextAuth,
      revoked_sessions_count: revokedSessions,
      data: { ...target },
    };
  }

  function authorizeDutyGrant(input: AuthorizeDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    if (!isCanonicalDuty(input.duty_code)) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_CHAPTER_DUTY',
        message: `"${input.duty_code}" is not one of the 14 canonical chapter duties (provider authorities cannot be assigned as chapter duties).`,
      };
    }

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: `Authority version mismatch (expected v${input.expected_authority_version}, current v${auth.authVersion}).`,
      };
    }

    const membership = memberships.find(
      (m) => m.chapter_id === auth.chapterId && m.membership_id === input.membership_id
    );
    if (!membership || membership.status !== 'active') {
      return {
        ok: false,
        status: 409,
        code: 'MEMBERSHIP_NOT_ACTIVE',
        message: 'Duty grants require an active membership in this chapter.',
      };
    }
    if (input.expected_membership_version !== membership.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_MEMBERSHIP_VERSION',
        message: `Membership version changed (expected v${input.expected_membership_version}, current v${membership.version}).`,
      };
    }
    if (input.scope_kind === 'unit' && (!input.requesting_unit_id || !input.requesting_unit_id.trim())) {
      return {
        ok: false,
        status: 422,
        code: 'UNIT_SCOPE_REQUIRED',
        message: 'Unit-scoped duty grants require an explicit requesting_unit_id.',
      };
    }
    if (
      input.monetary_limit !== null &&
      (input.monetary_limit.currency !== 'PHP' ||
        !VALID_PHP_AMOUNT_RE.test(input.monetary_limit.amount.trim()))
    ) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_MONETARY_LIMIT',
        message: 'Monetary limit must use exact PHP decimal string format (e.g. "1000.00").',
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Provide an explicit authorization reason for this duty grant.',
      };
    }

    nextSeq += 1;
    const newGrant: AdminDutyGrant = {
      id: String(nextSeq),
      chapter_id: auth.chapterId,
      membership_id: membership.membership_id,
      user_id: membership.user_id,
      officer_name: membership.display_name,
      duty_code: input.duty_code,
      scope_kind: input.scope_kind,
      requesting_unit_id:
        input.scope_kind === 'unit' ? (input.requesting_unit_id?.trim() ?? null) : null,
      monetary_limit: input.monetary_limit
        ? { currency: 'PHP', amount: input.monetary_limit.amount.trim() }
        : null,
      starts_at: nowUtcSix(),
      ends_at: null,
      revoked_at: null,
      version: 1,
      alternate_for_grant_id: null,
    };
    grants.push(newGrant);

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'DUTY_GRANT_AUTHORIZED',
      `Granted ${newGrant.duty_code} (${newGrant.scope_kind}) to ${membership.display_name}`
    );

    return {
      ok: true,
      status: 200,
      code: 'DUTY_GRANT_AUTHORIZED',
      message: `Authorized ${newGrant.duty_code} for ${membership.display_name}.`,
      authority_version: nextAuth,
      data: { ...newGrant },
    };
  }

  function substituteDutyGrant(input: SubstituteDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: `Authority version changed (expected v${input.expected_authority_version}, current v${auth.authVersion}).`,
      };
    }

    const original = grants.find((g) => g.chapter_id === auth.chapterId && g.id === input.grant_id);
    if (!original || original.revoked_at !== null) {
      return {
        ok: false,
        status: 409,
        code: 'GRANT_NOT_ACTIVE',
        message: 'Original duty grant is missing or already revoked.',
      };
    }
    if (input.expected_grant_version !== original.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_GRANT_VERSION',
        message: `Grant version changed (expected v${input.expected_grant_version}, current v${original.version}).`,
      };
    }

    const origMembership = memberships.find((m) => m.membership_id === original.membership_id);
    if (!origMembership || input.expected_membership_version !== origMembership.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_MEMBERSHIP_VERSION',
        message: 'Target membership version mismatch.',
      };
    }

    const alternateMember = memberships.find(
      (m) =>
        m.chapter_id === auth.chapterId &&
        m.membership_id === input.alternate_membership_id &&
        m.status === 'active'
    );
    if (!alternateMember) {
      return {
        ok: false,
        status: 409,
        code: 'ALTERNATE_NOT_ACTIVE',
        message: 'Selected alternate must hold an active membership in this chapter.',
      };
    }
    if (alternateMember.user_id === original.user_id) {
      return {
        ok: false,
        status: 409,
        code: 'ALTERNATE_MUST_BE_DISTINCT_IDENTITY',
        message: 'Alternate officer must be a distinct active user identity to preserve GOV-05 independence.',
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Provide an alternate designation reason.',
      };
    }

    original.version += 1;
    nextSeq += 1;
    const altGrant: AdminDutyGrant = {
      id: String(nextSeq),
      chapter_id: auth.chapterId,
      membership_id: alternateMember.membership_id,
      user_id: alternateMember.user_id,
      officer_name: alternateMember.display_name,
      duty_code: original.duty_code,
      scope_kind: original.scope_kind,
      requesting_unit_id: original.requesting_unit_id,
      monetary_limit: original.monetary_limit ? { ...original.monetary_limit } : null,
      starts_at: nowUtcSix(),
      ends_at: null,
      revoked_at: null,
      version: 1,
      alternate_for_grant_id: original.id,
    };
    grants.push(altGrant);

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'ALTERNATE_DESIGNATED',
      `Designated ${alternateMember.display_name} as alternate for ${original.duty_code} (replacing ${original.officer_name})`
    );

    return {
      ok: true,
      status: 200,
      code: 'ALTERNATE_DESIGNATED',
      message: `Designated ${alternateMember.display_name} as alternate for ${original.duty_code}.`,
      authority_version: nextAuth,
      data: { ...altGrant },
    };
  }

  function revokeDutyGrant(input: RevokeDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: 'Authority version mismatch.',
      };
    }

    const grant = grants.find((g) => g.chapter_id === auth.chapterId && g.id === input.grant_id);
    if (!grant || grant.revoked_at !== null) {
      return {
        ok: false,
        status: 409,
        code: 'GRANT_NOT_ACTIVE',
        message: 'Grant not found or already revoked.',
      };
    }
    if (input.expected_grant_version !== grant.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_GRANT_VERSION',
        message: 'Grant version mismatch.',
      };
    }
    const membership = memberships.find((m) => m.membership_id === grant.membership_id);
    if (!membership || input.expected_membership_version !== membership.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_MEMBERSHIP_VERSION',
        message: 'Membership version mismatch.',
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Provide a reason for revoking this duty grant.',
      };
    }

    grant.revoked_at = nowUtcSix();
    grant.version += 1;
    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'DUTY_GRANT_REVOKED',
      `Revoked ${grant.duty_code} from ${grant.officer_name}: ${input.reason.trim()}`
    );

    return {
      ok: true,
      status: 200,
      code: 'DUTY_GRANT_REVOKED',
      message: `Revoked ${grant.duty_code} grant from ${grant.officer_name}.`,
      authority_version: nextAuth,
      data: { ...grant },
    };
  }

  function checkPolicyPermission(
    policy: PolicyRecordItem,
    auth: { user: P02Persona; duties: DutyCode[] }
  ): P02ActionResult<never> | null {
    const requiredDuty: DutyCode = policy.category === 'financial' ? 'FINANCE' : 'CHAPTER_HEAD';
    if (!auth.duties.includes(requiredDuty)) {
      return {
        ok: false,
        status: 403,
        code: 'POLICY_DUTY_FORBIDDEN',
        message: `${policy.category.toUpperCase()} policy requires ${requiredDuty} authority (${auth.user.display_name} does not hold ${requiredDuty}).`,
        required_duty: requiredDuty,
        link_screen: 'S-21',
      };
    }
    return null;
  }

  function savePolicyDraft(input: SavePolicyDraftInput): P02ActionResult<PolicyRecordItem> {
    const auth = ensureChapterAuthority(input.chapter_id);
    if (!auth.ok) return auth.result;

    const policy = policies.find(
      (p) => p.chapter_id === auth.chapterId && p.policy_id === input.policy_id
    );
    if (!policy) {
      return {
        ok: false,
        status: 403,
        code: 'CROSS_CHAPTER_FORBIDDEN',
        message: 'Policy not found in current chapter.',
      };
    }

    const forbidden = checkPolicyPermission(policy, auth);
    if (forbidden) return forbidden;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: 'Authority version mismatch.',
      };
    }
    if (input.expected_row_version !== policy.row_version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_ROW_VERSION',
        message: 'Policy row_version mismatch.',
      };
    }
    if (!input.summary.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'Policy summary text cannot be empty.',
      };
    }

    const nextMat = (policy.material_version ?? 0) + 1;
    policy.summary = input.summary.trim();
    policy.row_version += 1;
    policy.material_version = nextMat;
    policy.material_hash = computeDeterministicHash({
      policy_code: policy.policy_code,
      summary: policy.summary,
      material_version: nextMat,
    });
    policy.status = 'draft';
    policy.last_reason = input.reason.trim() || 'Saved new policy draft revision.';

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'POLICY_DRAFT_SAVED',
      `Saved ${policy.policy_code} draft material v${nextMat}`
    );

    return {
      ok: true,
      status: 200,
      code: 'POLICY_DRAFT_SAVED',
      message: `Saved ${policy.policy_code} draft (material v${nextMat}).`,
      authority_version: nextAuth,
      data: { ...policy },
    };
  }

  function approvePolicyVersion(input: ReviewPolicyVersionInput): P02ActionResult<PolicyRecordItem> {
    const auth = ensureChapterAuthority(input.chapter_id);
    if (!auth.ok) return auth.result;

    const policy = policies.find(
      (p) => p.chapter_id === auth.chapterId && p.policy_id === input.policy_id
    );
    if (!policy) {
      return {
        ok: false,
        status: 403,
        code: 'CROSS_CHAPTER_FORBIDDEN',
        message: 'Policy not found in current chapter.',
      };
    }

    const forbidden = checkPolicyPermission(policy, auth);
    if (forbidden) return forbidden;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: 'Authority version mismatch.',
      };
    }
    if (
      input.expected_row_version !== policy.row_version ||
      input.expected_material_version !== policy.material_version
    ) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_POLICY_VERSION',
        message: 'Policy row or material version changed before approval.',
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Approval reason is required.',
      };
    }

    const requiredDuty: DutyCode = policy.category === 'financial' ? 'FINANCE' : 'CHAPTER_HEAD';
    policy.status = 'approved';
    policy.approved_by_duty = requiredDuty;
    policy.effective_from = nowUtcSix();
    policy.row_version += 1;
    policy.last_reason = input.reason.trim();

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'POLICY_APPROVED',
      `Approved ${policy.policy_code} (${requiredDuty}): ${input.reason.trim()}`
    );

    return {
      ok: true,
      status: 200,
      code: 'POLICY_APPROVED',
      message: `Approved ${policy.policy_code}; dependent workflow ${policy.workflow_affected} is now unblocked.`,
      authority_version: nextAuth,
      data: { ...policy },
    };
  }

  function returnPolicyVersion(input: ReviewPolicyVersionInput): P02ActionResult<PolicyRecordItem> {
    const auth = ensureChapterAuthority(input.chapter_id);
    if (!auth.ok) return auth.result;

    const policy = policies.find(
      (p) => p.chapter_id === auth.chapterId && p.policy_id === input.policy_id
    );
    if (!policy) {
      return {
        ok: false,
        status: 403,
        code: 'CROSS_CHAPTER_FORBIDDEN',
        message: 'Policy not found in current chapter.',
      };
    }

    const forbidden = checkPolicyPermission(policy, auth);
    if (forbidden) return forbidden;

    if (input.expected_authority_version !== auth.authVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_AUTHORITY_VERSION',
        message: 'Authority version mismatch.',
      };
    }
    if (
      input.expected_row_version !== policy.row_version ||
      input.expected_material_version !== policy.material_version
    ) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_POLICY_VERSION',
        message: 'Policy version mismatch.',
      };
    }
    if (!input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'REASON_REQUIRED',
        message: 'Return reason is required.',
      };
    }

    policy.status = 'returned';
    policy.effective_from = null;
    policy.row_version += 1;
    policy.last_reason = input.reason.trim();

    const nextAuth = auth.authVersion + 1;
    authorityVersionByChapter.set(auth.chapterId, nextAuth);

    pushAudit(
      auth.user.display_name,
      'POLICY_RETURNED',
      `Returned ${policy.policy_code}: ${input.reason.trim()}`
    );

    return {
      ok: true,
      status: 200,
      code: 'POLICY_RETURNED',
      message: `Returned ${policy.policy_code} for revision.`,
      authority_version: nextAuth,
      data: { ...policy },
    };
  }

  function evaluateWorkflowGate(
    policyCode: string,
    mode: 'draft' | 'commit'
  ): P02ActionResult {
    const auth = ensureChapterAuthority(undefined);
    if (!auth.ok) return auth.result;

    const policy = policies.find(
      (p) => p.chapter_id === auth.chapterId && p.policy_code === policyCode
    );
    if (!policy) {
      return {
        ok: false,
        status: 409,
        code: 'POLICY_NOT_EFFECTIVE',
        message: `Missing required setup policy ${policyCode}. Configure in S-21.`,
        link_screen: 'S-21',
      };
    }

    const requiredDuty: DutyCode = policy.category === 'financial' ? 'FINANCE' : 'CHAPTER_HEAD';
    if (policy.status === 'approved') {
      return {
        ok: true,
        status: 200,
        code: 'POLICY_EFFECTIVE',
        message: `${policy.policy_code} is approved (${requiredDuty}) and effective for ${policy.workflow_affected}.`,
        permitted_draft: true,
        required_duty: requiredDuty,
      };
    }

    if (mode === 'draft') {
      return {
        ok: true,
        status: 200,
        code: 'DRAFT_PERMITTED_WITH_PENDING_POLICY',
        message: `Draft allowed while ${policy.policy_code} awaits ${requiredDuty} approval in S-21.`,
        permitted_draft: true,
        required_duty: requiredDuty,
        link_screen: 'S-21',
      };
    }

    return {
      ok: false,
      status: 409,
      code: 'POLICY_NOT_EFFECTIVE',
      message: `Blocked (${policy.workflow_affected}): ${policy.policy_code} is "${policy.status}". Requires ${requiredDuty} approval in S-21 before commitment.`,
      permitted_draft: false,
      required_duty: requiredDuty,
      link_screen: 'S-21',
    };
  }

  function createProvisionedChapter(
    input: CreateProvisionedChapterInput
  ): P02ActionResult<ProvisionedChapterRecord> {
    const user = getActivePersona();
    if (!user.provider_roles.includes('provisioner')) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_AUTHORITY_REQUIRED',
        message: 'Provisioning requires provider provisioner authority (S-22).',
        link_screen: 'S-22',
      };
    }

    if (input.expected_provider_authority_version !== providerAuthorityVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_PROVIDER_AUTHORITY_VERSION',
        message: `Provider authority version mismatch (expected v${input.expected_provider_authority_version}, current v${providerAuthorityVersion}).`,
      };
    }

    const cleanCode = input.chapter_code.trim().toUpperCase();
    const cleanName = input.chapter_name.trim();
    if (!VALID_CHAPTER_CODE_RE.test(cleanCode) || !cleanName) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'Provide a valid chapter code (e.g. DVO-03) and chapter name.',
      };
    }

    nextSeq += 1;
    const provRecord: ProvisionedChapterRecord = {
      id: `prov-${nextSeq}`,
      organization_id: 'org-ysp-ph',
      provider_user_id: user.user_id,
      chapter_code: cleanCode,
      chapter_name: cleanName,
      version: 1,
      initial_head_user_id: null,
      initial_head_name: null,
      initial_head_membership_authorization: 'not_applicable',
    };
    provisionedChapters.push(provRecord);
    providerAuthorityVersion += 1;

    pushAudit(
      user.display_name,
      'PROVIDER_CHAPTER_CREATED',
      `Provisioned chapter ${cleanCode} (${cleanName}) with initial_head_membership_authorization=not_applicable`
    );

    return {
      ok: true,
      status: 200,
      code: 'PROVISIONED_CHAPTER_CREATED',
      message: `Provisioned ${cleanName} (${cleanCode}). Provisioner receives zero operational chapter access.`,
      authority_version: providerAuthorityVersion,
      data: { ...provRecord },
    };
  }

  function appointInitialHead(
    input: AppointInitialHeadInput
  ): P02ActionResult<ProvisionedChapterRecord> {
    const user = getActivePersona();
    if (!user.provider_roles.includes('provisioner')) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_AUTHORITY_REQUIRED',
        message: 'Initial Head appointment requires provider provisioner authority (S-22).',
        link_screen: 'S-22',
      };
    }
    if (input.expected_provider_authority_version !== providerAuthorityVersion) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_PROVIDER_AUTHORITY_VERSION',
        message: 'Provider authority version mismatch.',
      };
    }

    const prov = provisionedChapters.find((p) => p.id === input.provisioning_id);
    if (!prov) {
      return {
        ok: false,
        status: 400,
        code: 'PROVISIONING_NOT_FOUND',
        message: 'Provisioned chapter record not found.',
      };
    }
    if (input.expected_provisioning_version !== prov.version) {
      return {
        ok: false,
        status: 409,
        code: 'STALE_PROVISIONING_VERSION',
        message: 'Provisioning record version mismatch.',
      };
    }
    if (!input.initial_head_user_id.trim() || !input.initial_head_name.trim() || !input.reason.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'Initial Head user ID, name, and reason are required.',
      };
    }

    prov.initial_head_user_id = input.initial_head_user_id.trim();
    prov.initial_head_name = input.initial_head_name.trim();
    prov.version += 1;
    providerAuthorityVersion += 1;

    pushAudit(
      user.display_name,
      'INITIAL_HEAD_APPOINTED',
      `Appointed ${prov.initial_head_name} (user ${prov.initial_head_user_id}) to ${prov.chapter_code} — membership remains separate`
    );

    return {
      ok: true,
      status: 200,
      code: 'INITIAL_HEAD_APPOINTED',
      message: `Appointed ${prov.initial_head_name} for ${prov.chapter_code}. Separate chapter membership activation still applies.`,
      authority_version: providerAuthorityVersion,
      data: { ...prov },
    };
  }

  function attemptGlobalIdentityDisable(
    input: GlobalDisableAttemptInput
  ): GlobalDisableBoundaryFeedback {
    const user = getActivePersona();
    pushAudit(
      user.display_name,
      'GLOBAL_DISABLE_BOUNDARY_HIT',
      `Blocked 503 on identity.disable for user ${input.user_id} (enabled_boundary: false)`
    );
    return {
      status: 503,
      original_outcome: 'uncertain',
      next_action: 'unavailable',
      message:
        'Global identity disable boundary is not enabled in Stage 1 (p02-action-catalogue enabled_boundary: false). Retain original attempt; no durable mutation performed.',
    };
  }

  return {
    getSnapshot,
    selectPersona,
    selectChapter,
    authorizeMembership,
    disableOrRevokeMembership,
    authorizeDutyGrant,
    substituteDutyGrant,
    revokeDutyGrant,
    savePolicyDraft,
    approvePolicyVersion,
    returnPolicyVersion,
    evaluateWorkflowGate,
    createProvisionedChapter,
    appointInitialHead,
    attemptGlobalIdentityDisable,
  };
}
