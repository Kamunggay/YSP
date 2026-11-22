import { describe, expect, it } from 'vitest';
import {
  createP26CutoverSubscriptionEngine,
  P26_CONTEXT_STORAGE_KEY,
} from './p26CutoverSubscriptionSlice';
import type {
  CarriedObligationRecord,
  P26LookupResult,
  TrialLifecycleState,
} from './p26CutoverSubscriptionSlice';

describe('p26CutoverSubscriptionSlice — Cutover Carryover, Staged Trial & Subscription Entitlements', () => {
  it('starts strictly unseeded with empty carryover lists and zero totals', () => {
    expect(P26_CONTEXT_STORAGE_KEY).toBe('ysp_p26_context');
    const engine = createP26CutoverSubscriptionEngine();
    const snap = engine.getSnapshot();

    expect(snap.opening_ipc_guards).toEqual([]);
    expect(snap.carried_obligations).toEqual([]);
    expect(snap.stage_gates).toEqual([]);
    expect(snap.provider_subscriptions).toEqual([]);
    expect(snap.trial_state.status).toBe('not_activated');
    expect(snap.trial_state.activation_count).toBe(0);
    expect(snap.summary.inbound_po_carried_qty).toBe('0');
    expect(snap.summary.booth_custody_carried_qty).toBe('0');
    expect(snap.chapter_buyer_revenue_total).toBe('0.00');
    expect(snap.provider_billing_total).toBe('0.00');
    expect(snap.essential_controls_active).toBe(true);
  });

  it('prevents double-counting IPC stock/old DRs and carries genuine obligations separately (AC-21, MIG-02/03)', () => {
    const engine = createP26CutoverSubscriptionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const ipcRes = engine.registerOpeningBaselineGuard({
      ipc_reference: 'IPC-2026-0001',
      item_sku: 'YSP-SHIRT-BLK',
      opening_qty: '120',
      included_old_dr_refs: ['OLD-SUP-DR-88', 'OLD-SUP-DR-89'],
      approved_by_user_id: '101',
      approved_at: '2026-11-01T08:00:00Z',
      idempotency_key: 'p26-ipc-1',
    });
    expect(ipcRes.ok).toBe(true);

    // Block receiving old supplier DR already included in IPC opening count
    const doubleReceive = engine.carryOpenObligation({
      kind: 'inbound_po',
      original_source_ref: 'PO-OLD-2026-01',
      linked_dr_or_receipt_ref: 'OLD-SUP-DR-88',
      outstanding_qty: '50',
      outstanding_amount_php: '0.00',
      already_counted_in_ipc: false,
      actor_user_id: '101',
      created_at: '2026-11-01T08:10:00Z',
    });
    expect(doubleReceive.ok).toBe(false);
    expect(doubleReceive.code).toBe('IPC_STOCK_ALREADY_COUNTED_NO_SECOND_RECEIPT');

    // Genuine inbound PO -> inbound only, never on-hand
    const inboundPo = engine.carryOpenObligation({
      kind: 'inbound_po',
      original_source_ref: 'PO-2026-OPEN-09',
      linked_dr_or_receipt_ref: 'PO-2026-OPEN-09-PEND',
      outstanding_qty: '40',
      outstanding_amount_php: '0.00',
      already_counted_in_ipc: false,
      actor_user_id: '101',
      created_at: '2026-11-01T08:15:00Z',
      idempotency_key: 'p26-carry-po',
    });
    expect(inboundPo.ok).toBe(true);
    expect((inboundPo.data as CarriedObligationRecord).inventory_impact).toBe(
      'inbound_only_not_on_hand'
    );

    // Carried OR -> duplicate_cash_receipt_created false & chapter revenue remains 0.00
    const carriedOr = engine.carryOpenObligation({
      kind: 'carried_payment_or',
      original_source_ref: 'SO-2026-OPEN-14',
      linked_dr_or_receipt_ref: 'OR-2026-CARRIED-401',
      outstanding_qty: '0',
      outstanding_amount_php: '1200.00',
      already_counted_in_ipc: false,
      actor_user_id: '102',
      created_at: '2026-11-01T08:20:00Z',
      idempotency_key: 'p26-carry-or',
    });
    expect(carriedOr.ok).toBe(true);
    expect((carriedOr.data as CarriedObligationRecord).duplicate_cash_receipt_created).toBe(false);

    // Separate booth custody
    const boothCarry = engine.carryOpenObligation({
      kind: 'booth_custody',
      original_source_ref: 'EVT-2026-CAMPUS',
      linked_dr_or_receipt_ref: 'IS-BOOTH-OLD-11',
      outstanding_qty: '25',
      outstanding_amount_php: '0.00',
      already_counted_in_ipc: false,
      actor_user_id: '103',
      created_at: '2026-11-01T08:25:00Z',
    });
    expect(boothCarry.ok).toBe(true);
    expect((boothCarry.data as CarriedObligationRecord).inventory_impact).toBe(
      'separate_booth_custody_not_stockroom'
    );

    // Duplicate carryover rejected
    const dupCarry = engine.carryOpenObligation({
      kind: 'carried_payment_or',
      original_source_ref: 'SO-2026-OPEN-99',
      linked_dr_or_receipt_ref: 'OR-2026-CARRIED-401',
      outstanding_qty: '0',
      outstanding_amount_php: '500.00',
      already_counted_in_ipc: false,
      actor_user_id: '102',
      created_at: '2026-11-01T08:30:00Z',
    });
    expect(dupCarry.ok).toBe(false);
    expect(dupCarry.code).toBe('DUPLICATE_CARRIED_SOURCE_REF');

    expect(engine.getSnapshot().chapter_buyer_revenue_total).toBe('0.00');
    expect(engine.getSnapshot().summary.inbound_po_carried_qty).toBe('40');
    expect(engine.getSnapshot().summary.booth_custody_carried_qty).toBe('25');
  });

  it('enforces once-only 30-day Head activation, 14-day unpaid grace, queued block, and essential controls (SUB-01/03/04)', () => {
    const engine = createP26CutoverSubscriptionEngine({
      chapter_id: '1',
      chapter_name: 'YSP Cebu Chapter',
    });

    // Provider role cannot approve Gate 1
    const providerGateDenied = engine.authorizeRolloutGate({
      gate_id: 'MIG_04_GATE_1',
      approver_user_id: '900',
      approver_duty: 'provider_provisioning',
      recovery_readiness_verified: true,
      approved_at: '2026-11-01T09:00:00Z',
    });
    expect(providerGateDenied.ok).toBe(false);
    expect(providerGateDenied.code).toBe('PROVIDER_ROLE_CANNOT_APPROVE_CHAPTER_GATE');

    // Missing recovery readiness blocks Gate 1
    const noRecoveryGate = engine.authorizeRolloutGate({
      gate_id: 'MIG_04_GATE_1',
      approver_user_id: '101',
      approver_duty: 'CHAPTER_HEAD',
      recovery_readiness_verified: false,
      approved_at: '2026-11-01T09:05:00Z',
    });
    expect(noRecoveryGate.ok).toBe(false);
    expect(noRecoveryGate.code).toBe('RECOVERY_READINESS_REQUIRED_BEFORE_LIVE');

    const gate1 = engine.authorizeRolloutGate({
      gate_id: 'MIG_04_GATE_1',
      approver_user_id: '101',
      approver_duty: 'CHAPTER_HEAD',
      recovery_readiness_verified: true,
      approved_at: '2026-11-01T09:10:00Z',
    });
    expect(gate1.ok).toBe(true);

    // Non-Head cannot activate trial
    const nonHeadAct = engine.activateLiveTrialOnce({
      actor_user_id: '102',
      actor_duty: 'INVENTORY',
      enabled_rollout_stage: 'MIG_04_GATE_1',
      setup_approved: true,
      opening_ipc_locked: true,
      recovery_ready: true,
      commercial_terms_approved: true,
      activated_at: '2026-11-01T10:00:00Z',
    });
    expect(nonHeadAct.ok).toBe(false);
    expect(nonHeadAct.code).toBe('CHAPTER_HEAD_REQUIRED_FOR_ACTIVATION');

    // Head activates once-only 30-day trial
    const actRes = engine.activateLiveTrialOnce({
      actor_user_id: '101',
      actor_duty: 'CHAPTER_HEAD',
      enabled_rollout_stage: 'MIG_04_GATE_1',
      setup_approved: true,
      opening_ipc_locked: true,
      recovery_ready: true,
      commercial_terms_approved: true,
      activated_at: '2026-11-01T10:00:00Z',
      idempotency_key: 'p26-act-1',
    });
    expect(actRes.ok).toBe(true);
    const trialData = actRes.data as TrialLifecycleState;
    expect(trialData.trial_ends_at).toBe('2026-12-01T10:00:00Z');
    expect(trialData.grace_ends_at).toBe('2026-12-15T10:00:00Z');

    // Second activation attempt strictly blocked even after renaming / advancing stage
    const renameRes = engine.renameChapterOrAdvanceStage({
      new_chapter_name: 'YSP Cebu Renamed',
      next_stage: 'MIG_05_GATE_2',
      actor_user_id: '101',
      updated_at: '2026-11-10T10:00:00Z',
    });
    expect(renameRes.ok).toBe(true);
    expect((renameRes.data as TrialLifecycleState).trial_ends_at).toBe('2026-12-01T10:00:00Z');

    const secondAct = engine.activateLiveTrialOnce({
      actor_user_id: '101',
      actor_duty: 'CHAPTER_HEAD',
      enabled_rollout_stage: 'MIG_04_GATE_1',
      setup_approved: true,
      opening_ipc_locked: true,
      recovery_ready: true,
      commercial_terms_approved: true,
      activated_at: '2026-11-11T10:00:00Z',
    });
    expect(secondAct.ok).toBe(false);
    expect(secondAct.code).toBe('TRIAL_ALREADY_ACTIVATED_ONCE_ONLY');

    // Inside 30-day window -> posting allowed
    const duringTrial = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'new_officer_posting',
      evaluated_at: '2026-12-01T10:00:00Z',
    });
    expect(duringTrial.ok).toBe(true);

    // Unpaid grace window (30d + 1s): new postings & queued jobs blocked; grace read/export & essential controls allowed
    const expiredPost = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'new_officer_posting',
      evaluated_at: '2026-12-01T10:00:01Z',
    });
    expect(expiredPost.ok).toBe(false);
    expect(expiredPost.code).toBe('TRIAL_EXPIRED_NEW_POSTING_BLOCKED');

    const queuedBlocked = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'queued_business_job',
      evaluated_at: '2026-12-05T10:00:00Z',
    });
    expect(queuedBlocked.ok).toBe(false);
    expect(queuedBlocked.code).toBe('QUEUED_POSTING_BLOCKED_AT_EXPIRY');

    const graceRead = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'scoped_read_export',
      evaluated_at: '2026-12-15T10:00:00Z',
    });
    expect(graceRead.ok).toBe(true);
    expect(graceRead.code).toBe('GRACE_SCOPED_READ_EXPORT_ALLOWED');

    // Post-grace (+1s): read/export suspended, essential controls STILL active
    const postGraceRead = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'scoped_read_export',
      evaluated_at: '2026-12-15T10:00:01Z',
    });
    expect(postGraceRead.ok).toBe(false);
    expect(postGraceRead.code).toBe('POST_GRACE_READ_EXPORT_SUSPENDED');

    const essentialLapse = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '102',
      actor_chapter_id: '1',
      actor_has_chapter_membership: true,
      actor_disabled: false,
      is_provider_billing_only: false,
      action_kind: 'essential_control_reconciliation',
      evaluated_at: '2026-12-20T00:00:00Z',
    });
    expect(essentialLapse.ok).toBe(true);
    expect(essentialLapse.code).toBe('ESSENTIAL_CONTROL_PERMITTED_DURING_LAPSE');
  });

  it('isolates provider subscription money, blocks auto-deletion, and supports lookup recovery (SUB-02/05/06)', () => {
    const engine = createP26CutoverSubscriptionEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    // Provider billing account cannot view chapter operations directly
    const providerAccessDenied = engine.evaluateEntitlementAndExecuteAction({
      actor_user_id: '900',
      actor_chapter_id: '1',
      actor_has_chapter_membership: false,
      actor_disabled: false,
      is_provider_billing_only: true,
      action_kind: 'scoped_read_export',
      evaluated_at: '2026-11-15T08:00:00Z',
    });
    expect(providerAccessDenied.ok).toBe(false);
    expect(providerAccessDenied.code).toBe('PROVIDER_BILLING_NO_CHAPTER_ACCESS');

    // Extend paid subscription under provider_billing authority -> keeps chapter_buyer_revenue_total at 0.00
    const subRes = engine.recordProviderSubscriptionExtension({
      provider_verifier_id: '900',
      provider_role: 'provider_billing',
      payment_reference: 'PROV-SUB-2026-12',
      amount_php: '1999.00',
      paid_through_at: '2027-01-15T10:00:00Z',
      verified_at: '2026-12-16T09:00:00Z',
      idempotency_key: 'p26-sub-ext',
    });
    expect(subRes.ok).toBe(true);
    expect(subRes.code).toBe('PROVIDER_SUBSCRIPTION_EXTENDED');
    expect(engine.getSnapshot().provider_billing_total).toBe('1999.00');
    expect(engine.getSnapshot().chapter_buyer_revenue_total).toBe('0.00');

    // Auto-delete always blocked
    const delBlocked = engine.attemptAutoDeleteOnLapseOrBudget({
      actor_user_id: '900',
      reason: 'Trial expired and credit exhausted',
      attempted_at: '2026-12-20T00:00:00Z',
    });
    expect(delBlocked.ok).toBe(false);
    expect(delBlocked.code).toBe('AUTO_DELETION_FORBIDDEN_PRESERVATION_REQUIRED');

    // Lookup recovery
    const lookupOk = engine.lookupCutoverOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p26-sub-ext',
    });
    expect(lookupOk.ok).toBe(true);
    expect((lookupOk.data as P26LookupResult).action_result).toBe('recovered');

    const lookupForeign = engine.lookupCutoverOperation({
      query_type: 'by_key',
      chapter_id: '2',
      idempotency_key: 'p26-sub-ext',
    });
    expect(lookupForeign.ok).toBe(false);
    expect(lookupForeign.code).toBe('FORBIDDEN_SCOPE');
  });
});
