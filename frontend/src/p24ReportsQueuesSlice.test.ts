import { describe, expect, it } from 'vitest';
import { createP24ReportsQueuesEngine, P24_CONTEXT_STORAGE_KEY } from './p24ReportsQueuesSlice';
import type {
  FilteredWorkQueueView,
  GeneratedReportOutput,
  P24LookupResult,
  StockSevenViewProjection,
} from './p24ReportsQueuesSlice';

describe('p24ReportsQueuesSlice — Complete Reports, Alerts, Outputs & Accessible Queues', () => {
  it('starts strictly unseeded with empty projections, queue items, reports, and zero metrics', () => {
    expect(P24_CONTEXT_STORAGE_KEY).toBe('ysp_p24_context');
    const engine = createP24ReportsQueuesEngine();
    const snap = engine.getSnapshot();

    expect(snap.stock_projections).toEqual([]);
    expect(snap.queue_items).toEqual([]);
    expect(snap.report_outputs).toEqual([]);
    expect(snap.summary).toEqual({
      usable_on_hand_total: '0',
      available_to_allocate_total: '0',
      rf_reserved_total: '0',
      so_reserved_total: '0',
      booth_custody_total: '0',
      quarantined_total: '0',
      inbound_po_total: '0',
      generated_reports_count: 0,
    });
  });

  it('tracks all 7 non-additive views (10/4/3->3), sorts uncertain queue items first without side effects', () => {
    const engine = createP24ReportsQueuesEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const proj = engine.recordCommittedStockProjection({
      sku_code: 'MERCH-KIT-01',
      item_name: 'Chapter Advocacy Tee',
      usable_on_hand_qty: '10',
      rf_reserved_qty: '4',
      so_reserved_qty: '3',
      booth_custody_qty: '20',
      quarantined_qty: '2',
      inbound_po_qty: '50',
    }).data as StockSevenViewProjection;
    expect(proj.available_to_allocate_qty).toBe('3');
    expect(engine.getSnapshot().summary).toEqual({
      usable_on_hand_total: '10',
      available_to_allocate_total: '3',
      rf_reserved_total: '4',
      so_reserved_total: '3',
      booth_custody_total: '20',
      quarantined_total: '2',
      inbound_po_total: '50',
      generated_reports_count: 0,
    });

    engine.enqueueWorkQueueAlertItem({
      bucket: 'needs_my_action',
      record_reference: 'CEBU-SO-2026-000010',
      responsible_duty: 'finance_verifier',
      alert_category: 'deposit_deadline',
      urgency_rank: 1,
      is_uncertain_outcome: false,
      summary_text: 'Deposit clock expires in 2 hours',
    });
    engine.enqueueWorkQueueAlertItem({
      bucket: 'needs_my_action',
      record_reference: 'CEBU-DR-2026-000008',
      responsible_duty: 'dispatch_custodian',
      alert_category: 'uncertain_outcome',
      urgency_rank: 3,
      is_uncertain_outcome: true,
      summary_text: 'Verify uncertain signed release result before retry',
    });

    const filtered = engine.filterScopedWorkQueue({
      bucket: 'needs_my_action',
      chapter_id: '1',
    }).data as FilteredWorkQueueView;
    expect(filtered.posted_mutations_count).toBe(0);
    expect(filtered.items[0]?.record_reference).toBe('CEBU-DR-2026-000008');
    expect(filtered.items[0]?.is_uncertain_outcome).toBe(true);
    expect(filtered.items[1]?.record_reference).toBe('CEBU-SO-2026-000010');
  });

  it('blocks cross-chapter/disabled exports, sanitizes CSV formula injection, and retains immutable hash on retry', () => {
    const engine = createP24ReportsQueuesEngine({ chapter_id: '1', chapter_prefix: 'CEBU' });

    const crossChapter = engine.generateScopedReportOutput({
      target_chapter_id: '2',
      actor_user_id: '202',
      actor_disabled: false,
      actor_authorized_duties: ['finance_verifier'],
      required_duty: 'finance_verifier',
      report_group: 'finance_booth',
      date_basis: 'actual_occurrence',
      output_format: 'csv',
      sample_cell_values: ['Normal Cell'],
      generated_at: '2026-11-18T10:00:00Z',
    });
    expect(crossChapter.ok).toBe(false);
    expect(crossChapter.code).toBe('CROSS_CHAPTER_EXPORT_FORBIDDEN');

    const disabledExport = engine.generateScopedReportOutput({
      target_chapter_id: '1',
      actor_user_id: '202',
      actor_disabled: true,
      actor_authorized_duties: ['finance_verifier'],
      required_duty: 'finance_verifier',
      report_group: 'finance_booth',
      date_basis: 'actual_occurrence',
      output_format: 'csv',
      sample_cell_values: ['=CMD("calc")'],
      generated_at: '2026-11-18T10:00:00Z',
    });
    expect(disabledExport.ok).toBe(false);
    expect(disabledExport.code).toBe('DISABLED_OR_UNAUTHORIZED_EXPORT_BLOCKED');

    const report = engine.generateScopedReportOutput({
      target_chapter_id: '1',
      actor_user_id: '202',
      actor_disabled: false,
      actor_authorized_duties: ['finance_verifier'],
      required_duty: 'finance_verifier',
      report_group: 'finance_booth',
      date_basis: 'actual_occurrence',
      output_format: 'csv',
      sample_cell_values: ['=SUM(A1:A2)', '+100', '@malicious'],
      generated_at: '2026-11-18T10:05:00Z',
      idempotency_key: 'p24-gen-rpt',
    }).data as GeneratedReportOutput;

    expect(report.sanitized_cells).toEqual(["'=SUM(A1:A2)", "'+100", "'@malicious"]);
    expect(report.reposted_effect).toBe(false);

    // Disabled user blocked from queued retry; authorized retry keeps same document ref & hash
    const disabledRetry = engine.retryReportOutputJob({
      report_id: report.report_id,
      actor_user_id: '202',
      actor_disabled: true,
      actor_authorized_duties: ['finance_verifier'],
      retried_at: '2026-11-18T10:10:00Z',
    });
    expect(disabledRetry.ok).toBe(false);
    expect(disabledRetry.code).toBe('DISABLED_OR_UNAUTHORIZED_EXPORT_BLOCKED');

    const retried = engine.retryReportOutputJob({
      report_id: report.report_id,
      actor_user_id: '202',
      actor_disabled: false,
      actor_authorized_duties: ['finance_verifier'],
      retried_at: '2026-11-18T10:12:00Z',
    }).data as GeneratedReportOutput;
    expect(retried.document_reference).toBe(report.document_reference);
    expect(retried.snapshot_hash).toBe(report.snapshot_hash);
    expect(retried.reposted_effect).toBe(false);

    const lookup = engine.lookupReportsQueuesOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p24-gen-rpt',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P24LookupResult).action_result).toBe('recovered');
  });
});
