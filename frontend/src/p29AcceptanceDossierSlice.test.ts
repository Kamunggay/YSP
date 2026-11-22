import { describe, expect, it } from 'vitest';
import {
  createP29AcceptanceDossierEngine,
  P29_CONTEXT_STORAGE_KEY,
  REQUIRED_MVP_TARGETS,
} from './p29AcceptanceDossierSlice';
import type { FinalReleaseVerdict, P29LookupResult } from './p29AcceptanceDossierSlice';

function recordAllNineDemoSteps(engine: ReturnType<typeof createP29AcceptanceDossierEngine>) {
  const titles = [
    'Chapter Setup, Signed Opening IPC & Approved Policies',
    'RF Review, Reservation, Shortage RepF, PO & Partial RM 40',
    'Signed Internal Issue & Partial Remainder Tracking',
    'SO Review, Full Invoice, Two 48h Clocks & Deposit Designation',
    'Restricted vs Unrestricted DA Lots & Interpreted Eligibility',
    'Booth Setup, 100 Checkout / 30 Sales / 70 Return & Discrepant Closeout',
    'Claims F: Booth OR + Track 1 DR, Exchanges & Funded Cancellation',
    'Variance Dual Approval Separation, Phone UI & Operations Map',
    'Connected 87-Node / 40-Branch / AC-23 & Recovery Dossier Presentation',
  ];
  for (let i = 1; i <= 9; i += 1) {
    const res = engine.recordConnectedDemoStep({
      step_number: i,
      step_title: titles[i - 1] ?? `Step ${i}`,
      connected_record_ids: [`REC-STEP-${i}-A`, `REC-STEP-${i}-B`],
      uses_disconnected_mock_build: false,
      demonstrated_by_user_id: '101',
      executed_at: `2026-11-22T09:0${i}:00Z`,
      idempotency_key: `p29-step-${i}`,
    });
    expect(res.ok).toBe(true);
  }
}

describe('p29AcceptanceDossierSlice — Connected Professor Walkthrough, Coverage Matrix & Release Verdict', () => {
  it('starts strictly unseeded with pending verification and empty checklists', () => {
    expect(P29_CONTEXT_STORAGE_KEY).toBe('ysp_p29_context');
    expect(REQUIRED_MVP_TARGETS.nodes).toBe(87);
    expect(REQUIRED_MVP_TARGETS.requirements).toBe(194);
    expect(REQUIRED_MVP_TARGETS.acceptance).toBe(35);

    const engine = createP29AcceptanceDossierEngine();
    const snap = engine.getSnapshot();

    expect(snap.demo_steps_recorded).toEqual([]);
    expect(snap.evidence_bundles).toEqual([]);
    expect(snap.defects).toEqual([]);
    expect(snap.gate_signoffs).toEqual([]);
    expect(snap.release_verdict.verdict_label).toBe('pending_verification');
    expect(snap.release_verdict.academic_demo_ready).toBe(false);
    expect(snap.release_verdict.production_release_accepted).toBe(false);
  });

  it('rejects disconnected demo builds or unlinked steps and accepts 9 connected walkthrough steps', () => {
    const engine = createP29AcceptanceDossierEngine({ chapter_id: '1' });

    const mockRejected = engine.recordConnectedDemoStep({
      step_number: 1,
      step_title: 'Opening setup',
      connected_record_ids: ['IPC-1'],
      uses_disconnected_mock_build: true,
      demonstrated_by_user_id: '101',
      executed_at: '2026-11-22T09:00:00Z',
    });
    expect(mockRejected.ok).toBe(false);
    expect(mockRejected.code).toBe('DISCONNECTED_DEMO_BUILD_FORBIDDEN');

    const unlinkedRejected = engine.recordConnectedDemoStep({
      step_number: 1,
      step_title: 'Opening setup',
      connected_record_ids: [],
      uses_disconnected_mock_build: false,
      demonstrated_by_user_id: '101',
      executed_at: '2026-11-22T09:00:00Z',
    });
    expect(unlinkedRejected.ok).toBe(false);
    expect(unlinkedRejected.code).toBe('CONNECTED_RECORD_IDS_REQUIRED');

    recordAllNineDemoSteps(engine);
    expect(engine.getSnapshot().summary.demo_steps_count).toBe(9);
  });

  it('separates academic functional demo honestly from pending AC-22/production acceptance and blocks on open critical defects', () => {
    const engine = createP29AcceptanceDossierEngine({ chapter_id: '1' });
    recordAllNineDemoSteps(engine);

    engine.recordCoverageEvidenceBundle({
      bundle_ref: 'EV-ACADEMIC-2026-11',
      environment_label: 'labeled_test_environment',
      nodes_verified: '87',
      branches_verified: '40',
      connectors_verified: '7',
      loops_verified: '6',
      narrative_verified: '35',
      ambiguities_verified: '21',
      requirements_verified: '194',
      acceptance_verified: '35',
      closure_verified: '10',
      activation_gates_passed: '4',
      settings_verified: '14',
      unit_tests_passed: '160',
      e2e_tests_passed: '33',
      ac22_recovery_passed: false,
      p27_host_readiness_passed: false,
      recorded_by_user_id: '101',
      recorded_at: '2026-11-22T09:15:00Z',
      idempotency_key: 'p29-ev-acad',
    });

    // Open critical defect blocks release & demo
    engine.logOrResolveDefect({
      defect_ref: 'DEF-CRIT-01',
      severity: 'critical',
      status: 'open',
      owning_package: 'P14',
      summary: 'Edge clock race check pending fix',
      actor_user_id: '101',
      timestamp: '2026-11-22T09:16:00Z',
    });
    const blockedByDefect = engine.evaluateFinalAcceptanceVerdict({
      target_mode: 'academic_functional_demo',
      evaluator_user_id: '101',
      evaluated_at: '2026-11-22T09:17:00Z',
    });
    expect(blockedByDefect.ok).toBe(false);
    expect(blockedByDefect.code).toBe('OPEN_CRITICAL_DEFECT_BLOCKS_RELEASE');

    // Resolve critical defect -> Academic Functional Demo passes cleanly while honestly flagging pending production gates
    engine.logOrResolveDefect({
      defect_ref: 'DEF-CRIT-01',
      severity: 'critical',
      status: 'resolved',
      owning_package: 'P14',
      summary: 'Fixed clock race in P14 and verified via test',
      actor_user_id: '101',
      timestamp: '2026-11-22T09:20:00Z',
    });

    const acadVerdict = engine.evaluateFinalAcceptanceVerdict({
      target_mode: 'academic_functional_demo',
      evaluator_user_id: '101',
      evaluated_at: '2026-11-22T09:22:00Z',
      idempotency_key: 'p29-verdict-acad',
    });
    expect(acadVerdict.ok).toBe(true);
    expect(acadVerdict.code).toBe('ACADEMIC_FUNCTIONAL_DEMO_READY');
    const verdictData = acadVerdict.data as FinalReleaseVerdict;
    expect(verdictData.academic_demo_ready).toBe(true);
    expect(verdictData.production_release_accepted).toBe(false);
    expect(verdictData.verdict_label).toBe('academic_functional_demo_only');

    // Claiming complete production release while AC-22 recovery & Head/Finance signoffs are pending fails honestly
    const prematureProd = engine.evaluateFinalAcceptanceVerdict({
      target_mode: 'complete_production_release',
      evaluator_user_id: '101',
      evaluated_at: '2026-11-22T09:25:00Z',
    });
    expect(prematureProd.ok).toBe(false);
    expect(prematureProd.code).toBe('COMPLETE_RELEASE_BLOCKED_PENDING_GATES');
  });

  it('requires distinct Head & Finance sign-offs and full readiness for production acceptance and supports lookup', () => {
    const engine = createP29AcceptanceDossierEngine({ chapter_id: '1' });
    recordAllNineDemoSteps(engine);

    engine.recordCoverageEvidenceBundle({
      bundle_ref: 'EV-PROD-CANDIDATE-2026-11',
      environment_label: 'production_candidate',
      nodes_verified: '87',
      branches_verified: '40',
      connectors_verified: '7',
      loops_verified: '6',
      narrative_verified: '35',
      ambiguities_verified: '21',
      requirements_verified: '194',
      acceptance_verified: '35',
      closure_verified: '10',
      activation_gates_passed: '11',
      settings_verified: '14',
      unit_tests_passed: '164',
      e2e_tests_passed: '33',
      ac22_recovery_passed: true,
      p27_host_readiness_passed: true,
      recorded_by_user_id: '101',
      recorded_at: '2026-11-22T10:00:00Z',
    });

    // Developer review alone blocked from production signoff
    const devBlocked = engine.recordOperationalGateSignoff({
      signoff_role: 'DEVELOPER',
      signoff_scope: 'production_release_acceptance',
      signer_user_id: '801',
      decision_note: 'Tests green on staging',
      signed_at: '2026-11-22T10:05:00Z',
    });
    expect(devBlocked.ok).toBe(false);
    expect(devBlocked.code).toBe('DEVELOPER_ALONE_CANNOT_OPEN_LIVE_OPERATIONS');

    // Chapter Head signs
    engine.recordOperationalGateSignoff({
      signoff_role: 'CHAPTER_HEAD',
      signoff_scope: 'production_release_acceptance',
      signer_user_id: '101',
      decision_note: 'Approved full operational launch readiness',
      signed_at: '2026-11-22T10:10:00Z',
    });

    // Same user trying Finance slot blocked
    const samePersonFinance = engine.recordOperationalGateSignoff({
      signoff_role: 'FINANCE',
      signoff_scope: 'production_release_acceptance',
      signer_user_id: '101',
      decision_note: 'Self-signing finance slot',
      signed_at: '2026-11-22T10:11:00Z',
    });
    expect(samePersonFinance.ok).toBe(false);
    expect(samePersonFinance.code).toBe('DISTINCT_HEAD_AND_FINANCE_SIGNERS_REQUIRED');

    // Distinct Finance officer signs
    engine.recordOperationalGateSignoff({
      signoff_role: 'FINANCE',
      signoff_scope: 'production_release_acceptance',
      signer_user_id: '102',
      decision_note: 'Financial reconciliation and OR controls signed off',
      signed_at: '2026-11-22T10:15:00Z',
    });

    const prodVerdict = engine.evaluateFinalAcceptanceVerdict({
      target_mode: 'complete_production_release',
      evaluator_user_id: '101',
      evaluated_at: '2026-11-22T10:20:00Z',
      idempotency_key: 'p29-prod-verdict',
    });
    expect(prodVerdict.ok).toBe(true);
    expect(prodVerdict.code).toBe('COMPLETE_PRODUCTION_RELEASE_ACCEPTED');
    expect((prodVerdict.data as FinalReleaseVerdict).production_release_accepted).toBe(true);

    const lookup = engine.lookupAcceptanceOperation({
      query_type: 'by_key',
      chapter_id: '1',
      idempotency_key: 'p29-prod-verdict',
    });
    expect(lookup.ok).toBe(true);
    expect((lookup.data as P29LookupResult).action_result).toBe('recovered');
  });
});
