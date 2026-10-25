// Contract exercise only; all permission and material checks remain server-owned.
import type { components } from '../generated/api.d.ts';

type Success = components['schemas']['PolicySuccess'];
export type PolicyAttempt = Readonly<{
  chapter_id: string;
  policy_id: string;
  category: components['schemas']['PolicyCategory'];
  policy_code: string;
  action_code: Success['operation']['identity']['action_code'];
  idempotency_key: string;
}>;

export function policyCommitMatches(result: Success, attempt: PolicyAttempt): boolean {
  return result.chapter_id === attempt.chapter_id
    && result.root.chapter_id === attempt.chapter_id
    && result.version.chapter_id === attempt.chapter_id
    && result.root.id === attempt.policy_id
    && result.version.policy_id === attempt.policy_id
    && result.root.category === attempt.category
    && result.version.category === attempt.category
    && result.root.policy_code === attempt.policy_code
    && result.version.policy_code === attempt.policy_code
    && result.operation.identity.action_code === attempt.action_code
    && result.operation.identity.idempotency_key === attempt.idempotency_key;
}

type Lookup = components['schemas']['PolicyLookupTerminal'] | components['schemas']['PolicyLookupRejected']
  | components['schemas']['LookupTerminal'] | components['schemas']['LookupPending'] | components['schemas']['LookupUnavailable']
  | components['schemas']['MembershipLookupTerminal'] | components['schemas']['MembershipLookupRejected']
  | components['schemas']['DutyGrantLookupTerminal'] | components['schemas']['DutyGrantLookupRejected'];

export function policyLookupOutcome(result: Lookup): 'committed' | 'rejected' | 'uncertain' | 'other_resource' {
  if ('resource_type' in result) {
    if (result.resource_type !== 'policy') return 'other_resource';
    return result.action_result === 'success' ? 'committed' : 'rejected';
  }
  return result.action_result === 'uncertain' ? 'uncertain' : 'other_resource';
}

type Approval = components['schemas']['ApprovePolicyVersionRequest'];
// @ts-expect-error Authority is mandatory independently of material and row versions.
const noAuthority: Approval = { idempotency_key: 'synthetic', expected_row_version: 4, expected_material_version: 3, material: { chapter_id: '1', record: { id: '2', kind: 'CONFIG' }, material_version: 3, material_hash: 'a'.repeat(64) }, reason: 'Synthetic', effective_from: '2026-10-26T00:00:00.000000Z', effective_until: null };
// @ts-expect-error Exact lossless IDs are strings.
const numericPolicy: components['schemas']['PolicyRoot']['id'] = 9007199254740994;
// @ts-expect-error A metadata-only draft has no settings payload.
const arbitrarySettings: components['schemas']['PolicyMetadata'] = { name: 'Synthetic', schema_id: 'urn:ysp:policy:synthetic', schema_version: 1, effective_from: null, effective_until: null, supersedes_version_id: null, settings: {} };
// @ts-expect-error Policy safe next steps do not silently widen original shared feedback.
const widenedNextAction: components['schemas']['NextAction'] = { action: 'request_responsible_duty' };
// @ts-expect-error Generic expected_version cannot replace independent guards.
const genericVersion: Approval = { expected_version: 3 };
void [noAuthority, numericPolicy, arbitrarySettings, widenedNextAction, genericVersion];
