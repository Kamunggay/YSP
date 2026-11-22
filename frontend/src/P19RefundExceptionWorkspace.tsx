import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP19RefundExceptionEngine } from './p19RefundExceptionSlice';
import type {
  FinancialContextKind,
  FundedExceptionKind,
  FundedExceptionRecord,
  OrderFinancialContext,
  P19ActionResult,
  P19EngineSnapshot,
  P19LookupResult,
  RefundCaseRecord,
  UnequalExchangeRecord,
} from './p19RefundExceptionSlice';

type P19TabId = 'refunds' | 'exchange' | 'exceptions' | 'history';

interface P19RefundExceptionWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P19RefundExceptionWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P19RefundExceptionWorkspaceProps) {
  const engine = useMemo(() => createP19RefundExceptionEngine(), []);
  const [snapshot, setSnapshot] = useState<P19EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P19TabId>('refunds');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P19ActionResult | null>(snapshot.last_action);
  const [selectedCtxId, setSelectedCtxId] = useState('');
  const [selectedRefundId, setSelectedRefundId] = useState('');
  const [selectedExId, setSelectedExId] = useState('');
  const [selectedExcId, setSelectedExcId] = useState('');

  // Tab 1: Financial Context & Refund Approval/Execution
  const [ctxKindInput, setCtxKindInput] = useState<FinancialContextKind>('track1_so');
  const [ctxSrcRefInput, setCtxSrcRefInput] = useState('');
  const [ctxOrRefInput, setCtxOrRefInput] = useState('');
  const [ctxAdjRefInput, setCtxAdjRefInput] = useState('');
  const [ctxBuyerInput, setCtxBuyerInput] = useState('');
  const [ctxCreditInput, setCtxCreditInput] = useState('');
  const [ctxConsumedInput, setCtxConsumedInput] = useState('');
  const [ctxPoRefInput, setCtxPoRefInput] = useState('');
  const [ctxPoAmtInput, setCtxPoAmtInput] = useState('');
  const [ctxResQtyInput, setCtxResQtyInput] = useState('');

  const [refPrepInput, setRefPrepInput] = useState('');
  const [refFinInput, setRefFinInput] = useState('');
  const [refAmtInput, setRefAmtInput] = useState('');
  const [refReasonInput, setRefReasonInput] = useState('');
  const [refAppAtInput, setRefAppAtInput] = useState('');

  const [execActorInput, setExecActorInput] = useState('');
  const [execChannelInput, setExecChannelInput] = useState<'cash' | 'official_gcash'>(
    'official_gcash'
  );
  const [execPayRefInput, setExecPayRefInput] = useState('');
  const [execHashInput, setExecHashInput] = useState('');
  const [execAtInput, setExecAtInput] = useState('');

  // Tab 2: Unequal Exchange Payment Gate
  const [exActorInput, setExActorInput] = useState('');
  const [exRetValInput, setExRetValInput] = useState('');
  const [exRepValInput, setExRepValInput] = useState('');
  const [exFabInput, setExFabInput] = useState(false);
  const [exPrepAtInput, setExPrepAtInput] = useState('');

  const [exVerActorInput, setExVerActorInput] = useState('');
  const [exOrRefInput, setExOrRefInput] = useState('');
  const [exVerAtInput, setExVerAtInput] = useState('');
  const [exSigHashInput, setExSigHashInput] = useState('');
  const [exRelAtInput, setExRelAtInput] = useState('');

  // Tab 3: Funded Exception Resolution
  const [excKindInput, setExcKindInput] = useState<FundedExceptionKind>('funded_cancellation');
  const [excActorInput, setExcActorInput] = useState('');
  const [excForfeitInput, setExcForfeitInput] = useState(false);
  const [excInitAtInput, setExcInitAtInput] = useState('');

  const [excApproverInput, setExcApproverInput] = useState('');
  const [excPoResInput, setExcPoResInput] = useState('');
  const [excStockResInput, setExcStockResInput] = useState('');
  const [excFundResInput, setExcFundResInput] = useState('');
  const [excReasonInput, setExcReasonInput] = useState('');
  const [excResAtInput, setExcResAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P19ActionResult<P19LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P19ActionResult<T>): P19ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeCtx: OrderFinancialContext | undefined =
    snapshot.financial_contexts.find((c) => c.context_id === selectedCtxId) ??
    snapshot.financial_contexts[0];

  const activeRefund: RefundCaseRecord | undefined =
    snapshot.refund_cases.find((r) => r.refund_id === selectedRefundId) ??
    snapshot.refund_cases[0];

  const activeExchange: UnequalExchangeRecord | undefined =
    snapshot.exchange_cases.find((x) => x.exchange_id === selectedExId) ??
    snapshot.exchange_cases[0];

  const activeException: FundedExceptionRecord | undefined =
    snapshot.funded_exceptions.find((e) => e.exception_id === selectedExcId) ??
    snapshot.funded_exceptions[0];

  function handleRegisterCtx() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerOrderFinancialContext({
        context_kind: ctxKindInput,
        source_reference: ctxSrcRefInput,
        or_reference: ctxOrRefInput,
        adj_reference: ctxAdjRefInput,
        buyer_name: ctxBuyerInput,
        verified_credit_amount: ctxCreditInput,
        consumed_release_coverage: ctxConsumedInput,
        linked_po_reference: ctxPoRefInput.trim() || null,
        open_po_committed_amount: ctxPoAmtInput || '0.00',
        reserved_stock_qty: ctxResQtyInput || '0',
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedCtxId(res.data.context_id);
      setCtxSrcRefInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleApproveRefund() {
    playClickPen(soundEnabled);
    if (!activeCtx) return;
    const res = refreshSnapshot(
      engine.approveCustomerRefund({
        context_id: activeCtx.context_id,
        preparer_user_id: refPrepInput,
        finance_approver_id: refFinInput,
        refund_amount: refAmtInput,
        approval_reason: refReasonInput,
        approved_at: refAppAtInput,
        idempotency_key: nextSequentialKey('p19-app-ref'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedRefundId(res.data.refund_id);
      setRefAmtInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleExecuteRefund() {
    playClickPen(soundEnabled);
    if (!activeRefund) return;
    const res = refreshSnapshot(
      engine.executeVerifiedRefund({
        refund_id: activeRefund.refund_id,
        executed_by_user_id: execActorInput,
        payout_channel: execChannelInput,
        payout_reference: execPayRefInput,
        evidence_hash: execHashInput,
        executed_at: execAtInput,
        expected_version: activeRefund.version,
        idempotency_key: nextSequentialKey('p19-exec-ref'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePrepareExchange() {
    playClickPen(soundEnabled);
    if (!activeCtx) return;
    const res = refreshSnapshot(
      engine.prepareUnequalExchange({
        context_id: activeCtx.context_id,
        actor_user_id: exActorInput,
        returned_item_value: exRetValInput,
        replacement_item_value: exRepValInput,
        attempt_new_so_fabrication: exFabInput,
        prepared_at: exPrepAtInput,
        idempotency_key: nextSequentialKey('p19-prep-ex'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedExId(res.data.exchange_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleVerifyExPayment() {
    playClickPen(soundEnabled);
    if (!activeExchange) return;
    const res = refreshSnapshot(
      engine.verifyAdditionalExchangePayment({
        exchange_id: activeExchange.exchange_id,
        verifier_user_id: exVerActorInput,
        additional_or_reference: exOrRefInput,
        verified_at: exVerAtInput,
        expected_version: activeExchange.version,
        idempotency_key: nextSequentialKey('p19-ver-ex'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReleaseExchange() {
    playClickPen(soundEnabled);
    if (!activeExchange) return;
    const res = refreshSnapshot(
      engine.releaseUnequalExchangeReplacement({
        exchange_id: activeExchange.exchange_id,
        actor_user_id: exVerActorInput.trim() || '301',
        signature_hash: exSigHashInput,
        released_at: exRelAtInput,
        expected_version: activeExchange.version,
        idempotency_key: nextSequentialKey('p19-rel-ex'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleInitiateException() {
    playClickPen(soundEnabled);
    if (!activeCtx) return;
    const res = refreshSnapshot(
      engine.initiateFundedExceptionCase({
        context_id: activeCtx.context_id,
        exception_kind: excKindInput,
        initiated_by_user_id: excActorInput,
        attempt_auto_forfeit_or_release: excForfeitInput,
        initiated_at: excInitAtInput,
        idempotency_key: nextSequentialKey('p19-init-exc'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedExcId(res.data.exception_id);
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleResolveException() {
    playClickPen(soundEnabled);
    if (!activeException) return;
    const res = refreshSnapshot(
      engine.resolveFundedExceptionObligations({
        exception_id: activeException.exception_id,
        approver_user_id: excApproverInput,
        po_resolution: excPoResInput,
        stock_resolution: excStockResInput,
        fund_resolution: excFundResInput,
        resolution_reason: excReasonInput,
        resolved_at: excResAtInput,
        expected_version: activeException.version,
        idempotency_key: nextSequentialKey('p19-res-exc'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupRefundExceptionOperation({
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
      engine.lookupRefundExceptionOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleContexts = snapshot.financial_contexts.filter(
    (c) =>
      !normalizedSearch ||
      c.source_reference.toLowerCase().includes(normalizedSearch) ||
      c.buyer_name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p19-workspace">
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
                id="p19-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orders, buyers, or refund contexts"
                aria-label="Search refunds and funded exceptions"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Refunds, Unequal Exchanges &amp; Funded Exceptions</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Financial exception workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p19-tab-refunds"
                  aria-selected={activeTab === 'refunds'}
                  className={`p03-filter-pill ${activeTab === 'refunds' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('refunds');
                  }}
                >
                  Refund Approval &amp; Payout
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p19-tab-exchange"
                  aria-selected={activeTab === 'exchange'}
                  className={`p03-filter-pill ${activeTab === 'exchange' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('exchange');
                  }}
                >
                  Unequal Exchange Payment Gate
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p19-tab-exceptions"
                  aria-selected={activeTab === 'exceptions'}
                  className={`p03-filter-pill ${activeTab === 'exceptions' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('exceptions');
                  }}
                >
                  Funded Cancellations &amp; Commitments
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p19-tab-history"
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
                id="p19-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p19-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p19-overview-heading" className="p03-section-title">
              Financial Exception &amp; Obligation Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Open Obligations:{' '}
                <strong data-testid="p19-open-obligations-val">
                  {snapshot.summary.open_funded_obligations}
                </strong>
              </span>
              <span className="p03-version-pill">
                Contexts: <strong>{visibleContexts.length}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Net Verified Credit</span>
              <span className="p03-axis-val" data-testid="p19-net-credit-val">
                {snapshot.summary.net_verified_credit}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Approved Unexecuted</span>
              <span className="p03-axis-val" data-testid="p19-approved-unexecuted-val">
                {snapshot.summary.approved_unexecuted_refunds}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Executed Refunds Total</span>
              <span className="p03-axis-val" data-testid="p19-executed-refunds-val">
                {snapshot.summary.executed_refunds_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Exchange Collected</span>
              <span className="p03-axis-val" data-testid="p19-exchange-collected-val">
                {snapshot.summary.additional_exchange_collected}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p19-feedback-banner"
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

        {/* TAB 1: Refund Approval & Payout */}
        {activeTab === 'refunds' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p19-reg-ctx-heading">
              <h2 id="p19-reg-ctx-heading" className="p03-section-title">
                Register Order Financial &amp; Obligation Context
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ctx-kind" className="form-label">
                    Source Context
                  </label>
                  <select
                    id="p19-ctx-kind"
                    className="form-control"
                    value={ctxKindInput}
                    onChange={(e) => setCtxKindInput(e.target.value as FinancialContextKind)}
                  >
                    <option value="track1_so">Track 1 Sales Order</option>
                    <option value="booth_or">Track 2 Booth Receipt Claim</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ctx-src-ref" className="form-label">
                    Source Reference
                  </label>
                  <input
                    id="p19-ctx-src-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxSrcRefInput}
                    placeholder="e.g. CEBU-SO-2026-000001"
                    onChange={(e) => setCtxSrcRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ctx-or-ref" className="form-label">
                    Verified OR Reference
                  </label>
                  <input
                    id="p19-ctx-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxOrRefInput}
                    placeholder="e.g. CEBU-OR-2026-000001"
                    onChange={(e) => setCtxOrRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ctx-adj-ref" className="form-label">
                    Linked ADJ Reference
                  </label>
                  <input
                    id="p19-ctx-adj-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxAdjRefInput}
                    placeholder="e.g. CEBU-ADJ-CLM-2026-000001"
                    onChange={(e) => setCtxAdjRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ctx-buyer" className="form-label">
                    Buyer Name
                  </label>
                  <input
                    id="p19-ctx-buyer"
                    type="text"
                    className="form-control"
                    value={ctxBuyerInput}
                    placeholder="e.g. Maria Santos"
                    onChange={(e) => setCtxBuyerInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ctx-credit" className="form-label">
                    Verified Customer Credit (PHP)
                  </label>
                  <input
                    id="p19-ctx-credit"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxCreditInput}
                    placeholder="e.g. 1000.00"
                    onChange={(e) => setCtxCreditInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ctx-consumed" className="form-label">
                    Consumed Coverage (PHP)
                  </label>
                  <input
                    id="p19-ctx-consumed"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxConsumedInput}
                    placeholder="e.g. 250.00"
                    onChange={(e) => setCtxConsumedInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ctx-po-ref" className="form-label">
                    Linked PO Ref (Optional)
                  </label>
                  <input
                    id="p19-ctx-po-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxPoRefInput}
                    placeholder="e.g. CEBU-PO-2026-000004"
                    onChange={(e) => setCtxPoRefInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ctx-po-amt" className="form-label">
                    Open PO Committed (PHP)
                  </label>
                  <input
                    id="p19-ctx-po-amt"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxPoAmtInput}
                    placeholder="e.g. 0.00"
                    onChange={(e) => setCtxPoAmtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ctx-res-qty" className="form-label">
                    Reserved Stock Qty
                  </label>
                  <input
                    id="p19-ctx-res-qty"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={ctxResQtyInput}
                    placeholder="e.g. 0"
                    onChange={(e) => setCtxResQtyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-register-ctx-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRegisterCtx}
                >
                  Register Financial Context
                </button>
              </div>
              {snapshot.financial_contexts.length === 0 ? (
                <p className="p03-muted-copy" data-testid="p19-empty-contexts-notice">
                  No financial exception contexts registered yet.
                </p>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p19-ref-exec-heading">
              <h2 id="p19-ref-exec-heading" className="p03-section-title">
                Approve &amp; Execute Customer Refund
              </h2>
              <p className="p03-muted-copy">
                Finance approval authorizes refund eligibility with zero cash debit; verified payout
                execution adjusts net verified credit once while keeping payment history intact.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ref-prep" className="form-label">
                    Preparer ID
                  </label>
                  <input
                    id="p19-ref-prep"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={refPrepInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setRefPrepInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ref-fin" className="form-label">
                    Finance Approver ID
                  </label>
                  <input
                    id="p19-ref-fin"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={refFinInput}
                    placeholder="Approver ID (e.g. 202)"
                    onChange={(e) => setRefFinInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ref-amt" className="form-label">
                    Approved Refund Amount (PHP)
                  </label>
                  <input
                    id="p19-ref-amt"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={refAmtInput}
                    placeholder="e.g. 500.00"
                    onChange={(e) => setRefAmtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ref-at" className="form-label">
                    Approval Time (UTC)
                  </label>
                  <input
                    id="p19-ref-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={refAppAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRefAppAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p19-ref-reason" className="form-label">
                  Refund Approval Reason
                </label>
                <input
                  id="p19-ref-reason"
                  type="text"
                  className="form-control"
                  value={refReasonInput}
                  placeholder="Authorized ADJ refund"
                  onChange={(e) => setRefReasonInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-approve-refund-btn"
                  className="btn-batcave-secondary"
                  onClick={handleApproveRefund}
                >
                  Approve Refund (No Debit Yet)
                </button>
              </div>

              <hr />
              <h3 className="p03-section-title">Execute Actual Verified Payout</h3>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-exec-actor" className="form-label">
                    Disbursing Officer ID
                  </label>
                  <input
                    id="p19-exec-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={execActorInput}
                    placeholder="e.g. 203"
                    onChange={(e) => setExecActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-exec-channel" className="form-label">
                    Payout Channel
                  </label>
                  <select
                    id="p19-exec-channel"
                    className="form-control"
                    value={execChannelInput}
                    onChange={(e) =>
                      setExecChannelInput(e.target.value as 'cash' | 'official_gcash')
                    }
                  >
                    <option value="official_gcash">Official GCash Payout</option>
                    <option value="cash">Chapter Cash Refund Voucher</option>
                  </select>
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-exec-pay-ref" className="form-label">
                    Payout Reference
                  </label>
                  <input
                    id="p19-exec-pay-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={execPayRefInput}
                    placeholder="e.g. GC-PAYOUT-9901"
                    onChange={(e) => setExecPayRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-exec-at" className="form-label">
                    Actual Payout Time (UTC)
                  </label>
                  <input
                    id="p19-exec-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={execAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setExecAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="p19-exec-hash" className="form-label">
                  Payout Proof SHA-256 Digest
                </label>
                <input
                  id="p19-exec-hash"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={execHashInput}
                  placeholder="64 lowercase hex chars"
                  onChange={(e) => setExecHashInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-execute-refund-btn"
                  className="btn-batcave-primary"
                  onClick={handleExecuteRefund}
                >
                  Execute Verified Refund Payout
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Unequal Exchange Payment Gate */}
        {activeTab === 'exchange' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p19-prep-ex-heading">
              <h2 id="p19-prep-ex-heading" className="p03-section-title">
                Prepare Higher-Value Unequal Exchange
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ex-actor" className="form-label">
                    Preparing Officer ID
                  </label>
                  <input
                    id="p19-ex-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exActorInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setExActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ex-at" className="form-label">
                    Preparation Time (UTC)
                  </label>
                  <input
                    id="p19-ex-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exPrepAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setExPrepAtInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ex-ret-val" className="form-label">
                    Returned Item Value (PHP)
                  </label>
                  <input
                    id="p19-ex-ret-val"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exRetValInput}
                    placeholder="e.g. 250.00"
                    onChange={(e) => setExRetValInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ex-rep-val" className="form-label">
                    Replacement Item Value (PHP)
                  </label>
                  <input
                    id="p19-ex-rep-val"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exRepValInput}
                    placeholder="e.g. 400.00"
                    onChange={(e) => setExRepValInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p19-ex-fab-checkbox"
                  type="checkbox"
                  checked={exFabInput}
                  onChange={(e) => setExFabInput(e.target.checked)}
                />
                <label htmlFor="p19-ex-fab-checkbox">
                  Attempt new SO fabrication for booth OR claim (must reject)
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-prepare-exchange-btn"
                  className="btn-batcave-primary"
                  onClick={handlePrepareExchange}
                >
                  Prepare Unequal Exchange
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p19-ver-ex-heading">
              <h2 id="p19-ver-ex-heading" className="p03-section-title">
                Verify Difference &amp; Release Replacement
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ex-ver-actor" className="form-label">
                    Finance Verifier ID
                  </label>
                  <input
                    id="p19-ex-ver-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exVerActorInput}
                    placeholder="e.g. 202"
                    onChange={(e) => setExVerActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ex-or-ref" className="form-label">
                    Additional Payment OR
                  </label>
                  <input
                    id="p19-ex-or-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exOrRefInput}
                    placeholder="e.g. CEBU-OR-2026-000050"
                    onChange={(e) => setExOrRefInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-ex-ver-at" className="form-label">
                    Payment Verification Time (UTC)
                  </label>
                  <input
                    id="p19-ex-ver-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exVerAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setExVerAtInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-ex-sig-hash" className="form-label">
                    Recipient Signature SHA-256
                  </label>
                  <input
                    id="p19-ex-sig-hash"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={exSigHashInput}
                    placeholder="64 lowercase hex chars"
                    onChange={(e) => setExSigHashInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="p19-ex-rel-at" className="form-label">
                  Replacement Release Time (UTC)
                </label>
                <input
                  id="p19-ex-rel-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={exRelAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setExRelAtInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-verify-ex-pay-btn"
                  className="btn-batcave-secondary"
                  onClick={handleVerifyExPayment}
                >
                  Verify Additional Payment OR
                </button>
                <button
                  type="button"
                  id="p19-release-ex-btn"
                  className="btn-batcave-primary"
                  onClick={handleReleaseExchange}
                >
                  Release Higher-Value Replacement
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Funded Cancellations & Commitments */}
        {activeTab === 'exceptions' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p19-init-exc-heading">
              <h2 id="p19-init-exc-heading" className="p03-section-title">
                Initiate Funded Exception / Cancellation Case
              </h2>
              <p className="p03-muted-copy">
                Preserves open supplier PO commitments, reserved stock, and verified deposits
                against automatic forfeiture or silent clearance until authorized resolution.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-exc-kind" className="form-label">
                    Exception Kind
                  </label>
                  <select
                    id="p19-exc-kind"
                    className="form-control"
                    value={excKindInput}
                    onChange={(e) => setExcKindInput(e.target.value as FundedExceptionKind)}
                  >
                    <option value="funded_cancellation">Funded Order Cancellation</option>
                    <option value="supplier_failure">Supplier Fulfillment Failure</option>
                    <option value="excess_cost">Excess Procurement Cost</option>
                    <option value="overdue_pickup">Overdue Paid Pickup Follow-Up</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p19-exc-actor" className="form-label">
                    Initiating Officer ID
                  </label>
                  <input
                    id="p19-exc-actor"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={excActorInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setExcActorInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p19-exc-init-at" className="form-label">
                  Initiation Time (UTC)
                </label>
                <input
                  id="p19-exc-init-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={excInitAtInput}
                  placeholder="YYYY-MM-DDTHH:MM:SSZ"
                  onChange={(e) => setExcInitAtInput(e.target.value)}
                />
              </div>

              <div className="p03-checkbox-row">
                <input
                  id="p19-exc-forfeit-checkbox"
                  type="checkbox"
                  checked={excForfeitInput}
                  onChange={(e) => setExcForfeitInput(e.target.checked)}
                />
                <label htmlFor="p19-exc-forfeit-checkbox">
                  Attempt automatic deposit forfeiture or silent stock release (must reject)
                </label>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-initiate-exc-btn"
                  className="btn-batcave-primary"
                  onClick={handleInitiateException}
                >
                  Open Funded Exception Review
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p19-res-exc-heading">
              <h2 id="p19-res-exc-heading" className="p03-section-title">
                Resolve Linked PO, Stock &amp; Fund Obligations
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-exc-approver" className="form-label">
                    Authorizing Approver ID
                  </label>
                  <input
                    id="p19-exc-approver"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={excApproverInput}
                    placeholder="Approver ID (e.g. 202)"
                    onChange={(e) => setExcApproverInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-exc-res-at" className="form-label">
                    Resolution Time (UTC)
                  </label>
                  <input
                    id="p19-exc-res-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={excResAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setExcResAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p19-exc-po-res" className="form-label">
                  Supplier PO Commitment Resolution
                </label>
                <input
                  id="p19-exc-po-res"
                  type="text"
                  className="form-control"
                  value={excPoResInput}
                  placeholder="Retain PO as safety stock"
                  onChange={(e) => setExcPoResInput(e.target.value)}
                />
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-exc-stock-res" className="form-label">
                    Stock Reservation Disposition
                  </label>
                  <input
                    id="p19-exc-stock-res"
                    type="text"
                    className="form-control"
                    value={excStockResInput}
                    placeholder="Release 3 units cleanly"
                    onChange={(e) => setExcStockResInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-exc-fund-res" className="form-label">
                    Customer Fund / Refund Decision
                  </label>
                  <input
                    id="p19-exc-fund-res"
                    type="text"
                    className="form-control"
                    value={excFundResInput}
                    placeholder="Refund PHP 400.00 deposit"
                    onChange={(e) => setExcFundResInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p19-exc-reason" className="form-label">
                  Policy Authorization Rationale
                </label>
                <input
                  id="p19-exc-reason"
                  type="text"
                  className="form-control"
                  value={excReasonInput}
                  placeholder="Chapter funded cancellation note"
                  onChange={(e) => setExcReasonInput(e.target.value)}
                />
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-resolve-exc-btn"
                  className="btn-batcave-primary"
                  onClick={handleResolveException}
                >
                  Confirm Authorized Exception Closure
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p19-history-heading">
              <h2 id="p19-history-heading" className="p03-section-title">
                Refund &amp; Exception Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p19-history-list">
                  {snapshot.history.map((item) => (
                    <div key={item.event_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>{item.action}</strong>
                        <span>
                          Actor {item.actor_user_id} — Target #{item.target_id}
                          {item.reason ? ` — ${item.reason}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p19-lookup-heading">
              <h2 id="p19-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p19-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p19-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p19-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p19-lookup-ulid-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupUlidInput}
                    placeholder="Operation ULID"
                    onChange={(e) => setLookupUlidInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p19-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p19-lookup-by-ulid-btn"
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
                        data-testid={`p19-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p19-lookup-result" aria-live="polite">
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
