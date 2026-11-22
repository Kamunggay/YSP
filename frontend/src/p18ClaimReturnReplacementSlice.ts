import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P18_CONTEXT_STORAGE_KEY = 'ysp_p18_context';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type ClaimSaleChannel = 'track1_so_cdr' | 'booth_or';

export type ClaimInspectionOutcome =
  | 'defective_confirmed'
  | 'nondefective_resalable'
  | 'nondefective_unsalable';

export type CustomerClaimStatus =
  | 'awaiting_inspection'
  | 'awaiting_approval'
  | 'approved'
  | 'declined'
  | 'completed';

export interface CompletedSaleForClaim {
  sale_id: string;
  chapter_id: string;
  sale_channel: ClaimSaleChannel;
  so_reference: string;
  or_reference: string | null;
  signed_cdr_reference: string | null;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  actual_released_quantity: UnitQuantity;
  cumulative_claimed_quantity: UnitQuantity;
  eligible_replacement_stock: UnitQuantity;
  quarantined_defects: UnitQuantity;
  resalable_restored: UnitQuantity;
  total_replacements_issued: UnitQuantity;
  original_lot_provenance: string;
  within_return_window: boolean;
  version: number;
}

export interface ReplacementAcknowledgment {
  signature_hash: string;
  recipient_name: string;
  acknowledged_at: string;
}

export interface CustomerClaimAdjRecord {
  claim_id: string;
  chapter_id: string;
  adj_reference: string;
  sale_id: string;
  so_reference: string;
  preparer_user_id: string;
  claim_quantity: UnitQuantity;
  claim_reason: string;
  initiated_at: string;
  inspection_completed: boolean;
  inspector_user_id: string | null;
  inspection_outcome: ClaimInspectionOutcome | null;
  linked_supplier_rm_ref: string | null;
  inspection_notes: string | null;
  inspected_at: string | null;
  approver_user_id: string | null;
  approval_duty_code: 'CLAIM_APPROVER' | null;
  decision_reason: string | null;
  replacement_ack: ReplacementAcknowledgment | null;
  restored_provenance: string | null;
  status: CustomerClaimStatus;
  completed_at: string | null;
  version: number;
}

export interface P18HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P18SummaryMetrics {
  eligible_replacement_stock: string;
  quarantined_defects: string;
  resalable_restored: string;
  total_replacements_issued: string;
}

export interface P18OperationLedgerEntry {
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

export interface P18ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P18LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P18EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  completed_sales: ReadonlyArray<CompletedSaleForClaim>;
  claims: ReadonlyArray<CustomerClaimAdjRecord>;
  history: ReadonlyArray<P18HistoryEntry>;
  summary: P18SummaryMetrics;
  operation_ledger: ReadonlyArray<P18OperationLedgerEntry>;
  last_action: P18ActionResult | null;
}

export interface P18EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  completed_sales?: ReadonlyArray<CompletedSaleForClaim> | undefined;
  claims?: ReadonlyArray<CustomerClaimAdjRecord> | undefined;
  history?: ReadonlyArray<P18HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P18OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_clm_ref_seq?: number | undefined;
}

export interface P18ClaimReturnReplacementEngine {
  getSnapshot: () => P18EngineSnapshot;
  registerOriginalSaleForClaim: (input: {
    sale_channel?: ClaimSaleChannel | undefined;
    so_reference: string;
    or_reference?: string | null | undefined;
    signed_cdr_reference?: string | null | undefined;
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    actual_released_quantity_value: string;
    eligible_replacement_stock_value: string;
    original_lot_provenance: string;
    within_return_window: boolean;
  }) => P18ActionResult<CompletedSaleForClaim>;
  initiateCustomerClaimAdj: (input: {
    sale_id: string;
    preparer_user_id: string;
    claim_quantity_value: string;
    claim_reason: string;
    initiated_at: string;
    idempotency_key?: string | undefined;
  }) => P18ActionResult<CustomerClaimAdjRecord>;
  inspectReturnedClaimGoods: (input: {
    claim_id: string;
    inspector_user_id: string;
    inspection_outcome: ClaimInspectionOutcome;
    linked_supplier_rm_ref?: string | null | undefined;
    inspection_notes: string;
    inspected_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P18ActionResult<CustomerClaimAdjRecord>;
  decideCustomerClaimApproval: (input: {
    claim_id: string;
    approver_user_id: string;
    decision: 'approve' | 'decline';
    decision_reason: string;
    decided_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P18ActionResult<CustomerClaimAdjRecord>;
  bindReplacementAcknowledgment: (input: {
    claim_id: string;
    actor_user_id: string;
    signature_hash: string;
    recipient_name: string;
    acknowledged_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P18ActionResult<CustomerClaimAdjRecord>;
  executeApprovedClaimReplacement: (input: {
    claim_id: string;
    actor_user_id: string;
    executed_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P18ActionResult<CustomerClaimAdjRecord>;
  lookupClaimOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P18ActionResult<P18LookupResult>;
}

function readStoredP18Options(): P18EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P18_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P18EngineOptions;
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

export function createP18ClaimReturnReplacementEngine(
  options?: P18EngineOptions
): P18ClaimReturnReplacementEngine {
  const seed = options ?? readStoredP18Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 18000;
  let clmRefSeq = seed.next_clm_ref_seq ?? 0;

  const completedSales: CompletedSaleForClaim[] = (seed.completed_sales ?? []).map((s) =>
    structuredClone(s)
  );
  const claims: CustomerClaimAdjRecord[] = (seed.claims ?? []).map((c) => structuredClone(c));
  const history: P18HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P18OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P18ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P18${String(seq).padStart(19, '0')}`;
  }

  function nextClmRef(): string {
    clmRefSeq += 1;
    return `${chapterPrefix}-ADJ-CLM-2026-${String(clmRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P18SummaryMetrics {
    let eligibleMicro = 0n;
    let quarMicro = 0n;
    let resalableMicro = 0n;
    let replacedMicro = 0n;

    for (const s of completedSales) {
      eligibleMicro += toMicroUnits(s.eligible_replacement_stock.value);
      quarMicro += toMicroUnits(s.quarantined_defects.value);
      resalableMicro += toMicroUnits(s.resalable_restored.value);
      replacedMicro += toMicroUnits(s.total_replacements_issued.value);
    }

    return {
      eligible_replacement_stock: formatTrimmedMicro(eligibleMicro),
      quarantined_defects: formatTrimmedMicro(quarMicro),
      resalable_restored: formatTrimmedMicro(resalableMicro),
      total_replacements_issued: formatTrimmedMicro(replacedMicro),
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P18_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          completed_sales: completedSales,
          claims,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_clm_ref_seq: clmRefSeq,
        })
      );
    } catch {
      // Ignore quota errors.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P18ActionResult<T> {
    const res: P18ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
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
  ): P18ActionResult<T> {
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
    const res: P18ActionResult<T> = {
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

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P18ActionResult<T> | null {
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
        `Idempotency key "${trimmed}" cannot be reused for a modified payload.`
      );
    }
    const replayRes: P18ActionResult<T> = {
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

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        completed_sales: completedSales.map((s) => structuredClone(s)),
        claims: claims.map((c) => structuredClone(c)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    registerOriginalSaleForClaim(input) {
      const channel = input.sale_channel ?? 'track1_so_cdr';
      const soRef = input.so_reference.trim();
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      const provenance = input.original_lot_provenance.trim();

      if (!soRef || !variantId || !itemName || !provenance) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Order reference, variant, item name, and lot provenance are required.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Precision scale must be an integer between 0 and 6.');
      }
      if (
        !isValidUnitQuantity({ value: input.actual_released_quantity_value.trim(), quantity_scale: input.quantity_scale }) ||
        !isValidUnitQuantity({ value: input.eligible_replacement_stock_value.trim(), quantity_scale: input.quantity_scale })
      ) {
        return fail(422, 'INVALID_QUANTITY', 'Sale or replacement quantities violate item precision scale.');
      }

      const relMicro = toMicroUnits(input.actual_released_quantity_value.trim());
      const repMicro = toMicroUnits(input.eligible_replacement_stock_value.trim());

      const sale: CompletedSaleForClaim = {
        sale_id: nextId(),
        chapter_id: chapterId,
        sale_channel: channel,
        so_reference: soRef,
        or_reference: input.or_reference?.trim() || null,
        signed_cdr_reference: input.signed_cdr_reference?.trim() || null,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        actual_released_quantity: fromMicroUnits(relMicro, input.quantity_scale),
        cumulative_claimed_quantity: fromMicroUnits(0n, input.quantity_scale),
        eligible_replacement_stock: fromMicroUnits(repMicro, input.quantity_scale),
        quarantined_defects: fromMicroUnits(0n, input.quantity_scale),
        resalable_restored: fromMicroUnits(0n, input.quantity_scale),
        total_replacements_issued: fromMicroUnits(0n, input.quantity_scale),
        original_lot_provenance: provenance,
        within_return_window: input.within_return_window,
        version: 1,
      };
      completedSales.push(sale);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'ORIGINAL_SALE_REGISTERED',
        message: `Registered ${soRef} (Released ${sale.actual_released_quantity.value}, Eligible Replacement Stock ${sale.eligible_replacement_stock.value}).`,
        data: structuredClone(sale),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P18ActionResult<CompletedSaleForClaim>;
    },

    initiateCustomerClaimAdj(input) {
      const replay = checkIdempotency<CustomerClaimAdjRecord>('p18.init_claim', input.idempotency_key, input);
      if (replay) return replay;

      const preparerId = input.preparer_user_id.trim();
      const reason = input.claim_reason.trim();
      const initiatedAt = input.initiated_at.trim();
      if (!preparerId || !reason || !UTC_INSTANT_PATTERN.test(initiatedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Preparer ID, claim reason, and UTC timestamp are required.');
      }

      const sale = completedSales.find((s) => s.sale_id === input.sale_id);
      if (!sale) return fail(404, 'RESOURCE_NOT_FOUND', 'Original completed sale record not found.');

      if (sale.sale_channel === 'track1_so_cdr') {
        if (!sale.or_reference || !sale.signed_cdr_reference) {
          return fail(
            409,
            'MISSING_ORIGINAL_OR_OR_SIGNED_DR',
            'Track 1 return/defect claim requires both original verified Official Receipt and signed Customer DR evidence.'
          );
        }
      } else if (!sale.or_reference) {
        return fail(
          409,
          'MISSING_ORIGINAL_OR_OR_SIGNED_DR',
          'Booth claim requires original verified booth Official Receipt evidence.'
        );
      }

      if (!sale.within_return_window) {
        return fail(
          409,
          'RETURN_WINDOW_EXPIRED',
          'Approved chapter return window has closed for this completed sale.'
        );
      }

      if (!isValidUnitQuantity({ value: input.claim_quantity_value.trim(), quantity_scale: sale.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Claimed quantity violates item precision scale.');
      }

      const claimMicro = toMicroUnits(input.claim_quantity_value.trim());
      if (claimMicro <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Claimed quantity must be greater than zero.');
      }

      const alreadyClaimedMicro = toMicroUnits(sale.cumulative_claimed_quantity.value);
      const releasedMicro = toMicroUnits(sale.actual_released_quantity.value);
      if (alreadyClaimedMicro + claimMicro > releasedMicro) {
        return fail(
          409,
          'CUMULATIVE_CLAIM_LIMIT_EXCEEDED',
          `Cumulative claimed quantity (${formatTrimmedMicro(alreadyClaimedMicro + claimMicro)}) cannot exceed original released quantity (${sale.actual_released_quantity.value}).`
        );
      }

      sale.cumulative_claimed_quantity = fromMicroUnits(alreadyClaimedMicro + claimMicro, sale.quantity_scale);
      sale.version += 1;

      const adjRef = nextClmRef();
      const claim: CustomerClaimAdjRecord = {
        claim_id: nextId(),
        chapter_id: chapterId,
        adj_reference: adjRef,
        sale_id: sale.sale_id,
        so_reference: sale.so_reference,
        preparer_user_id: preparerId,
        claim_quantity: fromMicroUnits(claimMicro, sale.quantity_scale),
        claim_reason: reason,
        initiated_at: initiatedAt,
        inspection_completed: false,
        inspector_user_id: null,
        inspection_outcome: null,
        linked_supplier_rm_ref: null,
        inspection_notes: null,
        inspected_at: null,
        approver_user_id: null,
        approval_duty_code: null,
        decision_reason: null,
        replacement_ack: null,
        restored_provenance: null,
        status: 'awaiting_inspection',
        completed_at: null,
        version: 1,
      };
      claims.push(claim);

      history.push({
        event_id: nextUlid(),
        target_id: claim.claim_id,
        action: 'initiateCustomerClaimAdj',
        actor_user_id: preparerId,
        reason: `${adjRef} (${claim.claim_quantity.value} units)`,
        timestamp: initiatedAt,
      });

      return recordLedgerAndPersist(
        'p18.init_claim',
        preparerId,
        claim.claim_id,
        input.idempotency_key,
        input,
        201,
        'CLAIM_ADJ_INITIATED',
        `Initiated ${adjRef} (${claim.claim_quantity.value} units). Held unavailable pending physical return inspection before approval.`,
        claim
      );
    },

    inspectReturnedClaimGoods(input) {
      const replay = checkIdempotency<CustomerClaimAdjRecord>('p18.inspect_claim', input.idempotency_key, input);
      if (replay) return replay;

      const inspectorId = input.inspector_user_id.trim();
      const notes = input.inspection_notes.trim();
      const inspectedAt = input.inspected_at.trim();
      if (!inspectorId || !notes || !UTC_INSTANT_PATTERN.test(inspectedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Inspector ID, findings, and UTC timestamp are required.');
      }

      const claim = claims.find((c) => c.claim_id === input.claim_id);
      if (!claim) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer claim ADJ not found.');
      if (claim.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Claim ADJ version changed before inspection completed.');
      }
      if (claim.status !== 'awaiting_inspection') {
        return fail(409, 'INVALID_TRANSITION', `Cannot inspect claim in "${claim.status}" state.`);
      }

      claim.inspection_completed = true;
      claim.inspector_user_id = inspectorId;
      claim.inspection_outcome = input.inspection_outcome;
      claim.linked_supplier_rm_ref = input.linked_supplier_rm_ref?.trim() || null;
      claim.inspection_notes = notes;
      claim.inspected_at = inspectedAt;
      claim.status = 'awaiting_approval';
      claim.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: claim.claim_id,
        action: `inspectReturnedClaimGoods:${input.inspection_outcome}`,
        actor_user_id: inspectorId,
        reason: notes,
        timestamp: inspectedAt,
      });

      return recordLedgerAndPersist(
        'p18.inspect_claim',
        inspectorId,
        claim.claim_id,
        input.idempotency_key,
        input,
        200,
        'CLAIM_INSPECTION_RECORDED',
        `Recorded inspection (${input.inspection_outcome}) for ${claim.adj_reference}. Ready for configured independent claim approval.`,
        claim
      );
    },

    decideCustomerClaimApproval(input) {
      const replay = checkIdempotency<CustomerClaimAdjRecord>('p18.decide_claim', input.idempotency_key, input);
      if (replay) return replay;

      const approverId = input.approver_user_id.trim();
      const reason = input.decision_reason.trim();
      const decidedAt = input.decided_at.trim();
      if (!approverId || !reason || !UTC_INSTANT_PATTERN.test(decidedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Approver ID, decision reason, and UTC timestamp are required.');
      }

      const claim = claims.find((c) => c.claim_id === input.claim_id);
      if (!claim) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer claim ADJ not found.');
      if (claim.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Claim ADJ version changed before decision.');
      }
      if (!claim.inspection_completed || claim.status === 'awaiting_inspection') {
        return fail(
          409,
          'INSPECTION_REQUIRED_BEFORE_APPROVAL',
          'Returned goods must be physically inspected before claim approval or rejection.'
        );
      }
      if (claim.status !== 'awaiting_approval') {
        return fail(409, 'INVALID_TRANSITION', `Cannot decide claim in "${claim.status}" state.`);
      }
      if (approverId === claim.preparer_user_id) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'Claim preparer cannot be sole approver for their own return or defect claim.'
        );
      }

      claim.approver_user_id = approverId;
      claim.approval_duty_code = 'CLAIM_APPROVER';
      claim.decision_reason = reason;
      claim.version += 1;

      if (input.decision === 'decline') {
        const sale = completedSales.find((s) => s.sale_id === claim.sale_id);
        if (sale) {
          const curClaimed = toMicroUnits(sale.cumulative_claimed_quantity.value);
          const thisClaim = toMicroUnits(claim.claim_quantity.value);
          sale.cumulative_claimed_quantity = fromMicroUnits(
            curClaimed >= thisClaim ? curClaimed - thisClaim : 0n,
            sale.quantity_scale
          );
          sale.version += 1;
        }
        claim.status = 'declined';
      } else {
        claim.status = 'approved';
      }

      history.push({
        event_id: nextUlid(),
        target_id: claim.claim_id,
        action: `decideCustomerClaimApproval:${input.decision}`,
        actor_user_id: approverId,
        reason,
        timestamp: decidedAt,
      });

      return recordLedgerAndPersist(
        'p18.decide_claim',
        approverId,
        claim.claim_id,
        input.idempotency_key,
        input,
        200,
        input.decision === 'approve' ? 'CLAIM_ADJ_APPROVED' : 'CLAIM_ADJ_DECLINED',
        input.decision === 'approve'
          ? `Approved ${claim.adj_reference} under single configured Claim Approver authority.`
          : `Declined ${claim.adj_reference} (${reason}); released cumulative claim quota.`,
        claim
      );
    },

    bindReplacementAcknowledgment(input) {
      const replay = checkIdempotency<CustomerClaimAdjRecord>('p18.bind_ack', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const sigHash = input.signature_hash.trim().toLowerCase();
      const recName = input.recipient_name.trim();
      const ackAt = input.acknowledged_at.trim();

      if (!actorId || !recName || !UTC_INSTANT_PATTERN.test(ackAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Actor ID, recipient name, and UTC acknowledgment timestamp are required.');
      }
      if (!SHA256_PATTERN.test(sigHash)) {
        return fail(422, 'INVALID_EVIDENCE_HASH', 'Replacement signature digest must be a valid 64-character lowercase SHA-256 hex digest.');
      }

      const claim = claims.find((c) => c.claim_id === input.claim_id);
      if (!claim) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer claim ADJ not found.');
      if (claim.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Claim ADJ version changed before acknowledgment binding.');
      }
      if (claim.status !== 'approved') {
        return fail(409, 'APPROVAL_REQUIRED', 'Replacement acknowledgment can only be bound after claim approval.');
      }

      claim.replacement_ack = {
        signature_hash: sigHash,
        recipient_name: recName,
        acknowledged_at: ackAt,
      };
      claim.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: claim.claim_id,
        action: 'bindReplacementAcknowledgment',
        actor_user_id: actorId,
        reason: `Recipient ${recName}`,
        timestamp: ackAt,
      });

      return recordLedgerAndPersist(
        'p18.bind_ack',
        actorId,
        claim.claim_id,
        input.idempotency_key,
        input,
        200,
        'REPLACEMENT_ACKNOWLEDGMENT_BOUND',
        `Bound signed replacement acknowledgment from "${recName}" to ${claim.adj_reference}.`,
        claim
      );
    },

    executeApprovedClaimReplacement(input) {
      const replay = checkIdempotency<CustomerClaimAdjRecord>('p18.execute_claim', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const executedAt = input.executed_at.trim();
      if (!actorId || !UTC_INSTANT_PATTERN.test(executedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC execution timestamp are required.');
      }

      const claim = claims.find((c) => c.claim_id === input.claim_id);
      if (!claim) return fail(404, 'RESOURCE_NOT_FOUND', 'Customer claim ADJ not found.');
      if (claim.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Claim ADJ version changed before execution.');
      }
      if (claim.status !== 'approved') {
        return fail(409, 'INVALID_TRANSITION', `Cannot execute replacement for claim in "${claim.status}" state.`);
      }
      if (!claim.replacement_ack) {
        return fail(
          409,
          'MISSING_REPLACEMENT_ACKNOWLEDGMENT',
          'Signed buyer acknowledgment is required before releasing an even replacement unit.'
        );
      }

      const sale = completedSales.find((s) => s.sale_id === claim.sale_id);
      if (!sale) return fail(404, 'RESOURCE_NOT_FOUND', 'Original completed sale record not found.');

      const claimMicro = toMicroUnits(claim.claim_quantity.value);
      const stockMicro = toMicroUnits(sale.eligible_replacement_stock.value);
      if (claimMicro > stockMicro) {
        return fail(
          409,
          'INSUFFICIENT_REPLACEMENT_STOCK',
          `Claimed replacement (${claim.claim_quantity.value}) exceeds available eligible replacement stock (${sale.eligible_replacement_stock.value}).`
        );
      }

      // Deduct eligible replacement once
      let nextStockMicro = stockMicro - claimMicro;
      sale.total_replacements_issued = fromMicroUnits(
        toMicroUnits(sale.total_replacements_issued.value) + claimMicro,
        sale.quantity_scale
      );

      if (claim.inspection_outcome === 'nondefective_resalable') {
        sale.resalable_restored = fromMicroUnits(
          toMicroUnits(sale.resalable_restored.value) + claimMicro,
          sale.quantity_scale
        );
        nextStockMicro += claimMicro;
        claim.restored_provenance = sale.original_lot_provenance;
      } else {
        sale.quarantined_defects = fromMicroUnits(
          toMicroUnits(sale.quarantined_defects.value) + claimMicro,
          sale.quantity_scale
        );
      }

      sale.eligible_replacement_stock = fromMicroUnits(nextStockMicro, sale.quantity_scale);
      sale.version += 1;

      claim.status = 'completed';
      claim.completed_at = executedAt;
      claim.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: claim.claim_id,
        action: 'executeApprovedClaimReplacement',
        actor_user_id: actorId,
        reason: `${claim.adj_reference} (${claim.inspection_outcome})`,
        timestamp: executedAt,
      });

      return recordLedgerAndPersist(
        'p18.execute_claim',
        actorId,
        claim.claim_id,
        input.idempotency_key,
        input,
        200,
        'CLAIM_REPLACEMENT_EXECUTED',
        claim.inspection_outcome === 'nondefective_resalable'
          ? `Executed ${claim.adj_reference}: released ${claim.claim_quantity.value} replacement(s) and restored resalable return under original provenance "${sale.original_lot_provenance}".`
          : `Executed ${claim.adj_reference}: quarantined ${claim.claim_quantity.value} unit(s) (never resalable) and deducted signed replacement once.`,
        claim
      );
    },

    lookupClaimOperation(input) {
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
