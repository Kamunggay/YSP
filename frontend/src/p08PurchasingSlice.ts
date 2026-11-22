import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P08_CONTEXT_STORAGE_KEY = 'ysp_p08_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;

export type RepfTriggerKind = 'rf_shortage' | 'rop_replenishment' | 'funded_so_shortage' | 'unpaid_so';

export type RepfStatus = 'draft' | 'submitted' | 'returned' | 'held' | 'approved' | 'canceled';

export interface VariantSupplyProfile {
  profile_id: string;
  variant_id: string;
  item_name?: string | undefined;
  quantity_scale: number;
  usable_on_hand: string;
  active_rf_reserved: string;
  approved_rf_demand: string;
  existing_po_inbound: string;
  rop_threshold: string;
  target_stock_level: string;
  active_repf_claimed: string;
  uncovered_net_need: string;
  low_stock_alert: boolean;
  version: number;
}

export interface RepfRecord {
  repf_id: string;
  chapter_id: string;
  reference: string | null;
  requester_user_id: string;
  variant_id: string;
  source_kind: RepfTriggerKind;
  linked_rf_reference: string | null;
  requested_quantity: UnitQuantity;
  estimated_amount: string;
  funding_source: 'chapter_budget' | 'so_verified_or';
  priority: 'normal' | 'urgent';
  is_emergency: boolean;
  emergency_reason: string | null;
  justification: string;
  status: RepfStatus;
  version: number;
  material_version: number;
  decision_actor_id: string | null;
  decision_reason: string | null;
  approved_budget_amount: string | null;
  po_count_created: number;
}

export interface P08HistoryEntry {
  event_id: string;
  repf_id: string;
  version: number;
  material_version: number;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P08SummaryMetrics {
  total_gross_uncovered: string;
  active_repf_claimed: string;
  remaining_uncovered: string;
  low_stock_alerts: number;
  approved_repfs: number;
}

export interface P08OperationLedgerEntry {
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

export interface P08ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P08LookupResult {
  action_result: 'recovered' | 'uncertain' | 'forbidden';
  input_policy: 'may_clear' | 'preserve';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P08EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  profiles: ReadonlyArray<VariantSupplyProfile>;
  repfs: ReadonlyArray<RepfRecord>;
  history: ReadonlyArray<P08HistoryEntry>;
  summary: P08SummaryMetrics;
  operation_ledger: ReadonlyArray<P08OperationLedgerEntry>;
  last_action: P08ActionResult | null;
}

export interface P08EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
}

export interface P08PurchasingEngine {
  getSnapshot: () => P08EngineSnapshot;
  configureVariantSupplyProfile: (input: {
    chapter_id?: string | undefined;
    variant_id: string;
    item_name?: string | undefined;
    quantity_scale: number;
    usable_on_hand_value: string;
    active_rf_reserved_value: string;
    approved_rf_demand_value: string;
    existing_po_inbound_value: string;
    rop_threshold_value: string;
    target_stock_level_value: string;
  }) => P08ActionResult<VariantSupplyProfile>;
  createRepfDraft: (input: {
    chapter_id?: string | undefined;
    requester_user_id: string;
    variant_id: string;
    source_kind: RepfTriggerKind;
    linked_rf_reference?: string | null | undefined;
    requested_quantity_value: string;
    quantity_scale: number;
    estimated_amount: string;
    priority: 'normal' | 'urgent';
    is_emergency: boolean;
    emergency_reason?: string | null | undefined;
    justification: string;
    idempotency_key?: string | undefined;
  }) => P08ActionResult<RepfRecord>;
  submitRepfForBudget: (input: {
    chapter_id?: string | undefined;
    repf_id: string;
    actor_user_id: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P08ActionResult<RepfRecord>;
  decideRepfBudget: (input: {
    chapter_id?: string | undefined;
    repf_id: string;
    reviewer_user_id: string;
    decision: 'approve' | 'hold' | 'return' | 'reject_cancel';
    reason?: string | undefined;
    approved_budget_amount?: string | undefined;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P08ActionResult<RepfRecord>;
  reviseRepf: (input: {
    chapter_id?: string | undefined;
    repf_id: string;
    actor_user_id: string;
    requested_quantity_value: string;
    estimated_amount: string;
    justification: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }) => P08ActionResult<RepfRecord>;
  lookupPurchasingOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P08ActionResult<P08LookupResult>;
}

function readStoredP08Options(): P08EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P08_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P08EngineOptions;
  } catch {
    return undefined;
  }
}

function formatTrimmedMicro(micro: bigint): string {
  const whole = micro / 1000000n;
  const rem = micro % 1000000n;
  if (rem === 0n) return whole.toString();
  return `${whole.toString()}.${rem.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

export function createP08PurchasingEngine(options?: P08EngineOptions): P08PurchasingEngine {
  const seed = options ?? readStoredP08Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 8000;
  let repfRefSeq = 0;

  const profiles: VariantSupplyProfile[] = [];
  const repfs: RepfRecord[] = [];
  const history: P08HistoryEntry[] = [];
  const operationLedger: P08OperationLedgerEntry[] = [];
  let lastAction: P08ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P08${String(seq).padStart(19, '0')}`;
  }

  function nextTimestamp(): string {
    return `2026-11-22T12:15:${String(seq % 60).padStart(2, '0')}.000000Z`;
  }

  function allocateRepfReference(): string {
    repfRefSeq += 1;
    return `${chapterPrefix}-REPF-2026-${String(repfRefSeq).padStart(6, '0')}`;
  }

  function recordOutcome<T>(res: P08ActionResult<T>): P08ActionResult<T> {
    lastAction = res;
    return res;
  }

  function checkChapter<T>(requested?: string): P08ActionResult<T> | null {
    if (requested !== undefined && requested !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested purchase requisition scope is outside authorized chapter.',
      });
    }
    return null;
  }

  function checkIdempotency<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    idempotency_key?: string | undefined;
    payload: unknown;
  }):
    | { status: 'replay'; result: P08ActionResult<T> }
    | { status: 'conflict'; result: P08ActionResult<T> }
    | { status: 'fresh'; key: string | null; fingerprint: string } {
    const key = params.idempotency_key?.trim() || null;
    const fingerprint = computeDeterministicHash({
      target_id: params.target_id,
      payload: params.payload,
    });
    if (!key) return { status: 'fresh', key: null, fingerprint };

    const existing = operationLedger.find(
      (e) =>
        e.chapter_id === chapterId &&
        e.action_code === params.action_code &&
        e.actor_user_id === params.actor_user_id &&
        e.idempotency_key === key
    );
    if (!existing) return { status: 'fresh', key, fingerprint };
    if (existing.payload_fingerprint === fingerprint) {
      return {
        status: 'replay',
        result: recordOutcome<T>({
          ok: true,
          http_status: existing.http_status,
          code: existing.code,
          message: existing.message,
          replayed: true,
          data: structuredClone(existing.snapshot) as T,
        }),
      };
    }
    return {
      status: 'conflict',
      result: recordOutcome<T>({
        ok: false,
        http_status: 409,
        code: 'ACTION_KEY_CONFLICT',
        message: 'Idempotency key already committed with a different request payload.',
      }),
    };
  }

  function commitToLedger<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    key: string | null;
    fingerprint: string;
    http_status: number;
    code: string;
    message: string;
    snapshot: T;
  }): P08ActionResult<T> {
    if (params.key) {
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: params.action_code,
        actor_user_id: params.actor_user_id,
        target_id: params.target_id,
        idempotency_key: params.key,
        payload_fingerprint: params.fingerprint,
        http_status: params.http_status,
        code: params.code,
        message: params.message,
        snapshot: structuredClone(params.snapshot),
      });
    }
    return recordOutcome({
      ok: true,
      http_status: params.http_status,
      code: params.code,
      message: params.message,
      replayed: false,
      data: structuredClone(params.snapshot),
    });
  }

  function recomputeProfile(profile: VariantSupplyProfile) {
    const scale = profile.quantity_scale;
    const usableMicro = toMicroUnits(profile.usable_on_hand);
    const ropMicro = toMicroUnits(profile.rop_threshold);
    const targetMicro = toMicroUnits(profile.target_stock_level);
    const demandMicro = toMicroUnits(profile.approved_rf_demand);
    const inboundMicro = toMicroUnits(profile.existing_po_inbound);

    const grossReq = demandMicro + targetMicro;
    const supplyTotal = usableMicro + inboundMicro;
    const grossUncovered = grossReq > supplyTotal ? grossReq - supplyTotal : 0n;

    const claimedMicro = repfs
      .filter((r) => r.variant_id === profile.variant_id && r.status !== 'canceled')
      .reduce((acc, r) => acc + toMicroUnits(r.requested_quantity.value), 0n);

    const remainingUncovered =
      grossUncovered > claimedMicro ? grossUncovered - claimedMicro : 0n;

    profile.active_repf_claimed = fromMicroUnits(claimedMicro, scale).value;
    profile.uncovered_net_need = fromMicroUnits(remainingUncovered, scale).value;
    profile.low_stock_alert = usableMicro <= ropMicro;
  }

  function computeSummary(): P08SummaryMetrics {
    let grossTotal = 0n;
    let claimedTotal = 0n;
    let remainingTotal = 0n;
    let alertCount = 0;

    for (const p of profiles) {
      const usableMicro = toMicroUnits(p.usable_on_hand);
      const inboundMicro = toMicroUnits(p.existing_po_inbound);
      const grossReq = toMicroUnits(p.approved_rf_demand) + toMicroUnits(p.target_stock_level);
      const supply = usableMicro + inboundMicro;
      grossTotal += grossReq > supply ? grossReq - supply : 0n;
      claimedTotal += toMicroUnits(p.active_repf_claimed);
      remainingTotal += toMicroUnits(p.uncovered_net_need);
      if (p.low_stock_alert) alertCount += 1;
    }

    return {
      total_gross_uncovered: formatTrimmedMicro(grossTotal),
      active_repf_claimed: formatTrimmedMicro(claimedTotal),
      remaining_uncovered: formatTrimmedMicro(remainingTotal),
      low_stock_alerts: alertCount,
      approved_repfs: repfs.filter((r) => r.status === 'approved').length,
    };
  }

  function appendHistory(params: {
    repf: RepfRecord;
    action: string;
    actor_user_id: string;
    reason: string | null;
  }) {
    history.push({
      event_id: nextId(),
      repf_id: params.repf.repf_id,
      version: params.repf.version,
      material_version: params.repf.material_version,
      action: params.action,
      actor_user_id: params.actor_user_id,
      reason: params.reason,
      timestamp: nextTimestamp(),
    });
  }

  function configureVariantSupplyProfile(input: {
    chapter_id?: string | undefined;
    variant_id: string;
    item_name?: string | undefined;
    quantity_scale: number;
    usable_on_hand_value: string;
    active_rf_reserved_value: string;
    approved_rf_demand_value: string;
    existing_po_inbound_value: string;
    rop_threshold_value: string;
    target_stock_level_value: string;
  }): P08ActionResult<VariantSupplyProfile> {
    const scopeErr = checkChapter<VariantSupplyProfile>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const variantId = input.variant_id.trim();
    if (!variantId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'VARIANT_REQUIRED',
        message: 'Catalog variant ID is required.',
      });
    }

    const fields = {
      usable_on_hand: input.usable_on_hand_value.trim(),
      active_rf_reserved: input.active_rf_reserved_value.trim(),
      approved_rf_demand: input.approved_rf_demand_value.trim(),
      existing_po_inbound: input.existing_po_inbound_value.trim(),
      rop_threshold: input.rop_threshold_value.trim(),
      target_stock_level: input.target_stock_level_value.trim(),
    };
    for (const [label, val] of Object.entries(fields)) {
      if (!isValidUnitQuantity({ value: val, quantity_scale: input.quantity_scale })) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_PRECISION',
          message: `Supply field ${label} ("${val}") must match unit scale ${input.quantity_scale}.`,
        });
      }
    }

    const usableMicro = toMicroUnits(fields.usable_on_hand);
    const reservedMicro = toMicroUnits(fields.active_rf_reserved);
    const ropMicro = toMicroUnits(fields.rop_threshold);
    const targetMicro = toMicroUnits(fields.target_stock_level);

    if (reservedMicro > usableMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_RESERVED_BASIS',
        message: 'Active reserved quantity cannot exceed usable on-hand stock.',
      });
    }
    if (targetMicro < ropMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_TARGET_LEVEL',
        message: 'Target stock level must be greater than or equal to ROP threshold.',
      });
    }

    const existing = profiles.find((p) => p.variant_id === variantId);
    const scale = input.quantity_scale;
    const profile: VariantSupplyProfile = existing ?? {
      profile_id: nextId(),
      variant_id: variantId,
      item_name: input.item_name?.trim() || undefined,
      quantity_scale: scale,
      usable_on_hand: '0',
      active_rf_reserved: '0',
      approved_rf_demand: '0',
      existing_po_inbound: '0',
      rop_threshold: '0',
      target_stock_level: '0',
      active_repf_claimed: '0',
      uncovered_net_need: '0',
      low_stock_alert: false,
      version: 0,
    };

    profile.item_name = input.item_name?.trim() || profile.item_name;
    profile.quantity_scale = scale;
    profile.usable_on_hand = fromMicroUnits(usableMicro, scale).value;
    profile.active_rf_reserved = fromMicroUnits(reservedMicro, scale).value;
    profile.approved_rf_demand = fromMicroUnits(toMicroUnits(fields.approved_rf_demand), scale).value;
    profile.existing_po_inbound = fromMicroUnits(toMicroUnits(fields.existing_po_inbound), scale).value;
    profile.rop_threshold = fromMicroUnits(ropMicro, scale).value;
    profile.target_stock_level = fromMicroUnits(targetMicro, scale).value;
    profile.version += 1;

    if (!existing) {
      profiles.push(profile);
    }
    recomputeProfile(profile);

    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'SUPPLY_PROFILE_CONFIGURED',
      message: `Computed supply profile for variant #${profile.variant_id}: uncovered net need ${profile.uncovered_net_need} (low-stock alert: ${profile.low_stock_alert ? 'Active' : 'Normal'}).`,
      data: structuredClone(profile),
    });
  }

  function createRepfDraft(input: {
    chapter_id?: string | undefined;
    requester_user_id: string;
    variant_id: string;
    source_kind: RepfTriggerKind;
    linked_rf_reference?: string | null | undefined;
    requested_quantity_value: string;
    quantity_scale: number;
    estimated_amount: string;
    priority: 'normal' | 'urgent';
    is_emergency: boolean;
    emergency_reason?: string | null | undefined;
    justification: string;
    idempotency_key?: string | undefined;
  }): P08ActionResult<RepfRecord> {
    const scopeErr = checkChapter<RepfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.requester_user_id.trim();
    if (!actor) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'ACTOR_REQUIRED',
        message: 'Requester user ID is required.',
      });
    }

    const idem = checkIdempotency<RepfRecord>({
      action_code: 'repf.create',
      actor_user_id: actor,
      target_id: null,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    if (input.source_kind === 'unpaid_so') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'UNPAID_SO_RELABEL_FORBIDDEN',
        message:
          'Unpaid customer sales shortages require verified Official Receipt funding and cannot be relabeled as chapter-funded purchase requests.',
      });
    }

    const profile = profiles.find((p) => p.variant_id === input.variant_id.trim());
    if (!profile) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'SUPPLY_PROFILE_NOT_FOUND',
        message: `Configure net-need profile for variant #${input.variant_id} before initiating a purchase request.`,
      });
    }

    const qtyVal = input.requested_quantity_value.trim();
    if (
      !isValidUnitQuantity({ value: qtyVal, quantity_scale: input.quantity_scale }) ||
      input.quantity_scale !== profile.quantity_scale
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `Quantity "${qtyVal}" must match approved unit decimal scale ${profile.quantity_scale}.`,
      });
    }

    const qtyMicro = toMicroUnits(qtyVal);
    if (qtyMicro <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: 'Purchase request quantity must be positive.',
      });
    }

    const estAmt = input.estimated_amount.trim();
    if (!MONEY_PATTERN.test(estAmt) || estAmt === '0.00') {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Estimated cost must be a positive amount with two decimal places (e.g. 2500.00).',
      });
    }

    const cleanJustification = input.justification.trim();
    if (!cleanJustification) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'JUSTIFICATION_REQUIRED',
        message: 'Procurement justification is required.',
      });
    }

    const cleanEmergencyReason = input.emergency_reason?.trim() || null;
    if (input.is_emergency && !cleanEmergencyReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'EMERGENCY_REASON_REQUIRED',
        message: 'Emergency procurement requests require an explicit emergency rationale.',
      });
    }

    recomputeProfile(profile);
    const uncoveredMicro = toMicroUnits(profile.uncovered_net_need);
    if (qtyMicro > uncoveredMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_SUPPLY_COVERAGE',
        message: `Requested quantity (${qtyVal}) exceeds remaining uncovered net need (${profile.uncovered_net_need}); existing supply commitments prevent duplicate ordering.`,
      });
    }

    const repf: RepfRecord = {
      repf_id: nextId(),
      chapter_id: chapterId,
      reference: null,
      requester_user_id: actor,
      variant_id: profile.variant_id,
      source_kind: input.source_kind,
      linked_rf_reference: input.linked_rf_reference?.trim() || null,
      requested_quantity: fromMicroUnits(qtyMicro, profile.quantity_scale),
      estimated_amount: estAmt,
      funding_source: input.source_kind === 'funded_so_shortage' ? 'so_verified_or' : 'chapter_budget',
      priority: input.priority,
      is_emergency: input.is_emergency,
      emergency_reason: cleanEmergencyReason,
      justification: cleanJustification,
      status: 'draft',
      version: 1,
      material_version: 1,
      decision_actor_id: null,
      decision_reason: null,
      approved_budget_amount: null,
      po_count_created: 0,
    };

    repfs.push(repf);
    recomputeProfile(profile);
    appendHistory({ repf, action: 'createRepfDraft', actor_user_id: actor, reason: null });

    return commitToLedger({
      action_code: 'repf.create',
      actor_user_id: actor,
      target_id: repf.repf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'REPF_DRAFT_CREATED',
      message: `Saved purchase request #${repf.repf_id} claiming ${repf.requested_quantity.value} uncovered units (remaining need: ${profile.uncovered_net_need}).`,
      snapshot: repf,
    });
  }

  function submitRepfForBudget(input: {
    chapter_id?: string | undefined;
    repf_id: string;
    actor_user_id: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P08ActionResult<RepfRecord> {
    const scopeErr = checkChapter<RepfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<RepfRecord>({
      action_code: 'repf.submit',
      actor_user_id: actor,
      target_id: input.repf_id,
      idempotency_key: input.idempotency_key,
      payload: {
        expected_version: input.expected_version,
        expected_material_version: input.expected_material_version,
      },
    });
    if (idem.status !== 'fresh') return idem.result;

    const repf = repfs.find((r) => r.repf_id === input.repf_id);
    if (!repf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Purchase request #${input.repf_id} was not found.`,
      });
    }
    if (repf.version !== input.expected_version || repf.material_version !== input.expected_material_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase request version changed before budget submission.',
      });
    }
    if (repf.status !== 'draft') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only draft purchase requests can be submitted (current: ${repf.status}).`,
      });
    }

    if (repf.reference === null) {
      repf.reference = allocateRepfReference();
    }
    repf.status = 'submitted';
    repf.version += 1;

    appendHistory({ repf, action: 'submitRepfForBudget', actor_user_id: actor, reason: null });

    return commitToLedger({
      action_code: 'repf.submit',
      actor_user_id: actor,
      target_id: repf.repf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'REPF_SUBMITTED',
      message: `Submitted ${repf.reference} for independent chapter budget review.`,
      snapshot: repf,
    });
  }

  function decideRepfBudget(input: {
    chapter_id?: string | undefined;
    repf_id: string;
    reviewer_user_id: string;
    decision: 'approve' | 'hold' | 'return' | 'reject_cancel';
    reason?: string | undefined;
    approved_budget_amount?: string | undefined;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P08ActionResult<RepfRecord> {
    const scopeErr = checkChapter<RepfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const reviewer = input.reviewer_user_id.trim();
    if (!reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REVIEWER_REQUIRED',
        message: 'Authenticated budget reviewer ID is required.',
      });
    }

    const idem = checkIdempotency<RepfRecord>({
      action_code: 'repf.budget_decide',
      actor_user_id: reviewer,
      target_id: input.repf_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const repf = repfs.find((r) => r.repf_id === input.repf_id);
    if (!repf) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Purchase request #${input.repf_id} was not found.`,
      });
    }
    if (repf.requester_user_id === reviewer) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'INDEPENDENCE_REQUIRED',
        message: 'Purchase request preparers cannot approve or decide their own chapter budget.',
      });
    }
    if (repf.version !== input.expected_version || repf.material_version !== input.expected_material_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase request version changed before budget decision.',
      });
    }
    if (repf.status !== 'submitted') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Budget decision requires submitted status (current: ${repf.status}).`,
      });
    }

    const cleanReason = input.reason?.trim() || null;
    if (input.decision !== 'approve' && !cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'Holding, returning, or rejecting a budget request requires a reason.',
      });
    }

    let code: string;
    let message: string;
    if (input.decision === 'approve') {
      const budgetAmt = input.approved_budget_amount?.trim() || repf.estimated_amount;
      if (!MONEY_PATTERN.test(budgetAmt) || budgetAmt === '0.00') {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_MONEY_AMOUNT',
          message: 'Approved budget ceiling must be a valid positive decimal amount.',
        });
      }
      repf.status = 'approved';
      repf.approved_budget_amount = budgetAmt;
      repf.decision_actor_id = reviewer;
      repf.decision_reason = cleanReason;
      code = 'REPF_BUDGET_APPROVED';
      message = `Approved budget ${budgetAmt} for ${repf.reference ?? repf.repf_id}; ready for supplier quotations.`;
    } else if (input.decision === 'hold') {
      repf.status = 'held';
      repf.decision_actor_id = reviewer;
      repf.decision_reason = cleanReason;
      code = 'REPF_BUDGET_HELD';
      message = `Placed ${repf.reference ?? repf.repf_id} on budget hold.`;
    } else if (input.decision === 'return') {
      repf.status = 'returned';
      repf.decision_actor_id = reviewer;
      repf.decision_reason = cleanReason;
      code = 'REPF_RETURNED';
      message = `Returned ${repf.reference ?? repf.repf_id} to requester for revision.`;
    } else {
      repf.status = 'canceled';
      repf.decision_actor_id = reviewer;
      repf.decision_reason = cleanReason;
      repf.po_count_created = 0;
      const profile = profiles.find((p) => p.variant_id === repf.variant_id);
      if (profile) recomputeProfile(profile);
      code = 'REPF_BUDGET_DENIED';
      message = `Denied & closed ${repf.reference ?? repf.repf_id}; zero purchase orders created and parent shortage remains open.`;
    }

    repf.version += 1;
    appendHistory({
      repf,
      action: `decideRepfBudget(${input.decision})`,
      actor_user_id: reviewer,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'repf.budget_decide',
      actor_user_id: reviewer,
      target_id: repf.repf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code,
      message,
      snapshot: repf,
    });
  }

  function reviseRepf(input: {
    chapter_id?: string | undefined;
    repf_id: string;
    actor_user_id: string;
    requested_quantity_value: string;
    estimated_amount: string;
    justification: string;
    reason: string;
    expected_version: number;
    expected_material_version: number;
    idempotency_key?: string | undefined;
  }): P08ActionResult<RepfRecord> {
    const scopeErr = checkChapter<RepfRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<RepfRecord>({
      action_code: 'repf.revise',
      actor_user_id: actor,
      target_id: input.repf_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const repf = repfs.find((r) => r.repf_id === input.repf_id);
    const profile = repf ? profiles.find((p) => p.variant_id === repf.variant_id) : undefined;
    if (!repf || !profile) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: `Purchase request #${input.repf_id} was not found.`,
      });
    }
    if (repf.version !== input.expected_version || repf.material_version !== input.expected_material_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase request version changed before revision.',
      });
    }
    if (repf.status !== 'returned' && repf.status !== 'held') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: `Only returned or held purchase requests can be revised (current: ${repf.status}).`,
      });
    }
    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'A revision reason is required.',
      });
    }

    const qtyVal = input.requested_quantity_value.trim();
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: profile.quantity_scale })) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `Quantity "${qtyVal}" must match unit decimal scale ${profile.quantity_scale}.`,
      });
    }
    const newQtyMicro = toMicroUnits(qtyVal);
    if (newQtyMicro <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: 'Revised quantity must be positive.',
      });
    }

    const estAmt = input.estimated_amount.trim();
    if (!MONEY_PATTERN.test(estAmt) || estAmt === '0.00') {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Estimated cost must be a positive decimal amount.',
      });
    }

    // Check against gross uncovered minus OTHER active claims
    const grossReq = toMicroUnits(profile.approved_rf_demand) + toMicroUnits(profile.target_stock_level);
    const supply = toMicroUnits(profile.usable_on_hand) + toMicroUnits(profile.existing_po_inbound);
    const grossUncovered = grossReq > supply ? grossReq - supply : 0n;
    const otherClaims = repfs
      .filter((r) => r.variant_id === profile.variant_id && r.status !== 'canceled' && r.repf_id !== repf.repf_id)
      .reduce((acc, r) => acc + toMicroUnits(r.requested_quantity.value), 0n);
    const maxAllowed = grossUncovered > otherClaims ? grossUncovered - otherClaims : 0n;
    if (newQtyMicro > maxAllowed) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_SUPPLY_COVERAGE',
        message: `Revised quantity exceeds remaining net need (${fromMicroUnits(maxAllowed, profile.quantity_scale).value}).`,
      });
    }

    repf.requested_quantity = fromMicroUnits(newQtyMicro, profile.quantity_scale);
    repf.estimated_amount = estAmt;
    repf.justification = input.justification.trim() || repf.justification;
    repf.status = 'draft';
    repf.version += 1;
    repf.material_version += 1;

    recomputeProfile(profile);
    appendHistory({ repf, action: 'reviseRepf', actor_user_id: actor, reason: cleanReason });

    return commitToLedger({
      action_code: 'repf.revise',
      actor_user_id: actor,
      target_id: repf.repf_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'REPF_REVISED_TO_DRAFT',
      message: `Revised ${repf.reference ?? repf.repf_id} back to draft (m${repf.material_version}).`,
      snapshot: repf,
    });
  }

  function lookupPurchasingOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P08ActionResult<P08LookupResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested operation scope is outside authorized chapter.',
        data: {
          action_result: 'forbidden',
          input_policy: 'preserve',
          lookup_state: null,
          operation_id: null,
          idempotency_key: null,
          recovered_snapshot: null,
        },
      });
    }

    const found =
      input.query_type === 'by_key'
        ? operationLedger.find(
            (e) =>
              e.chapter_id === chapterId &&
              (!input.action_code || e.action_code === input.action_code) &&
              e.idempotency_key === input.idempotency_key?.trim()
          )
        : operationLedger.find(
            (e) => e.chapter_id === chapterId && e.operation_id === input.operation_id?.trim()
          );

    if (found) {
      return recordOutcome({
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered committed operation (${found.code}) for key "${found.idempotency_key}".`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: found.operation_id,
          idempotency_key: found.idempotency_key,
          recovered_snapshot: structuredClone(found.snapshot),
        },
      });
    }

    return recordOutcome({
      ok: false,
      http_status: 200,
      code: 'OPERATION_UNCERTAIN',
      message:
        'No visible committed purchasing operation found. Preserve entered request details before retrying.',
      data: {
        action_result: 'uncertain',
        input_policy: 'preserve',
        lookup_state: 'pending_or_not_visible',
        operation_id: null,
        idempotency_key: input.idempotency_key?.trim() || null,
        recovered_snapshot: null,
      },
    });
  }

  return {
    getSnapshot: () => ({
      chapter_id: chapterId,
      chapter_prefix: chapterPrefix,
      chapter_name: chapterName,
      profiles: profiles.map((p) => structuredClone(p)),
      repfs: repfs.map((r) => structuredClone(r)),
      history: history.map((h) => structuredClone(h)),
      summary: computeSummary(),
      operation_ledger: operationLedger.map((o) => structuredClone(o)),
      last_action: lastAction,
    }),
    configureVariantSupplyProfile,
    createRepfDraft,
    submitRepfForBudget,
    decideRepfBudget,
    reviseRepf,
    lookupPurchasingOperation,
  };
}
