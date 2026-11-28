import test from 'node:test';
import assert from 'node:assert/strict';

import { Stage2NoticeTracker } from '../src/realtime/stage2NoticeRouter.ts';
import {
  currentManilaIsoDate,
  findProcurementOperationByKey,
  listAllStage2Pages,
  listAllocationQueue,
  listReplenishmentNeeds,
  localDateTimeToUtcInstant,
  nowUtcInstant,
  postReceivingReport,
  readPurchaseOrder,
  registerStage2PreviewAdapter,
  resolveDonationRestriction,
  settleStage2Tuple,
  validateReportDateRange,
} from '../src/api/stage2Client.ts';
import { ContractApiError } from '../src/api/client.ts';
import {
  resetStage2Preview,
  setStage2PreviewEnabled,
} from './fixtures/stage2Fixtures.ts';

const CHAPTER_ID = '60000000-0000-4000-8000-000000000001';

test('Stage2NoticeTracker validates closed envelope, deduplicates, isolates chapters, and allows equal-version unseen RepF refreshes', () => {
  const tracker = new Stage2NoticeTracker();

  // Rejects extra property on closed envelope
  const invalid = tracker.evaluate(
    {
      event_name: 'stage2.repf.changed.v1',
      event_id: '11111111-1111-4111-8111-111111111111',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'repf',
      resource_id: '90000000-0000-4000-8000-000000000010',
      resource_version: 2,
      material_version: 1,
      extra_field: true,
    },
    CHAPTER_ID,
  );
  assert.equal(invalid.accepted, false);

  // Accepts valid PO v5
  const po5 = tracker.evaluate(
    {
      event_name: 'stage2.purchase-order.changed.v1',
      event_id: '22222222-2222-4222-8222-222222222222',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'purchase_order',
      resource_id: '94000000-0000-4000-8000-000000000001',
      resource_version: 5,
      material_version: 2,
    },
    CHAPTER_ID,
  );
  assert.equal(po5.accepted, true);

  // Deduplicates identical event_id
  const poDup = tracker.evaluate(
    {
      event_name: 'stage2.purchase-order.changed.v1',
      event_id: '22222222-2222-4222-8222-222222222222',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'purchase_order',
      resource_id: '94000000-0000-4000-8000-000000000001',
      resource_version: 5,
      material_version: 2,
    },
    CHAPTER_ID,
  );
  assert.deepEqual(poDup, { accepted: false, reason: 'duplicate_event' });

  // Drops stale version on PO
  const poStale = tracker.evaluate(
    {
      event_name: 'stage2.purchase-order.changed.v1',
      event_id: '33333333-3333-4333-8333-333333333333',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'purchase_order',
      resource_id: '94000000-0000-4000-8000-000000000001',
      resource_version: 4,
      material_version: 2,
    },
    CHAPTER_ID,
  );
  assert.deepEqual(poStale, { accepted: false, reason: 'stale_version' });

  // Ignores foreign chapter cleanly
  const foreign = tracker.evaluate(
    {
      event_name: 'stage2.repf.changed.v1',
      event_id: '44444444-4444-4444-8444-444444444444',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: '60000000-0000-4000-8000-999999999999',
      resource_kind: 'repf',
      resource_id: '90000000-0000-4000-8000-000000000010',
      resource_version: 3,
      material_version: 1,
    },
    CHAPTER_ID,
  );
  assert.deepEqual(foreign, { accepted: false, reason: 'foreign_chapter' });

  // RepF v3 accepted, then unseen event_id at SAME v3 MUST STILL refresh (nested quotations)
  const repf1 = tracker.evaluate(
    {
      event_name: 'stage2.repf.changed.v1',
      event_id: '55555555-5555-4555-8555-555555555555',
      committed_at: '2026-11-26T00:00:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'repf',
      resource_id: '90000000-0000-4000-8000-000000000010',
      resource_version: 3,
      material_version: 1,
    },
    CHAPTER_ID,
  );
  assert.equal(repf1.accepted, true);

  const repfNestedQuote = tracker.evaluate(
    {
      event_name: 'stage2.repf.changed.v1',
      event_id: '66666666-6666-4666-8666-666666666666',
      committed_at: '2026-11-26T00:01:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'repf',
      resource_id: '90000000-0000-4000-8000-000000000010',
      resource_version: 3,
      material_version: 1,
    },
    CHAPTER_ID,
  );
  assert.equal(repfNestedQuote.accepted, true);
  if (repfNestedQuote.accepted) {
    assert.ok(repfNestedQuote.domains.includes('quotations'));
  }

  tracker.clear();
  const afterClear = tracker.evaluate(
    {
      event_name: 'stage2.purchase-order.changed.v1',
      event_id: '77777777-7777-4777-8777-777777777777',
      committed_at: '2026-11-26T00:02:00Z',
      chapter_id: CHAPTER_ID,
      resource_kind: 'purchase_order',
      resource_id: '94000000-0000-4000-8000-000000000001',
      resource_version: 4,
      material_version: 2,
    },
    CHAPTER_ID,
  );
  assert.equal(afterClear.accepted, true);
});

test('validateReportDateRange enforces YYYY-MM-DD, non-inverted order, and 366-day max span', () => {
  assert.equal(validateReportDateRange('2026-01-01', '2026-12-31'), null);
  assert.ok(validateReportDateRange('2026-12-31', '2026-01-01'));
  assert.ok(validateReportDateRange('2025-01-01', '2026-06-01'));
  assert.ok(validateReportDateRange('bad-date', '2026-01-10'));
});

test('Stage 2 preview fixture preserves worked INV-09/INV-10/PO partial RM and ADR 0004 invariants', async () => {
  resetStage2Preview();
  setStage2PreviewEnabled(true, CHAPTER_ID);
  try {
    const needs = await listReplenishmentNeeds(CHAPTER_ID);
    const shirtNeed = needs.data.find((n) => n.variant_code === 'SHIRT-M');
    assert.ok(shirtNeed);
    assert.equal(shirtNeed.proposed_uncovered_quantity, '55');
    assert.equal(shirtNeed.total_open_inbound_coverage, '10');
    assert.equal(shirtNeed.excluded_inbound_quantity, '5');

    const queue = await listAllocationQueue(CHAPTER_ID);
    assert.equal(queue.is_commit_authorization, false);
    assert.equal(queue.data[0]?.allocation_tier, 'active_commitment');

    const poBefore = await readPurchaseOrder(CHAPTER_ID, '96000000-0000-4000-8000-000000000101');
    assert.equal(poBefore.lines[0]?.ordered_quantity, '100');
    assert.equal(poBefore.lines[0]?.accepted_quantity, '40');
    assert.equal(poBefore.lines[0]?.outstanding_quantity, '60');

    // Post replacement draft RM for remaining 60 units
    await postReceivingReport(CHAPTER_ID, '97000000-0000-4000-8000-000000000002', {
      expected_version: 1,
      expected_material_version: 1,
      source_material_version: poBefore.material_version,
      acknowledgment_id: '97500000-0000-4000-8000-000000000009',
    });

    const poAfter = await readPurchaseOrder(CHAPTER_ID, '96000000-0000-4000-8000-000000000101');
    assert.equal(poAfter.status, 'receiving_complete');
    assert.equal(poAfter.lines[0]?.accepted_quantity, '100');
    assert.equal(poAfter.lines[0]?.outstanding_quantity, '0');

    await assert.rejects(() =>
      resolveDonationRestriction(CHAPTER_ID, '92000000-0000-4000-8000-000000000001', {
        expected_version: 3,
        expected_material_version: 1,
        da_line_id: '92100000-0000-4000-8000-000000000003',
        resolution_kind: 'audit_review',
        reason: 'Invalid attempt to unblock during audit review',
        restrictions: {
          state: 'unrestricted',
          allowed_uses: [],
          event_ids: [],
          requesting_unit_ids: [],
          effective_from: null,
          effective_until: null,
          interpretation_id: null,
          source_condition_reference: null,
        },
        evidence: {
          evidence_id: '81000000-0000-4000-8000-000000000999',
          version_id: '82000000-0000-4000-8000-000000000999',
          attachments: [
            { attachment_id: '83000000-0000-4000-8000-000000000999', sha256: 'a'.repeat(64) },
          ],
        },
        signed_at: '2026-11-28T00:00:00Z',
        confirm_paper_matches: true,
      }),
    );
  } finally {
    resetStage2Preview();
  }
});

test('Stage 2 client enforces 6-digit UtcInstant formatting, multi-page cursor iteration with stale retry, and clean operation_not_found lookup', async () => {
  const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
  assert.match(nowUtcInstant(), utcPattern);
  assert.match(localDateTimeToUtcInstant('2026-11-28T09:15'), utcPattern);
  assert.match(currentManilaIsoDate(), /^\d{4}-\d{2}-\d{2}$/);

  // Cursor loop + single snapshot_stale retry
  let attempt = 0;
  const rows = await listAllStage2Pages<{ id: string }>(async ({ cursor }) => {
    attempt += 1;
    if (attempt === 1) {
      return { data: [{ id: 'a' }], page: { next_cursor: 'cur-2', snapshot_version: 1 } };
    }
    if (attempt === 2 && cursor === 'cur-2') {
      throw new ContractApiError(409, 'snapshot_stale', 'Restart discovery');
    }
    if (!cursor) {
      return { data: [{ id: 'a2' }], page: { next_cursor: 'cur-3', snapshot_version: 2 } };
    }
    return { data: [{ id: 'b2' }], page: { next_cursor: null, snapshot_version: 2 } };
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['a2', 'b2'],
  );

  // Uniform 404 operation_not_found resolves null while chapter_not_found rethrows
  registerStage2PreviewAdapter({
    isEnabled: () => true,
    async handleJson({ path }) {
      if (path.includes('missing-op')) {
        throw new ContractApiError(404, 'operation_not_found', 'Not found');
      }
      throw new ContractApiError(404, 'chapter_not_found', 'Denied');
    },
    async handleText() {
      return null;
    },
  });
  try {
    const missing = await findProcurementOperationByKey(
      CHAPTER_ID,
      'createRepf',
      '00000000-0000-4000-8000-000000000001-missing-op',
    );
    assert.equal(missing, null);
    await assert.rejects(() =>
      findProcurementOperationByKey(CHAPTER_ID, 'createRepf', '00000000-0000-4000-8000-000000000002'),
    );
  } finally {
    registerStage2PreviewAdapter(null);
  }

  // settleStage2Tuple preserves fulfilled queries when a sibling endpoint rejects
  const settled = await settleStage2Tuple([
    Promise.resolve([{ id: 'need-1' }] as const),
    Promise.reject(new ContractApiError(404, 'route_not_found', 'Not deployed yet')),
  ] as const);
  assert.deepEqual(settled.values[0], [{ id: 'need-1' }]);
  assert.equal(settled.values[1], undefined);
  assert.ok(settled.firstError instanceof ContractApiError);
  assert.equal((settled.firstError as ContractApiError).status, 404);
});
