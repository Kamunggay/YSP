import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP21BoothSaleOrEngine } from './p21BoothSaleOrSlice';
import type {
  BoothCatalogItem,
  BoothPaymentChannel,
  P21ActionResult,
  P21EngineSnapshot,
  P21LookupResult,
} from './p21BoothSaleOrSlice';

type P21TabId = 'pos' | 'handoff' | 'history';

interface P21BoothSaleOrWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P21BoothSaleOrWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P21BoothSaleOrWorkspaceProps) {
  const engine = useMemo(() => createP21BoothSaleOrEngine(), []);
  const [snapshot, setSnapshot] = useState<P21EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P21TabId>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P21ActionResult | null>(snapshot.last_action);
  const [selectedItemId, setSelectedItemId] = useState('');

  // Tab 1: Booth Catalog, Cart & Immediate Sale
  const [catEventInput, setCatEventInput] = useState('');
  const [catSkuInput, setCatSkuInput] = useState('');
  const [catNameInput, setCatNameInput] = useState('');
  const [catPriceInput, setCatPriceInput] = useState('');
  const [catBoothQtyInput, setCatBoothQtyInput] = useState('');
  const [catStockQtyInput, setCatStockQtyInput] = useState('');

  const [cartQtyInput, setCartQtyInput] = useState('');
  const [confirmResetInput, setConfirmResetInput] = useState(false);
  const [concQtyInput, setConcQtyInput] = useState('');
  const [concActorInput, setConcActorInput] = useState('');

  const [saleCashierInput, setSaleCashierInput] = useState('');
  const [salePriceInput, setSalePriceInput] = useState('');
  const [saleChannelInput, setSaleChannelInput] = useState<BoothPaymentChannel>('cash');
  const [saleGcashVerifiedInput, setSaleGcashVerifiedInput] = useState(false);
  const [salePayRefInput, setSalePayRefInput] = useState('');
  const [saleAtInput, setSaleAtInput] = useState('');

  // Tab 2: Track 1 SO Handoff
  const [hoEventInput, setHoEventInput] = useState('');
  const [hoSkuInput, setHoSkuInput] = useState('');
  const [hoBuyerInput, setHoBuyerInput] = useState('');
  const [hoQtyInput, setHoQtyInput] = useState('');
  const [hoCashierInput, setHoCashierInput] = useState('');
  const [hoAtInput, setHoAtInput] = useState('');
  const [hoNotesInput, setHoNotesInput] = useState('');

  // Tab 3: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P21ActionResult<P21LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P21ActionResult<T>): P21ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeItem: BoothCatalogItem | undefined =
    snapshot.catalog_items.find((c) => c.item_id === selectedItemId) ?? snapshot.catalog_items[0];

  function handleRegisterItem() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerCheckedOutBoothCatalogItem({
        event_code: catEventInput,
        sku_code: catSkuInput,
        item_name: catNameInput,
        approved_unit_price: catPriceInput,
        booth_custody_qty: catBoothQtyInput,
        stockroom_usable_qty: catStockQtyInput,
        idempotency_key: nextSequentialKey('p21-cat'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedItemId(res.data.item_id);
      setCartQtyInput('0');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleStepCart(mode: 'increment' | 'decrement') {
    playClickPen(soundEnabled);
    if (!activeItem) return;
    const res = refreshSnapshot(
      engine.adjustBoothCartQuantity({ item_id: activeItem.item_id, mode })
    );
    if (res.ok && res.data) setCartQtyInput(res.data.cart_qty);
  }

  function handleDirectCartChange(value: string) {
    setCartQtyInput(value);
    if (!activeItem || !/^\d+$/.test(value.trim())) return;
    const res = refreshSnapshot(
      engine.adjustBoothCartQuantity({
        item_id: activeItem.item_id,
        mode: 'set_exact',
        quantity_value: value.trim(),
      })
    );
    if (res.ok && res.data) {
      setCartQtyInput(res.data.cart_qty);
    }
  }

  function handleResetCart() {
    playClickPen(soundEnabled);
    if (!activeItem) return;
    const res = refreshSnapshot(
      engine.resetUnpostedBoothCart({
        item_id: activeItem.item_id,
        confirm_non_empty_reset: confirmResetInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setCartQtyInput('0');
      setConfirmResetInput(false);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleConcurrentStockUpdate() {
    playClickPen(soundEnabled);
    if (!activeItem) return;
    const res = refreshSnapshot(
      engine.simulateConcurrentBoothStockChange({
        item_id: activeItem.item_id,
        new_booth_custody_qty: concQtyInput,
        actor_user_id: concActorInput,
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCommitSale() {
    playClickPen(soundEnabled);
    if (!activeItem) return;
    const res = refreshSnapshot(
      engine.commitImmediateBoothSale({
        item_id: activeItem.item_id,
        cashier_user_id: saleCashierInput,
        submitted_unit_price: salePriceInput,
        payment_channel: saleChannelInput,
        gcash_credit_verified: saleGcashVerifiedInput,
        payment_reference: salePayRefInput,
        sold_at: saleAtInput,
        idempotency_key: nextSequentialKey('p21-sale'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setCartQtyInput('0');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleTrack1Handoff() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.handoffOutOfStockToTrack1So({
        event_code: hoEventInput,
        sku_code: hoSkuInput,
        buyer_name: hoBuyerInput,
        requested_qty: hoQtyInput,
        cashier_user_id: hoCashierInput,
        recorded_at: hoAtInput,
        notes: hoNotesInput,
        idempotency_key: nextSequentialKey('p21-handoff'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupBoothSaleOperation({
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
      engine.lookupBoothSaleOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleCatalog = snapshot.catalog_items.filter(
    (c) =>
      !normalizedSearch ||
      c.sku_code.toLowerCase().includes(normalizedSearch) ||
      c.item_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p21-workspace">
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
                id="p21-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search booth catalog SKUs"
                aria-label="Search booth catalog items"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Immediate Booth Cart, Verified Sale &amp; Receipts</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Booth sale and receipt tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p21-tab-pos"
                  aria-selected={activeTab === 'pos'}
                  className={`p03-filter-pill ${activeTab === 'pos' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('pos');
                  }}
                >
                  Booth Cart &amp; Immediate Sale
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p21-tab-handoff"
                  aria-selected={activeTab === 'handoff'}
                  className={`p03-filter-pill ${activeTab === 'handoff' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('handoff');
                  }}
                >
                  Custom / Out-of-Stock Lead
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p21-tab-history"
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
                id="p21-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p21-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p21-overview-heading" className="p03-section-title">
              Event Custody &amp; Immediate Sales — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Receipts Issued:{' '}
                <strong data-testid="p21-or-count-val">{snapshot.summary.or_issued_count}</strong>
              </span>
              <span className="p03-version-pill">
                Items: <strong>{visibleCatalog.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Booth Custody Stock</span>
              <span className="p03-axis-val" data-testid="p21-booth-custody-val">
                {snapshot.summary.booth_custody_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Stockroom Balance</span>
              <span className="p03-axis-val" data-testid="p21-stockroom-usable-val">
                {snapshot.summary.stockroom_usable_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Unposted Cart Qty</span>
              <span className="p03-axis-val" data-testid="p21-cart-qty-val">
                {snapshot.summary.cart_total_qty}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Verified Sales (PHP)</span>
              <span className="p03-axis-val" data-testid="p21-sales-total-val">
                {snapshot.summary.verified_booth_sales_total}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p21-feedback-banner"
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

        {/* TAB 1: Booth Catalog & Immediate Sale */}
        {activeTab === 'pos' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p21-catalog-heading">
              <h2 id="p21-catalog-heading" className="p03-section-title">
                Load Checked-Out Booth Catalog &amp; Unposted Cart
              </h2>
              <div className="form-group">
                <label htmlFor="p21-cat-event" className="form-label">
                  Event Reference
                </label>
                <input
                  id="p21-cat-event"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={catEventInput}
                  placeholder="CEBU-EVT-2026-000001"
                  onChange={(e) => setCatEventInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-cat-sku" className="form-label">
                  Event Item SKU
                </label>
                <input
                  id="p21-cat-sku"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={catSkuInput}
                  placeholder="YSP-KIT-STD"
                  onChange={(e) => setCatSkuInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-cat-name" className="form-label">
                  Item Name
                </label>
                <input
                  id="p21-cat-name"
                  type="text"
                  className="form-control"
                  value={catNameInput}
                  placeholder="Event merchandise item"
                  onChange={(e) => setCatNameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-cat-price" className="form-label">
                  Approved Unit Price (PHP)
                </label>
                <input
                  id="p21-cat-price"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={catPriceInput}
                  placeholder="150.00"
                  onChange={(e) => setCatPriceInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-cat-booth-qty" className="form-label">
                  Booth Custody Qty
                </label>
                <input
                  id="p21-cat-booth-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={catBoothQtyInput}
                  placeholder="100"
                  onChange={(e) => setCatBoothQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-cat-stock-qty" className="form-label">
                  Stockroom Usable Qty
                </label>
                <input
                  id="p21-cat-stock-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={catStockQtyInput}
                  placeholder="50"
                  onChange={(e) => setCatStockQtyInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p21-register-item-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRegisterItem}
                >
                  Load Booth Catalog Item
                </button>
              </div>
              {snapshot.catalog_items.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p21-empty-catalog-notice">
                  No checked-out booth merchandise loaded yet.
                </p>
              ) : null}

              <hr />
              <h3 className="p03-section-title">Cart Quantity Controls</h3>
              <div className="form-group">
                <label htmlFor="p21-cart-qty-input" className="form-label">
                  Direct Cart Quantity
                </label>
                <input
                  id="p21-cart-qty-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={cartQtyInput}
                  placeholder="0"
                  onChange={(e) => handleDirectCartChange(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p21-cart-dec-btn"
                  className="btn-batcave-secondary"
                  aria-label="Decrease cart quantity"
                  onClick={() => handleStepCart('decrement')}
                >
                  − Decrease (-1)
                </button>
                <button
                  type="button"
                  id="p21-cart-inc-btn"
                  className="btn-batcave-secondary"
                  aria-label="Increase cart quantity"
                  onClick={() => handleStepCart('increment')}
                >
                  + Increase (+1)
                </button>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p21-cart-reset-confirm"
                  type="checkbox"
                  checked={confirmResetInput}
                  onChange={(e) => setConfirmResetInput(e.target.checked)}
                />
                <label htmlFor="p21-cart-reset-confirm">
                  Confirm clearing non-empty unposted cart
                </label>
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p21-cart-reset-btn"
                  className="btn-batcave-secondary"
                  onClick={handleResetCart}
                >
                  Reset Unposted Cart
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p21-sale-heading">
              <h2 id="p21-sale-heading" className="p03-section-title">
                Verify Payment &amp; Issue Immediate Receipt
              </h2>
              <div className="form-group">
                <label htmlFor="p21-sale-cashier" className="form-label">
                  Booth Cashier ID
                </label>
                <input
                  id="p21-sale-cashier"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={saleCashierInput}
                  placeholder="302"
                  onChange={(e) => setSaleCashierInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-sale-price" className="form-label">
                  Unit Price Presented (PHP)
                </label>
                <input
                  id="p21-sale-price"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={salePriceInput}
                  placeholder="150.00"
                  onChange={(e) => setSalePriceInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-sale-channel" className="form-label">
                  Payment Channel
                </label>
                <select
                  id="p21-sale-channel"
                  className="form-control"
                  value={saleChannelInput}
                  onChange={(e) => setSaleChannelInput(e.target.value as BoothPaymentChannel)}
                >
                  <option value="cash">Cash in Booth Drawer</option>
                  <option value="official_gcash">Official Chapter GCash</option>
                </select>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p21-sale-gcash-verified"
                  type="checkbox"
                  checked={saleGcashVerifiedInput}
                  onChange={(e) => setSaleGcashVerifiedInput(e.target.checked)}
                />
                <label htmlFor="p21-sale-gcash-verified">
                  Official chapter GCash credit confirmed in account
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p21-sale-pay-ref" className="form-label">
                  Payment Reference
                </label>
                <input
                  id="p21-sale-pay-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={salePayRefInput}
                  placeholder="GC-771201"
                  onChange={(e) => setSalePayRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-sale-at" className="form-label">
                  Sale Timestamp (UTC)
                </label>
                <input
                  id="p21-sale-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={saleAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setSaleAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p21-commit-sale-btn"
                  className="btn-batcave-primary"
                  onClick={handleCommitSale}
                >
                  Commit Immediate Booth Sale
                </button>
              </div>

              <hr />
              <h3 className="p03-section-title">Concurrent Custody Re-Check Check</h3>
              <div className="form-group">
                <label htmlFor="p21-conc-actor" className="form-label">
                  Concurrent Officer ID
                </label>
                <input
                  id="p21-conc-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={concActorInput}
                  placeholder="305"
                  onChange={(e) => setConcActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-conc-qty" className="form-label">
                  Updated Booth Custody Qty
                </label>
                <input
                  id="p21-conc-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={concQtyInput}
                  placeholder="2"
                  onChange={(e) => setConcQtyInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p21-conc-update-btn"
                  className="btn-batcave-secondary"
                  onClick={handleConcurrentStockUpdate}
                >
                  Apply Concurrent Stock Change
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Out-of-Stock / Custom Order Handoff to Sales */}
        {activeTab === 'handoff' ? (
          <section className="p03-card surface-card" aria-labelledby="p21-handoff-heading">
            <h2 id="p21-handoff-heading" className="p03-section-title">
              Refer Custom or Out-of-Stock Demand to Sales Order Desk
            </h2>
            <p className="p03-muted-copy">
              Out-of-stock requests route to staff-recorded Sales Orders rather than creating
              untracked booth backorders.
            </p>
            <div className="form-group">
              <label htmlFor="p21-ho-event" className="form-label">
                Event Code
              </label>
              <input
                id="p21-ho-event"
                type="text"
                className="form-control p03-mono-inline"
                value={hoEventInput}
                placeholder="CEBU-EVT-2026-000001"
                onChange={(e) => setHoEventInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-sku" className="form-label">
                Requested SKU
              </label>
              <input
                id="p21-ho-sku"
                type="text"
                className="form-control p03-mono-inline"
                value={hoSkuInput}
                placeholder="YSP-KIT-STD"
                onChange={(e) => setHoSkuInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-buyer" className="form-label">
                Buyer Name
              </label>
              <input
                id="p21-ho-buyer"
                type="text"
                className="form-control"
                value={hoBuyerInput}
                placeholder="Elena Bautista"
                onChange={(e) => setHoBuyerInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-qty" className="form-label">
                Requested Quantity
              </label>
              <input
                id="p21-ho-qty"
                type="text"
                className="form-control p03-mono-inline"
                value={hoQtyInput}
                placeholder="8"
                onChange={(e) => setHoQtyInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-cashier" className="form-label">
                Referring Cashier ID
              </label>
              <input
                id="p21-ho-cashier"
                type="text"
                className="form-control p03-mono-inline"
                value={hoCashierInput}
                placeholder="302"
                onChange={(e) => setHoCashierInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-at" className="form-label">
                Recorded Timestamp (UTC)
              </label>
              <input
                id="p21-ho-at"
                type="text"
                className="form-control p03-mono-inline"
                value={hoAtInput}
                placeholder="YYYY-MM-DDTHH:MM:SSZ"
                onChange={(e) => setHoAtInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p21-ho-notes" className="form-label">
                Customer Fulfillment Note
              </label>
              <input
                id="p21-ho-notes"
                type="text"
                className="form-control"
                value={hoNotesInput}
                placeholder="Buyer prefers scheduled order"
                onChange={(e) => setHoNotesInput(e.target.value)}
              />
            </div>
            <div className="p03-guard-buttons">
              <button
                type="button"
                id="p21-handoff-btn"
                className="btn-batcave-primary"
                onClick={handleTrack1Handoff}
              >
                Refer to Sales Order Lead
              </button>
            </div>
          </section>
        ) : null}

        {/* TAB 3: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p21-audit-heading">
              <h2 id="p21-audit-heading" className="p03-section-title">
                Issued Receipts &amp; Sale Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No immediate booth sales or handoffs recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p21-lookup-heading">
              <h2 id="p21-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p21-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p21-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p21-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p21-lookup-ulid-input"
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
                  id="p21-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p21-lookup-by-ulid-btn"
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
                        data-testid={`p21-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p21-lookup-result" aria-live="polite">
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
