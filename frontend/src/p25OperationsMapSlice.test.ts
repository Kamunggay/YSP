import { describe, expect, it } from 'vitest';
import { createP25OperationsMapEngine, P25_CONTEXT_STORAGE_KEY } from './p25OperationsMapSlice';
import type { LiveCorePostingCheck, P25LookupResult } from './p25OperationsMapSlice';

describe('p25OperationsMapSlice — Operations Map, Scenario Tracer & Non-Blocking Outage Guarantee', () => {
  it('starts strictly unseeded with empty live records while labeling reference views illustrative', () => {
    expect(P25_CONTEXT_STORAGE_KEY).toBe('ysp_p25_context');
    const engine = createP25OperationsMapEngine();
    const snap = engine.getSnapshot();

    expect(snap.live_operational_records).toEqual([]);
    expect(snap.map_views).toHaveLength(5);
    expect(snap.scenario_traces).toHaveLength(3);
    expect(snap.illustrative_label).toBe('ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA');
    expect(snap.summary.live_records_count).toBe(0);
    expect(snap.summary.map_unavailable).toBe(false);
  });

  it('enforces neutral scope restriction on provider-only / cross-chapter / unauthorized inspection', () => {
    const engine = createP25OperationsMapEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const providerBlocked = engine.inspectMapNodeOrFollowLink({
      node_id: 'sales_payment_gate',
      actor_user_id: '900',
      actor_chapter_id: '1',
      is_provider_admin_only: true,
      has_chapter_membership: false,
      actor_authorized_duties: ['finance_verifier'],
    });
    expect(providerBlocked.ok).toBe(false);
    expect(providerBlocked.code).toBe('NEUTRAL_SCOPE_RESTRICTED_EXPLANATION');
    expect(providerBlocked.message).not.toContain('GC-771201');
    expect(providerBlocked.message).not.toContain('Sensitive payer evidence');

    const crossChapterBlocked = engine.inspectMapNodeOrFollowLink({
      node_id: 'booth_closeout_node',
      actor_user_id: '202',
      actor_chapter_id: '2',
      is_provider_admin_only: false,
      has_chapter_membership: true,
      actor_authorized_duties: ['booth_reconciler'],
    });
    expect(crossChapterBlocked.ok).toBe(false);
    expect(crossChapterBlocked.code).toBe('NEUTRAL_SCOPE_RESTRICTED_EXPLANATION');

    const allowed = engine.inspectMapNodeOrFollowLink({
      node_id: 'sales_payment_gate',
      actor_user_id: '202',
      actor_chapter_id: '1',
      is_provider_admin_only: false,
      has_chapter_membership: true,
      actor_authorized_duties: ['finance_verifier'],
      idempotency_key: 'p25-insp-gate',
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.code).toBe('NODE_INSPECTED_AUTHORIZED');

    const lookup = engine.lookupOperationsMapOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p25-insp-gate',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P25LookupResult).action_result).toBe('recovered');
  });

  it('supports readable text alternative and guarantees core workflow posting succeeds during map failure', () => {
    const engine = createP25OperationsMapEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    engine.selectMapViewAndScenario({
      view_id: 'view_5_scenario_tracer',
      scenario_id: 'track2_booth_100_30_70',
    });
    engine.toggleReadableTextAlternative({ enabled: true });
    expect(engine.getSnapshot().text_alternative_enabled).toBe(true);

    // Simulate map outage -> authorized core workflow continues without blocking
    engine.setMapRendererFailureMode({
      map_unavailable: true,
      failure_reason: 'Diagram SVG service unresponsive',
    });
    expect(engine.getSnapshot().map_unavailable).toBe(true);

    const posted = engine.verifyCorePostingDuringMapFailure({
      actor_user_id: '202',
      action_label: 'Verify Official Receipt OR-2026-000010',
      quantity_posted: '5',
      posted_at: '2026-11-19T08:00:00Z',
      idempotency_key: 'p25-core-outage',
    });
    expect(posted.ok).toBe(true);
    expect(posted.code).toBe('CORE_WORKFLOW_UNAFFECTED_BY_MAP_OUTAGE');
    expect((posted.data as LiveCorePostingCheck).posted_during_map_outage).toBe(true);
    expect((posted.data as LiveCorePostingCheck).core_posting_unaffected).toBe(true);
    expect(engine.getSnapshot().summary.live_records_count).toBe(1);
  });
});
