import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P16_CONTEXT_STORAGE_KEY = 'ysp_p16_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type DonorRestrictionMode =
  | 'unrestricted'
  | 'distribution_only'
  | 'scoped_predicate'
  | 'uninterpreted_condition';

export type AllocationDemandKind = 'track1_sale' | 'booth_sale' | 'internal_rf';

export interface DonationAcknowledgment {
  da_id: string;
  chapter_id: string;
  da_reference: string;
  donor_name: string;
  acknowledging_officer_id: string;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  declared_quantity: UnitQuantity;
  estimated_unit_value: string;
  valuation_basis: string;
  restriction_mode: DonorRestrictionMode;
  permitted_event_code: string | null;
  permitted_unit_id: string | null;
  raw_donor_condition: string;
  acknowledged_at: string;
  creates_cash_receipt: false;
  or_reference: null;
  rm_posted: boolean;
  version: number;
}

export interface ProvenanceStockLot {
  lot_id: string;
  chapter_id: string;
  source_kind: 'DA' | 'PO';
  source_reference: string;
  rm_reference: string;
  variant_id: string;
  item_name: string;
  quantity_scale: number;
  accepted_quantity: UnitQuantity;
  quarantined_rejected_quantity: UnitQuantity;
  allocated_quantity: UnitQuantity;
  available_quantity: UnitQuantity;
  restriction_version: number;
  restriction_mode: DonorRestrictionMode;
  permitted_event_code: string | null;
  permitted_unit_id: string | null;
  acknowledging_officer_id: string | null;
  resolution_evidence_hash: string | null;
  version: number;
}

export interface DonationAllocationRecord {
  allocation_id: string;
  lot_id: string;
  rm_reference: string;
  variant_id: string;
  demand_kind: AllocationDemandKind;
  demand_reference: string;
  event_code: string | null;
  unit_id: string | null;
  quantity: UnitQuantity;
  actor_user_id: string;
  allocated_at: string;
}

export interface P16HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P16SummaryMetrics {
  total_usable_on_hand: string;
  unrestricted_saleable: string;
  restricted_internal_only: string;
  uninterpreted_blocked: string;
  cash_or_created_count: number;
}

export interface P16OperationLedgerEntry {
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

export interface P16ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P16LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P16EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  donation_records: ReadonlyArray<DonationAcknowledgment>;
  stock_lots: ReadonlyArray<ProvenanceStockLot>;
  allocations: ReadonlyArray<DonationAllocationRecord>;
  history: ReadonlyArray<P16HistoryEntry>;
  summary: P16SummaryMetrics;
  operation_ledger: ReadonlyArray<P16OperationLedgerEntry>;
  last_action: P16ActionResult | null;
}

export interface P16EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  donation_records?: ReadonlyArray<DonationAcknowledgment> | undefined;
  stock_lots?: ReadonlyArray<ProvenanceStockLot> | undefined;
  allocations?: ReadonlyArray<DonationAllocationRecord> | undefined;
  history?: ReadonlyArray<P16HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P16OperationLedgerEntry> | undefined;
  next_seq?: number | undefined;
  next_da_ref_seq?: number | undefined;
  next_rm_da_ref_seq?: number | undefined;
}

export interface P16DonationRestrictionEngine {
  getSnapshot: () => P16EngineSnapshot;
  acknowledgeDonationSource: (input: {
    donor_name: string;
    acknowledging_officer_id: string;
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    declared_quantity_value: string;
    estimated_unit_value: string;
    valuation_basis: string;
    restriction_mode: DonorRestrictionMode;
    permitted_event_code?: string | null | undefined;
    permitted_unit_id?: string | null | undefined;
    raw_donor_condition: string;
    acknowledged_at: string;
    idempotency_key?: string | undefined;
  }) => P16ActionResult<DonationAcknowledgment>;
  postDonatedRmReceipt: (input: {
    da_id: string;
    inspector_user_id: string;
    accepted_quantity_value: string;
    rejected_quantity_value: string;
    inspected_at: string;
    idempotency_key?: string | undefined;
  }) => P16ActionResult<ProvenanceStockLot>;
  registerUnrestrictedCommercialLot: (input: {
    po_reference: string;
    rm_reference: string;
    variant_id: string;
    item_name: string;
    quantity_scale: number;
    accepted_quantity_value: string;
  }) => P16ActionResult<ProvenanceStockLot>;
  allocateLotToDemand: (input: {
    lot_id: string;
    demand_kind: AllocationDemandKind;
    demand_reference: string;
    event_code?: string | null | undefined;
    unit_id?: string | null | undefined;
    quantity_value: string;
    actor_user_id: string;
    attempt_ordinary_override?: boolean | undefined;
    allocated_at: string;
    idempotency_key?: string | undefined;
  }) => P16ActionResult<DonationAllocationRecord>;
  resolveDonorRestrictionVersion: (input: {
    lot_id: string;
    approver_user_id: string;
    next_mode: DonorRestrictionMode;
    permitted_event_code?: string | null | undefined;
    permitted_unit_id?: string | null | undefined;
    evidence_hash: string;
    resolution_notes: string;
    resolved_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P16ActionResult<ProvenanceStockLot>;
  lookupDonationOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P16ActionResult<P16LookupResult>;
}

function readStoredP16Options(): P16EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P16_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P16EngineOptions;
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

export function createP16DonationRestrictionEngine(
  options?: P16EngineOptions
): P16DonationRestrictionEngine {
  const seed = options ?? readStoredP16Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 16000;
  let daRefSeq = seed.next_da_ref_seq ?? 0;
  let rmDaRefSeq = seed.next_rm_da_ref_seq ?? 0;

  const donationRecords: DonationAcknowledgment[] = (seed.donation_records ?? []).map((d) =>
    structuredClone(d)
  );
  const stockLots: ProvenanceStockLot[] = (seed.stock_lots ?? []).map((l) => structuredClone(l));
  const allocations: DonationAllocationRecord[] = (seed.allocations ?? []).map((a) =>
    structuredClone(a)
  );
  const history: P16HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P16OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P16ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P16${String(seq).padStart(19, '0')}`;
  }

  function nextDaRef(): string {
    daRefSeq += 1;
    return `${chapterPrefix}-DA-2026-${String(daRefSeq).padStart(6, '0')}`;
  }

  function nextRmDaRef(): string {
    rmDaRefSeq += 1;
    return `${chapterPrefix}-RM-DA-2026-${String(rmDaRefSeq).padStart(6, '0')}`;
  }

  function computeSummary(): P16SummaryMetrics {
    let totalMicro = 0n;
    let saleableMicro = 0n;
    let internalOnlyMicro = 0n;
    let uninterpretedMicro = 0n;

    for (const lot of stockLots) {
      const availMicro = toMicroUnits(lot.available_quantity.value);
      totalMicro += availMicro;
      if (lot.restriction_mode === 'unrestricted') {
        saleableMicro += availMicro;
      } else if (lot.restriction_mode === 'uninterpreted_condition') {
        uninterpretedMicro += availMicro;
      } else {
        internalOnlyMicro += availMicro;
      }
    }

    return {
      total_usable_on_hand: formatTrimmedMicro(totalMicro),
      unrestricted_saleable: formatTrimmedMicro(saleableMicro),
      restricted_internal_only: formatTrimmedMicro(internalOnlyMicro),
      uninterpreted_blocked: formatTrimmedMicro(uninterpretedMicro),
      cash_or_created_count: 0,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P16_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          donation_records: donationRecords,
          stock_lots: stockLots,
          allocations,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
          next_da_ref_seq: daRefSeq,
          next_rm_da_ref_seq: rmDaRefSeq,
        })
      );
    } catch {
      // Ignore quota errors.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P16ActionResult<T> {
    const res: P16ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
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
  ): P16ActionResult<T> {
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
    const res: P16ActionResult<T> = {
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
  ): P16ActionResult<T> | null {
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
    const replayRes: P16ActionResult<T> = {
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

  function isDemandCompatibleWithRestriction(
    mode: DonorRestrictionMode,
    permittedEvent: string | null,
    permittedUnit: string | null,
    demandKind: AllocationDemandKind,
    demandEvent: string | null,
    demandUnit: string | null
  ): { ok: true } | { ok: false; code: string; message: string } {
    if (mode === 'uninterpreted_condition') {
      return {
        ok: false,
        code: 'UNINTERPRETED_DONOR_CONDITION_BLOCKED',
        message: 'Uninterpreted donor condition keeps goods unavailable until an authorized interpretation resolves permitted use.',
      };
    }
    if (mode === 'distribution_only' && (demandKind === 'track1_sale' || demandKind === 'booth_sale')) {
      return {
        ok: false,
        code: 'DISTRIBUTION_ONLY_SALE_FORBIDDEN',
        message: 'Distribution-only donated goods cannot be sold via Track 1 or booth sales; internal distribution RF only.',
      };
    }
    if (mode === 'scoped_predicate') {
      if (demandKind === 'track1_sale' || demandKind === 'booth_sale') {
        return {
          ok: false,
          code: 'DISTRIBUTION_ONLY_SALE_FORBIDDEN',
          message: 'Scoped predicate donated goods cannot be allocated for commercial sales.',
        };
      }
      if (permittedEvent && permittedEvent !== (demandEvent ?? '').trim()) {
        return {
          ok: false,
          code: 'DONOR_PREDICATE_MISMATCH',
          message: `Donation restriction requires event "${permittedEvent}" (got "${demandEvent ?? 'none'}").`,
        };
      }
      if (permittedUnit && permittedUnit !== (demandUnit ?? '').trim()) {
        return {
          ok: false,
          code: 'DONOR_PREDICATE_MISMATCH',
          message: `Donation restriction requires unit "${permittedUnit}" (got "${demandUnit ?? 'none'}").`,
        };
      }
    }
    return { ok: true };
  }

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        donation_records: donationRecords.map((d) => structuredClone(d)),
        stock_lots: stockLots.map((l) => structuredClone(l)),
        allocations: allocations.map((a) => structuredClone(a)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    acknowledgeDonationSource(input) {
      const replay = checkIdempotency<DonationAcknowledgment>('p16.ack_da', input.idempotency_key, input);
      if (replay) return replay;

      const donor = input.donor_name.trim();
      const officerId = input.acknowledging_officer_id.trim();
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      const basis = input.valuation_basis.trim();
      const rawCond = input.raw_donor_condition.trim();
      const ackAt = input.acknowledged_at.trim();

      if (!donor || !officerId || !variantId || !itemName || !basis || !rawCond || !UTC_INSTANT_PATTERN.test(ackAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Donor, officer ID, variant, valuation basis, restriction note, and UTC timestamp are required.');
      }
      if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
        return fail(422, 'INVALID_PRECISION', 'Precision scale must be an integer between 0 and 6.');
      }
      if (!isValidUnitQuantity({ value: input.declared_quantity_value.trim(), quantity_scale: input.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Declared quantity violates approved precision scale.');
      }
      if (toMicroUnits(input.declared_quantity_value.trim()) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Declared quantity must be greater than zero.');
      }
      if (!MONEY_PATTERN.test(input.estimated_unit_value.trim())) {
        return fail(422, 'INVALID_MONEY_FORMAT', 'Estimated unit value must use two-decimal format.');
      }

      const daRef = nextDaRef();
      const da: DonationAcknowledgment = {
        da_id: nextId(),
        chapter_id: chapterId,
        da_reference: daRef,
        donor_name: donor,
        acknowledging_officer_id: officerId,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        declared_quantity: {
          value: input.declared_quantity_value.trim(),
          quantity_scale: input.quantity_scale,
        },
        estimated_unit_value: input.estimated_unit_value.trim(),
        valuation_basis: basis,
        restriction_mode: input.restriction_mode,
        permitted_event_code: input.permitted_event_code?.trim() || null,
        permitted_unit_id: input.permitted_unit_id?.trim() || null,
        raw_donor_condition: rawCond,
        acknowledged_at: ackAt,
        creates_cash_receipt: false,
        or_reference: null,
        rm_posted: false,
        version: 1,
      };
      donationRecords.push(da);

      history.push({
        event_id: nextUlid(),
        target_id: da.da_id,
        action: 'acknowledgeDonationSource',
        actor_user_id: officerId,
        reason: `${daRef} from ${donor} (${da.restriction_mode})`,
        timestamp: ackAt,
      });

      return recordLedgerAndPersist(
        'p16.ack_da',
        officerId,
        da.da_id,
        input.idempotency_key,
        input,
        201,
        'DA_ACKNOWLEDGED',
        `Acknowledged in-kind donation ${daRef} (${da.declared_quantity.value} units). Non-cash record — zero OR or customer credit created.`,
        da
      );
    },

    postDonatedRmReceipt(input) {
      const replay = checkIdempotency<ProvenanceStockLot>('p16.post_da_rm', input.idempotency_key, input);
      if (replay) return replay;

      const inspectorId = input.inspector_user_id.trim();
      const inspectedAt = input.inspected_at.trim();
      if (!inspectorId || !UTC_INSTANT_PATTERN.test(inspectedAt)) {
        return fail(422, 'INVALID_INPUT', 'Inspector ID and valid UTC timestamp are required.');
      }

      const da = donationRecords.find((d) => d.da_id === input.da_id);
      if (!da) return fail(404, 'RESOURCE_NOT_FOUND', 'Donation acknowledgment not found.');
      if (da.rm_posted) {
        return fail(409, 'DA_RM_ALREADY_POSTED', `Receiving report has already been posted for ${da.da_reference}.`);
      }

      if (
        !isValidUnitQuantity({ value: input.accepted_quantity_value.trim(), quantity_scale: da.quantity_scale }) ||
        !isValidUnitQuantity({ value: input.rejected_quantity_value.trim(), quantity_scale: da.quantity_scale })
      ) {
        return fail(422, 'INVALID_QUANTITY', 'Accepted and rejected quantities violate item precision scale.');
      }

      const accMicro = toMicroUnits(input.accepted_quantity_value.trim());
      const rejMicro = toMicroUnits(input.rejected_quantity_value.trim());
      const decMicro = toMicroUnits(da.declared_quantity.value);
      if (accMicro + rejMicro !== decMicro) {
        return fail(422, 'COUNT_MISMATCH', `Accepted + rejected (${formatTrimmedMicro(accMicro + rejMicro)}) must equal declared DA quantity (${da.declared_quantity.value}).`);
      }

      const rmRef = nextRmDaRef();
      const lot: ProvenanceStockLot = {
        lot_id: nextId(),
        chapter_id: chapterId,
        source_kind: 'DA',
        source_reference: da.da_reference,
        rm_reference: rmRef,
        variant_id: da.variant_id,
        item_name: da.item_name,
        quantity_scale: da.quantity_scale,
        accepted_quantity: fromMicroUnits(accMicro, da.quantity_scale),
        quarantined_rejected_quantity: fromMicroUnits(rejMicro, da.quantity_scale),
        allocated_quantity: fromMicroUnits(0n, da.quantity_scale),
        available_quantity: fromMicroUnits(accMicro, da.quantity_scale),
        restriction_version: 1,
        restriction_mode: da.restriction_mode,
        permitted_event_code: da.permitted_event_code,
        permitted_unit_id: da.permitted_unit_id,
        acknowledging_officer_id: da.acknowledging_officer_id,
        resolution_evidence_hash: null,
        version: 1,
      };
      stockLots.push(lot);
      da.rm_posted = true;
      da.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: lot.lot_id,
        action: 'postDonatedRmReceipt',
        actor_user_id: inspectorId,
        reason: `${rmRef} (${lot.accepted_quantity.value} accepted, ${lot.quarantined_rejected_quantity.value} rejected)`,
        timestamp: inspectedAt,
      });

      return recordLedgerAndPersist(
        'p16.post_da_rm',
        inspectorId,
        lot.lot_id,
        input.idempotency_key,
        input,
        201,
        'DA_RM_POSTED',
        `Posted ${rmRef} from ${da.da_reference}: ${lot.accepted_quantity.value} usable units carrying "${lot.restriction_mode}" provenance.`,
        lot
      );
    },

    registerUnrestrictedCommercialLot(input) {
      const poRef = input.po_reference.trim();
      const rmRef = input.rm_reference.trim();
      const variantId = input.variant_id.trim();
      const itemName = input.item_name.trim();
      if (!poRef || !rmRef || !variantId || !itemName) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'PO reference, RM reference, variant ID, and item name are required.');
      }
      if (!isValidUnitQuantity({ value: input.accepted_quantity_value.trim(), quantity_scale: input.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Accepted quantity violates item precision scale.');
      }
      const accMicro = toMicroUnits(input.accepted_quantity_value.trim());

      const lot: ProvenanceStockLot = {
        lot_id: nextId(),
        chapter_id: chapterId,
        source_kind: 'PO',
        source_reference: poRef,
        rm_reference: rmRef,
        variant_id: variantId,
        item_name: itemName,
        quantity_scale: input.quantity_scale,
        accepted_quantity: fromMicroUnits(accMicro, input.quantity_scale),
        quarantined_rejected_quantity: fromMicroUnits(0n, input.quantity_scale),
        allocated_quantity: fromMicroUnits(0n, input.quantity_scale),
        available_quantity: fromMicroUnits(accMicro, input.quantity_scale),
        restriction_version: 1,
        restriction_mode: 'unrestricted',
        permitted_event_code: null,
        permitted_unit_id: null,
        acknowledging_officer_id: null,
        resolution_evidence_hash: null,
        version: 1,
      };
      stockLots.push(lot);

      lastAction = {
        ok: true,
        http_status: 201,
        code: 'COMMERCIAL_LOT_REGISTERED',
        message: `Registered unrestricted PO lot ${rmRef} (${lot.accepted_quantity.value} saleable units for "${itemName}").`,
        data: structuredClone(lot),
      };
      persistSnapshot();
      return structuredClone(lastAction) as P16ActionResult<ProvenanceStockLot>;
    },

    allocateLotToDemand(input) {
      const replay = checkIdempotency<DonationAllocationRecord>('p16.allocate_lot', input.idempotency_key, input);
      if (replay) return replay;

      const actorId = input.actor_user_id.trim();
      const demandRef = input.demand_reference.trim();
      const allocatedAt = input.allocated_at.trim();
      if (!actorId || !demandRef || !UTC_INSTANT_PATTERN.test(allocatedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID, demand reference, and UTC timestamp are required.');
      }

      if (input.attempt_ordinary_override) {
        return fail(
          403,
          'ORDINARY_OVERRIDE_FORBIDDEN',
          'An ordinary allocation override cannot remove or bypass donor restrictions.'
        );
      }

      const lot = stockLots.find((l) => l.lot_id === input.lot_id);
      if (!lot) return fail(404, 'RESOURCE_NOT_FOUND', 'Provenance stock lot not found.');

      const compat = isDemandCompatibleWithRestriction(
        lot.restriction_mode,
        lot.permitted_event_code,
        lot.permitted_unit_id,
        input.demand_kind,
        input.event_code?.trim() || null,
        input.unit_id?.trim() || null
      );
      if (!compat.ok) {
        return fail(409, compat.code, compat.message);
      }

      if (!isValidUnitQuantity({ value: input.quantity_value.trim(), quantity_scale: lot.quantity_scale })) {
        return fail(422, 'INVALID_QUANTITY', 'Allocation quantity violates item precision scale.');
      }

      const reqMicro = toMicroUnits(input.quantity_value.trim());
      const availMicro = toMicroUnits(lot.available_quantity.value);
      if (reqMicro <= 0n || reqMicro > availMicro) {
        return fail(409, 'INSUFFICIENT_LOT_QUANTITY', `Requested quantity exceeds eligible lot availability (${lot.available_quantity.value}).`);
      }

      lot.allocated_quantity = fromMicroUnits(toMicroUnits(lot.allocated_quantity.value) + reqMicro, lot.quantity_scale);
      lot.available_quantity = fromMicroUnits(availMicro - reqMicro, lot.quantity_scale);
      lot.version += 1;

      const allocation: DonationAllocationRecord = {
        allocation_id: nextId(),
        lot_id: lot.lot_id,
        rm_reference: lot.rm_reference,
        variant_id: lot.variant_id,
        demand_kind: input.demand_kind,
        demand_reference: demandRef,
        event_code: input.event_code?.trim() || null,
        unit_id: input.unit_id?.trim() || null,
        quantity: fromMicroUnits(reqMicro, lot.quantity_scale),
        actor_user_id: actorId,
        allocated_at: allocatedAt,
      };
      allocations.push(allocation);

      history.push({
        event_id: nextUlid(),
        target_id: lot.lot_id,
        action: `allocateLotToDemand:${input.demand_kind}`,
        actor_user_id: actorId,
        reason: `${demandRef} (${allocation.quantity.value} units from ${lot.rm_reference})`,
        timestamp: allocatedAt,
      });

      return recordLedgerAndPersist(
        'p16.allocate_lot',
        actorId,
        allocation.allocation_id,
        input.idempotency_key,
        input,
        200,
        'LOT_ALLOCATED',
        `Allocated ${allocation.quantity.value} eligible unit(s) from ${lot.rm_reference} (${lot.source_kind}) to ${demandRef}.`,
        allocation
      );
    },

    resolveDonorRestrictionVersion(input) {
      const replay = checkIdempotency<ProvenanceStockLot>('p16.resolve_restriction', input.idempotency_key, input);
      if (replay) return replay;

      const approverId = input.approver_user_id.trim();
      const evHash = input.evidence_hash.trim().toLowerCase();
      const notes = input.resolution_notes.trim();
      const resolvedAt = input.resolved_at.trim();

      if (!approverId || !notes || !UTC_INSTANT_PATTERN.test(resolvedAt)) {
        return fail(422, 'INVALID_INPUT', 'Approver ID, resolution rationale, and UTC timestamp are required.');
      }
      if (!SHA256_PATTERN.test(evHash)) {
        return fail(422, 'INVALID_EVIDENCE_HASH', 'Supporting authorization evidence must carry a 64-char SHA-256 hex digest.');
      }

      const lot = stockLots.find((l) => l.lot_id === input.lot_id);
      if (!lot) return fail(404, 'RESOURCE_NOT_FOUND', 'Provenance stock lot not found.');
      if (lot.version !== input.expected_version) {
        return fail(409, 'STALE_VERSION', 'Stock lot version changed before restriction update.');
      }
      if (lot.acknowledging_officer_id && approverId === lot.acknowledging_officer_id) {
        return fail(
          403,
          'INDEPENDENCE_REQUIRED',
          'The officer who acknowledged the donation cannot self-authorize restriction resolution.'
        );
      }

      const nextEvent = input.permitted_event_code?.trim() || null;
      const nextUnit = input.permitted_unit_id?.trim() || null;

      // Verify existing active allocations remain compatible with next restriction
      const existingAllocs = allocations.filter((a) => a.lot_id === lot.lot_id);
      for (const existing of existingAllocs) {
        const check = isDemandCompatibleWithRestriction(
          input.next_mode,
          nextEvent,
          nextUnit,
          existing.demand_kind,
          existing.event_code,
          existing.unit_id
        );
        if (!check.ok) {
          return fail(
            409,
            'ACTIVE_RESERVATION_RESTRICTION_CONFLICT',
            `Cannot change lot restriction to "${input.next_mode}" while existing allocation ${existing.demand_reference} remains active.`
          );
        }
      }

      lot.restriction_mode = input.next_mode;
      lot.permitted_event_code = nextEvent;
      lot.permitted_unit_id = nextUnit;
      lot.restriction_version += 1;
      lot.resolution_evidence_hash = evHash;
      lot.version += 1;

      history.push({
        event_id: nextUlid(),
        target_id: lot.lot_id,
        action: 'resolveDonorRestrictionVersion',
        actor_user_id: approverId,
        reason: `v${lot.restriction_version}: ${input.next_mode} — ${notes}`,
        timestamp: resolvedAt,
      });

      return recordLedgerAndPersist(
        'p16.resolve_restriction',
        approverId,
        lot.lot_id,
        input.idempotency_key,
        input,
        200,
        'DONOR_RESTRICTION_UPDATED',
        `Updated ${lot.rm_reference} donor restriction to "${lot.restriction_mode}" (version v${lot.restriction_version}) with independent evidence.`,
        lot
      );
    },

    lookupDonationOperation(input) {
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
