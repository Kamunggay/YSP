import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { apiGet, buildQuery, formatManilaTime } from '../api/client.ts';
import type { ChapterAccessSnapshot, IntendedUse, SevenStockViews } from '../api/types.ts';
import { useStage2Candidates } from '../api/useStage2Candidates.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { SearchableRecordPicker } from '../components/SearchableRecordPicker.tsx';

interface StockSummaryItem {
  variant_id: string;
  item_id: string;
  variant_code?: string;
  observed_at: string;
  views: SevenStockViews;
  views_are_additive: false;
  item_usable_stockroom_on_hand?: { value: string; quantity_scale: number };
  low_stock: string;
  setup_blockers: Array<{ setting_key?: string; message?: string }>;
  outstanding_need?: unknown[];
}

interface StockLotItem {
  id: string;
  lot_reference?: string;
  variant_id: string;
  location_id: string;
  condition?: string;
  restriction_state?: 'unrestricted' | 'bounded' | 'uninterpreted';
  inbound_open_po?: string;
  stock_version?: number;
  material_version?: number;
  segments?: unknown[];
}

interface StockWorkspaceProps {
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

export function StockWorkspace({
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: StockWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'balances' | 'lots' | 'detail'>('balances');
  const stockReason = actionBlockReason(chapterAccess, 'stock.read');
  const historyReason = actionBlockReason(chapterAccess, 'history.read', 'stock.read');
  const [intendedUse, setIntendedUse] = useState<IntendedUse>('internal_use');
  const [neededAt, setNeededAt] = useState(() => new Date().toISOString().replace(/\.\d+Z$/, '.000000Z'));
  const [requestingUnitId, setRequestingUnitId] = useState('');
  const [eventId, setEventId] = useState('');
  const [variantFilter, setVariantFilter] = useState('');
  const candidates = useStage2Candidates(
    chapterId,
    refreshSignal,
    chapterAccess,
  );

  const [summaries, setSummaries] = useState<StockSummaryItem[]>([]);
  const [lots, setLots] = useState<StockLotItem[]>([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [eligQty, setEligQty] = useState('1');
  const [eligUnitId, setEligUnitId] = useState('');
  const [eligRfLineId, setEligRfLineId] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<unknown>(null);
  const [variantDetail, setVariantDetail] = useState<unknown>(null);
  const [lotDetail, setLotDetail] = useState<unknown>(null);
  const [lotHistory, setLotHistory] = useState<unknown>(null);

  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const loadSummaries = useCallback(async () => {
    const qs = buildQuery({
      intended_use: intendedUse,
      needed_at: neededAt,
      requesting_unit_id: requestingUnitId.trim() || undefined,
      event_id: eventId.trim() || undefined,
      variant_id: variantFilter.trim() || undefined,
      limit: 25,
    });
    const res = await apiGet<StockSummaryItem[]>(`/api/v1/chapters/${chapterId}/stock${qs}`);
    setSummaries(res.data);
  }, [chapterId, intendedUse, neededAt, requestingUnitId, eventId, variantFilter]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadSummaries();
        if (active) {
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadSummaries, refreshSignal]);

  async function handleManualQuery() {
    setError(null);
    setBusy(true);
    try {
      await loadSummaries();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function loadLotsForVariant(vid: string) {
    setError(null);
    try {
      const qs = buildQuery({ variant_id: vid, limit: 25 });
      const res = await apiGet<StockLotItem[]>(`/api/v1/chapters/${chapterId}/stock/lots${qs}`);
      setLots(res.data);
      if (res.data[0]?.id) {
        setSelectedLotId(res.data[0].id);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function inspectVariantDetail(variantId: string) {
    setError(null);
    try {
      const qs = buildQuery({ intended_use: intendedUse, needed_at: neededAt });
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/stock/variants/${variantId}${qs}`);
      setVariantDetail(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function inspectLotDetail(lotId: string) {
    const trimmed = lotId.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/stock/lots/${trimmed}`);
      setLotDetail(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function inspectLotHistory(lotId: string) {
    const trimmed = lotId.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/stock/lots/${trimmed}/history`);
      setLotHistory(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function checkEligibility(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLotId.trim()) {
      return;
    }
    setError(null);
    try {
      const qs = buildQuery({
        intended_use: intendedUse,
        needed_at: neededAt,
        quantity: eligQty,
        unit_id: eligUnitId,
        requesting_unit_id: requestingUnitId.trim() || undefined,
        event_id: eventId.trim() || undefined,
        rf_line_id: eligRfLineId.trim() || undefined,
      });
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/stock/lots/${selectedLotId.trim()}/eligibility${qs}`);
      setEligibilityResult(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap" style={{ flex: 1 }}>
              <SearchableRecordPicker
                id="stk-var-picker"
                label="Filter by Item Variant"
                valueId={variantFilter}
                options={candidates.variantOptions}
                onSelect={(opt) => setVariantFilter(opt?.id ?? '')}
                placeholder="Pick item variant..."
              />
            </div>

            <div className="p03-search-meta">
              {variantFilter.trim().length > 0 && (
                <button
                  type="button"
                  className="p03-search-clear-btn"
                  onClick={() => setVariantFilter('')}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="p03-search-action-btn"
                disabled={busy}
                onClick={() => void handleManualQuery()}
              >
                {busy ? 'Querying...' : 'Query Stock'}
              </button>
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Stock Overview &amp; Item Availability</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Stock workspace sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'balances'}
                  className={`p03-filter-pill ${viewTab === 'balances' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('balances')}
                >
                  Stock Views ({summaries.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'lots'}
                  className={`p03-filter-pill ${viewTab === 'lots' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('lots')}
                >
                  Batches &amp; Availability
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'detail'}
                  className={`p03-filter-pill ${viewTab === 'detail' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('detail')}
                >
                  Batch History &amp; Detail
                </button>
              </div>
              {onBackToDashboard && (
                <button
                  type="button"
                  className="btn-batcave-secondary p03-shrink-btn p04-back-btn"
                  onClick={onBackToDashboard}
                >
                  ← Back to My Work
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="p03-card surface-card form-stack" aria-label="Stock status summary">
          <div className="p03-card-header-row">
            <div>
              <h2 className="p03-section-title">Chapter Stock Balances</h2>
              <p className="form-card-subtitle">
                Advisory stock breakdown only. Each category shows a distinct view of stock, so these figures must not be added together.
              </p>
            </div>
            <div className="p03-chip-wrap">
              <span className="p03-version-pill">{summaries.length} Variants</span>
              <span className="p03-version-pill">{lots.length} Loaded Batches</span>
            </div>
          </div>
          <OperationBanner error={error} />
          {stockReason && (
            <div className="callout-banner is-warning">
              <span className="callout-dot dot-warning" aria-hidden="true" />
              <span>{stockReason}</span>
            </div>
          )}
        </section>

        {viewTab === 'balances' && (
          <>
            <section className="p03-card surface-card" aria-label="Stock query parameters">
              <div className="p03-two-col">
                <div className="form-group">
                  <label className="form-label" htmlFor="stk-use">
                    Planned Use
                  </label>
                  <select
                    id="stk-use"
                    className="form-control"
                    value={intendedUse}
                    onChange={(e) => setIntendedUse(e.target.value as IntendedUse)}
                  >
                    <option value="internal_use">Internal Chapter Use</option>
                    <option value="sale">Sale</option>
                    <option value="booth_transfer">Booth Transfer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="stk-needed">
                    Date Needed (optional)
                  </label>
                  <input
                    id="stk-needed"
                    className="form-control"
                    value={neededAt}
                    onChange={(e) => setNeededAt(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="stk-unit">
                    Requesting Unit (optional)
                  </label>
                  <input
                    id="stk-unit"
                    className="form-control"
                    value={requestingUnitId}
                    onChange={(e) => setRequestingUnitId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="stk-event">
                    Event Reference (optional)
                  </label>
                  <input
                    id="stk-event"
                    className="form-control"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {summaries.length === 0 ? (
              <section className="p03-card surface-card">
                <p className="p03-muted-copy">
                  No stock summaries found. Record an opening inventory balance or adjust your filter criteria above.
                </p>
              </section>
            ) : (
              summaries.map((s) => (
                <section key={s.variant_id} className="p03-card surface-card form-stack">
                  <div className="p03-card-header-row">
                    <div className="p03-history-title-group">
                      <span className="p03-version-pill p03-id-pill p03-mono-inline">{s.variant_code ?? s.variant_id}</span>
                      <span className={`s02-status-tag ${s.low_stock === 'above_rop' ? 'is-ready' : 'is-overdue'}`}>
                        {s.low_stock === 'above_rop' ? 'Above Reorder Level' : s.low_stock.replace(/_/g, ' ')}
                      </span>
                      <span className="p03-muted-inline">Updated {formatManilaTime(s.observed_at)}</span>
                    </div>

                    <div className="p02-compact-btn-group">
                      <button
                        type="button"
                        className="p02-compact-btn"
                        onClick={() => {
                          void loadLotsForVariant(s.variant_id);
                          setViewTab('lots');
                        }}
                      >
                        View Batches
                      </button>
                      <button
                        type="button"
                        className="p02-compact-btn"
                        onClick={() => {
                          void inspectVariantDetail(s.variant_id);
                          setViewTab('detail');
                        }}
                      >
                        Variant Detail
                      </button>
                    </div>
                  </div>

                  <div className="p05-seven-views-grid">
                    {Object.values(s.views).map((bucket) => (
                      <div key={bucket.label} className="p03-formal-cell">
                        <span className="p03-formal-key">{bucket.label}</span>
                        <span className="p03-formal-val">{bucket.quantity.value}</span>
                      </div>
                    ))}
                  </div>

                  {s.setup_blockers.length > 0 && (
                    <div className="callout-banner is-warning">
                      <span className="callout-dot dot-warning" aria-hidden="true" />
                      <span>
                        Setup notes: {s.setup_blockers.map((b) => `${b.setting_key ?? ''} ${b.message ?? ''}`).join('; ')}
                      </span>
                    </div>
                  )}
                </section>
              ))
            )}
          </>
        )}

        {viewTab === 'lots' && (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Stock batches list">
              <h2 className="p03-section-title">
                Stock Batches ({lots.length})
              </h2>
              {lots.length === 0 ? (
                <p className="p03-muted-copy">
                  No batches loaded. Choose “View Batches” on any stock variant in Stock Views.
                </p>
              ) : (
                <div className="p03-history-list">
                  {lots.map((lot) => (
                    <article
                      key={lot.id}
                      className={`p03-history-card ${selectedLotId === lot.id ? 'is-search-match' : ''}`}
                    >
                      <div className="p03-history-head">
                        <div className="p03-history-title-group">
                          <span className="p03-version-pill p03-id-pill p03-mono-inline">{lot.lot_reference ?? lot.id.slice(0, 8)}</span>
                          {lot.condition && <span className="s02-status-tag">{lot.condition}</span>}
                          {lot.restriction_state && (
                            <span
                              className={`s2-badge ${
                                lot.restriction_state === 'uninterpreted'
                                  ? 'is-danger'
                                  : lot.restriction_state === 'bounded'
                                    ? 'is-warning'
                                    : 'is-ready'
                              }`}
                            >
                              {lot.restriction_state === 'uninterpreted'
                                ? 'Uninterpreted — Allocation Blocked'
                                : lot.restriction_state === 'bounded'
                                  ? 'Bounded Restricted'
                                  : 'Unrestricted'}
                            </span>
                          )}
                          {lot.inbound_open_po && (
                            <span className="p03-version-pill">Inbound PO: {lot.inbound_open_po}</span>
                          )}
                          {lot.stock_version !== undefined && (
                            <span className="p03-version-pill">rev. {lot.stock_version}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="p02-compact-btn"
                          onClick={() => setSelectedLotId(lot.id)}
                        >
                          Select Batch
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card form-stack" aria-label="Check stock batch availability">
              <h2 className="p03-section-title">
                Check Stock Batch Availability
              </h2>
              <form onSubmit={checkEligibility} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="el-lot">
                    Stock Batch Reference
                  </label>
                  <input
                    id="el-lot"
                    className="form-control"
                    required
                    value={selectedLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                  />
                </div>
                <div className="p03-two-col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="el-qty">
                      Quantity to Check
                    </label>
                    <input
                      id="el-qty"
                      className="form-control"
                      required
                      value={eligQty}
                      onChange={(e) => setEligQty(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="el-unit">
                      Unit of Measure
                    </label>
                    <input
                      id="el-unit"
                      className="form-control"
                      required
                      value={eligUnitId}
                      onChange={(e) => setEligUnitId(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="el-line">
                    Requisition Line Reference (optional)
                  </label>
                  <input
                    id="el-line"
                    className="form-control"
                    value={eligRfLineId}
                    onChange={(e) => setEligRfLineId(e.target.value)}
                  />
                </div>
                <button
                  className="btn-batcave-primary"
                  type="submit"
                  disabled={stockReason !== null}
                  title={stockReason ?? undefined}
                >
                  Check Availability
                </button>
                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    disabled={stockReason !== null}
                    title={stockReason ?? undefined}
                    onClick={() => {
                      void inspectLotDetail(selectedLotId);
                      setViewTab('detail');
                    }}
                  >
                    Batch Details
                  </button>
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    disabled={historyReason !== null}
                    title={historyReason ?? undefined}
                    onClick={() => {
                      void inspectLotHistory(selectedLotId);
                      setViewTab('detail');
                    }}
                  >
                    Movement History
                  </button>
                </div>
              </form>

              {eligibilityResult !== null && (
                <pre className="json-box">{JSON.stringify(eligibilityResult, null, 2)}</pre>
              )}
            </section>
          </div>
        )}

        {viewTab === 'detail' && (
          <section className="p03-card surface-card form-stack" aria-label="Variant and batch detail view">
            <h2 className="p03-section-title">
              Variant Detail &amp; Movement History
            </h2>
            {variantDetail === null && lotDetail === null && lotHistory === null ? (
              <p className="p03-muted-copy">
                No detail record selected. Choose “Variant Detail” or “Batch Details / Movement History” from the tabs above.
              </p>
            ) : (
              <div className="form-stack">
                {variantDetail !== null && (
                  <div className="form-stack">
                    <h3 className="s02-drawer-subhead">Variant Breakdown</h3>
                    <pre className="json-box">{JSON.stringify(variantDetail, null, 2)}</pre>
                  </div>
                )}
                {lotDetail !== null && (
                  <div className="form-stack">
                    <h3 className="s02-drawer-subhead">Batch Details</h3>
                    <pre className="json-box">{JSON.stringify(lotDetail, null, 2)}</pre>
                  </div>
                )}
                {lotHistory !== null && (
                  <div className="form-stack">
                    <h3 className="s02-drawer-subhead">Movement History</h3>
                    <pre className="json-box">{JSON.stringify(lotHistory, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
