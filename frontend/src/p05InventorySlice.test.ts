import { describe, expect, it } from 'vitest';
import {
  createP05InventoryEngine,
  fromMicroUnits,
  isValidUnitQuantity,
  toMicroUnits,
} from './p05InventorySlice';
import type {
  ClearHoldInput,
  CoverageCell,
  CreateHoldInput,
  Dimension,
  HoldSummary,
  InboundLine,
  ReservationSummary,
} from './p05InventorySlice';

const VALID_FINDING_HASH = 'a'.repeat(64);
const VALID_CLEAR_HASH = 'b'.repeat(64);
const MATERIAL_HASH = 'bbd7495ecab1a3ce691c09aa273d58b7247c308d4842c5048ba5f70b1feaf128';

function makeDimension(overrides?: Partial<Dimension>): Dimension {
  return {
    chapter_id: '1',
    variant_id: '71',
    unit_id: '61',
    quantity_scale: 0,
    lot_id: '1201',
    position_id: '1301',
    location_id: '91',
    custody_assignment_id: '101',
    custodian_user_id: null,
    custody_kind: 'stockroom',
    condition_code: 'usable',
    lot_kind: 'accepted',
    restriction_version_id: '201',
    source: {
      chapter_id: '1',
      record: { id: '901', kind: 'RM' },
      line_id: '601',
      line_kind: 'RM',
      variant_id: '71',
    },
    ...overrides,
  };
}

function makeDefaultQuery(variantId = '71', unitId = '61', scale = 0, qty = '2') {
  return {
    chapter_id: '1',
    variant_id: variantId,
    unit_id: unitId,
    purpose: {
      use: 'internal' as const,
      event_id: null,
      requesting_unit_id: '81',
      intended_use_at: '2026-10-24T08:00:00.000000Z',
    },
    requested_quantity: { value: qty, quantity_scale: scale },
    lot_ids: [] as string[],
    location_ids: [] as string[],
  };
}

function makeCreateHoldInput(overrides?: {
  idempotency_key?: string;
  eligibility_version?: number;
  position_versions?: Array<{ position_id: string; row_version: number }>;
  coverage?: CreateHoldInput['coverage'];
  reason_code?: string;
  purpose_code?: 'hold_finding' | 'hold_clearance';
  variant_id?: string;
}): CreateHoldInput {
  return {
    context: {
      chapter_id: '1',
      action_code: 'inventory.record_stock_hold',
      idempotency_key: overrides?.idempotency_key ?? 'hold-key-01',
      record: { id: '9007199254740993', kind: 'IPC' },
      expected_row_version: 7,
      expected_material_version: 1,
    },
    finding: {
      chapter_id: '1',
      record: { id: '9007199254740993', kind: 'IPC' },
      material_version: 1,
      material_hash: MATERIAL_HASH,
    },
    reason_code: overrides?.reason_code ?? 'damage_review',
    coverage: overrides?.coverage ?? [
      { lot_id: '1201', position_id: '1301', start: '0', end: '3' },
    ],
    expected_guards: {
      variant_id: overrides?.variant_id ?? '71',
      eligibility_version: overrides?.eligibility_version ?? 4,
      position_versions: overrides?.position_versions ?? [{ position_id: '1301', row_version: 4 }],
    },
    evidence: [
      {
        binding_id: '8801',
        target: {
          chapter_id: '1',
          record: { id: '9007199254740993', kind: 'IPC' },
          material_version: 1,
          material_hash: MATERIAL_HASH,
        },
        evidence: {
          evidence_id: '7701',
          storage_version: 'v1',
          content_hash: VALID_FINDING_HASH,
          capture_mode: 'paper_scan',
        },
        purpose_code: (overrides?.purpose_code ?? 'hold_finding') as 'hold_finding',
      },
    ],
  };
}

function makeClearHoldInput(overrides: {
  hold_id: string;
  idempotency_key?: string;
  expected_hold_row_version?: number;
  eligibility_version: number;
  position_versions: Array<{ position_id: string; row_version: number }>;
  purpose_code?: 'hold_finding' | 'hold_clearance';
  reason?: string;
}): ClearHoldInput {
  return {
    context: {
      chapter_id: '1',
      action_code: 'inventory.clear_stock_hold',
      idempotency_key: overrides.idempotency_key ?? `clear-${overrides.hold_id}`,
      record: { id: '9007199254740994', kind: 'IPC' },
      expected_row_version: 8,
      expected_material_version: 1,
    },
    hold_id: overrides.hold_id,
    expected_hold_row_version: overrides.expected_hold_row_version ?? 1,
    resolution: {
      chapter_id: '1',
      record: { id: '9007199254740994', kind: 'IPC' },
      material_version: 1,
      material_hash: MATERIAL_HASH,
    },
    reason: overrides.reason ?? 'Inspection cleared remaining units',
    expected_guards: {
      variant_id: '71',
      eligibility_version: overrides.eligibility_version,
      position_versions: overrides.position_versions,
    },
    evidence: [
      {
        binding_id: '8802',
        target: {
          chapter_id: '1',
          record: { id: '9007199254740994', kind: 'IPC' },
          material_version: 1,
          material_hash: MATERIAL_HASH,
        },
        evidence: {
          evidence_id: '7702',
          storage_version: 'v1',
          content_hash: VALID_CLEAR_HASH,
          capture_mode: 'paper_scan',
        },
        purpose_code: (overrides.purpose_code ?? 'hold_clearance') as 'hold_clearance',
      },
    ],
  };
}

describe('p05InventorySlice — Catalog, 7-View Eligibility, Disjoint Cells & Hold Clearance', () => {
  it('initializes with zero default catalog units, locations, variants, cells, or holds', () => {
    const engine = createP05InventoryEngine();
    const snap = engine.getSnapshot();
    expect(snap.units).toEqual([]);
    expect(snap.locations).toEqual([]);
    expect(snap.variants).toEqual([]);
    expect(snap.cells).toEqual([]);
    expect(snap.holds).toEqual([]);
    expect(snap.reservations).toEqual([]);
    expect(snap.inbound).toEqual([]);
    expect(snap.operation_ledger).toEqual([]);
  });

  it('enforces exact DECIMAL(20,6) UnitQuantity precision across scales 0..6', () => {
    expect(isValidUnitQuantity({ value: '2', quantity_scale: 0 })).toBe(true);
    expect(isValidUnitQuantity({ value: '2.000000', quantity_scale: 0 })).toBe(true);
    expect(isValidUnitQuantity({ value: '1.5', quantity_scale: 0 })).toBe(false);
    expect(isValidUnitQuantity({ value: '1e2', quantity_scale: 0 })).toBe(false);
    expect(isValidUnitQuantity({ value: '1.250', quantity_scale: 3 })).toBe(true);
    expect(isValidUnitQuantity({ value: '1.2501', quantity_scale: 3 })).toBe(false);
    expect(isValidUnitQuantity({ value: '2\n', quantity_scale: 0 })).toBe(false);
    expect(toMicroUnits('1.250')).toBe(1250000n);
    expect(fromMicroUnits(875000n, 3)).toEqual({ value: '0.875', quantity_scale: 3 });
  });

  it('forbids direct balance setters and blocks queries until item policy is approved (query-zero-stock)', () => {
    const engine = createP05InventoryEngine();
    const unitRes = engine.registerUnit({ unit_id: '61', code: 'PCS', name: 'Pieces', quantity_scale: 0 });
    expect(unitRes.ok).toBe(true);

    const locRes = engine.registerLocation({
      location_id: '91',
      code: 'STR-MAIN',
      name: 'Main Stockroom',
      custody_kind: 'stockroom',
    });
    expect(locRes.ok).toBe(true);

    const varRes = engine.registerVariant({
      variant_id: '71',
      sku: 'YSP-KIT-01',
      item_name: 'Relief Kit',
      variant_label: 'Standard',
      unit_id: '61',
    });
    expect(varRes.ok).toBe(true);

    const setterRes = engine.attemptDirectBalanceSetter({
      variant_id: '71',
      arbitrary_quantity: '100',
    });
    expect(setterRes.ok).toBe(false);
    expect(setterRes.http_status).toBe(403);
    expect(setterRes.code).toBe('DIRECT_BALANCE_SETTER_FORBIDDEN');

    const unapprovedQuery = engine.queryEligibility(makeDefaultQuery());
    expect(unapprovedQuery.ok).toBe(false);
    expect(unapprovedQuery.http_status).toBe(409);
    expect(unapprovedQuery.code).toBe('POLICY_NOT_EFFECTIVE');

    const draftRes = engine.prepareItemPolicy({
      variant_id: '71',
      policy_version_id: '301',
      rop_threshold_value: '8',
    });
    expect(draftRes.ok).toBe(true);

    const nonDutyApprove = engine.approveItemPolicy({
      variant_id: '71',
      policy_version_id: '301',
      approver_duty: 'RECEIVING',
    });
    expect(nonDutyApprove.ok).toBe(false);
    expect(nonDutyApprove.http_status).toBe(403);

    const approveRes = engine.approveItemPolicy({
      variant_id: '71',
      policy_version_id: '301',
      approver_duty: 'CHAPTER_HEAD',
    });
    expect(approveRes.ok).toBe(true);

    const zeroQuery = engine.queryEligibility(makeDefaultQuery());
    expect(zeroQuery.ok).toBe(true);
    expect(zeroQuery.code).toBe('ELIGIBILITY_ZERO_STOCK');
    expect(zeroQuery.data?.views).toEqual({
      usable_stockroom_on_hand: { value: '0', quantity_scale: 0 },
      available_to_allocate: { value: '0', quantity_scale: 0 },
      rf_reserved: { value: '0', quantity_scale: 0 },
      so_reserved: { value: '0', quantity_scale: 0 },
      booth_custody: { value: '0', quantity_scale: 0 },
      quarantined_rejected: { value: '0', quantity_scale: 0 },
      inbound_open_po: { value: '0', quantity_scale: 0 },
    });
    expect(zeroQuery.data?.rop.low_stock).toBe(true);
    expect(zeroQuery.data?.shortage.uncovered_quantity.value).toBe('2');
  });

  it('reconciles rop-ten fixture and union/shortage math without double counting overlap', () => {
    const cells: CoverageCell[] = [
      {
        cell_id: '2001',
        dimension: makeDimension(),
        start: '0',
        end: '4',
        quantity: { value: '4', quantity_scale: 0 },
        active_hold_ids: ['2101'],
        active_reservation_id: null,
        non_hold_eligibility: 'eligible',
        blocking_codes: ['ACTIVE_HOLD'],
      },
      {
        cell_id: '2002',
        dimension: makeDimension(),
        start: '4',
        end: '6',
        quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: '2401',
        non_hold_eligibility: 'eligible',
        blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2003',
        dimension: makeDimension(),
        start: '6',
        end: '9',
        quantity: { value: '3', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: '2402',
        non_hold_eligibility: 'eligible',
        blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2004',
        dimension: makeDimension(),
        start: '9',
        end: '10',
        quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: null,
        non_hold_eligibility: 'eligible',
        blocking_codes: [],
      },
    ];
    // Adjust: rop-ten case has rf=4, so=3, held_union=4, intersection=2, available=1 =>
    // Put 2 units held-only + 2 units held+RF-reserved + 2 units RF-only + 3 units SO-only + 1 unit free
    const ropTenCells: CoverageCell[] = [
      {
        cell_id: '2001',
        dimension: makeDimension(),
        start: '0',
        end: '2',
        quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: ['2101'],
        active_reservation_id: null,
        non_hold_eligibility: 'eligible',
        blocking_codes: ['ACTIVE_HOLD'],
      },
      {
        cell_id: '2002',
        dimension: makeDimension(),
        start: '2',
        end: '4',
        quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: ['2101'],
        active_reservation_id: '2401',
        non_hold_eligibility: 'eligible',
        blocking_codes: ['ACTIVE_HOLD', 'RESERVED'],
      },
      {
        cell_id: '2003',
        dimension: makeDimension(),
        start: '4',
        end: '6',
        quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: '2401',
        non_hold_eligibility: 'eligible',
        blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2004',
        dimension: makeDimension(),
        start: '6',
        end: '9',
        quantity: { value: '3', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: '2402',
        non_hold_eligibility: 'eligible',
        blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2005',
        dimension: makeDimension(),
        start: '9',
        end: '10',
        quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: [],
        active_reservation_id: null,
        non_hold_eligibility: 'eligible',
        blocking_codes: [],
      },
    ];
    void cells;
    const holds: HoldSummary[] = [
      {
        hold_id: '2101',
        row_version: 1,
        reason_code: 'qc_hold',
        source: { chapter_id: '1', record: { id: '9001', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
        coverage_cell_ids: ['2001', '2002'],
        quantity: { value: '4', quantity_scale: 0 },
      },
    ];
    const reservations: ReservationSummary[] = [
      {
        reservation_id: '2401',
        demand_line: { chapter_id: '1', record: { id: '3101', kind: 'RF' }, line_id: '3201', variant_id: '71' },
        kind: 'RF',
        protection: 'rf',
        coverage_cell_ids: ['2002', '2003'],
        quantity: { value: '4', quantity_scale: 0 },
        expires_at: null,
      },
      {
        reservation_id: '2402',
        demand_line: { chapter_id: '1', record: { id: '3102', kind: 'SO' }, line_id: '3202', variant_id: '71' },
        kind: 'SO',
        protection: 'paid',
        coverage_cell_ids: ['2004'],
        quantity: { value: '3', quantity_scale: 0 },
        expires_at: null,
      },
    ];

    const engine = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71',
        chapter_id: '1',
        sku: 'ITEM-71',
        item_name: 'Test Item',
        variant_label: 'Std',
        unit_id: '61',
        quantity_scale: 0,
        eligibility_version: 4,
        policy_status: 'approved',
        policy_version_id: '301',
        draft_rop_threshold: { value: '8', quantity_scale: 0 },
        approved_rop_threshold: { value: '8', quantity_scale: 0 },
        restriction_version_ids: ['201'],
      }],
      cells: ropTenCells,
      holds,
      reservations,
      position_versions: { '1301': 4 },
    });

    const res = engine.queryEligibility(makeDefaultQuery('71', '61', 0, '2'));
    expect(res.ok).toBe(true);
    expect(res.data?.views.usable_stockroom_on_hand.value).toBe('10');
    expect(res.data?.views.rf_reserved.value).toBe('4');
    expect(res.data?.views.so_reserved.value).toBe('3');
    expect(res.data?.union.active_held_union.value).toBe('4');
    expect(res.data?.union.held_reserved_intersection.value).toBe('2');
    expect(res.data?.views.available_to_allocate.value).toBe('1');
    expect(res.data?.rop.low_stock).toBe(false);
    expect(res.data?.shortage.uncovered_quantity.value).toBe('1');
  });

  it('reconciles same-three -> clear-first -> clear-last and reserved-three without releasing reservations', () => {
    const engineSameThree = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71', chapter_id: '1', sku: 'ITEM-71', item_name: 'Same Three', variant_label: 'Std',
        unit_id: '61', quantity_scale: 0, eligibility_version: 4, policy_status: 'approved', policy_version_id: '301',
        draft_rop_threshold: { value: '8', quantity_scale: 0 }, approved_rop_threshold: { value: '8', quantity_scale: 0 },
        restriction_version_ids: ['201'],
      }],
      cells: [
        {
          cell_id: '2001', dimension: makeDimension(), start: '0', end: '3', quantity: { value: '3', quantity_scale: 0 },
          active_hold_ids: ['A', 'B'], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD'],
        },
        {
          cell_id: '2002', dimension: makeDimension(), start: '3', end: '10', quantity: { value: '7', quantity_scale: 0 },
          active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
        },
      ],
      holds: [
        {
          hold_id: 'A', row_version: 1, reason_code: 'hold_a',
          source: { chapter_id: '1', record: { id: '9001', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
          coverage_cell_ids: ['2001'], quantity: { value: '3', quantity_scale: 0 },
        },
        {
          hold_id: 'B', row_version: 1, reason_code: 'hold_b',
          source: { chapter_id: '1', record: { id: '9002', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
          coverage_cell_ids: ['2001'], quantity: { value: '3', quantity_scale: 0 },
        },
      ],
      position_versions: { '1301': 4 },
    });

    const s0 = engineSameThree.queryEligibility(makeDefaultQuery())!;
    expect(s0.data?.union.active_held_union.value).toBe('3');
    expect(s0.data?.views.available_to_allocate.value).toBe('7');

    const clearA = engineSameThree.clearStockHold(
      makeClearHoldInput({
        hold_id: 'A',
        eligibility_version: 4,
        position_versions: [{ position_id: '1301', row_version: 4 }],
      })
    );
    expect(clearA.ok).toBe(true);
    expect(clearA.data?.data.movement_ids).toEqual([]);
    expect(clearA.data?.data.physical_quantity_changed).toBe(false);
    expect(clearA.data?.data.condition_changed).toBe(false);

    const s1 = engineSameThree.queryEligibility(makeDefaultQuery());
    expect(s1.data?.union.active_held_union.value).toBe('3');
    expect(s1.data?.views.available_to_allocate.value).toBe('7');

    const clearB = engineSameThree.clearStockHold(
      makeClearHoldInput({
        hold_id: 'B',
        eligibility_version: 5,
        position_versions: [{ position_id: '1301', row_version: 5 }],
      })
    );
    expect(clearB.ok).toBe(true);

    const s2 = engineSameThree.queryEligibility(makeDefaultQuery());
    expect(s2.data?.union.active_held_union.value).toBe('0');
    expect(s2.data?.views.available_to_allocate.value).toBe('10');

    // Now test reserved-three: 3 units are paid SO-reserved AND held by A+B; clearing A & B preserves reservation
    const engineReservedThree = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71', chapter_id: '1', sku: 'ITEM-71', item_name: 'Reserved Three', variant_label: 'Std',
        unit_id: '61', quantity_scale: 0, eligibility_version: 4, policy_status: 'approved', policy_version_id: '301',
        draft_rop_threshold: { value: '8', quantity_scale: 0 }, approved_rop_threshold: { value: '8', quantity_scale: 0 },
        restriction_version_ids: ['201'],
      }],
      cells: [
        {
          cell_id: '2001', dimension: makeDimension(), start: '0', end: '3', quantity: { value: '3', quantity_scale: 0 },
          active_hold_ids: ['A', 'B'], active_reservation_id: '2402', non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD', 'RESERVED'],
        },
        {
          cell_id: '2002', dimension: makeDimension(), start: '3', end: '10', quantity: { value: '7', quantity_scale: 0 },
          active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
        },
      ],
      holds: [
        {
          hold_id: 'A', row_version: 1, reason_code: 'hold_a',
          source: { chapter_id: '1', record: { id: '9001', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
          coverage_cell_ids: ['2001'], quantity: { value: '3', quantity_scale: 0 },
        },
        {
          hold_id: 'B', row_version: 1, reason_code: 'hold_b',
          source: { chapter_id: '1', record: { id: '9002', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
          coverage_cell_ids: ['2001'], quantity: { value: '3', quantity_scale: 0 },
        },
      ],
      reservations: [
        {
          reservation_id: '2402',
          demand_line: { chapter_id: '1', record: { id: '3102', kind: 'SO' }, line_id: '3202', variant_id: '71' },
          kind: 'SO', protection: 'paid', coverage_cell_ids: ['2001'], quantity: { value: '3', quantity_scale: 0 }, expires_at: null,
        },
      ],
      position_versions: { '1301': 4 },
    });

    engineReservedThree.clearStockHold(makeClearHoldInput({ hold_id: 'A', eligibility_version: 4, position_versions: [{ position_id: '1301', row_version: 4 }] }));
    const afterFirst = engineReservedThree.queryEligibility(makeDefaultQuery());
    expect(afterFirst.data?.views.so_reserved.value).toBe('3');
    expect(afterFirst.data?.union.active_held_union.value).toBe('3');
    expect(afterFirst.data?.union.held_reserved_intersection.value).toBe('3');
    expect(afterFirst.data?.views.available_to_allocate.value).toBe('7');

    engineReservedThree.clearStockHold(makeClearHoldInput({ hold_id: 'B', eligibility_version: 5, position_versions: [{ position_id: '1301', row_version: 5 }] }));
    const afterLast = engineReservedThree.queryEligibility(makeDefaultQuery());
    expect(afterLast.data?.views.so_reserved.value).toBe('3');
    expect(afterLast.data?.union.active_held_union.value).toBe('0');
    expect(afterLast.data?.union.held_reserved_intersection.value).toBe('0');
    expect(afterLast.data?.views.available_to_allocate.value).toBe('7');
  });

  it('splits live coverage cell on proper subset partial-overlap ([0,3) and [2,4) of [0,10)) and clears first cleanly', () => {
    const engine = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71', chapter_id: '1', sku: 'ITEM-71', item_name: 'Partial Overlap', variant_label: 'Std',
        unit_id: '61', quantity_scale: 0, eligibility_version: 1, policy_status: 'approved', policy_version_id: '301',
        draft_rop_threshold: { value: '5', quantity_scale: 0 }, approved_rop_threshold: { value: '5', quantity_scale: 0 },
        restriction_version_ids: ['201'],
      }],
      cells: [
        {
          cell_id: '2001', dimension: makeDimension(), start: '0', end: '10', quantity: { value: '10', quantity_scale: 0 },
          active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
        },
      ],
      position_versions: { '1301': 1 },
    });

    const holdARes = engine.recordStockHold(
      makeCreateHoldInput({
        idempotency_key: 'hold-a',
        eligibility_version: 1,
        position_versions: [{ position_id: '1301', row_version: 1 }],
        coverage: [{ lot_id: '1201', position_id: '1301', start: '0', end: '3' }],
        reason_code: 'reason_a',
      })
    );
    expect(holdARes.ok).toBe(true);
    const holdAId = holdARes.data!.data.hold_id;

    const holdBRes = engine.recordStockHold(
      makeCreateHoldInput({
        idempotency_key: 'hold-b',
        eligibility_version: 2,
        position_versions: [{ position_id: '1301', row_version: 2 }],
        coverage: [{ lot_id: '1201', position_id: '1301', start: '2', end: '4' }],
        reason_code: 'reason_b',
      })
    );
    expect(holdBRes.ok).toBe(true);

    const midQuery = engine.queryEligibility(makeDefaultQuery());
    expect(midQuery.ok).toBe(true);
    expect(midQuery.data?.cells.map((c) => `${c.start}-${c.end}:${c.active_hold_ids.length}`)).toEqual([
      '0-2:1',
      '2-3:2',
      '3-4:1',
      '4-10:0',
    ]);
    expect(midQuery.data?.union.active_held_union.value).toBe('4');
    expect(midQuery.data?.views.available_to_allocate.value).toBe('6');

    const clearARes = engine.clearStockHold(
      makeClearHoldInput({
        hold_id: holdAId,
        eligibility_version: 3,
        position_versions: [{ position_id: '1301', row_version: 3 }],
      })
    );
    expect(clearARes.ok).toBe(true);

    const afterClearQuery = engine.queryEligibility(makeDefaultQuery());
    expect(afterClearQuery.data?.union.active_held_union.value).toBe('2');
    expect(afterClearQuery.data?.views.available_to_allocate.value).toBe('8');
  });

  it('reconciles mixed_stock_view (all 7 views + restricted reserved edge) and fractional_stock_view (scale 3)', () => {
    const mixedInbound: InboundLine[] = [
      {
        po_line: { chapter_id: '1', record: { id: '3301', kind: 'PO' }, line_id: '3302', variant_id: '71' },
        open_quantity: { value: '5', quantity_scale: 0 },
        expected_location_id: '91',
      },
    ];
    const mixedCells: CoverageCell[] = [
      {
        cell_id: '2001', dimension: makeDimension({ lot_id: '1201', position_id: '1301' }),
        start: '0', end: '1', quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: ['2101'], active_reservation_id: '2401', non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD', 'RESERVED'],
      },
      {
        cell_id: '2002', dimension: makeDimension({ lot_id: '1201', position_id: '1301' }),
        start: '1', end: '2', quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: '2401', non_hold_eligibility: 'eligible', blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2003', dimension: makeDimension({ lot_id: '1201', position_id: '1301' }),
        start: '2', end: '4', quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: '2402', non_hold_eligibility: 'eligible', blocking_codes: ['RESERVED'],
      },
      {
        cell_id: '2004', dimension: makeDimension({ lot_id: '1201', position_id: '1301' }),
        start: '4', end: '5', quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: ['2101'], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD'],
      },
      {
        cell_id: '2005', dimension: makeDimension({ lot_id: '1201', position_id: '1301' }),
        start: '5', end: '7', quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
      },
      {
        cell_id: '2006', dimension: makeDimension({ lot_id: '1210', position_id: '1310', restriction_version_id: '202' }),
        start: '0', end: '1', quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: '2403', non_hold_eligibility: 'restricted', blocking_codes: ['RESERVED', 'DONOR_RESTRICTION'],
      },
      {
        cell_id: '2007', dimension: makeDimension({ lot_id: '1210', position_id: '1310', restriction_version_id: '202' }),
        start: '1', end: '3', quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'restricted', blocking_codes: ['DONOR_RESTRICTION'],
      },
      {
        cell_id: '2010', dimension: makeDimension({ lot_id: '1202', position_id: '1302', condition_code: 'damaged', lot_kind: 'nonusable' }),
        start: '0', end: '2', quantity: { value: '2', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'nonusable', blocking_codes: ['NONUSABLE'],
      },
      {
        cell_id: '2011', dimension: makeDimension({ lot_id: '1203', position_id: '1303', location_id: '92', custody_kind: 'booth', custody_assignment_id: '102', custodian_user_id: '12' }),
        start: '0', end: '3', quantity: { value: '3', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'booth_custody', blocking_codes: ['BOOTH_CUSTODY'],
      },
      {
        cell_id: '2012', dimension: makeDimension({ lot_id: '1204', position_id: '1304', location_id: '92', custody_kind: 'booth', condition_code: 'damaged', lot_kind: 'nonusable', custody_assignment_id: '102', custodian_user_id: '12' }),
        start: '0', end: '1', quantity: { value: '1', quantity_scale: 0 },
        active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'nonusable', blocking_codes: ['NONUSABLE'],
      },
    ];

    const mixedEngine = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71', chapter_id: '1', sku: 'ITEM-71', item_name: 'Mixed', variant_label: 'Std',
        unit_id: '61', quantity_scale: 0, eligibility_version: 4, policy_status: 'approved', policy_version_id: '302',
        draft_rop_threshold: { value: '8', quantity_scale: 0 }, approved_rop_threshold: { value: '8', quantity_scale: 0 },
        restriction_version_ids: ['201', '202'],
      }],
      cells: mixedCells,
      holds: [
        {
          hold_id: '2101', row_version: 1, reason_code: 'damage_review',
          source: { chapter_id: '1', record: { id: '9007199254740993', kind: 'IPC' }, material_version: 1, material_hash: MATERIAL_HASH },
          coverage_cell_ids: ['2001', '2004'], quantity: { value: '2', quantity_scale: 0 },
        },
      ],
      reservations: [
        { reservation_id: '2401', demand_line: { chapter_id: '1', record: { id: '3101', kind: 'RF' }, line_id: '3201', variant_id: '71' }, kind: 'RF', protection: 'rf', coverage_cell_ids: ['2001', '2002'], quantity: { value: '2', quantity_scale: 0 }, expires_at: null },
        { reservation_id: '2402', demand_line: { chapter_id: '1', record: { id: '3102', kind: 'SO' }, line_id: '3202', variant_id: '71' }, kind: 'SO', protection: 'paid', coverage_cell_ids: ['2003'], quantity: { value: '2', quantity_scale: 0 }, expires_at: null },
        { reservation_id: '2403', demand_line: { chapter_id: '1', record: { id: '3102', kind: 'SO' }, line_id: '3202', variant_id: '71' }, kind: 'SO', protection: 'paid', coverage_cell_ids: ['2006'], quantity: { value: '1', quantity_scale: 0 }, expires_at: null },
      ],
      inbound: mixedInbound,
    });

    const mixedRes = mixedEngine.queryEligibility(makeDefaultQuery('71', '61', 0, '2'));
    expect(mixedRes.ok).toBe(true);
    expect(mixedRes.data?.views).toEqual({
      usable_stockroom_on_hand: { value: '10', quantity_scale: 0 },
      available_to_allocate: { value: '2', quantity_scale: 0 },
      rf_reserved: { value: '2', quantity_scale: 0 },
      so_reserved: { value: '3', quantity_scale: 0 },
      booth_custody: { value: '4', quantity_scale: 0 },
      quarantined_rejected: { value: '3', quantity_scale: 0 },
      inbound_open_po: { value: '5', quantity_scale: 0 },
    });
    expect(mixedRes.data?.union).toEqual({
      eligible_before_holds_and_reservations: { value: '7', quantity_scale: 0 },
      active_held_union: { value: '2', quantity_scale: 0 },
      reserved_in_eligible: { value: '4', quantity_scale: 0 },
      held_reserved_intersection: { value: '1', quantity_scale: 0 },
      blocked_union: { value: '5', quantity_scale: 0 },
      available_to_allocate: { value: '2', quantity_scale: 0 },
    });

    // Filtered lot query: keeps chapter-wide rop.usable_on_hand=10 even when lot_ids=['1210'] filters physical on-hand to 3 & drops inbound PO
    const filteredRop = mixedEngine.queryEligibility({
      ...makeDefaultQuery('71', '61', 0, '2'),
      lot_ids: ['1210'],
    });
    expect(filteredRop.ok).toBe(true);
    expect(filteredRop.data?.views.usable_stockroom_on_hand.value).toBe('3');
    expect(filteredRop.data?.views.inbound_open_po.value).toBe('0');
    expect(filteredRop.data?.rop.usable_on_hand.value).toBe('10');
    expect(filteredRop.data?.rop.low_stock).toBe(false);

    // Fractional stock view (quantity_scale = 3)
    const fracEngine = createP05InventoryEngine({
      units: [{ unit_id: '62', chapter_id: '1', code: 'KG', name: 'Kilogram', quantity_scale: 3 }],
      variants: [{
        variant_id: '72', chapter_id: '1', sku: 'RICE-72', item_name: 'Rice', variant_label: 'KG',
        unit_id: '62', quantity_scale: 3, eligibility_version: 1, policy_status: 'approved', policy_version_id: '303',
        draft_rop_threshold: { value: '1.000', quantity_scale: 3 }, approved_rop_threshold: { value: '1.000', quantity_scale: 3 },
        restriction_version_ids: ['201'],
      }],
      cells: [
        {
          cell_id: '2001', dimension: makeDimension({ variant_id: '72', unit_id: '62', quantity_scale: 3 }),
          start: '0', end: '0.125', quantity: { value: '0.125', quantity_scale: 3 },
          active_hold_ids: ['2101', '2102'], active_reservation_id: '2402', non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD', 'RESERVED'],
        },
        {
          cell_id: '2002', dimension: makeDimension({ variant_id: '72', unit_id: '62', quantity_scale: 3 }),
          start: '0.125', end: '0.375', quantity: { value: '0.250', quantity_scale: 3 },
          active_hold_ids: ['2101', '2102'], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: ['ACTIVE_HOLD'],
        },
        {
          cell_id: '2003', dimension: makeDimension({ variant_id: '72', unit_id: '62', quantity_scale: 3 }),
          start: '0.375', end: '1.250', quantity: { value: '0.875', quantity_scale: 3 },
          active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
        },
      ],
    });
    const fracRes = fracEngine.queryEligibility(makeDefaultQuery('72', '62', 3, '1.000'));
    expect(fracRes.ok).toBe(true);
    expect(fracRes.data?.views.usable_stockroom_on_hand.value).toBe('1.250');
    expect(fracRes.data?.union.active_held_union.value).toBe('0.375');
    expect(fracRes.data?.union.held_reserved_intersection.value).toBe('0.125');
    expect(fracRes.data?.views.available_to_allocate.value).toBe('0.875');
  });

  it('enforces hold/clearance guard versions, evidence purpose mismatch, idempotency replay/conflict, and uncertain lookup', () => {
    const engine = createP05InventoryEngine({
      units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
      variants: [{
        variant_id: '71', chapter_id: '1', sku: 'ITEM-71', item_name: 'Guards', variant_label: 'Std',
        unit_id: '61', quantity_scale: 0, eligibility_version: 4, policy_status: 'approved', policy_version_id: '301',
        draft_rop_threshold: { value: '5', quantity_scale: 0 }, approved_rop_threshold: { value: '5', quantity_scale: 0 },
        restriction_version_ids: ['201'],
      }],
      cells: [
        {
          cell_id: '2001', dimension: makeDimension(), start: '0', end: '10', quantity: { value: '10', quantity_scale: 0 },
          active_hold_ids: [], active_reservation_id: null, non_hold_eligibility: 'eligible', blocking_codes: [],
        },
      ],
      position_versions: { '1301': 4 },
    });

    // Purpose mismatch rejected
    const badPurposeCreate = engine.recordStockHold(
      makeCreateHoldInput({ purpose_code: 'hold_clearance' })
    );
    expect(badPurposeCreate.ok).toBe(false);
    expect(badPurposeCreate.http_status).toBe(422);
    expect(badPurposeCreate.code).toBe('INVALID_EVIDENCE_PIN');

    // Stale guard rejected
    const staleCreate = engine.recordStockHold(
      makeCreateHoldInput({ eligibility_version: 3 })
    );
    expect(staleCreate.ok).toBe(false);
    expect(staleCreate.http_status).toBe(409);
    expect(staleCreate.code).toBe('STALE_GUARD_VERSION');

    // Valid create
    const validCreate = engine.recordStockHold(
      makeCreateHoldInput({ idempotency_key: 'hold-guard-01', eligibility_version: 4 })
    );
    expect(validCreate.ok).toBe(true);
    const createdHoldId = validCreate.data!.data.hold_id;
    const opUlid = validCreate.data!.operation.operation_id;

    // Replay same key & payload after guard bumped STILL succeeds (replay checked before guard!)
    const replayCreate = engine.recordStockHold(
      makeCreateHoldInput({ idempotency_key: 'hold-guard-01', eligibility_version: 4 })
    );
    expect(replayCreate.ok).toBe(true);
    expect(replayCreate.code).toBe('HOLD_RECORD_REPLAYED');
    expect(replayCreate.data?.operation.replayed).toBe(true);

    // Same key with changed reason triggers IDEMPOTENCY_CONFLICT
    const conflictCreate = engine.recordStockHold(
      makeCreateHoldInput({ idempotency_key: 'hold-guard-01', eligibility_version: 4, reason_code: 'different' })
    );
    expect(conflictCreate.ok).toBe(false);
    expect(conflictCreate.http_status).toBe(409);
    expect(conflictCreate.code).toBe('IDEMPOTENCY_CONFLICT');

    // Clear with hold_finding evidence rejected
    const badPurposeClear = engine.clearStockHold(
      makeClearHoldInput({
        hold_id: createdHoldId,
        eligibility_version: 5,
        position_versions: [{ position_id: '1301', row_version: 5 }],
        purpose_code: 'hold_finding',
      })
    );
    expect(badPurposeClear.ok).toBe(false);
    expect(badPurposeClear.http_status).toBe(422);

    // Valid clear
    const validClear = engine.clearStockHold(
      makeClearHoldInput({
        hold_id: createdHoldId,
        idempotency_key: 'clear-guard-01',
        eligibility_version: 5,
        position_versions: [{ position_id: '1301', row_version: 5 }],
      })
    );
    expect(validClear.ok).toBe(true);

    // New key attempting second clear fails HOLD_ALREADY_CLEARED
    const duplicateClear = engine.clearStockHold(
      makeClearHoldInput({
        hold_id: createdHoldId,
        idempotency_key: 'clear-guard-02',
        eligibility_version: 6,
        position_versions: [{ position_id: '1301', row_version: 6 }],
      })
    );
    expect(duplicateClear.ok).toBe(false);
    expect(duplicateClear.http_status).toBe(409);
    expect(duplicateClear.code).toBe('HOLD_ALREADY_CLEARED');

    // Scoped lookup by key, by ULID, and unseen key -> uncertain with input_policy: preserve
    const byKey = engine.lookupInventoryOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'inventory.record_stock_hold',
      idempotency_key: 'hold-guard-01',
    });
    expect(byKey.ok).toBe(true);
    expect(byKey.data?.operation.operation_id).toBe(opUlid);

    const byUlid = engine.lookupInventoryOperation({
      query_type: 'by_ulid',
      chapter_id: '1',
      operation_id: opUlid,
    });
    expect(byUlid.ok).toBe(true);

    const unseen = engine.lookupInventoryOperation({
      query_type: 'by_key',
      chapter_id: '1',
      action_code: 'inventory.clear_stock_hold',
      idempotency_key: 'lost-response-99',
    });
    expect(unseen.ok).toBe(false);
    expect(unseen.data?.action_result).toBe('uncertain');
    expect(unseen.data?.operation.outcome).toBe('unknown');
    expect(unseen.data?.operation.committed_at).toBeNull();
    expect(unseen.data?.input_policy).toBe('preserve');
  });
});
