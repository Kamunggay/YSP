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
  | 'reviewed'
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

export interface ExistingIdentityReference {
  user_id: string;
  display_name: string;
}

export type P02OperationScope = 'chapter' | 'provider' | 'global_disable';

export interface P02OperationRecord {
  operation_id: string;
  scope: P02OperationScope;
  chapter_id: string | null;
  action_code: string;
  idempotency_key: string;
  outcome: 'committed' | 'rejected' | 'uncertain';
  code: string;
  message: string;
  committed_at: string;
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
  operation_id?: string | undefined;
  action_code?: string | undefined;
  idempotency_key?: string | undefined;
  replayed?: boolean | undefined;
  next_action?: string | undefined;
  data?: T | undefined;
}

export interface P02AuditEvent {
  id: string;
  timestamp: string;
  actor_name: string;
  code: string;
  summary: string;
}

export const P02_CONTEXT_STORAGE_KEY = 'ysp_p02_context';

export interface P02EngineOptions {
  personas?: ReadonlyArray<P02Persona>;
  known_identities?: ReadonlyArray<ExistingIdentityReference>;
  chapters?: ReadonlyArray<ChapterInfo>;
  authority_versions?: Record<string, number>;
  provider_authority_version?: number;
  active_persona_key?: string | null;
  selected_chapter_id?: string | null;
  memberships?: ReadonlyArray<ChapterMembershipSummary>;
  duty_grants?: ReadonlyArray<AdminDutyGrant>;
  policies?: ReadonlyArray<PolicyRecordItem>;
  provisioned_chapters?: ReadonlyArray<ProvisionedChapterRecord>;
  audit_log?: ReadonlyArray<P02AuditEvent>;
  organization_id?: string;
  next_seq?: number;
}

export interface P02Snapshot {
  active_persona: P02Persona | null;
  available_personas: ReadonlyArray<P02Persona>;
  all_chapters: ReadonlyArray<ChapterInfo>;
  authorized_memberships_for_user: ReadonlyArray<ChapterMembershipSummary>;
  selected_chapter_id: string | null;
  selected_chapter_name: string | null;
  selection_revision: string | null;
  chapter_state: ChapterSelectionState;
  next_action: 'no_chapter_work' | 'select_chapter' | 'review_current_actions';
  authority_version: number;
  provider_authority_version: number;
  active_user_duties: ReadonlyArray<DutyCode>;
  chapter_memberships: ReadonlyArray<ChapterMembershipSummary>;
  chapter_duty_grants: ReadonlyArray<AdminDutyGrant>;
  chapter_policies: ReadonlyArray<PolicyRecordItem>;
  provisioned_chapters: ReadonlyArray<ProvisionedChapterRecord>;
  operation_ledger: ReadonlyArray<P02OperationRecord>;
  audit_log: ReadonlyArray<P02AuditEvent>;
}

export interface LookupMembershipIdentityInput {
  chapter_id?: string | undefined;
  user_id: string;
}

export interface LookupProvisioningIdentityInput {
  user_id: string;
}

export interface AuthorizeMembershipInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  user_id: string;
  display_name: string;
  email: string;
  expected_authority_version: number;
  expected_membership_version: null;
  reason: string;
}

export interface DisableOrRevokeMembershipInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  membership_id: string;
  action: 'disabled' | 'revoked';
  expected_authority_version: number;
  expected_membership_version: number;
  reason: string;
}

export interface AuthorizeDutyGrantInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
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

export interface AmendDutyGrantInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  grant_id: string;
  starts_at?: string | undefined;
  ends_at: string | null;
  monetary_limit: PostedMoney | null;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface EndDutyGrantInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  grant_id: string;
  ends_at: string;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface SubstituteDutyGrantInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  grant_id: string;
  alternate_membership_id: string;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface RevokeDutyGrantInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  grant_id: string;
  expected_authority_version: number;
  expected_membership_version: number;
  expected_grant_version: number;
  reason: string;
}

export interface SavePolicyDraftInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  policy_id: string;
  summary: string;
  expected_authority_version: number;
  expected_row_version: number;
  expected_material_version: number | null;
  reason: string;
}

export interface ReviewPolicyVersionInput {
  chapter_id?: string | undefined;
  idempotency_key?: string | undefined;
  policy_id: string;
  expected_authority_version: number;
  expected_row_version: number;
  expected_material_version: number | null;
  reason: string;
}

export interface CreateProvisionedChapterInput {
  idempotency_key?: string | undefined;
  chapter_code: string;
  chapter_name: string;
  expected_provider_authority_version: number;
}

export interface AppointInitialHeadInput {
  idempotency_key?: string | undefined;
  provisioning_id: string;
  initial_head_user_id: string;
  initial_head_name: string;
  expected_provider_authority_version: number;
  expected_provisioning_version: number;
  reason: string;
}

export interface GlobalDisableAttemptInput {
  idempotency_key?: string | undefined;
  user_id: string;
  expected_identity_version: number;
  reason: string;
}

export interface LookupP02OperationByKeyInput {
  scope: P02OperationScope;
  chapter_id?: string | undefined;
  action_code: string;
  idempotency_key: string;
}

export interface LookupP02OperationByIdInput {
  scope: P02OperationScope;
  chapter_id?: string | undefined;
  operation_id: string;
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
const VALID_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

function nowUtcSix(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, (ms) => `${ms.slice(0, 4)}000Z`);
}

function isCanonicalDuty(code: string): code is DutyCode {
  return (CANONICAL_CHAPTER_DUTIES as ReadonlyArray<string>).includes(code);
}

export interface P02AdminEngine {
  getSnapshot: () => P02Snapshot;
  selectPersona: (personaKey: string) => P02ActionResult<P02Snapshot>;
  selectChapter: (chapterId: string | null) => P02ActionResult<P02Snapshot>;
  lookupMembershipIdentity: (
    input: LookupMembershipIdentityInput
  ) => P02ActionResult<ExistingIdentityReference | null>;
  lookupProvisioningIdentity: (
    input: LookupProvisioningIdentityInput
  ) => P02ActionResult<ExistingIdentityReference | null>;
  authorizeMembership: (input: AuthorizeMembershipInput) => P02ActionResult<ChapterMembershipSummary>;
  disableOrRevokeMembership: (
    input: DisableOrRevokeMembershipInput
  ) => P02ActionResult<ChapterMembershipSummary>;
  authorizeDutyGrant: (input: AuthorizeDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  amendDutyGrant: (input: AmendDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  endDutyGrant: (input: EndDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  substituteDutyGrant: (input: SubstituteDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  revokeDutyGrant: (input: RevokeDutyGrantInput) => P02ActionResult<AdminDutyGrant>;
  savePolicyDraft: (input: SavePolicyDraftInput) => P02ActionResult<PolicyRecordItem>;
  submitPolicyVersion: (input: ReviewPolicyVersionInput) => P02ActionResult<PolicyRecordItem>;
  reviewPolicyVersion: (input: ReviewPolicyVersionInput) => P02ActionResult<PolicyRecordItem>;
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
  lookupOperationByKey: (
    input: LookupP02OperationByKeyInput
  ) => P02ActionResult<P02OperationRecord>;
  lookupOperationById: (input: LookupP02OperationByIdInput) => P02ActionResult<P02OperationRecord>;
}

function readStoredP02Options(): P02EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P02_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P02EngineOptions;
  } catch {
    return undefined;
  }
}

export function createP02AdminEngine(options?: P02EngineOptions): P02AdminEngine {
  const seed = options ?? readStoredP02Options() ?? {};
  const personas: P02Persona[] = (seed.personas ?? []).map((p) => ({
    ...p,
    provider_roles: [...p.provider_roles],
  }));
  const chapters: ChapterInfo[] = (seed.chapters ?? []).map((c) => ({ ...c }));
  const authorityVersionByChapter = new Map<string, number>(
    Object.entries(seed.authority_versions ?? {})
  );
  for (const ch of chapters) {
    if (!authorityVersionByChapter.has(ch.id)) {
      authorityVersionByChapter.set(ch.id, 1);
    }
  }
  let providerAuthorityVersion = seed.provider_authority_version ?? 0;
  let activePersonaKey: string | null =
    seed.active_persona_key !== undefined
      ? seed.active_persona_key
      : (personas[0]?.key ?? null);
  let selectedChapterId: string | null = seed.selected_chapter_id ?? null;
  let nextSeq = seed.next_seq ?? 0;
  const organizationId = seed.organization_id ?? '';

  const memberships: ChapterMembershipSummary[] = (seed.memberships ?? []).map((m) => ({ ...m }));

  const grants: AdminDutyGrant[] = (seed.duty_grants ?? []).map((g) => ({
    ...g,
    monetary_limit: g.monetary_limit ? { ...g.monetary_limit } : null,
  }));

  const policies: PolicyRecordItem[] = (seed.policies ?? []).map((p) => ({ ...p }));

  const provisionedChapters: ProvisionedChapterRecord[] = (seed.provisioned_chapters ?? []).map(
    (p) => ({ ...p })
  );

  const knownIdentities = new Map<string, ExistingIdentityReference>();
  for (const idRef of seed.known_identities ?? []) {
    if (idRef.user_id.trim()) {
      knownIdentities.set(idRef.user_id.trim(), {
        user_id: idRef.user_id.trim(),
        display_name: idRef.display_name.trim(),
      });
    }
  }
  for (const p of personas) {
    if (p.user_id.trim() && !knownIdentities.has(p.user_id.trim())) {
      knownIdentities.set(p.user_id.trim(), {
        user_id: p.user_id.trim(),
        display_name: p.display_name.trim(),
      });
    }
  }
  for (const m of memberships) {
    if (m.user_id.trim() && !knownIdentities.has(m.user_id.trim())) {
      knownIdentities.set(m.user_id.trim(), {
        user_id: m.user_id.trim(),
        display_name: m.display_name.trim(),
      });
    }
  }

  let selectionRevSeq = personas.length > 0 ? 1 : 0;
  let autoKeySeq = 0;
  let opSeq = 0;

  interface StoredP02Operation {
    record: P02OperationRecord;
    fingerprint: string;
    result: P02ActionResult<unknown>;
  }

  const operationsByKey = new Map<string, StoredP02Operation>();
  const operationsById = new Map<string, StoredP02Operation>();
  const operationLedger: P02OperationRecord[] = [];

  function formatSelectionRevision(): string | null {
    if (!getActivePersona()) return null;
    const rev = Math.max(1, selectionRevSeq);
    return `ctx_${String(rev).padStart(8, '0')}`;
  }

  function nextOpUlid(): string {
    opSeq += 1;
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let suffix = '';
    let n = opSeq;
    for (let i = 0; i < 6; i += 1) {
      suffix = (alphabet[n % 32] ?? '0') + suffix;
      n = Math.floor(n / 32);
    }
    return `01K8P02OP00000000000${suffix}`;
  }

  function resolveKnownIdentity(userId: string): ExistingIdentityReference | null {
    const trimmed = userId.trim();
    if (!trimmed) return null;
    const known = knownIdentities.get(trimmed);
    if (known) return { ...known };
    const member = memberships.find((m) => m.user_id === trimmed);
    if (member) return { user_id: member.user_id, display_name: member.display_name };
    const persona = personas.find((p) => p.user_id === trimmed);
    if (persona) return { user_id: persona.user_id, display_name: persona.display_name };
    return null;
  }

  function runIdempotentOperation<T>(params: {
    scope: P02OperationScope;
    chapterId: string | null;
    actionCode: string;
    explicitKey: string | undefined;
    fingerprintPayload: unknown;
    execute: () => P02ActionResult<T>;
  }): P02ActionResult<T> {
    if (params.explicitKey !== undefined) {
      if (!VALID_IDEMPOTENCY_KEY_RE.test(params.explicitKey)) {
        return {
          ok: false,
          status: 422,
          code: 'INVALID_IDEMPOTENCY_KEY',
          message:
            'Idempotency key must be 1–128 case-sensitive chars (A–Z, a–z, 0–9, ., _, :, -) with no whitespace.',
        };
      }
    }

    const key =
      params.explicitKey !== undefined
        ? params.explicitKey
        : `auto_${++autoKeySeq}`;
    const scopeKey = `${params.scope}:${params.chapterId ?? 'global'}:${params.actionCode}:${key}`;
    const fingerprint = computeDeterministicHash({
      scope: params.scope,
      chapter_id: params.chapterId,
      action_code: params.actionCode,
      payload: params.fingerprintPayload,
    });

    const existing = operationsByKey.get(scopeKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return {
          ok: false,
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
          message: `Key "${key}" is already bound to a different ${params.actionCode} payload.`,
          next_action: 'review_original_attempt',
          idempotency_key: key,
          action_code: params.actionCode,
        };
      }
      return {
        ...(existing.result as P02ActionResult<T>),
        replayed: true,
        operation_id: existing.record.operation_id,
        action_code: params.actionCode,
        idempotency_key: key,
      };
    }

    const outcome = params.execute();
    const isDurableStateOutcome =
      outcome.ok ||
      outcome.code === 'MEMBERSHIP_ALREADY_ACTIVE' ||
      outcome.code === 'GRANT_NOT_ACTIVE' ||
      outcome.code === 'ALTERNATE_MUST_BE_DISTINCT_IDENTITY' ||
      outcome.code === 'INVALID_POLICY_STATUS';

    if (!isDurableStateOutcome) {
      return {
        ...outcome,
        action_code: params.actionCode,
        idempotency_key: params.explicitKey !== undefined ? key : undefined,
      };
    }

    const opId = nextOpUlid();
    const committedAt = nowUtcSix();
    const enriched: P02ActionResult<T> = {
      ...outcome,
      operation_id: opId,
      action_code: params.actionCode,
      idempotency_key: key,
      replayed: false,
    };
    const record: P02OperationRecord = {
      operation_id: opId,
      scope: params.scope,
      chapter_id: params.chapterId,
      action_code: params.actionCode,
      idempotency_key: key,
      outcome: outcome.ok ? 'committed' : 'rejected',
      code: outcome.code,
      message: outcome.message,
      committed_at: committedAt,
    };
    const stored: StoredP02Operation = { record, fingerprint, result: enriched };
    operationsByKey.set(scopeKey, stored);
    operationsById.set(opId, stored);
    operationLedger.unshift(record);
    return enriched;
  }

  const auditLog: P02AuditEvent[] = (seed.audit_log ?? []).map((a) => ({ ...a }));

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

  function getActivePersona(): P02Persona | null {
    if (!activePersonaKey) return null;
    return personas.find((p) => p.key === activePersonaKey) ?? null;
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
    if (!user) {
      return { state: 'no_authorized_memberships', selectedId: null, duties: [] };
    }
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
      active_persona: user ? { ...user, provider_roles: [...user.provider_roles] } : null,
      available_personas: personas.map((p) => ({
        ...p,
        provider_roles: [...p.provider_roles],
      })),
      all_chapters: chapters.map((c) => ({ ...c })),
      authorized_memberships_for_user: user ? getAuthorizedMembershipsFor(user.user_id) : [],
      selected_chapter_id: selectedId,
      selected_chapter_name: selectedChapter?.name ?? null,
      selection_revision: formatSelectionRevision(),
      chapter_state: state,
      next_action: chapterNextAction(state),
      authority_version: authVer,
      provider_authority_version: providerAuthorityVersion,
      active_user_duties: duties,
      chapter_memberships: chapterMemberships,
      chapter_duty_grants: chapterGrants,
      chapter_policies: chapterPolicies,
      provisioned_chapters: provisionedChapters.map((p) => ({ ...p })),
      operation_ledger: operationLedger.map((op) => ({ ...op })),
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
    if (!user) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 403,
          code: 'SESSION_REQUIRED',
          message:
            'Sign in with an active officer session before executing chapter administration actions.',
          link_screen: 'S-01',
        },
      };
    }

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
    const target = personas.find((p) => p.key === personaKey);
    if (!target) {
      return {
        ok: false,
        status: 400,
        code: 'UNKNOWN_PERSONA',
        message: 'Unknown actor persona requested.',
      };
    }
    activePersonaKey = target.key;
    selectionRevSeq += 1;
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

    if (!user) {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_REQUIRED',
        message: 'Sign in with an active officer session before selecting a chapter.',
        link_screen: 'S-01',
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
    selectionRevSeq += 1;
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

  function lookupMembershipIdentity(
    input: LookupMembershipIdentityInput
  ): P02ActionResult<ExistingIdentityReference | null> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;
    if (!input.user_id.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'Provide a valid user_id to resolve an identity reference.',
      };
    }
    const found = resolveKnownIdentity(input.user_id);
    return {
      ok: true,
      status: 200,
      code: found ? 'IDENTITY_REFERENCE_RESOLVED' : 'IDENTITY_REFERENCE_NOT_FOUND',
      message: found
        ? `Resolved existing identity ${found.display_name} (${found.user_id}).`
        : `No eligible existing identity found for user ${input.user_id.trim()}.`,
      authority_version: auth.authVersion,
      data: found,
    };
  }

  function lookupProvisioningIdentity(
    input: LookupProvisioningIdentityInput
  ): P02ActionResult<ExistingIdentityReference | null> {
    const user = getActivePersona();
    if (!user) {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_REQUIRED',
        message: 'Sign in with a provider provisioner session before looking up identities.',
        link_screen: 'S-01',
      };
    }
    if (!user.provider_roles.includes('provisioner')) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_AUTHORITY_REQUIRED',
        message: 'Provisioning identity lookup requires provider provisioner authority.',
        link_screen: 'S-22',
      };
    }
    if (!input.user_id.trim()) {
      return {
        ok: false,
        status: 422,
        code: 'INVALID_INPUT',
        message: 'Provide a valid user_id to look up an eligible Initial Head identity.',
      };
    }
    const found = resolveKnownIdentity(input.user_id);
    return {
      ok: true,
      status: 200,
      code: found ? 'IDENTITY_REFERENCE_RESOLVED' : 'IDENTITY_REFERENCE_NOT_FOUND',
      message: found
        ? `Resolved eligible provisioning identity ${found.display_name} (${found.user_id}).`
        : `No eligible existing identity matched user ${input.user_id.trim()}.`,
      authority_version: providerAuthorityVersion,
      data: found,
    };
  }

  function authorizeMembership(
    input: AuthorizeMembershipInput
  ): P02ActionResult<ChapterMembershipSummary> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'memberships.authorize',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        user_id: input.user_id.trim(),
        display_name: input.display_name.trim(),
        email: input.email.trim().toLowerCase(),
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
        knownIdentities.set(resultRecord.user_id, {
          user_id: resultRecord.user_id,
          display_name: resultRecord.display_name,
        });

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
      },
    });
  }

  function disableOrRevokeMembership(
    input: DisableOrRevokeMembershipInput
  ): P02ActionResult<ChapterMembershipSummary> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    const actionCode = input.action === 'disabled' ? 'memberships.disable' : 'memberships.revoke';
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        membership_id: input.membership_id,
        action: input.action,
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
              message:
                'Sole active Chapter Head cannot self-disable or self-revoke without an alternate Head.',
            };
          }
        }

        const revokedSessions = target.active_sessions;
        target.status = input.action;
        target.active_sessions = 0;
        target.version += 1;
        selectionRevSeq += 1;

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
      },
    });
  }

  function authorizeDutyGrant(input: AuthorizeDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'duty_grants.authorize',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        membership_id: input.membership_id,
        duty_code: input.duty_code,
        scope_kind: input.scope_kind,
        requesting_unit_id: input.requesting_unit_id,
        monetary_limit: input.monetary_limit,
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
        if (
          input.scope_kind === 'unit' &&
          (!input.requesting_unit_id || !input.requesting_unit_id.trim())
        ) {
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
      },
    });
  }

  function validateActiveGrantMutation(params: {
    chapterId: string;
    authVersion: number;
    grantId: string;
    expectedAuthorityVersion: number;
    expectedGrantVersion: number;
    expectedMembershipVersion: number;
    reason: string;
    reasonMessage: string;
  }):
    | { ok: true; grant: AdminDutyGrant; membership: ChapterMembershipSummary }
    | { ok: false; result: P02ActionResult<never> } {
    if (params.expectedAuthorityVersion !== params.authVersion) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 409,
          code: 'STALE_AUTHORITY_VERSION',
          message: `Authority version changed (expected v${params.expectedAuthorityVersion}, current v${params.authVersion}).`,
        },
      };
    }

    const grant = grants.find(
      (g) => g.chapter_id === params.chapterId && g.id === params.grantId
    );
    if (!grant || grant.revoked_at !== null) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 409,
          code: 'GRANT_NOT_ACTIVE',
          message: 'Duty grant not found or already revoked.',
        },
      };
    }
    if (params.expectedGrantVersion !== grant.version) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 409,
          code: 'STALE_GRANT_VERSION',
          message: `Grant version changed (expected v${params.expectedGrantVersion}, current v${grant.version}).`,
        },
      };
    }

    const membership = memberships.find((m) => m.membership_id === grant.membership_id);
    if (!membership || params.expectedMembershipVersion !== membership.version) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 409,
          code: 'STALE_MEMBERSHIP_VERSION',
          message: 'Target membership version mismatch.',
        },
      };
    }

    if (!params.reason.trim()) {
      return {
        ok: false,
        result: {
          ok: false,
          status: 422,
          code: 'REASON_REQUIRED',
          message: params.reasonMessage,
        },
      };
    }

    return { ok: true, grant, membership };
  }

  function amendDutyGrant(input: AmendDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'duty_grants.prepare',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'amend',
        grant_id: input.grant_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        monetary_limit: input.monetary_limit,
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        expected_grant_version: input.expected_grant_version,
        reason: input.reason.trim(),
      },
      execute: () => {
        const check = validateActiveGrantMutation({
          chapterId: auth.chapterId,
          authVersion: auth.authVersion,
          grantId: input.grant_id,
          expectedAuthorityVersion: input.expected_authority_version,
          expectedGrantVersion: input.expected_grant_version,
          expectedMembershipVersion: input.expected_membership_version,
          reason: input.reason,
          reasonMessage: 'Provide a reason for amending this duty grant.',
        });
        if (!check.ok) return check.result;

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

        const nextStart = input.starts_at?.trim() || check.grant.starts_at;
        const nextEnd = input.ends_at?.trim() ? input.ends_at.trim() : null;
        if (nextEnd !== null && Date.parse(nextEnd) <= Date.parse(nextStart)) {
          return {
            ok: false,
            status: 422,
            code: 'INVALID_EFFECTIVITY_WINDOW',
            message: 'Grant ends_at must be strictly later than starts_at.',
          };
        }

        check.grant.starts_at = nextStart;
        check.grant.ends_at = nextEnd;
        check.grant.monetary_limit = input.monetary_limit
          ? { currency: 'PHP', amount: input.monetary_limit.amount.trim() }
          : null;
        check.grant.version += 1;

        const nextAuth = auth.authVersion + 1;
        authorityVersionByChapter.set(auth.chapterId, nextAuth);

        pushAudit(
          auth.user.display_name,
          'DUTY_GRANT_AMENDED',
          `Amended ${check.grant.duty_code} for ${check.grant.officer_name}: ${input.reason.trim()}`
        );

        return {
          ok: true,
          status: 200,
          code: 'DUTY_GRANT_AMENDED',
          message: `Amended ${check.grant.duty_code} terms for ${check.grant.officer_name} without changing duty or scope.`,
          authority_version: nextAuth,
          data: {
            ...check.grant,
            monetary_limit: check.grant.monetary_limit ? { ...check.grant.monetary_limit } : null,
          },
        };
      },
    });
  }

  function endDutyGrant(input: EndDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'duty_grants.revoke',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'end',
        grant_id: input.grant_id,
        ends_at: input.ends_at.trim(),
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        expected_grant_version: input.expected_grant_version,
        reason: input.reason.trim(),
      },
      execute: () => {
        const check = validateActiveGrantMutation({
          chapterId: auth.chapterId,
          authVersion: auth.authVersion,
          grantId: input.grant_id,
          expectedAuthorityVersion: input.expected_authority_version,
          expectedGrantVersion: input.expected_grant_version,
          expectedMembershipVersion: input.expected_membership_version,
          reason: input.reason,
          reasonMessage: 'Provide a reason for scheduling an end timestamp on this duty grant.',
        });
        if (!check.ok) return check.result;

        const targetEnd = input.ends_at.trim();
        const endMs = Date.parse(targetEnd);
        const startMs = Date.parse(check.grant.starts_at);
        if (!targetEnd || Number.isNaN(endMs) || endMs <= startMs) {
          return {
            ok: false,
            status: 422,
            code: 'INVALID_EFFECTIVITY_WINDOW',
            message: 'Provide a valid ISO UTC ends_at timestamp strictly after starts_at.',
          };
        }
        if (check.grant.ends_at !== null && endMs > Date.parse(check.grant.ends_at)) {
          return {
            ok: false,
            status: 409,
            code: 'GRANT_END_EXTENSION_FORBIDDEN',
            message: 'End duty grant cannot extend an existing scheduled end; authorize a new grant instead.',
          };
        }

        check.grant.ends_at = targetEnd;
        check.grant.version += 1;
        const nextAuth = auth.authVersion + 1;
        authorityVersionByChapter.set(auth.chapterId, nextAuth);

        pushAudit(
          auth.user.display_name,
          'DUTY_GRANT_ENDED',
          `Scheduled end ${targetEnd} on ${check.grant.duty_code} for ${check.grant.officer_name}`
        );

        return {
          ok: true,
          status: 200,
          code: 'DUTY_GRANT_ENDED',
          message: `Scheduled end (${targetEnd}) for ${check.grant.duty_code} held by ${check.grant.officer_name}.`,
          authority_version: nextAuth,
          data: {
            ...check.grant,
            monetary_limit: check.grant.monetary_limit ? { ...check.grant.monetary_limit } : null,
          },
        };
      },
    });
  }

  function substituteDutyGrant(input: SubstituteDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'alternates.authorize',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        grant_id: input.grant_id,
        alternate_membership_id: input.alternate_membership_id,
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        expected_grant_version: input.expected_grant_version,
        reason: input.reason.trim(),
      },
      execute: () => {
        const check = validateActiveGrantMutation({
          chapterId: auth.chapterId,
          authVersion: auth.authVersion,
          grantId: input.grant_id,
          expectedAuthorityVersion: input.expected_authority_version,
          expectedGrantVersion: input.expected_grant_version,
          expectedMembershipVersion: input.expected_membership_version,
          reason: input.reason,
          reasonMessage: 'Provide an alternate designation reason.',
        });
        if (!check.ok) return check.result;
        const original = check.grant;

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
            message:
              'Alternate officer must be a distinct active user identity to preserve GOV-05 independence.',
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
      },
    });
  }

  function revokeDutyGrant(input: RevokeDutyGrantInput): P02ActionResult<AdminDutyGrant> {
    const auth = ensureChapterAuthority(input.chapter_id, 'CHAPTER_HEAD');
    if (!auth.ok) return auth.result;

    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode: 'duty_grants.revoke',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'revoke',
        grant_id: input.grant_id,
        expected_authority_version: input.expected_authority_version,
        expected_membership_version: input.expected_membership_version,
        expected_grant_version: input.expected_grant_version,
        reason: input.reason.trim(),
      },
      execute: () => {
        const check = validateActiveGrantMutation({
          chapterId: auth.chapterId,
          authVersion: auth.authVersion,
          grantId: input.grant_id,
          expectedAuthorityVersion: input.expected_authority_version,
          expectedGrantVersion: input.expected_grant_version,
          expectedMembershipVersion: input.expected_membership_version,
          reason: input.reason,
          reasonMessage: 'Provide a reason for revoking this duty grant.',
        });
        if (!check.ok) return check.result;
        const grant = check.grant;

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
      },
    });
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

    const actionCode = `policy.${policy.category}.prepare`;
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'draft',
        policy_id: input.policy_id,
        summary: input.summary.trim(),
        expected_authority_version: input.expected_authority_version,
        expected_row_version: input.expected_row_version,
        expected_material_version: input.expected_material_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
      },
    });
  }

  function submitPolicyVersion(input: ReviewPolicyVersionInput): P02ActionResult<PolicyRecordItem> {
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

    const actionCode = `policy.${policy.category}.prepare`;
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'submit',
        policy_id: input.policy_id,
        expected_authority_version: input.expected_authority_version,
        expected_row_version: input.expected_row_version,
        expected_material_version: input.expected_material_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
            message: 'Policy row or material version changed before submission.',
          };
        }
        if (policy.material_version === null) {
          return {
            ok: false,
            status: 422,
            code: 'MISSING_MATERIAL_REVISION',
            message: 'Save a policy material draft before submitting.',
          };
        }
        if (policy.status !== 'draft' && policy.status !== 'returned') {
          return {
            ok: false,
            status: 409,
            code: 'INVALID_POLICY_STATUS',
            message: `Only draft or returned policies can be submitted (current status: ${policy.status}).`,
          };
        }

        policy.status = 'submitted';
        policy.row_version += 1;
        policy.last_reason =
          input.reason.trim() || 'Submitted policy revision for governance review.';

        const nextAuth = auth.authVersion + 1;
        authorityVersionByChapter.set(auth.chapterId, nextAuth);

        pushAudit(
          auth.user.display_name,
          'POLICY_SUBMITTED',
          `Submitted ${policy.policy_code} material v${policy.material_version}`
        );

        return {
          ok: true,
          status: 200,
          code: 'POLICY_SUBMITTED',
          message: `Submitted ${policy.policy_code} (material v${policy.material_version}) for approval.`,
          authority_version: nextAuth,
          data: { ...policy },
        };
      },
    });
  }

  function reviewPolicyVersion(input: ReviewPolicyVersionInput): P02ActionResult<PolicyRecordItem> {
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

    const actionCode = `policy.${policy.category}.approve`;
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'review',
        policy_id: input.policy_id,
        expected_authority_version: input.expected_authority_version,
        expected_row_version: input.expected_row_version,
        expected_material_version: input.expected_material_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
            message: 'Policy row or material version changed before review.',
          };
        }
        if (!input.reason.trim()) {
          return {
            ok: false,
            status: 422,
            code: 'REASON_REQUIRED',
            message: 'Review reason is required.',
          };
        }
        if (policy.status !== 'submitted' && policy.status !== 'draft') {
          return {
            ok: false,
            status: 409,
            code: 'INVALID_POLICY_STATUS',
            message: `Only submitted or draft policies can be marked reviewed (current status: ${policy.status}).`,
          };
        }

        policy.status = 'reviewed';
        policy.row_version += 1;
        policy.last_reason = input.reason.trim();

        const nextAuth = auth.authVersion + 1;
        authorityVersionByChapter.set(auth.chapterId, nextAuth);

        pushAudit(
          auth.user.display_name,
          'POLICY_REVIEWED',
          `Reviewed ${policy.policy_code}: ${input.reason.trim()}`
        );

        return {
          ok: true,
          status: 200,
          code: 'POLICY_REVIEWED',
          message: `Recorded governance review on ${policy.policy_code} (ready for approval).`,
          authority_version: nextAuth,
          data: { ...policy },
        };
      },
    });
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

    const actionCode = `policy.${policy.category}.approve`;
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'approve',
        policy_id: input.policy_id,
        expected_authority_version: input.expected_authority_version,
        expected_row_version: input.expected_row_version,
        expected_material_version: input.expected_material_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
      },
    });
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

    const actionCode = `policy.${policy.category}.approve`;
    return runIdempotentOperation({
      scope: 'chapter',
      chapterId: auth.chapterId,
      actionCode,
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        op: 'return',
        policy_id: input.policy_id,
        expected_authority_version: input.expected_authority_version,
        expected_row_version: input.expected_row_version,
        expected_material_version: input.expected_material_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
      },
    });
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
        message: `Missing required setup policy ${policyCode}. Configure in Policies & Readiness.`,
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
        message: `Draft allowed while ${policy.policy_code} awaits ${requiredDuty} approval in Policies & Readiness.`,
        permitted_draft: true,
        required_duty: requiredDuty,
        link_screen: 'S-21',
      };
    }

    return {
      ok: false,
      status: 409,
      code: 'POLICY_NOT_EFFECTIVE',
      message: `Blocked (${policy.workflow_affected}): ${policy.policy_code} is "${policy.status}". Requires ${requiredDuty} approval before commitment.`,
      permitted_draft: false,
      required_duty: requiredDuty,
      link_screen: 'S-21',
    };
  }

  function createProvisionedChapter(
    input: CreateProvisionedChapterInput
  ): P02ActionResult<ProvisionedChapterRecord> {
    const user = getActivePersona();
    if (!user) {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_REQUIRED',
        message: 'Sign in with a provider provisioner session before provisioning chapters.',
        link_screen: 'S-01',
      };
    }
    if (!user.provider_roles.includes('provisioner')) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_AUTHORITY_REQUIRED',
        message: 'Provisioning requires provider provisioner authority.',
        link_screen: 'S-22',
      };
    }

    return runIdempotentOperation({
      scope: 'provider',
      chapterId: null,
      actionCode: 'provider.chapters.create',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        chapter_code: input.chapter_code.trim().toUpperCase(),
        chapter_name: input.chapter_name.trim(),
        expected_provider_authority_version: input.expected_provider_authority_version,
      },
      execute: () => {
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
            message:
              'Provide a valid chapter code (2-16 uppercase letters, digits, hyphen, or underscore) and chapter name.',
          };
        }

        nextSeq += 1;
        const provRecord: ProvisionedChapterRecord = {
          id: `prov-${nextSeq}`,
          organization_id: organizationId,
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
      },
    });
  }

  function appointInitialHead(
    input: AppointInitialHeadInput
  ): P02ActionResult<ProvisionedChapterRecord> {
    const user = getActivePersona();
    if (!user) {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_REQUIRED',
        message: 'Sign in with a provider provisioner session before appointing an initial head.',
        link_screen: 'S-01',
      };
    }
    if (!user.provider_roles.includes('provisioner')) {
      return {
        ok: false,
        status: 403,
        code: 'PROVIDER_AUTHORITY_REQUIRED',
        message: 'Initial Head appointment requires provider provisioner authority.',
        link_screen: 'S-22',
      };
    }

    return runIdempotentOperation({
      scope: 'provider',
      chapterId: null,
      actionCode: 'provider.initial_head.appoint',
      explicitKey: input.idempotency_key,
      fingerprintPayload: {
        provisioning_id: input.provisioning_id,
        initial_head_user_id: input.initial_head_user_id.trim(),
        initial_head_name: input.initial_head_name.trim(),
        expected_provider_authority_version: input.expected_provider_authority_version,
        expected_provisioning_version: input.expected_provisioning_version,
        reason: input.reason.trim(),
      },
      execute: () => {
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
        if (
          !input.initial_head_user_id.trim() ||
          !input.initial_head_name.trim() ||
          !input.reason.trim()
        ) {
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
        knownIdentities.set(prov.initial_head_user_id, {
          user_id: prov.initial_head_user_id,
          display_name: prov.initial_head_name,
        });

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
      },
    });
  }

  function attemptGlobalIdentityDisable(
    input: GlobalDisableAttemptInput
  ): GlobalDisableBoundaryFeedback {
    const user = getActivePersona();
    pushAudit(
      user?.display_name ?? 'System boundary',
      'GLOBAL_DISABLE_BOUNDARY_HIT',
      `Blocked organization-wide lock on user ${input.user_id} (Stage 1 global boundary inactive)`
    );
    return {
      status: 503,
      original_outcome: 'uncertain',
      next_action: 'unavailable',
      message:
        'Organization-wide account lockout is unavailable in Stage 1. Disable officer memberships individually within each authorized chapter.',
    };
  }

  function ensureLookupScopeAuthorized(
    scope: P02OperationScope,
    chapterId?: string
  ):
    | { ok: true; chapterId: string | null }
    | { ok: false; result: P02ActionResult<P02OperationRecord> } {
    if (scope === 'chapter') {
      const auth = ensureChapterAuthority(chapterId);
      if (!auth.ok) return { ok: false, result: auth.result };
      return { ok: true, chapterId: auth.chapterId };
    }
    if (scope === 'provider') {
      const user = getActivePersona();
      if (!user || !user.provider_roles.includes('provisioner')) {
        return {
          ok: false,
          result: {
            ok: false,
            status: 403,
            code: 'PROVIDER_AUTHORITY_REQUIRED',
            message: 'Provisioning operation lookup requires provider provisioner authority.',
            link_screen: 'S-22',
          },
        };
      }
      return { ok: true, chapterId: null };
    }
    return { ok: true, chapterId: null };
  }

  function formatLookupHit(
    stored: StoredP02Operation | undefined,
    selectorLabel: string
  ): P02ActionResult<P02OperationRecord> {
    if (!stored) {
      return {
        ok: false,
        status: 200,
        code: 'OPERATION_PENDING_OR_NOT_VISIBLE',
        message: `No committed or rejected durable operation matched ${selectorLabel}.`,
        next_action: 'lookup_original_attempt',
      };
    }
    return {
      ok: true,
      status: 200,
      code: 'OPERATION_RECOVERED',
      message: `Recovered ${stored.record.outcome} result (${stored.record.code}) for ${stored.record.action_code}.`,
      operation_id: stored.record.operation_id,
      action_code: stored.record.action_code,
      idempotency_key: stored.record.idempotency_key,
      replayed: true,
      data: { ...stored.record },
    };
  }

  function lookupOperationByKey(
    input: LookupP02OperationByKeyInput
  ): P02ActionResult<P02OperationRecord> {
    const auth = ensureLookupScopeAuthorized(input.scope, input.chapter_id);
    if (!auth.ok) return auth.result;
    const action = input.action_code.trim();
    const key = input.idempotency_key;
    if (!action || !VALID_IDEMPOTENCY_KEY_RE.test(key)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_SELECTOR',
        message: 'Provide both action_code and a valid case-sensitive idempotency_key.',
      };
    }
    const stored = operationsByKey.get(
      `${input.scope}:${auth.chapterId ?? 'global'}:${action}:${key}`
    );
    return formatLookupHit(stored, `${action} / ${key}`);
  }

  function lookupOperationById(
    input: LookupP02OperationByIdInput
  ): P02ActionResult<P02OperationRecord> {
    const auth = ensureLookupScopeAuthorized(input.scope, input.chapter_id);
    if (!auth.ok) return auth.result;
    const opId = input.operation_id.trim();
    if (!opId) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_SELECTOR',
        message: 'Provide a valid operation_id (ULID) to look up.',
      };
    }
    const stored = operationsById.get(opId);
    const scopedMatch =
      stored &&
      stored.record.scope === input.scope &&
      stored.record.chapter_id === auth.chapterId
        ? stored
        : undefined;
    return formatLookupHit(scopedMatch, `ULID ${opId}`);
  }

  return {
    getSnapshot,
    selectPersona,
    selectChapter,
    lookupMembershipIdentity,
    lookupProvisioningIdentity,
    authorizeMembership,
    disableOrRevokeMembership,
    authorizeDutyGrant,
    amendDutyGrant,
    endDutyGrant,
    substituteDutyGrant,
    revokeDutyGrant,
    savePolicyDraft,
    submitPolicyVersion,
    reviewPolicyVersion,
    approvePolicyVersion,
    returnPolicyVersion,
    evaluateWorkflowGate,
    createProvisionedChapter,
    appointInitialHead,
    attemptGlobalIdentityDisable,
    lookupOperationByKey,
    lookupOperationById,
  };
}
