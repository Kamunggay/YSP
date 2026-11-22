import { describe, expect, it } from 'vitest';
import {
  createP17CountVarianceAdjEngine,
  P17_CONTEXT_STORAGE_KEY,
} from './p17CountVarianceAdjSlice';
import type {
  CountVarianceAdjRecord,
  LockedCustodyPosition,
  P17LookupResult,
} from './p17CountVarianceAdjSlice';

describe('p17CountVarianceAdjSlice — Independent Counts & Stock-Variance ADJ', () => {
  it('starts strictly unseeded with empty custody positions, variance ADJs, and zero counters', () => {
    expect(P17_CONTEXT_STORAGE_KEY).toBe('ysp_p17_context');
    const engine = createP17CountVarianceAdjEngine();
    const snap = engine.getSnapshot();

    expect(snap.custody_positions).toEqual([]);
    expect(snap.variance_adjs).toEqual([]);
    expect(snap.summary).toEqual({
      recorded_usable_on_hand: '0',
      quarantined_stock: '0',
      pending_variance_count: 0,
      posted_adj_count: 0,
    });
  });

  it('blocks direct balance edits, enforces recount & GOV-06 preparer/custodian/dual-slot independence, and posts positive gain once', () => {
    const engine = createP17CountVarianceAdjEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const pos = engine.registerLockedBaselinePosition({
      variant_id: '71',
      item_name: 'Four-Person Field Tent',
      location_id: 'LOC-MAIN',
      custodian_user_id: '105',
      quantity_scale: 0,
      recorded_usable_value: '10',
      quarantined_value: '0',
    }).data as LockedCustodyPosition;

    const editBlocked = engine.attemptDirectBalanceOverwrite({
      position_id: pos.position_id,
      actor_user_id: '201',
      attempted_usable_value: '12',
    });
    expect(editBlocked.ok).toBe(false);
    expect(editBlocked.code).toBe('DIRECT_BALANCE_EDIT_FORBIDDEN');

    let adj = engine.initiateCountVarianceAdj({
      position_id: pos.position_id,
      preparer_user_id: '101',
      variance_kind: 'positive_gain_discovery',
      variance_quantity_value: '2',
      reason: 'Found 2 extra tents sealed in top bay after baseline lock',
      count_sheet_hash: 'a'.repeat(64),
      initiated_at: '2026-11-06T08:00:00Z',
      idempotency_key: 'p17-init-1',
    }).data as CountVarianceAdjRecord;
    expect(adj.adj_reference).toBe('CEBU-ADJ-VAR-2026-000001');
    expect(engine.getSnapshot().summary.recorded_usable_on_hand).toBe('10');

    // Recount by same preparer blocked; approval before recount blocked
    const selfRecount = engine.recordIndependentRecount({
      adj_id: adj.adj_id,
      recounter_user_id: '101',
      verified_quantity_value: '2',
      recount_notes: 'Self recount attempt',
      recounted_at: '2026-11-06T08:15:00Z',
      expected_version: adj.version,
    });
    expect(selfRecount.ok).toBe(false);
    expect(selfRecount.code).toBe('RECOUNTER_INDEPENDENCE_REQUIRED');

    const earlyApprove = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'chapter_head_slot',
      approver_user_id: '201',
      approved_at: '2026-11-06T08:20:00Z',
      expected_version: adj.version,
    });
    expect(earlyApprove.ok).toBe(false);
    expect(earlyApprove.code).toBe('RECOUNT_REQUIRED_BEFORE_APPROVAL');

    // Valid independent recount by officer 302
    adj = engine.recordIndependentRecount({
      adj_id: adj.adj_id,
      recounter_user_id: '302',
      verified_quantity_value: '2',
      recount_notes: 'Verified 2 extra usable tents intact',
      recounted_at: '2026-11-06T08:30:00Z',
      expected_version: adj.version,
    }).data as CountVarianceAdjRecord;

    // Preparer 101 and Custodian 105 barred from BOTH slots
    const prepBlocked = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'chapter_head_slot',
      approver_user_id: '101',
      approved_at: '2026-11-06T08:35:00Z',
      expected_version: adj.version,
    });
    expect(prepBlocked.ok).toBe(false);
    expect(prepBlocked.code).toBe('PREPARER_OR_CUSTODIAN_BARRED');

    const custBlocked = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'finance_slot',
      approver_user_id: '105',
      approved_at: '2026-11-06T08:36:00Z',
      expected_version: adj.version,
    });
    expect(custBlocked.ok).toBe(false);
    expect(custBlocked.code).toBe('PREPARER_OR_CUSTODIAN_BARRED');

    // Officer 201 approves Chapter Head slot -> tries to also approve Finance slot -> blocked -> Independent fallback 203 approves Finance slot
    adj = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'chapter_head_slot',
      approver_user_id: '201',
      approved_at: '2026-11-06T08:40:00Z',
      expected_version: adj.version,
    }).data as CountVarianceAdjRecord;

    const sameDualBlocked = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'finance_slot',
      approver_user_id: '201',
      approved_at: '2026-11-06T08:45:00Z',
      expected_version: adj.version,
    });
    expect(sameDualBlocked.ok).toBe(false);
    expect(sameDualBlocked.code).toBe('DUAL_DUTY_SAME_PERSON_INSUFFICIENT');

    adj = engine.approveCountVarianceSlot({
      adj_id: adj.adj_id,
      slot: 'finance_slot',
      approver_user_id: '203',
      is_independent_fallback: true,
      approved_at: '2026-11-06T08:50:00Z',
      expected_version: adj.version,
    }).data as CountVarianceAdjRecord;
    expect(adj.status).toBe('approved_ready_to_post');

    // Post once -> usable becomes 12, GAIN-LOT created; second attempt rejected
    adj = engine.postApprovedCountVarianceAdj({
      adj_id: adj.adj_id,
      actor_user_id: '301',
      posted_at: '2026-11-06T09:00:00Z',
      expected_version: adj.version,
      idempotency_key: 'p17-post-1',
    }).data as CountVarianceAdjRecord;
    expect(adj.status).toBe('posted');
    expect(adj.gain_lot_reference).toBe('GAIN-LOT-CEBU-ADJ-VAR-2026-000001');
    expect(engine.getSnapshot().summary.recorded_usable_on_hand).toBe('12');

    const repostBlocked = engine.postApprovedCountVarianceAdj({
      adj_id: adj.adj_id,
      actor_user_id: '301',
      posted_at: '2026-11-06T09:05:00Z',
      expected_version: adj.version,
    });
    expect(repostBlocked.ok).toBe(false);
    expect(repostBlocked.code).toBe('ADJ_ALREADY_POSTED');

    const lookup = engine.lookupCountVarianceOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p17-post-1',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P17LookupResult).action_result).toBe('recovered');
  });

  it('retains zero ledger effect when variance ADJ is rejected, and handles damaged quarantine transfers', () => {
    const engine = createP17CountVarianceAdjEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });
    const pos = engine.registerLockedBaselinePosition({
      variant_id: '72',
      item_name: 'First Aid Kit',
      location_id: 'LOC-MAIN',
      custodian_user_id: '105',
      quantity_scale: 0,
      recorded_usable_value: '10',
      quarantined_value: '0',
    }).data as LockedCustodyPosition;

    let adj1 = engine.initiateCountVarianceAdj({
      position_id: pos.position_id,
      preparer_user_id: '101',
      variance_kind: 'negative_shortage',
      variance_quantity_value: '3',
      reason: 'Missing kits suspect',
      count_sheet_hash: 'b'.repeat(64),
      initiated_at: '2026-11-06T10:00:00Z',
    }).data as CountVarianceAdjRecord;

    adj1 = engine.rejectCountVarianceAdj({
      adj_id: adj1.adj_id,
      reviewer_user_id: '201',
      rejection_reason: 'Items located in Annex B shelf',
      rejected_at: '2026-11-06T10:15:00Z',
      expected_version: adj1.version,
    }).data as CountVarianceAdjRecord;
    expect(adj1.status).toBe('rejected');
    expect(engine.getSnapshot().summary.recorded_usable_on_hand).toBe('10');

    let adj2 = engine.initiateCountVarianceAdj({
      position_id: pos.position_id,
      preparer_user_id: '101',
      variance_kind: 'damaged_quarantine',
      variance_quantity_value: '2',
      reason: 'Water damaged outer casing',
      count_sheet_hash: 'c'.repeat(64),
      initiated_at: '2026-11-06T11:00:00Z',
    }).data as CountVarianceAdjRecord;
    adj2 = engine.recordIndependentRecount({
      adj_id: adj2.adj_id,
      recounter_user_id: '302',
      verified_quantity_value: '2',
      recount_notes: 'Confirmed 2 damaged',
      recounted_at: '2026-11-06T11:10:00Z',
      expected_version: adj2.version,
    }).data as CountVarianceAdjRecord;
    adj2 = engine.approveCountVarianceSlot({
      adj_id: adj2.adj_id,
      slot: 'chapter_head_slot',
      approver_user_id: '201',
      approved_at: '2026-11-06T11:20:00Z',
      expected_version: adj2.version,
    }).data as CountVarianceAdjRecord;
    adj2 = engine.approveCountVarianceSlot({
      adj_id: adj2.adj_id,
      slot: 'finance_slot',
      approver_user_id: '202',
      approved_at: '2026-11-06T11:25:00Z',
      expected_version: adj2.version,
    }).data as CountVarianceAdjRecord;
    engine.postApprovedCountVarianceAdj({
      adj_id: adj2.adj_id,
      actor_user_id: '301',
      posted_at: '2026-11-06T11:30:00Z',
      expected_version: adj2.version,
    });

    expect(engine.getSnapshot().summary.recorded_usable_on_hand).toBe('8');
    expect(engine.getSnapshot().summary.quarantined_stock).toBe('2');
  });
});
