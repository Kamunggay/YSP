import { useMemo, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import { createP29AcceptanceDossierEngine } from './p29AcceptanceDossierSlice';
import type {
  DefectSeverity,
  DefectStatus,
  DemoEnvironmentLabel,
  P29ActionResult,
  P29EngineSnapshot,
  P29LookupResult,
  SignoffRole,
  SignoffScope,
  VerdictTargetMode,
} from './p29AcceptanceDossierSlice';

type P29TabId = 'walkthrough' | 'defects' | 'verdict' | 'history';

interface P29AcceptanceDossierWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function P29AcceptanceDossierWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P29AcceptanceDossierWorkspaceProps) {
  const engine = useMemo(() => createP29AcceptanceDossierEngine(), []);
  const [snapshot, setSnapshot] = useState<P29EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P29TabId>('walkthrough');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<P29ActionResult | null>(snapshot.last_action);

  // Tab 1: Connected Demo Step & Verification Matrix
  const [stepNumInput, setStepNumInput] = useState('1');
  const [stepTitleInput, setStepTitleInput] = useState('');
  const [stepRecordsInput, setStepRecordsInput] = useState('');
  const [stepMockInput, setStepMockInput] = useState(false);
  const [stepActorInput, setStepActorInput] = useState('');
  const [stepAtInput, setStepAtInput] = useState('');

  const [evRefInput, setEvRefInput] = useState('');
  const [evEnvInput, setEvEnvInput] = useState<DemoEnvironmentLabel>('labeled_test_environment');
  const [evNodesInput, setEvNodesInput] = useState('87');
  const [evBranchesInput, setEvBranchesInput] = useState('40');
  const [evConnectorsInput, setEvConnectorsInput] = useState('7');
  const [evLoopsInput, setEvLoopsInput] = useState('6');
  const [evNarrativeInput, setEvNarrativeInput] = useState('35');
  const [evAmbiguitiesInput, setEvAmbiguitiesInput] = useState('21');
  const [evReqInput, setEvReqInput] = useState('194');
  const [evAccInput, setEvAccInput] = useState('35');
  const [evClosureInput, setEvClosureInput] = useState('10');
  const [evGatesInput, setEvGatesInput] = useState('4');
  const [evSettingsInput, setEvSettingsInput] = useState('14');
  const [evUnitInput, setEvUnitInput] = useState('164');
  const [evE2eInput, setEvE2eInput] = useState('33');
  const [evAc22Input, setEvAc22Input] = useState(false);
  const [evP27Input, setEvP27Input] = useState(false);
  const [evActorInput, setEvActorInput] = useState('');
  const [evAtInput, setEvAtInput] = useState('');

  // Tab 2: Defects & Gate Sign-Offs
  const [defRefInput, setDefRefInput] = useState('');
  const [defSeverityInput, setDefSeverityInput] = useState<DefectSeverity>('critical');
  const [defStatusInput, setDefStatusInput] = useState<DefectStatus>('open');
  const [defPkgInput, setDefPkgInput] = useState('');
  const [defSummaryInput, setDefSummaryInput] = useState('');
  const [defActorInput, setDefActorInput] = useState('');
  const [defAtInput, setDefAtInput] = useState('');

  const [sigRoleInput, setSigRoleInput] = useState<SignoffRole>('CHAPTER_HEAD');
  const [sigScopeInput, setSigScopeInput] =
    useState<SignoffScope>('production_release_acceptance');
  const [sigActorInput, setSigActorInput] = useState('');
  const [sigNoteInput, setSigNoteInput] = useState('');
  const [sigAtInput, setSigAtInput] = useState('');

  // Tab 3: Acceptance Verdict
  const [verModeInput, setVerModeInput] = useState<VerdictTargetMode>('academic_functional_demo');
  const [verActorInput, setVerActorInput] = useState('');
  const [verAtInput, setVerAtInput] = useState('');

  // Tab 4: Lookup
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<P29ActionResult<P29LookupResult> | null>(null);

  function nextSequentialKey(prefix: string): string {
    return `${prefix}-seq-${snapshot.operation_ledger.length + 1}`;
  }

  function refreshSnapshot<T>(res: P29ActionResult<T>): P29ActionResult<T> {
    setSnapshot(engine.getSnapshot());
    setLastResult(res);
    return res;
  }

  function handleRecordStep() {
    playClickPen(soundEnabled);
    const records = stepRecordsInput
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    const res = refreshSnapshot(
      engine.recordConnectedDemoStep({
        step_number: Number(stepNumInput),
        step_title: stepTitleInput,
        connected_record_ids: records,
        uses_disconnected_mock_build: stepMockInput,
        demonstrated_by_user_id: stepActorInput,
        executed_at: stepAtInput,
        idempotency_key: nextSequentialKey('p29-step'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordEvidence() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordCoverageEvidenceBundle({
        bundle_ref: evRefInput,
        environment_label: evEnvInput,
        nodes_verified: evNodesInput,
        branches_verified: evBranchesInput,
        connectors_verified: evConnectorsInput,
        loops_verified: evLoopsInput,
        narrative_verified: evNarrativeInput,
        ambiguities_verified: evAmbiguitiesInput,
        requirements_verified: evReqInput,
        acceptance_verified: evAccInput,
        closure_verified: evClosureInput,
        activation_gates_passed: evGatesInput,
        settings_verified: evSettingsInput,
        unit_tests_passed: evUnitInput,
        e2e_tests_passed: evE2eInput,
        ac22_recovery_passed: evAc22Input,
        p27_host_readiness_passed: evP27Input,
        recorded_by_user_id: evActorInput,
        recorded_at: evAtInput,
        idempotency_key: nextSequentialKey('p29-ev'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleSubmitDefect() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.logOrResolveDefect({
        defect_ref: defRefInput,
        severity: defSeverityInput,
        status: defStatusInput,
        owning_package: defPkgInput,
        summary: defSummaryInput,
        actor_user_id: defActorInput,
        timestamp: defAtInput,
        idempotency_key: nextSequentialKey('p29-def'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleRecordSignoff() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.recordOperationalGateSignoff({
        signoff_role: sigRoleInput,
        signoff_scope: sigScopeInput,
        signer_user_id: sigActorInput,
        decision_note: sigNoteInput,
        signed_at: sigAtInput,
        idempotency_key: nextSequentialKey('p29-sig'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleEvaluateVerdict() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.evaluateFinalAcceptanceVerdict({
        target_mode: verModeInput,
        evaluator_user_id: verActorInput,
        evaluated_at: verAtInput,
        idempotency_key: nextSequentialKey('p29-ver'),
      })
    );
    if (res.ok) playScribblenauts(soundEnabled);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = refreshSnapshot(
      engine.lookupAcceptanceOperation({
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
      engine.lookupAcceptanceOperation({
        query_type: 'by_ulid',
        chapter_id: snapshot.chapter_id,
        operation_id: lookupUlidInput,
      })
    );
    setLookupResult(res);
    onNotify(res.ok ? 'success' : 'error', res.message);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleSteps = snapshot.demo_steps_recorded.filter(
    (s) =>
      !normalizedSearch ||
      s.step_title.toLowerCase().includes(normalizedSearch) ||
      s.connected_record_ids.some((id) => id.toLowerCase().includes(normalizedSearch))
  );

  return (
    <main className="p03-workspace-shell" data-testid="p29-workspace">
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
                id="p29-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search connected walkthrough steps or record references"
                aria-label="Search acceptance walkthrough records"
              />
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">
                Full Regression, Connected Walkthrough &amp; Acceptance Dossier
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Acceptance dossier tabs"
              >
                <button
                  type="button"
                  role="tab"
                  id="p29-tab-walkthrough"
                  aria-selected={activeTab === 'walkthrough'}
                  className={`p03-filter-pill ${activeTab === 'walkthrough' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('walkthrough');
                  }}
                >
                  Walkthrough &amp; Coverage Matrix
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p29-tab-defects"
                  aria-selected={activeTab === 'defects'}
                  className={`p03-filter-pill ${activeTab === 'defects' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('defects');
                  }}
                >
                  Defects &amp; Gate Sign-Offs
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p29-tab-verdict"
                  aria-selected={activeTab === 'verdict'}
                  className={`p03-filter-pill ${activeTab === 'verdict' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('verdict');
                  }}
                >
                  Final Release Verdict
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p29-tab-history"
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
                id="p29-back-dashboard-btn"
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

        <section className="p03-card surface-card" aria-labelledby="p29-overview-heading">
          <div className="p03-card-header-row">
            <h2 id="p29-overview-heading" className="p03-section-title">
              Acceptance Readiness Summary — {snapshot.chapter_name}
            </h2>
            <div className="p03-version-badges">
              <span className="p03-version-pill">
                Verdict:{' '}
                <strong data-testid="p29-verdict-label-val">
                  {snapshot.release_verdict.verdict_label}
                </strong>
              </span>
              <span className="p03-version-pill">
                Production Accepted:{' '}
                <strong data-testid="p29-prod-accepted-val">
                  {String(snapshot.release_verdict.production_release_accepted)}
                </strong>
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Connected Walkthrough Steps</span>
              <span className="p03-axis-val" data-testid="p29-steps-count-val">
                {snapshot.summary.demo_steps_count} / 9
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Evidence Bundles</span>
              <span className="p03-axis-val" data-testid="p29-bundles-count-val">
                {snapshot.summary.evidence_bundles_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Open Critical Defects</span>
              <span className="p03-axis-val" data-testid="p29-open-crit-val">
                {snapshot.summary.open_critical_defects_count}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">Academic Demo Ready</span>
              <span className="p03-axis-val" data-testid="p29-acad-ready-val">
                {String(snapshot.summary.academic_demo_ready)}
              </span>
            </div>
          </div>

          {snapshot.demo_steps_recorded.length === 0 ? (
            <p className="p03-muted-copy" data-testid="p29-empty-dossier-notice">
              No connected walkthrough runs or executed verification bundles recorded yet. Execute
              all 9 end-to-end demonstration scenarios with linked record IDs before evaluating final
              acceptance.
            </p>
          ) : null}

          {lastResult ? (
            <div
              className={`callout-banner ${lastResult.ok ? '' : 'is-error'}`}
              data-testid="p29-feedback-banner"
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

        {/* TAB 1: Connected Walkthrough & Coverage Matrix */}
        {activeTab === 'walkthrough' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p29-step-heading">
              <h2 id="p29-step-heading" className="p03-section-title">
                Record Connected Professor Walkthrough Step
              </h2>
              <div className="form-group">
                <label htmlFor="p29-step-num" className="form-label">
                  Walkthrough Sequence Step (1 to 9)
                </label>
                <input
                  id="p29-step-num"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={stepNumInput}
                  onChange={(e) => setStepNumInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-step-title" className="form-label">
                  Scenario Flow Title
                </label>
                <input
                  id="p29-step-title"
                  type="text"
                  className="form-control"
                  value={stepTitleInput}
                  placeholder="Chapter Setup, Signed Opening IPC & Approved Policies"
                  onChange={(e) => setStepTitleInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-step-records" className="form-label">
                  Connected Record IDs (comma-separated)
                </label>
                <input
                  id="p29-step-records"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={stepRecordsInput}
                  placeholder="IPC-2026-0001, RM-2026-0001"
                  onChange={(e) => setStepRecordsInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p29-step-mock"
                  type="checkbox"
                  checked={stepMockInput}
                  onChange={(e) => setStepMockInput(e.target.checked)}
                />
                <label htmlFor="p29-step-mock">
                  Uses disconnected presentation mock build
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p29-step-actor" className="form-label">
                  Demonstrating Officer ID
                </label>
                <input
                  id="p29-step-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={stepActorInput}
                  placeholder="101"
                  onChange={(e) => setStepActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-step-at" className="form-label">
                  Execution Time (UTC)
                </label>
                <input
                  id="p29-step-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={stepAtInput}
                  placeholder="2026-11-22T09:01:00Z"
                  onChange={(e) => setStepAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p29-record-step-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordStep}
                >
                  Record Walkthrough Step
                </button>
              </div>

              {visibleSteps.length > 0 ? (
                <div className="p03-queue-list" data-testid="p29-steps-list">
                  {visibleSteps.map((s) => (
                    <div key={s.step_id} className="p03-queue-item">
                      <div className="p03-queue-meta">
                        <strong>
                          Step {s.step_number}: {s.step_title}
                        </strong>
                        <span className="p03-mono-inline">
                          Records: {s.connected_record_ids.join(', ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="p03-card surface-card" aria-labelledby="p29-ev-heading">
              <h2 id="p29-ev-heading" className="p03-section-title">
                Record Executed Verification Coverage Matrix
              </h2>
              <div className="form-group">
                <label htmlFor="p29-ev-ref" className="form-label">
                  Evidence Bundle Reference
                </label>
                <input
                  id="p29-ev-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evRefInput}
                  placeholder="EV-PROD-CANDIDATE-2026-11"
                  onChange={(e) => setEvRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-env" className="form-label">
                  Execution Environment Label
                </label>
                <select
                  id="p29-ev-env"
                  className="form-control"
                  value={evEnvInput}
                  onChange={(e) => setEvEnvInput(e.target.value as DemoEnvironmentLabel)}
                >
                  <option value="labeled_test_environment">Labeled Academic Test Environment</option>
                  <option value="production_candidate">Production Release Candidate</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-nodes" className="form-label">
                  Source Nodes Verified (target 87)
                </label>
                <input
                  id="p29-ev-nodes"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evNodesInput}
                  onChange={(e) => setEvNodesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-branches" className="form-label">
                  Decision Branches Verified (target 40)
                </label>
                <input
                  id="p29-ev-branches"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evBranchesInput}
                  onChange={(e) => setEvBranchesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-connectors" className="form-label">
                  Sheet Connectors Verified (target 7)
                </label>
                <input
                  id="p29-ev-connectors"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evConnectorsInput}
                  onChange={(e) => setEvConnectorsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-loops" className="form-label">
                  Connected Loops Verified (target 6)
                </label>
                <input
                  id="p29-ev-loops"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evLoopsInput}
                  onChange={(e) => setEvLoopsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-narrative" className="form-label">
                  Narrative Controls Verified (target 35)
                </label>
                <input
                  id="p29-ev-narrative"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evNarrativeInput}
                  onChange={(e) => setEvNarrativeInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-ambiguities" className="form-label">
                  Ambiguity Resolutions Verified (target 21)
                </label>
                <input
                  id="p29-ev-ambiguities"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evAmbiguitiesInput}
                  onChange={(e) => setEvAmbiguitiesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-req" className="form-label">
                  Requirements Covered (target 194)
                </label>
                <input
                  id="p29-ev-req"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evReqInput}
                  onChange={(e) => setEvReqInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-acc" className="form-label">
                  Acceptance Scenarios Passed (target 35)
                </label>
                <input
                  id="p29-ev-acc"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evAccInput}
                  onChange={(e) => setEvAccInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-closure" className="form-label">
                  Record Closure Paths Verified (target 10)
                </label>
                <input
                  id="p29-ev-closure"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evClosureInput}
                  onChange={(e) => setEvClosureInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-gates" className="form-label">
                  Activation Readiness Gates Passed (target 11)
                </label>
                <input
                  id="p29-ev-gates"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evGatesInput}
                  onChange={(e) => setEvGatesInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-settings" className="form-label">
                  Approved Policy Inputs Verified (target 14)
                </label>
                <input
                  id="p29-ev-settings"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evSettingsInput}
                  onChange={(e) => setEvSettingsInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-unit" className="form-label">
                  Unit Tests Passed
                </label>
                <input
                  id="p29-ev-unit"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evUnitInput}
                  onChange={(e) => setEvUnitInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-e2e" className="form-label">
                  End-to-End Browser Tests Passed
                </label>
                <input
                  id="p29-ev-e2e"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evE2eInput}
                  onChange={(e) => setEvE2eInput(e.target.value)}
                />
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p29-ev-ac22"
                  type="checkbox"
                  checked={evAc22Input}
                  onChange={(e) => setEvAc22Input(e.target.checked)}
                />
                <label htmlFor="p29-ev-ac22">
                  Independent regional restore drills passed within 4h / 1h targets
                </label>
              </div>
              <div className="p03-checkbox-row">
                <input
                  id="p29-ev-p27"
                  type="checkbox"
                  checked={evP27Input}
                  onChange={(e) => setEvP27Input(e.target.checked)}
                />
                <label htmlFor="p29-ev-p27">
                  Single-host release manifest, maintenance fence &amp; 4-user load passed
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-actor" className="form-label">
                  Recording Coordinator ID
                </label>
                <input
                  id="p29-ev-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evActorInput}
                  placeholder="101"
                  onChange={(e) => setEvActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-ev-at" className="form-label">
                  Recorded Time (UTC)
                </label>
                <input
                  id="p29-ev-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={evAtInput}
                  placeholder="2026-11-22T09:15:00Z"
                  onChange={(e) => setEvAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p29-record-ev-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordEvidence}
                >
                  Save Coverage Evidence Bundle
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 2: Defects & Gate Sign-Offs */}
        {activeTab === 'defects' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p29-def-heading">
              <h2 id="p29-def-heading" className="p03-section-title">
                Track &amp; Resolve Verification Defects
              </h2>
              <div className="form-group">
                <label htmlFor="p29-def-ref" className="form-label">
                  Defect Reference
                </label>
                <input
                  id="p29-def-ref"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={defRefInput}
                  placeholder="DEF-CRIT-01"
                  onChange={(e) => setDefRefInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-severity" className="form-label">
                  Defect Severity
                </label>
                <select
                  id="p29-def-severity"
                  className="form-control"
                  value={defSeverityInput}
                  onChange={(e) => setDefSeverityInput(e.target.value as DefectSeverity)}
                >
                  <option value="critical">Critical Release Blocker</option>
                  <option value="minor">Minor Observation</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-status" className="form-label">
                  Resolution Status
                </label>
                <select
                  id="p29-def-status"
                  className="form-control"
                  value={defStatusInput}
                  onChange={(e) => setDefStatusInput(e.target.value as DefectStatus)}
                >
                  <option value="open">Open Defect</option>
                  <option value="resolved">Verified &amp; Resolved</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-pkg" className="form-label">
                  Owning Module
                </label>
                <input
                  id="p29-def-pkg"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={defPkgInput}
                  placeholder="Reservation Clocks"
                  onChange={(e) => setDefPkgInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-summary" className="form-label">
                  Finding / Verification Note
                </label>
                <input
                  id="p29-def-summary"
                  type="text"
                  className="form-control"
                  value={defSummaryInput}
                  placeholder="Boundary expiry test verified"
                  onChange={(e) => setDefSummaryInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-actor" className="form-label">
                  Owner ID
                </label>
                <input
                  id="p29-def-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={defActorInput}
                  placeholder="101"
                  onChange={(e) => setDefActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-def-at" className="form-label">
                  Update Time (UTC)
                </label>
                <input
                  id="p29-def-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={defAtInput}
                  placeholder="2026-11-22T09:16:00Z"
                  onChange={(e) => setDefAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p29-submit-defect-btn"
                  className="btn-batcave-primary"
                  onClick={handleSubmitDefect}
                >
                  Save Defect Status
                </button>
              </div>
            </section>

            <section className="p03-card surface-card" aria-labelledby="p29-sig-heading">
              <h2 id="p29-sig-heading" className="p03-section-title">
                Operational Release Sign-Off (Authorized Duties Only)
              </h2>
              <div className="form-group">
                <label htmlFor="p29-sig-role" className="form-label">
                  Signatory Duty Role
                </label>
                <select
                  id="p29-sig-role"
                  className="form-control"
                  value={sigRoleInput}
                  onChange={(e) => setSigRoleInput(e.target.value as SignoffRole)}
                >
                  <option value="CHAPTER_HEAD">Chapter Head</option>
                  <option value="FINANCE">Finance Officer</option>
                  <option value="INDEPENDENT_REVIEWER">Independent Peer Reviewer</option>
                  <option value="DEVELOPER">Developer Contributor</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p29-sig-scope" className="form-label">
                  Sign-Off Scope
                </label>
                <select
                  id="p29-sig-scope"
                  className="form-control"
                  value={sigScopeInput}
                  onChange={(e) => setSigScopeInput(e.target.value as SignoffScope)}
                >
                  <option value="production_release_acceptance">Production Release Acceptance</option>
                  <option value="academic_functional_demo">Academic Demonstration Readiness</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="p29-sig-actor" className="form-label">
                  Signing Officer ID
                </label>
                <input
                  id="p29-sig-actor"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigActorInput}
                  placeholder="101"
                  onChange={(e) => setSigActorInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-sig-note" className="form-label">
                  Approval Rationale
                </label>
                <input
                  id="p29-sig-note"
                  type="text"
                  className="form-control"
                  value={sigNoteInput}
                  placeholder="Verified end-to-end compliance and independent recovery"
                  onChange={(e) => setSigNoteInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-sig-at" className="form-label">
                  Signature Time (UTC)
                </label>
                <input
                  id="p29-sig-at"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={sigAtInput}
                  placeholder="2026-11-22T10:10:00Z"
                  onChange={(e) => setSigAtInput(e.target.value)}
                />
              </div>
              <div className="p03-guard-buttons">
                <button
                  type="button"
                  id="p29-record-signoff-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordSignoff}
                >
                  Record Gate Sign-Off
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* TAB 3: Final Release Verdict */}
        {activeTab === 'verdict' ? (
          <section className="p03-card surface-card" aria-labelledby="p29-ver-heading">
            <h2 id="p29-ver-heading" className="p03-section-title">
              Evaluate Academic Walkthrough vs. Production Release Verdict
            </h2>
            <p className="p03-muted-copy">
              Evaluations distinguish labeled academic functional demonstrations from full
              production acceptance requiring independent recovery drills, complete settings, and
              distinct Chapter Head plus Finance sign-offs.
            </p>
            <div className="form-group">
              <label htmlFor="p29-ver-mode" className="form-label">
                Evaluation Target Mode
              </label>
              <select
                id="p29-ver-mode"
                className="form-control"
                value={verModeInput}
                onChange={(e) => setVerModeInput(e.target.value as VerdictTargetMode)}
              >
                <option value="academic_functional_demo">
                  Academic Functional Demonstration (Labeled Environment)
                </option>
                <option value="complete_production_release">
                  Complete Production Release Acceptance
                </option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="p29-ver-actor" className="form-label">
                Coordinating Evaluator ID
              </label>
              <input
                id="p29-ver-actor"
                type="text"
                className="form-control p03-mono-inline"
                value={verActorInput}
                placeholder="101"
                onChange={(e) => setVerActorInput(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="p29-ver-at" className="form-label">
                Evaluation Time (UTC)
              </label>
              <input
                id="p29-ver-at"
                type="text"
                className="form-control p03-mono-inline"
                value={verAtInput}
                placeholder="2026-11-22T10:20:00Z"
                onChange={(e) => setVerAtInput(e.target.value)}
              />
            </div>
            <div className="p03-guard-buttons">
              <button
                type="button"
                id="p29-eval-verdict-btn"
                className="btn-batcave-primary"
                onClick={handleEvaluateVerdict}
              >
                Evaluate Final Acceptance Verdict
              </button>
            </div>

            <div className="callout-banner" data-testid="p29-verdict-panel" aria-live="polite">
              <span
                className={`callout-dot ${snapshot.release_verdict.production_release_accepted ? 'dot-success' : 'dot-pending'}`}
                aria-hidden="true"
              />
              <div>
                <strong>Status: {snapshot.release_verdict.verdict_label}</strong>
                <div>
                  Academic Demo Ready: {String(snapshot.release_verdict.academic_demo_ready)} |
                  Production Release Accepted:{' '}
                  {String(snapshot.release_verdict.production_release_accepted)}
                </div>
                {snapshot.release_verdict.blocking_reasons.length > 0 ? (
                  <div className="p03-muted-copy">
                    Pending / Blocking Items:{' '}
                    {snapshot.release_verdict.blocking_reasons.join('; ')}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* TAB 4: Audit History & Recovery Lookup */}
        {activeTab === 'history' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card" aria-labelledby="p29-audit-heading">
              <h2 id="p29-audit-heading" className="p03-section-title">
                Acceptance Dossier Audit Trail
              </h2>
              {snapshot.history.length === 0 ? (
                <p className="p03-muted-copy">No acceptance dossier actions recorded yet.</p>
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

            <section className="p03-card surface-card" aria-labelledby="p29-lookup-heading">
              <h2 id="p29-lookup-heading" className="p03-section-title">
                Operation Recovery Lookup
              </h2>
              <div className="form-group">
                <label htmlFor="p29-lookup-key-input" className="form-label">
                  Idempotency Key
                </label>
                <input
                  id="p29-lookup-key-input"
                  type="text"
                  className="form-control p03-mono-inline"
                  value={lookupKeyInput}
                  placeholder="Operation key"
                  onChange={(e) => setLookupKeyInput(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="p29-lookup-ulid-input" className="form-label">
                  Operation ID
                </label>
                <input
                  id="p29-lookup-ulid-input"
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
                  id="p29-lookup-by-key-btn"
                  className="btn-batcave-secondary"
                  onClick={handleLookupByKey}
                >
                  Recover by Key
                </button>
                <button
                  type="button"
                  id="p29-lookup-by-ulid-btn"
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
                        data-testid={`p29-ledger-fill-${op.operation_id}`}
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
                <div className="callout-banner" data-testid="p29-lookup-result" aria-live="polite">
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
