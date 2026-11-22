import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP26CutoverSubscriptionEngine } from './p26CutoverSubscriptionSlice';
import type {
  CarriedObligationKind,
  EntitlementActionKind,
  P26ActionResult,
  P26EngineSnapshot,
  P26LookupResult,
  RolloutStageGateId,
} from './p26CutoverSubscriptionSlice';

type P26TabId = 'carryover' | 'activation' | 'entitlement' | 'history';

interface P26CutoverSubscriptionWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P26CutoverSubscriptionWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P26CutoverSubscriptionWorkspaceProps) {
  const engine = useMemo(() => createP26CutoverSubscriptionEngine(), []);
  const [snapshot, setSnapshot] = useState<P26EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P26TabId>('carryover');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P26ActionResult | null>(snapshot.last_action);

  // Tab 1: Opening IPC Fence & Carried Obligations
  const [ipcRefInput, setIpcRefInput] = useState('');
  const [ipcSkuInput, setIpcSkuInput] = useState('');
  const [ipcQtyInput, setIpcQtyInput] = useState('');
  const [ipcOldDrsInput, setIpcOldDrsInput] = useState('');
  const [ipcActorInput, setIpcActorInput] = useState('');
  const [ipcAtInput, setIpcAtInput] = useState('');

  const [carryKindInput, setCarryKindInput] = useState<CarriedObligationKind>('inbound_po');
  const [carrySourceRefInput, setCarrySourceRefInput] = useState('');
  const [carryLinkedRefInput, setCarryLinkedRefInput] = useState('');
  const [carryQtyInput, setCarryQtyInput] = useState('');
  const [carryAmountInput, setCarryAmountInput] = useState('');
  const [carryAlreadyIpcInput, setCarryAlreadyIpcInput] = useState(false);
  const [carryActorInput, setCarryActorInput] = useState('');
  const [carryAtInput, setCarryAtInput] = useState('');

  // Tab 2: Rollout Gates, Trial Activation & Rename Check
  const [gateIdInput, setGateIdInput] = useState<RolloutStageGateId>('MIG_04_GATE_1');
  const [gateActorInput, setGateActorInput] = useState('');
  const [gateDutyInput, setGateDutyInput] = useState('');
  const [gateRecoveryOkInput, setGateRecoveryOkInput] = useState(true);
  const [gateAtInput, setGateAtInput] = useState('');

  const [actActorInput, setActActorInput] = useState('');
  const [actDutyInput, setActDutyInput] = useState('CHAPTER_HEAD');
  const [actStageInput, setActStageInput] = useState<RolloutStageGateId>('MIG_04_GATE_1');
  const [actSetupInput, setActSetupInput] = useState(true);
  const [actIpcLockedInput, setActIpcLockedInput] = useState(true);
  const [actRecoveryInput, setActRecoveryInput] = useState(true);
  const [actTermsInput, setActTermsInput] = useState(true);
  const [actAtInput, setActAtInput] = useState('');

  const [renameNameInput, setRenameNameInput] = useState('');
  const [renameStageInput, setRenameStageInput] = useState<RolloutStageGateId>('MIG_05_GATE_2');
  const [renameActorInput, setRenameActorInput] = useState('');
  const [renameAtInput, setRenameAtInput] = useState('');

  // Tab 3: Entitlement Grace, Provider Billing & Preservation
  const [entActorInput, setEntActorInput] = useState('');
  const [entChapterInput, setEntChapterInput] = useState('');
  const [entMemberInput, setEntMemberInput] = useState(true);
  const [entDisabledInput, setEntDisabledInput] = useState(false);
  const [entProviderOnlyInput, setEntProviderOnlyInput] = useState(false);
  const [entActionInput, setEntActionInput] = useState<EntitlementActionKind>('new_officer_posting');
  const [entAtInput, setEntAtInput] = useState('');

  const [subVerifierInput, setSubVerifierInput] = useState('');
  const [subRoleInput, setSubRoleInput] = useState('provider_billing');
  const [subRefInput, setSubRefInput] = useState('');
  const [subAmountInput, setSubAmountInput] = useState('');
  const [subPaidThroughInput, setSubPaidThroughInput] = useState('');
  const [subVerifiedAtInput, setSubVerifiedAtInput] = useState('');

  const [delReasonInput, setDelReasonInput] = useState('');

  // Tab 4: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P26ActionResult<P26LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P26ActionResult<T>): P26ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  function handleLockIpcGuard() {
    playClickPen(soundEnabled);
    const oldDrs = ipcOldDrsInput
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const res = refreshSnapshot(
      engine.registerOpeningBaselineGuard({
        ipc_reference: ipcRefInput,
        item_sku: ipcSkuInput,
        opening_qty: ipcQtyInput,
        included_old_dr_refs: oldDrs,
        approved_by_user_id: ipcActorInput,
        approved_at: ipcAtInput,
        idempotency_key: nextSequentialKey('p26-ipc'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleCarryObligation() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.carryOpenObligation({
        kind: carryKindInput,
        original_source_ref: carrySourceRefInput,
        linked_dr_or_receipt_ref: carryLinkedRefInput,
        outstanding_qty: carryQtyInput || '0',
        outstanding_amount_php: carryAmountInput || '0.00',
        already_counted_in_ipc: carryAlreadyIpcInput,
        actor_user_id: carryActorInput,
        created_at: carryAtInput,
        idempotency_key: nextSequentialKey('p26-carry'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAuthorizeGate() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.authorizeRolloutGate({
        gate_id: gateIdInput,
        approver_user_id: gateActorInput,
        approver_duty: gateDutyInput,
        recovery_readiness_verified: gateRecoveryOkInput,
        approved_at: gateAtInput,
        idempotency_key: nextSequentialKey('p26-gate'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleActivateTrial() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.activateLiveTrialOnce({
        actor_user_id: actActorInput,
        actor_duty: actDutyInput,
        enabled_rollout_stage: actStageInput,
        setup_approved: actSetupInput,
        opening_ipc_locked: actIpcLockedInput,
        recovery_ready: actRecoveryInput,
        commercial_terms_approved: actTermsInput,
        activated_at: actAtInput,
        idempotency_key: nextSequentialKey('p26-act'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRenameOrStage() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.renameChapterOrAdvanceStage({
        new_chapter_name: renameNameInput,
        next_stage: renameStageInput,
        actor_user_id: renameActorInput,
        updated_at: renameAtInput,
        idempotency_key: nextSequentialKey('p26-rename'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleEvaluateEntitlement() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.evaluateEntitlementAndExecuteAction({
        actor_user_id: entActorInput,
        actor_chapter_id: entChapterInput.trim() || snapshot.chapter_id,
        actor_has_chapter_membership: entMemberInput,
        actor_disabled: entDisabledInput,
        is_provider_billing_only: entProviderOnlyInput,
        action_kind: entActionInput,
        evaluated_at: entAtInput,
        idempotency_key: nextSequentialKey('p26-ent'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleExtendSubscription() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordProviderSubscriptionExtension({
        provider_verifier_id: subVerifierInput,
        provider_role: subRoleInput,
        payment_reference: subRefInput,
        amount_php: subAmountInput,
        paid_through_at: subPaidThroughInput,
        verified_at: subVerifiedAtInput,
        idempotency_key: nextSequentialKey('p26-sub'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleAttemptDelete() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.attemptAutoDeleteOnLapseOrBudget({
        actor_user_id: subVerifierInput || 'system',
        reason: delReasonInput,
        attempted_at: entAtInput || '2026-12-20T00:00:00Z',
      })
    );
    onNotify('error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupCutoverOperation({
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
      engine.lookupCutoverOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleCarried = snapshot.carried_obligations.filter(
    (o) =>
      !normalizedSearch ||
      o.original_source_ref.toLowerCase().includes(normalizedSearch) ||
      o.linked_dr_or_receipt_ref.toLowerCase().includes(normalizedSearch) ||
      o.kind.toLowerCase().includes(normalizedSearch)
  );

  return (
    <main className="p03-workspace-shell" data-testid="p26-workspace">
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
                id="p26-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search carried obligations or source references"
                aria-label="Search carried cutover obligations"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Cutover Obligations, Staged Activation &amp; Chapter Subscription Controls
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Cutover and subscription control tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p26-tab-carryover"
                  aria-selected={activeTab === 'carryover'}
                  className={`p03-filter-pill ${activeTab === 'carryover' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('carryover');
                  }}
                >
                  Opening Fence &amp; Carryover
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p26-tab-activation"
                  aria-selected={activeTab === 'activation'}
                  className={`p03-filter-pill ${activeTab === 'activation' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('activation');
                  }}
                >
                  Rollout Gates &amp; Trial Activation
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p26-tab-entitlement"
                  aria-selected={activeTab === 'entitlement'}
                  className={`p03-filter-pill ${activeTab === 'entitlement' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('entitlement');
                  }}
                >
                  Entitlement Grace &amp; Provider Billing
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p26-tab-history"
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
                id="p26-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p26-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p26-overview-heading" className="p03-section-title">
              Cutover &amp; Commercial Status — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Trial Ends:{' '}
                <strong data-testid="p26-trial-ends-val">
                  {snapshot.trial_state.trial_ends_at ?? 'not started'}
                </strong>
              </span>
              <span className="p03-version-pill">
                Grace Ends:{' '}
                <strong data-testid="p26-grace-ends-val">
                  {snapshot.trial_state.grace_ends_at ?? 'not started'}
                </strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Entitlement Status</span>
              <span className="p03-axis-val" data-testid="p26-trial-status-val">
                {snapshot.summary.trial_status}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Carried Obligations</span>
              <span className="p03-axis-val" data-testid="p26-carried-count-val">
                {snapshot.summary.carried_obligations_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Chapter Buyer Revenue</span>
              <span className="p03-axis-val" data-testid="p26-buyer-revenue-val">
                PHP {snapshot.summary.chapter_buyer_revenue_total}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Provider Subscription Total</span>
              <span className="p03-axis-val" data-testid="p26-provider-billing-val">
                PHP {snapshot.summary.provider_billing_total}
              </span>
            </div>
          </div>

          {snapshot.carried_obligations.length === 0 ? (
            <p className="p03-muted-copy" data-testid="p26-empty-carried-notice">
              No pre-cutover obligations carried into this chapter yet. Register locked opening
              count guards before recording genuine carried commitments.
            </p>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p26-feedback-banner"
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

        {/* TAB 1: Opening Count Fence & Carried Obligations */}
        {activeTab === 'carryover' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p26-ipc-heading">
              <h2 id="p26-ipc-heading" className="p03-section-title">
                Lock Opening Count Baseline Fence
              </h2>
              <p className="p03-muted-copy">
                Goods physically counted in the locked opening baseline cannot be received a second
                time from pre-cutover supplier delivery notes.
              </p>
              <div className="form-group">
                <label htmlFor="p26-ipc-ref" className="form-label">
                  Opening Count Sheet Reference
                </label>
                <input
                  id="p26-ipc-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcRefInput}
                  placeholder="IPC-2026-0001"
                  onChange={(e) => setIpcRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ipc-sku" className="form-label">
                  Item SKU
                </label>
                <input
                  id="p26-ipc-sku"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcSkuInput}
                  placeholder="YSP-SHIRT-BLK"
                  onChange={(e) => setIpcSkuInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ipc-qty" className="form-label">
                  Opening Counted Quantity
                </label>
                <input
                  id="p26-ipc-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcQtyInput}
                  placeholder="120"
                  onChange={(e) => setIpcQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ipc-old-drs" className="form-label">
                  Pre-Cutover Delivery References Covered (comma-separated)
                </label>
                <input
                  id="p26-ipc-old-drs"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcOldDrsInput}
                  placeholder="OLD-SUP-DR-88, OLD-SUP-DR-89"
                  onChange={(e) => setIpcOldDrsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ipc-actor" className="form-label">
                  Approving Officer ID
                </label>
                <input
                  id="p26-ipc-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcActorInput}
                  placeholder="101"
                  onChange={(e) => setIpcActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ipc-at" className="form-label">
                  Approval Time (UTC)
                </label>
                <input
                  id="p26-ipc-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={ipcAtInput}
                  placeholder="2026-11-01T08:00:00Z"
                  onChange={(e) => setIpcAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-lock-ipc-btn"
                  className="btn-batcave-primary"
                  onClick={handleLockIpcGuard}
                >
                  Lock Opening Baseline Fence
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p26-carry-heading">
              <h2 id="p26-carry-heading" className="p03-section-title">
                Carry Genuine Open Obligation Once
              </h2>
              <div className="form-group">
                <label htmlFor="p26-carry-kind" className="form-label">
                  Obligation Category
                </label>
                <select
                  id="p26-carry-kind"
                  className="form-control"
                  value={carryKindInput}
                  onChange={(e) => setCarryKindInput(e.target.value as CarriedObligationKind)}
                >
                  <option value="inbound_po">Inbound Open Purchase Order</option>
                  <option value="carried_payment_or">Carried Buyer Official Receipt</option>
                  <option value="booth_custody">Separate Event Booth Custody</option>
                  <option value="active_rf">Open Requisition Commitment</option>
                  <option value="active_so">Open Sales Order Commitment</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-source-ref" className="form-label">
                  Original Source Reference
                </label>
                <input
                  id="p26-carry-source-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carrySourceRefInput}
                  placeholder="PO-2026-OPEN-09"
                  onChange={(e) => setCarrySourceRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-linked-ref" className="form-label">
                  Linked Delivery or Receipt Reference
                </label>
                <input
                  id="p26-carry-linked-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carryLinkedRefInput}
                  placeholder="OR-2026-CARRIED-401"
                  onChange={(e) => setCarryLinkedRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-qty" className="form-label">
                  Outstanding Quantity
                </label>
                <input
                  id="p26-carry-qty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carryQtyInput}
                  placeholder="40"
                  onChange={(e) => setCarryQtyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-amount" className="form-label">
                  Outstanding Amount (PHP)
                </label>
                <input
                  id="p26-carry-amount"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carryAmountInput}
                  placeholder="0.00"
                  onChange={(e) => setCarryAmountInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-carry-already-ipc"
                  type="checkbox"
                  checked={carryAlreadyIpcInput}
                  onChange={(e) => setCarryAlreadyIpcInput(e.target.checked)}
                />
                <label htmlFor="p26-carry-already-ipc">
                  Goods already physically counted in opening baseline
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-actor" className="form-label">
                  Recording Officer ID
                </label>
                <input
                  id="p26-carry-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carryActorInput}
                  placeholder="102"
                  onChange={(e) => setCarryActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-carry-at" className="form-label">
                  Entry Time (UTC)
                </label>
                <input
                  id="p26-carry-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={carryAtInput}
                  placeholder="2026-11-01T08:15:00Z"
                  onChange={(e) => setCarryAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-carry-btn"
                  className="btn-batcave-primary"
                  onClick={handleCarryObligation}
                >
                  Carry Open Obligation Once
                </button>
              </div>

              {visibleCarried.length > 0 ? (
                <div className="p03-queue-list" data-testid="p26-carried-list">
                  {visibleCarried.map((o) => (
                    <div key={o.obligation_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          {o.original_source_ref} ({o.kind})
                        </strong>
                        <span className="p03-muted-copy">
                          Ref: {o.linked_dr_or_receipt_ref} | Impact: {o.inventory_impact} |
                          Duplicate receipt created: {String(o.duplicate_cash_receipt_created)}
                        </span>
                      </div>
                      <span className="p03-mono-inline">
                        Qty {o.outstanding_qty} / PHP {o.outstanding_amount_php}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 2: Rollout Gates & Once-Only Trial Activation */}
        {activeTab === 'activation' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p26-gate-heading">
              <h2 id="p26-gate-heading" className="p03-section-title">
                Authorize Staged Rollout Gate
              </h2>
              <div className="form-group">
                <label htmlFor="p26-gate-select" className="form-label">
                  Rollout Stage Gate
                </label>
                <select
                  id="p26-gate-select"
                  className="form-control"
                  value={gateIdInput}
                  onChange={(e) => setGateIdInput(e.target.value as RolloutStageGateId)}
                >
                  <option value="MIG_04_GATE_1">Stage 1 Opening Baseline Gate</option>
                  <option value="MIG_05_GATE_2">Stage 2 Purchasing &amp; Internal Pilot Gate</option>
                  <option value="MIG_06_GATE_3">Stage 3 Customer Sales &amp; Adjustments Gate</option>
                  <option value="MIG_07_GATE_4">Stage 4 Event Booths &amp; Closure Gate</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p26-gate-actor" className="form-label">
                  Approving Account ID
                </label>
                <input
                  id="p26-gate-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={gateActorInput}
                  placeholder="101"
                  onChange={(e) => setGateActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-gate-duty" className="form-label">
                  Approving Role / Duty
                </label>
                <input
                  id="p26-gate-duty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={gateDutyInput}
                  placeholder="CHAPTER_HEAD"
                  onChange={(e) => setGateDutyInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-gate-recovery-ok"
                  type="checkbox"
                  checked={gateRecoveryOkInput}
                  onChange={(e) => setGateRecoveryOkInput(e.target.checked)}
                />
                <label htmlFor="p26-gate-recovery-ok">
                  Independent off-host recovery readiness verified
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p26-gate-at" className="form-label">
                  Authorization Time (UTC)
                </label>
                <input
                  id="p26-gate-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={gateAtInput}
                  placeholder="2026-11-01T09:10:00Z"
                  onChange={(e) => setGateAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-authorize-gate-btn"
                  className="btn-batcave-primary"
                  onClick={handleAuthorizeGate}
                >
                  Authorize Rollout Gate
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p26-act-heading">
              <h2 id="p26-act-heading" className="p03-section-title">
                Chapter Head Once-Only Live Trial Activation
              </h2>
              <div className="form-group">
                <label htmlFor="p26-act-actor" className="form-label">
                  Activating Officer ID
                </label>
                <input
                  id="p26-act-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={actActorInput}
                  placeholder="101"
                  onChange={(e) => setActActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-act-duty" className="form-label">
                  Activating Duty
                </label>
                <input
                  id="p26-act-duty"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={actDutyInput}
                  onChange={(e) => setActDutyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-act-stage" className="form-label">
                  Enabled Rollout Stage
                </label>
                <select
                  id="p26-act-stage"
                  className="form-control"
                  value={actStageInput}
                  onChange={(e) => setActStageInput(e.target.value as RolloutStageGateId)}
                >
                  <option value="MIG_04_GATE_1">Stage 1 Opening Baseline</option>
                  <option value="MIG_05_GATE_2">Stage 2 Purchasing Pilot</option>
                  <option value="MIG_06_GATE_3">Stage 3 Sales &amp; Adjustments</option>
                  <option value="MIG_07_GATE_4">Stage 4 Event Booths</option>
                </select>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-act-setup"
                  type="checkbox"
                  checked={actSetupInput}
                  onChange={(e) => setActSetupInput(e.target.checked)}
                />
                <label htmlFor="p26-act-setup">Chapter roles and policies approved</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-act-ipc"
                  type="checkbox"
                  checked={actIpcLockedInput}
                  onChange={(e) => setActIpcLockedInput(e.target.checked)}
                />
                <label htmlFor="p26-act-ipc">Opening count baseline signed and locked</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-act-recovery"
                  type="checkbox"
                  checked={actRecoveryInput}
                  onChange={(e) => setActRecoveryInput(e.target.checked)}
                />
                <label htmlFor="p26-act-recovery">Independent recovery drill verified</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-act-terms"
                  type="checkbox"
                  checked={actTermsInput}
                  onChange={(e) => setActTermsInput(e.target.checked)}
                />
                <label htmlFor="p26-act-terms">Subscription and retention terms approved</label>
              </div>
              <div className="form-group">
                <label htmlFor="p26-act-at" className="form-label">
                  Activation Time (UTC)
                </label>
                <input
                  id="p26-act-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={actAtInput}
                  placeholder="2026-11-01T10:00:00Z"
                  onChange={(e) => setActAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-activate-trial-btn"
                  className="btn-batcave-primary"
                  onClick={handleActivateTrial}
                >
                  Activate Live Operations (Start 30-Day Trial)
                </button>
              </div>

              <hr className="p03-divider" />
              <h3 className="p03-section-title">Rename Chapter or Advance Rollout Stage</h3>
              <div className="form-group">
                <label htmlFor="p26-rename-name" className="form-label">
                  Updated Chapter Display Name
                </label>
                <input
                  id="p26-rename-name"
                  type="text"
                  className="form-control"
                  value={renameNameInput}
                  placeholder="YSP Cebu Renamed"
                  onChange={(e) => setRenameNameInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-rename-stage" className="form-label">
                  Next Rollout Stage
                </label>
                <select
                  id="p26-rename-stage"
                  className="form-control"
                  value={renameStageInput}
                  onChange={(e) => setRenameStageInput(e.target.value as RolloutStageGateId)}
                >
                  <option value="MIG_04_GATE_1">Stage 1 Opening Baseline</option>
                  <option value="MIG_05_GATE_2">Stage 2 Purchasing Pilot</option>
                  <option value="MIG_06_GATE_3">Stage 3 Sales &amp; Adjustments</option>
                  <option value="MIG_07_GATE_4">Stage 4 Event Booths</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p26-rename-actor" className="form-label">
                  Updating Officer ID
                </label>
                <input
                  id="p26-rename-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={renameActorInput}
                  placeholder="101"
                  onChange={(e) => setRenameActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-rename-at" className="form-label">
                  Update Time (UTC)
                </label>
                <input
                  id="p26-rename-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={renameAtInput}
                  placeholder="2026-11-10T10:00:00Z"
                  onChange={(e) => setRenameAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-rename-btn"
                  className="btn-batcave-secondary"
                  onClick={handleRenameOrStage}
                >
                  Update Chapter (Preserve Trial Clock)
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Entitlement Grace, Provider Billing & Preservation */}
        {activeTab === 'entitlement' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p26-ent-heading">
              <h2 id="p26-ent-heading" className="p03-section-title">
                Evaluate Entitlement Window &amp; Access Policy
              </h2>
              <div className="form-group">
                <label htmlFor="p26-ent-actor" className="form-label">
                  Actor Account ID
                </label>
                <input
                  id="p26-ent-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={entActorInput}
                  placeholder="102"
                  onChange={(e) => setEntActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-ent-chapter" className="form-label">
                  Actor Chapter ID
                </label>
                <input
                  id="p26-ent-chapter"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={entChapterInput}
                  placeholder="1"
                  onChange={(e) => setEntChapterInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-ent-member"
                  type="checkbox"
                  checked={entMemberInput}
                  onChange={(e) => setEntMemberInput(e.target.checked)}
                />
                <label htmlFor="p26-ent-member">Holds approved chapter membership</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-ent-disabled"
                  type="checkbox"
                  checked={entDisabledInput}
                  onChange={(e) => setEntDisabledInput(e.target.checked)}
                />
                <label htmlFor="p26-ent-disabled">Account access disabled</label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p26-ent-provider-only"
                  type="checkbox"
                  checked={entProviderOnlyInput}
                  onChange={(e) => setEntProviderOnlyInput(e.target.checked)}
                />
                <label htmlFor="p26-ent-provider-only">
                  Provider billing administration account only
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p26-ent-action" className="form-label">
                  Operation Kind
                </label>
                <select
                  id="p26-ent-action"
                  className="form-control"
                  value={entActionInput}
                  onChange={(e) => setEntActionInput(e.target.value as EntitlementActionKind)}
                >
                  <option value="new_officer_posting">New Officer Business Posting</option>
                  <option value="queued_business_job">Queued Background Business Posting</option>
                  <option value="scoped_read_export">Scoped Read &amp; Export</option>
                  <option value="essential_control_reconciliation">
                    Essential Deadline, Security &amp; Reconciliation Control
                  </option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p26-ent-at" className="form-label">
                  Evaluation Time (UTC)
                </label>
                <input
                  id="p26-ent-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={entAtInput}
                  placeholder="2026-12-01T10:00:01Z"
                  onChange={(e) => setEntAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-evaluate-ent-btn"
                  className="btn-batcave-primary"
                  onClick={handleEvaluateEntitlement}
                >
                  Evaluate Entitlement Policy
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p26-sub-heading">
              <h2 id="p26-sub-heading" className="p03-section-title">
                Provider Subscription Payment Verification &amp; Preservation
              </h2>
              <p className="p03-muted-copy">
                Subscription fees are recorded separately under provider billing and never add to
                chapter merchandise sales or buyer receipts.
              </p>
              <div className="form-group">
                <label htmlFor="p26-sub-verifier" className="form-label">
                  Provider Verifier ID
                </label>
                <input
                  id="p26-sub-verifier"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subVerifierInput}
                  placeholder="900"
                  onChange={(e) => setSubVerifierInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-sub-role" className="form-label">
                  Provider Authority Role
                </label>
                <input
                  id="p26-sub-role"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subRoleInput}
                  onChange={(e) => setSubRoleInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-sub-ref" className="form-label">
                  Provider Payment Reference
                </label>
                <input
                  id="p26-sub-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subRefInput}
                  placeholder="PROV-SUB-2026-12"
                  onChange={(e) => setSubRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-sub-amount" className="form-label">
                  Subscription Amount (PHP)
                </label>
                <input
                  id="p26-sub-amount"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subAmountInput}
                  placeholder="1999.00"
                  onChange={(e) => setSubAmountInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-sub-paid-through" className="form-label">
                  Paid-Through Expiry (UTC)
                </label>
                <input
                  id="p26-sub-paid-through"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subPaidThroughInput}
                  placeholder="2027-01-15T10:00:00Z"
                  onChange={(e) => setSubPaidThroughInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-sub-verified-at" className="form-label">
                  Verification Time (UTC)
                </label>
                <input
                  id="p26-sub-verified-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={subVerifiedAtInput}
                  placeholder="2026-12-16T09:00:00Z"
                  onChange={(e) => setSubVerifiedAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-extend-sub-btn"
                  className="btn-batcave-primary"
                  onClick={handleExtendSubscription}
                >
                  Verify &amp; Extend Subscription
                </button>
              </div>

              <hr className="p03-divider" />
              <div className="form-group">
                <label htmlFor="p26-del-reason" className="form-label">
                  History Preservation Test Reason
                </label>
                <input
                  id="p26-del-reason"
                  type="text"
                  className="form-control"
                  value={delReasonInput}
                  placeholder="Unpaid expiry preservation test"
                  onChange={(e) => setDelReasonInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p26-attempt-delete-btn"
                  className="btn-batcave-secondary"
                  onClick={handleAttemptDelete}
                >
                  Test Auto-Delete Block
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 4: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p26-audit-heading">
              <h2 id="p26-audit-heading" className="p03-section-title">
                Cutover &amp; Entitlement Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No cutover or subscription events recorded yet.</p>
              ) : (
                <div className="p03-queue-list" data-testid="p26-history-list">
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

            <section className="p03-card surface-card" aria-labelledby="p26-lookup-heading">
              <h2 id="p26-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p26-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p26-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p26-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p26-lookup-ulid-input"
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
                  id="p26-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p26-lookup-by-ulid-btn"
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
                        data-testid={`p26-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p26-lookup-result" aria-live="polite">
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
