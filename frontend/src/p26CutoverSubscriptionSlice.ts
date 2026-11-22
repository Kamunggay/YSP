import { computeDeterministicHash } from './canonicalHash';

export const P26_CONTEXT_STORAGE_KEY = 'ysp_p26_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MS_PER_DAY = 86_400_000;

export type CarriedObligationKind =
  | 'active_rf'
  | 'active_so'
  | 'carried_payment_or'
  | 'inbound_po'
  | 'booth_custody';

export type RolloutStageGateId =
  | 'MIG_04_GATE_1'
  | 'MIG_05_GATE_2'
  | 'MIG_06_GATE_3'
  | 'MIG_07_GATE_4';

export type EntitlementActionKind =
  | 'new_officer_posting'
  | 'queued_business_job'
  | 'scoped_read_export'
  | 'essential_control_reconciliation';

export type TrialLifecycleStatus =
  | 'not_activated'
  | 'trial_active'
  | 'unpaid_grace'
  | 'post_grace_suspended'
  | 'paid_active';

export interface OpeningIpcBaselineGuard {
  ipc_id: string;
  chapter_id: string;
  ipc_reference: string;
  item_sku: string;
  opening_qty: string;
  included_old_dr_refs: ReadonlyArray<string>;
  approved_by_user_id: string;
  approved_at: string;
  locked: boolean;
}

export interface CarriedObligationRecord {
  obligation_id: string;
  chapter_id: string;
  kind: CarriedObligationKind;
  original_source_ref: string;
  linked_dr_or_receipt_ref: string;
  outstanding_qty: string;
  outstanding_amount_php: string;
  inventory_impact:
    | 'inbound_only_not_on_hand'
    | 'separate_booth_custody_not_stockroom'
    | 'commitment_tracking_only';
  duplicate_cash_receipt_created: boolean;
  source_evidence_retained: boolean;
  created_at: string;
}

export interface StageGateApprovalRecord {
  gate_id: RolloutStageGateId;
  chapter_id: string;
  approver_user_id: string;
  approver_duty: string;
  recovery_readiness_verified: boolean;
  approved_at: string;
}

export interface TrialLifecycleState {
  status: TrialLifecycleStatus;
  activated_at: string | null;
  activated_by_user_id: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  paid_through_at: string | null;
  enabled_rollout_stage: RolloutStageGateId | null;
  chapter_name_at_activation: string | null;
  rename_count: number;
  activation_count: number;
}

export interface ProviderSubscriptionRecord {
  subscription_id: string;
  chapter_id: string;
  provider_verifier_id: string;
  provider_role: string;
  payment_reference: string;
  amount_php: string;
  paid_through_at: string;
  verified_at: string;
}

export interface EntitlementEvaluationOutcome {
  status: TrialLifecycleStatus;
  evaluated_at: string;
  action_kind: EntitlementActionKind;
  allowed: boolean;
  code: string;
  outstanding_obligations_preserved: boolean;
  auto_forfeited_count: number;
  commercial_funds_separate_from_buyer_money: boolean;
}

export interface P26HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P26SummaryMetrics {
  ipc_guards_count: number;
  carried_obligations_count: number;
  inbound_po_carried_qty: string;
  booth_custody_carried_qty: string;
  trial_status: TrialLifecycleStatus;
  activation_count: number;
  chapter_buyer_revenue_total: string;
  provider_billing_total: string;
  essential_controls_active: boolean;
}

export interface P26OperationLedgerEntry {
  operation_id: string;
  chapter_id: string;
  action_code: string;
  actor_user_id: string;
  target_id: string | null;
  idempotency_key: string;
  payload_fingerprint: string;
  http_status: number;
  code: string;
  message: string;
  snapshot: unknown;
}

export interface P26ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P26LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P26EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  opening_ipc_guards: ReadonlyArray<OpeningIpcBaselineGuard>;
  carried_obligations: ReadonlyArray<CarriedObligationRecord>;
  stage_gates: ReadonlyArray<StageGateApprovalRecord>;
  trial_state: TrialLifecycleState;
  provider_subscriptions: ReadonlyArray<ProviderSubscriptionRecord>;
  chapter_buyer_revenue_total: string;
  provider_billing_total: string;
  essential_controls_active: boolean;
  history: ReadonlyArray<P26HistoryEntry>;
  summary: P26SummaryMetrics;
  operation_ledger: ReadonlyArray<P26OperationLedgerEntry>;
  last_action: P26ActionResult | null;
}

export interface P26EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  opening_ipc_guards?: ReadonlyArray<OpeningIpcBaselineGuard> | undefined;
  carried_obligations?: ReadonlyArray<CarriedObligationRecord> | undefined;
  stage_gates?: ReadonlyArray<StageGateApprovalRecord> | undefined;
  trial_state?: TrialLifecycleState | undefined;
  provider_subscriptions?: ReadonlyArray<ProviderSubscriptionRecord> | undefined;
  history?: ReadonlyArray<P26HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P26OperationLedgerEntry> | undefined;
}

export interface P26CutoverSubscriptionEngine {
  getSnapshot: () => P26EngineSnapshot;
  registerOpeningBaselineGuard: (input: {
    ipc_reference: string;
    item_sku: string;
    opening_qty: string;
    included_old_dr_refs: ReadonlyArray<string>;
    approved_by_user_id: string;
    approved_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<OpeningIpcBaselineGuard>;
  carryOpenObligation: (input: {
    kind: CarriedObligationKind;
    original_source_ref: string;
    linked_dr_or_receipt_ref: string;
    outstanding_qty: string;
    outstanding_amount_php: string;
    already_counted_in_ipc: boolean;
    actor_user_id: string;
    created_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<CarriedObligationRecord>;
  authorizeRolloutGate: (input: {
    gate_id: RolloutStageGateId;
    approver_user_id: string;
    approver_duty: string;
    recovery_readiness_verified: boolean;
    approved_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<StageGateApprovalRecord>;
  activateLiveTrialOnce: (input: {
    actor_user_id: string;
    actor_duty: string;
    enabled_rollout_stage: RolloutStageGateId;
    setup_approved: boolean;
    opening_ipc_locked: boolean;
    recovery_ready: boolean;
    commercial_terms_approved: boolean;
    activated_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<TrialLifecycleState>;
  renameChapterOrAdvanceStage: (input: {
    new_chapter_name?: string | undefined;
    next_stage?: RolloutStageGateId | undefined;
    actor_user_id: string;
    updated_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<TrialLifecycleState>;
  evaluateEntitlementAndExecuteAction: (input: {
    actor_user_id: string;
    actor_chapter_id: string;
    actor_has_chapter_membership: boolean;
    actor_disabled: boolean;
    is_provider_billing_only: boolean;
    action_kind: EntitlementActionKind;
    evaluated_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<EntitlementEvaluationOutcome>;
  recordProviderSubscriptionExtension: (input: {
    provider_verifier_id: string;
    provider_role: string;
    payment_reference: string;
    amount_php: string;
    paid_through_at: string;
    verified_at: string;
    idempotency_key?: string | undefined;
  }) => P26ActionResult<ProviderSubscriptionRecord>;
  attemptAutoDeleteOnLapseOrBudget: (input: {
    actor_user_id: string;
    reason: string;
    attempted_at: string;
  }) => P26ActionResult<{ preserved_obligations_count: number }>;
  lookupCutoverOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P26ActionResult<P26LookupResult>;
}

const PROVIDER_ONLY_ROLES = new Set([
  'provider_billing',
  'provider_provisioning',
  'provider_recovery',
]);

function readStoredP26Options(): P26EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P26_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P26EngineOptions;
  } catch {
    return undefined;
  }
}

function toCents(amount: string): bigint {
  const [whole = '0', frac = '00'] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const rem = abs % 100n;
  return `${negative ? '-' : ''}${whole.toString()}.${rem.toString().padStart(2, '0')}`;
}

function addDaysUtc(isoUtc: string, days: number): string {
  const baseMs = Date.parse(isoUtc);
  const nextIso = new Date(baseMs + days * MS_PER_DAY).toISOString();
  return nextIso.replace(/\.000Z$/, 'Z');
}

function defaultTrialState(): TrialLifecycleState {
  return {
    status: 'not_activated',
    activated_at: null,
    activated_by_user_id: null,
    trial_ends_at: null,
    grace_ends_at: null,
    paid_through_at: null,
    enabled_rollout_stage: null,
    chapter_name_at_activation: null,
    rename_count: 0,
    activation_count: 0,
  };
}

/**
 * Creates a chapter-scoped cutover carryover, staged gate activation, and subscription entitlement engine.
 * Enforces no double-counting of IPC stock/carried receipts, once-only 30-day live trial with 14-day read/export
 * grace, preservation of outstanding funded obligations and essential controls, and provider billing isolation.
 */
export function createP26CutoverSubscriptionEngine(
  options?: P26EngineOptions
): P26CutoverSubscriptionEngine {
  const seed = options ?? readStoredP26Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  let chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 26000;

  const openingIpcGuards: OpeningIpcBaselineGuard[] = (seed.opening_ipc_guards ?? []).map((g) =>
    structuredClone(g)
  );
  const carriedObligations: CarriedObligationRecord[] = (seed.carried_obligations ?? []).map((o) =>
    structuredClone(o)
  );
  const stageGates: StageGateApprovalRecord[] = (seed.stage_gates ?? []).map((s) =>
    structuredClone(s)
  );
  const trialState: TrialLifecycleState = seed.trial_state
    ? structuredClone(seed.trial_state)
    : defaultTrialState();
  const providerSubscriptions: ProviderSubscriptionRecord[] = (
    seed.provider_subscriptions ?? []
  ).map((p) => structuredClone(p));
  const history: P26HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P26OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P26ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P26${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P26SummaryMetrics {
    let inboundQty = 0n;
    let boothQty = 0n;
    for (const o of carriedObligations) {
      if (o.kind === 'inbound_po') inboundQty += BigInt(o.outstanding_qty);
      if (o.kind === 'booth_custody') boothQty += BigInt(o.outstanding_qty);
    }

    let providerTotalCents = 0n;
    for (const s of providerSubscriptions) {
      providerTotalCents += toCents(s.amount_php);
    }

    return {
      ipc_guards_count: openingIpcGuards.length,
      carried_obligations_count: carriedObligations.length,
      inbound_po_carried_qty: inboundQty.toString(),
      booth_custody_carried_qty: boothQty.toString(),
      trial_status: trialState.status,
      activation_count: trialState.activation_count,
      chapter_buyer_revenue_total: '0.00',
      provider_billing_total: fromCents(providerTotalCents),
      essential_controls_active: true,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P26_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          opening_ipc_guards: openingIpcGuards,
          carried_obligations: carriedObligations,
          stage_gates: stageGates,
          trial_state: trialState,
          provider_subscriptions: providerSubscriptions,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P26ActionResult<T> {
    const res: P26ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P26ActionResult<T> | null {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) return null;
    const trimmed = idempotencyKey.trim();
    const existing = operationLedger.find(
      (o) => o.chapter_id === chapterId && o.action_code === actionCode && o.idempotency_key === trimmed
    );
    if (!existing) return null;
    const fingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      payload,
    });
    if (existing.payload_fingerprint !== fingerprint) {
      return fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        `Idempotency key "${trimmed}" cannot be reused with a modified payload.`
      );
    }
    const replayRes: P26ActionResult<T> = {
      ok: true,
      http_status: existing.http_status,
      code: existing.code,
      message: `${existing.message} (idempotent replay)`,
      replayed: true,
      data: structuredClone(existing.snapshot) as T,
    };
    lastAction = replayRes;
    return replayRes;
  }

  function recordLedgerAndPersist<T>(
    actionCode: string,
    actorUserId: string,
    targetId: string | null,
    idempotencyKey: string | undefined,
    payload: unknown,
    httpStatus: number,
    code: string,
    message: string,
    data: T
  ): P26ActionResult<T> {
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const fingerprint = computeDeterministicHash({
        chapter_id: chapterId,
        action_code: actionCode,
        payload,
      });
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: actionCode,
        actor_user_id: actorUserId,
        target_id: targetId,
        idempotency_key: idempotencyKey.trim(),
        payload_fingerprint: fingerprint,
        http_status: httpStatus,
        code,
        message,
        snapshot: structuredClone(data),
      });
    }
    const res: P26ActionResult<T> = {
      ok: true,
      http_status: httpStatus,
      code,
      message,
      replayed: false,
      data,
    };
    lastAction = res;
    persistSnapshot();
    return res;
  }

  return {
    getSnapshot() {
      const summary = computeSummary();
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        opening_ipc_guards: openingIpcGuards.map((g) => structuredClone(g)),
        carried_obligations: carriedObligations.map((o) => structuredClone(o)),
        stage_gates: stageGates.map((s) => structuredClone(s)),
        trial_state: structuredClone(trialState),
        provider_subscriptions: providerSubscriptions.map((p) => structuredClone(p)),
        chapter_buyer_revenue_total: summary.chapter_buyer_revenue_total,
        provider_billing_total: summary.provider_billing_total,
        essential_controls_active: summary.essential_controls_active,
        history: history.map((h) => structuredClone(h)),
        summary,
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerOpeningBaselineGuard(input) {
      const replay = checkIdempotency<OpeningIpcBaselineGuard>(
        'p26.register_ipc_guard',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const ipcRef = input.ipc_reference.trim();
      const sku = input.item_sku.trim();
      const qtyStr = input.opening_qty.trim();
      const actor = input.approved_by_user_id.trim();
      const at = input.approved_at.trim();

      if (!ipcRef || !sku || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'IPC reference, item SKU, approver ID, and UTC timestamp are required.'
        );
      }
      if (!INTEGER_PATTERN.test(qtyStr) || BigInt(qtyStr) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Opening quantity must be a positive whole number.');
      }
      if (openingIpcGuards.some((g) => g.ipc_reference === ipcRef)) {
        return fail(
          409,
          'DUPLICATE_IPC_REFERENCE',
          `Opening baseline reference "${ipcRef}" is already locked.`
        );
      }

      const drRefs = input.included_old_dr_refs.map((r) => r.trim()).filter((r) => r.length > 0);
      const guard: OpeningIpcBaselineGuard = {
        ipc_id: nextId(),
        chapter_id: chapterId,
        ipc_reference: ipcRef,
        item_sku: sku,
        opening_qty: qtyStr,
        included_old_dr_refs: drRefs,
        approved_by_user_id: actor,
        approved_at: at,
        locked: true,
      };
      openingIpcGuards.push(guard);

      history.push({
        event_id: nextId(),
        target_id: guard.ipc_id,
        action: 'opening_ipc_guard_locked',
        actor_user_id: actor,
        reason: `Locked ${ipcRef} (${qtyStr} units) covering DRs [${drRefs.join(', ')}]`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p26.register_ipc_guard',
        actor,
        guard.ipc_id,
        input.idempotency_key,
        input,
        201,
        'OPENING_IPC_GUARD_LOCKED',
        `Locked opening baseline guard "${ipcRef}" covering ${drRefs.length} pre-cutover delivery reference(s).`,
        structuredClone(guard)
      );
    },

    carryOpenObligation(input) {
      const replay = checkIdempotency<CarriedObligationRecord>(
        'p26.carry_obligation',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const sourceRef = input.original_source_ref.trim();
      const linkedRef = input.linked_dr_or_receipt_ref.trim();
      const qtyStr = input.outstanding_qty.trim();
      const amtStr = input.outstanding_amount_php.trim();
      const actor = input.actor_user_id.trim();
      const at = input.created_at.trim();

      if (!sourceRef || !linkedRef || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Original source reference, linked document/receipt reference, actor ID, and UTC timestamp are required.'
        );
      }
      if (!INTEGER_PATTERN.test(qtyStr) || !MONEY_PATTERN.test(amtStr)) {
        return fail(
          422,
          'INVALID_QUANTITY_OR_AMOUNT',
          'Outstanding quantity must be a whole number and amount must be formatted as PHP 0.00.'
        );
      }
      if (BigInt(qtyStr) === 0n && toCents(amtStr) === 0n) {
        return fail(
          422,
          'ZERO_OUTSTANDING_OBLIGATION_REJECTED',
          'Carried obligation must retain a genuine non-zero remaining quantity or PHP amount.'
        );
      }
      if (
        carriedObligations.some(
          (o) =>
            o.original_source_ref === sourceRef ||
            o.linked_dr_or_receipt_ref === linkedRef
        )
      ) {
        return fail(
          409,
          'DUPLICATE_CARRIED_SOURCE_REF',
          `Source reference "${sourceRef}" or linked evidence "${linkedRef}" was already carried once.`
        );
      }

      const coveredByIpc = openingIpcGuards.some((g) =>
        g.included_old_dr_refs.includes(linkedRef)
      );
      if (input.already_counted_in_ipc || coveredByIpc) {
        return fail(
          422,
          'IPC_STOCK_ALREADY_COUNTED_NO_SECOND_RECEIPT',
          `Goods referenced by "${linkedRef}" are already included in the locked opening count and cannot be received a second time.`
        );
      }

      let inventoryImpact: CarriedObligationRecord['inventory_impact'];
      if (input.kind === 'inbound_po') {
        inventoryImpact = 'inbound_only_not_on_hand';
      } else if (input.kind === 'booth_custody') {
        inventoryImpact = 'separate_booth_custody_not_stockroom';
      } else {
        inventoryImpact = 'commitment_tracking_only';
      }

      const record: CarriedObligationRecord = {
        obligation_id: nextId(),
        chapter_id: chapterId,
        kind: input.kind,
        original_source_ref: sourceRef,
        linked_dr_or_receipt_ref: linkedRef,
        outstanding_qty: qtyStr,
        outstanding_amount_php: amtStr,
        inventory_impact: inventoryImpact,
        duplicate_cash_receipt_created: false,
        source_evidence_retained: true,
        created_at: at,
      };
      carriedObligations.push(record);

      history.push({
        event_id: nextId(),
        target_id: record.obligation_id,
        action: 'carried_obligation_recorded',
        actor_user_id: actor,
        reason: `${input.kind} (${sourceRef} / ${linkedRef}) -> qty ${qtyStr}, PHP ${amtStr} (${inventoryImpact})`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p26.carry_obligation',
        actor,
        record.obligation_id,
        input.idempotency_key,
        input,
        201,
        'CARRIED_OBLIGATION_RECORDED',
        `Carried open obligation "${sourceRef}" once (${inventoryImpact}, duplicate_cash_receipt_created=false).`,
        structuredClone(record)
      );
    },

    authorizeRolloutGate(input) {
      const replay = checkIdempotency<StageGateApprovalRecord>(
        'p26.authorize_gate',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.approver_user_id.trim();
      const duty = input.approver_duty.trim();
      const at = input.approved_at.trim();

      if (!actor || !duty || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Approver ID, operational duty, and UTC timestamp are required.'
        );
      }
      if (PROVIDER_ONLY_ROLES.has(duty)) {
        return fail(
          403,
          'PROVIDER_ROLE_CANNOT_APPROVE_CHAPTER_GATE',
          'Provider provisioning or billing roles cannot approve chapter operational rollout gates.'
        );
      }
      if (input.gate_id === 'MIG_04_GATE_1' && !input.recovery_readiness_verified) {
        return fail(
          422,
          'RECOVERY_READINESS_REQUIRED_BEFORE_LIVE',
          'Opening Gate 1 cannot be authorized before independent recovery readiness is verified.'
        );
      }
      if (stageGates.some((g) => g.gate_id === input.gate_id)) {
        return fail(409, 'GATE_ALREADY_AUTHORIZED', `Gate "${input.gate_id}" is already approved.`);
      }

      const gate: StageGateApprovalRecord = {
        gate_id: input.gate_id,
        chapter_id: chapterId,
        approver_user_id: actor,
        approver_duty: duty,
        recovery_readiness_verified: input.recovery_readiness_verified,
        approved_at: at,
      };
      stageGates.push(gate);

      history.push({
        event_id: nextId(),
        target_id: gate.gate_id,
        action: 'rollout_gate_authorized',
        actor_user_id: actor,
        reason: `${gate.gate_id} authorized by duty ${duty}`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p26.authorize_gate',
        actor,
        gate.gate_id,
        input.idempotency_key,
        input,
        201,
        'ROLLOUT_GATE_AUTHORIZED',
        `Authorized rollout gate ${gate.gate_id} under operational duty "${duty}".`,
        structuredClone(gate)
      );
    },

    activateLiveTrialOnce(input) {
      const replay = checkIdempotency<TrialLifecycleState>(
        'p26.activate_trial',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const duty = input.actor_duty.trim();
      const at = input.activated_at.trim();

      if (!actor || !duty || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Activating officer ID, duty, and UTC activation timestamp are required.'
        );
      }
      if (duty !== 'CHAPTER_HEAD') {
        return fail(
          403,
          'CHAPTER_HEAD_REQUIRED_FOR_ACTIVATION',
          'Only the authorized Chapter Head may activate live operations and begin the 30-day trial.'
        );
      }
      if (trialState.activation_count >= 1) {
        return fail(
          409,
          'TRIAL_ALREADY_ACTIVATED_ONCE_ONLY',
          'The 30-day live trial has already been activated for this chapter and cannot be restarted.'
        );
      }

      const gateApproved = stageGates.some((g) => g.gate_id === input.enabled_rollout_stage);
      if (
        !input.setup_approved ||
        !input.opening_ipc_locked ||
        !input.recovery_ready ||
        !input.commercial_terms_approved ||
        !gateApproved
      ) {
        return fail(
          422,
          'READINESS_PREREQUISITES_INCOMPLETE',
          'Setup, locked opening baseline, independent recovery readiness, approved rollout gate, and commercial terms are all required before live activation.'
        );
      }

      const trialEndsAt = addDaysUtc(at, 30);
      const graceEndsAt = addDaysUtc(trialEndsAt, 14);

      trialState.status = 'trial_active';
      trialState.activated_at = at;
      trialState.activated_by_user_id = actor;
      trialState.trial_ends_at = trialEndsAt;
      trialState.grace_ends_at = graceEndsAt;
      trialState.enabled_rollout_stage = input.enabled_rollout_stage;
      trialState.chapter_name_at_activation = chapterName;
      trialState.activation_count = 1;

      history.push({
        event_id: nextId(),
        target_id: chapterId,
        action: 'live_trial_activated_once',
        actor_user_id: actor,
        reason: `30-day trial started (${at} -> ${trialEndsAt}); 14-day grace until ${graceEndsAt}`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p26.activate_trial',
        actor,
        chapterId,
        input.idempotency_key,
        input,
        201,
        'LIVE_TRIAL_ACTIVATED_ONCE',
        `Activated 30-day live trial until ${trialEndsAt} (14-day read/export grace until ${graceEndsAt}).`,
        structuredClone(trialState)
      );
    },

    renameChapterOrAdvanceStage(input) {
      const replay = checkIdempotency<TrialLifecycleState>(
        'p26.rename_or_stage',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const at = input.updated_at.trim();
      const nextName = input.new_chapter_name?.trim() ?? '';

      if (!actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Actor ID and UTC timestamp are required.');
      }

      if (nextName.length > 0 && nextName !== chapterName) {
        chapterName = nextName;
        trialState.rename_count += 1;
      }
      if (input.next_stage) {
        trialState.enabled_rollout_stage = input.next_stage;
      }

      history.push({
        event_id: nextId(),
        target_id: chapterId,
        action: 'chapter_updated_trial_clock_preserved',
        actor_user_id: actor,
        reason: `Chapter "${chapterName}" / stage ${trialState.enabled_rollout_stage ?? 'unset'}; original trial clock unchanged`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p26.rename_or_stage',
        actor,
        chapterId,
        input.idempotency_key,
        input,
        200,
        'TRIAL_CLOCK_PRESERVED_UNCHANGED',
        `Updated chapter configuration ("${chapterName}") without altering the original trial start or expiry clocks.`,
        structuredClone(trialState)
      );
    },

    evaluateEntitlementAndExecuteAction(input) {
      const replay = checkIdempotency<EntitlementEvaluationOutcome>(
        'p26.evaluate_entitlement',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const at = input.evaluated_at.trim();
      if (!actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Actor ID and UTC evaluation time are required.');
      }

      if (
        input.is_provider_billing_only ||
        input.actor_chapter_id.trim() !== chapterId ||
        !input.actor_has_chapter_membership
      ) {
        return fail(
          403,
          'PROVIDER_BILLING_NO_CHAPTER_ACCESS',
          'Provider billing/provisioning roles and non-members have zero access to chapter operations or buyer records.'
        );
      }

      if (input.actor_disabled) {
        return fail(
          403,
          'DISABLED_MEMBERSHIP_BLOCKED',
          'Disabled chapter accounts cannot execute postings or receive scoped exports.'
        );
      }

      const evalMs = Date.parse(at);
      let effectiveStatus: TrialLifecycleStatus;
      if (trialState.paid_through_at && evalMs <= Date.parse(trialState.paid_through_at)) {
        effectiveStatus = 'paid_active';
      } else if (trialState.activation_count === 0 || !trialState.trial_ends_at || !trialState.grace_ends_at) {
        effectiveStatus = 'not_activated';
      } else if (evalMs <= Date.parse(trialState.trial_ends_at)) {
        effectiveStatus = 'trial_active';
      } else if (evalMs <= Date.parse(trialState.grace_ends_at)) {
        effectiveStatus = 'unpaid_grace';
      } else {
        effectiveStatus = 'post_grace_suspended';
      }

      trialState.status = effectiveStatus;

      if (effectiveStatus === 'not_activated') {
        if (input.action_kind === 'essential_control_reconciliation') {
          const outcome: EntitlementEvaluationOutcome = {
            status: effectiveStatus,
            evaluated_at: at,
            action_kind: input.action_kind,
            allowed: true,
            code: 'ESSENTIAL_CONTROL_PERMITTED_DURING_LAPSE',
            outstanding_obligations_preserved: true,
            auto_forfeited_count: 0,
            commercial_funds_separate_from_buyer_money: true,
          };
          return recordLedgerAndPersist(
            'p26.evaluate_entitlement',
            actor,
            chapterId,
            input.idempotency_key,
            input,
            200,
            outcome.code,
            'Essential control and reconciliation checks remain active.',
            outcome
          );
        }
        if (input.action_kind === 'scoped_read_export') {
          const outcome: EntitlementEvaluationOutcome = {
            status: effectiveStatus,
            evaluated_at: at,
            action_kind: input.action_kind,
            allowed: true,
            code: 'ENTITLEMENT_ACTION_ALLOWED',
            outstanding_obligations_preserved: true,
            auto_forfeited_count: 0,
            commercial_funds_separate_from_buyer_money: true,
          };
          return recordLedgerAndPersist(
            'p26.evaluate_entitlement',
            actor,
            chapterId,
            input.idempotency_key,
            input,
            200,
            outcome.code,
            'Scoped read/export check permitted.',
            outcome
          );
        }
        return fail(
          403,
          'LIVE_OPERATIONS_NOT_ACTIVATED',
          'Live business postings and queued jobs remain blocked until the Chapter Head activates live operations.'
        );
      }

      if (effectiveStatus === 'trial_active' || effectiveStatus === 'paid_active') {
        const outcome: EntitlementEvaluationOutcome = {
          status: effectiveStatus,
          evaluated_at: at,
          action_kind: input.action_kind,
          allowed: true,
          code: 'ENTITLEMENT_ACTION_ALLOWED',
          outstanding_obligations_preserved: true,
          auto_forfeited_count: 0,
          commercial_funds_separate_from_buyer_money: true,
        };
        return recordLedgerAndPersist(
          'p26.evaluate_entitlement',
          actor,
          chapterId,
          input.idempotency_key,
          input,
          200,
          outcome.code,
          `Action "${input.action_kind}" permitted under status "${effectiveStatus}".`,
          outcome
        );
      }

      // Expired / unpaid grace or post-grace window
      if (input.action_kind === 'new_officer_posting') {
        return fail(
          403,
          'TRIAL_EXPIRED_NEW_POSTING_BLOCKED',
          'Trial expired without paid renewal: new officer postings are blocked, while existing funded obligations remain intact.'
        );
      }
      if (input.action_kind === 'queued_business_job') {
        return fail(
          403,
          'QUEUED_POSTING_BLOCKED_AT_EXPIRY',
          'Queued business job execution is blocked at entitlement expiry until paid extension is verified.'
        );
      }
      if (input.action_kind === 'scoped_read_export') {
        if (effectiveStatus === 'unpaid_grace') {
          const outcome: EntitlementEvaluationOutcome = {
            status: effectiveStatus,
            evaluated_at: at,
            action_kind: input.action_kind,
            allowed: true,
            code: 'GRACE_SCOPED_READ_EXPORT_ALLOWED',
            outstanding_obligations_preserved: true,
            auto_forfeited_count: 0,
            commercial_funds_separate_from_buyer_money: true,
          };
          return recordLedgerAndPersist(
            'p26.evaluate_entitlement',
            actor,
            chapterId,
            input.idempotency_key,
            input,
            200,
            outcome.code,
            'Scoped read/export access permitted during the 14-day unpaid grace window.',
            outcome
          );
        }
        return fail(
          403,
          'POST_GRACE_READ_EXPORT_SUSPENDED',
          'The 14-day unpaid grace window has elapsed; contact provider billing or follow preservation procedures.'
        );
      }

      // Essential deadline/history, security, backup & reconciliation controls remain active across lapse
      const essentialOutcome: EntitlementEvaluationOutcome = {
        status: effectiveStatus,
        evaluated_at: at,
        action_kind: input.action_kind,
        allowed: true,
        code: 'ESSENTIAL_CONTROL_PERMITTED_DURING_LAPSE',
        outstanding_obligations_preserved: true,
        auto_forfeited_count: 0,
        commercial_funds_separate_from_buyer_money: true,
      };
      return recordLedgerAndPersist(
        'p26.evaluate_entitlement',
        actor,
        chapterId,
        input.idempotency_key,
        input,
        200,
        essentialOutcome.code,
        'Essential deadline, reconciliation, and preservation controls remain active despite unpaid lapse.',
        essentialOutcome
      );
    },

    recordProviderSubscriptionExtension(input) {
      const replay = checkIdempotency<ProviderSubscriptionRecord>(
        'p26.extend_subscription',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const verifier = input.provider_verifier_id.trim();
      const role = input.provider_role.trim();
      const payRef = input.payment_reference.trim();
      const amtStr = input.amount_php.trim();
      const paidThrough = input.paid_through_at.trim();
      const verifiedAt = input.verified_at.trim();

      if (
        !verifier ||
        !role ||
        !payRef ||
        !UTC_INSTANT_PATTERN.test(paidThrough) ||
        !UTC_INSTANT_PATTERN.test(verifiedAt)
      ) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Provider verifier ID, role, payment reference, and valid UTC timestamps are required.'
        );
      }
      if (role !== 'provider_billing') {
        return fail(
          403,
          'PROVIDER_BILLING_AUTHORITY_REQUIRED',
          'Only authorized provider billing administration may verify subscription payments and extend paid-through dates.'
        );
      }
      if (!MONEY_PATTERN.test(amtStr) || toCents(amtStr) <= 0n) {
        return fail(422, 'INVALID_AMOUNT', 'Subscription amount must exceed PHP 0.00.');
      }
      if (Date.parse(paidThrough) <= Date.parse(verifiedAt)) {
        return fail(
          422,
          'INVALID_PAID_THROUGH_DATE',
          'Paid-through timestamp must be strictly after verification timestamp.'
        );
      }
      if (providerSubscriptions.some((s) => s.payment_reference === payRef)) {
        return fail(
          409,
          'DUPLICATE_PROVIDER_PAYMENT_REF',
          `Subscription reference "${payRef}" has already been verified.`
        );
      }

      const sub: ProviderSubscriptionRecord = {
        subscription_id: nextId(),
        chapter_id: chapterId,
        provider_verifier_id: verifier,
        provider_role: role,
        payment_reference: payRef,
        amount_php: amtStr,
        paid_through_at: paidThrough,
        verified_at: verifiedAt,
      };
      providerSubscriptions.push(sub);

      if (
        !trialState.paid_through_at ||
        Date.parse(paidThrough) > Date.parse(trialState.paid_through_at)
      ) {
        trialState.paid_through_at = paidThrough;
      }
      trialState.status = 'paid_active';

      history.push({
        event_id: nextId(),
        target_id: sub.subscription_id,
        action: 'provider_subscription_extended',
        actor_user_id: verifier,
        reason: `Extended access through ${paidThrough} via provider ref ${payRef} (PHP ${amtStr}) — chapter revenue untouched`,
        timestamp: verifiedAt,
      });

      return recordLedgerAndPersist(
        'p26.extend_subscription',
        verifier,
        sub.subscription_id,
        input.idempotency_key,
        input,
        201,
        'PROVIDER_SUBSCRIPTION_EXTENDED',
        `Verified provider subscription payment "${payRef}" (PHP ${amtStr}) extending access through ${paidThrough}.`,
        structuredClone(sub)
      );
    },

    attemptAutoDeleteOnLapseOrBudget(input) {
      const actor = input.actor_user_id.trim() || 'system';
      const at = input.attempted_at.trim();
      history.push({
        event_id: nextId(),
        target_id: chapterId,
        action: 'auto_deletion_blocked_preservation_enforced',
        actor_user_id: actor,
        reason: `Blocked history deletion (${input.reason.trim() || 'subscription/budget lapse'})`,
        timestamp: UTC_INSTANT_PATTERN.test(at) ? at : new Date().toISOString().replace(/\.000Z$/, 'Z'),
      });
      persistSnapshot();
      return fail(
        403,
        'AUTO_DELETION_FORBIDDEN_PRESERVATION_REQUIRED',
        `Subscription expiry or credit exhaustion never authorizes deleting chapter history (${carriedObligations.length} carried obligations preserved).`
      );
    },

    lookupCutoverOperation(input) {
      if (input.chapter_id !== chapterId) {
        return {
          ok: false,
          http_status: 403,
          code: 'FORBIDDEN_SCOPE',
          message: 'Operation lookup rejected for foreign chapter scope.',
          data: {
            action_result: 'forbidden',
            input_policy: 'preserve',
            lookup_state: null,
            operation_id: null,
            idempotency_key: null,
            recovered_snapshot: null,
          },
        };
      }

      const match =
        input.query_type === 'by_key'
          ? operationLedger.find(
              (o) =>
                o.idempotency_key === (input.idempotency_key ?? '').trim() &&
                (!input.action_code || o.action_code === input.action_code)
            )
          : operationLedger.find((o) => o.operation_id === (input.operation_id ?? '').trim());

      if (!match) {
        return {
          ok: false,
          http_status: 404,
          code: 'OPERATION_NOT_VISIBLE',
          message: 'No committed operation found for the supplied identifier; preserve inputs.',
          data: {
            action_result: 'uncertain',
            input_policy: 'preserve',
            lookup_state: 'pending_or_not_visible',
            operation_id: input.operation_id ?? null,
            idempotency_key: input.idempotency_key ?? null,
            recovered_snapshot: null,
          },
        };
      }

      return {
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered durable result ${match.operation_id} (${match.code}).`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: match.operation_id,
          idempotency_key: match.idempotency_key,
          recovered_snapshot: structuredClone(match.snapshot),
        },
      };
    },
  };
}
