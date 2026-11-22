import { computeDeterministicHash } from './canonicalHash';

export const P29_CONTEXT_STORAGE_KEY = 'ysp_p29_context';

export const REQUIRED_MVP_TARGETS = {
  packages: 30,
  nodes: 87,
  branches: 40,
  connectors: 7,
  loops: 6,
  narrative: 35,
  ambiguities: 21,
  requirements: 194,
  acceptance: 35,
  closure: 10,
  activation: 11,
  settings: 14,
} as const;

const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type DemoEnvironmentLabel = 'labeled_test_environment' | 'production_candidate';
export type DefectSeverity = 'critical' | 'minor';
export type DefectStatus = 'open' | 'resolved';
export type SignoffRole = 'CHAPTER_HEAD' | 'FINANCE' | 'INDEPENDENT_REVIEWER' | 'DEVELOPER';
export type SignoffScope = 'academic_functional_demo' | 'production_release_acceptance';
export type VerdictTargetMode = 'academic_functional_demo' | 'complete_production_release';
export type VerdictLabel =
  | 'pending_verification'
  | 'blocked_open_critical_defect'
  | 'academic_functional_demo_only'
  | 'complete_production_release_accepted';

export interface ConnectedDemoStepRecord {
  step_id: string;
  step_number: number;
  step_title: string;
  connected_record_ids: ReadonlyArray<string>;
  uses_disconnected_mock_build: boolean;
  demonstrated_by_user_id: string;
  executed_at: string;
}

export interface CoverageEvidenceBundle {
  bundle_id: string;
  bundle_ref: string;
  environment_label: DemoEnvironmentLabel;
  nodes_verified: number;
  branches_verified: number;
  connectors_verified: number;
  loops_verified: number;
  narrative_verified: number;
  ambiguities_verified: number;
  requirements_verified: number;
  acceptance_verified: number;
  closure_verified: number;
  activation_gates_passed: number;
  settings_verified: number;
  unit_tests_passed: number;
  e2e_tests_passed: number;
  ac22_recovery_passed: boolean;
  p27_host_readiness_passed: boolean;
  recorded_by_user_id: string;
  recorded_at: string;
}

export interface AcceptanceDefectRecord {
  defect_id: string;
  defect_ref: string;
  severity: DefectSeverity;
  status: DefectStatus;
  owning_package: string;
  summary: string;
  actor_user_id: string;
  updated_at: string;
}

export interface OperationalGateSignoffRecord {
  signoff_id: string;
  signoff_role: SignoffRole;
  signoff_scope: SignoffScope;
  signer_user_id: string;
  decision_note: string;
  signed_at: string;
}

export interface FinalReleaseVerdict {
  academic_demo_ready: boolean;
  production_release_accepted: boolean;
  verdict_label: VerdictLabel;
  blocking_reasons: ReadonlyArray<string>;
}

export interface P29HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P29SummaryMetrics {
  demo_steps_count: number;
  evidence_bundles_count: number;
  open_critical_defects_count: number;
  operational_signoffs_count: number;
  academic_demo_ready: boolean;
  production_release_accepted: boolean;
  verdict_label: VerdictLabel;
}

export interface P29OperationLedgerEntry {
  operation_id: string;
  chapter_id: string;
  action_code: string;
  actor_user_id: string;
  target_id: string | null;
  idempotency_key: string;
  payload_fingerprint: string;
  http_status: number;
  code: string;
  message: string;
  snapshot: unknown;
}

export interface P29ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P29LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P29EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  demo_steps_recorded: ReadonlyArray<ConnectedDemoStepRecord>;
  evidence_bundles: ReadonlyArray<CoverageEvidenceBundle>;
  defects: ReadonlyArray<AcceptanceDefectRecord>;
  gate_signoffs: ReadonlyArray<OperationalGateSignoffRecord>;
  release_verdict: FinalReleaseVerdict;
  history: ReadonlyArray<P29HistoryEntry>;
  summary: P29SummaryMetrics;
  operation_ledger: ReadonlyArray<P29OperationLedgerEntry>;
  last_action: P29ActionResult | null;
}

export interface P29EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  demo_steps_recorded?: ReadonlyArray<ConnectedDemoStepRecord> | undefined;
  evidence_bundles?: ReadonlyArray<CoverageEvidenceBundle> | undefined;
  defects?: ReadonlyArray<AcceptanceDefectRecord> | undefined;
  gate_signoffs?: ReadonlyArray<OperationalGateSignoffRecord> | undefined;
  release_verdict?: FinalReleaseVerdict | undefined;
  history?: ReadonlyArray<P29HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P29OperationLedgerEntry> | undefined;
}

export interface P29AcceptanceDossierEngine {
  getSnapshot: () => P29EngineSnapshot;
  recordConnectedDemoStep: (input: {
    step_number: number;
    step_title: string;
    connected_record_ids: ReadonlyArray<string>;
    uses_disconnected_mock_build: boolean;
    demonstrated_by_user_id: string;
    executed_at: string;
    idempotency_key?: string | undefined;
  }) => P29ActionResult<ConnectedDemoStepRecord>;
  recordCoverageEvidenceBundle: (input: {
    bundle_ref: string;
    environment_label: DemoEnvironmentLabel;
    nodes_verified: string;
    branches_verified: string;
    connectors_verified: string;
    loops_verified: string;
    narrative_verified: string;
    ambiguities_verified: string;
    requirements_verified: string;
    acceptance_verified: string;
    closure_verified: string;
    activation_gates_passed: string;
    settings_verified: string;
    unit_tests_passed: string;
    e2e_tests_passed: string;
    ac22_recovery_passed: boolean;
    p27_host_readiness_passed: boolean;
    recorded_by_user_id: string;
    recorded_at: string;
    idempotency_key?: string | undefined;
  }) => P29ActionResult<CoverageEvidenceBundle>;
  logOrResolveDefect: (input: {
    defect_ref: string;
    severity: DefectSeverity;
    status: DefectStatus;
    owning_package: string;
    summary: string;
    actor_user_id: string;
    timestamp: string;
    idempotency_key?: string | undefined;
  }) => P29ActionResult<AcceptanceDefectRecord>;
  recordOperationalGateSignoff: (input: {
    signoff_role: SignoffRole;
    signoff_scope: SignoffScope;
    signer_user_id: string;
    decision_note: string;
    signed_at: string;
    idempotency_key?: string | undefined;
  }) => P29ActionResult<OperationalGateSignoffRecord>;
  evaluateFinalAcceptanceVerdict: (input: {
    target_mode: VerdictTargetMode;
    evaluator_user_id: string;
    evaluated_at: string;
    idempotency_key?: string | undefined;
  }) => P29ActionResult<FinalReleaseVerdict>;
  lookupAcceptanceOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P29ActionResult<P29LookupResult>;
}

function readStoredP29Options(): P29EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P29_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P29EngineOptions;
  } catch {
    return undefined;
  }
}

function defaultReleaseVerdict(): FinalReleaseVerdict {
  return {
    academic_demo_ready: false,
    production_release_accepted: false,
    verdict_label: 'pending_verification',
    blocking_reasons: [],
  };
}

/**
 * Creates a chapter-scoped final regression, connected professor walkthrough, defect tracking,
 * operational sign-off, and honest academic-demo versus production-release acceptance engine.
 */
export function createP29AcceptanceDossierEngine(
  options?: P29EngineOptions
): P29AcceptanceDossierEngine {
  const seed = options ?? readStoredP29Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 29000;

  const demoSteps: ConnectedDemoStepRecord[] = (seed.demo_steps_recorded ?? []).map((s) =>
    structuredClone(s)
  );
  const evidenceBundles: CoverageEvidenceBundle[] = (seed.evidence_bundles ?? []).map((e) =>
    structuredClone(e)
  );
  const defects: AcceptanceDefectRecord[] = (seed.defects ?? []).map((d) => structuredClone(d));
  const gateSignoffs: OperationalGateSignoffRecord[] = (seed.gate_signoffs ?? []).map((g) =>
    structuredClone(g)
  );
  let releaseVerdict: FinalReleaseVerdict = seed.release_verdict
    ? structuredClone(seed.release_verdict)
    : defaultReleaseVerdict();

  const history: P29HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P29OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P29ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P29${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P29SummaryMetrics {
    return {
      demo_steps_count: demoSteps.length,
      evidence_bundles_count: evidenceBundles.length,
      open_critical_defects_count: defects.filter(
        (d) => d.severity === 'critical' && d.status === 'open'
      ).length,
      operational_signoffs_count: gateSignoffs.length,
      academic_demo_ready: releaseVerdict.academic_demo_ready,
      production_release_accepted: releaseVerdict.production_release_accepted,
      verdict_label: releaseVerdict.verdict_label,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P29_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          demo_steps_recorded: demoSteps,
          evidence_bundles: evidenceBundles,
          defects,
          gate_signoffs: gateSignoffs,
          release_verdict: releaseVerdict,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P29ActionResult<T> {
    const res: P29ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P29ActionResult<T> | null {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) return null;
    const trimmed = idempotencyKey.trim();
    const existing = operationLedger.find(
      (o) => o.chapter_id === chapterId && o.action_code === actionCode && o.idempotency_key === trimmed
    );
    if (!existing) return null;
    const fingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      payload,
    });
    if (existing.payload_fingerprint !== fingerprint) {
      return fail(
        409,
        'IDEMPOTENCY_CONFLICT',
        `Idempotency key "${trimmed}" cannot be reused with a modified payload.`
      );
    }
    const replayRes: P29ActionResult<T> = {
      ok: existing.http_status >= 200 && existing.http_status < 400,
      http_status: existing.http_status,
      code: existing.code,
      message: `${existing.message} (idempotent replay)`,
      replayed: true,
      data: structuredClone(existing.snapshot) as T,
    };
    lastAction = replayRes;
    return replayRes;
  }

  function recordLedgerAndPersist<T>(
    actionCode: string,
    actorUserId: string,
    targetId: string | null,
    idempotencyKey: string | undefined,
    payload: unknown,
    httpStatus: number,
    code: string,
    message: string,
    data: T
  ): P29ActionResult<T> {
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const fingerprint = computeDeterministicHash({
        chapter_id: chapterId,
        action_code: actionCode,
        payload,
      });
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: actionCode,
        actor_user_id: actorUserId,
        target_id: targetId,
        idempotency_key: idempotencyKey.trim(),
        payload_fingerprint: fingerprint,
        http_status: httpStatus,
        code,
        message,
        snapshot: structuredClone(data),
      });
    }
    const res: P29ActionResult<T> = {
      ok: httpStatus >= 200 && httpStatus < 400,
      http_status: httpStatus,
      code,
      message,
      replayed: false,
      data,
    };
    lastAction = res;
    persistSnapshot();
    return res;
  }

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        demo_steps_recorded: demoSteps.map((s) => structuredClone(s)),
        evidence_bundles: evidenceBundles.map((e) => structuredClone(e)),
        defects: defects.map((d) => structuredClone(d)),
        gate_signoffs: gateSignoffs.map((g) => structuredClone(g)),
        release_verdict: structuredClone(releaseVerdict),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    recordConnectedDemoStep(input) {
      const replay = checkIdempotency<ConnectedDemoStepRecord>(
        'p29.record_demo_step',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const title = input.step_title.trim();
      const actor = input.demonstrated_by_user_id.trim();
      const at = input.executed_at.trim();
      const recordIds = input.connected_record_ids.map((r) => r.trim()).filter((r) => r.length > 0);

      if (!Number.isInteger(input.step_number) || input.step_number < 1 || input.step_number > 9) {
        return fail(
          422,
          'INVALID_DEMO_STEP_NUMBER',
          'Connected professor demonstration step number must be between 1 and 9.'
        );
      }
      if (!title || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Step title, demonstrating officer ID, and UTC execution time are required.'
        );
      }
      if (input.uses_disconnected_mock_build) {
        return fail(
          422,
          'DISCONNECTED_DEMO_BUILD_FORBIDDEN',
          'Acceptance demonstrations cannot use disconnected UI mock builds; records must trace across real integrated modules.'
        );
      }
      if (recordIds.length === 0) {
        return fail(
          422,
          'CONNECTED_RECORD_IDS_REQUIRED',
          'At least one linked operational record ID (e.g. RF/PO/RM/SO/OR/DR/ADJ) must be retained for reproduction.'
        );
      }

      const existingIdx = demoSteps.findIndex((s) => s.step_number === input.step_number);
      const stepRecord: ConnectedDemoStepRecord = {
        step_id: existingIdx >= 0 ? (demoSteps[existingIdx]?.step_id ?? nextId()) : nextId(),
        step_number: input.step_number,
        step_title: title,
        connected_record_ids: recordIds,
        uses_disconnected_mock_build: false,
        demonstrated_by_user_id: actor,
        executed_at: at,
      };
      if (existingIdx >= 0) {
        demoSteps[existingIdx] = stepRecord;
      } else {
        demoSteps.push(stepRecord);
      }

      history.push({
        event_id: nextId(),
        target_id: stepRecord.step_id,
        action: 'connected_demo_step_recorded',
        actor_user_id: actor,
        reason: `Step ${input.step_number}: ${title} [${recordIds.join(', ')}]`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p29.record_demo_step',
        actor,
        stepRecord.step_id,
        input.idempotency_key,
        input,
        201,
        'CONNECTED_DEMO_STEP_RECORDED',
        `Recorded connected walkthrough step ${input.step_number} ("${title}") with linked record IDs [${recordIds.join(', ')}].`,
        structuredClone(stepRecord)
      );
    },

    recordCoverageEvidenceBundle(input) {
      const replay = checkIdempotency<CoverageEvidenceBundle>(
        'p29.record_evidence',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const ref = input.bundle_ref.trim();
      const actor = input.recorded_by_user_id.trim();
      const at = input.recorded_at.trim();

      if (!ref || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Evidence bundle reference, recorder ID, and UTC timestamp are required.'
        );
      }

      const countStrings = [
        input.nodes_verified,
        input.branches_verified,
        input.connectors_verified,
        input.loops_verified,
        input.narrative_verified,
        input.ambiguities_verified,
        input.requirements_verified,
        input.acceptance_verified,
        input.closure_verified,
        input.activation_gates_passed,
        input.settings_verified,
        input.unit_tests_passed,
        input.e2e_tests_passed,
      ].map((s) => s.trim());

      if (countStrings.some((s) => !INTEGER_PATTERN.test(s))) {
        return fail(
          422,
          'INVALID_COVERAGE_COUNT',
          'All executed verification counts must be non-negative whole numbers.'
        );
      }

      if (evidenceBundles.some((b) => b.bundle_ref === ref)) {
        return fail(409, 'DUPLICATE_EVIDENCE_BUNDLE', `Evidence bundle "${ref}" already exists.`);
      }

      const bundle: CoverageEvidenceBundle = {
        bundle_id: nextId(),
        bundle_ref: ref,
        environment_label: input.environment_label,
        nodes_verified: Number(input.nodes_verified.trim()),
        branches_verified: Number(input.branches_verified.trim()),
        connectors_verified: Number(input.connectors_verified.trim()),
        loops_verified: Number(input.loops_verified.trim()),
        narrative_verified: Number(input.narrative_verified.trim()),
        ambiguities_verified: Number(input.ambiguities_verified.trim()),
        requirements_verified: Number(input.requirements_verified.trim()),
        acceptance_verified: Number(input.acceptance_verified.trim()),
        closure_verified: Number(input.closure_verified.trim()),
        activation_gates_passed: Number(input.activation_gates_passed.trim()),
        settings_verified: Number(input.settings_verified.trim()),
        unit_tests_passed: Number(input.unit_tests_passed.trim()),
        e2e_tests_passed: Number(input.e2e_tests_passed.trim()),
        ac22_recovery_passed: input.ac22_recovery_passed,
        p27_host_readiness_passed: input.p27_host_readiness_passed,
        recorded_by_user_id: actor,
        recorded_at: at,
      };
      evidenceBundles.push(bundle);

      history.push({
        event_id: nextId(),
        target_id: bundle.bundle_id,
        action: 'coverage_evidence_bundle_recorded',
        actor_user_id: actor,
        reason: `${ref} (${input.environment_label}): nodes ${bundle.nodes_verified}/87, branches ${bundle.branches_verified}/40, req ${bundle.requirements_verified}/194, recovery=${String(bundle.ac22_recovery_passed)}`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p29.record_evidence',
        actor,
        bundle.bundle_id,
        input.idempotency_key,
        input,
        201,
        'COVERAGE_EVIDENCE_BUNDLE_RECORDED',
        `Recorded executed verification matrix bundle "${ref}" (${input.environment_label}).`,
        structuredClone(bundle)
      );
    },

    logOrResolveDefect(input) {
      const replay = checkIdempotency<AcceptanceDefectRecord>(
        'p29.defect',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const ref = input.defect_ref.trim();
      const pkg = input.owning_package.trim();
      const sum = input.summary.trim();
      const actor = input.actor_user_id.trim();
      const at = input.timestamp.trim();

      if (!ref || !pkg || !sum || !actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Defect reference, owning package, summary, actor ID, and UTC timestamp are required.'
        );
      }

      const existing = defects.find((d) => d.defect_ref === ref);
      if (input.status === 'resolved') {
        if (!existing) {
          return fail(404, 'DEFECT_NOT_FOUND', `Defect "${ref}" cannot be resolved before logging.`);
        }
        existing.status = 'resolved';
        existing.summary = sum;
        existing.actor_user_id = actor;
        existing.updated_at = at;

        history.push({
          event_id: nextId(),
          target_id: existing.defect_id,
          action: 'acceptance_defect_resolved',
          actor_user_id: actor,
          reason: `Resolved ${ref} (${pkg}): ${sum}`,
          timestamp: at,
        });

        return recordLedgerAndPersist(
          'p29.defect',
          actor,
          existing.defect_id,
          input.idempotency_key,
          input,
          200,
          'ACCEPTANCE_DEFECT_RESOLVED',
          `Resolved defect "${ref}" in owning package ${pkg}.`,
          structuredClone(existing)
        );
      }

      if (existing && existing.status === 'open') {
        return fail(409, 'DEFECT_ALREADY_OPEN', `Defect "${ref}" is already open.`);
      }

      const defectRecord: AcceptanceDefectRecord = {
        defect_id: nextId(),
        defect_ref: ref,
        severity: input.severity,
        status: 'open',
        owning_package: pkg,
        summary: sum,
        actor_user_id: actor,
        updated_at: at,
      };
      defects.push(defectRecord);

      history.push({
        event_id: nextId(),
        target_id: defectRecord.defect_id,
        action: 'acceptance_defect_logged',
        actor_user_id: actor,
        reason: `Logged ${input.severity} defect ${ref} (${pkg}): ${sum}`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p29.defect',
        actor,
        defectRecord.defect_id,
        input.idempotency_key,
        input,
        201,
        'ACCEPTANCE_DEFECT_LOGGED',
        `Logged ${input.severity} defect "${ref}" against owning package ${pkg}.`,
        structuredClone(defectRecord)
      );
    },

    recordOperationalGateSignoff(input) {
      const replay = checkIdempotency<OperationalGateSignoffRecord>(
        'p29.gate_signoff',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const signer = input.signer_user_id.trim();
      const note = input.decision_note.trim();
      const at = input.signed_at.trim();

      if (!signer || !note || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Signer ID, decision note, and UTC signature timestamp are required.'
        );
      }

      if (
        input.signoff_scope === 'production_release_acceptance' &&
        input.signoff_role === 'DEVELOPER'
      ) {
        return fail(
          403,
          'DEVELOPER_ALONE_CANNOT_OPEN_LIVE_OPERATIONS',
          'Developer reviews alone cannot sign off production release acceptance; authorized Chapter Head and Finance duties must approve.'
        );
      }

      if (
        gateSignoffs.some(
          (g) =>
            g.signoff_scope === input.signoff_scope &&
            g.signoff_role === input.signoff_role &&
            g.signer_user_id === signer
        )
      ) {
        return fail(
          409,
          'DUPLICATE_SIGNOFF',
          `Officer "${signer}" already recorded ${input.signoff_role} sign-off for ${input.signoff_scope}.`
        );
      }

      if (
        input.signoff_scope === 'production_release_acceptance' &&
        (input.signoff_role === 'CHAPTER_HEAD' || input.signoff_role === 'FINANCE')
      ) {
        const conflicting = gateSignoffs.find(
          (g) =>
            g.signoff_scope === 'production_release_acceptance' &&
            g.signer_user_id === signer &&
            g.signoff_role !== input.signoff_role
        );
        if (conflicting) {
          return fail(
            422,
            'DISTINCT_HEAD_AND_FINANCE_SIGNERS_REQUIRED',
            'Production release acceptance requires distinct authorized Chapter Head and Finance signatories.'
          );
        }
      }

      const signoff: OperationalGateSignoffRecord = {
        signoff_id: nextId(),
        signoff_role: input.signoff_role,
        signoff_scope: input.signoff_scope,
        signer_user_id: signer,
        decision_note: note,
        signed_at: at,
      };
      gateSignoffs.push(signoff);

      history.push({
        event_id: nextId(),
        target_id: signoff.signoff_id,
        action: 'operational_gate_signoff_recorded',
        actor_user_id: signer,
        reason: `${input.signoff_role} signed ${input.signoff_scope}: ${note}`,
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p29.gate_signoff',
        signer,
        signoff.signoff_id,
        input.idempotency_key,
        input,
        201,
        'OPERATIONAL_GATE_SIGNOFF_RECORDED',
        `Recorded ${input.signoff_role} authorization for ${input.signoff_scope}.`,
        structuredClone(signoff)
      );
    },

    evaluateFinalAcceptanceVerdict(input) {
      const replay = checkIdempotency<FinalReleaseVerdict>(
        'p29.evaluate_verdict',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.evaluator_user_id.trim();
      const at = input.evaluated_at.trim();
      if (!actor || !UTC_INSTANT_PATTERN.test(at)) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Evaluator ID and UTC timestamp are required.'
        );
      }

      const openCritical = defects.filter((d) => d.severity === 'critical' && d.status === 'open');
      if (openCritical.length > 0) {
        releaseVerdict = {
          academic_demo_ready: false,
          production_release_accepted: false,
          verdict_label: 'blocked_open_critical_defect',
          blocking_reasons: openCritical.map((d) => `Open critical defect: ${d.defect_ref}`),
        };
        persistSnapshot();
        return fail(
          409,
          'OPEN_CRITICAL_DEFECT_BLOCKS_RELEASE',
          `${openCritical.length} open critical defect(s) (${openCritical.map((d) => d.defect_ref).join(', ')}) block both academic and production acceptance.`
        );
      }

      const functionalBlockers: string[] = [];
      for (let step = 1; step <= 9; step += 1) {
        if (!demoSteps.some((s) => s.step_number === step)) {
          functionalBlockers.push(`Connected walkthrough step ${step} not yet demonstrated`);
        }
      }

      const latestBundle = evidenceBundles[evidenceBundles.length - 1];
      if (!latestBundle) {
        functionalBlockers.push('No executed requirement/source coverage evidence bundle recorded');
      } else {
        if (latestBundle.nodes_verified < REQUIRED_MVP_TARGETS.nodes) {
          functionalBlockers.push(`Nodes verified ${latestBundle.nodes_verified}/${REQUIRED_MVP_TARGETS.nodes}`);
        }
        if (latestBundle.branches_verified < REQUIRED_MVP_TARGETS.branches) {
          functionalBlockers.push(`Decision branches ${latestBundle.branches_verified}/${REQUIRED_MVP_TARGETS.branches}`);
        }
        if (latestBundle.connectors_verified < REQUIRED_MVP_TARGETS.connectors) {
          functionalBlockers.push(`Connectors ${latestBundle.connectors_verified}/${REQUIRED_MVP_TARGETS.connectors}`);
        }
        if (latestBundle.loops_verified < REQUIRED_MVP_TARGETS.loops) {
          functionalBlockers.push(`Loops ${latestBundle.loops_verified}/${REQUIRED_MVP_TARGETS.loops}`);
        }
        if (latestBundle.narrative_verified < REQUIRED_MVP_TARGETS.narrative) {
          functionalBlockers.push(`Narrative controls ${latestBundle.narrative_verified}/${REQUIRED_MVP_TARGETS.narrative}`);
        }
        if (latestBundle.ambiguities_verified < REQUIRED_MVP_TARGETS.ambiguities) {
          functionalBlockers.push(`Ambiguity resolutions ${latestBundle.ambiguities_verified}/${REQUIRED_MVP_TARGETS.ambiguities}`);
        }
        if (latestBundle.requirements_verified < REQUIRED_MVP_TARGETS.requirements) {
          functionalBlockers.push(`Requirements ${latestBundle.requirements_verified}/${REQUIRED_MVP_TARGETS.requirements}`);
        }
        if (latestBundle.acceptance_verified < REQUIRED_MVP_TARGETS.acceptance) {
          functionalBlockers.push(`Acceptance criteria ${latestBundle.acceptance_verified}/${REQUIRED_MVP_TARGETS.acceptance}`);
        }
        if (latestBundle.closure_verified < REQUIRED_MVP_TARGETS.closure) {
          functionalBlockers.push(`Record closures ${latestBundle.closure_verified}/${REQUIRED_MVP_TARGETS.closure}`);
        }
      }

      const productionBlockers: string[] = [...functionalBlockers];
      if (!latestBundle) {
        productionBlockers.push('Missing production readiness and recovery evidence');
      } else {
        if (!latestBundle.ac22_recovery_passed) {
          productionBlockers.push('Independent regional recovery drill (AC-22) not passed');
        }
        if (!latestBundle.p27_host_readiness_passed) {
          productionBlockers.push('Host release & maintenance readiness (P27) not passed');
        }
        if (latestBundle.activation_gates_passed < REQUIRED_MVP_TARGETS.activation) {
          productionBlockers.push(`Activation gates ${latestBundle.activation_gates_passed}/${REQUIRED_MVP_TARGETS.activation}`);
        }
        if (latestBundle.settings_verified < REQUIRED_MVP_TARGETS.settings) {
          productionBlockers.push(`Approved settings ${latestBundle.settings_verified}/${REQUIRED_MVP_TARGETS.settings}`);
        }
      }

      const headProd = gateSignoffs.find(
        (g) => g.signoff_scope === 'production_release_acceptance' && g.signoff_role === 'CHAPTER_HEAD'
      );
      const financeProd = gateSignoffs.find(
        (g) => g.signoff_scope === 'production_release_acceptance' && g.signoff_role === 'FINANCE'
      );
      if (!headProd || !financeProd || headProd.signer_user_id === financeProd.signer_user_id) {
        productionBlockers.push(
          'Distinct authorized Chapter Head and Finance production release sign-offs required'
        );
      }

      const academicReady = functionalBlockers.length === 0;

      if (input.target_mode === 'academic_functional_demo') {
        if (!academicReady) {
          releaseVerdict = {
            academic_demo_ready: false,
            production_release_accepted: false,
            verdict_label: 'pending_verification',
            blocking_reasons: functionalBlockers,
          };
          persistSnapshot();
          return fail(
            409,
            'ACADEMIC_DEMO_BLOCKED_INCOMPLETE_EVIDENCE',
            `Academic functional demonstration is incomplete: ${functionalBlockers.join('; ')}.`
          );
        }

        releaseVerdict = {
          academic_demo_ready: true,
          production_release_accepted: false,
          verdict_label: 'academic_functional_demo_only',
          blocking_reasons: productionBlockers,
        };

        history.push({
          event_id: nextId(),
          target_id: chapterId,
          action: 'academic_functional_demo_verified',
          actor_user_id: actor,
          reason: `9 connected walkthrough steps & 87/40/194 functional matrix passed (remaining production blockers: ${productionBlockers.length})`,
          timestamp: at,
        });

        return recordLedgerAndPersist(
          'p29.evaluate_verdict',
          actor,
          chapterId,
          input.idempotency_key,
          input,
          200,
          'ACADEMIC_FUNCTIONAL_DEMO_READY',
          `Academic functional demonstration approved honestly with ${productionBlockers.length} pending production readiness gate(s); production release remains unaccepted.`,
          structuredClone(releaseVerdict)
        );
      }

      // target_mode === 'complete_production_release'
      if (productionBlockers.length > 0) {
        releaseVerdict = {
          academic_demo_ready: academicReady,
          production_release_accepted: false,
          verdict_label: academicReady ? 'academic_functional_demo_only' : 'pending_verification',
          blocking_reasons: productionBlockers,
        };
        persistSnapshot();
        return fail(
          409,
          'COMPLETE_RELEASE_BLOCKED_PENDING_GATES',
          `Complete production release blocked by pending readiness/signoff gate(s): ${productionBlockers.join('; ')}.`
        );
      }

      releaseVerdict = {
        academic_demo_ready: true,
        production_release_accepted: true,
        verdict_label: 'complete_production_release_accepted',
        blocking_reasons: [],
      };

      history.push({
        event_id: nextId(),
        target_id: chapterId,
        action: 'complete_production_release_accepted',
        actor_user_id: actor,
        reason: 'All 9 connected walkthroughs, full 87/40/194/35 coverage, AC-22 recovery, and distinct Head+Finance signoffs passed',
        timestamp: at,
      });

      return recordLedgerAndPersist(
        'p29.evaluate_verdict',
        actor,
        chapterId,
        input.idempotency_key,
        input,
        200,
        'COMPLETE_PRODUCTION_RELEASE_ACCEPTED',
        'Complete production release accepted: all source nodes, acceptance tests, regional recovery drills, and independent officer sign-offs passed.',
        structuredClone(releaseVerdict)
      );
    },

    lookupAcceptanceOperation(input) {
      if (input.chapter_id !== chapterId) {
        return {
          ok: false,
          http_status: 403,
          code: 'FORBIDDEN_SCOPE',
          message: 'Operation lookup rejected for foreign chapter scope.',
          data: {
            action_result: 'forbidden',
            input_policy: 'preserve',
            lookup_state: null,
            operation_id: null,
            idempotency_key: null,
            recovered_snapshot: null,
          },
        };
      }

      const match =
        input.query_type === 'by_key'
          ? operationLedger.find(
              (o) =>
                o.idempotency_key === (input.idempotency_key ?? '').trim() &&
                (!input.action_code || o.action_code === input.action_code)
            )
          : operationLedger.find((o) => o.operation_id === (input.operation_id ?? '').trim());

      if (!match) {
        return {
          ok: false,
          http_status: 404,
          code: 'OPERATION_NOT_VISIBLE',
          message: 'No committed operation found for the supplied identifier; preserve inputs.',
          data: {
            action_result: 'uncertain',
            input_policy: 'preserve',
            lookup_state: 'pending_or_not_visible',
            operation_id: input.operation_id ?? null,
            idempotency_key: input.idempotency_key ?? null,
            recovered_snapshot: null,
          },
        };
      }

      return {
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered durable result ${match.operation_id} (${match.code}).`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: match.operation_id,
          idempotency_key: match.idempotency_key,
          recovered_snapshot: structuredClone(match.snapshot),
        },
      };
    },
  };
}
