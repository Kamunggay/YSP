import {
  computeDeterministicHash,
  computeInspectionMaterialHashV1,
  computeOpeningMaterialHashV1,
  normalizeSixDecimalQuantity,
  numericIdCompare,
} from './canonicalHash';
import type {
  CanonicalAttributionInput,
  CanonicalInspectionMaterialInput,
  CanonicalPolicyRefInput,
} from './canonicalHash';
import type { CoverageCell, UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';
import type {
  LineReference,
  MaterialReference,
  RecordReference,
  RecordState,
} from './p03RecordSlice';

export const P06_CONTEXT_STORAGE_KEY = 'ysp_p06_context';

export type OpeningConditionCode =
  | 'usable'
  | 'quarantine'
  | 'damaged'
  | 'rejected'
  | 'held';

export interface OpeningCounter {
  user_id: string;
  display_name?: string | undefined;
  is_regular_custodian: boolean;
}

export interface IpcCountLine {
  reference: LineReference;
  variant_sku?: string | undefined;
  item_name?: string | undefined;
  location_id: string;
  custody_assignment_id: string;
  condition_code: OpeningConditionCode;
  counted_quantity: UnitQuantity;
  unit_valuation: string;
  valuation_basis: string;
  restriction_version_id: string;
}

export interface InspectionLine {
  reference: LineReference;
  source_line: LineReference;
  expected_quantity: UnitQuantity;
  delivered_quantity: UnitQuantity;
  accepted_quantity: UnitQuantity;
  rejected_quantity: UnitQuantity;
  held_quantity: UnitQuantity;
  missing_quantity: UnitQuantity;
  nonusable_recorded_quantity: UnitQuantity;
  location_id: string;
  custody_assignment_id: string;
  condition_code: OpeningConditionCode;
  restriction_version_id: string;
  unit_valuation: string;
  valuation_basis: string;
  condition_notes: string;
}

export type OpeningEvidencePurpose =
  | 'ipc_signed_count_sheet'
  | 'rm_inspection'
  | 'rm_discrepancy';

export interface OpeningEvidenceObjectRef {
  chapter_id: string;
  evidence_object_id: string;
  content_hash: string;
  object_version: string;
}

export interface OpeningEvidencePin {
  binding_id: string;
  target: MaterialReference;
  line: LineReference | null;
  evidence: OpeningEvidenceObjectRef;
  purpose_code: OpeningEvidencePurpose;
}

export interface OpeningEvidenceBinding extends OpeningEvidencePin {
  ready: boolean;
}

export interface AcceptOpeningInput {
  context: {
    chapter_id: string;
    action_code: 'purchasing.accept_opening_rm';
    idempotency_key: string;
    record: {
      id: string;
      kind: 'RM';
    };
    expected_row_version: number;
    expected_material_version: number;
  };
  receipt: MaterialReference;
  source: {
    source_kind: 'opening';
    target: MaterialReference;
    expected_row_version: number;
  };
  evidence: OpeningEvidencePin[];
}

export interface StockEffect {
  receipt_line: LineReference;
  posting_id: string;
  lot_id: string;
  position_id: string;
  movement_id: string;
  lot_kind: 'accepted' | 'nonusable';
  condition_code: OpeningConditionCode;
  documented_quantity: UnitQuantity;
  accepted_quantity: UnitQuantity;
}

export interface AcceptedOpeningData {
  source: MaterialReference;
  source_state: RecordState;
  baseline_id: string;
  cutover: {
    id: string;
    kind: 'CUTOVER';
  };
  posting_ids: string[];
  stock_effects: StockEffect[];
  discrepancy_ids: string[];
  audit_event_id: string;
  follow_up_task_ids: string[];
}

export interface OpeningOperationIdentity {
  operation_id: string | null;
  action_code: 'purchasing.accept_opening_rm';
  idempotency_key: string;
}

export interface AcceptedOpeningResult {
  schema_version: '1.0';
  chapter_id: string;
  action_result: 'success';
  operation: {
    identity: OpeningOperationIdentity;
    outcome: 'committed';
    committed_at: string;
    replayed: boolean;
  };
  record: {
    reference: RecordReference;
    row_version: number;
    material_version: number;
    states: {
      inspection: 'complete';
      posting: 'posted';
      exception: 'none' | 'open' | 'resolved';
    };
  };
  field_feedback: Array<{ pointer: string; message: string }>;
  blocking_reason: null;
  permitted_next_actions: Array<{ code: string; label: string }>;
  input_policy: 'may_clear';
  lookup_state: null;
  data: AcceptedOpeningData;
}

export interface UnacceptedOpeningResult {
  schema_version: '1.0';
  chapter_id: string | null;
  action_result: 'blocked' | 'stale' | 'forbidden' | 'uncertain';
  operation: {
    identity: OpeningOperationIdentity;
    outcome: 'unknown' | 'rejected';
    committed_at: null;
    replayed: false;
  } | null;
  record: RecordState | null;
  field_feedback: Array<{ pointer: string; message: string }>;
  blocking_reason: {
    code: string;
    message: string;
  };
  permitted_next_actions: Array<{ code: string; label: string }>;
  input_policy: 'preserve';
  lookup_state: 'pending_or_not_visible' | 'unavailable' | null;
  data: null;
}

export interface OpeningOperationLedgerEntry {
  operation_id: string;
  chapter_id: string;
  action_code: 'purchasing.accept_opening_rm';
  idempotency_key: string;
  payload_fingerprint: string;
  result: AcceptedOpeningResult;
}

export interface P06StockProjectionSummary {
  usable_stockroom_on_hand: string;
  available_to_allocate: string;
  quarantined_rejected: string;
  total_physical_documented: string;
  open_discrepancy_units: string;
}

export interface P06ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  data?: T | undefined;
}

export interface P06EngineSnapshot {
  chapter_id: string;
  chapter_name: string;
  baseline_locked: boolean;
  baseline_id: string | null;
  cutover_id: string | null;
  counters: ReadonlyArray<OpeningCounter>;
  ipc_record_id: string | null;
  ipc_state: RecordState | null;
  ipc_target: MaterialReference | null;
  ipc_cutoff_at: string;
  ipc_counted_at: string;
  ipc_purpose: string;
  ipc_policy_version_id: string;
  ipc_head_approved: boolean;
  ipc_finance_approved: boolean;
  ipc_lines: ReadonlyArray<IpcCountLine>;
  rm_record_id: string | null;
  rm_state: RecordState | null;
  rm_target: MaterialReference | null;
  rm_inspection_at: string;
  rm_lines: ReadonlyArray<InspectionLine>;
  evidence_bindings: ReadonlyArray<OpeningEvidenceBinding>;
  stock_effects: ReadonlyArray<StockEffect>;
  discrepancy_ids: ReadonlyArray<string>;
  coverage_cells: ReadonlyArray<CoverageCell>;
  stock_projection: P06StockProjectionSummary;
  accepted_result: AcceptedOpeningResult | null;
  operation_ledger: ReadonlyArray<OpeningOperationLedgerEntry>;
  last_action: P06ActionResult | null;
}

export interface P06EngineOptions {
  chapter_id?: string | undefined;
  chapter_name?: string | undefined;
  baseline_locked?: boolean | undefined;
  baseline_id?: string | null | undefined;
  cutover_id?: string | null | undefined;
  counters?: ReadonlyArray<OpeningCounter> | undefined;
  ipc_record_id?: string | null | undefined;
  ipc_state?: RecordState | null | undefined;
  ipc_target?: MaterialReference | null | undefined;
  ipc_cutoff_at?: string | undefined;
  ipc_counted_at?: string | undefined;
  ipc_purpose?: string | undefined;
  ipc_policy_version_id?: string | undefined;
  ipc_head_approved?: boolean | undefined;
  ipc_finance_approved?: boolean | undefined;
  ipc_lines?: ReadonlyArray<IpcCountLine> | undefined;
  rm_record_id?: string | null | undefined;
  rm_state?: RecordState | null | undefined;
  rm_target?: MaterialReference | null | undefined;
  rm_inspection_at?: string | undefined;
  rm_lines?: ReadonlyArray<InspectionLine> | undefined;
  evidence_bindings?: ReadonlyArray<OpeningEvidenceBinding> | undefined;
  inspector?: CanonicalAttributionInput | undefined;
  policy?: CanonicalPolicyRefInput | undefined;
  next_seq?: number | undefined;
}

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function normalizeEvidencePinForFingerprint(pin: OpeningEvidencePin): OpeningEvidencePin {
  return {
    binding_id: pin.binding_id,
    target: {
      chapter_id: pin.target.chapter_id,
      record: { id: pin.target.record.id, kind: pin.target.record.kind },
      material_version: pin.target.material_version,
      material_hash: pin.target.material_hash,
    },
    line: pin.line
      ? {
          chapter_id: pin.line.chapter_id,
          record: { id: pin.line.record.id, kind: pin.line.record.kind },
          line_id: pin.line.line_id,
          line_kind: pin.line.line_kind,
          variant_id: pin.line.variant_id,
        }
      : null,
    evidence: {
      chapter_id: pin.evidence.chapter_id,
      evidence_object_id: pin.evidence.evidence_object_id,
      content_hash: pin.evidence.content_hash,
      object_version: pin.evidence.object_version,
    },
    purpose_code: pin.purpose_code,
  };
}

/**
 * Computes RFC 8785 JCS SHA-256 fingerprint matching contracts/ipc-rm-acceptance/v1/fingerprint-vector.json.
 */
export function computeAcceptOpeningFingerprint(input: AcceptOpeningInput): string {
  const seenBindingIds = new Set<string>();
  const sortedEvidence = [...input.evidence]
    .sort((a, b) => numericIdCompare(a.binding_id, b.binding_id))
    .map((pin) => {
      if (seenBindingIds.has(pin.binding_id)) {
        throw new Error(`DUPLICATE_BINDING_ID: Duplicate evidence binding "${pin.binding_id}".`);
      }
      seenBindingIds.add(pin.binding_id);
      return normalizeEvidencePinForFingerprint(pin);
    });

  return computeDeterministicHash({
    chapter_id: input.context.chapter_id,
    action_code: input.context.action_code,
    input_schema: 'urn:ysp:ipc-rm-acceptance:v1#/$defs/AcceptOpeningInput',
    input: {
      context: {
        record: {
          id: input.context.record.id,
          kind: input.context.record.kind,
        },
        expected_row_version: input.context.expected_row_version,
        expected_material_version: input.context.expected_material_version,
      },
      receipt: {
        chapter_id: input.receipt.chapter_id,
        record: {
          id: input.receipt.record.id,
          kind: input.receipt.record.kind,
        },
        material_version: input.receipt.material_version,
        material_hash: input.receipt.material_hash,
      },
      source: {
        source_kind: input.source.source_kind,
        target: {
          chapter_id: input.source.target.chapter_id,
          record: {
            id: input.source.target.record.id,
            kind: input.source.target.record.kind,
          },
          material_version: input.source.target.material_version,
          material_hash: input.source.target.material_hash,
        },
        expected_row_version: input.source.expected_row_version,
      },
      evidence: sortedEvidence,
    },
  });
}

function readStoredP06Options(): P06EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P06_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P06EngineOptions;
  } catch {
    return undefined;
  }
}

export interface P06OpeningEngine {
  getSnapshot: () => P06EngineSnapshot;
  addCounter: (input: OpeningCounter) => P06ActionResult<OpeningCounter>;
  addIpcLine: (input: {
    line_id?: string | undefined;
    variant_id: string;
    variant_sku?: string | undefined;
    item_name?: string | undefined;
    location_id: string;
    custody_assignment_id: string;
    condition_code: OpeningConditionCode;
    counted_quantity_value: string;
    quantity_scale: number;
    unit_valuation: string;
    valuation_basis: string;
    restriction_version_id: string;
  }) => P06ActionResult<IpcCountLine>;
  publishAndApproveIpc: (input: {
    ipc_record_id?: string | undefined;
    cutoff_at: string;
    counted_at: string;
    purpose: string;
    policy_version_id: string;
    head_approved: boolean;
    finance_approved: boolean;
    signed_sheet_hash: string;
    binding_id?: string | undefined;
    evidence_object_id?: string | undefined;
  }) => P06ActionResult<MaterialReference>;
  saveInspectionLine: (input: {
    rm_line_id?: string | undefined;
    source_line_id: string;
    delivered_value: string;
    accepted_value: string;
    rejected_value: string;
    held_value: string;
    missing_value: string;
    nonusable_recorded_value: string;
    condition_code: OpeningConditionCode;
    location_id?: string | undefined;
    custody_assignment_id?: string | undefined;
    condition_notes: string;
  }) => P06ActionResult<InspectionLine>;
  publishInspectionReceipt: (input: {
    rm_record_id?: string | undefined;
    inspection_at: string;
    inspection_evidence_hash: string;
    discrepancy_evidence_hash?: string | undefined;
    inspection_binding_id?: string | undefined;
    discrepancy_binding_id?: string | undefined;
  }) => P06ActionResult<MaterialReference>;
  acceptOpeningRm: (
    input: AcceptOpeningInput
  ) => P06ActionResult<AcceptedOpeningResult | UnacceptedOpeningResult>;
  lookupOpeningOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: 'purchasing.accept_opening_rm' | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P06ActionResult<AcceptedOpeningResult | UnacceptedOpeningResult>;
}

export function createP06OpeningEngine(options?: P06EngineOptions): P06OpeningEngine {
  const seed = options ?? readStoredP06Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterName = seed.chapter_name ?? 'Active Chapter';
  let seq = seed.next_seq ?? 6000;

  let baselineLocked = seed.baseline_locked ?? false;
  let baselineId: string | null = seed.baseline_id ?? null;
  let cutoverId: string | null = seed.cutover_id ?? null;

  const counters: OpeningCounter[] = (seed.counters ?? []).map((c) => ({ ...c }));
  let ipcRecordId: string | null = seed.ipc_record_id ?? null;
  let ipcState: RecordState | null = seed.ipc_state ? structuredClone(seed.ipc_state) : null;
  let ipcTarget: MaterialReference | null = seed.ipc_target
    ? structuredClone(seed.ipc_target)
    : null;
  let ipcCutoffAt = seed.ipc_cutoff_at ?? '';
  let ipcCountedAt = seed.ipc_counted_at ?? '';
  let ipcPurpose = seed.ipc_purpose ?? '';
  let ipcPolicyVersionId = seed.ipc_policy_version_id ?? '';
  let ipcHeadApproved = seed.ipc_head_approved ?? false;
  let ipcFinanceApproved = seed.ipc_finance_approved ?? false;
  const ipcLines: IpcCountLine[] = (seed.ipc_lines ?? []).map((l) => structuredClone(l));

  let rmRecordId: string | null = seed.rm_record_id ?? null;
  let rmState: RecordState | null = seed.rm_state ? structuredClone(seed.rm_state) : null;
  let rmTarget: MaterialReference | null = seed.rm_target
    ? structuredClone(seed.rm_target)
    : null;
  let rmInspectionAt = seed.rm_inspection_at ?? '';
  const rmLines: InspectionLine[] = (seed.rm_lines ?? []).map((l) => structuredClone(l));

  const evidenceBindings: OpeningEvidenceBinding[] = (seed.evidence_bindings ?? []).map((b) =>
    structuredClone(b)
  );
  const stockEffects: StockEffect[] = [];
  const discrepancyIds: string[] = [];
  const coverageCells: CoverageCell[] = [];
  let acceptedResult: AcceptedOpeningResult | null = null;
  const operationLedger: OpeningOperationLedgerEntry[] = [];
  let lastAction: P06ActionResult | null = null;

  const inspectorAttr: CanonicalAttributionInput = seed.inspector ?? {
    chapter_id: chapterId,
    user_id: '11',
    membership_id: '111',
    duty_grant_id: '112',
    duty_code: 'RECEIVING',
    actor_name: 'Receiving Inspector',
    chapter_name: chapterName,
    captured_at: '2026-11-21T06:00:00.000000Z',
  };

  const chapterPolicy: CanonicalPolicyRefInput = seed.policy ?? {
    chapter_id: chapterId,
    policy_id: '41',
    policy_version_id: ipcPolicyVersionId || '42',
    version_no: 1,
    settings_hash: 'a'.repeat(64),
    approval: {
      chapter_id: chapterId,
      record: { id: '43', kind: 'CONFIG' },
      material_version: 1,
      material_hash: 'b'.repeat(64),
    },
    effective_from: '2026-10-23T00:00:00.000000Z',
    effective_until: null,
  };

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P06${String(seq).padStart(19, '0')}`;
  }

  function recordOutcome<T>(res: P06ActionResult<T>): P06ActionResult<T> {
    lastAction = res;
    return res;
  }

  function computeProjectionSummary(): P06StockProjectionSummary {
    const usableMicro = coverageCells
      .filter(
        (c) =>
          c.dimension.custody_kind === 'stockroom' &&
          c.dimension.condition_code === 'usable' &&
          c.dimension.lot_kind === 'accepted'
      )
      .reduce((acc, c) => acc + toMicroUnits(c.quantity.value), 0n);

    const quarantinedMicro = coverageCells
      .filter(
        (c) =>
          c.dimension.condition_code !== 'usable' || c.dimension.lot_kind === 'nonusable'
      )
      .reduce((acc, c) => acc + toMicroUnits(c.quantity.value), 0n);

    const openDiscMicro = rmLines.reduce(
      (acc, l) =>
        acc +
        toMicroUnits(l.rejected_quantity.value) +
        toMicroUnits(l.held_quantity.value) +
        toMicroUnits(l.missing_quantity.value),
      0n
    );

    const formatTrim = (micro: bigint): string => {
      const whole = micro / 1000000n;
      const rem = micro % 1000000n;
      if (rem === 0n) return whole.toString();
      return `${whole.toString()}.${rem.toString().padStart(6, '0').replace(/0+$/, '')}`;
    };

    return {
      usable_stockroom_on_hand: formatTrim(usableMicro),
      available_to_allocate: formatTrim(usableMicro),
      quarantined_rejected: formatTrim(quarantinedMicro),
      total_physical_documented: formatTrim(usableMicro + quarantinedMicro),
      open_discrepancy_units: formatTrim(openDiscMicro),
    };
  }

  function addCounter(input: OpeningCounter): P06ActionResult<OpeningCounter> {
    const userId = input.user_id.trim();
    if (!userId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'COUNTER_ID_REQUIRED',
        message: 'Counter user ID is required.',
      });
    }
    if (counters.some((c) => c.user_id === userId)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_COUNTER',
        message: `Counter identity ${userId} is already assigned to this count.`,
      });
    }
    const created: OpeningCounter = {
      user_id: userId,
      display_name: input.display_name?.trim() || undefined,
      is_regular_custodian: input.is_regular_custodian,
    };
    counters.push(created);
    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'COUNTER_ADDED',
      message: `Added ${
        created.is_regular_custodian ? 'custodian' : 'independent'
      } counter (${created.display_name ?? userId}).`,
      data: { ...created },
    });
  }

  function addIpcLine(input: {
    line_id?: string | undefined;
    variant_id: string;
    variant_sku?: string | undefined;
    item_name?: string | undefined;
    location_id: string;
    custody_assignment_id: string;
    condition_code: OpeningConditionCode;
    counted_quantity_value: string;
    quantity_scale: number;
    unit_valuation: string;
    valuation_basis: string;
    restriction_version_id: string;
  }): P06ActionResult<IpcCountLine> {
    if (baselineLocked) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OPENING_BASELINE_LOCKED',
        message: 'Opening baseline is locked. Further count discoveries must use approved adjustments.',
      });
    }
    const variantId = input.variant_id.trim();
    const locationId = input.location_id.trim();
    const custodyAssignmentId = input.custody_assignment_id.trim();
    const valuationBasis = input.valuation_basis.trim();
    const restrictionVersionId = input.restriction_version_id.trim();
    if (!variantId || !locationId || !custodyAssignmentId || !valuationBasis || !restrictionVersionId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'IPC_LINE_FIELDS_REQUIRED',
        message: 'Item variant, location, custody assignment, valuation basis, and restriction are required.',
      });
    }
    const qty: UnitQuantity = {
      value: input.counted_quantity_value.trim(),
      quantity_scale: input.quantity_scale,
    };
    if (!isValidUnitQuantity(qty) || toMicroUnits(qty.value) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: 'Counted quantity must be positive and match the approved unit decimal scale.',
      });
    }
    const unitVal = input.unit_valuation.trim();
    let valMicro: bigint;
    try {
      valMicro = toMicroUnits(unitVal);
    } catch {
      valMicro = -1n;
    }
    if (valMicro < 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_VALUATION',
        message: 'Unit valuation must be a valid non-negative decimal amount.',
      });
    }

    const activeIpcId = ipcRecordId ?? nextId();
    ipcRecordId = activeIpcId;
    const lineId = input.line_id?.trim() || nextId();
    if (ipcLines.some((l) => l.reference.line_id === lineId)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_LINE_ID',
        message: `Count line #${lineId} already exists.`,
      });
    }

    const line: IpcCountLine = {
      reference: {
        chapter_id: chapterId,
        record: { id: activeIpcId, kind: 'IPC' },
        line_id: lineId,
        line_kind: 'IPC',
        variant_id: variantId,
      },
      variant_sku: input.variant_sku?.trim() || undefined,
      item_name: input.item_name?.trim() || undefined,
      location_id: locationId,
      custody_assignment_id: custodyAssignmentId,
      condition_code: input.condition_code,
      counted_quantity: {
        value: normalizeSixDecimalQuantity(qty.value),
        quantity_scale: qty.quantity_scale,
      },
      unit_valuation: normalizeSixDecimalQuantity(unitVal),
      valuation_basis: valuationBasis,
      restriction_version_id: restrictionVersionId,
    };
    ipcLines.push(line);

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'IPC_LINE_ADDED',
      message: `Added count line #${lineId} (${line.counted_quantity.value} ${line.condition_code}). No stock posted until opening acceptance.`,
      data: structuredClone(line),
    });
  }

  function hasIndependentCounterPair(): boolean {
    return counters.length >= 2 && counters.some((c) => !c.is_regular_custodian);
  }

  function publishAndApproveIpc(input: {
    ipc_record_id?: string | undefined;
    cutoff_at: string;
    counted_at: string;
    purpose: string;
    policy_version_id: string;
    head_approved: boolean;
    finance_approved: boolean;
    signed_sheet_hash: string;
    binding_id?: string | undefined;
    evidence_object_id?: string | undefined;
  }): P06ActionResult<MaterialReference> {
    if (baselineLocked) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OPENING_BASELINE_LOCKED',
        message: 'Opening baseline is already committed and locked.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.cutoff_at.trim()) || !UTC_INSTANT_PATTERN.test(input.counted_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Cutoff and counted timestamps must be Z-suffixed UTC instants.',
      });
    }
    if (!hasIndependentCounterPair()) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'COUNTER_INDEPENDENCE_REQUIRED',
        message:
          'At least two distinct counters with one independent of regular custody are required before publishing count sheet.',
      });
    }
    if (ipcLines.length === 0) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'IPC_LINES_REQUIRED',
        message: 'Add at least one physical count line before publishing.',
      });
    }
    if (!input.head_approved || !input.finance_approved) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'IPC_APPROVALS_INCOMPLETE',
        message: 'Both Chapter Head and Finance Officer approvals are required before locking count source.',
      });
    }
    const sheetHash = input.signed_sheet_hash.trim();
    if (!SHA256_HEX_PATTERN.test(sheetHash)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'EVIDENCE_NOT_READY',
        message: 'Valid 64-character SHA-256 signed count sheet digest is required.',
      });
    }

    const targetIpcId = input.ipc_record_id?.trim() || ipcRecordId || nextId();
    ipcRecordId = targetIpcId;
    for (const line of ipcLines) {
      line.reference.record = { id: targetIpcId, kind: 'IPC' };
    }

    ipcCutoffAt = input.cutoff_at.trim();
    ipcCountedAt = input.counted_at.trim();
    ipcPurpose = input.purpose.trim() || 'Opening physical inventory count';
    ipcPolicyVersionId = input.policy_version_id.trim() || '42';
    ipcHeadApproved = true;
    ipcFinanceApproved = true;

    const materialHash = computeOpeningMaterialHashV1({
      chapter_id: chapterId,
      record: { id: targetIpcId, kind: 'IPC' },
      cutoff_at: ipcCutoffAt,
      counted_at: ipcCountedAt,
      purpose: ipcPurpose,
      policy_version_id: ipcPolicyVersionId,
      counters: counters.map((c) => ({
        user_id: c.user_id,
        is_regular_custodian: c.is_regular_custodian,
      })),
      lines: ipcLines.map((l) => ({
        reference: l.reference,
        location_id: l.location_id,
        custody_assignment_id: l.custody_assignment_id,
        condition_code: l.condition_code,
        counted_quantity: l.counted_quantity,
        unit_valuation: l.unit_valuation,
        valuation_basis: l.valuation_basis,
        restriction_version_id: l.restriction_version_id,
      })),
    });

    const nextRowVer = ipcState ? ipcState.row_version + 1 : 8;
    const nextMatVer = ipcTarget ? ipcTarget.material_version + 1 : 1;
    ipcState = {
      reference: { id: targetIpcId, kind: 'IPC' },
      row_version: nextRowVer,
      material_version: nextMatVer,
      states: {
        approval: 'approved',
        progress: 'not_started',
        exception: 'none',
      },
    };
    ipcTarget = {
      chapter_id: chapterId,
      record: { id: targetIpcId, kind: 'IPC' },
      material_version: nextMatVer,
      material_hash: materialHash,
    };

    const existingBindingIdx = evidenceBindings.findIndex(
      (b) => b.purpose_code === 'ipc_signed_count_sheet'
    );
    const pin: OpeningEvidenceBinding = {
      binding_id: input.binding_id?.trim() || '401',
      target: structuredClone(ipcTarget),
      line: null,
      evidence: {
        chapter_id: chapterId,
        evidence_object_id: input.evidence_object_id?.trim() || '301',
        content_hash: sheetHash,
        object_version: 'djE=',
      },
      purpose_code: 'ipc_signed_count_sheet',
      ready: true,
    };
    if (existingBindingIdx >= 0) {
      evidenceBindings[existingBindingIdx] = pin;
    } else {
      evidenceBindings.push(pin);
    }

    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'IPC_PUBLISHED',
      message: `Published & approved opening count #${targetIpcId} (${ipcLines.length} line(s)). Proceed to receiving inspection — no stock posted yet.`,
      data: structuredClone(ipcTarget),
    });
  }

  function saveInspectionLine(input: {
    rm_line_id?: string | undefined;
    source_line_id: string;
    delivered_value: string;
    accepted_value: string;
    rejected_value: string;
    held_value: string;
    missing_value: string;
    nonusable_recorded_value: string;
    condition_code: OpeningConditionCode;
    location_id?: string | undefined;
    custody_assignment_id?: string | undefined;
    condition_notes: string;
  }): P06ActionResult<InspectionLine> {
    if (baselineLocked) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OPENING_BASELINE_LOCKED',
        message: 'Opening baseline is already locked.',
      });
    }
    const sourceLine = ipcLines.find((l) => l.reference.line_id === input.source_line_id.trim());
    if (!sourceLine) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'SOURCE_LINE_NOT_FOUND',
        message: 'Matching count source line not found.',
      });
    }
    const notes = input.condition_notes.trim();
    if (!notes) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'CONDITION_NOTES_REQUIRED',
        message: 'Condition inspection notes are required.',
      });
    }

    const scale = sourceLine.counted_quantity.quantity_scale;
    const rawValues = {
      delivered: input.delivered_value.trim(),
      accepted: input.accepted_value.trim(),
      rejected: input.rejected_value.trim(),
      held: input.held_value.trim(),
      missing: input.missing_value.trim(),
      nonusable: input.nonusable_recorded_value.trim(),
    };

    for (const [label, val] of Object.entries(rawValues)) {
      if (!isValidUnitQuantity({ value: val, quantity_scale: scale })) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_PRECISION',
          message: `Inspection ${label} quantity "${val}" must match unit decimal scale ${scale}.`,
        });
      }
    }

    const expectedMicro = toMicroUnits(sourceLine.counted_quantity.value);
    const deliveredMicro = toMicroUnits(rawValues.delivered);
    const acceptedMicro = toMicroUnits(rawValues.accepted);
    const rejectedMicro = toMicroUnits(rawValues.rejected);
    const heldMicro = toMicroUnits(rawValues.held);
    const missingMicro = toMicroUnits(rawValues.missing);
    const nonusableMicro = toMicroUnits(rawValues.nonusable);

    if (deliveredMicro + missingMicro !== expectedMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'QUANTITY_MISMATCH_EXPECTED',
        message: `Delivered + missing must equal expected count quantity (${sourceLine.counted_quantity.value}).`,
      });
    }
    if (deliveredMicro !== acceptedMicro + rejectedMicro + heldMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'QUANTITY_MISMATCH_DELIVERED',
        message: 'Delivered quantity must equal accepted + rejected + held quantities.',
      });
    }
    if (nonusableMicro > rejectedMicro + heldMicro) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'NONUSABLE_EXCEEDS_REJECTED_HELD',
        message: 'Recorded nonusable quantity cannot exceed rejected + held quantity.',
      });
    }
    if (input.condition_code !== 'usable' && acceptedMicro > 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'NONUSABLE_CANNOT_ACCEPT_AS_USABLE',
        message: 'Non-usable or damaged items cannot have accepted usable stock quantity greater than zero.',
      });
    }

    const activeRmId = rmRecordId ?? nextId();
    rmRecordId = activeRmId;
    const existingIdx = rmLines.findIndex(
      (l) => l.source_line.line_id === sourceLine.reference.line_id
    );
    const rmLineId =
      input.rm_line_id?.trim() ||
      (existingIdx >= 0 ? rmLines[existingIdx]!.reference.line_id : nextId());

    const formatSix = (micro: bigint): UnitQuantity => ({
      value: normalizeSixDecimalQuantity(fromMicroUnits(micro, scale).value),
      quantity_scale: scale,
    });

    const line: InspectionLine = {
      reference: {
        chapter_id: chapterId,
        record: { id: activeRmId, kind: 'RM' },
        line_id: rmLineId,
        line_kind: 'RM',
        variant_id: sourceLine.reference.variant_id,
      },
      source_line: structuredClone(sourceLine.reference),
      expected_quantity: formatSix(expectedMicro),
      delivered_quantity: formatSix(deliveredMicro),
      accepted_quantity: formatSix(acceptedMicro),
      rejected_quantity: formatSix(rejectedMicro),
      held_quantity: formatSix(heldMicro),
      missing_quantity: formatSix(missingMicro),
      nonusable_recorded_quantity: formatSix(nonusableMicro),
      location_id: input.location_id?.trim() || sourceLine.location_id,
      custody_assignment_id: input.custody_assignment_id?.trim() || sourceLine.custody_assignment_id,
      condition_code: input.condition_code,
      restriction_version_id: sourceLine.restriction_version_id,
      unit_valuation: sourceLine.unit_valuation,
      valuation_basis: sourceLine.valuation_basis,
      condition_notes: notes,
    };

    if (existingIdx >= 0) {
      rmLines[existingIdx] = line;
    } else {
      rmLines.push(line);
    }

    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'RM_INSPECTION_LINE_SAVED',
      message: `Saved inspection split for count line #${sourceLine.reference.line_id} (accepted ${line.accepted_quantity.value}, nonusable ${line.nonusable_recorded_quantity.value}).`,
      data: structuredClone(line),
    });
  }

  function hasAnyDiscrepancy(): boolean {
    return rmLines.some(
      (l) =>
        l.condition_code !== 'usable' ||
        toMicroUnits(l.rejected_quantity.value) > 0n ||
        toMicroUnits(l.held_quantity.value) > 0n ||
        toMicroUnits(l.missing_quantity.value) > 0n ||
        toMicroUnits(l.nonusable_recorded_quantity.value) > 0n
    );
  }

  function publishInspectionReceipt(input: {
    rm_record_id?: string | undefined;
    inspection_at: string;
    inspection_evidence_hash: string;
    discrepancy_evidence_hash?: string | undefined;
    inspection_binding_id?: string | undefined;
    discrepancy_binding_id?: string | undefined;
  }): P06ActionResult<MaterialReference> {
    if (baselineLocked) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'OPENING_BASELINE_LOCKED',
        message: 'Opening baseline is already locked.',
      });
    }
    if (!ipcTarget || !ipcState || ipcState.states.approval !== 'approved') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'IPC_NOT_APPROVED',
        message: 'Publish and approve the opening physical count before publishing receiving inspection.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.inspection_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Inspection timestamp must be a Z-suffixed UTC instant.',
      });
    }
    for (const srcLine of ipcLines) {
      const inspected = rmLines.find(
        (r) =>
          r.source_line.line_id === srcLine.reference.line_id &&
          r.reference.variant_id === srcLine.reference.variant_id
      );
      if (!inspected) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'INSPECTION_INCOMPLETE',
          message: `Inspect count line #${srcLine.reference.line_id} before publishing receiving inspection.`,
        });
      }
    }

    const inspectHash = input.inspection_evidence_hash.trim();
    if (!SHA256_HEX_PATTERN.test(inspectHash)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'EVIDENCE_NOT_READY',
        message: 'Valid 64-character SHA-256 receiving inspection evidence digest is required.',
      });
    }

    const discrepancyPresent = hasAnyDiscrepancy();
    const discHash = input.discrepancy_evidence_hash?.trim() ?? '';
    if (discrepancyPresent && !SHA256_HEX_PATTERN.test(discHash)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DISCREPANCY_EVIDENCE_REQUIRED',
        message:
          'Rejected, held, missing, or damaged units require a valid 64-character SHA-256 discrepancy evidence digest.',
      });
    }

    const targetRmId = input.rm_record_id?.trim() || rmRecordId || nextId();
    rmRecordId = targetRmId;
    for (const l of rmLines) {
      l.reference.record = { id: targetRmId, kind: 'RM' };
    }
    rmInspectionAt = input.inspection_at.trim();

    const materialPayload: CanonicalInspectionMaterialInput = {
      chapter_id: chapterId,
      record: { id: targetRmId, kind: 'RM' },
      source: structuredClone(ipcTarget),
      inspection_at: rmInspectionAt,
      inspector: inspectorAttr,
      representatives: [],
      policy: {
        ...chapterPolicy,
        policy_version_id: ipcPolicyVersionId || chapterPolicy.policy_version_id,
      },
      lines: rmLines,
    };

    const rmHash = computeInspectionMaterialHashV1(materialPayload);
    const nextRowVer = rmState ? rmState.row_version + 1 : 4;
    const nextMatVer = rmTarget ? rmTarget.material_version + 1 : 1;

    rmState = {
      reference: { id: targetRmId, kind: 'RM' },
      row_version: nextRowVer,
      material_version: nextMatVer,
      states: {
        approval: 'submitted',
        progress: 'not_started',
        exception: discrepancyPresent ? 'open' : 'none',
      },
    };
    rmTarget = {
      chapter_id: chapterId,
      record: { id: targetRmId, kind: 'RM' },
      material_version: nextMatVer,
      material_hash: rmHash,
    };

    const upsertBinding = (binding: OpeningEvidenceBinding) => {
      const idx = evidenceBindings.findIndex((b) => b.purpose_code === binding.purpose_code);
      if (idx >= 0) evidenceBindings[idx] = binding;
      else evidenceBindings.push(binding);
    };

    upsertBinding({
      binding_id: input.inspection_binding_id?.trim() || '402',
      target: structuredClone(rmTarget),
      line: null,
      evidence: {
        chapter_id: chapterId,
        evidence_object_id: '302',
        content_hash: inspectHash,
        object_version: 'djE=',
      },
      purpose_code: 'rm_inspection',
      ready: true,
    });

    if (discrepancyPresent) {
      upsertBinding({
        binding_id: input.discrepancy_binding_id?.trim() || '403',
        target: structuredClone(rmTarget),
        line: null,
        evidence: {
          chapter_id: chapterId,
          evidence_object_id: '303',
          content_hash: discHash,
          object_version: 'djE=',
        },
        purpose_code: 'rm_discrepancy',
        ready: true,
      });
    }

    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'RM_INSPECTION_PUBLISHED',
      message: `Published receiving inspection #${targetRmId} (${rmLines.length} line(s)). Proceed to Opening Baseline Acceptance — no stock posted yet.`,
      data: structuredClone(rmTarget),
    });
  }

  function makeUnaccepted(params: {
    http_status: number;
    code: string;
    message: string;
    action_result: 'blocked' | 'stale' | 'forbidden' | 'uncertain';
    actionCode?: 'purchasing.accept_opening_rm';
    idempotencyKey?: string;
    operationId?: string | null;
    lookupState?: 'pending_or_not_visible' | 'unavailable' | null;
    recordState?: RecordState | null;
    redacted?: boolean;
  }): P06ActionResult<UnacceptedOpeningResult> {
    const payload: UnacceptedOpeningResult = {
      schema_version: '1.0',
      chapter_id: params.redacted ? null : chapterId,
      action_result: params.action_result,
      operation: params.redacted
        ? null
        : {
            identity: {
              operation_id: params.operationId ?? null,
              action_code: params.actionCode ?? 'purchasing.accept_opening_rm',
              idempotency_key: params.idempotencyKey ?? '',
            },
            outcome: params.action_result === 'uncertain' ? 'unknown' : 'rejected',
            committed_at: null,
            replayed: false,
          },
      record: params.redacted ? null : (params.recordState ?? rmState),
      field_feedback: [],
      blocking_reason: {
        code: params.code,
        message: params.message,
      },
      permitted_next_actions:
        params.action_result === 'uncertain'
          ? [{ code: 'lookup_operation', label: 'Look up opening acceptance outcome before retrying' }]
          : [{ code: 'review_inputs', label: 'Review versions, source approvals, and evidence bindings' }],
      input_policy: 'preserve',
      lookup_state: params.lookupState ?? null,
      data: null,
    };

    return recordOutcome({
      ok: false,
      http_status: params.http_status,
      code: params.code,
      message: params.message,
      data: payload,
    });
  }

  function acceptOpeningRm(
    input: AcceptOpeningInput
  ): P06ActionResult<AcceptedOpeningResult | UnacceptedOpeningResult> {
    if (input.context.chapter_id !== chapterId) {
      return makeUnaccepted({
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested opening acceptance is outside authorized chapter scope.',
        action_result: 'forbidden',
        redacted: true,
      });
    }
    if (!input.context.idempotency_key.trim()) {
      return makeUnaccepted({
        http_status: 422,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key is required for opening baseline acceptance.',
        action_result: 'blocked',
      });
    }
    if (
      input.source.source_kind !== 'opening' ||
      input.receipt.record.kind !== 'RM' ||
      input.source.target.record.kind !== 'IPC' ||
      input.receipt.record.id === input.source.target.record.id ||
      input.context.record.id !== input.receipt.record.id
    ) {
      return makeUnaccepted({
        http_status: 422,
        code: 'INVALID_SOURCE_STRUCTURE',
        message: 'Receipt must target RM and source must target a distinct opening IPC record.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }
    if (input.evidence.length < 2) {
      return makeUnaccepted({
        http_status: 422,
        code: 'EVIDENCE_PINS_REQUIRED',
        message: 'At least signed count sheet and receiving inspection evidence pins are required.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    let fingerprint: string;
    try {
      fingerprint = computeAcceptOpeningFingerprint(input);
    } catch {
      return makeUnaccepted({
        http_status: 422,
        code: 'DUPLICATE_EVIDENCE_PIN',
        message: 'Evidence pins must use unique binding IDs.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    // Check idempotency ledger BEFORE checking baseline lock or stale versions
    const existingOp = operationLedger.find(
      (entry) =>
        entry.chapter_id === chapterId &&
        entry.action_code === 'purchasing.accept_opening_rm' &&
        entry.idempotency_key === input.context.idempotency_key
    );
    if (existingOp) {
      if (existingOp.payload_fingerprint === fingerprint) {
        const replayed: AcceptedOpeningResult = {
          ...existingOp.result,
          operation: {
            ...existingOp.result.operation,
            replayed: true,
          },
        };
        return recordOutcome({
          ok: true,
          http_status: 200,
          code: 'OPENING_BASELINE_REPLAYED',
          message: `Idempotent replay returned existing committed baseline #${replayed.data.baseline_id}.`,
          data: replayed,
        });
      }
      return makeUnaccepted({
        http_status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key was already committed with a different payload fingerprint.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    if (baselineLocked) {
      return makeUnaccepted({
        http_status: 409,
        code: 'DUPLICATE_OPENING_BASELINE',
        message:
          'Chapter opening baseline is already locked. Subsequent quantity corrections must use approved adjustments.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    if (
      !ipcState ||
      !ipcTarget ||
      !rmState ||
      !rmTarget ||
      ipcState.states.approval !== 'approved' ||
      !ipcHeadApproved ||
      !ipcFinanceApproved ||
      !hasIndependentCounterPair()
    ) {
      return makeUnaccepted({
        http_status: 409,
        code: 'INVALID_OPENING_SOURCE',
        message:
          'Opening acceptance requires independent counters, Head/Finance approvals, and published RM inspection.',
        action_result: 'blocked',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    if (
      input.context.record.id !== rmState.reference.id ||
      input.source.target.record.id !== ipcState.reference.id
    ) {
      return makeUnaccepted({
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Referenced count or receipt does not match visible chapter records.',
        action_result: 'forbidden',
        redacted: true,
      });
    }

    // Validate line-level parent & variant linkage across RM and IPC lines
    for (const line of rmLines) {
      const srcLine = ipcLines.find(
        (s) =>
          s.reference.line_id === line.source_line.line_id &&
          s.reference.record.id === ipcState!.reference.id &&
          s.reference.variant_id === line.reference.variant_id
      );
      if (!srcLine) {
        return makeUnaccepted({
          http_status: 409,
          code: 'SOURCE_LINE_MISMATCH',
          message: `Receipt line #${line.reference.line_id} does not match an approved source count line and item variant.`,
          action_result: 'blocked',
          idempotencyKey: input.context.idempotency_key,
        });
      }
    }

    if (
      input.context.expected_material_version !== rmState.material_version ||
      input.receipt.material_version !== rmTarget.material_version ||
      input.receipt.material_hash !== rmTarget.material_hash ||
      input.source.target.material_version !== ipcState.material_version ||
      input.source.target.material_hash !== ipcTarget.material_hash
    ) {
      return makeUnaccepted({
        http_status: 409,
        code: 'STALE_MATERIAL_VERSION',
        message:
          'Supplied receipt or source count material version/hash is stale against current approved snapshots.',
        action_result: 'stale',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    if (
      input.context.expected_row_version !== rmState.row_version ||
      input.source.expected_row_version !== ipcState.row_version
    ) {
      return makeUnaccepted({
        http_status: 409,
        code: 'STALE_ROW_VERSION',
        message: 'Expected row version does not match current chapter count or receipt state.',
        action_result: 'stale',
        idempotencyKey: input.context.idempotency_key,
      });
    }

    const discrepancyPresent = hasAnyDiscrepancy();
    const requiredPurposes: OpeningEvidencePurpose[] = discrepancyPresent
      ? ['ipc_signed_count_sheet', 'rm_inspection', 'rm_discrepancy']
      : ['ipc_signed_count_sheet', 'rm_inspection'];

    for (const reqPurpose of requiredPurposes) {
      const suppliedPin = input.evidence.find((p) => p.purpose_code === reqPurpose);
      const expectedTarget =
        reqPurpose === 'ipc_signed_count_sheet' ? ipcTarget : rmTarget;
      const storedBinding = evidenceBindings.find(
        (b) => b.purpose_code === reqPurpose && b.ready
      );
      if (
        !suppliedPin ||
        !storedBinding ||
        suppliedPin.binding_id !== storedBinding.binding_id ||
        suppliedPin.evidence.content_hash !== storedBinding.evidence.content_hash ||
        suppliedPin.evidence.object_version !== storedBinding.evidence.object_version ||
        suppliedPin.target.material_hash !== expectedTarget.material_hash
      ) {
        return makeUnaccepted({
          http_status: 409,
          code: 'EVIDENCE_NOT_READY',
          message: `Required ready evidence (${reqPurpose}) is missing, unready, or hash-mismatched.`,
          action_result: 'blocked',
          idempotencyKey: input.context.idempotency_key,
        });
      }
    }

    // Atomic commitment: Purchasing/Receiving lock & fence + Inventory posting
    const committedBaselineId = baselineId ?? '1001';
    const committedCutoverId = cutoverId ?? '1002';
    baselineId = committedBaselineId;
    cutoverId = committedCutoverId;
    baselineLocked = true;

    let postingSeq = 1100;
    let lotSeq = 1200;
    let posSeq = 1300;
    let moveSeq = 1400;

    const committedEffects: StockEffect[] = [];
    const postingIds: string[] = [];

    for (const line of rmLines) {
      const acceptedMicro = toMicroUnits(line.accepted_quantity.value);
      const nonusableMicro = toMicroUnits(line.nonusable_recorded_quantity.value);
      const scale = line.accepted_quantity.quantity_scale;

      if (acceptedMicro > 0n) {
        postingSeq += 1;
        lotSeq += 1;
        posSeq += 1;
        moveSeq += 1;
        const pId = String(postingSeq);
        const lotId = String(lotSeq);
        const posId = String(posSeq);
        const moveId = String(moveSeq);
        postingIds.push(pId);
        committedEffects.push({
          receipt_line: structuredClone(line.reference),
          posting_id: pId,
          lot_id: lotId,
          position_id: posId,
          movement_id: moveId,
          lot_kind: 'accepted',
          condition_code: 'usable',
          documented_quantity: structuredClone(line.accepted_quantity),
          accepted_quantity: structuredClone(line.accepted_quantity),
        });
        coverageCells.push({
          cell_id: nextId(),
          dimension: {
            chapter_id: chapterId,
            variant_id: line.reference.variant_id,
            unit_id: '61',
            quantity_scale: scale,
            lot_id: lotId,
            position_id: posId,
            location_id: line.location_id,
            custody_assignment_id: line.custody_assignment_id,
            custodian_user_id: null,
            custody_kind: 'stockroom',
            condition_code: 'usable',
            lot_kind: 'accepted',
            restriction_version_id: line.restriction_version_id,
            source: structuredClone(line.reference),
          },
          start: '0',
          end: fromMicroUnits(acceptedMicro, scale).value,
          quantity: fromMicroUnits(acceptedMicro, scale),
          active_hold_ids: [],
          active_reservation_id: null,
          non_hold_eligibility: 'eligible',
          blocking_codes: [],
        });
      }

      if (nonusableMicro > 0n) {
        postingSeq += 1;
        lotSeq += 1;
        posSeq += 1;
        moveSeq += 1;
        const pId = String(postingSeq);
        const lotId = String(lotSeq);
        const posId = String(posSeq);
        const moveId = String(moveSeq);
        const effCondition: OpeningConditionCode =
          line.condition_code === 'usable' ? 'damaged' : line.condition_code;
        postingIds.push(pId);
        committedEffects.push({
          receipt_line: structuredClone(line.reference),
          posting_id: pId,
          lot_id: lotId,
          position_id: posId,
          movement_id: moveId,
          lot_kind: 'nonusable',
          condition_code: effCondition,
          documented_quantity: structuredClone(line.nonusable_recorded_quantity),
          accepted_quantity: {
            value: normalizeSixDecimalQuantity('0'),
            quantity_scale: scale,
          },
        });
        coverageCells.push({
          cell_id: nextId(),
          dimension: {
            chapter_id: chapterId,
            variant_id: line.reference.variant_id,
            unit_id: '61',
            quantity_scale: scale,
            lot_id: lotId,
            position_id: posId,
            location_id: line.location_id,
            custody_assignment_id: line.custody_assignment_id,
            custodian_user_id: null,
            custody_kind: 'stockroom',
            condition_code: effCondition,
            lot_kind: 'nonusable',
            restriction_version_id: line.restriction_version_id,
            source: structuredClone(line.reference),
          },
          start: '0',
          end: fromMicroUnits(nonusableMicro, scale).value,
          quantity: fromMicroUnits(nonusableMicro, scale),
          active_hold_ids: [],
          active_reservation_id: null,
          non_hold_eligibility: 'nonusable',
          blocking_codes: ['NONUSABLE'],
        });
      }
    }

    stockEffects.push(...committedEffects);
    if (discrepancyPresent) {
      discrepancyIds.push('1501');
    }

    rmState = {
      ...rmState,
      row_version: rmState.row_version + 1,
    };
    ipcState = {
      ...ipcState,
      row_version: ipcState.row_version + 1,
      states: {
        ...ipcState.states,
        progress: 'complete',
        exception: discrepancyPresent ? 'open' : 'none',
      },
    };

    const opId = nextUlid();
    const auditEventId = '1601';
    const followUpIds = discrepancyPresent ? ['1701', '1702'] : ['1701'];
    const committedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000000Z');

    const result: AcceptedOpeningResult = {
      schema_version: '1.0',
      chapter_id: chapterId,
      action_result: 'success',
      operation: {
        identity: {
          operation_id: opId,
          action_code: 'purchasing.accept_opening_rm',
          idempotency_key: input.context.idempotency_key,
        },
        outcome: 'committed',
        committed_at: committedAt,
        replayed: false,
      },
      record: {
        reference: structuredClone(rmState.reference),
        row_version: rmState.row_version,
        material_version: rmState.material_version,
        states: {
          inspection: 'complete',
          posting: 'posted',
          exception: discrepancyPresent ? 'open' : 'none',
        },
      },
      field_feedback: [],
      blocking_reason: null,
      permitted_next_actions: [
        {
          code: 'review_record',
          label: 'Review locked opening baseline and open damage discrepancy',
        },
      ],
      input_policy: 'may_clear',
      lookup_state: null,
      data: {
        source: structuredClone(ipcTarget),
        source_state: structuredClone(ipcState),
        baseline_id: committedBaselineId,
        cutover: { id: committedCutoverId, kind: 'CUTOVER' },
        posting_ids: postingIds,
        stock_effects: structuredClone(committedEffects),
        discrepancy_ids: [...discrepancyIds],
        audit_event_id: auditEventId,
        follow_up_task_ids: followUpIds,
      },
    };

    acceptedResult = result;
    operationLedger.push({
      operation_id: opId,
      chapter_id: chapterId,
      action_code: 'purchasing.accept_opening_rm',
      idempotency_key: input.context.idempotency_key,
      payload_fingerprint: fingerprint,
      result,
    });

    const summary = computeProjectionSummary();
    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'OPENING_BASELINE_ACCEPTED',
      message: `Committed opening baseline #${committedBaselineId}: usable on-hand ${summary.usable_stockroom_on_hand}, quarantined nonusable ${summary.quarantined_rejected}.`,
      data: structuredClone(result),
    });
  }

  function lookupOpeningOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: 'purchasing.accept_opening_rm' | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P06ActionResult<AcceptedOpeningResult | UnacceptedOpeningResult> {
    if (input.chapter_id !== chapterId) {
      return makeUnaccepted({
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested operation scope is outside authorized chapter.',
        action_result: 'forbidden',
        redacted: true,
      });
    }

    const found =
      input.query_type === 'by_key'
        ? operationLedger.find(
            (e) =>
              e.chapter_id === chapterId &&
              e.action_code === (input.action_code ?? 'purchasing.accept_opening_rm') &&
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
        message: `Recovered committed opening baseline #${found.result.data.baseline_id} (${found.operation_id}).`,
        data: structuredClone(found.result),
      });
    }

    return makeUnaccepted({
      http_status: 200,
      code: 'OPERATION_UNCERTAIN',
      message:
        'No visible terminal acceptance result found. Preserve inspection state and attempt key; do not repeat physical counts.',
      action_result: 'uncertain',
      idempotencyKey: input.idempotency_key?.trim() || '',
      operationId: null,
      lookupState: 'pending_or_not_visible',
      recordState: null,
    });
  }

  return {
    getSnapshot: () => ({
      chapter_id: chapterId,
      chapter_name: chapterName,
      baseline_locked: baselineLocked,
      baseline_id: baselineId,
      cutover_id: cutoverId,
      counters: counters.map((c) => ({ ...c })),
      ipc_record_id: ipcRecordId,
      ipc_state: ipcState ? structuredClone(ipcState) : null,
      ipc_target: ipcTarget ? structuredClone(ipcTarget) : null,
      ipc_cutoff_at: ipcCutoffAt,
      ipc_counted_at: ipcCountedAt,
      ipc_purpose: ipcPurpose,
      ipc_policy_version_id: ipcPolicyVersionId,
      ipc_head_approved: ipcHeadApproved,
      ipc_finance_approved: ipcFinanceApproved,
      ipc_lines: ipcLines.map((l) => structuredClone(l)),
      rm_record_id: rmRecordId,
      rm_state: rmState ? structuredClone(rmState) : null,
      rm_target: rmTarget ? structuredClone(rmTarget) : null,
      rm_inspection_at: rmInspectionAt,
      rm_lines: rmLines.map((l) => structuredClone(l)),
      evidence_bindings: evidenceBindings.map((b) => structuredClone(b)),
      stock_effects: stockEffects.map((s) => structuredClone(s)),
      discrepancy_ids: [...discrepancyIds],
      coverage_cells: coverageCells.map((c) => structuredClone(c)),
      stock_projection: computeProjectionSummary(),
      accepted_result: acceptedResult ? structuredClone(acceptedResult) : null,
      operation_ledger: operationLedger.map((e) => structuredClone(e)),
      last_action: lastAction,
    }),
    addCounter,
    addIpcLine,
    publishAndApproveIpc,
    saveInspectionLine,
    publishInspectionReceipt,
    acceptOpeningRm,
    lookupOpeningOperation,
  };
}
