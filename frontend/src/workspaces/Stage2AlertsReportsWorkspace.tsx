import { useCallback, useEffect, useState } from 'react';
import { formatManilaTime } from '../api/client.ts';
import {
  listAllocationQueue,
  listOfficerAlerts,
  printControlReport,
  printInventoryReport,
  printProcurementReport,
  readControlReport,
  readInventoryReport,
  readProcurementReport,
  validateReportDateRange,
} from '../api/stage2Client.ts';
import type {
  AllocationQueueEntry,
  ControlReportResponse,
  ControlReportStatus,
  InventoryReportResponse,
  InventoryReportStatus,
  OfficerAlert,
  OfficerAlertSeverity,
  OfficerAlertType,
  ProcurementReportResponse,
  ProcurementReportStatus,
  Stage2Duty,
} from '../api/stage2Types.ts';
import type { ChapterAccessSnapshot, WorkspaceTab } from '../api/types.ts';
import { useStage2Candidates } from '../api/useStage2Candidates.ts';
import { NavFlowHeader } from '../components/NavFlowHeader.tsx';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker } from '../components/SearchableRecordPicker.tsx';

interface Stage2AlertsReportsWorkspaceProps {
  chapterId: string;
  refreshSignal: number;
  domainSignal?: number;
  chapterAccess: ChapterAccessSnapshot | null;
  previewEnabled: boolean;
  onHandoffAllocation: (opts: {
    targetTab: 'reservations_holds' | 'actual_issues';
    rfId: string;
    rfLineId: string;
  }) => void;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onBackToDashboard?: () => void;
}

function defaultDateRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function Stage2AlertsReportsWorkspace({
  chapterId,
  refreshSignal,
  domainSignal = 0,
  chapterAccess,
  previewEnabled,
  onHandoffAllocation,
  onNavigateTab,
  onBackToDashboard,
}: Stage2AlertsReportsWorkspaceProps) {
  const candidates = useStage2Candidates(chapterId, refreshSignal, previewEnabled, chapterAccess);
  const initialRange = defaultDateRange();

  const [subTab, setSubTab] = useState<'alerts' | 'allocation_queue' | 'reports'>('alerts');

  // Alerts state
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [dutyFilter, setDutyFilter] = useState('');
  const [alerts, setAlerts] = useState<OfficerAlert[]>([]);
  const [matchedDuties, setMatchedDuties] = useState<string[]>([]);

  // Allocation Queue state
  const [queueVariantId, setQueueVariantId] = useState('');
  const [queueRfId, setQueueRfId] = useState('');
  const [queueUnitId, setQueueUnitId] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [queueRows, setQueueRows] = useState<AllocationQueueEntry[]>([]);
  const [queuePolicyNote, setQueuePolicyNote] = useState<string>('');

  // Reports state
  const [reportKind, setReportKind] = useState<'inventory' | 'procurement' | 'control'>(
    'inventory',
  );
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [reportItemId, setReportItemId] = useState('');
  const [reportVariantId, setReportVariantId] = useState('');
  const [reportLocationId, setReportLocationId] = useState('');
  const [invStatus, setInvStatus] = useState<InventoryReportStatus>('all');
  const [procStatus, setProcStatus] = useState<ProcurementReportStatus>('all');
  const [ctrlStatus, setCtrlStatus] = useState<ControlReportStatus>('all');
  const [inventoryReport, setInventoryReport] = useState<InventoryReportResponse | null>(null);
  const [procurementReport, setProcurementReport] = useState<ProcurementReportResponse | null>(
    null,
  );
  const [controlReport, setControlReport] = useState<ControlReportResponse | null>(null);
  const [reportPrintHtml, setReportPrintHtml] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await listOfficerAlerts(chapterId, {
        alert_type: (alertTypeFilter || undefined) as OfficerAlertType | undefined,
        severity: (severityFilter || undefined) as OfficerAlertSeverity | undefined,
        responsible_duty: (dutyFilter || undefined) as Stage2Duty | undefined,
        limit: 50,
      });
      setAlerts(res.data);
      setMatchedDuties(res.caller_matched_duties);
    } catch (err) {
      setError(err);
    }
  }, [alertTypeFilter, chapterId, dutyFilter, severityFilter]);

  const loadQueue = useCallback(async () => {
    try {
      const res = await listAllocationQueue(chapterId, {
        variant_id: queueVariantId || undefined,
        rf_id: queueRfId || undefined,
        requesting_unit_id: queueUnitId || undefined,
        eligible_only: eligibleOnly,
        limit: 50,
      });
      setQueueRows(res.data);
      setQueuePolicyNote(
        `Policy v${res.allocation_policy.version} · Observed ${formatManilaTime(res.observed_at)} · Advisory ordering only (commit re-verifies Stock & Stage 1 reservation lock)`,
      );
    } catch (err) {
      setError(err);
    }
  }, [chapterId, eligibleOnly, queueRfId, queueUnitId, queueVariantId]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts, refreshSignal, domainSignal]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, refreshSignal, domainSignal]);

  async function handleRunReport(alsoPrint = false) {
    const rangeErr = validateReportDateRange(dateFrom, dateTo);
    if (rangeErr) {
      setError(new Error(rangeErr));
      return;
    }
    setBusy(true);
    setError(null);
    setReportPrintHtml(null);
    try {
      const common = {
        date_from: dateFrom,
        date_to: dateTo,
        item_id: reportItemId || undefined,
        variant_id: reportVariantId || undefined,
        location_id: reportLocationId || undefined,
      };
      if (reportKind === 'inventory') {
        const res = await readInventoryReport(chapterId, { ...common, status: invStatus, limit: 50 });
        setInventoryReport(res);
        setProcurementReport(null);
        setControlReport(null);
        if (alsoPrint) {
          setReportPrintHtml(await printInventoryReport(chapterId, { ...common, status: invStatus }));
        }
      } else if (reportKind === 'procurement') {
        const res = await readProcurementReport(chapterId, {
          ...common,
          status: procStatus,
          limit: 50,
        });
        setProcurementReport(res);
        setInventoryReport(null);
        setControlReport(null);
        if (alsoPrint) {
          setReportPrintHtml(
            await printProcurementReport(chapterId, { ...common, status: procStatus }),
          );
        }
      } else {
        const res = await readControlReport(chapterId, { ...common, status: ctrlStatus, limit: 50 });
        setControlReport(res);
        setInventoryReport(null);
        setProcurementReport(null);
        if (alsoPrint) {
          setReportPrintHtml(await printControlReport(chapterId, { ...common, status: ctrlStatus }));
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function jumpFromAlert(alert: OfficerAlert) {
    if (alert.record_kind === 'repf' || alert.alert_type === 'low_stock_rop' || alert.alert_type === 'open_rf_shortage') {
      onNavigateTab('replenishment_repf');
    } else if (alert.record_kind === 'purchase_order') {
      onNavigateTab('quotations_po');
    } else if (alert.record_kind === 'donation') {
      onNavigateTab('donations_restrictions');
    } else if (alert.record_kind === 'receiving_discrepancy' || alert.record_kind === 'receiving_hold') {
      onNavigateTab('receiving_discrepancies');
    } else {
      onNavigateTab('requisitions');
    }
  }

  return (
    <div className="workspace-stack">
      <NavFlowHeader
        headingId="s2ar-heading"
        title="Officer Alerts, INV-09 Allocation Queue & Stage 2 Reports"
        subtitle="Monitor derived operational alerts, dispatch priority-ordered RF batches into Stage 1 fulfillment, and run audited reports."
        onBack={onBackToDashboard}
      />

      <OperationBanner error={error} />

      <div className="s2-tab-strip" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'alerts'}
          className={`s2-tab-btn${subTab === 'alerts' ? ' is-active' : ''}`}
          onClick={() => setSubTab('alerts')}
        >
          Derived Alerts ({alerts.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'allocation_queue'}
          className={`s2-tab-btn${subTab === 'allocation_queue' ? ' is-active' : ''}`}
          onClick={() => setSubTab('allocation_queue')}
        >
          INV-09 Allocation Queue ({queueRows.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'reports'}
          className={`s2-tab-btn${subTab === 'reports' ? ' is-active' : ''}`}
          onClick={() => setSubTab('reports')}
        >
          Stage 2 Reports &amp; Print
        </button>
      </div>

      {subTab === 'alerts' && (
        <section className="surface-card s2-section-card">
          <div className="callout-banner" role="note">
            <span className="callout-dot dot-info" aria-hidden="true" />
            <div>
              <strong>Live Derived Feed Only:</strong> Officer alerts do not store manual dismissal state — alerts automatically clear once the underlying RepF, PO, DA, Discrepancy, Hold, or ROP condition is resolved. Matched duties: {matchedDuties.join(', ') || 'Scoped access'}.
            </div>
          </div>

          <div className="s2-grid-3">
            <div className="form-group">
              <label className="form-label">Alert Category</label>
              <select
                className="form-control"
                value={alertTypeFilter}
                onChange={(e) => setAlertTypeFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                <option value="low_stock_rop">Low Stock (ROP Breach)</option>
                <option value="open_rf_shortage">Open RF Shortage</option>
                <option value="repf_pending_approval">RepF Pending Budget Review</option>
                <option value="po_pending_approval">PO Pending Approval</option>
                <option value="da_pending_acknowledgment">DA Pending Acknowledgment</option>
                <option value="demand_changed">Linked Demand Canceled</option>
                <option value="open_receiving_discrepancy">Open Receiving Discrepancy</option>
                <option value="active_missing_source_hold">Active Missing-Source Hold</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select
                className="form-control"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Responsible Duty</label>
              <select
                className="form-control"
                value={dutyFilter}
                onChange={(e) => setDutyFilter(e.target.value)}
              >
                <option value="">All Authorized Duties</option>
                <option value="INVENTORY">Inventory</option>
                <option value="PURCHASING">Purchasing</option>
                <option value="BUDGET_APPROVER">Budget Approver</option>
                <option value="RECEIVING">Receiving</option>
                <option value="DISPATCH">Dispatch</option>
                <option value="CHAPTER_HEAD">Chapter Head</option>
              </select>
            </div>
          </div>

          {alerts.length === 0 ? (
            <p className="s2-empty-hint">No derived officer alerts match the active filters.</p>
          ) : (
            <div className="s2-related-list">
              {alerts.map((al) => (
                <div key={al.alert_key} className="s2-related-row">
                  <div>
                    <div className="s2-related-head">
                      <span
                        className={`s2-badge ${
                          al.severity === 'critical'
                            ? 'is-danger'
                            : al.severity === 'warning'
                              ? 'is-warning'
                              : 'is-ready'
                        }`}
                      >
                        {al.severity}
                      </span>
                      <strong>{al.alert_type.replaceAll('_', ' ')}</strong>
                      {al.record_reference && (
                        <span className="s2-mono-pill">{al.record_reference}</span>
                      )}
                      <span className="s2-badge is-neutral">{al.responsible_duty}</span>
                    </div>
                    <div>{al.summary}</div>
                    <div className="s2-muted-sm">Detected {formatManilaTime(al.detected_at)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-batcave-primary p02-compact-btn"
                    onClick={() => jumpFromAlert(al)}
                  >
                    Open Workflow →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {subTab === 'allocation_queue' && (
        <section className="surface-card s2-section-card">
          <div className="s2-panel-header">
            <div>
              <h2 className="s2-panel-title">INV-09 Ordered RF Allocation Queue</h2>
              <p className="s2-panel-sub">
                {queuePolicyNote || 'Active commitments → approved overrides → standard priority.'}
              </p>
            </div>
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              onClick={() => void loadQueue()}
            >
              Refresh Queue
            </button>
          </div>

          <div className="s2-grid-3">
            <SearchableRecordPicker
              id="s2-q-var"
              label="Variant Filter"
              valueId={queueVariantId}
              options={candidates.variantOptions}
              onSelect={(opt) => setQueueVariantId(opt?.id ?? '')}
            />
            <SearchableRecordPicker
              id="s2-q-rf"
              label="Internal RF Filter"
              valueId={queueRfId}
              options={candidates.rfOptions}
              onSelect={(opt) => setQueueRfId(opt?.id ?? '')}
            />
            <SearchableRecordPicker
              id="s2-q-unit"
              label="Requesting Unit Filter"
              valueId={queueUnitId}
              options={candidates.requestingUnitOptions}
              onSelect={(opt) => setQueueUnitId(opt?.id ?? '')}
            />
          </div>

          <label className="s2-check-row">
            <input
              type="checkbox"
              checked={eligibleOnly}
              onChange={(e) => setEligibleOnly(e.target.checked)}
            />
            Show only RFs with immediately eligible stock
          </label>

          {queueRows.length === 0 ? (
            <p className="s2-empty-hint">No open approved RF lines in allocation queue.</p>
          ) : (
            <div className="s2-table-wrap">
              <table className="s2-table">
                <thead>
                  <tr>
                    <th># / Tier</th>
                    <th>RF &amp; SKU</th>
                    <th>Unreserved Need</th>
                    <th>Eligible Free Stock</th>
                    <th>Held / Ineligible / Uninterp.</th>
                    <th>Eligible Lots</th>
                    <th>Stage 1 Handoff</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRows.map((row) => (
                    <tr key={`${row.rf_line_id}-${row.queue_position}`}>
                      <td>
                        <strong>#{row.queue_position}</strong>
                        <div className="s2-badge">{row.allocation_tier.replaceAll('_', ' ')}</div>
                        <div className="s2-muted-sm">Rank {row.priority_rank}</div>
                      </td>
                      <td>
                        <strong>{row.rf_reference}</strong>
                        <div className="s2-muted-sm">
                          {row.variant_code} · Due {formatManilaTime(row.needed_at)}
                        </div>
                      </td>
                      <td>
                        <strong>
                          {row.unreserved_outstanding_quantity} {row.unit_code}
                        </strong>
                        <div className="s2-muted-sm">
                          Reserved: {row.active_reserved_quantity} · Issued: {row.issued_quantity}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`s2-badge ${
                            Number.parseFloat(row.eligible_available_quantity) > 0
                              ? 'is-ready'
                              : 'is-danger'
                          }`}
                        >
                          {row.eligible_available_quantity} {row.unit_code}
                        </span>
                      </td>
                      <td>
                        Hold: {row.active_stock_hold_quantity} · Bounded-Out:{' '}
                        {row.ineligible_restricted_quantity} · Uninterp:{' '}
                        {row.uninterpreted_restricted_quantity}
                      </td>
                      <td>
                        {row.eligible_sources.length === 0 ? (
                          <span className="s2-muted-sm">None eligible</span>
                        ) : (
                          row.eligible_sources.map((src) => (
                            <div key={src.stock_lot_id} className="s2-muted-sm">
                              {src.source_reference} ({src.free_quantity}, {src.restriction_state})
                            </div>
                          ))
                        )}
                      </td>
                      <td>
                        <div className="s2-inline-actions">
                          <button
                            type="button"
                            className="btn-batcave-secondary p02-compact-btn"
                            onClick={() =>
                              onHandoffAllocation({
                                targetTab: 'reservations_holds',
                                rfId: row.rf_id,
                                rfLineId: row.rf_line_id,
                              })
                            }
                          >
                            Reserve
                          </button>
                          <button
                            type="button"
                            className="btn-batcave-primary p02-compact-btn"
                            onClick={() =>
                              onHandoffAllocation({
                                targetTab: 'actual_issues',
                                rfId: row.rf_id,
                                rfLineId: row.rf_line_id,
                              })
                            }
                          >
                            Issue Batch
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {subTab === 'reports' && (
        <section className="surface-card s2-section-card">
          <div className="s2-panel-header">
            <div>
              <h2 className="s2-panel-title">Audited Stage 2 Reports (PHP &amp; Stock Boundaries)</h2>
              <p className="s2-panel-sub">
                Maximum 366-day window per query. Sales/Booth Cashier (RPT-05) and Finance Reconciliation (RPT-07) remain deferred until Stage 3/4.
              </p>
            </div>
          </div>

          <div className="s2-grid-3">
            <div className="form-group">
              <label className="form-label">Report Type</label>
              <select
                className="form-control"
                value={reportKind}
                onChange={(e) =>
                  setReportKind(e.target.value as 'inventory' | 'procurement' | 'control')
                }
              >
                <option value="inventory">Inventory Position &amp; Valuation Report</option>
                <option value="procurement">Procurement Pipeline &amp; Receiving Report</option>
                <option value="control">Donor Restriction &amp; Exception Control Report</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Period Start (YYYY-MM-DD)</label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Period End (YYYY-MM-DD)</label>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="s2-grid-3">
            <SearchableRecordPicker
              id="s2-rpt-item"
              label="Item Filter (optional)"
              valueId={reportItemId}
              options={candidates.itemOptions}
              onSelect={(opt) => setReportItemId(opt?.id ?? '')}
            />
            <SearchableRecordPicker
              id="s2-rpt-var"
              label="Variant Filter (optional)"
              valueId={reportVariantId}
              options={candidates.variantOptions}
              onSelect={(opt) => setReportVariantId(opt?.id ?? '')}
            />
            <SearchableRecordPicker
              id="s2-rpt-loc"
              label="Location Filter (optional)"
              valueId={reportLocationId}
              options={candidates.locationOptions}
              onSelect={(opt) => setReportLocationId(opt?.id ?? '')}
            />
          </div>

          <div className="s2-action-bar">
            {reportKind === 'inventory' && (
              <select
                className="form-control"
                style={{ maxWidth: 260 }}
                value={invStatus}
                onChange={(e) => setInvStatus(e.target.value as InventoryReportStatus)}
              >
                <option value="all">All Stock States</option>
                <option value="low_stock">Low Stock Only</option>
                <option value="with_shortage">With RF Shortage</option>
                <option value="with_quarantine">With Quarantined / Rejected</option>
                <option value="with_uninterpreted_restriction">
                  With Uninterpreted Donor Stock
                </option>
              </select>
            )}
            {reportKind === 'procurement' && (
              <select
                className="form-control"
                style={{ maxWidth: 260 }}
                value={procStatus}
                onChange={(e) => setProcStatus(e.target.value as ProcurementReportStatus)}
              >
                <option value="all">All Procurement States</option>
                <option value="open_demand">Open RF Demand</option>
                <option value="awaiting_approval">Awaiting Approval</option>
                <option value="in_procurement">In Procurement</option>
                <option value="partially_received">Partially Received</option>
                <option value="with_discrepancy">With Open Discrepancy</option>
                <option value="demand_changed">Linked Demand Canceled</option>
              </select>
            )}
            {reportKind === 'control' && (
              <select
                className="form-control"
                style={{ maxWidth: 260 }}
                value={ctrlStatus}
                onChange={(e) => setCtrlStatus(e.target.value as ControlReportStatus)}
              >
                <option value="all">All Control Items</option>
                <option value="uninterpreted_restriction">Uninterpreted Restrictions</option>
                <option value="bounded_restriction">Bounded Restrictions</option>
                <option value="overdue_exception">Overdue Exceptions</option>
                <option value="discrepancy_open">Open Discrepancies</option>
                <option value="hold_open">Open Missing-Source Holds</option>
              </select>
            )}

            <button
              type="button"
              className="btn-batcave-primary p02-compact-btn"
              disabled={busy}
              onClick={() => void handleRunReport(false)}
            >
              {busy ? 'Generating...' : 'Run JSON Report'}
            </button>
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              disabled={busy}
              onClick={() => void handleRunReport(true)}
            >
              Run &amp; Open Printable HTML
            </button>
          </div>

          {inventoryReport && (
            <div className="s2-detail-panel">
              <div className="callout-banner" role="note">
                <span className="callout-dot dot-info" aria-hidden="true" />
                <div>
                  <strong>Non-Additive Stock Views ({inventoryReport.metadata.currency_label}):</strong>{' '}
                  Usable on-hand, Available-to-allocate, RF-reserved, Quarantined/rejected, and Inbound Open PO are distinct non-additive buckets. Total Usable Valuation: <strong>PHP {inventoryReport.totals.total_usable_valuation_php}</strong>.
                </div>
              </div>
              <div className="s2-table-wrap">
                <table className="s2-table">
                  <thead>
                    <tr>
                      <th>SKU &amp; Location</th>
                      <th>Condition / Restriction</th>
                      <th>Usable On-Hand</th>
                      <th>Available</th>
                      <th>Quarantined/Rej</th>
                      <th>Inbound PO</th>
                      <th>Valuation (PHP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryReport.data.map((row, idx) => (
                      <tr key={`${row.variant_id}-${row.restriction_state}-${idx}`}>
                        <td>
                          <strong>{row.variant_code}</strong> ({row.unit_code})
                          <div className="s2-muted-sm">{row.location_name}</div>
                        </td>
                        <td>
                          {row.condition} ·{' '}
                          <span
                            className={`s2-badge ${
                              row.restriction_state === 'uninterpreted'
                                ? 'is-danger'
                                : row.restriction_state === 'bounded'
                                  ? 'is-warning'
                                  : 'is-ready'
                            }`}
                          >
                            {row.restriction_state}
                          </span>
                        </td>
                        <td>{row.usable_stockroom_on_hand}</td>
                        <td>{row.available_to_allocate}</td>
                        <td>{row.quarantined_rejected}</td>
                        <td>{row.inbound_open_po}</td>
                        <td>PHP {row.usable_valuation_php}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {procurementReport && (
            <div className="s2-detail-panel">
              <div className="s2-kpi-strip">
                <span className="s2-kpi-chip">Open RF Lines: {procurementReport.totals.open_rf_lines_count}</span>
                <span className="s2-kpi-chip">RepFs: {procurementReport.totals.repf_count}</span>
                <span className="s2-kpi-chip">POs: {procurementReport.totals.po_count}</span>
                <span className="s2-kpi-chip">Ordered PHP: {procurementReport.totals.total_ordered_php}</span>
                <span className="s2-kpi-chip">Accepted PHP: {procurementReport.totals.total_accepted_value_php}</span>
              </div>
              <div className="s2-table-wrap">
                <table className="s2-table">
                  <thead>
                    <tr>
                      <th>PO Reference</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th>Ordered / Accepted / Open</th>
                      <th>Ordered PHP</th>
                      <th>Open Discrepancies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procurementReport.purchase_order_summary.map((row) => (
                      <tr key={row.po_line_id}>
                        <td>{row.po_reference ?? 'Draft'}</td>
                        <td>{row.supplier_name}</td>
                        <td>{row.status.replaceAll('_', ' ')}</td>
                        <td>
                          {row.ordered_quantity} / {row.accepted_quantity} / {row.outstanding_quantity}{' '}
                          {row.unit_code}
                        </td>
                        <td>PHP {row.ordered_total_php}</td>
                        <td>{row.open_discrepancy_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {controlReport && (
            <div className="s2-detail-panel">
              <div className="s2-kpi-strip">
                <span className="s2-kpi-chip">Donations: {controlReport.totals.donation_row_count}</span>
                <span className="s2-kpi-chip">
                  Uninterpreted: {controlReport.totals.uninterpreted_donation_count}
                </span>
                <span className="s2-kpi-chip">
                  Overdue Exceptions: {controlReport.totals.overdue_exception_count}
                </span>
                <span className="s2-kpi-chip">
                  Declared In-Kind PHP: {controlReport.totals.total_declared_donation_value_php}
                </span>
              </div>
              <div className="s2-table-wrap">
                <table className="s2-table">
                  <thead>
                    <tr>
                      <th>Exception / Donation</th>
                      <th>Restriction / Status</th>
                      <th>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlReport.overdue_exceptions.map((ex) => (
                      <tr key={ex.record_id}>
                        <td>
                          <strong>{ex.record_reference ?? ex.record_id}</strong> ({ex.responsible_duty})
                        </td>
                        <td>
                          <span className="s2-badge is-warning">{ex.status}</span> ({ex.overdue_hours}h)
                        </td>
                        <td>{ex.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportPrintHtml && (
            <iframe
              sandbox=""
              title="Stage 2 Printable Report"
              srcDoc={reportPrintHtml}
              className="s2-print-frame"
            />
          )}
        </section>
      )}
    </div>
  );
}
