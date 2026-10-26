// Validation seam only. This consumer neither grants authority nor retries mutations.
import type { components } from '../generated/api.d.ts';

type Success = components['schemas']['DutyGrantSuccess'];
type Attempt = Readonly<Pick<Success, 'chapter_id'> & Pick<Success['grant'], 'membership_id'>
  & Pick<Success['operation']['identity'], 'action_code' | 'idempotency_key'>>;

export function dutyGrantCommitMatches(result: Success, attempt: Attempt): boolean {
  return result.chapter_id === attempt.chapter_id
    && result.grant.chapter_id === attempt.chapter_id
    && result.grant.membership_id === attempt.membership_id
    && result.operation.identity.action_code === attempt.action_code
    && result.operation.identity.idempotency_key === attempt.idempotency_key;
}

type Lookup = components['schemas']['DutyGrantLookupTerminal'] | components['schemas']['DutyGrantLookupRejected']
  | components['schemas']['PolicyLookupTerminal'] | components['schemas']['PolicyLookupRejected']
  | components['schemas']['LookupPending'] | components['schemas']['LookupUnavailable']
  | components['schemas']['MembershipLookupTerminal'] | components['schemas']['MembershipLookupRejected']
  | components['schemas']['LookupTerminal'];
export function dutyGrantLookupOutcome(result: Lookup): 'committed' | 'rejected' | 'uncertain' | 'other_resource' {
  if ('resource_type' in result) {
    if (result.resource_type !== 'duty_grant') return 'other_resource';
    return result.action_result === 'success' ? 'committed' : 'rejected';
  }
  return result.action_result === 'uncertain' ? 'uncertain' : 'other_resource';
}

const terms: components['schemas']['DutyGrantTerms'] = {
  duty_code: 'RF_APPROVER', scope_kind: 'unit', requesting_unit_id: '9007199254740994',
  starts_at: '2026-10-26T00:00:00.000000Z', ends_at: null, monetary_limit: { currency: 'PHP', amount: '1000.00' },
};
const valid: components['schemas']['AuthorizeDutyGrantRequest'] = {
  idempotency_key: 'synthetic-grant-01', expected_authority_version: 9, expected_membership_version: 3,
  expected_grant_version: null, membership_id: '9007199254740995', reason: 'Synthetic explicit authorization', grant: terms,
};
// @ts-expect-error row version is mandatory on amendments
const missingGrantVersion: components['schemas']['AmendDutyGrantRequest'] = { grant: terms, reason: 'Synthetic', idempotency_key: 'key', expected_authority_version: 9, expected_membership_version: 3 };
// @ts-expect-error actor authority is separate from the target membership version
const missingAuthority: components['schemas']['RevokeDutyGrantRequest'] = { reason: 'Synthetic', idempotency_key: 'key', expected_grant_version: 3, expected_membership_version: 3 };
// @ts-expect-error alternate requires both target membership and target version
const missingAlternateTarget: components['schemas']['SubstituteDutyGrantRequest'] = { grant: terms, reason: 'Synthetic', idempotency_key: 'key', expected_grant_version: 3, expected_membership_version: 3, expected_authority_version: 9 };
// @ts-expect-error grant ID strings preserve values above JavaScript safe integers
const numericId: components['schemas']['AdminDutyGrant']['id'] = 9007199254740994;
// @ts-expect-error exact decimal wire value is a string
const numericMoney: components['schemas']['PostedMoney'] = { currency: 'PHP', amount: 1000 };
// @ts-expect-error duties are fixed; provider authority is not a chapter duty
const providerDuty: components['schemas']['DutyGrantTerms']['duty_code'] = 'provisioner';
// @ts-expect-error grant success has its own resource discriminant
const wrongResource: Success['resource_type'] = 'membership';
void [valid, missingGrantVersion, missingAuthority, missingAlternateTarget, numericId, numericMoney, providerDuty, wrongResource];
