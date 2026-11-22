import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P10_CONTEXT_STORAGE_KEY = 'ysp_p10_context';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export interface OpenPurchaseOrderForReceiving {
  po_id: string;
  po_reference: string;
  supplier_name: string;
  variant_id: string;
  item_name?: string | undefined;
  quantity_scale: number;
  ordered_quantity: string;
  accepted_quantity: string;
  outstanding_quantity: string;
  status: 'open' | 'partial' | 'completed';
  version: number;
}

export interface SupplierRmReceipt {
  rm_id: string;
  rm_reference: string;
  po_id: string;
  po_reference: string;
  supplier_dr_reference: string;
  variant_id: string;
  delivered_quantity: UnitQuantity;
  accepted_quantity: string;
  held_quantity: string;
  rejected_quantity: string;
  missing_quantity: string;
  inspector_user_id: string;
  inspection_at: string;
  condition_notes: string;
  inspection_evidence_hash: string;
  discrepancy_evidence_hash: string | null;
}

export interface SupplierClaimRecord {
  claim_id: string;
  rm_id: string;
  rm_reference: string;
  po_id: string;
  po_reference: string;
  held_initial: string;
  held_remaining: string;
  held_transferred: boolean;
  rejected_quantity: string;
  missing_quantity: string;
  status: 'open' | 'resolved';
  resolution_kind: 'replacement_received' | 'credit_note' | 'returned_to_supplier' | null;
  resolution_notes: string | null;
  version: number;
}

export interface P10HistoryEntry {
  event_id: string;
  po_id: string;
  rm_id: string | null;
  action: string;
  actor_user_id: string;
  notes: string;
  timestamp: string;
}

export interface P10StockSummary {
  usable_on_hand: string;
  allocatable_now: string;
  held_quarantined: string;
  rejected_nonusable: string;
  open_po_outstanding: string;
  open_claims_count: number;
}

export interface P10OperationLedgerEntry {
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

export interface P10ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P10LookupResult {
  action_result: 'recovered' | 'uncertain' | 'forbidden';
  input_policy: 'may_clear' | 'preserve';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P10EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  open_pos: ReadonlyArray<OpenPurchaseOrderForReceiving>;
  receipts: ReadonlyArray<SupplierRmReceipt>;
  supplier_claims: ReadonlyArray<SupplierClaimRecord>;
  history: ReadonlyArray<P10HistoryEntry>;
  summary: P10StockSummary;
  operation_ledger: ReadonlyArray<P10OperationLedgerEntry>;
  last_action: P10ActionResult | null;
}

export interface P10EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
}

export interface P10SupplierReceivingEngine {
  getSnapshot: () => P10EngineSnapshot;
  registerOpenPoForReceiving: (input: {
    chapter_id?: string | undefined;
    po_reference: string;
    supplier_name: string;
    variant_id: string;
    item_name?: string | undefined;
    ordered_quantity_value: string;
    quantity_scale: number;
  }) => P10ActionResult<OpenPurchaseOrderForReceiving>;
  inspectAndPostSupplierRm: (input: {
    chapter_id?: string | undefined;
    inspector_user_id: string;
    po_id: string;
    has_valid_supplier_dr: boolean;
    supplier_dr_reference: string;
    delivered_variant_id: string;
    delivered_value: string;
    accepted_value: string;
    held_value: string;
    rejected_value: string;
    missing_value: string;
    inspection_at: string;
    condition_notes: string;
    inspection_evidence_hash: string;
    discrepancy_evidence_hash?: string | undefined;
    expected_po_version: number;
    idempotency_key?: string | undefined;
  }) => P10ActionResult<SupplierRmReceipt>;
  acceptPreviouslyHeldCustody: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    claim_id: string;
    clearance_notes: string;
    expected_claim_version: number;
    idempotency_key?: string | undefined;
  }) => P10ActionResult<SupplierClaimRecord>;
  resolveSupplierClaim: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    claim_id: string;
    resolution_kind: 'replacement_received' | 'credit_note' | 'returned_to_supplier';
    resolution_notes: string;
    expected_claim_version: number;
    idempotency_key?: string | undefined;
  }) => P10ActionResult<SupplierClaimRecord>;
  lookupReceivingOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P10ActionResult<P10LookupResult>;
}

function readStoredP10Options(): P10EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P10_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P10EngineOptions;
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

export function createP10SupplierReceivingEngine(
  options?: P10EngineOptions
): P10SupplierReceivingEngine {
  const seed = options ?? readStoredP10Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 10000;
  let rmRefSeq = 0;

  let usableMicroTotal = 0n;
  let heldMicroTotal = 0n;
  let rejectedMicroTotal = 0n;

  const openPos: OpenPurchaseOrderForReceiving[] = [];
  const receipts: SupplierRmReceipt[] = [];
  const supplierClaims: SupplierClaimRecord[] = [];
  const history: P10HistoryEntry[] = [];
  const operationLedger: P10OperationLedgerEntry[] = [];
  let lastAction: P10ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P10${String(seq).padStart(19, '0')}`;
  }

  function nextTimestamp(): string {
    return `2026-11-22T12:35:${String(seq % 60).padStart(2, '0')}.000000Z`;
  }

  function allocateRmReference(): string {
    rmRefSeq += 1;
    return `${chapterPrefix}-RM-2026-${String(rmRefSeq).padStart(6, '0')}`;
  }

  function recordOutcome<T>(res: P10ActionResult<T>): P10ActionResult<T> {
    lastAction = res;
    return res;
  }

  function checkChapter<T>(requested?: string): P10ActionResult<T> | null {
    if (requested !== undefined && requested !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested receiving record is outside authorized chapter scope.',
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
    | { status: 'replay'; result: P10ActionResult<T> }
    | { status: 'conflict'; result: P10ActionResult<T> }
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
        message: 'Idempotency key was already committed with a different request payload.',
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
  }): P10ActionResult<T> {
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

  function computeSummary(): P10StockSummary {
    const outstandingMicro = openPos.reduce(
      (acc, po) => acc + toMicroUnits(po.outstanding_quantity),
      0n
    );
    return {
      usable_on_hand: formatTrimmedMicro(usableMicroTotal),
      allocatable_now: formatTrimmedMicro(usableMicroTotal),
      held_quarantined: formatTrimmedMicro(heldMicroTotal),
      rejected_nonusable: formatTrimmedMicro(rejectedMicroTotal),
      open_po_outstanding: formatTrimmedMicro(outstandingMicro),
      open_claims_count: supplierClaims.filter((c) => c.status === 'open').length,
    };
  }

  function registerOpenPoForReceiving(input: {
    chapter_id?: string | undefined;
    po_reference: string;
    supplier_name: string;
    variant_id: string;
    item_name?: string | undefined;
    ordered_quantity_value: string;
    quantity_scale: number;
  }): P10ActionResult<OpenPurchaseOrderForReceiving> {
    const scopeErr = checkChapter<OpenPurchaseOrderForReceiving>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const poRef = input.po_reference.trim();
    const supplier = input.supplier_name.trim();
    const variantId = input.variant_id.trim();
    const qtyVal = input.ordered_quantity_value.trim();

    if (!poRef || !supplier || !variantId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'PO_SOURCE_FIELDS_REQUIRED',
        message: 'Purchase Order reference, supplier name, and variant ID are required.',
      });
    }
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: input.quantity_scale }) || toMicroUnits(qtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Ordered quantity "${qtyVal}" must be positive at scale ${input.quantity_scale}.`,
      });
    }

    const qtyFormatted = fromMicroUnits(toMicroUnits(qtyVal), input.quantity_scale).value;
    const po: OpenPurchaseOrderForReceiving = {
      po_id: nextId(),
      po_reference: poRef,
      supplier_name: supplier,
      variant_id: variantId,
      item_name: input.item_name?.trim() || undefined,
      quantity_scale: input.quantity_scale,
      ordered_quantity: qtyFormatted,
      accepted_quantity: '0',
      outstanding_quantity: qtyFormatted,
      status: 'open',
      version: 1,
    };
    openPos.push(po);

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'OPEN_PO_REGISTERED',
      message: `Registered open Purchase Order ${po.po_reference} (${po.ordered_quantity} units outstanding).`,
      data: structuredClone(po),
    });
  }

  function inspectAndPostSupplierRm(input: {
    chapter_id?: string | undefined;
    inspector_user_id: string;
    po_id: string;
    has_valid_supplier_dr: boolean;
    supplier_dr_reference: string;
    delivered_variant_id: string;
    delivered_value: string;
    accepted_value: string;
    held_value: string;
    rejected_value: string;
    missing_value: string;
    inspection_at: string;
    condition_notes: string;
    inspection_evidence_hash: string;
    discrepancy_evidence_hash?: string | undefined;
    expected_po_version: number;
    idempotency_key?: string | undefined;
  }): P10ActionResult<SupplierRmReceipt> {
    const scopeErr = checkChapter<SupplierRmReceipt>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const inspector = input.inspector_user_id.trim();
    if (!inspector) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INSPECTOR_REQUIRED',
        message: 'Authenticated receiving inspector ID is required.',
      });
    }

    const idem = checkIdempotency<SupplierRmReceipt>({
      action_code: 'receiving.supplier_rm.post',
      actor_user_id: inspector,
      target_id: input.po_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const po = openPos.find((p) => p.po_id === input.po_id);
    if (!po || !input.has_valid_supplier_dr || !input.supplier_dr_reference.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'MISSING_RECEIVING_SOURCE',
        message:
          'Purchased goods require both an approved Purchase Order and a valid Supplier Delivery Receipt before posting stock.',
      });
    }
    if (po.version !== input.expected_po_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase Order state changed before receipt posting; reload open balance.',
      });
    }
    if (input.delivered_variant_id.trim() !== po.variant_id) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'UNAUTHORIZED_SUBSTITUTION',
        message: `Delivered variant "${input.delivered_variant_id}" does not match ordered PO variant "${po.variant_id}".`,
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.inspection_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Inspection timestamp must be a valid Z-suffixed UTC instant.',
      });
    }
    if (!input.condition_notes.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'CONDITION_NOTES_REQUIRED',
        message: 'Condition and packaging inspection notes are required.',
      });
    }
    if (!SHA256_HEX_PATTERN.test(input.inspection_evidence_hash.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'INSPECTION_EVIDENCE_REQUIRED',
        message: 'Valid 64-character SHA-256 inspection evidence digest is required.',
      });
    }

    const scale = po.quantity_scale;
    const rawQty = {
      delivered: input.delivered_value.trim(),
      accepted: input.accepted_value.trim(),
      held: input.held_value.trim(),
      rejected: input.rejected_value.trim(),
      missing: input.missing_value.trim(),
    };
    for (const [label, val] of Object.entries(rawQty)) {
      if (!isValidUnitQuantity({ value: val, quantity_scale: scale })) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_PRECISION',
          message: `Quantity ${label} ("${val}") must match unit decimal scale ${scale}.`,
        });
      }
    }

    const deliveredMicro = toMicroUnits(rawQty.delivered);
    const acceptedMicro = toMicroUnits(rawQty.accepted);
    const heldMicro = toMicroUnits(rawQty.held);
    const rejectedMicro = toMicroUnits(rawQty.rejected);
    const missingMicro = toMicroUnits(rawQty.missing);
    const outstandingMicro = toMicroUnits(po.outstanding_quantity);

    if (deliveredMicro !== acceptedMicro + heldMicro + rejectedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'QUANTITY_SPLIT_MISMATCH',
        message: 'Delivered quantity must equal accepted + held + rejected quantities.',
      });
    }
    if (acceptedMicro + heldMicro > outstandingMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OVERDELIVERY_NOT_AUTHORIZED',
        message: `Accepted + held quantity exceeds open PO outstanding balance (${po.outstanding_quantity}) without prior PO amendment.`,
      });
    }

    const hasDiscrepancy = heldMicro > 0n || rejectedMicro > 0n || missingMicro > 0n;
    const discHash = input.discrepancy_evidence_hash?.trim() || null;
    if (hasDiscrepancy && (!discHash || !SHA256_HEX_PATTERN.test(discHash))) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DISCREPANCY_EVIDENCE_REQUIRED',
        message: 'Held, rejected, or missing units require a valid 64-character SHA-256 discrepancy evidence digest.',
      });
    }

    const rmId = nextId();
    const rmRef = allocateRmReference();
    const receipt: SupplierRmReceipt = {
      rm_id: rmId,
      rm_reference: rmRef,
      po_id: po.po_id,
      po_reference: po.po_reference,
      supplier_dr_reference: input.supplier_dr_reference.trim(),
      variant_id: po.variant_id,
      delivered_quantity: fromMicroUnits(deliveredMicro, scale),
      accepted_quantity: fromMicroUnits(acceptedMicro, scale).value,
      held_quantity: fromMicroUnits(heldMicro, scale).value,
      rejected_quantity: fromMicroUnits(rejectedMicro, scale).value,
      missing_quantity: fromMicroUnits(missingMicro, scale).value,
      inspector_user_id: inspector,
      inspection_at: input.inspection_at.trim(),
      condition_notes: input.condition_notes.trim(),
      inspection_evidence_hash: input.inspection_evidence_hash.trim(),
      discrepancy_evidence_hash: discHash,
    };

    receipts.push(receipt);

    // Only accepted quantity enters usable stock & satisfies PO balance
    usableMicroTotal += acceptedMicro;
    heldMicroTotal += heldMicro;
    rejectedMicroTotal += rejectedMicro;

    const newAcceptedPoMicro = toMicroUnits(po.accepted_quantity) + acceptedMicro;
    const newOutstandingPoMicro = toMicroUnits(po.ordered_quantity) - newAcceptedPoMicro;
    po.accepted_quantity = fromMicroUnits(newAcceptedPoMicro, scale).value;
    po.outstanding_quantity = fromMicroUnits(newOutstandingPoMicro, scale).value;
    po.status = newOutstandingPoMicro === 0n ? 'completed' : 'partial';
    po.version += 1;

    if (hasDiscrepancy) {
      supplierClaims.push({
        claim_id: nextId(),
        rm_id: rmId,
        rm_reference: rmRef,
        po_id: po.po_id,
        po_reference: po.po_reference,
        held_initial: receipt.held_quantity,
        held_remaining: receipt.held_quantity,
        held_transferred: false,
        rejected_quantity: receipt.rejected_quantity,
        missing_quantity: receipt.missing_quantity,
        status: 'open',
        resolution_kind: null,
        resolution_notes: null,
        version: 1,
      });
    }

    history.push({
      event_id: nextId(),
      po_id: po.po_id,
      rm_id: rmId,
      action: 'inspectAndPostSupplierRm',
      actor_user_id: inspector,
      notes: `Posted ${receipt.accepted_quantity} usable; held ${receipt.held_quantity}, rejected ${receipt.rejected_quantity}, missing ${receipt.missing_quantity}`,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'receiving.supplier_rm.post',
      actor_user_id: inspector,
      target_id: rmId,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'SUPPLIER_RM_POSTED',
      message: `Posted ${receipt.rm_reference}: ${receipt.accepted_quantity} usable immediately allocatable; PO outstanding remaining: ${po.outstanding_quantity}.`,
      snapshot: receipt,
    });
  }

  function acceptPreviouslyHeldCustody(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    claim_id: string;
    clearance_notes: string;
    expected_claim_version: number;
    idempotency_key?: string | undefined;
  }): P10ActionResult<SupplierClaimRecord> {
    const scopeErr = checkChapter<SupplierClaimRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<SupplierClaimRecord>({
      action_code: 'receiving.held_custody.accept',
      actor_user_id: actor,
      target_id: input.claim_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const claim = supplierClaims.find((c) => c.claim_id === input.claim_id);
    const po = claim ? openPos.find((p) => p.po_id === claim.po_id) : undefined;
    if (!claim || !po) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Supplier discrepancy or Purchase Order was not found.',
      });
    }
    if (claim.held_transferred || toMicroUnits(claim.held_remaining) === 0n) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'HELD_CUSTODY_ALREADY_TRANSFERRED',
        message: 'Held custody units were already transferred once into usable stock.',
      });
    }
    if (claim.version !== input.expected_claim_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Discrepancy record version changed before custody transfer.',
      });
    }
    if (!input.clearance_notes.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'CLEARANCE_NOTES_REQUIRED',
        message: 'Verification clearance notes are required to accept held goods.',
      });
    }

    const transferMicro = toMicroUnits(claim.held_remaining);
    const outstandingMicro = toMicroUnits(po.outstanding_quantity);
    if (transferMicro > outstandingMicro) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OVERDELIVERY_NOT_AUTHORIZED',
        message: 'Held quantity exceeds remaining Purchase Order balance.',
      });
    }

    const scale = po.quantity_scale;
    heldMicroTotal -= transferMicro;
    usableMicroTotal += transferMicro;

    const newAcceptedPo = toMicroUnits(po.accepted_quantity) + transferMicro;
    const newOutstandingPo = toMicroUnits(po.ordered_quantity) - newAcceptedPo;
    po.accepted_quantity = fromMicroUnits(newAcceptedPo, scale).value;
    po.outstanding_quantity = fromMicroUnits(newOutstandingPo, scale).value;
    po.status = newOutstandingPo === 0n ? 'completed' : 'partial';
    po.version += 1;

    claim.held_remaining = '0';
    claim.held_transferred = true;
    claim.version += 1;

    history.push({
      event_id: nextId(),
      po_id: po.po_id,
      rm_id: claim.rm_id,
      action: 'acceptPreviouslyHeldCustody',
      actor_user_id: actor,
      notes: input.clearance_notes.trim(),
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'receiving.held_custody.accept',
      actor_user_id: actor,
      target_id: claim.claim_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'HELD_CUSTODY_ACCEPTED',
      message: `Transferred ${fromMicroUnits(transferMicro, scale).value} held units into usable stock once.`,
      snapshot: claim,
    });
  }

  function resolveSupplierClaim(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    claim_id: string;
    resolution_kind: 'replacement_received' | 'credit_note' | 'returned_to_supplier';
    resolution_notes: string;
    expected_claim_version: number;
    idempotency_key?: string | undefined;
  }): P10ActionResult<SupplierClaimRecord> {
    const scopeErr = checkChapter<SupplierClaimRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<SupplierClaimRecord>({
      action_code: 'receiving.claim.resolve',
      actor_user_id: actor,
      target_id: input.claim_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const claim = supplierClaims.find((c) => c.claim_id === input.claim_id);
    if (!claim) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Supplier discrepancy claim was not found.',
      });
    }
    if (claim.version !== input.expected_claim_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Discrepancy claim version changed before resolution.',
      });
    }
    if (!input.resolution_notes.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'RESOLUTION_NOTES_REQUIRED',
        message: 'Supplier resolution notes are required.',
      });
    }

    claim.status = 'resolved';
    claim.resolution_kind = input.resolution_kind;
    claim.resolution_notes = input.resolution_notes.trim();
    claim.version += 1;

    history.push({
      event_id: nextId(),
      po_id: claim.po_id,
      rm_id: claim.rm_id,
      action: `resolveSupplierClaim(${input.resolution_kind})`,
      actor_user_id: actor,
      notes: claim.resolution_notes,
      timestamp: nextTimestamp(),
    });

    return commitToLedger({
      action_code: 'receiving.claim.resolve',
      actor_user_id: actor,
      target_id: claim.claim_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'SUPPLIER_CLAIM_RESOLVED',
      message: `Recorded resolution on claim #${claim.claim_id} (rejected/non-usable stock remains excluded from usable balance).`,
      snapshot: claim,
    });
  }

  function lookupReceivingOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P10ActionResult<P10LookupResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested receiving operation scope is outside authorized chapter.',
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
      message: 'No visible receiving operation found. Preserve entered counts before retrying.',
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
      open_pos: openPos.map((p) => structuredClone(p)),
      receipts: receipts.map((r) => structuredClone(r)),
      supplier_claims: supplierClaims.map((c) => structuredClone(c)),
      history: history.map((h) => structuredClone(h)),
      summary: computeSummary(),
      operation_ledger: operationLedger.map((o) => structuredClone(o)),
      last_action: lastAction,
    }),
    registerOpenPoForReceiving,
    inspectAndPostSupplierRm,
    acceptPreviouslyHeldCustody,
    resolveSupplierClaim,
    lookupReceivingOperation,
  };
}
