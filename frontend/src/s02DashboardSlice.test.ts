import { describe, expect, it } from 'vitest';
import {
  createS02DashboardEngine,
  DASHBOARD_WORKSTATION_GROUPS,
  evaluateQueueAuthority,
  formatPhpCurrency,
  sortDashboardQueue,
} from './s02DashboardSlice';
import type { DashboardQueueItem } from './s02DashboardSlice';

describe('S-02 My Work Officer Dashboard Engine', () => {
  it('initializes with a strictly unseeded zero state and zero synthetic items', () => {
    const engine = createS02DashboardEngine();
    const snap = engine.getSnapshot();

    expect(snap.queue_items).toEqual([]);
    expect(snap.inspection_log).toEqual([]);
    expect(snap.operation_ledger).toEqual([]);
    expect(snap.last_action).toBeNull();
    expect(snap.operational_pulse).toEqual({
      usable_on_hand: '0',
      available_to_allocate: '0',
      active_clocks_48h: '0',
      unverified_payments_count: '0',
      unverified_cash_total: '0.00',
      booth_custody_units: '0',
      critical_rop_alerts: '0',
    });
    expect(snap.chapter_lifecycle).toEqual({
      subscription_phase: 'not_activated',
      days_remaining: '0',
      maintenance_fenced: false,
      maintenance_notice: '',
    });
    expect(formatPhpCurrency('0.00')).toBe('₱0.00');
  });

  it('retains all 7 functional domains and all 28 exact workspace launcher button IDs', () => {
    expect(DASHBOARD_WORKSTATION_GROUPS).toHaveLength(7);

    const allEntries = DASHBOARD_WORKSTATION_GROUPS.flatMap((group) => group.items);
    expect(allEntries).toHaveLength(28);

    const ids = allEntries.map((entry) => entry.id);
    const routes = allEntries.map((entry) => entry.route);
    expect(new Set(ids).size).toBe(28);
    expect(new Set(routes).size).toBe(28);

    for (let pkg = 2; pkg <= 29; pkg++) {
      const padded = String(pkg).padStart(2, '0');
      expect(ids).toContain(`open-p${padded}-workspace-btn`);
    }
  });

  it('sorts queues uncertain-first then overdue then earliest deadline, keeps inspected items open, and enforces GOV-06 self-approval blocks', () => {
    const engine = createS02DashboardEngine();

    const ordinaryRes = engine.enqueueWorkItem({
      bucket: 'needs_my_action',
      record_reference: 'RF-2026-001',
      title: 'Standard Requisition Review',
      summary: 'Awaiting stockroom custody clearance.',
      category: 'Requisition',
      responsible_duty: 'Inventory Custodian',
      target_route: 'p07-requisitions',
      due_at_utc: '2026-11-24T12:00:00Z',
      is_uncertain_outcome: false,
      is_overdue: false,
      urgency_rank: 3,
      preparer_actor_id: 'Officer Two',
      requires_independent_approval: true,
      idempotency_key: 's02-q-seq-1',
    });
    expect(ordinaryRes.ok).toBe(true);

    const overdueRes = engine.enqueueWorkItem({
      bucket: 'needs_my_action',
      record_reference: 'SO-2026-002',
      title: '48h Reservation Expiring',
      summary: 'Buyer payment clock is past the threshold.',
      category: '48h Clock',
      responsible_duty: 'Finance Officer',
      target_route: 'p12-sales',
      due_at_utc: '2026-11-22T09:00:00Z',
      is_uncertain_outcome: false,
      is_overdue: true,
      urgency_rank: 2,
      preparer_actor_id: 'Officer Three',
      requires_independent_approval: true,
      idempotency_key: 's02-q-seq-2',
    });
    expect(overdueRes.ok).toBe(true);

    const uncertainRes = engine.enqueueWorkItem({
      bucket: 'needs_my_action',
      record_reference: 'OR-2026-003',
      title: 'Interrupted OR Posting Recovery',
      summary: 'Confirm bank reference posting outcome before retrying.',
      category: 'Uncertain Outcome',
      responsible_duty: 'Finance Officer',
      target_route: 'p13-payments',
      due_at_utc: '2026-11-23T08:00:00Z',
      is_uncertain_outcome: true,
      is_overdue: false,
      urgency_rank: 5,
      preparer_actor_id: 'Verified Officer',
      requires_independent_approval: true,
      idempotency_key: 's02-q-seq-3',
    });
    expect(uncertainRes.ok).toBe(true);

    const sorted = engine.getSnapshot().queue_items;
    expect(sorted.map((item) => item.record_reference)).toEqual([
      'OR-2026-003',
      'SO-2026-002',
      'RF-2026-001',
    ]);

    const uncertainItem = sorted[0] as DashboardQueueItem;
    const inspectRes = engine.inspectWorkItem({
      queue_item_id: uncertainItem.queue_item_id,
      inspected_at_utc: '2026-11-22T17:35:00Z',
    });
    expect(inspectRes.ok).toBe(true);
    expect(inspectRes.code).toBe('ALERT_INSPECTED_TASK_REMAINS_OPEN');
    expect(inspectRes.data?.bucket).toBe('needs_my_action');
    expect(inspectRes.data?.inspection_count).toBe(1);

    const selfAuth = evaluateQueueAuthority(
      uncertainItem,
      'Verified Officer',
      ['Finance Officer']
    );
    expect(selfAuth.can_act).toBe(false);
    expect(selfAuth.independence_blocked).toBe(true);
    expect(selfAuth.alternate_admin_route).toBe('p02-admin');

    const dutyBlockedAuth = evaluateQueueAuthority(
      sorted[1] as DashboardQueueItem,
      'Verified Officer',
      ['Inventory Custodian']
    );
    expect(dutyBlockedAuth.can_act).toBe(false);
    expect(dutyBlockedAuth.duty_blocked).toBe(true);
    expect(dutyBlockedAuth.alternate_admin_route).toBe('p02-admin');

    const tiedSorted = sortDashboardQueue([
      { ...uncertainItem, is_uncertain_outcome: false, is_overdue: false, due_at_utc: '' },
      { ...uncertainItem, is_uncertain_outcome: false, is_overdue: false, due_at_utc: '2026-11-22T01:00:00Z', queue_item_id: 'S02-Q-0099' },
    ]);
    expect(tiedSorted[0]?.due_at_utc).toBe('2026-11-22T01:00:00Z');
  });

  it('enforces exact BigInt pulse bounds, maintenance notices, idempotency replay, and canonical record prefix jumps', () => {
    const engine = createS02DashboardEngine();

    const exceedRes = engine.updateOperationalPulse({
      usable_on_hand: '20',
      available_to_allocate: '25',
      active_clocks_48h: '2',
      unverified_payments_count: '3',
      unverified_cash_total: '1250.5',
      booth_custody_units: '10',
      critical_rop_alerts: '1',
      idempotency_key: 's02-pulse-seq-1',
    });
    expect(exceedRes.ok).toBe(false);
    expect(exceedRes.code).toBe('AVAILABLE_EXCEEDS_USABLE_ON_HAND');

    const badMoneyRes = engine.updateOperationalPulse({
      usable_on_hand: '20',
      available_to_allocate: '10',
      active_clocks_48h: '2',
      unverified_payments_count: '3',
      unverified_cash_total: '-10.00',
      booth_custody_units: '10',
      critical_rop_alerts: '1',
      idempotency_key: 's02-pulse-seq-2',
    });
    expect(badMoneyRes.ok).toBe(false);
    expect(badMoneyRes.code).toBe('INVALID_CURRENCY_AMOUNT');

    const okPulseRes = engine.updateOperationalPulse({
      usable_on_hand: '42',
      available_to_allocate: '30',
      active_clocks_48h: '2',
      unverified_payments_count: '4',
      unverified_cash_total: '1250.5',
      booth_custody_units: '15',
      critical_rop_alerts: '1',
      idempotency_key: 's02-pulse-seq-3',
    });
    expect(okPulseRes.ok).toBe(true);
    expect(okPulseRes.data?.unverified_cash_total).toBe('1250.50');
    expect(formatPhpCurrency(okPulseRes.data?.unverified_cash_total ?? '0')).toBe('₱1,250.50');

    const replayPulse = engine.updateOperationalPulse({
      usable_on_hand: '42',
      available_to_allocate: '30',
      active_clocks_48h: '2',
      unverified_payments_count: '4',
      unverified_cash_total: '1250.5',
      booth_custody_units: '15',
      critical_rop_alerts: '1',
      idempotency_key: 's02-pulse-seq-3',
    });
    expect(replayPulse.ok).toBe(true);
    expect(replayPulse.code).toBe('OPERATION_RECOVERED');

    const mismatchPulse = engine.updateOperationalPulse({
      usable_on_hand: '99',
      available_to_allocate: '30',
      active_clocks_48h: '2',
      unverified_payments_count: '4',
      unverified_cash_total: '1250.5',
      booth_custody_units: '15',
      critical_rop_alerts: '1',
      idempotency_key: 's02-pulse-seq-3',
    });
    expect(mismatchPulse.ok).toBe(false);
    expect(mismatchPulse.http_status).toBe(409);
    expect(mismatchPulse.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');

    const missingNoticeRes = engine.updateChapterLifecycle({
      subscription_phase: 'grace_read_export',
      days_remaining: '14',
      maintenance_fenced: true,
      maintenance_notice: '',
      idempotency_key: 's02-life-seq-1',
    });
    expect(missingNoticeRes.ok).toBe(false);
    expect(missingNoticeRes.code).toBe('MAINTENANCE_NOTICE_REQUIRED');

    const validLifeRes = engine.updateChapterLifecycle({
      subscription_phase: 'grace_read_export',
      days_remaining: '14',
      maintenance_fenced: true,
      maintenance_notice: 'DB backup window from 22:00 to 22:30 UTC.',
      idempotency_key: 's02-life-seq-2',
    });
    expect(validLifeRes.ok).toBe(true);

    expect(engine.resolveRecordPrefixJump('rf-2026-001').data?.route).toBe('p07-requisitions');
    expect(engine.resolveRecordPrefixJump('SO-2026-002').data?.route).toBe('p12-sales');
    expect(engine.resolveRecordPrefixJump('OR-2026-088').data?.route).toBe('p13-payments');
    expect(engine.resolveRecordPrefixJump('BTH-2026-011').data?.route).toBe('p20-booth-checkout');

    const unknownJump = engine.resolveRecordPrefixJump('ZZZ-999');
    expect(unknownJump.ok).toBe(false);
    expect(unknownJump.code).toBe('UNKNOWN_RECORD_PREFIX');

    expect(engine.lookupOperation('s02-pulse-seq-3').code).toBe('OPERATION_RECOVERED');
    expect(engine.lookupOperation('missing-key').code).toBe('OPERATION_NOT_VISIBLE');
  });
});
