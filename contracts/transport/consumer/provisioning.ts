// Contract consumer exercise only; no operation store, persistence or retries.
import type { components, operations } from '../generated/api.d.ts';
import { exchangeSession } from './session.ts';

type Scope = components['schemas']['ProvisionerScope'];
export type ProvisioningAttempt = Readonly<{
  scope: Readonly<Scope>;
  action_code: 'provider.chapters.create' | 'provider.initial_head.appoint';
  idempotency_key: string;
  provisioning_id: string | null;
  operation_id?: string;
}>;
type Lookup = components['schemas']['ProvisioningLookup'];
type LookupReply = { kind: 'response'; status: 200; body: Lookup }
  | { kind: 'response'; status: Exclude<keyof operations['lookupProvisioningByKey']['responses'], 200>; body: unknown }
  | { kind: 'unresolved'; reason: string };

const sameScope = (a: Readonly<Scope>, b: Readonly<Scope>): boolean =>
  a.kind === b.kind && a.organization_id === b.organization_id && a.provider_user_id === b.provider_user_id;

export function provisioningLookupOutcome(reply: LookupReply, attempt: ProvisioningAttempt): 'committed' | 'rejected' | 'uncertain' {
  if (reply.kind !== 'response' || reply.status !== 200) return 'uncertain';
  const result = reply.body;
  if (!sameScope(result.scope, attempt.scope) || result.action_result === 'uncertain') return 'uncertain';
  const identity = result.operation.identity;
  if (identity.action_code !== attempt.action_code || identity.idempotency_key !== attempt.idempotency_key
    || attempt.operation_id !== undefined && identity.operation_id !== attempt.operation_id) return 'uncertain';
  if (result.action_result === 'blocked') return result.provisioning_id === attempt.provisioning_id ? 'rejected' : 'uncertain';
  if (!sameScope(result.provisioning.scope, attempt.scope)
    || attempt.action_code === 'provider.initial_head.appoint' && result.provisioning.id !== attempt.provisioning_id
    || attempt.action_code === 'provider.chapters.create' && attempt.provisioning_id !== null) return 'uncertain';
  return 'committed';
}

export async function compileProvisioning(signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const common = { origin: 'https://ysp.example.test', cookie: '', signal, fetch: fetcher };
  const context = await exchangeSession('getProvisioningContext', common);
  if (context.kind === 'response' && context.status === 200) {
    const created = await exchangeSession('createProvisionedChapter', { ...common, body: {
      idempotency_key: 'synthetic-create-key', expected_provider_authority_version: context.body.authority_version,
      chapter: {code:'YSP_TEST',name:'Synthetic chapter'},
    } });
    if (created.kind === 'response' && created.status === 200) {
      const noMembership: 'not_applicable' = created.body.provisioning.initial_head_membership_authorization;
      const existing = await exchangeSession('lookupProvisioningIdentity', { ...common, body:{user_id:'9007199254740994'} });
      if(existing.kind === 'response' && existing.status === 200 && existing.body.identity !== null) {
        await exchangeSession('appointInitialHead', { ...common, path:{provisioning_id:created.body.provisioning.id}, body:{
          idempotency_key:'synthetic-appoint-key',expected_provider_authority_version:context.body.authority_version,
          expected_provisioning_version:created.body.provisioning.version,identity:{user_id:existing.body.identity.user_id},reason:'Explicit designation',
        } });
      }
      void noMembership;
    }
  }
  const lookup = await exchangeSession('lookupProvisioningByKey', { ...common, query:{action_code:'provider.chapters.create',idempotency_key:'synthetic-create-key'} });
  if (lookup.kind === 'response' && lookup.status === 200 && lookup.body.action_result === 'uncertain') {
    const absentOperation: null = lookup.body.operation;
    // @ts-expect-error An uncertain result supplies no chapter/provisioning resource.
    lookup.body.provisioning;
    void absentOperation;
  }
  // @ts-expect-error Provisioning requires a current provider authority version.
  await exchangeSession('createProvisionedChapter', { ...common, body:{idempotency_key:'key',chapter:{code:'YSP_TEST',name:'Test'}} });
  // @ts-expect-error Initial appointment requires an existing identity and resource version.
  await exchangeSession('appointInitialHead', { ...common, path:{provisioning_id:'1'},body:{idempotency_key:'key',expected_provider_authority_version:1,reason:'Test'} });
  // @ts-expect-error Caller cannot pick organization or actor scope.
  await exchangeSession('lookupProvisioningByKey', { ...common,query:{action_code:'provider.chapters.create',idempotency_key:'key',organization_id:'1'} });
  // @ts-expect-error Key-only lookup is ambiguous.
  await exchangeSession('lookupProvisioningByKey', { ...common,query:{idempotency_key:'key'} });
  // @ts-expect-error Provider operations do not take a chapter context.
  await exchangeSession('getProvisioningContext', { ...common,contextRevision:'ctx_synthetic'});
  // @ts-expect-error Numeric identity loses exactness.
  await exchangeSession('lookupProvisioningIdentity', { ...common,body:{user_id:9007199254740994} });
  // @ts-expect-error Appointment cannot authorize membership.
  const invalid: components['schemas']['AppointInitialHeadRequest'] = {idempotency_key:'key',expected_provider_authority_version:1,expected_provisioning_version:1,identity:{user_id:'1'},reason:'Test',authorize_membership:true};
  void invalid;
}
