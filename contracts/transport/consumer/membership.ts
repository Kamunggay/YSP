// Validation seam only; never grants server authority or retries an attempt.
import type { components } from '../generated/api.d.ts';
type Success = components['schemas']['MembershipSuccess'];
type Attempt = Readonly<Pick<Success, 'chapter_id'> & Pick<Success['operation']['identity'], 'action_code' | 'idempotency_key'>>;

export function membershipCommitMatches(result: Success, attempt: Attempt): boolean {
  return result.chapter_id === attempt.chapter_id
    && result.membership.chapter_id === attempt.chapter_id
    && result.operation.identity.action_code === attempt.action_code
    && result.operation.identity.idempotency_key === attempt.idempotency_key;
}

const valid: components['schemas']['AuthorizeMembershipRequest'] = {
  identity: { user_id: '9007199254740994' }, idempotency_key: 'membership-attempt-01',
  expected_authority_version: 9, expected_membership_version: null,
};
// @ts-expect-error explicit absence version is required, never inferred
const missingVersion: components['schemas']['AuthorizeMembershipRequest'] = { identity: valid.identity, idempotency_key: valid.idempotency_key, expected_authority_version: 9 };
// @ts-expect-error authority version required independently of target version
const missingAuthority: components['schemas']['EndMembershipRequest'] = { idempotency_key: valid.idempotency_key, expected_membership_version: 3 };
// @ts-expect-error lossless identity strings only
const numericIdentity: components['schemas']['ExistingIdentityReference'] = { user_id: 9007199254740994, display_name: 'Synthetic' };
// @ts-expect-error membership success cannot fabricate document record
const wrongResource: Success['resource_type'] = 'record';
void [valid, missingVersion, missingAuthority, numericIdentity, wrongResource];

type Lookup = components['schemas']['MembershipLookupTerminal']
  | components['schemas']['MembershipLookupRejected']
  | components['schemas']['LookupTerminal']
  | components['schemas']['LookupPending']
  | components['schemas']['LookupUnavailable'];
export function membershipLookupOutcome(result: Lookup): 'committed' | 'rejected' | 'uncertain' | 'record_result' {
  if ('resource_type' in result) {
    return result.action_result === 'success' ? 'committed' : 'rejected';
  }
  return result.action_result === 'uncertain' ? 'uncertain' : 'record_result';
}
