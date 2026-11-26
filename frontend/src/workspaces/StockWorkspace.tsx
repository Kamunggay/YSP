import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { apiGet, buildQuery, formatManilaTime } from '../api/client.ts';
import type { ChapterAccessSnapshot, IntendedUse, SevenStockViews } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';

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
  stock_version?: number;
  material_version?: number;
  segments?: unknown[];
}

interface StockWorkspaceProps {
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
}

export function StockWorkspace({ chapterId, refreshSignal, chapterAccess }: StockWorkspaceProps) {
  const stockReason = actionBlockReason(chapterAccess, 'stock.read');
  const historyReason = actionBlockReason(chapterAccess, 'history.read', 'stock.read');
  const [intendedUse, setIntendedUse] = useState<IntendedUse>('internal_use');
  const [neededAt, setNeededAt] = useState(() => new Date().toISOString().replace(/\.\d+Z$/, '.000000Z'));
  const [requestingUnitId, setRequestingUnitId] = useState('');
  const [eventId, setEventId] = useState('');
  const [variantFilter, setVariantFilter] = useState('');

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
    <div>
      <div className="card">
        <h2>Seven Non-Additive Stock Views &amp; Eligibility (INV-03)</h2>
        <p className="muted">
          Advisory snapshots only (views_are_additive: false). Never sum Usable On-Hand, Available, RF/SO Reserved, Booth Custody, Quarantined, and Inbound PO together.
        </p>

        <OperationBanner error={error} />
        {stockReason && <div className="alert info">{stockReason}</div>}

        <div className="row" style={{ marginBottom: '0.85rem' }}>
          <div className="field">
            <label htmlFor="stk-use">intended_use</label>
            <select id="stk-use" value={intendedUse} onChange={(e) => setIntendedUse(e.target.value as IntendedUse)}>
              <option value="internal_use">internal_use</option>
              <option value="sale">sale</option>
              <option value="booth_transfer">booth_transfer</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="stk-needed">needed_at (UTC microsecond)</label>
            <input id="stk-needed" value={neededAt} onChange={(e) => setNeededAt(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="stk-unit">requesting_unit_id (optional)</label>
            <input id="stk-unit" value={requestingUnitId} onChange={(e) => setRequestingUnitId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="stk-event">event_id (optional)</label>
            <input id="stk-event" value={eventId} onChange={(e) => setEventId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="stk-var">variant_id (optional)</label>
            <input id="stk-var" value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)} />
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => void handleManualQuery()}>
            Query Stock
          </button>
        </div>

        {summaries.length === 0 ? (
          <p className="muted">No stock summaries found for this context.</p>
        ) : (
          summaries.map((s) => (
            <div key={s.variant_id} className="card" style={{ background: '#f8fafc' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Variant {s.variant_code ?? s.variant_id}</strong>{' '}
                  <span className={`status-pill ${s.low_stock === 'above_rop' ? 'ok' : 'warn'}`}>{s.low_stock}</span>{' '}
                  <span className="muted">Observed {formatManilaTime(s.observed_at)}</span>
                </div>
                <div className="row">
                  <button type="button" className="btn secondary" onClick={() => void loadLotsForVariant(s.variant_id)}>
                    Inspect Lots
                  </button>
                  <button type="button" className="btn secondary" onClick={() => void inspectVariantDetail(s.variant_id)}>
                    Variant Detail
                  </button>
                </div>
              </div>
              <div className="seven-views-grid">
                {Object.values(s.views).map((bucket) => (
                  <div key={bucket.label} className="view-tile">
                    <div className="label">{bucket.label}</div>
                    <div className="qty">{bucket.quantity.value}</div>
                  </div>
                ))}
              </div>
              {s.setup_blockers.length > 0 && (
                <p className="field-error" style={{ marginTop: '0.5rem' }}>
                  Setup blockers: {s.setup_blockers.map((b) => `${b.setting_key ?? ''} ${b.message ?? ''}`).join('; ')}
                </p>
              )}
            </div>
          ))
        )}
        {variantDetail !== null && (
          <div style={{ marginTop: '0.85rem' }}>
            <h3>Variant Stock Detail</h3>
            <pre className="json-box">{JSON.stringify(variantDetail, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Stock Lots &amp; Disjoint Segments</h3>
          {lots.length === 0 ? (
            <p className="muted">Select “Inspect Lots” on a variant above.</p>
          ) : (
            <pre className="json-box">{JSON.stringify(lots, null, 2)}</pre>
          )}
        </div>

        <div className="card">
          <h3>Check Lot Eligibility</h3>
          <form onSubmit={checkEligibility}>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="el-lot">stock_lot_id UUID</label>
              <input id="el-lot" required value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} />
            </div>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="el-qty">Exact Quantity String</label>
                <input id="el-qty" required value={eligQty} onChange={(e) => setEligQty(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="el-unit">Expected Unit UUID</label>
                <input id="el-unit" required value={eligUnitId} onChange={(e) => setEligUnitId(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="el-line">rf_line_id UUID (optional)</label>
              <input id="el-line" value={eligRfLineId} onChange={(e) => setEligRfLineId(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn secondary" type="submit" disabled={stockReason !== null} title={stockReason ?? undefined}>
                Evaluate Eligibility
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={stockReason !== null}
                title={stockReason ?? undefined}
                onClick={() => void inspectLotDetail(selectedLotId)}
              >
                Read Lot Detail
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={historyReason !== null}
                title={historyReason ?? undefined}
                onClick={() => void inspectLotHistory(selectedLotId)}
              >
                Lot History
              </button>
            </div>
          </form>
          {eligibilityResult !== null && <pre className="json-box">{JSON.stringify(eligibilityResult, null, 2)}</pre>}
          {lotDetail !== null && (
            <div style={{ marginTop: '0.65rem' }}>
              <h4>Lot Detail</h4>
              <pre className="json-box">{JSON.stringify(lotDetail, null, 2)}</pre>
            </div>
          )}
          {lotHistory !== null && (
            <div style={{ marginTop: '0.65rem' }}>
              <h4>Lot Movement History</h4>
              <pre className="json-box">{JSON.stringify(lotHistory, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
