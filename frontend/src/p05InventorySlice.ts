import {
  computeDeterministicHash,
  normalizeSixDecimalQuantity,
  numericIdCompare,
} from './canonicalHash';
import type {
  Attribution,
  LineReference,
  MaterialReference,
  RecordReference,
} from './p03RecordSlice';

export const P05_CONTEXT_STORAGE_KEY = 'ysp_p05_context';

export type PurposeUse = 'internal' | 'sale' | 'booth_checkout' | 'booth_sale';

export interface Purpose {
  use: PurposeUse;
  event_id: string | null;
  requesting_unit_id: string | null;
  intended_use_at: string;
}

export interface UnitQuantity {
  value: string;
  quantity_scale: number;
}

export interface QueryInput {
  chapter_id: string;
  variant_id: string;
  unit_id: string;
  purpose: Purpose;
  requested_quantity: UnitQuantity;
  lot_ids: string[];
  location_ids: string[];
}

export interface Dimension {
  chapter_id: string;
  variant_id: string;
  unit_id: string;
  quantity_scale: number;
  lot_id: string;
  position_id: string;
  location_id: string;
  custody_assignment_id: string;
  custodian_user_id: string | null;
  custody_kind: 'stockroom' | 'booth';
  condition_code: string;
  lot_kind: 'accepted' | 'nonusable';
  restriction_version_id: string;
  source: LineReference;
}

export interface PositionVersionPin {
  position_id: string;
  row_version: number;
}

export interface GuardPin {
  variant_id: string;
  eligibility_version: number;
  position_versions: PositionVersionPin[];
}

export interface Freshness {
  read_at: string;
  state: 'current' | 'stale';
  guards: GuardPin;
  policy_version_id: string;
  restriction_version_ids: string[];
}

export interface StockViews {
  usable_stockroom_on_hand: UnitQuantity;
  available_to_allocate: UnitQuantity;
  rf_reserved: UnitQuantity;
  so_reserved: UnitQuantity;
  booth_custody: UnitQuantity;
  quarantined_rejected: UnitQuantity;
  inbound_open_po: UnitQuantity;
}

export interface UnionExplanation {
  eligible_before_holds_and_reservations: UnitQuantity;
  active_held_union: UnitQuantity;
  reserved_in_eligible: UnitQuantity;
  held_reserved_intersection: UnitQuantity;
  blocked_union: UnitQuantity;
  available_to_allocate: UnitQuantity;
}

export type NonHoldEligibility =
  | 'eligible'
  | 'restricted'
  | 'unsupported_condition'
  | 'wrong_purpose'
  | 'outside_effective_interval'
  | 'nonusable'
  | 'booth_custody';

export interface CoverageCell {
  cell_id: string;
  dimension: Dimension;
  start: string;
  end: string;
  quantity: UnitQuantity;
  active_hold_ids: string[];
  active_reservation_id: string | null;
  non_hold_eligibility: NonHoldEligibility;
  blocking_codes: string[];
}

export interface HoldSummary {
  hold_id: string;
  row_version: number;
  reason_code: string;
  source: MaterialReference;
  coverage_cell_ids: string[];
  quantity: UnitQuantity;
  state?: 'active' | 'cleared';
  resolution?: MaterialReference | null;
}

export interface DemandLineReference {
  chapter_id: string;
  record: {
    id: string;
    kind: 'RF' | 'SO';
  };
  line_id: string;
  variant_id: string;
}

export type ReservationProtection =
  | 'rf'
  | 'unpaid_expirable'
  | 'paid'
  | 'funded';

export interface ReservationSummary {
  reservation_id: string;
  demand_line: DemandLineReference;
  kind: 'RF' | 'SO';
  protection: ReservationProtection;
  coverage_cell_ids: string[];
  quantity: UnitQuantity;
  expires_at: string | null;
}

export interface InboundLine {
  po_line: {
    chapter_id: string;
    record: {
      id: string;
      kind: 'PO';
    };
    line_id: string;
    variant_id: string;
  };
  open_quantity: UnitQuantity;
  expected_location_id: string;
}

export interface EligibilityResult {
  schema_version: '1.0';
  chapter_id: string;
  query: QueryInput;
  freshness: Freshness;
  views: StockViews;
  union: UnionExplanation;
  cells: CoverageCell[];
  holds: HoldSummary[];
  reservations: ReservationSummary[];
  inbound: InboundLine[];
  rop: {
    approved_threshold: UnitQuantity;
    usable_on_hand: UnitQuantity;
    low_stock: boolean;
    basis: {
      chapter_id: string;
      variant_id: string;
      unit_id: string;
      scope: 'chapter_variant_all_stockroom_locations_and_lots';
      item_policy_version_id: string;
    };
  };
  shortage: {
    requested_quantity: UnitQuantity;
    available_quantity: UnitQuantity;
    uncovered_quantity: UnitQuantity;
  };
}

export interface ReadyEvidenceReference {
  evidence_id: string;
  storage_version: string;
  content_hash: string;
  capture_mode: 'paper_scan' | 'canvas' | 'document';
}

export interface EvidencePin {
  binding_id: string;
  target: MaterialReference;
  evidence: ReadyEvidenceReference;
  purpose_code: 'hold_finding' | 'hold_clearance';
}

export interface CoverageRangeSelection {
  lot_id: string;
  position_id: string;
  start: string;
  end: string;
}

export interface HoldCommandContext {
  chapter_id: string;
  action_code: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold';
  idempotency_key: string;
  record: RecordReference;
  expected_row_version: number;
  expected_material_version: number;
}

export interface CreateHoldInput {
  context: HoldCommandContext & { action_code: 'inventory.record_stock_hold' };
  finding: MaterialReference;
  reason_code: string;
  coverage: CoverageRangeSelection[];
  expected_guards: GuardPin;
  evidence: Array<EvidencePin & { purpose_code: 'hold_finding' }>;
}

export interface ClearHoldInput {
  context: HoldCommandContext & { action_code: 'inventory.clear_stock_hold' };
  hold_id: string;
  expected_hold_row_version: number;
  resolution: MaterialReference;
  reason: string;
  expected_guards: GuardPin;
  evidence: Array<EvidencePin & { purpose_code: 'hold_clearance' }>;
}

export interface HoldChangeData {
  hold_id: string;
  hold_row_version: number;
  state: 'active' | 'cleared';
  source: MaterialReference;
  resolution: MaterialReference | null;
  reason: string;
  actor: Attribution;
  evidence: EvidencePin[];
  affected_cell_ids: string[];
  guards: GuardPin;
  physical_quantity_changed: false;
  condition_changed: false;
  movement_ids: string[];
  audit_event_id: string;
  follow_up_task_ids: string[];
}

export interface HoldChangeResult {
  action_result: 'success';
  operation: {
    operation_id: string;
    identity: {
      chapter_id: string;
      action_code: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold';
      idempotency_key: string;
    };
    replayed: boolean;
    committed_at: string;
    payload_fingerprint: string;
  };
  data: HoldChangeData;
}

export interface InventoryUnit {
  unit_id: string;
  chapter_id: string;
  code: string;
  name: string;
  quantity_scale: number;
}

export interface InventoryLocation {
  location_id: string;
  chapter_id: string;
  code: string;
  name: string;
  custody_kind: 'stockroom' | 'booth';
  custody_assignment_id: string;
  custodian_user_id: string | null;
}

export type ItemPolicyStatus = 'missing' | 'draft' | 'approved';

export interface CatalogVariant {
  variant_id: string;
  chapter_id: string;
  sku: string;
  item_name: string;
  variant_label: string;
  unit_id: string;
  quantity_scale: number;
  eligibility_version: number;
  policy_status: ItemPolicyStatus;
  policy_version_id: string | null;
  draft_rop_threshold: UnitQuantity | null;
  approved_rop_threshold: UnitQuantity | null;
  restriction_version_ids: string[];
}

export interface InventoryOperationEntry {
  operation_id: string;
  chapter_id: string;
  action_code: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold';
  idempotency_key: string;
  payload_fingerprint: string;
  result: HoldChangeResult;
}

export interface P05ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  data?: T | undefined;
}

export interface UncertainLookupResponse {
  action_result: 'success' | 'uncertain' | 'forbidden';
  operation: {
    operation_id: string | null;
    outcome: 'committed' | 'unknown';
    committed_at: string | null;
    replayed: boolean;
    identity: {
      chapter_id: string;
      action_code: string | null;
      idempotency_key: string | null;
    };
  };
  input_policy: 'preserve';
  result?: HoldChangeResult | undefined;
}

export interface P05EngineSnapshot {
  chapter_id: string;
  chapter_name: string;
  units: ReadonlyArray<InventoryUnit>;
  locations: ReadonlyArray<InventoryLocation>;
  variants: ReadonlyArray<CatalogVariant>;
  cells: ReadonlyArray<CoverageCell>;
  holds: ReadonlyArray<HoldSummary>;
  reservations: ReadonlyArray<ReservationSummary>;
  inbound: ReadonlyArray<InboundLine>;
  position_versions: Record<string, number>;
  operation_ledger: ReadonlyArray<InventoryOperationEntry>;
  last_query_result: EligibilityResult | null;
  last_action: P05ActionResult | null;
}

export interface P05EngineOptions {
  chapter_id?: string | undefined;
  chapter_name?: string | undefined;
  units?: ReadonlyArray<InventoryUnit> | undefined;
  locations?: ReadonlyArray<InventoryLocation> | undefined;
  variants?: ReadonlyArray<CatalogVariant> | undefined;
  cells?: ReadonlyArray<CoverageCell> | undefined;
  holds?: ReadonlyArray<HoldSummary> | undefined;
  reservations?: ReadonlyArray<ReservationSummary> | undefined;
  inbound?: ReadonlyArray<InboundLine> | undefined;
  position_versions?: Record<string, number> | undefined;
  operation_ledger?: ReadonlyArray<InventoryOperationEntry> | undefined;
  actor?: Attribution | undefined;
  next_seq?: number | undefined;
}

const QUANTITY_PATTERN = /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;
const POSITIVE_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const SCALE_FRAC_PATTERNS: ReadonlyArray<RegExp> = [
  /^[0-9]+(?:\.0{1,6})?$/,
  /^[0-9]+(?:\.[0-9]{1}0{0,5})?$/,
  /^[0-9]+(?:\.[0-9]{1,2}0{0,4})?$/,
  /^[0-9]+(?:\.[0-9]{1,3}0{0,3})?$/,
  /^[0-9]+(?:\.[0-9]{1,4}0{0,2})?$/,
  /^[0-9]+(?:\.[0-9]{1,5}0{0,1})?$/,
  /^[0-9]+(?:\.[0-9]{1,6})?$/,
];

export function isValidQuantityString(value: string): boolean {
  return QUANTITY_PATTERN.test(value);
}

export function isValidUnitQuantity(qty: UnitQuantity): boolean {
  if (!Number.isInteger(qty.quantity_scale) || qty.quantity_scale < 0 || qty.quantity_scale > 6) {
    return false;
  }
  if (!isValidQuantityString(qty.value)) {
    return false;
  }
  const scalePattern = SCALE_FRAC_PATTERNS[qty.quantity_scale];
  return scalePattern ? scalePattern.test(qty.value) : false;
}

export function toMicroUnits(value: string): bigint {
  if (!isValidQuantityString(value)) {
    throw new Error(`INVALID_QUANTITY_STRING: "${value}" violates DECIMAL(20,6) wire format.`);
  }
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

export function fromMicroUnits(micro: bigint, quantityScale: number): UnitQuantity {
  if (micro < 0n) {
    throw new Error('NEGATIVE_MICRO_UNITS: Physical coverage cannot be negative.');
  }
  if (!Number.isInteger(quantityScale) || quantityScale < 0 || quantityScale > 6) {
    throw new Error(`INVALID_QUANTITY_SCALE: ${quantityScale}`);
  }
  const whole = micro / 1000000n;
  const rem = micro % 1000000n;
  if (quantityScale === 0) {
    if (rem !== 0n) {
      throw new Error('PRECISION_VIOLATION: Scale 0 cannot carry fractional micro-units.');
    }
    return { value: whole.toString(), quantity_scale: 0 };
  }
  const remStr = rem.toString().padStart(6, '0');
  const significant = remStr.slice(0, quantityScale);
  const tail = remStr.slice(quantityScale);
  if (/[^0]/.test(tail)) {
    throw new Error(`PRECISION_VIOLATION: Value exceeds approved scale ${quantityScale}.`);
  }
  const value = rem === 0n ? whole.toString() : `${whole.toString()}.${significant}`;
  return { value, quantity_scale: quantityScale };
}

function readStoredP05Options(): P05EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P05_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P05EngineOptions;
  } catch {
    return undefined;
  }
}

function sortPositionPins(pins: ReadonlyArray<PositionVersionPin>): PositionVersionPin[] {
  return [...pins].sort((a, b) => numericIdCompare(a.position_id, b.position_id));
}

function computeHoldFingerprint(
  chapterId: string,
  actionCode: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold',
  input: CreateHoldInput | ClearHoldInput
): string {
  if (actionCode === 'inventory.record_stock_hold') {
    const create = input as CreateHoldInput;
    const normalizedCoverage = [...create.coverage]
      .map((item) => ({
        lot_id: item.lot_id,
        position_id: item.position_id,
        start: normalizeSixDecimalQuantity(item.start),
        end: normalizeSixDecimalQuantity(item.end),
      }))
      .sort((a, b) => {
        const lotCmp = numericIdCompare(a.lot_id, b.lot_id);
        if (lotCmp !== 0) return lotCmp;
        const posCmp = numericIdCompare(a.position_id, b.position_id);
        if (posCmp !== 0) return posCmp;
        const startDiff = toMicroUnits(a.start) - toMicroUnits(b.start);
        if (startDiff !== 0n) return startDiff < 0n ? -1 : 1;
        const endDiff = toMicroUnits(a.end) - toMicroUnits(b.end);
        return endDiff < 0n ? -1 : endDiff > 0n ? 1 : 0;
      });
    return computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      input_schema: 'urn:ysp:stock-holds:v1#/$defs/CreateHoldInput',
      input: {
        context: {
          record: create.context.record,
          expected_row_version: create.context.expected_row_version,
          expected_material_version: create.context.expected_material_version,
        },
        finding: create.finding,
        reason_code: create.reason_code,
        coverage: normalizedCoverage,
        expected_guards: {
          variant_id: create.expected_guards.variant_id,
          eligibility_version: create.expected_guards.eligibility_version,
          position_versions: sortPositionPins(create.expected_guards.position_versions),
        },
        evidence: [...create.evidence].sort((a, b) => numericIdCompare(a.binding_id, b.binding_id)),
      },
    });
  }

  const clear = input as ClearHoldInput;
  return computeDeterministicHash({
    chapter_id: chapterId,
    action_code: actionCode,
    input_schema: 'urn:ysp:stock-holds:v1#/$defs/ClearHoldInput',
    input: {
      context: {
        record: clear.context.record,
        expected_row_version: clear.context.expected_row_version,
        expected_material_version: clear.context.expected_material_version,
      },
      hold_id: clear.hold_id,
      expected_hold_row_version: clear.expected_hold_row_version,
      resolution: clear.resolution,
      reason: clear.reason,
      expected_guards: {
        variant_id: clear.expected_guards.variant_id,
        eligibility_version: clear.expected_guards.eligibility_version,
        position_versions: sortPositionPins(clear.expected_guards.position_versions),
      },
      evidence: [...clear.evidence].sort((a, b) => numericIdCompare(a.binding_id, b.binding_id)),
    },
  });
}

function buildBlockingCodes(cell: {
  active_hold_ids: ReadonlyArray<string>;
  active_reservation_id: string | null;
  non_hold_eligibility: NonHoldEligibility;
}): string[] {
  const codes: string[] = [];
  if (cell.active_hold_ids.length > 0) codes.push('ACTIVE_HOLD');
  if (cell.active_reservation_id !== null) codes.push('RESERVED');
  if (cell.non_hold_eligibility === 'restricted') codes.push('DONOR_RESTRICTION');
  else if (cell.non_hold_eligibility === 'nonusable') codes.push('NONUSABLE_CONDITION');
  else if (cell.non_hold_eligibility === 'booth_custody') codes.push('BOOTH_CUSTODY');
  else if (cell.non_hold_eligibility !== 'eligible') codes.push(cell.non_hold_eligibility.toUpperCase());
  return codes;
}

export interface P05InventoryEngine {
  getSnapshot: () => P05EngineSnapshot;
  registerUnit: (input: {
    unit_id?: string | undefined;
    code: string;
    name: string;
    quantity_scale: number;
  }) => P05ActionResult<InventoryUnit>;
  registerLocation: (input: {
    location_id?: string | undefined;
    code: string;
    name: string;
    custody_kind: 'stockroom' | 'booth';
    custody_assignment_id?: string | undefined;
    custodian_user_id?: string | null | undefined;
  }) => P05ActionResult<InventoryLocation>;
  registerVariant: (input: {
    variant_id?: string | undefined;
    sku: string;
    item_name: string;
    variant_label: string;
    unit_id: string;
  }) => P05ActionResult<CatalogVariant>;
  prepareItemPolicy: (input: {
    variant_id: string;
    policy_version_id: string;
    rop_threshold_value: string;
  }) => P05ActionResult<CatalogVariant>;
  approveItemPolicy: (input: {
    variant_id: string;
    policy_version_id: string;
    approver_duty: string;
  }) => P05ActionResult<CatalogVariant>;
  attemptDirectBalanceSetter: (input: {
    variant_id: string;
    arbitrary_quantity: string;
  }) => P05ActionResult<null>;
  queryEligibility: (input: QueryInput) => P05ActionResult<EligibilityResult>;
  recordStockHold: (input: CreateHoldInput) => P05ActionResult<HoldChangeResult>;
  clearStockHold: (input: ClearHoldInput) => P05ActionResult<HoldChangeResult>;
  lookupInventoryOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold' | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P05ActionResult<UncertainLookupResponse>;
}

export function createP05InventoryEngine(options?: P05EngineOptions): P05InventoryEngine {
  const seed = options ?? readStoredP05Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterName = seed.chapter_name ?? 'Active Chapter';
  let seq = seed.next_seq ?? 5000;

  const units: InventoryUnit[] = (seed.units ?? []).map((u) => ({ ...u }));
  const locations: InventoryLocation[] = (seed.locations ?? []).map((l) => ({ ...l }));
  const variants: CatalogVariant[] = (seed.variants ?? []).map((v) => ({
    ...v,
    restriction_version_ids: [...v.restriction_version_ids],
    draft_rop_threshold: v.draft_rop_threshold ? { ...v.draft_rop_threshold } : null,
    approved_rop_threshold: v.approved_rop_threshold ? { ...v.approved_rop_threshold } : null,
  }));
  let cells: CoverageCell[] = (seed.cells ?? []).map((c) => ({
    ...c,
    dimension: {
      ...c.dimension,
      source: { ...c.dimension.source, record: { ...c.dimension.source.record } },
    },
    quantity: { ...c.quantity },
    active_hold_ids: [...c.active_hold_ids],
    blocking_codes: [...c.blocking_codes],
  }));
  const holds: HoldSummary[] = (seed.holds ?? []).map((h) => ({
    ...h,
    source: { ...h.source, record: { ...h.source.record } },
    coverage_cell_ids: [...h.coverage_cell_ids],
    quantity: { ...h.quantity },
    state: h.state ?? 'active',
    resolution: h.resolution ? { ...h.resolution, record: { ...h.resolution.record } } : null,
  }));
  const reservations: ReservationSummary[] = (seed.reservations ?? []).map((r) => ({
    ...r,
    demand_line: { ...r.demand_line, record: { ...r.demand_line.record } },
    coverage_cell_ids: [...r.coverage_cell_ids],
    quantity: { ...r.quantity },
  }));
  const inbound: InboundLine[] = (seed.inbound ?? []).map((i) => ({
    ...i,
    po_line: { ...i.po_line, record: { ...i.po_line.record } },
    open_quantity: { ...i.open_quantity },
  }));

  const positionVersions: Record<string, number> = { ...(seed.position_versions ?? {}) };
  for (const cell of cells) {
    if (positionVersions[cell.dimension.position_id] === undefined) {
      positionVersions[cell.dimension.position_id] = 1;
    }
  }

  const operationLedger: InventoryOperationEntry[] = (seed.operation_ledger ?? []).map((entry) => ({
    ...entry,
  }));

  const actor: Attribution = seed.actor ?? {
    chapter_id: chapterId,
    user_id: '21',
    membership_id: '211',
    duty_grant_id: '1001',
    duty_code: 'INVENTORY',
    actor_name: 'Chapter Inventory Officer',
    chapter_name: chapterName,
    captured_at: '2026-11-21T12:00:00.000000Z',
  };

  let lastQueryResult: EligibilityResult | null = null;
  let lastAction: P05ActionResult | null = null;

  function allocateId(): string {
    seq += 1;
    return String(seq);
  }

  function allocateUlid(): string {
    seq += 1;
    return `01K9P05${String(seq).padStart(19, '0')}`;
  }

  function recordOutcome<T>(res: P05ActionResult<T>): P05ActionResult<T> {
    lastAction = res;
    return res;
  }

  function registerUnit(input: {
    unit_id?: string | undefined;
    code: string;
    name: string;
    quantity_scale: number;
  }): P05ActionResult<InventoryUnit> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const unitId = input.unit_id?.trim() || allocateId();
    if (!code || !name) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'UNIT_FIELDS_REQUIRED',
        message: 'Unit code and name are required.',
      });
    }
    if (!POSITIVE_ID_PATTERN.test(unitId)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UNIT_ID',
        message: 'Unit ID must be a positive base-10 identifier string.',
      });
    }
    if (!Number.isInteger(input.quantity_scale) || input.quantity_scale < 0 || input.quantity_scale > 6) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY_SCALE',
        message: 'Quantity scale must be an integer between 0 and 6.',
      });
    }
    if (units.some((u) => u.unit_id === unitId || u.code === code)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_UNIT',
        message: `Unit ${code} (${unitId}) is already registered.`,
      });
    }
    const created: InventoryUnit = {
      unit_id: unitId,
      chapter_id: chapterId,
      code,
      name,
      quantity_scale: input.quantity_scale,
    };
    units.push(created);
    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'UNIT_REGISTERED',
      message: `Registered unit ${code} (scale ${input.quantity_scale}).`,
      data: { ...created },
    });
  }

  function registerLocation(input: {
    location_id?: string | undefined;
    code: string;
    name: string;
    custody_kind: 'stockroom' | 'booth';
    custody_assignment_id?: string | undefined;
    custodian_user_id?: string | null | undefined;
  }): P05ActionResult<InventoryLocation> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const locationId = input.location_id?.trim() || allocateId();
    if (!code || !name) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'LOCATION_FIELDS_REQUIRED',
        message: 'Location code and name are required.',
      });
    }
    if (locations.some((l) => l.location_id === locationId || l.code === code)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_LOCATION',
        message: `Location ${code} (${locationId}) is already registered.`,
      });
    }
    const created: InventoryLocation = {
      location_id: locationId,
      chapter_id: chapterId,
      code,
      name,
      custody_kind: input.custody_kind,
      custody_assignment_id: input.custody_assignment_id?.trim() || allocateId(),
      custodian_user_id: input.custodian_user_id ?? null,
    };
    locations.push(created);
    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'LOCATION_REGISTERED',
      message: `Registered ${created.custody_kind} location ${code}.`,
      data: { ...created },
    });
  }

  function registerVariant(input: {
    variant_id?: string | undefined;
    sku: string;
    item_name: string;
    variant_label: string;
    unit_id: string;
  }): P05ActionResult<CatalogVariant> {
    const sku = input.sku.trim().toUpperCase();
    const itemName = input.item_name.trim();
    const variantLabel = input.variant_label.trim();
    const variantId = input.variant_id?.trim() || allocateId();
    if (!sku || !itemName) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'VARIANT_FIELDS_REQUIRED',
        message: 'Item SKU and item name are required.',
      });
    }
    const unit = units.find((u) => u.unit_id === input.unit_id);
    if (!unit) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'UNIT_NOT_FOUND',
        message: 'Selected unit of measure does not exist in chapter catalog.',
      });
    }
    if (variants.some((v) => v.variant_id === variantId || v.sku === sku)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_VARIANT',
        message: `Catalog SKU ${sku} is already registered.`,
      });
    }
    const created: CatalogVariant = {
      variant_id: variantId,
      chapter_id: chapterId,
      sku,
      item_name: itemName,
      variant_label: variantLabel || 'Standard',
      unit_id: unit.unit_id,
      quantity_scale: unit.quantity_scale,
      eligibility_version: 1,
      policy_status: 'missing',
      policy_version_id: null,
      draft_rop_threshold: null,
      approved_rop_threshold: null,
      restriction_version_ids: [],
    };
    variants.push(created);
    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'VARIANT_REGISTERED',
      message: `Registered catalog item ${sku} (${itemName}) with empty stock balance.`,
      data: { ...created },
    });
  }

  function prepareItemPolicy(input: {
    variant_id: string;
    policy_version_id: string;
    rop_threshold_value: string;
  }): P05ActionResult<CatalogVariant> {
    const variant = variants.find((v) => v.variant_id === input.variant_id);
    if (!variant) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'VARIANT_NOT_FOUND',
        message: 'Catalog variant not found in chapter.',
      });
    }
    const candidate: UnitQuantity = {
      value: input.rop_threshold_value.trim(),
      quantity_scale: variant.quantity_scale,
    };
    if (!isValidUnitQuantity(candidate)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_PRECISION',
        message: `ROP threshold "${candidate.value}" does not match approved scale ${variant.quantity_scale}.`,
      });
    }
    const policyVerId = input.policy_version_id.trim() || allocateId();
    variant.policy_status = 'draft';
    variant.policy_version_id = policyVerId;
    variant.draft_rop_threshold = candidate;
    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'ITEM_POLICY_DRAFTED',
      message: `Prepared draft ROP policy (${candidate.value}) for ${variant.sku}. Approval required before eligibility queries.`,
      data: { ...variant },
    });
  }

  function approveItemPolicy(input: {
    variant_id: string;
    policy_version_id: string;
    approver_duty: string;
  }): P05ActionResult<CatalogVariant> {
    if (
      input.approver_duty !== 'CHAPTER_HEAD' &&
      input.approver_duty !== 'INVENTORY' &&
      input.approver_duty !== 'FINANCE'
    ) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'INSUFFICIENT_DUTY',
        message: 'Only authorized CHAPTER_HEAD, INVENTORY, or FINANCE officers may approve item policy.',
      });
    }
    const variant = variants.find((v) => v.variant_id === input.variant_id);
    if (!variant) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'VARIANT_NOT_FOUND',
        message: 'Catalog variant not found in chapter.',
      });
    }
    if (variant.policy_status !== 'draft' || !variant.draft_rop_threshold) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'POLICY_NOT_DRAFT',
        message: 'Prepare a draft item ROP threshold before approval.',
      });
    }
    if (input.policy_version_id && variant.policy_version_id !== input.policy_version_id) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'POLICY_VERSION_MISMATCH',
        message: 'Supplied policy version does not match current draft policy.',
      });
    }
    variant.policy_status = 'approved';
    variant.approved_rop_threshold = { ...variant.draft_rop_threshold };
    variant.eligibility_version += 1;
    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'ITEM_POLICY_APPROVED',
      message: `Approved item ROP threshold (${variant.approved_rop_threshold.value}) for ${variant.sku}.`,
      data: { ...variant },
    });
  }

  function attemptDirectBalanceSetter(input: {
    variant_id: string;
    arbitrary_quantity: string;
  }): P05ActionResult<null> {
    void input;
    return recordOutcome({
      ok: false,
      http_status: 403,
      code: 'DIRECT_BALANCE_SETTER_FORBIDDEN',
      message:
        'Direct balance modification is not permitted. Stock balances update only through verified receiving transactions.',
      data: null,
    });
  }

  function buildGuardsForVariant(variant: CatalogVariant, scopeCells: ReadonlyArray<CoverageCell>): GuardPin {
    const posIds = Array.from(new Set(scopeCells.map((c) => c.dimension.position_id))).sort(
      numericIdCompare
    );
    return {
      variant_id: variant.variant_id,
      eligibility_version: variant.eligibility_version,
      position_versions: posIds.map((positionId) => ({
        position_id: positionId,
        row_version: positionVersions[positionId] ?? 1,
      })),
    };
  }

  function queryEligibility(input: QueryInput): P05ActionResult<EligibilityResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'CHAPTER_SCOPE_FORBIDDEN',
        message: 'Target chapter does not match active authorized chapter.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.purpose.intended_use_at)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'intended_use_at must be a Z-suffixed UTC instant.',
      });
    }
    const variant = variants.find((v) => v.variant_id === input.variant_id);
    if (!variant) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'VARIANT_NOT_FOUND',
        message: 'Catalog variant not found in active chapter.',
      });
    }
    if (input.unit_id !== variant.unit_id || input.requested_quantity.quantity_scale !== variant.quantity_scale) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'UNIT_SCALE_MISMATCH',
        message: `Query unit/scale must match variant approved scale ${variant.quantity_scale}.`,
      });
    }
    if (!isValidUnitQuantity(input.requested_quantity)) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY_PRECISION',
        message: `Requested quantity "${input.requested_quantity.value}" violates scale ${variant.quantity_scale}.`,
      });
    }
    if (variant.policy_status !== 'approved' || !variant.approved_rop_threshold || !variant.policy_version_id) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'POLICY_NOT_EFFECTIVE',
        message: 'Approved item policy and ROP threshold are required before evaluating eligibility.',
      });
    }

    const scale = variant.quantity_scale;
    const allVariantCells = cells.filter(
      (c) =>
        c.dimension.chapter_id === chapterId &&
        c.dimension.variant_id === variant.variant_id &&
        c.dimension.unit_id === variant.unit_id
    );

    for (const c of allVariantCells) {
      const startMicro = toMicroUnits(c.start);
      const endMicro = toMicroUnits(c.end);
      const qtyMicro = toMicroUnits(c.quantity.value);
      if (endMicro <= startMicro || endMicro - startMicro !== qtyMicro) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'CELL_GEOMETRY_INVALID',
          message: `Cell ${c.cell_id} violates positive interval conservation.`,
        });
      }
      for (const other of allVariantCells) {
        if (c.cell_id >= other.cell_id || c.dimension.lot_id !== other.dimension.lot_id) continue;
        const otherStart = toMicroUnits(other.start);
        const otherEnd = toMicroUnits(other.end);
        if (!(endMicro <= otherStart || otherEnd <= startMicro)) {
          return recordOutcome({
            ok: false,
            http_status: 409,
            code: 'CELL_INTERVAL_OVERLAP',
            message: `Same-lot intervals ${c.cell_id} and ${other.cell_id} overlap.`,
          });
        }
      }
    }

    const lotFilter = new Set(input.lot_ids);
    const locationFilter = new Set(input.location_ids);
    const filteredCells = allVariantCells.filter(
      (c) =>
        (lotFilter.size === 0 || lotFilter.has(c.dimension.lot_id)) &&
        (locationFilter.size === 0 || locationFilter.has(c.dimension.location_id))
    );
    const cellMap = new Map(filteredCells.map((c) => [c.cell_id, c]));

    const sumCellsMicro = (group: ReadonlyArray<CoverageCell>): bigint =>
      group.reduce((total, c) => total + toMicroUnits(c.quantity.value), 0n);

    // Non-hold purpose eligibility gate applied when caller explicitly queries a purpose context
    const evaluatedCells = filteredCells.map((c) => {
      if (
        c.dimension.custody_kind === 'booth' ||
        c.dimension.condition_code !== 'usable' ||
        c.dimension.lot_kind === 'nonusable'
      ) {
        return c;
      }
      if (
        c.non_hold_eligibility === 'eligible' &&
        (input.purpose.use === 'booth_sale' || input.purpose.use === 'booth_checkout') &&
        !input.purpose.event_id
      ) {
        return {
          ...c,
          non_hold_eligibility: 'wrong_purpose' as const,
          blocking_codes: Array.from(new Set([...c.blocking_codes, 'MISSING_EVENT_CONTEXT'])),
        };
      }
      return c;
    });

    const usableFiltered = evaluatedCells.filter(
      (c) =>
        c.dimension.custody_kind === 'stockroom' &&
        c.dimension.condition_code === 'usable' &&
        c.dimension.lot_kind === 'accepted'
    );
    const eligible = usableFiltered.filter((c) => c.non_hold_eligibility === 'eligible');
    const held = eligible.filter((c) => c.active_hold_ids.length > 0);
    const reserved = eligible.filter((c) => c.active_reservation_id !== null);
    const intersection = held.filter((c) => c.active_reservation_id !== null);
    const blocked = eligible.filter(
      (c) => c.active_hold_ids.length > 0 || c.active_reservation_id !== null
    );
    const available = eligible.filter(
      (c) => c.active_hold_ids.length === 0 && c.active_reservation_id === null
    );

    const eligibleMicro = sumCellsMicro(eligible);
    const heldUnionMicro = sumCellsMicro(held);
    const reservedInEligibleMicro = sumCellsMicro(reserved);
    const intersectionMicro = sumCellsMicro(intersection);
    const blockedMicro = heldUnionMicro + reservedInEligibleMicro - intersectionMicro;
    const availableMicro = eligibleMicro - blockedMicro;
    if (
      blockedMicro !== sumCellsMicro(blocked) ||
      eligibleMicro < blockedMicro ||
      availableMicro !== sumCellsMicro(available)
    ) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'COVERAGE_INTEGRITY_ERROR',
        message: 'Negative or inconsistent union arithmetic detected; fail closed.',
      });
    }

    // Reservations visible within filtered cell scope
    const filteredReservations: ReservationSummary[] = reservations
      .map((r) => {
        const matchedIds = r.coverage_cell_ids.filter((id) => cellMap.has(id));
        if (matchedIds.length === 0) return null;
        const matchedMicro = matchedIds.reduce(
          (sum, id) => sum + toMicroUnits(cellMap.get(id)!.quantity.value),
          0n
        );
        return {
          ...r,
          coverage_cell_ids: matchedIds,
          quantity: fromMicroUnits(matchedMicro, scale),
        };
      })
      .filter((r): r is ReservationSummary => r !== null);

    // Active holds visible within filtered cell scope
    const filteredHolds: HoldSummary[] = holds
      .filter((h) => (h.state ?? 'active') === 'active')
      .map((h) => {
        const matchedIds = h.coverage_cell_ids.filter((id) => cellMap.has(id));
        if (matchedIds.length === 0) return null;
        const matchedMicro = matchedIds.reduce(
          (sum, id) => sum + toMicroUnits(cellMap.get(id)!.quantity.value),
          0n
        );
        return {
          hold_id: h.hold_id,
          row_version: h.row_version,
          reason_code: h.reason_code,
          source: h.source,
          coverage_cell_ids: matchedIds,
          quantity: fromMicroUnits(matchedMicro, scale),
        };
      })
      .filter((h): h is HoldSummary => h !== null);

    // Unreceived inbound POs have no receipt lot_id, so explicit lot filters yield zero inbound
    const filteredInbound =
      lotFilter.size > 0
        ? []
        : inbound.filter(
            (line) =>
              line.po_line.chapter_id === chapterId &&
              line.po_line.variant_id === variant.variant_id &&
              (locationFilter.size === 0 || locationFilter.has(line.expected_location_id))
          );

    const rfReservedMicro = filteredReservations
      .filter((r) => r.kind === 'RF')
      .reduce((sum, r) => sum + toMicroUnits(r.quantity.value), 0n);
    const soReservedMicro = filteredReservations
      .filter((r) => r.kind === 'SO')
      .reduce((sum, r) => sum + toMicroUnits(r.quantity.value), 0n);
    const boothCustodyMicro = sumCellsMicro(
      evaluatedCells.filter((c) => c.dimension.custody_kind === 'booth')
    );
    const quarantinedMicro = sumCellsMicro(
      evaluatedCells.filter(
        (c) => c.dimension.condition_code !== 'usable' || c.dimension.lot_kind === 'nonusable'
      )
    );
    const inboundMicro = filteredInbound.reduce(
      (sum, line) => sum + toMicroUnits(line.open_quantity.value),
      0n
    );

    // Chapter-wide ROP checks ALL usable stockroom cells across ALL lots and locations
    const chapterWideUsableMicro = sumCellsMicro(
      allVariantCells.filter(
        (c) =>
          c.dimension.custody_kind === 'stockroom' &&
          c.dimension.condition_code === 'usable' &&
          c.dimension.lot_kind === 'accepted'
      )
    );
    const ropThresholdMicro = toMicroUnits(variant.approved_rop_threshold.value);
    const lowStock = chapterWideUsableMicro <= ropThresholdMicro;

    const requestedMicro = toMicroUnits(input.requested_quantity.value);
    const uncoveredMicro = requestedMicro > availableMicro ? requestedMicro - availableMicro : 0n;

    const restrictionVersionIds = Array.from(
      new Set([
        ...variant.restriction_version_ids,
        ...filteredCells.map((c) => c.dimension.restriction_version_id),
      ])
    ).sort(numericIdCompare);

    const result: EligibilityResult = {
      schema_version: '1.0',
      chapter_id: chapterId,
      query: {
        ...input,
        lot_ids: [...input.lot_ids],
        location_ids: [...input.location_ids],
      },
      freshness: {
        read_at: new Date().toISOString().replace(/\.\d{3}Z$/, '.000000Z'),
        state: 'current',
        guards: buildGuardsForVariant(variant, allVariantCells),
        policy_version_id: variant.policy_version_id,
        restriction_version_ids: restrictionVersionIds,
      },
      views: {
        usable_stockroom_on_hand: fromMicroUnits(sumCellsMicro(usableFiltered), scale),
        available_to_allocate: fromMicroUnits(availableMicro, scale),
        rf_reserved: fromMicroUnits(rfReservedMicro, scale),
        so_reserved: fromMicroUnits(soReservedMicro, scale),
        booth_custody: fromMicroUnits(boothCustodyMicro, scale),
        quarantined_rejected: fromMicroUnits(quarantinedMicro, scale),
        inbound_open_po: fromMicroUnits(inboundMicro, scale),
      },
      union: {
        eligible_before_holds_and_reservations: fromMicroUnits(eligibleMicro, scale),
        active_held_union: fromMicroUnits(heldUnionMicro, scale),
        reserved_in_eligible: fromMicroUnits(reservedInEligibleMicro, scale),
        held_reserved_intersection: fromMicroUnits(intersectionMicro, scale),
        blocked_union: fromMicroUnits(blockedMicro, scale),
        available_to_allocate: fromMicroUnits(availableMicro, scale),
      },
      cells: evaluatedCells,
      holds: filteredHolds,
      reservations: filteredReservations,
      inbound: filteredInbound,
      rop: {
        approved_threshold: { ...variant.approved_rop_threshold },
        usable_on_hand: fromMicroUnits(chapterWideUsableMicro, scale),
        low_stock: lowStock,
        basis: {
          chapter_id: chapterId,
          variant_id: variant.variant_id,
          unit_id: variant.unit_id,
          scope: 'chapter_variant_all_stockroom_locations_and_lots',
          item_policy_version_id: variant.policy_version_id,
        },
      },
      shortage: {
        requested_quantity: { ...input.requested_quantity },
        available_quantity: fromMicroUnits(availableMicro, scale),
        uncovered_quantity: fromMicroUnits(uncoveredMicro, scale),
      },
    };

    lastQueryResult = result;
    return recordOutcome({
      ok: true,
      http_status: 200,
      code: allVariantCells.length === 0 ? 'ELIGIBILITY_ZERO_STOCK' : 'ELIGIBILITY_READY',
      message:
        allVariantCells.length === 0
          ? `Confirmed empty stock baseline for ${variant.sku} across all stock balance views.`
          : `Evaluated stock availability for ${variant.sku} across ${evaluatedCells.length} segment(s).`,
      data: result,
    });
  }

  function recordStockHold(input: CreateHoldInput): P05ActionResult<HoldChangeResult> {
    if (input.context.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'CHAPTER_SCOPE_FORBIDDEN',
        message: 'Hold target chapter does not match active chapter.',
      });
    }
    if (!input.context.idempotency_key.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key is required for hold recording.',
      });
    }
    if (!input.reason_code.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_CODE_REQUIRED',
        message: 'Finding reason code is required.',
      });
    }
    if (input.expected_guards.position_versions.length === 0) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'POSITION_PINS_REQUIRED',
        message: 'Current position guard pins are required.',
      });
    }
    if (
      input.evidence.length === 0 ||
      input.evidence.some(
        (pin) =>
          pin.purpose_code !== 'hold_finding' ||
          !SHA256_HEX_PATTERN.test(pin.evidence.content_hash)
      )
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_EVIDENCE_PIN',
        message: 'Verified holding evidence with a valid 64-character SHA-256 digest is required.',
      });
    }
    if (input.coverage.length === 0) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'COVERAGE_REQUIRED',
        message: 'At least one exact lot/position coverage interval is required.',
      });
    }

    const fingerprint = computeHoldFingerprint(chapterId, 'inventory.record_stock_hold', input);
    const existingOp = operationLedger.find(
      (entry) =>
        entry.chapter_id === chapterId &&
        entry.action_code === 'inventory.record_stock_hold' &&
        entry.idempotency_key === input.context.idempotency_key
    );
    if (existingOp) {
      if (existingOp.payload_fingerprint === fingerprint) {
        const replayedResult: HoldChangeResult = {
          ...existingOp.result,
          operation: {
            ...existingOp.result.operation,
            replayed: true,
          },
        };
        return recordOutcome({
          ok: true,
          http_status: 200,
          code: 'HOLD_RECORD_REPLAYED',
          message: `Idempotent replay returned existing hold ${replayedResult.data.hold_id}.`,
          data: replayedResult,
        });
      }
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key already committed with a different hold payload.',
      });
    }

    const variant = variants.find((v) => v.variant_id === input.expected_guards.variant_id);
    if (!variant) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'VARIANT_NOT_FOUND',
        message: 'Target catalog variant not found.',
      });
    }

    if (input.expected_guards.eligibility_version !== variant.eligibility_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_GUARD_VERSION',
        message: `Stale variant guard: expected ${input.expected_guards.eligibility_version}, current ${variant.eligibility_version}.`,
      });
    }
    for (const pin of input.expected_guards.position_versions) {
      const currentPosVer = positionVersions[pin.position_id];
      if (currentPosVer === undefined || currentPosVer !== pin.row_version) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'STALE_GUARD_VERSION',
          message: `Stale position guard for position ${pin.position_id}.`,
        });
      }
    }

    // Validate all requested coverage ranges and verify none overlap each other
    const validatedRanges: Array<{
      lot_id: string;
      position_id: string;
      startMicro: bigint;
      endMicro: bigint;
    }> = [];
    for (const range of input.coverage) {
      if (!isValidQuantityString(range.start) || !isValidQuantityString(range.end)) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_COVERAGE_RANGE',
          message: 'Range values must be valid decimal quantities (up to 6 decimal places).',
        });
      }
      const startMicro = toMicroUnits(range.start);
      const endMicro = toMicroUnits(range.end);
      if (endMicro <= startMicro) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_COVERAGE_RANGE',
          message: 'Coverage end must exceed start.',
        });
      }
      try {
        fromMicroUnits(endMicro - startMicro, variant.quantity_scale);
      } catch {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'UNIT_SCALE_MISMATCH',
          message: `Coverage slice violates variant approved scale ${variant.quantity_scale}.`,
        });
      }
      for (const prev of validatedRanges) {
        if (prev.lot_id === range.lot_id && !(endMicro <= prev.startMicro || prev.endMicro <= startMicro)) {
          return recordOutcome({
            ok: false,
            http_status: 422,
            code: 'OVERLAPPING_SELECTION_INTERVALS',
            message: 'Coverage selection contains overlapping intervals in the same lot.',
          });
        }
      }
      validatedRanges.push({
        lot_id: range.lot_id,
        position_id: range.position_id,
        startMicro,
        endMicro,
      });
    }

    // Verify all coverage intervals resolve cleanly inside live stored cells
    const pinPosSet = new Set(input.expected_guards.position_versions.map((p) => p.position_id));
    for (const range of validatedRanges) {
      if (!pinPosSet.has(range.position_id)) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'STALE_GUARD_VERSION',
          message: `Position ${range.position_id} missing from expected_guards.position_versions.`,
        });
      }
      const matchingCells = cells
        .filter(
          (c) =>
            c.dimension.variant_id === variant.variant_id &&
            c.dimension.lot_id === range.lot_id &&
            c.dimension.position_id === range.position_id
        )
        .sort((a, b) => {
          const d = toMicroUnits(a.start) - toMicroUnits(b.start);
          return d < 0n ? -1 : d > 0n ? 1 : 0;
        });

      let cursor = range.startMicro;
      for (const cell of matchingCells) {
        const cStart = toMicroUnits(cell.start);
        const cEnd = toMicroUnits(cell.end);
        if (cEnd <= cursor) continue;
        if (cStart > cursor) break;
        cursor = cEnd >= range.endMicro ? range.endMicro : cEnd;
        if (cursor >= range.endMicro) break;
      }
      if (cursor < range.endMicro) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'INVALID_COVERAGE_RANGE',
          message: `Selected range on lot ${range.lot_id} / position ${range.position_id} exceeds live stored coverage.`,
        });
      }
    }

    // Execute atomic split (if proper subset) & hold attachment
    const newHoldId = allocateId();
    const scale = variant.quantity_scale;
    const affectedCellIds: string[] = [];
    const touchedPositions = new Set<string>();
    const nextCells: CoverageCell[] = [];

    for (const cell of cells) {
      if (cell.dimension.variant_id !== variant.variant_id) {
        nextCells.push(cell);
        continue;
      }
      const cellStart = toMicroUnits(cell.start);
      const cellEnd = toMicroUnits(cell.end);
      const overlappingRanges = validatedRanges
        .filter(
          (r) =>
            r.lot_id === cell.dimension.lot_id &&
            r.position_id === cell.dimension.position_id &&
            !(r.endMicro <= cellStart || cellEnd <= r.startMicro)
        )
        .sort((a, b) => (a.startMicro < b.startMicro ? -1 : 1));

      if (overlappingRanges.length === 0) {
        nextCells.push(cell);
        continue;
      }

      touchedPositions.add(cell.dimension.position_id);

      // Partition [cellStart, cellEnd) into segments separated by overlap boundaries
      const breakpoints = new Set<bigint>([cellStart, cellEnd]);
      for (const r of overlappingRanges) {
        breakpoints.add(r.startMicro > cellStart ? r.startMicro : cellStart);
        breakpoints.add(r.endMicro < cellEnd ? r.endMicro : cellEnd);
      }
      const sortedPts = Array.from(breakpoints).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      if (sortedPts.length === 2) {
        // Whole cell covered — attach hold without splitting
        const updatedHoldIds = [...cell.active_hold_ids, newHoldId];
        const updatedCell: CoverageCell = {
          ...cell,
          active_hold_ids: updatedHoldIds,
          blocking_codes: buildBlockingCodes({
            active_hold_ids: updatedHoldIds,
            active_reservation_id: cell.active_reservation_id,
            non_hold_eligibility: cell.non_hold_eligibility,
          }),
        };
        nextCells.push(updatedCell);
        affectedCellIds.push(updatedCell.cell_id);
      } else {
        // Proper subset split — retire parent, mint adjacent children inheriting prior holds/reservation
        const mintedIds: string[] = [];
        const coveredChildIds: string[] = [];
        for (let i = 0; i < sortedPts.length - 1; i += 1) {
          const segStart = sortedPts[i]!;
          const segEnd = sortedPts[i + 1]!;
          const isCovered = overlappingRanges.some(
            (r) => segStart >= r.startMicro && segEnd <= r.endMicro
          );
          const childId = allocateId();
          const childHoldIds = isCovered
            ? [...cell.active_hold_ids, newHoldId]
            : [...cell.active_hold_ids];
          const child: CoverageCell = {
            cell_id: childId,
            dimension: {
              ...cell.dimension,
              source: { ...cell.dimension.source, record: { ...cell.dimension.source.record } },
            },
            start: fromMicroUnits(segStart, scale).value,
            end: fromMicroUnits(segEnd, scale).value,
            quantity: fromMicroUnits(segEnd - segStart, scale),
            active_hold_ids: childHoldIds,
            active_reservation_id: cell.active_reservation_id,
            non_hold_eligibility: cell.non_hold_eligibility,
            blocking_codes: buildBlockingCodes({
              active_hold_ids: childHoldIds,
              active_reservation_id: cell.active_reservation_id,
              non_hold_eligibility: cell.non_hold_eligibility,
            }),
          };
          nextCells.push(child);
          mintedIds.push(childId);
          if (isCovered) {
            coveredChildIds.push(childId);
          }
        }
        // Update existing holds & reservations that referenced retired parent cell
        for (const h of holds) {
          if (h.coverage_cell_ids.includes(cell.cell_id)) {
            h.coverage_cell_ids = h.coverage_cell_ids.flatMap((id) =>
              id === cell.cell_id ? mintedIds : [id]
            );
          }
        }
        for (const r of reservations) {
          if (r.coverage_cell_ids.includes(cell.cell_id)) {
            r.coverage_cell_ids = r.coverage_cell_ids.flatMap((id) =>
              id === cell.cell_id ? mintedIds : [id]
            );
          }
        }
        affectedCellIds.push(...coveredChildIds);
      }
    }

    cells = nextCells;

    const coveredMicro = affectedCellIds.reduce((sum, id) => {
      const found = cells.find((c) => c.cell_id === id);
      return sum + (found ? toMicroUnits(found.quantity.value) : 0n);
    }, 0n);

    const newHold: HoldSummary = {
      hold_id: newHoldId,
      row_version: 1,
      reason_code: input.reason_code.trim(),
      source: { ...input.finding, record: { ...input.finding.record } },
      coverage_cell_ids: affectedCellIds,
      quantity: fromMicroUnits(coveredMicro, scale),
      state: 'active',
      resolution: null,
    };
    holds.push(newHold);

    variant.eligibility_version += 1;
    for (const posId of touchedPositions) {
      positionVersions[posId] = (positionVersions[posId] ?? 1) + 1;
    }

    const updatedGuards = buildGuardsForVariant(
      variant,
      cells.filter((c) => c.dimension.variant_id === variant.variant_id)
    );
    const operationId = allocateUlid();
    const auditEventId = allocateId();
    const committedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000000Z');

    const result: HoldChangeResult = {
      action_result: 'success',
      operation: {
        operation_id: operationId,
        identity: {
          chapter_id: chapterId,
          action_code: 'inventory.record_stock_hold',
          idempotency_key: input.context.idempotency_key,
        },
        replayed: false,
        committed_at: committedAt,
        payload_fingerprint: fingerprint,
      },
      data: {
        hold_id: newHold.hold_id,
        hold_row_version: 1,
        state: 'active',
        source: newHold.source,
        resolution: null,
        reason: newHold.reason_code,
        actor,
        evidence: [...input.evidence],
        affected_cell_ids: [...affectedCellIds],
        guards: updatedGuards,
        physical_quantity_changed: false,
        condition_changed: false,
        movement_ids: [],
        audit_event_id: auditEventId,
        follow_up_task_ids: [],
      },
    };

    operationLedger.push({
      operation_id: operationId,
      chapter_id: chapterId,
      action_code: 'inventory.record_stock_hold',
      idempotency_key: input.context.idempotency_key,
      payload_fingerprint: fingerprint,
      result,
    });

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'HOLD_RECORDED',
      message: `Placed stock hold #${newHold.hold_id} across ${affectedCellIds.length} stock segment(s) with no stock movement.`,
      data: result,
    });
  }

  function clearStockHold(input: ClearHoldInput): P05ActionResult<HoldChangeResult> {
    if (input.context.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'CHAPTER_SCOPE_FORBIDDEN',
        message: 'Clearance target chapter does not match active chapter.',
      });
    }
    if (!input.context.idempotency_key.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key is required for hold clearance.',
      });
    }
    if (!input.reason.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'CLEARANCE_REASON_REQUIRED',
        message: 'Clearance reason is required.',
      });
    }
    if (input.expected_guards.position_versions.length === 0) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'POSITION_PINS_REQUIRED',
        message: 'Current position guard pins are required.',
      });
    }
    if (
      input.evidence.length === 0 ||
      input.evidence.some(
        (pin) =>
          pin.purpose_code !== 'hold_clearance' ||
          !SHA256_HEX_PATTERN.test(pin.evidence.content_hash)
      )
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_EVIDENCE_PIN',
        message: 'Verified clearance evidence with a valid 64-character SHA-256 digest is required.',
      });
    }

    const fingerprint = computeHoldFingerprint(chapterId, 'inventory.clear_stock_hold', input);
    const existingOp = operationLedger.find(
      (entry) =>
        entry.chapter_id === chapterId &&
        entry.action_code === 'inventory.clear_stock_hold' &&
        entry.idempotency_key === input.context.idempotency_key
    );
    if (existingOp) {
      if (existingOp.payload_fingerprint === fingerprint) {
        const replayedResult: HoldChangeResult = {
          ...existingOp.result,
          operation: {
            ...existingOp.result.operation,
            replayed: true,
          },
        };
        return recordOutcome({
          ok: true,
          http_status: 200,
          code: 'HOLD_CLEARANCE_REPLAYED',
          message: `Idempotent replay returned existing clearance for hold #${replayedResult.data.hold_id}.`,
          data: replayedResult,
        });
      }
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key already committed with a different clearance payload.',
      });
    }

    const hold = holds.find((h) => h.hold_id === input.hold_id);
    if (!hold) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'HOLD_NOT_FOUND',
        message: `Hold ${input.hold_id} not found in active chapter.`,
      });
    }
    if (hold.state === 'cleared') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'HOLD_ALREADY_CLEARED',
        message: `Hold #${hold.hold_id} is already cleared.`,
      });
    }
    if (hold.row_version !== input.expected_hold_row_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_HOLD_VERSION',
        message: `Stale hold row version: expected ${input.expected_hold_row_version}, current ${hold.row_version}.`,
      });
    }

    const variant = variants.find((v) => v.variant_id === input.expected_guards.variant_id);
    if (!variant) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'VARIANT_NOT_FOUND',
        message: 'Target catalog variant not found.',
      });
    }
    if (input.expected_guards.eligibility_version !== variant.eligibility_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STALE_GUARD_VERSION',
        message: `Stale variant guard: expected ${input.expected_guards.eligibility_version}, current ${variant.eligibility_version}.`,
      });
    }
    for (const pin of input.expected_guards.position_versions) {
      const currentPosVer = positionVersions[pin.position_id];
      if (currentPosVer === undefined || currentPosVer !== pin.row_version) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'STALE_GUARD_VERSION',
          message: `Stale position guard for position ${pin.position_id}.`,
        });
      }
    }

    const affectedCells = cells.filter((c) => c.active_hold_ids.includes(hold.hold_id));
    const affectedCellIds = affectedCells.map((c) => c.cell_id);
    const touchedPositions = new Set(affectedCells.map((c) => c.dimension.position_id));
    const pinPosSet = new Set(input.expected_guards.position_versions.map((p) => p.position_id));
    for (const posId of touchedPositions) {
      if (!pinPosSet.has(posId)) {
        return recordOutcome({
          ok: false,
          http_status: 409,
          code: 'STALE_GUARD_VERSION',
          message: `Current hold position ${posId} missing from expected_guards.position_versions.`,
        });
      }
    }

    cells = cells.map((c) => {
      if (!c.active_hold_ids.includes(hold.hold_id)) return c;
      const nextHoldIds = c.active_hold_ids.filter((id) => id !== hold.hold_id);
      return {
        ...c,
        active_hold_ids: nextHoldIds,
        blocking_codes: buildBlockingCodes({
          active_hold_ids: nextHoldIds,
          active_reservation_id: c.active_reservation_id,
          non_hold_eligibility: c.non_hold_eligibility,
        }),
      };
    });

    hold.state = 'cleared';
    hold.row_version += 1;
    hold.resolution = { ...input.resolution, record: { ...input.resolution.record } };

    variant.eligibility_version += 1;
    for (const posId of touchedPositions) {
      positionVersions[posId] = (positionVersions[posId] ?? 1) + 1;
    }

    const updatedGuards = buildGuardsForVariant(
      variant,
      cells.filter((c) => c.dimension.variant_id === variant.variant_id)
    );
    const operationId = allocateUlid();
    const auditEventId = allocateId();
    const committedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000000Z');

    const result: HoldChangeResult = {
      action_result: 'success',
      operation: {
        operation_id: operationId,
        identity: {
          chapter_id: chapterId,
          action_code: 'inventory.clear_stock_hold',
          idempotency_key: input.context.idempotency_key,
        },
        replayed: false,
        committed_at: committedAt,
        payload_fingerprint: fingerprint,
      },
      data: {
        hold_id: hold.hold_id,
        hold_row_version: hold.row_version,
        state: 'cleared',
        source: hold.source,
        resolution: hold.resolution,
        reason: input.reason.trim(),
        actor,
        evidence: [...input.evidence],
        affected_cell_ids: affectedCellIds,
        guards: updatedGuards,
        physical_quantity_changed: false,
        condition_changed: false,
        movement_ids: [],
        audit_event_id: auditEventId,
        follow_up_task_ids: [],
      },
    };

    operationLedger.push({
      operation_id: operationId,
      chapter_id: chapterId,
      action_code: 'inventory.clear_stock_hold',
      idempotency_key: input.context.idempotency_key,
      payload_fingerprint: fingerprint,
      result,
    });

    return recordOutcome({
      ok: true,
      http_status: 200,
      code: 'HOLD_CLEARED',
      message: `Cleared stock hold #${hold.hold_id} across ${affectedCellIds.length} stock segment(s) with no stock movement.`,
      data: result,
    });
  }

  function lookupInventoryOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: 'inventory.record_stock_hold' | 'inventory.clear_stock_hold' | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P05ActionResult<UncertainLookupResponse> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Operation scope is outside authorized chapter.',
        data: {
          action_result: 'forbidden',
          operation: {
            operation_id: null,
            outcome: 'unknown',
            committed_at: null,
            replayed: false,
            identity: {
              chapter_id: input.chapter_id,
              action_code: null,
              idempotency_key: null,
            },
          },
          input_policy: 'preserve',
        },
      });
    }

    const found =
      input.query_type === 'by_key'
        ? operationLedger.find(
            (e) =>
              e.chapter_id === chapterId &&
              e.action_code === input.action_code &&
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
        message: `Recovered committed ${found.action_code} operation ${found.operation_id}.`,
        data: {
          action_result: 'success',
          operation: {
            operation_id: found.operation_id,
            outcome: 'committed',
            committed_at: found.result.operation.committed_at,
            replayed: found.result.operation.replayed,
            identity: { ...found.result.operation.identity },
          },
          input_policy: 'preserve',
          result: found.result,
        },
      });
    }

    return recordOutcome({
      ok: false,
      http_status: 200,
      code: 'OPERATION_UNCERTAIN',
      message:
        'No visible terminal result found in chapter ledger. Preserve attempt and key; do not infer zero stock or failed clearance.',
      data: {
        action_result: 'uncertain',
        operation: {
          operation_id: input.operation_id?.trim() || null,
          outcome: 'unknown',
          committed_at: null,
          replayed: false,
          identity: {
            chapter_id: chapterId,
            action_code: input.action_code ?? null,
            idempotency_key: input.idempotency_key?.trim() || null,
          },
        },
        input_policy: 'preserve',
      },
    });
  }

  return {
    getSnapshot: () => ({
      chapter_id: chapterId,
      chapter_name: chapterName,
      units: units.map((u) => ({ ...u })),
      locations: locations.map((l) => ({ ...l })),
      variants: variants.map((v) => ({ ...v })),
      cells: cells.map((c) => ({
        ...c,
        active_hold_ids: [...c.active_hold_ids],
        blocking_codes: [...c.blocking_codes],
      })),
      holds: holds.map((h) => ({ ...h, coverage_cell_ids: [...h.coverage_cell_ids] })),
      reservations: reservations.map((r) => ({ ...r, coverage_cell_ids: [...r.coverage_cell_ids] })),
      inbound: inbound.map((i) => ({ ...i })),
      position_versions: { ...positionVersions },
      operation_ledger: [...operationLedger],
      last_query_result: lastQueryResult,
      last_action: lastAction,
    }),
    registerUnit,
    registerLocation,
    registerVariant,
    prepareItemPolicy,
    approveItemPolicy,
    attemptDirectBalanceSetter,
    queryEligibility,
    recordStockHold,
    clearStockHold,
    lookupInventoryOperation,
  };
}
