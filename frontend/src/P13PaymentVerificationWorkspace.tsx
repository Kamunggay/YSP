import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP13PaymentVerificationEngine } from './p13PaymentVerificationSlice';
import type {
  BillableSalesOrder,
  OfficialChannelKind,
  P13ActionResult,
  P13EngineSnapshot,
  P13LookupResult,
  PaymentEvidenceKind,
  PaymentSubmission,
} from './p13PaymentVerificationSlice';

type P13TabId = 'accounts' | 'verify' | 'allocate' | 'history';

interface P13PaymentVerificationWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P13PaymentVerificationWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P13PaymentVerificationWorkspaceProps) {
  const engine = useMemo(() => createP13PaymentVerificationEngine(), []);
  const [snapshot, setSnapshot] = useState<P13EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P13TabId>('accounts');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P13ActionResult | null>(snapshot.last_action);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedSubId, setSelectedSubId] = useState('');

  // Tab 1: Official Accounts & Billable Orders
  const [accChannelInput, setAccChannelInput] = useState<OfficialChannelKind>('official_gcash');
  const [accCodeInput, setAccCodeInput] = useState('');
  const [accLabelInput, setAccLabelInput] = useState('');
  const [accFinanceIdInput, setAccFinanceIdInput] = useState('');

  const [billSoRefInput, setBillSoRefInput] = useState('');
  const [billSiRefInput, setBillSiRefInput] = useState('');
  const [billBuyerInput, setBillBuyerInput] = useState('');
  const [billTotalDueInput, setBillTotalDueInput] = useState('');
  const [billAvailValInput, setBillAvailValInput] = useState('');
  const [billBackorderCostInput, setBillBackorderCostInput] = useState('');

  // Tab 2: Submit Payment & Verify OR
  const [payPayerInput, setPayPayerInput] = useState('');
  const [payChannelInput, setPayChannelInput] = useState<OfficialChannelKind>('official_gcash');
  const [payAccountInput, setPayAccountInput] = useState('');
  const [payExtRefInput, setPayExtRefInput] = useState('');
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payCollectorInput, setPayCollectorInput] = useState('');
  const [payEvKindInput, setPayEvKindInput] = useState<PaymentEvidenceKind>('actual_account_credit');
  const [payReceivedAtInput, setPayReceivedAtInput] = useState('');

  const [verVerifierInput, setVerVerifierInput] = useState('');
  const [verConfirmedInput, setVerConfirmedInput] = useState(false);
  const [verAtInput, setVerAtInput] = useState('');
  const [holdReasonInput, setHoldReasonInput] = useState('');
  const [contactChannelInput, setContactChannelInput] = useState('');
  const [contactOutcomeInput, setContactOutcomeInput] = useState('');

  // Tab 3: Credit Allocation & Finance Reconciliation
  const [allocFinanceInput, setAllocFinanceInput] = useState('');
  const [allocCoverageInput, setAllocCoverageInput] = useState('');
  const [allocFundingInput, setAllocFundingInput] = useState('');
  const [allocAtInput, setAllocAtInput] = useState('');
  const [recActorInput, setRecActorInput] = useState('');
  const [recAtInput, setRecAtInput] = useState('');

  // Tab 4: Recovery Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P13ActionResult<P13LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P13ActionResult<T>): P13ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  const activeOrder: BillableSalesOrder | undefined =
    snapshot.billable_orders.find((b) => b.bill_so_id === selectedOrderId) ??
    snapshot.billable_orders[0];

  const activeSubmission: PaymentSubmission | undefined =
    snapshot.payment_submissions.find((p) => p.submission_id === selectedSubId) ??
    snapshot.payment_submissions[0];

  function handleRegisterAccount() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerOfficialPaymentAccount({
        channel: accChannelInput,
        account_code: accCodeInput,
        account_label: accLabelInput,
        approved_by_finance_id: accFinanceIdInput,
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setAccCodeInput('');
      setAccLabelInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRegisterBillableOrder() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.registerBillableSalesOrder({
        so_reference: billSoRefInput,
        si_reference: billSiRefInput,
        buyer_name: billBuyerInput,
        total_amount_due: billTotalDueInput,
        available_merchandise_value: billAvailValInput,
        backorder_procurement_cost: billBackorderCostInput,
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedOrderId(res.data.bill_so_id);
      setBillSoRefInput('');
      setBillSiRefInput('');
      setBillBuyerInput('');
      setBillTotalDueInput('');
      setBillAvailValInput('');
      setBillBackorderCostInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSubmitPayment() {
    playClickPen(soundEnabled);
    if (!activeOrder) {
      const msg = 'Register or select a billable sales order first.';
      setLastResult({ ok: false, http_status: 404, code: 'RESOURCE_NOT_FOUND', message: msg });
      onNotify('error', msg);
      return;
    }

    const res = refreshSnapshot(
      engine.submitPaymentEvidence({
        bill_so_id: activeOrder.bill_so_id,
        payer_name: payPayerInput,
        channel: payChannelInput,
        account_code: payAccountInput,
        external_reference: payExtRefInput,
        amount: payAmountInput,
        submitted_by_user_id: payCollectorInput,
        evidence_kind: payEvKindInput,
        received_at: payReceivedAtInput,
        idempotency_key: nextSequentialKey('p13-sub'),
      })
    );
    if (res.ok && res.data) {
      playScribblenauts(soundEnabled);
      setSelectedSubId(res.data.submission_id);
      setPayExtRefInput('');
      setPayAmountInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleVerifyOr() {
    playClickPen(soundEnabled);
    if (!activeSubmission) return;
    const res = refreshSnapshot(
      engine.verifyPaymentAndIssueOr({
        submission_id: activeSubmission.submission_id,
        verifier_user_id: verVerifierInput,
        account_credit_confirmed: verConfirmedInput,
        verified_at: verAtInput,
        idempotency_key: nextSequentialKey('p13-or'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handlePlaceHold() {
    playClickPen(soundEnabled);
    if (!activeSubmission) return;
    const res = refreshSnapshot(
      engine.placePaymentOnHold({
        submission_id: activeSubmission.submission_id,
        actor_user_id: verVerifierInput.trim() || '202',
        hold_reason: holdReasonInput,
        flagged_at: verAtInput.trim() || '2026-11-02T08:15:00Z',
        idempotency_key: nextSequentialKey('p13-hold'),
      })
    );
    if (res.ok) setHoldReasonInput('');
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordHoldContact(taskId: string) {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordPaymentHoldContact({
        task_id: taskId,
        actor_user_id: payCollectorInput.trim() || '101',
        contact_channel: contactChannelInput,
        contact_outcome: contactOutcomeInput,
        contacted_at: verAtInput.trim() || '2026-11-02T08:20:00Z',
        idempotency_key: nextSequentialKey('p13-contact'),
      })
    );
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setContactOutcomeInput('');
    }
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAllocateCredit() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.allocateVerifiedCredit({
        bill_so_id: activeOrder.bill_so_id,
        finance_user_id: allocFinanceInput,
        release_coverage_amount: allocCoverageInput,
        procurement_funding_amount: allocFundingInput,
        allocated_at: allocAtInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p13-alloc'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleReconcileOrder() {
    playClickPen(soundEnabled);
    if (!activeOrder) return;
    const res = refreshSnapshot(
      engine.confirmFinanceReconciliation({
        bill_so_id: activeOrder.bill_so_id,
        reconciler_user_id: recActorInput,
        reconciled_at: recAtInput,
        expected_version: activeOrder.version,
        idempotency_key: nextSequentialKey('p13-rec'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupPaymentOperation({
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
      engine.lookupPaymentOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleReceipts = snapshot.official_receipts.filter(
    (r) =>
      !normalizedSearch ||
      r.or_reference.toLowerCase().includes(normalizedSearch) ||
      r.so_reference.toLowerCase().includes(normalizedSearch) ||
      r.external_reference.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p13-workspace">
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
                id="p13-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search OR references, orders, or transaction IDs"
                aria-label="Search payment and receipt records"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Payment Verification, Official Receipts &amp; Line Credit</h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Payment verification workflow tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p13-tab-accounts"
                  aria-selected={activeTab === 'accounts'}
                  className={`p03-filter-pill ${activeTab === 'accounts' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('accounts');
                  }}
                >
                  Official Channels &amp; Orders
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p13-tab-verify"
                  aria-selected={activeTab === 'verify'}
                  className={`p03-filter-pill ${activeTab === 'verify' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('verify');
                  }}
                >
                  Verify Payment &amp; Issue OR
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p13-tab-allocate"
                  aria-selected={activeTab === 'allocate'}
                  className={`p03-filter-pill ${activeTab === 'allocate' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('allocate');
                  }}
                >
                  Credit Allocation &amp; Reconciliation
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p13-tab-history"
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
                id="p13-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p13-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p13-overview-heading" className="p03-section-title">
              Finance Verification &amp; Line Credit Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Official Receipts: <strong>{snapshot.official_receipts.length}</strong>
              </span>
              <span className="p03-version-pill">
                Pending / Held: <strong>{snapshot.summary.pending_holds_count}</strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Total Billed Due</span>
              <span className="p03-axis-val" data-testid="p13-billed-due-val">
                {snapshot.summary.total_billed_due}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Verified Credit</span>
              <span className="p03-axis-val" data-testid="p13-verified-credit-val">
                {snapshot.summary.verified_credit_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Release Coverage</span>
              <span className="p03-axis-val" data-testid="p13-release-coverage-val">
                {snapshot.summary.release_coverage_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Procurement Funding</span>
              <span className="p03-axis-val" data-testid="p13-procurement-funding-val">
                {snapshot.summary.procurement_funding_total}
              </span>
            </div>
          </div>

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p13-feedback-banner"
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

        {/* TAB 1: Official Channels & Billable Orders */}
        {activeTab === 'accounts' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p13-reg-acc-heading">
                <h2 id="p13-reg-acc-heading" className="p03-section-title">
                  Register Finance-Approved Payment Account
                </h2>
                <p className="p03-muted-copy">
                  Only chapter-approved cash desks and official chapter GCash accounts qualify for
                  Official Receipt issuance.
                </p>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p13-acc-channel" className="form-label">
                      Payment Channel
                    </label>
                    <select
                      id="p13-acc-channel"
                      className="form-control"
                      value={accChannelInput}
                      onChange={(e) => setAccChannelInput(e.target.value as OfficialChannelKind)}
                    >
                      <option value="official_gcash">Official Chapter GCash</option>
                      <option value="cash">Chapter Cash Counter</option>
                      <option value="personal_unapproved">Personal Wallet (Forbidden Test)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="p13-acc-code" className="form-label">
                      Account Code
                    </label>
                    <input
                      id="p13-acc-code"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={accCodeInput}
                      placeholder="e.g. GCASH-CEBU-01"
                      onChange={(e) => setAccCodeInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p13-acc-label" className="form-label">
                      Account Label
                    </label>
                    <input
                      id="p13-acc-label"
                      type="text"
                      className="form-control"
                      value={accLabelInput}
                      placeholder="e.g. Official GCash QR"
                      onChange={(e) => setAccLabelInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p13-acc-finance-id" className="form-label">
                      Approving Finance Officer ID
                    </label>
                    <input
                      id="p13-acc-finance-id"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={accFinanceIdInput}
                      placeholder="e.g. 201"
                      onChange={(e) => setAccFinanceIdInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p13-register-account-btn"
                    className="btn-batcave-secondary"
                    onClick={handleRegisterAccount}
                  >
                    Register Payment Account
                  </button>
                </div>
              </section>

              <section className="p03-card surface-card" aria-labelledby="p13-reg-bill-heading">
                <h2 id="p13-reg-bill-heading" className="p03-section-title">
                  Register Billed Sales Order for Payment Collection
                </h2>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p13-bill-so-ref" className="form-label">
                      Sales Order Reference
                    </label>
                    <input
                      id="p13-bill-so-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={billSoRefInput}
                      placeholder="e.g. CEBU-SO-2026-000001"
                      onChange={(e) => setBillSoRefInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p13-bill-si-ref" className="form-label">
                      Sales Invoice Reference
                    </label>
                    <input
                      id="p13-bill-si-ref"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={billSiRefInput}
                      placeholder="e.g. CEBU-SI-2026-000001"
                      onChange={(e) => setBillSiRefInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p13-bill-buyer" className="form-label">
                      Buyer Name
                    </label>
                    <input
                      id="p13-bill-buyer"
                      type="text"
                      className="form-control"
                      value={billBuyerInput}
                      placeholder="e.g. Maria Santos"
                      onChange={(e) => setBillBuyerInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p13-bill-total" className="form-label">
                      Total Amount Due (PHP)
                    </label>
                    <input
                      id="p13-bill-total"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={billTotalDueInput}
                      placeholder="e.g. 1000.00"
                      onChange={(e) => setBillTotalDueInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label htmlFor="p13-bill-avail-val" className="form-label">
                      Available Stock Value (PHP)
                    </label>
                    <input
                      id="p13-bill-avail-val"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={billAvailValInput}
                      placeholder="e.g. 600.00"
                      onChange={(e) => setBillAvailValInput(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="p13-bill-backorder-cost" className="form-label">
                      Backorder Procurement Cost (PHP)
                    </label>
                    <input
                      id="p13-bill-backorder-cost"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={billBackorderCostInput}
                      placeholder="e.g. 400.00"
                      onChange={(e) => setBillBackorderCostInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    type="button"
                    id="p13-register-bill-btn"
                    className="btn-batcave-primary"
                    onClick={handleRegisterBillableOrder}
                  >
                    Register Billable Order
                  </button>
                </div>
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card" aria-labelledby="p13-acc-list-heading">
                <h2 id="p13-acc-list-heading" className="p03-section-title">
                  Approved Collection Accounts ({snapshot.official_accounts.length})
                </h2>
                {snapshot.official_accounts.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p13-empty-accounts-notice">
                    No approved collection accounts registered yet.
                  </p>
                ) : (
                  <div className="p03-queue-list">
                    {snapshot.official_accounts.map((acc) => (
                      <div key={acc.account_id} className="p03-queue-item">
                        <div className="p03-queue-meta">
                          <strong className="p03-mono-inline">{acc.account_code}</strong>
                          <span>
                            {acc.account_label} ({acc.channel})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p03-card surface-card" aria-labelledby="p13-orders-list-heading">
                <h2 id="p13-orders-list-heading" className="p03-section-title">
                  Billable Sales Orders ({snapshot.billable_orders.length})
                </h2>
                {snapshot.billable_orders.length === 0 ? (
                  <p className="p03-muted-copy" data-testid="p13-empty-orders-notice">
                    No billable sales orders registered yet.
                  </p>
                ) : (
                  <div className="p03-queue-list" data-testid="p13-orders-list">
                    {snapshot.billable_orders.map((ord) => (
                      <div key={ord.bill_so_id} className="p03-queue-item">
                        <div className="p03-queue-meta">
                          <strong>{ord.so_reference}</strong>
                          <span>
                            {ord.buyer_name} — Paid PHP {ord.verified_credit_total} / PHP{' '}
                            {ord.total_amount_due} (Balance: PHP {ord.remaining_balance_due})
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          onClick={() => {
                            setSelectedOrderId(ord.bill_so_id);
                            setActiveTab('verify');
                          }}
                        >
                          Collect Payment
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Verify Payment & Issue OR */}
        {activeTab === 'verify' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p13-submit-pay-heading">
              <h2 id="p13-submit-pay-heading" className="p03-section-title">
                Submit Payment Evidence
              </h2>
              <p className="p03-muted-copy">
                Duplicate external transaction references are rejected automatically. Screenshots
                remain unverified pending actual account credit confirmation.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-pay-payer" className="form-label">
                    Payer Name
                  </label>
                  <input
                    id="p13-pay-payer"
                    type="text"
                    className="form-control"
                    value={payPayerInput}
                    placeholder="e.g. Maria Santos"
                    onChange={(e) => setPayPayerInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-pay-collector" className="form-label">
                    Collector Officer ID
                  </label>
                  <input
                    id="p13-pay-collector"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={payCollectorInput}
                    placeholder="e.g. 101"
                    onChange={(e) => setPayCollectorInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-pay-channel" className="form-label">
                    Channel
                  </label>
                  <select
                    id="p13-pay-channel"
                    className="form-control"
                    value={payChannelInput}
                    onChange={(e) => setPayChannelInput(e.target.value as OfficialChannelKind)}
                  >
                    <option value="official_gcash">Official GCash</option>
                    <option value="cash">Chapter Cash Counter</option>
                    <option value="personal_unapproved">Personal Wallet</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p13-pay-account" className="form-label">
                    Account Code
                  </label>
                  <input
                    id="p13-pay-account"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={payAccountInput}
                    placeholder="e.g. GCASH-CEBU-01"
                    onChange={(e) => setPayAccountInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-pay-ext-ref" className="form-label">
                    External Transaction Reference
                  </label>
                  <input
                    id="p13-pay-ext-ref"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={payExtRefInput}
                    placeholder="e.g. GC-771201"
                    onChange={(e) => setPayExtRefInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-pay-amount" className="form-label">
                    Amount (PHP)
                  </label>
                  <input
                    id="p13-pay-amount"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={payAmountInput}
                    placeholder="e.g. 400.00"
                    onChange={(e) => setPayAmountInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-pay-ev-kind" className="form-label">
                    Evidence Basis
                  </label>
                  <select
                    id="p13-pay-ev-kind"
                    className="form-control"
                    value={payEvKindInput}
                    onChange={(e) => setPayEvKindInput(e.target.value as PaymentEvidenceKind)}
                  >
                    <option value="actual_account_credit">Actual Official Account Credit</option>
                    <option value="physical_cash_counted">Counted Cash Receipt</option>
                    <option value="screenshot_only">Buyer Screenshot Only</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="p13-pay-received-at" className="form-label">
                    Actual Receipt Time (UTC)
                  </label>
                  <input
                    id="p13-pay-received-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={payReceivedAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setPayReceivedAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p13-submit-payment-btn"
                  className="btn-batcave-primary"
                  onClick={handleSubmitPayment}
                >
                  Submit Payment Evidence
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p13-verify-or-heading">
              <h2 id="p13-verify-or-heading" className="p03-section-title">
                Verify Funds &amp; Issue Official Receipt
              </h2>

              {!activeSubmission ? (
                <p className="p03-muted-copy">Submit a payment evidence entry first to verify.</p>
              ) : (
                <>
                  <div className="session-ledger">
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Submission Ref</span>
                      <span className="session-ledger-val p03-mono-inline">
                        {activeSubmission.external_reference} — PHP {activeSubmission.amount}
                      </span>
                    </div>
                    <div className="session-ledger-row">
                      <span className="session-ledger-key">Evidence Status</span>
                      <span className="session-ledger-val">
                        {activeSubmission.status} ({activeSubmission.evidence_kind})
                      </span>
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p13-ver-verifier-id" className="form-label">
                        Independent Verifier ID
                      </label>
                      <input
                        id="p13-ver-verifier-id"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={verVerifierInput}
                        placeholder="Approver ID (e.g. 202)"
                        onChange={(e) => setVerVerifierInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p13-ver-at" className="form-label">
                        Verification Time (UTC)
                      </label>
                      <input
                        id="p13-ver-at"
                        type="text"
                        className="form-control p03-mono-inline"
                        value={verAtInput}
                        placeholder="YYYY-MM-DDTHH:MM:SSZ"
                        onChange={(e) => setVerAtInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="p03-checkbox-row">
                    <input
                      id="p13-ver-confirmed-checkbox"
                      type="checkbox"
                      checked={verConfirmedInput}
                      onChange={(e) => setVerConfirmedInput(e.target.checked)}
                    />
                    <label htmlFor="p13-ver-confirmed-checkbox">
                      Confirmed actual cash count or official chapter GCash ledger credit
                    </label>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p13-hold-reason" className="form-label">
                      Payment Hold Reason (If Unresolved)
                    </label>
                    <input
                      id="p13-hold-reason"
                      type="text"
                      className="form-control"
                      value={holdReasonInput}
                      placeholder="e.g. Awaiting bank clearing"
                      onChange={(e) => setHoldReasonInput(e.target.value)}
                    />
                  </div>

                  <div className="p03-guard-buttons">
                    <button
                      type="button"
                      id="p13-verify-or-btn"
                      className="btn-batcave-primary"
                      onClick={handleVerifyOr}
                    >
                      Verify &amp; Issue OR
                    </button>
                    <button
                      type="button"
                      id="p13-place-hold-btn"
                      className="btn-batcave-secondary"
                      onClick={handlePlaceHold}
                    >
                      Place on Payment Hold
                    </button>
                  </div>
                </>
              )}

              {snapshot.contact_tasks.length > 0 ? (
                <>
                  <hr />
                  <h3 className="p03-section-title">Payment-Hold Buyer Contact Tasks</h3>
                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p13-contact-channel" className="form-label">
                        Contact Channel
                      </label>
                      <input
                        id="p13-contact-channel"
                        type="text"
                        className="form-control"
                        value={contactChannelInput}
                        placeholder="e.g. SMS"
                        onChange={(e) => setContactChannelInput(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p13-contact-outcome" className="form-label">
                        Contact Outcome
                      </label>
                      <input
                        id="p13-contact-outcome"
                        type="text"
                        className="form-control"
                        value={contactOutcomeInput}
                        placeholder="Notified buyer of hold"
                        onChange={(e) => setContactOutcomeInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p03-queue-list">
                    {snapshot.contact_tasks.map((task) => (
                      <div key={task.task_id} className="p03-queue-item">
                        <div className="p03-queue-meta">
                          <strong>
                            {task.so_reference} — {task.status === 'open' ? 'Open Task' : 'Contacted'}
                          </strong>
                          <span>{task.hold_reason}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-batcave-secondary p03-shrink-btn"
                          data-testid={`p13-contact-task-${task.task_id}`}
                          onClick={() => handleRecordHoldContact(task.task_id)}
                        >
                          Log Buyer Contact
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 3: Credit Allocation & Finance Reconciliation */}
        {activeTab === 'allocate' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p13-alloc-heading">
              <h2 id="p13-alloc-heading" className="p03-section-title">
                Allocate Verified Customer Credit
              </h2>
              <p className="p03-muted-copy">
                Distinguish release coverage (for available merchandise handover) from procurement
                funding designation (for backorder restock) without double-counting verified funds.
              </p>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-alloc-finance-id" className="form-label">
                    Finance Officer ID
                  </label>
                  <input
                    id="p13-alloc-finance-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={allocFinanceInput}
                    placeholder="e.g. 201"
                    onChange={(e) => setAllocFinanceInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-alloc-at" className="form-label">
                    Allocation Timestamp (UTC)
                  </label>
                  <input
                    id="p13-alloc-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={allocAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setAllocAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-alloc-coverage" className="form-label">
                    Release Coverage Amount (PHP)
                  </label>
                  <input
                    id="p13-alloc-coverage"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={allocCoverageInput}
                    placeholder="e.g. 600.00"
                    onChange={(e) => setAllocCoverageInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-alloc-funding" className="form-label">
                    Procurement Funding Designation (PHP)
                  </label>
                  <input
                    id="p13-alloc-funding"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={allocFundingInput}
                    placeholder="e.g. 400.00"
                    onChange={(e) => setAllocFundingInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p13-allocate-credit-btn"
                  className="btn-batcave-primary"
                  onClick={handleAllocateCredit}
                >
                  Confirm Credit Allocation
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p13-rec-heading">
              <h2 id="p13-rec-heading" className="p03-section-title">
                Independent Finance Reconciliation &amp; Receipts
              </h2>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-rec-actor-id" className="form-label">
                    Independent Reconciler ID
                  </label>
                  <input
                    id="p13-rec-actor-id"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={recActorInput}
                    placeholder="Approver ID (e.g. 203)"
                    onChange={(e) => setRecActorInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-rec-at" className="form-label">
                    Reconciliation Timestamp (UTC)
                  </label>
                  <input
                    id="p13-rec-at"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={recAtInput}
                    placeholder="YYYY-MM-DDTHH:MM:SSZ"
                    onChange={(e) => setRecAtInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p13-reconcile-btn"
                  className="btn-batcave-secondary"
                  onClick={handleReconcileOrder}
                >
                  Confirm Independent Reconciliation
                </button>
              </div>

              {visibleReceipts.length > 0 ? (
                <div className="p03-table-wrap" data-testid="p13-or-table">
                  <table className="p03-table">
                    <thead>
                      <tr>
                        <th>OR Ref</th>
                        <th>Kind</th>
                        <th>Amount (PHP)</th>
                        <th>Verifier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleReceipts.map((orRec) => (
                        <tr key={orRec.or_id}>
                          <td className="p03-mono-inline">{orRec.or_reference}</td>
                          <td>
                            {orRec.receipt_kind === 'full_settlement'
                              ? 'Full Settlement'
                              : 'Downpayment'}
                          </td>
                          <td className="p03-mono-inline">{orRec.verified_amount}</td>
                          <td className="p03-mono-inline">{orRec.verifier_user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p13-history-heading">
              <h2 id="p13-history-heading" className="p03-section-title">
                Payment &amp; Receipt Audit Log ({snapshot.history.length})
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No audit entries recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p13-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p13-lookup-heading">
              <h2 id="p13-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p13-lookup-key-input" className="form-label">
                    Idempotency Key
                  </label>
                  <input
                    id="p13-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    placeholder="Operation key"
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="p13-lookup-ulid-input" className="form-label">
                    Operation ID
                  </label>
                  <input
                    id="p13-lookup-ulid-input"
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
                  id="p13-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p13-lookup-by-ulid-btn"
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
                        data-testid={`p13-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p13-lookup-result" aria-live="polite">
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
