import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP22ManualOutageEngine } from './p22ManualOutageSlice';
import type {
  ManualExceptionKind,
  ManualPaymentChannel,
  ManualReceiptSeries,
  P22ActionResult,
  P22EngineSnapshot,
  P22LookupResult,
} from './p22ManualOutageSlice';

type P22TabId = 'entry' | 'exceptions' | 'history';

interface P22ManualOutageWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P22ManualOutageWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P22ManualOutageWorkspaceProps) {
  const engine = useMemo(() => createP22ManualOutageEngine(), []);
  const [snapshot, setSnapshot] = useState<P22EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P22TabId>('entry');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P22ActionResult | null>(snapshot.last_action);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');

  // Tab 1: Series Allocation & Once-Only Manual Sale Entry
  const [serEventInput, setSerEventInput] = useState('');
  const [serPrefixInput, setSerPrefixInput] = useState('');
  const [serStartInput, setSerStartInput] = useState('');
  const [serEndInput, setSerEndInput] = useState('');
  const [serCustodyInput, setSerCustodyInput] = useState('');
  const [serAuthInput, setSerAuthInput] = useState('');

  const [manOrNumInput, setManOrNumInput] = useState('');
  const [manChannelInput, setManChannelInput] = useState<ManualPaymentChannel>('cash');
  const [manGcashVerifiedInput, setManGcashVerifiedInput] = useState(false);
  const [manPayRefInput, setManPayRefInput] = useState('');
  const [manAmountInput, setManAmountInput] = useState('');
  const [manQtyInput, setManQtyInput] = useState('');
  const [manOrigAtInput, setManOrigAtInput] = useState('');
  const [manEnteredAtInput, setManEnteredAtInput] = useState('');
  const [manOfficerInput, setManOfficerInput] = useState('');
  const [manNoteInput, setManNoteInput] = useState('');

  // Tab 2: Receipt Discrepancy & Unconfirmed Facts
  const [excOrNumInput, setExcOrNumInput] = useState('');
  const [excKindInput, setExcKindInput] = useState<ManualExceptionKind>('missing_receipt');
  const [excOfficerInput, setExcOfficerInput] = useState('');
  const [excAtInput, setExcAtInput] = useState('');
  const [excNoteInput, setExcNoteInput] = useState('');

  // Tab 3: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P22ActionResult<P22LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P22ActionResult<T>): P22ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeSeries: ManualReceiptSeries | undefined =
    snapshot.receipt_series.find((s) => s.series_id === selectedSeriesId) ??
    snapshot.receipt_series[0];

  function handleAllocateSeries() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.allocateManualReceiptSeries({
        event_code: serEventInput,
        series_prefix: serPrefixInput,
        range_start: Number(serStartInput),
        range_end: Number(serEndInput),
        booth_custody_qty: serCustodyInput,
        authorized_by_user_id: serAuthInput,
        idempotency_key: nextSequentialKey('p22-series'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedSeriesId(res.data.series_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleEnterManualSale() {
    playClickPen(soundEnabled);
    if (!activeSeries) return;
    const res = refreshSnapshot(
      engine.enterManualOutageSale({
        series_id: activeSeries.series_id,
        manual_or_number: Number(manOrNumInput),
        payment_channel: manChannelInput,
        gcash_credit_verified: manGcashVerifiedInput,
        payment_reference: manPayRefInput,
        amount_php: manAmountInput,
        quantity_sold: manQtyInput,
        original_sale_at: manOrigAtInput,
        entered_at: manEnteredAtInput,
        officer_user_id: manOfficerInput,
        evidence_note: manNoteInput,
        idempotency_key: nextSequentialKey('p22-sale'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordException() {
    playClickPen(soundEnabled);
    if (!activeSeries) return;
    const res = refreshSnapshot(
      engine.recordManualReceiptException({
        series_id: activeSeries.series_id,
        manual_or_number: Number(excOrNumInput),
        exception_kind: excKindInput,
        officer_user_id: excOfficerInput,
        recorded_at: excAtInput,
        real_world_fact_note: excNoteInput,
        idempotency_key: nextSequentialKey('p22-exc'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupManualOutageOperation({
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
      engine.lookupManualOutageOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleSales = snapshot.manual_sales.filter(
    (m) =>
      !normalizedSearch ||
      m.manual_or_reference.toLowerCase().includes(normalizedSearch) ||
      m.payment_reference.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p22-workspace">
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
                id="p22-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search manual ORs or payment refs"
                aria-label="Search manual outage receipts"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Manual Outage Receipt Controls &amp; Later Entry</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Manual outage workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p22-tab-entry"
                  aria-selected={activeTab === 'entry'}
                  className={`p03-filter-pill ${activeTab === 'entry' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('entry');
                  }}
                >
                  Manual Series &amp; Later Entry
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p22-tab-exceptions"
                  aria-selected={activeTab === 'exceptions'}
                  className={`p03-filter-pill ${activeTab === 'exceptions' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('exceptions');
                  }}
                >
                  Range Gaps &amp; Exceptions
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p22-tab-history"
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
                id="p22-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p22-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p22-overview-heading" className="p03-section-title">
              Outage Control Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Second ORs Issued:{' '}
                <strong data-testid="p22-second-or-val">
                  {snapshot.summary.second_or_issued_count}
                </strong>
              </span>
              <span className="p03-version-pill">
                Entered Entries: <strong>{visibleSales.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Remaining Custody</span>
              <span className="p03-axis-val" data-testid="p22-custody-remaining-val">
                {snapshot.summary.remaining_custody_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Manual Sales (PHP)</span>
              <span className="p03-axis-val" data-testid="p22-entered-sales-val">
                {snapshot.summary.entered_manual_sales_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Once-Only Entries</span>
              <span className="p03-axis-val" data-testid="p22-entered-count-val">
                {snapshot.summary.entered_sales_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Range Gaps &amp; Flags</span>
              <span className="p03-axis-val" data-testid="p22-discrepancy-val">
                {snapshot.summary.open_discrepancies_count}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p22-feedback-banner"
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

        {/* TAB 1: Series Allocation & Manual Sale Later Entry */}
        {activeTab === 'entry' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p22-series-heading">
              <h2 id="p22-series-heading" className="p03-section-title">
                Allocate Manual Paper OR Series
              </h2>
              <div className="form-group">
                <label htmlFor="p22-ser-event" className="form-label">
                  Event Reference
                </label>
                <input
                  id="p22-ser-event"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serEventInput}
                  placeholder="CEBU-EVT-2026-000001"
                  onChange={(e) => setSerEventInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-ser-prefix" className="form-label">
                  Receipt Series Prefix
                </label>
                <input
                  id="p22-ser-prefix"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serPrefixInput}
                  placeholder="MAN-CEBU-OR"
                  onChange={(e) => setSerPrefixInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-ser-start" className="form-label">
                  Range Start Number
                </label>
                <input
                  id="p22-ser-start"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serStartInput}
                  placeholder="101"
                  onChange={(e) => setSerStartInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-ser-end" className="form-label">
                  Range End Number
                </label>
                <input
                  id="p22-ser-end"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serEndInput}
                  placeholder="105"
                  onChange={(e) => setSerEndInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-ser-custody" className="form-label">
                  Opening Booth Custody Qty
                </label>
                <input
                  id="p22-ser-custody"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serCustodyInput}
                  placeholder="20"
                  onChange={(e) => setSerCustodyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-ser-auth" className="form-label">
                  Authorizing Finance Officer ID
                </label>
                <input
                  id="p22-ser-auth"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={serAuthInput}
                  placeholder="202"
                  onChange={(e) => setSerAuthInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p22-allocate-series-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAllocateSeries}
                >
                  Allocate Manual OR Series
                </button>
              </div>
              {snapshot.receipt_series.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p22-empty-series-notice">
                  No manual paper receipt series allocated yet.
                </p>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p22-entry-heading">
              <h2 id="p22-entry-heading" className="p03-section-title">
                Record Later Manual Outage Sale (Once-Only)
              </h2>
              <div className="form-group">
                <label htmlFor="p22-man-or-num" className="form-label">
                  Original Paper OR Number
                </label>
                <input
                  id="p22-man-or-num"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manOrNumInput}
                  placeholder="101"
                  onChange={(e) => setManOrNumInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-channel" className="form-label">
                  Payment Channel
                </label>
                <select
                  id="p22-man-channel"
                  className="form-control"
                  value={manChannelInput}
                  onChange={(e) => setManChannelInput(e.target.value as ManualPaymentChannel)}
                >
                  <option value="cash">Cash Collected at Booth</option>
                  <option value="official_gcash">Official Chapter GCash</option>
                </select>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p22-man-gcash-verified"
                  type="checkbox"
                  checked={manGcashVerifiedInput}
                  onChange={(e) => setManGcashVerifiedInput(e.target.checked)}
                />
                <label htmlFor="p22-man-gcash-verified">
                  Official chapter GCash credit confirmed upon reconnection
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-pay-ref" className="form-label">
                  Payment Reference
                </label>
                <input
                  id="p22-man-pay-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manPayRefInput}
                  placeholder="CASH-MAN-101"
                  onChange={(e) => setManPayRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-amount" className="form-label">
                  Total Amount (PHP)
                </label>
                <input
                  id="p22-man-amount"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manAmountInput}
                  placeholder="300.00"
                  onChange={(e) => setManAmountInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-qty" className="form-label">
                  Quantity Sold
                </label>
                <input
                  id="p22-man-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manQtyInput}
                  placeholder="2"
                  onChange={(e) => setManQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-orig-at" className="form-label">
                  Original Sale Time (UTC)
                </label>
                <input
                  id="p22-man-orig-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manOrigAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setManOrigAtInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-ent-at" className="form-label">
                  System Entry Time (UTC)
                </label>
                <input
                  id="p22-man-ent-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manEnteredAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setManEnteredAtInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-officer" className="form-label">
                  Entering Cashier ID
                </label>
                <input
                  id="p22-man-officer"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={manOfficerInput}
                  placeholder="302"
                  onChange={(e) => setManOfficerInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-man-note" className="form-label">
                  Signed Carbon Slip Evidence
                </label>
                <input
                  id="p22-man-note"
                  type="text"
                  className="form-control"
                  value={manNoteInput}
                  placeholder="Carbon slip scan uploaded"
                  onChange={(e) => setManNoteInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p22-enter-sale-btn"
                  className="btn-batcave-primary"
                  onClick={handleEnterManualSale}
                >
                  Post Original Outage Sale
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Range Gaps & Discrepancies */}
        {activeTab === 'exceptions' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p22-exc-heading">
              <h2 id="p22-exc-heading" className="p03-section-title">
                Record Missing, Voided, or Unconfirmed Exception
              </h2>
              <div className="form-group">
                <label htmlFor="p22-exc-or-num" className="form-label">
                  Affected Manual OR Number
                </label>
                <input
                  id="p22-exc-or-num"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={excOrNumInput}
                  placeholder="102"
                  onChange={(e) => setExcOrNumInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-exc-kind" className="form-label">
                  Discrepancy Category
                </label>
                <select
                  id="p22-exc-kind"
                  className="form-control"
                  value={excKindInput}
                  onChange={(e) => setExcKindInput(e.target.value as ManualExceptionKind)}
                >
                  <option value="missing_receipt">Missing Manual Receipt</option>
                  <option value="voided_receipt">Voided Paper Receipt</option>
                  <option value="unconfirmed_gcash_shortfall">Unconfirmed Offline GCash</option>
                  <option value="custody_shortfall">Custody Stock Shortfall</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p22-exc-officer" className="form-label">
                  Reporting Officer ID
                </label>
                <input
                  id="p22-exc-officer"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={excOfficerInput}
                  placeholder="302"
                  onChange={(e) => setExcOfficerInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-exc-at" className="form-label">
                  Recorded Timestamp (UTC)
                </label>
                <input
                  id="p22-exc-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={excAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setExcAtInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-exc-note" className="form-label">
                  Real-World Reconciliation Fact
                </label>
                <input
                  id="p22-exc-note"
                  type="text"
                  className="form-control"
                  value={excNoteInput}
                  placeholder="Pending Finance verification"
                  onChange={(e) => setExcNoteInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p22-record-exc-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordException}
                >
                  Record Outage Discrepancy
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p22-gaps-heading">
              <h2 id="p22-gaps-heading" className="p03-section-title">
                Detected Sequence Gaps
              </h2>
              {snapshot.missing_in_range_refs.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p22-missing-gaps-text">
                  No skipped receipt numbers detected.
                </p>
              ) : (
                <p className="p03-mono-inline" data-testid="p22-missing-gaps-text">
                  Missing sequence numbers: {snapshot.missing_in_range_refs.join(', ')}
                </p>
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p22-audit-heading">
              <h2 id="p22-audit-heading" className="p03-section-title">
                Manual Entry &amp; Receipt Exception Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No manual outage activity recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p22-lookup-heading">
              <h2 id="p22-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p22-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p22-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p22-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p22-lookup-ulid-input"
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
                  id="p22-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p22-lookup-by-ulid-btn"
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
                        data-testid={`p22-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p22-lookup-result" aria-live="polite">
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
