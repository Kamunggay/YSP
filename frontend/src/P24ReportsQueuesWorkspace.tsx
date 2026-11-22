import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP24ReportsQueuesEngine } from './p24ReportsQueuesSlice';
import type {
  GeneratedReportOutput,
  P24ActionResult,
  P24EngineSnapshot,
  P24LookupResult,
  QueueBucket,
  ReportDateBasis,
  ReportGroupKind,
  ReportOutputFormat,
} from './p24ReportsQueuesSlice';

type P24TabId = 'stock' | 'queues' | 'exports' | 'history';

interface P24ReportsQueuesWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P24ReportsQueuesWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P24ReportsQueuesWorkspaceProps) {
  const engine = useMemo(() => createP24ReportsQueuesEngine(), []);
  const [snapshot, setSnapshot] = useState<P24EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P24TabId>('stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P24ActionResult | null>(snapshot.last_action);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [activeQueueBucket, setActiveQueueBucket] = useState<QueueBucket>('needs_my_action');

  // Tab 1: 7-View Stock Projections
  const [projSkuInput, setProjSkuInput] = useState('');
  const [projNameInput, setProjNameInput] = useState('');
  const [projUsableInput, setProjUsableInput] = useState('');
  const [projRfInput, setProjRfInput] = useState('');
  const [projSoInput, setProjSoInput] = useState('');
  const [projBoothInput, setProjBoothInput] = useState('');
  const [projQuarInput, setProjQuarInput] = useState('');
  const [projInboundInput, setProjInboundInput] = useState('');

  // Tab 2: Work Queues & Alerts
  const [qBucketInput, setQBucketInput] = useState<QueueBucket>('needs_my_action');
  const [qRefInput, setQRefInput] = useState('');
  const [qDutyInput, setQDutyInput] = useState('');
  const [qCatInput, setQCatInput] = useState('');
  const [qUrgencyInput, setQUrgencyInput] = useState('');
  const [qUncertainInput, setQUncertainInput] = useState(false);
  const [qSummaryInput, setQSummaryInput] = useState('');

  // Tab 3: Scoped Outputs, CSV Injection Escaping & Non-Reposting Retry
  const [expChapterInput, setExpChapterInput] = useState('');
  const [expActorInput, setExpActorInput] = useState('');
  const [expDisabledInput, setExpDisabledInput] = useState(false);
  const [expDutiesInput, setExpDutiesInput] = useState('');
  const [expReqDutyInput, setExpReqDutyInput] = useState('');
  const [expGroupInput, setExpGroupInput] = useState<ReportGroupKind>('finance_booth');
  const [expBasisInput, setExpBasisInput] = useState<ReportDateBasis>('actual_occurrence');
  const [expFormatInput, setExpFormatInput] = useState<ReportOutputFormat>('csv');
  const [expCellInput, setExpCellInput] = useState('');
  const [expAtInput, setExpAtInput] = useState('');

  // Tab 4: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P24ActionResult<P24LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P24ActionResult<T>): P24ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeReport: GeneratedReportOutput | undefined =
    snapshot.report_outputs.find((r) => r.report_id === selectedReportId) ??
    snapshot.report_outputs[0];

  const sortedActiveQueue = snapshot.queue_items
    .filter((q) => q.bucket === activeQueueBucket)
    .sort((a, b) => {
      if (a.is_uncertain_outcome !== b.is_uncertain_outcome) {
        return a.is_uncertain_outcome ? -1 : 1;
      }
      if (a.urgency_rank !== b.urgency_rank) {
        return a.urgency_rank - b.urgency_rank;
      }
      return a.queue_item_id.localeCompare(b.queue_item_id);
    });

  function handleRecordProjection() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordCommittedStockProjection({
        sku_code: projSkuInput,
        item_name: projNameInput,
        usable_on_hand_qty: projUsableInput,
        rf_reserved_qty: projRfInput,
        so_reserved_qty: projSoInput,
        booth_custody_qty: projBoothInput,
        quarantined_qty: projQuarInput,
        inbound_po_qty: projInboundInput,
        idempotency_key: nextSequentialKey('p24-proj'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleEnqueueAlert() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.enqueueWorkQueueAlertItem({
        bucket: qBucketInput,
        record_reference: qRefInput,
        responsible_duty: qDutyInput,
        alert_category: qCatInput,
        urgency_rank: Number(qUrgencyInput),
        is_uncertain_outcome: qUncertainInput,
        summary_text: qSummaryInput,
        idempotency_key: nextSequentialKey('p24-queue'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleFilterBucket(bucket: QueueBucket) {
    playClickPen(soundEnabled);
    setActiveQueueBucket(bucket);
    refreshSnapshot(
      engine.filterScopedWorkQueue({
        bucket,
        chapter_id: snapshot.chapter_id,
      })
    );
  }

  function handleGenerateReport() {
    playClickPen(soundEnabled);
    const duties = expDutiesInput
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    const cells = expCellInput
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const res = refreshSnapshot(
      engine.generateScopedReportOutput({
        target_chapter_id: expChapterInput.trim() || snapshot.chapter_id,
        actor_user_id: expActorInput,
        actor_disabled: expDisabledInput,
        actor_authorized_duties: duties,
        required_duty: expReqDutyInput,
        report_group: expGroupInput,
        date_basis: expBasisInput,
        output_format: expFormatInput,
        sample_cell_values: cells.length > 0 ? cells : ['Normal summary'],
        generated_at: expAtInput,
        idempotency_key: nextSequentialKey('p24-report'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedReportId(res.data.report_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRetryReport() {
    playClickPen(soundEnabled);
    if (!activeReport) return;
    const duties = expDutiesInput
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    const res = refreshSnapshot(
      engine.retryReportOutputJob({
        report_id: activeReport.report_id,
        actor_user_id: expActorInput,
        actor_disabled: expDisabledInput,
        actor_authorized_duties: duties,
        retried_at: expAtInput,
        idempotency_key: nextSequentialKey('p24-retry'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupReportsQueuesOperation({
        query_type: 'by_key',
        chapter_id: snapshot.chapter_id,
        idempotency_key: lookupKeyInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByUlid() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupReportsQueuesOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleProjections = snapshot.stock_projections.filter(
    (p) =>
      !normalizedSearch ||
      p.sku_code.toLowerCase().includes(normalizedSearch) ||
      p.item_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p24-workspace">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="p24-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stock projections or reports"
                aria-label="Search reports and projections"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Reports, Alerts, Immutable Outputs &amp; Accessible Queues
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Reports and work queue tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p24-tab-stock"
                  aria-selected={activeTab === 'stock'}
                  className={`p03-filter-pill ${activeTab === 'stock' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('stock');
                  }}
                >
                  Seven Stock Views
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p24-tab-queues"
                  aria-selected={activeTab === 'queues'}
                  className={`p03-filter-pill ${activeTab === 'queues' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('queues');
                  }}
                >
                  Work Queues &amp; Alerts
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p24-tab-exports"
                  aria-selected={activeTab === 'exports'}
                  className={`p03-filter-pill ${activeTab === 'exports' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('exports');
                  }}
                >
                  Scoped Exports &amp; Retries
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p24-tab-history"
                  aria-selected={activeTab === 'history'}
                  className={`p03-filter-pill ${activeTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('history');
                  }}
                >
                  Audit History &amp; Recovery
                </button>
              </div>

              <button
                type="button"
                id="p24-back-dashboard-btn"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={() => {
                  playClickPen(soundEnabled);
                  onBackToDashboard();
                }}
              >
                Back to Chapter Workspace
              </button>
            </div>
          </div>
        </header>

        <section className="p03-card surface-card" aria-labelledby="p24-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p24-overview-heading" className="p03-section-title">
              Seven Non-Additive Stock Views — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Reports Issued: <strong>{snapshot.summary.generated_reports_count}</strong>
              </span>
              <span className="p03-version-pill">
                Items: <strong>{visibleProjections.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Usable On-Hand</span>
              <span className="p03-axis-val" data-testid="p24-usable-on-hand-val">
                {snapshot.summary.usable_on_hand_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Available to Allocate</span>
              <span className="p03-axis-val" data-testid="p24-available-val">
                {snapshot.summary.available_to_allocate_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">RF Reserved</span>
              <span className="p03-axis-val" data-testid="p24-rf-reserved-val">
                {snapshot.summary.rf_reserved_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">SO Reserved</span>
              <span className="p03-axis-val" data-testid="p24-so-reserved-val">
                {snapshot.summary.so_reserved_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Booth Custody</span>
              <span className="p03-axis-val" data-testid="p24-booth-custody-val">
                {snapshot.summary.booth_custody_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Quarantined / Rejected</span>
              <span className="p03-axis-val" data-testid="p24-quarantined-val">
                {snapshot.summary.quarantined_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Inbound Open PO</span>
              <span className="p03-axis-val" data-testid="p24-inbound-po-val">
                {snapshot.summary.inbound_po_total}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p24-feedback-banner"
              aria-live="polite"
            >
              <span
                className={`callout-dot ${lastResult.ok ? 'dot-success' : 'dot-error'}`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {lastResult.code} (HTTP {lastResult.http_status})
                </strong>
                <div>{lastResult.message}</div>
              </div>
            </div>
          ) : null}
        </section>

        {/* TAB 1: Seven-View Projections */}
        {activeTab === 'stock' ? (
          <section className="p03-card surface-card" aria-labelledby="p24-proj-heading">
            <h2 id="p24-proj-heading" className="p03-section-title">
              Record Committed Item Stock Projection
            </h2>
            <p className="p03-muted-copy">
              Usable stockroom on-hand includes reserved goods. Available stock derives strictly from
              usable on-hand minus RF and SO reservations without summing overlapping pools.
            </p>
            <div className="form-group">
              <label htmlFor="p24-proj-sku" className="form-label">
                Item SKU Code
              </label>
              <input
                id="p24-proj-sku"
                type="text"
                className="form-control p03-mono-inline"
                value={projSkuInput}
                placeholder="MERCH-KIT-01"
                onChange={(e) => setProjSkuInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-name" className="form-label">
                Item Description
              </label>
              <input
                id="p24-proj-name"
                type="text"
                className="form-control"
                value={projNameInput}
                placeholder="Chapter Advocacy Tee"
                onChange={(e) => setProjNameInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-usable" className="form-label">
                Usable On-Hand Qty
              </label>
              <input
                id="p24-proj-usable"
                type="text"
                className="form-control p03-mono-inline"
                value={projUsableInput}
                placeholder="10"
                onChange={(e) => setProjUsableInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-rf" className="form-label">
                RF Reserved Qty
              </label>
              <input
                id="p24-proj-rf"
                type="text"
                className="form-control p03-mono-inline"
                value={projRfInput}
                placeholder="4"
                onChange={(e) => setProjRfInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-so" className="form-label">
                SO Reserved Qty
              </label>
              <input
                id="p24-proj-so"
                type="text"
                className="form-control p03-mono-inline"
                value={projSoInput}
                placeholder="3"
                onChange={(e) => setProjSoInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-booth" className="form-label">
                Booth Custody Qty
              </label>
              <input
                id="p24-proj-booth"
                type="text"
                className="form-control p03-mono-inline"
                value={projBoothInput}
                placeholder="20"
                onChange={(e) => setProjBoothInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-quar" className="form-label">
                Quarantined / Rejected Qty
              </label>
              <input
                id="p24-proj-quar"
                type="text"
                className="form-control p03-mono-inline"
                value={projQuarInput}
                placeholder="2"
                onChange={(e) => setProjQuarInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p24-proj-inbound" className="form-label">
                Inbound Open PO Qty
              </label>
              <input
                id="p24-proj-inbound"
                type="text"
                className="form-control p03-mono-inline"
                value={projInboundInput}
                placeholder="50"
                onChange={(e) => setProjInboundInput(e.target.value)}
              />
            </div>
            <div className="p03-guard-buttons">
              <button
                type="button"
                id="p24-record-proj-btn"
                className="btn-batcave-primary"
                onClick={handleRecordProjection}
              >
                Record Stock Projection
              </button>
            </div>
            {snapshot.stock_projections.length === 0 ? (
              <p className="p03-muted-copy" data-testid="p24-empty-projections-notice">
                No committed stock projections or work alerts loaded yet.
              </p>
            ) : null}
          </section>
        ) : null}

        {/* TAB 2: Zero-Reload Accessible Work Queues */}
        {activeTab === 'queues' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p24-q-form-heading">
              <h2 id="p24-q-form-heading" className="p03-section-title">
                Enqueue Scoped Officer Alert Item
              </h2>
              <div className="form-group">
                <label htmlFor="p24-q-bucket" className="form-label">
                  Queue Category
                </label>
                <select
                  id="p24-q-bucket"
                  className="form-control"
                  value={qBucketInput}
                  onChange={(e) => setQBucketInput(e.target.value as QueueBucket)}
                >
                  <option value="needs_my_action">Needs My Action</option>
                  <option value="waiting_on_others">Waiting on Others</option>
                  <option value="resolved_history">Resolved History</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p24-q-ref" className="form-label">
                  Linked Record Reference
                </label>
                <input
                  id="p24-q-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={qRefInput}
                  placeholder="CEBU-DR-2026-000008"
                  onChange={(e) => setQRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-q-duty" className="form-label">
                  Responsible Duty
                </label>
                <input
                  id="p24-q-duty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={qDutyInput}
                  placeholder="dispatch_custodian"
                  onChange={(e) => setQDutyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-q-cat" className="form-label">
                  Alert Type
                </label>
                <input
                  id="p24-q-cat"
                  type="text"
                  className="form-control"
                  value={qCatInput}
                  placeholder="uncertain_outcome"
                  onChange={(e) => setQCatInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-q-urgency" className="form-label">
                  Urgency Priority (1 = Top)
                </label>
                <input
                  id="p24-q-urgency"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={qUrgencyInput}
                  placeholder="1"
                  onChange={(e) => setQUrgencyInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p24-q-uncertain"
                  type="checkbox"
                  checked={qUncertainInput}
                  onChange={(e) => setQUncertainInput(e.target.checked)}
                />
                <label htmlFor="p24-q-uncertain">
                  Uncertain commit outcome (pin to top of queue)
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p24-q-summary" className="form-label">
                  Officer Action Summary
                </label>
                <input
                  id="p24-q-summary"
                  type="text"
                  className="form-control"
                  value={qSummaryInput}
                  placeholder="Inspect uncertain release"
                  onChange={(e) => setQSummaryInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p24-enqueue-btn"
                  className="btn-batcave-secondary"
                  onClick={handleEnqueueAlert}
                >
                  Add Queue Alert Item
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p24-q-list-heading">
              <h2 id="p24-q-list-heading" className="p03-section-title">
                Zero-Reload Officer Queue Filter
              </h2>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p24-filter-needs-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleFilterBucket('needs_my_action')}
                >
                  Needs My Action
                </button>
                <button
                  type="button"
                  id="p24-filter-waiting-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleFilterBucket('waiting_on_others')}
                >
                  Waiting on Others
                </button>
              </div>
              <div className="p03-guard-buttons" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  id="p24-filter-resolved-btn"
                  className="btn-batcave-secondary"
                  onClick={() => handleFilterBucket('resolved_history')}
                >
                  Resolved History
                </button>
              </div>

              {sortedActiveQueue.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p24-queue-empty">
                  No matching items in {activeQueueBucket}.
                </p>
              ) : (
                <div className="p03-queue-list" data-testid="p24-queue-list">
                  {sortedActiveQueue.map((item) => (
                    <div key={item.queue_item_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {item.record_reference} — {item.alert_category}
                          {item.is_uncertain_outcome ? ' [UNCERTAIN FIRST]' : ''}
                        </strong>
                        <span className="p03-muted-copy">{item.summary_text}</span>
                      </div>
                      <span className="p03-mono-inline">
                        {item.responsible_duty} (#{item.urgency_rank})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Scoped Exports & Safe Retries */}
        {activeTab === 'exports' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p24-exp-heading">
              <h2 id="p24-exp-heading" className="p03-section-title">
                Generate Scoped PDF / CSV Report Snapshot
              </h2>
              <div className="form-group">
                <label htmlFor="p24-exp-chapter" className="form-label">
                  Target Chapter ID
                </label>
                <input
                  id="p24-exp-chapter"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expChapterInput}
                  placeholder="1"
                  onChange={(e) => setExpChapterInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-actor" className="form-label">
                  Exporting Officer ID
                </label>
                <input
                  id="p24-exp-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expActorInput}
                  placeholder="202"
                  onChange={(e) => setExpActorInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p24-exp-disabled"
                  type="checkbox"
                  checked={expDisabledInput}
                  onChange={(e) => setExpDisabledInput(e.target.checked)}
                />
                <label htmlFor="p24-exp-disabled">
                  Simulate disabled / revoked officer access (must block)
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-duties" className="form-label">
                  Officer Active Duties
                </label>
                <input
                  id="p24-exp-duties"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expDutiesInput}
                  placeholder="finance_verifier"
                  onChange={(e) => setExpDutiesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-req-duty" className="form-label">
                  Required Report Duty
                </label>
                <input
                  id="p24-exp-req-duty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expReqDutyInput}
                  placeholder="finance_verifier"
                  onChange={(e) => setExpReqDutyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-group" className="form-label">
                  Report Domain Group
                </label>
                <select
                  id="p24-exp-group"
                  className="form-control"
                  value={expGroupInput}
                  onChange={(e) => setExpGroupInput(e.target.value as ReportGroupKind)}
                >
                  <option value="inventory">Inventory Seven-View Balances</option>
                  <option value="demand_procurement">Demand &amp; Procurement</option>
                  <option value="finance_booth">Finance &amp; Booth Reconciliation</option>
                  <option value="control_audit">Donations, Counts &amp; Audit</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-basis" className="form-label">
                  Date Basis Filter
                </label>
                <select
                  id="p24-exp-basis"
                  className="form-control"
                  value={expBasisInput}
                  onChange={(e) => setExpBasisInput(e.target.value as ReportDateBasis)}
                >
                  <option value="actual_occurrence">Actual Occurrence Time</option>
                  <option value="entry_verification_posting">Entry / Verification Time</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-format" className="form-label">
                  Output Format
                </label>
                <select
                  id="p24-exp-format"
                  className="form-control"
                  value={expFormatInput}
                  onChange={(e) => setExpFormatInput(e.target.value as ReportOutputFormat)}
                >
                  <option value="csv">Safe Escaped CSV Export</option>
                  <option value="pdf">Immutable PDF Snapshot</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-cell" className="form-label">
                  Export Data Cells (CSV Safety)
                </label>
                <input
                  id="p24-exp-cell"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expCellInput}
                  placeholder="=SUM(A1:A2),+100"
                  onChange={(e) => setExpCellInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-exp-at" className="form-label">
                  Generation Timestamp (UTC)
                </label>
                <input
                  id="p24-exp-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={expAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setExpAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p24-generate-report-btn"
                  className="btn-batcave-primary"
                  onClick={handleGenerateReport}
                >
                  Generate Scoped Report
                </button>
                <button
                  type="button"
                  id="p24-retry-report-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRetryReport}
                >
                  Retry Queued Output
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p24-preview-heading">
              <h2 id="p24-preview-heading" className="p03-section-title">
                Immutable Report Snapshot Preview
              </h2>
              {activeReport ? (
                <div data-testid="p24-report-preview">
                  <p>
                    <strong>{activeReport.document_reference}</strong> ({activeReport.date_basis},
                    retries: {activeReport.retry_count}, reposted:{' '}
                    {String(activeReport.reposted_effect)})
                  </p>
                  <p className="p03-mono-inline">{activeReport.snapshot_hash}</p>
                  <pre className="p03-mono-inline">{activeReport.rendered_csv_preview}</pre>
                </div>
              ) : (
                <p className="p03-muted-copy">No report snapshots generated yet.</p>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p24-audit-heading">
              <h2 id="p24-audit-heading" className="p03-section-title">
                Reporting, Alert &amp; Export Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No reporting or export activity recorded yet.</p>
              ) : (
                <div className="p03-queue-list">
                  {snapshot.history.map((h) => (
                    <div key={h.event_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{h.action}</strong>
                        <span className="p03-muted-copy">{h.reason}</span>
                      </div>
                      <span className="p03-mono-inline">Actor {h.actor_user_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p24-lookup-heading">
              <h2 id="p24-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p24-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p24-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p24-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p24-lookup-ulid-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupUlidInput}
                  placeholder="Operation ULID"
                  onChange={(e) => setLookupUlidInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p24-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p24-lookup-by-ulid-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByUlid}
                >
                  Recover by ID
                </button>
              </div>
              {snapshot.operation_ledger.length > 0 ? (
                <div className="p03-queue-list">
                  {snapshot.operation_ledger.map((op) => (
                    <div key={op.operation_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{op.code}</strong>
                        <span className="p03-mono-inline">
                          {op.operation_id} ({op.idempotency_key})
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-batcave-secondary p03-shrink-btn"
                        data-testid={`p24-ledger-fill-${op.operation_id}`}
                        onClick={() => {
                          setLookupKeyInput(op.idempotency_key);
                          setLookupUlidInput(op.operation_id);
                        }}
                      >
                        Fill Lookup
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {lookupResult ? (
                <div className="callout-banner" data-testid="p24-lookup-result" aria-live="polite">
                  <span className="callout-dot dot-success" aria-hidden="true" />
                  <div>
                    <strong>{lookupResult.code}</strong>
                    <div>{lookupResult.message}</div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
