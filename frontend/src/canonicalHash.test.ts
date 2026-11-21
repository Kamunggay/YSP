import { describe, expect, it } from 'vitest';
import {
  computeBatchSnapshotHashV1,
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
});
