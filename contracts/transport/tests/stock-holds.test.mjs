import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const transport = await readJson('../v1/transport.schema.json');
const identity = await readJson('../../identity-record-evidence/v1/contract.schema.json');
const schema = await readJson('../../stock-holds/v1/contract.schema.json');
const examples = await readJson('../../stock-holds/v1/examples.json');
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const dependency of [transport, identity, schema]) ajv.addSchema(dependency);
const validator = (name) => ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` });

test('P00: stock query and hold wire definitions compile and expected examples validate', () => {
  for (const name of Object.keys(schema.$defs)) validator(name);
  for (const [name, example] of Object.entries(examples)) {
    const validate = validator(example.definition);
    assert.ok(validate(example.value), `${name}: ${ajv.errorsText(validate.errors)}`);
    assert.equal(example.evidence_state, 'expected');
  }
  assert.equal(Object.keys(examples).length >= 10, true);
});

// This oracle checks the authored disjoint-cell examples only. It is not an
// Inventory provider and proves no database locking or operation acceptance.
const exact = (value) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
};
const amount = (quantity) => exact(quantity.value);
const sum = (cells) => cells.reduce((total, cell) => total + amount(cell.quantity), 0n);

function checkQuery(result) {
  const cells = result.cells;
  const byId = new Map(cells.map((cell) => [cell.cell_id, cell]));
  assert.equal(byId.size, cells.length, 'unique live cell identity');
  for (const cell of cells) {
    assert.ok(exact(cell.end) > exact(cell.start), 'positive interval');
    assert.equal(exact(cell.end) - exact(cell.start), amount(cell.quantity));
    assert.equal(cell.quantity.quantity_scale, cell.dimension.quantity_scale);
    assert.equal(cell.dimension.chapter_id, result.chapter_id);
    assert.equal(cell.dimension.variant_id, result.query.variant_id);
    assert.equal(cell.dimension.unit_id, result.query.unit_id);
    assert.equal(cell.dimension.source.variant_id, result.query.variant_id);
    assert.equal(cell.dimension.source.chapter_id, result.chapter_id);
    for (const other of cells) {
      if (cell.cell_id >= other.cell_id || cell.dimension.lot_id !== other.dimension.lot_id) continue;
      assert.ok(exact(cell.end) <= exact(other.start) || exact(other.end) <= exact(cell.start), 'same-lot intervals never overlap, even across positions');
    }
    assert.deepEqual(cell.active_hold_ids.toSorted(), result.holds.filter((hold) => hold.coverage_cell_ids.includes(cell.cell_id)).map((hold) => hold.hold_id).toSorted());
    const reservations = result.reservations.filter((reservation) => reservation.coverage_cell_ids.includes(cell.cell_id));
    assert.ok(reservations.length <= 1, 'a cell cannot serve two commitments');
    assert.equal(cell.active_reservation_id, reservations[0]?.reservation_id ?? null);
  }
  for (const owner of [...result.holds, ...result.reservations]) {
    assert.ok(owner.coverage_cell_ids.every((id) => byId.has(id)), 'no dangling coverage');
    assert.equal(amount(owner.quantity), sum(owner.coverage_cell_ids.map((id) => byId.get(id))));
  }
  const usable = cells.filter((cell) => cell.dimension.custody_kind === 'stockroom' && cell.dimension.condition_code === 'usable' && cell.dimension.lot_kind === 'accepted');
  const eligible = usable.filter((cell) => cell.non_hold_eligibility === 'eligible');
  const held = eligible.filter((cell) => cell.active_hold_ids.length);
  const reserved = eligible.filter((cell) => cell.active_reservation_id !== null);
  const intersection = held.filter((cell) => cell.active_reservation_id !== null);
  const blocked = eligible.filter((cell) => cell.active_hold_ids.length || cell.active_reservation_id !== null);
  const available = eligible.filter((cell) => !cell.active_hold_ids.length && cell.active_reservation_id === null);
  const union = result.union;
  for (const [name, group] of Object.entries({ eligible_before_holds_and_reservations: eligible, active_held_union: held, reserved_in_eligible: reserved, held_reserved_intersection: intersection, blocked_union: blocked, available_to_allocate: available })) {
    assert.equal(amount(union[name]), sum(group), name);
  }
  assert.equal(sum(blocked), sum(held) + sum(reserved) - sum(intersection));
  const views = result.views;
  assert.equal(amount(views.usable_stockroom_on_hand), sum(usable));
  assert.equal(amount(views.available_to_allocate), sum(available));
  for (const [kind, view] of [['RF', 'rf_reserved'], ['SO', 'so_reserved']]) {
    assert.equal(amount(views[view]), result.reservations.filter((r) => r.kind === kind).reduce((total, r) => total + amount(r.quantity), 0n));
  }
  assert.equal(amount(views.booth_custody), sum(cells.filter((c) => c.dimension.custody_kind === 'booth')));
  assert.equal(amount(views.quarantined_rejected), sum(cells.filter((c) => c.dimension.condition_code !== 'usable' || c.dimension.lot_kind === 'nonusable')));
  assert.equal(amount(views.inbound_open_po), result.inbound.reduce((total, line) => total + amount(line.open_quantity), 0n));
  assert.equal(amount(result.rop.usable_on_hand), sum(usable));
  assert.equal(result.rop.low_stock, sum(usable) <= amount(result.rop.approved_threshold));
  assert.equal(amount(result.shortage.available_quantity), sum(available));
  const shortage = amount(result.shortage.requested_quantity) - sum(available);
  assert.equal(amount(result.shortage.uncovered_quantity), shortage > 0n ? shortage : 0n);
}

test('INV-03/04/10/14 Q1/Q7/Q8: accepted literal examples reconcile shared coverage exactly once', async () => {
  const cases = await readJson('../../stock-holds/v1/cases.json');
  const required = {
    'rop-ten': ['10', '4', '3', '4', '2', '1', false],
    'same-three': ['10', '0', '0', '3', '0', '7', false],
    'clear-first': ['10', '0', '0', '3', '0', '7', false],
    'clear-last': ['10', '0', '0', '0', '0', '10', false],
    'reserved-three': ['10', '0', '3', '3', '3', '7', false],
    'reserved-clear-first': ['10', '0', '3', '3', '3', '7', false],
    'reserved-clear-last': ['10', '0', '3', '0', '0', '7', false],
    'partial-overlap': ['10', '0', '0', '4', '0', '6', false],
    'partial-clear-A': ['10', '0', '0', '2', '0', '8', false],
    'expiry-keeps-holds': ['10', '0', '0', '3', '0', '7', false]
  };
  for (const [name, expected] of Object.entries(required)) {
    const scenario = cases.snapshots.find((item) => item.name === name);
    assert.ok(scenario, name);
    assert.equal(scenario.evidence_state, 'expected');
    const result = examples[scenario.query_example].value;
    assert.ok(validator('EligibilityResult')(result), name);
    checkQuery(result);
    const actual = [result.views.usable_stockroom_on_hand.value, result.views.rf_reserved.value, result.views.so_reserved.value, result.union.active_held_union.value, result.union.held_reserved_intersection.value, result.views.available_to_allocate.value, result.rop.low_stock];
    assert.deepEqual(actual, expected, name);
  }
});

test('TR-06/07/09/10: commands require explicit versions and evidence without trusting client authority', () => {
  for (const name of ['create-hold', 'clear-hold']) {
    const { definition, value } = examples[name];
    const validate = validator(definition);
    for (const key of ['expected_row_version', 'expected_material_version']) {
      const invalid = structuredClone(value);
      delete invalid.context[key];
      assert.equal(validate(invalid), false, key);
    }
    for (const key of ['actor_id', 'approved', 'balance', 'verified', 'available_quantity']) {
      assert.equal(validate({ ...value, [key]: true }), false, key);
    }
    assert.equal(validate({ ...value, evidence: [] }), false);
    const invalid = structuredClone(value);
    delete invalid.evidence[0].evidence.content_hash;
    assert.equal(validate(invalid), false, 'immutable evidence byte pin');
  }
  const clear = structuredClone(examples['clear-hold'].value);
  clear.evidence[0].purpose_code = 'hold_finding';
  assert.equal(validator('ClearHoldInput')(clear), false, 'clearance cannot use finding-only evidence');
  const create = structuredClone(examples['create-hold'].value);
  create.evidence[0].purpose_code = 'hold_clearance';
  assert.equal(validator('CreateHoldInput')(create), false);
  const validate = validator('HoldChangeResult');
  const cleared = structuredClone(examples.cleared.value);
  for (const key of ['actor', 'reason', 'evidence', 'audit_event_id']) {
    const invalid = structuredClone(cleared);
    delete invalid.data[key];
    assert.equal(validate(invalid), false, key);
  }
  assert.equal(validate({ ...cleared, data: { ...cleared.data, resolution: null } }), false);
  assert.equal(validate({ ...cleared, data: { ...cleared.data, condition_changed: true } }), false);
  assert.equal(validate({ ...cleared, data: { ...cleared.data, movement_ids: ['999'] } }), false);
  const mismatched = structuredClone(cleared);
  mismatched.operation.identity.action_code = 'inventory.record_stock_hold';
  assert.equal(validate(mismatched), false, 'creation action cannot certify clearance');
  const wrongSource = structuredClone(examples['query-unheld'].value);
  wrongSource.cells[0].dimension.source.record.kind = 'IPC';
  wrongSource.cells[0].dimension.source.line_kind = 'IPC';
  assert.equal(validator('EligibilityResult')(wrongSource), false, 'source stock traces its RM line, not registry-only IPC');
  const read = structuredClone(examples['query-unheld'].value);
  read.views.available_to_allocate.value = '1.5';
  assert.equal(validator('EligibilityResult')(read), false, 'pieces remain whole quantities');
  read.views.available_to_allocate = { value: '1e2', quantity_scale: 0 };
  assert.equal(validator('EligibilityResult')(read), false, 'no floating/exponent values');
});

test('INV-03/TR-08: restrictions, booth custody, nonusable and inbound views retain their separate bases', async () => {
  const cases = await readJson('../../stock-holds/v1/verification-cases.json');
  const result = cases.mixed_stock_view;
  assert.equal(cases.evidence_state, 'expected');
  assert.ok(validator('EligibilityResult')(result), ajv.errorsText(validator('EligibilityResult').errors));
  checkQuery(result);
  assert.deepEqual(Object.values(result.views).map((q) => q.value), ['10', '2', '2', '3', '4', '3', '5']);
  assert.deepEqual(Object.values(result.union).map((q) => q.value), ['7', '2', '4', '1', '5', '2']);
  assert.equal(result.reservations.filter((r) => r.kind === 'SO').reduce((total, r) => total + amount(r.quantity), 0n), 3000000n);
  assert.equal(result.union.reserved_in_eligible.value, '4', 'restricted reserved cells are not subtracted from eligible stock twice');
  const fractional = cases.fractional_stock_view;
  assert.ok(validator('EligibilityResult')(fractional));
  checkQuery(fractional);
  assert.deepEqual([fractional.views.usable_stockroom_on_hand.value, fractional.union.active_held_union.value, fractional.union.held_reserved_intersection.value, fractional.views.available_to_allocate.value], ['1.250', '0.375', '0.125', '0.875']);
});

test('INV-05/14: expected splits conserve identity and copy every active reason and commitment', async () => {
  const cases = await readJson('../../stock-holds/v1/verification-cases.json');
  assert.ok(cases.splits?.length > 0);
  for (const split of cases.splits) {
    assert.equal(split.evidence_state, 'expected');
    assert.deepEqual(split.expected_movement_ids, []);
    assert.equal(split.children[0].start, split.parent.start);
    assert.equal(split.children.at(-1).end, split.parent.end);
    assert.equal(split.children.reduce((total, cell) => total + exact(cell.end) - exact(cell.start), 0n), 3000000n);
    for (const [index, child] of split.children.entries()) {
      assert.ok(exact(child.end) > exact(child.start));
      if (index) assert.equal(child.start, split.children[index - 1].end);
      assert.deepEqual(child.active_hold_ids, ['2101', '2102']);
      assert.equal(child.active_reservation_id, '2402');
      assert.equal(child.lot_id, split.parent.lot_id);
      assert.equal(child.position_id, split.parent.position_id);
    }
    assert.equal(split.parent_is_live_after, false);
  }
});

test('TR-10/12: failure, quarantine and both race orders are explicit future operation cases', async () => {
  const cases = await readJson('../../stock-holds/v1/verification-cases.json');
  const required = ['clear-with-B-active', 'clear-final-two-allocations', 'create-versus-allocation', 'create-versus-handover', 'duplicate-clear', 'expiry-versus-hold', 'quarantine', 'restricted-after-clear', 'wrong-chapter', 'unready-evidence', 'stale-guard', 'rollback-after-audit', 'lookup-lost-response'];
  for (const name of required) {
    const scenario = cases.operations.find((item) => item.name === name);
    assert.ok(scenario, name);
    assert.equal(scenario.evidence_state, 'expected');
    assert.equal(scenario.verification_boundary, 'owning_application_operation');
    assert.ok(scenario.setup.length > 0);
    assert.ok(Object.keys(scenario.server_facts).length > 0);
    assert.ok(scenario.expected.length > 0);
    if (scenario.input_example) {
      const example = examples[scenario.input_example];
      assert.ok(validator(example.definition)(example.value));
    }
    if (scenario.result_example) {
      const example = examples[scenario.result_example];
      assert.ok(validator(example.definition)(example.value));
    }
  }
  for (const name of ['clear-with-B-active', 'clear-final-two-allocations', 'create-versus-allocation', 'create-versus-handover']) {
    const scenario = cases.operations.find((item) => item.name === name);
    assert.deepEqual(scenario.schedules.map((s) => s.first), ['hold_change', 'allocation_or_handover']);
    for (const schedule of scenario.schedules) assert.ok(schedule.expected.length > 0);
  }
  assert.equal(cases.operations.find((c) => c.name === 'quarantine').server_facts.condition_after_clearance, 'damaged');
});

test('TR-12/Q8: clearance replay preserves original result and uncertain lookup carries no inferred stock', () => {
  const original = examples.cleared.value;
  const replay = structuredClone(examples.replayed.value);
  replay.operation.replayed = false;
  assert.deepEqual(replay, original);
  for (const name of ['lookup-no-terminal', 'lookup-unavailable']) {
    const unknown = examples[name].value;
    assert.equal(unknown.action_result, 'uncertain');
    assert.equal(unknown.operation.outcome, 'unknown');
    assert.equal(unknown.operation.committed_at, null);
    assert.equal(unknown.operation.identity.idempotency_key, original.operation.identity.idempotency_key);
    assert.equal(unknown.input_policy, 'preserve');
    assert.equal(validator('HoldChangeResult')(unknown), false);
    assert.equal(unknown.data, undefined);
  }
  assert.equal(examples.forbidden.value.chapter_id, null);
  assert.equal(examples.forbidden.value.operation, null);
});
