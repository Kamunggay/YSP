import { describe, expect, it } from 'vitest';
import {
  computeBatchSnapshotHashV1,
  computeInspectionMaterialHashV1,
  computeOpeningMaterialHashV1,
  computeRecipientHashV1,
  normalizeSixDecimalQuantity,
  serializeBatchSnapshotV1,
  serializeOpeningMaterialV1,
  serializeRecipientV1,
} from './canonicalHash';

describe('canonicalHash (ysp-opening-v1 / ysp-batch-v1)', () => {
  it('matches canonical-vectors.json recipient-unicode-slash-controls byte-for-byte', () => {
    const recipient = {
      name: 'Zoë / 😀 "quoted" \\ \b\t\n\f\r\u0000\u000b\u001f\u2028\u2029',
      user_id: null,
      capacity: 'Committee recipient',
    };

    const json = serializeRecipientV1(recipient);
    expect(json).toBe(
      '{"name":"Zoë / 😀 \\"quoted\\" \\\\ \\b\\t\\n\\f\\r\\u0000\\u000b\\u001f\u2028\u2029","user_id":null,"capacity":"Committee recipient"}'
    );
    expect(computeRecipientHashV1(recipient)).toBe(
      '908b0288ebfc165a3090cdba533d049719178ae113b45ee95725ccc5e59c99f0'
    );
  });

  it('matches canonical-vectors.json opening-with-cutoff fixed key order and SHA-256 digest', () => {
    const opening = {
      chapter_id: '1',
      record: { id: '9007199254740993', kind: 'IPC' },
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      purpose: 'Synthetic opening count; contract example only',
      policy_version_id: '42',
      // Pass counters out of order to verify numeric sorting
      counters: [
        { user_id: '12', is_regular_custodian: false },
        { user_id: '11', is_regular_custodian: true },
      ],
      lines: [
        {
          reference: {
            chapter_id: '1',
            record: { id: '9007199254740993', kind: 'IPC' },
            line_id: '501',
            line_kind: 'IPC',
            variant_id: '71',
          },
          location_id: '81',
          custody_assignment_id: '82',
          condition_code: 'usable',
          counted_quantity: { value: '10', quantity_scale: 0 },
          unit_valuation: '25',
          valuation_basis: 'Synthetic approved test valuation',
          restriction_version_id: '83',
        },
      ],
    };

    expect(serializeOpeningMaterialV1(opening)).toBe(
      '{"chapter_id":"1","record":{"id":"9007199254740993","kind":"IPC"},"cutoff_at":"2026-10-23T23:00:00.000000Z","counted_at":"2026-10-24T06:00:00.000000Z","purpose":"Synthetic opening count; contract example only","policy_version_id":"42","counters":[{"user_id":"11","is_regular_custodian":true},{"user_id":"12","is_regular_custodian":false}],"lines":[{"reference":{"chapter_id":"1","record":{"id":"9007199254740993","kind":"IPC"},"line_id":"501","line_kind":"IPC","variant_id":"71"},"location_id":"81","custody_assignment_id":"82","condition_code":"usable","counted_quantity":{"value":"10.000000","quantity_scale":0},"unit_valuation":"25.000000","valuation_basis":"Synthetic approved test valuation","restriction_version_id":"83"}]}'
    );
    expect(computeOpeningMaterialHashV1(opening)).toBe(
      '51f26668f59dcab87be7cc46477605ce857f88823f2629a1527e778e021ecf8b'
    );
  });

  it('matches canonical-vectors.json exact-handover-batch fixed key order and SHA-256 digest', () => {
    const batch = {
      chapter_id: '1',
      record: { id: '601', kind: 'IS_AR' },
      material_version: 3,
      batch_id: '602',
      recipient: {
        name: 'Synthetic recipient',
        user_id: null,
        capacity: 'Committee recipient',
      },
      lines: [
        {
          line: {
            chapter_id: '1',
            record: { id: '601', kind: 'IS_AR' },
            line_id: '603',
            line_kind: 'IS_AR',
            variant_id: '71',
          },
          quantity: '2',
        },
      ],
    };

    expect(serializeBatchSnapshotV1(batch)).toBe(
      '{"chapter_id":"1","record":{"id":"601","kind":"IS_AR"},"material_version":3,"batch_id":"602","recipient":{"name":"Synthetic recipient","user_id":null,"capacity":"Committee recipient"},"lines":[{"line":{"chapter_id":"1","record":{"id":"601","kind":"IS_AR"},"line_id":"603","line_kind":"IS_AR","variant_id":"71"},"quantity":"2.000000"}]}'
    );
    expect(computeBatchSnapshotHashV1(batch)).toBe(
      'd72e4b3ec8d57858d26f3b068177bbd09a482f7c60bd1acc52c14e0bcc8b6d29'
    );
  });

  it('rejects lone UTF-16 surrogates, duplicate line IDs, and normalizes 6-decimal quantities without float drift', () => {
    expect(() =>
      serializeRecipientV1({
        name: '\ud800',
        user_id: null,
        capacity: 'Recipient',
      })
    ).toThrow(/INVALID_UNICODE_SURROGATE/);

    expect(() =>
      serializeRecipientV1({
        name: '\udc00',
        user_id: null,
        capacity: 'Recipient',
      })
    ).toThrow(/INVALID_UNICODE_SURROGATE/);

    expect(normalizeSixDecimalQuantity('2')).toBe('2.000000');
    expect(normalizeSixDecimalQuantity('10.25')).toBe('10.250000');

    expect(() =>
      computeBatchSnapshotHashV1({
        chapter_id: '1',
        record: { id: '601', kind: 'IS_AR' },
        material_version: 1,
        batch_id: '602',
        recipient: { name: 'A', user_id: null, capacity: 'B' },
        lines: [
          {
            line: {
              chapter_id: '1',
              record: { id: '601', kind: 'IS_AR' },
              line_id: '10',
              line_kind: 'IS_AR',
              variant_id: '1',
            },
            quantity: '1',
          },
          {
            line: {
              chapter_id: '1',
              record: { id: '601', kind: 'IS_AR' },
              line_id: '10',
              line_kind: 'IS_AR',
              variant_id: '2',
            },
            quantity: '2',
          },
        ],
      })
    ).toThrow(/DUPLICATE_LINE_ID/);
  });

  it('matches ipc-rm-acceptance/v1 two-line IPC & RM inspection canonical hashes bit-for-bit', () => {
    const twoLineIpc = {
      chapter_id: '1',
      record: { id: '9007199254740993', kind: 'IPC' },
      cutoff_at: '2026-10-23T23:00:00.000000Z',
      counted_at: '2026-10-24T06:00:00.000000Z',
      purpose: 'Synthetic opening count; contract example only',
      policy_version_id: '42',
      counters: [
        { user_id: '11', is_regular_custodian: true },
        { user_id: '12', is_regular_custodian: false },
      ],
      lines: [
        {
          reference: { chapter_id: '1', record: { id: '9007199254740993', kind: 'IPC' }, line_id: '501', line_kind: 'IPC', variant_id: '71' },
          location_id: '81',
          custody_assignment_id: '82',
          condition_code: 'usable',
          counted_quantity: { value: '10', quantity_scale: 0 },
          unit_valuation: '25',
          valuation_basis: 'Synthetic approved test valuation',
          restriction_version_id: '83',
        },
        {
          reference: { chapter_id: '1', record: { id: '9007199254740993', kind: 'IPC' }, line_id: '502', line_kind: 'IPC', variant_id: '71' },
          location_id: '84',
          custody_assignment_id: '85',
          condition_code: 'damaged',
          counted_quantity: { value: '2', quantity_scale: 0 },
          unit_valuation: '25',
          valuation_basis: 'Synthetic approved test valuation',
          restriction_version_id: '83',
        },
      ],
    };

    expect(computeOpeningMaterialHashV1(twoLineIpc)).toBe(
      'bbd7495ecab1a3ce691c09aa273d58b7247c308d4842c5048ba5f70b1feaf128'
    );

    const inspectionMaterial = {
      chapter_id: '1',
      record: { id: '901', kind: 'RM' },
      source: {
        chapter_id: '1',
        record: { id: '9007199254740993', kind: 'IPC' },
        material_version: 1,
        material_hash: 'bbd7495ecab1a3ce691c09aa273d58b7247c308d4842c5048ba5f70b1feaf128',
      },
      inspection_at: '2026-10-24T06:30:00.000000Z',
      inspector: {
        chapter_id: '1',
        user_id: '11',
        membership_id: '111',
        duty_grant_id: '112',
        duty_code: 'RECEIVING',
        actor_name: 'Synthetic officer 11',
        chapter_name: 'Synthetic chapter A',
        captured_at: '2026-10-24T06:00:00.000000Z',
      },
      representatives: [],
      policy: {
        chapter_id: '1',
        policy_id: '41',
        policy_version_id: '42',
        version_no: 1,
        settings_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        approval: {
          chapter_id: '1',
          record: { id: '43', kind: 'CONFIG' },
          material_version: 1,
          material_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        effective_from: '2026-10-23T00:00:00.000000Z',
        effective_until: null,
      },
      lines: [
        {
          reference: { chapter_id: '1', record: { id: '901', kind: 'RM' }, line_id: '601', line_kind: 'RM', variant_id: '71' },
          source_line: { chapter_id: '1', record: { id: '9007199254740993', kind: 'IPC' }, line_id: '501', line_kind: 'IPC', variant_id: '71' },
          expected_quantity: { value: '10', quantity_scale: 0 },
          delivered_quantity: { value: '10', quantity_scale: 0 },
          accepted_quantity: { value: '10', quantity_scale: 0 },
          rejected_quantity: { value: '0', quantity_scale: 0 },
          held_quantity: { value: '0', quantity_scale: 0 },
          missing_quantity: { value: '0', quantity_scale: 0 },
          nonusable_recorded_quantity: { value: '0', quantity_scale: 0 },
          location_id: '81',
          custody_assignment_id: '82',
          condition_code: 'usable',
          restriction_version_id: '83',
          unit_valuation: '25',
          valuation_basis: 'Synthetic approved test valuation',
          condition_notes: 'Ten inspected usable units; packaging/specification/variant match.',
        },
        {
          reference: { chapter_id: '1', record: { id: '901', kind: 'RM' }, line_id: '602', line_kind: 'RM', variant_id: '71' },
          source_line: { chapter_id: '1', record: { id: '9007199254740993', kind: 'IPC' }, line_id: '502', line_kind: 'IPC', variant_id: '71' },
          expected_quantity: { value: '2', quantity_scale: 0 },
          delivered_quantity: { value: '2', quantity_scale: 0 },
          accepted_quantity: { value: '0', quantity_scale: 0 },
          rejected_quantity: { value: '2', quantity_scale: 0 },
          held_quantity: { value: '0', quantity_scale: 0 },
          missing_quantity: { value: '0', quantity_scale: 0 },
          nonusable_recorded_quantity: { value: '2', quantity_scale: 0 },
          location_id: '84',
          custody_assignment_id: '85',
          condition_code: 'damaged',
          restriction_version_id: '83',
          unit_valuation: '25',
          valuation_basis: 'Synthetic approved test valuation',
          condition_notes: 'Two damaged units segregated in holding; unavailable; discrepancy remains open.',
        },
      ],
    };

    expect(computeInspectionMaterialHashV1(inspectionMaterial)).toBe(
      '8a749f25377479cffec388d99e5ee1fa30dac766f3df967ec5a36a0753c60179'
    );
  });
});
