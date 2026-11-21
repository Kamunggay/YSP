import {
  computeDeterministicHash,
  computeOpeningMaterialHashV1,
  normalizeSixDecimalQuantity,
  serializeOpeningMaterialV1,
} from './canonicalHash';

export {
  computeDeterministicHash,
  computeOpeningMaterialHashV1,
  normalizeSixDecimalQuantity,
  serializeOpeningMaterialV1,
};

export type DutyCode =
  | 'COMMITTEE_REQUESTER'
  | 'RF_APPROVER'
  | 'SALES_OFFICER'
  | 'SALES_REVIEWER'
  | 'FINANCE'
  | 'INVENTORY'
  | 'PURCHASING'
  | 'BUDGET_APPROVER'
  | 'RECEIVING'
  | 'DISPATCH'
  | 'BOOTH_CUSTODIAN'
  | 'BOOTH_CASHIER'
  | 'INDEPENDENT_REVIEWER'
  | 'CHAPTER_HEAD';

export type RecordKind = 'CONFIG' | 'IPC' | 'RM' | 'RF' | 'SO' | 'IS_AR' | 'CUSTOMER_DR';

export interface RecordReference {
  id: string;
  kind: RecordKind;
}

export type ApprovalAxisState = 'submitted' | 'approved' | 'returned' | 'requires_review';
export type ProgressAxisState = 'not_started' | 'partial' | 'complete';
export type ExceptionAxisState = 'none' | 'open' | 'resolved';

export interface RecordState {
  reference: RecordReference;
  row_version: number;
  material_version: number;
  states: {
    approval: ApprovalAxisState;
    progress: ProgressAxisState;
    exception: ExceptionAxisState;
  };
}

export interface MaterialReference {
  chapter_id: string;
  record: RecordReference;
  material_version: number;
  material_hash: string;
}

export interface LineReference {
  chapter_id: string;
  record: RecordReference;
  line_id: string;
  line_kind: 'IPC' | 'RM' | 'IS_AR' | 'CUSTOMER_DR';
  variant_id: string;
}

export interface UnitQuantity {
  value: string;
  quantity_scale: number;
}

export interface Attribution {
  chapter_id: string;
  user_id: string;
  membership_id: string;
  duty_grant_id: string;
  duty_code: DutyCode;
  actor_name: string;
  chapter_name: string;
  captured_at: string;
}

export interface PolicyReference {
  chapter_id: string;
  policy_id: string;
  policy_version_id: string;
  version_no: number;
  settings_hash: string;
  approval: MaterialReference;
  effective_from: string;
  effective_until: string | null;
}

export interface DraftPayload {
  purpose: string;
  cutoff_at: string;
  counted_at: string;
  counted_quantity: string;
  unit_valuation: string;
  valuation_basis: string;
  external_reference?: string | undefined;
}

export interface DraftRecord {
  chapter_id: string;
  reference: RecordReference;
  row_version: number;
  material_version: null;
  approval_state: 'draft';
  draft_payload: DraftPayload;
}

export type ReviewDecisionType = 'approve' | 'return' | 'hold' | 'reject' | 'cancel';

export interface ReviewDecision {
  id: string;
  target: MaterialReference;
  policy: PolicyReference;
  decision: ReviewDecisionType;
  actor: Attribution;
  decided_at: string;
  reason: string;
}

export interface OpeningLine {
  reference: LineReference;
  location_id: string;
  custody_assignment_id: string;
  condition_code: string;
  counted_quantity: UnitQuantity;
  unit_valuation: string;
  valuation_basis: string;
  restriction_version_id: string;
}

export interface OpeningMaterial {
  chapter_id: string;
  record: RecordReference;
  cutoff_at: string;
  counted_at: string;
  purpose: string;
  external_reference?: string | undefined;
  policy_version_id: string;
  counters: ReadonlyArray<{ user_id: string; is_regular_custodian: boolean }>;
  lines: ReadonlyArray<OpeningLine>;
}

export interface VersionedSource {
  state: RecordState;
  target: MaterialReference;
  previous_version: MaterialReference | null;
  material: OpeningMaterial;
  prepared_by: Attribution;
  policy: PolicyReference;
  decisions: ReadonlyArray<ReviewDecision>;
}

export interface OperationIdentity {
  operation_id: string | null;
  action_code: string | null;
  idempotency_key: string | null;
}

export type OperationOutcome = 'committed' | 'rejected' | 'unknown';

export interface Operation {
  identity: OperationIdentity;
  outcome: OperationOutcome;
  committed_at: string | null;
  replayed: boolean;
}

export interface FieldFeedback {
  path: string;
  code: string;
  message: string;
}

export interface BlockingReason {
  code: string;
  message: string;
}

export type NextActionCode =
  | 'correct_input'
  | 'refresh_record'
  | 'lookup_operation'
  | 'reconcile_activity'
  | 'request_access'
  | 'review_record';

export interface NextAction {
  code: NextActionCode;
  label: string;
}

export interface BusinessTimes {
  occurred_at: string | null;
  verified_at: string | null;
  entered_at: string | null;
  posted_at: string | null;
}

export interface ActionResult {
  schema_version: '1.0';
  chapter_id: string | null;
  action_result: 'success' | 'blocked' | 'stale' | 'forbidden' | 'uncertain';
  operation: Operation | null;
  record: RecordState | null;
  field_feedback: ReadonlyArray<FieldFeedback>;
  blocking_reason: BlockingReason | null;
  permitted_next_actions: ReadonlyArray<NextAction>;
  input_policy: 'preserve' | 'may_clear';
  lookup_state: null | 'not_attempted' | 'pending_or_not_visible' | 'unavailable';
  document_number?: string | undefined;
}

export type OperationLookupQuery =
  | { kind: 'by_key'; chapter_id: string; action_code: string; idempotency_key: string }
  | { kind: 'by_id'; chapter_id: string; operation_id: string };

export interface SaveDraftInput {
  chapter_id?: string | undefined;
  payload: DraftPayload;
}

export interface SubmitMaterialInput {
  chapter_id?: string | undefined;
  idempotency_key: string;
  expected_row_version: number;
  expected_material_version?: number | null | undefined;
  purpose: string;
  cutoff_at: string;
  counted_at: string;
  counted_quantity: string;
  unit_valuation: string;
  valuation_basis: string;
  external_reference?: string | undefined;
  simulate_lost_response?: boolean | undefined;
}

export interface RecordReviewDecisionInput {
  chapter_id?: string | undefined;
  idempotency_key: string;
  expected_row_version: number;
  expected_material_version: number;
  decision: ReviewDecisionType;
  actor_id: string;
  actor_name: string;
  duty_code: DutyCode;
  reason: string;
}

export interface StoredOperationSummary {
  operation_id: string;
  action_code: string;
  idempotency_key: string;
  chapter_id: string;
  outcome: OperationOutcome;
  committed_at: string;
  document_number?: string | undefined;
}

export interface P03PersonaOption {
  key: string;
  user_id: string;
  actor_name: string;
  duty_code: DutyCode;
  membership_id: string;
  duty_grant_id: string;
  label: string;
}

export interface P03EngineOptions {
  chapter_id?: string | undefined;
  chapter_name?: string | undefined;
  record?: RecordReference | undefined;
  policy_effective?: boolean | undefined;
  policy_reference?: PolicyReference | null | undefined;
  initial_draft_payload?: Partial<DraftPayload> | undefined;
  personas?: ReadonlyArray<P03PersonaOption> | undefined;
}

export interface P03EngineSnapshot {
  chapter_id: string;
  chapter_name: string;
  record: RecordReference;
  parent_reference: {
    kind: RecordKind;
    document_number: string;
    label: string;
  } | null;
  document_number: string | null;
  server_row_version: number;
  server_material_version: number | null;
  policy_effective: boolean;
  policy_reference: PolicyReference | null;
  personas: ReadonlyArray<P03PersonaOption>;
  draft: DraftRecord;
  returned_draft_payload: DraftPayload | null;
  current_source: VersionedSource | null;
  version_history: ReadonlyArray<VersionedSource>;
  business_times: BusinessTimes;
  operation_ledger: ReadonlyArray<StoredOperationSummary>;
}

/**
 * Formats a UTC instant string for Asia/Manila (UTC+8) display while keeping
 * the underlying 6-decimal UTC instant string untouched elsewhere.
 */
export function formatManilaTimestamp(utcInstant: string | null): string {
  if (!utcInstant) {
    return 'Not yet established';
  }
  const parsed = new Date(utcInstant);
  if (Number.isNaN(parsed.getTime())) {
    return utcInstant;
  }
  try {
    const formatted = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(parsed);
    return `${formatted} (Asia/Manila)`;
  } catch {
    return utcInstant;
  }
}

function nowUtcSixDecimal(): string {
  const iso = new Date().toISOString();
  return iso.replace(/\.\d{3}Z$/, (ms) => `${ms.slice(0, 4)}000Z`);
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function createMonotonicUlidGenerator() {
  let seq = 1;
  return (): string => {
    seq += 1;
    const base = '01K8A6J0A00000000000';
    let suffix = '';
    let n = seq;
    for (let i = 0; i < 6; i += 1) {
      const charIndex = n % 32;
      suffix = (ULID_ALPHABET[charIndex] ?? '0') + suffix;
      n = Math.floor(n / 32);
    }
    return `${base}${suffix}`;
  };
}

export const P03_CONTEXT_STORAGE_KEY = 'ysp_p03_context';

function readStoredP03Context(): P03EngineOptions | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(P03_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as P03EngineOptions;
  } catch {
    return null;
  }
}

const VALID_IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const VALID_DECIMAL_RE = /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;

function createEmptyDraftPayload(): DraftPayload {
  return {
    purpose: '',
    cutoff_at: '',
    counted_at: '',
    counted_quantity: '',
    unit_valuation: '',
    valuation_basis: '',
    external_reference: '',
  };
}

interface StoredOperationEntry {
  action_code: string;
  idempotency_key: string;
  chapter_id: string;
  payload_fingerprint: string;
  result: ActionResult;
}

export interface P03RecordEngine {
  getSnapshot: () => P03EngineSnapshot;
  getVersionTimeline: () => ReadonlyArray<VersionedSource>;
  setPolicyEffective: (effective: boolean) => P03EngineSnapshot;
  simulateConcurrentUpdate: (kind: 'row' | 'material') => P03EngineSnapshot;
  saveDraft: (input: SaveDraftInput) => ActionResult;
  submitMaterial: (input: SubmitMaterialInput) => ActionResult;
  recordReviewDecision: (input: RecordReviewDecisionInput) => ActionResult;
  lookupOperation: (query: OperationLookupQuery) => ActionResult;
  attemptGenericStockOrMoneyPost: (chapterId?: string) => ActionResult;
}

function makeForbiddenResult(message: string): ActionResult {
  return {
    schema_version: '1.0',
    chapter_id: null,
    action_result: 'forbidden',
    operation: null,
    record: null,
    field_feedback: [],
    blocking_reason: {
      code: 'FORBIDDEN_CHAPTER_SCOPE',
      message,
    },
    permitted_next_actions: [
      { code: 'request_access', label: 'Switch to an authorized chapter membership' },
    ],
    input_policy: 'preserve',
    lookup_state: null,
  };
}

function cloneSource(src: VersionedSource): VersionedSource {
  return {
    ...src,
    state: {
      ...src.state,
      reference: { ...src.state.reference },
      states: { ...src.state.states },
    },
    target: {
      ...src.target,
      record: { ...src.target.record },
    },
    previous_version: src.previous_version
      ? { ...src.previous_version, record: { ...src.previous_version.record } }
      : null,
    material: {
      ...src.material,
      record: { ...src.material.record },
      counters: src.material.counters.map((c) => ({ ...c })),
      lines: src.material.lines.map((l) => ({
        ...l,
        reference: { ...l.reference, record: { ...l.reference.record } },
        counted_quantity: { ...l.counted_quantity },
      })),
    },
    prepared_by: { ...src.prepared_by },
    policy: {
      ...src.policy,
      approval: { ...src.policy.approval, record: { ...src.policy.approval.record } },
    },
    decisions: src.decisions.map((d) => ({
      ...d,
      target: { ...d.target, record: { ...d.target.record } },
      policy: {
        ...d.policy,
        approval: { ...d.policy.approval, record: { ...d.policy.approval.record } },
      },
      actor: { ...d.actor },
    })),
  };
}

function cloneActionResult(res: ActionResult, replayedOverride?: boolean): ActionResult {
  return {
    ...res,
    operation: res.operation
      ? {
          ...res.operation,
          identity: { ...res.operation.identity },
          replayed: replayedOverride ?? res.operation.replayed,
        }
      : null,
    record: res.record
      ? {
          ...res.record,
          reference: { ...res.record.reference },
          states: { ...res.record.states },
        }
      : null,
    field_feedback: res.field_feedback.map((f) => ({ ...f })),
    blocking_reason: res.blocking_reason ? { ...res.blocking_reason } : null,
    permitted_next_actions: res.permitted_next_actions.map((a) => ({ ...a })),
  };
}

/**
 * Creates a self-contained P03 record, version history, review decision, and durable
 * idempotent operation engine faithful to YSP Transport & Identity/Record contracts.
 */
export function createP03RecordEngine(options?: P03EngineOptions): P03RecordEngine {
  const stored = options === undefined ? readStoredP03Context() : null;
  const resolved: P03EngineOptions = options ?? stored ?? {};
  const nextUlid = createMonotonicUlidGenerator();

  const activeChapterId = resolved.chapter_id ?? '';
  const activeChapterName = resolved.chapter_name ?? '';
  const recordRef: RecordReference = resolved.record
    ? { ...resolved.record }
    : { id: '', kind: 'IPC' };
  const activePersonas: P03PersonaOption[] = resolved.personas
    ? resolved.personas.map((p) => ({ ...p }))
    : [];
  const policyRef: PolicyReference | null = resolved.policy_reference ?? null;

  let serverRowVersion = 1;
  let serverMaterialVersion: number | null = null;
  let policyEffective = resolved.policy_effective ?? false;
  let issuedDocumentNumber: string | null = null;
  let sequenceCounter = 0;
  let decisionCounter = 200;

  let draft: DraftRecord = {
    chapter_id: activeChapterId,
    reference: { ...recordRef },
    row_version: serverRowVersion,
    material_version: null,
    approval_state: 'draft',
    draft_payload: {
      ...createEmptyDraftPayload(),
      ...(resolved.initial_draft_payload ?? {}),
    },
  };

  let returnedDraftPayload: DraftPayload | null = null;
  let currentSource: VersionedSource | null = null;
  const archivedVersions: VersionedSource[] = [];

  const businessTimes: BusinessTimes = {
    occurred_at: null,
    verified_at: null,
    entered_at: null,
    posted_at: null,
  };

  const operationsByKey = new Map<string, StoredOperationEntry>();
  const operationsById = new Map<string, StoredOperationEntry>();

  function buildScopedKey(chapterId: string, actionCode: string, key: string): string {
    return `${chapterId}::${actionCode}::${key}`;
  }

  function resolvePolicySnapshot(): PolicyReference {
    if (policyRef) {
      return policyRef;
    }
    return {
      chapter_id: activeChapterId,
      policy_id: '',
      policy_version_id: '',
      version_no: 1,
      settings_hash: '',
      approval: {
        chapter_id: activeChapterId,
        record: { id: '', kind: 'CONFIG' },
        material_version: 1,
        material_hash: '',
      },
      effective_from: nowUtcSixDecimal(),
      effective_until: null,
    };
  }

  function currentRecordState(): RecordState | null {
    if (!currentSource) {
      return null;
    }
    return {
      reference: { ...recordRef },
      row_version: serverRowVersion,
      material_version: currentSource.target.material_version,
      states: { ...currentSource.state.states },
    };
  }

  function getSnapshot(): P03EngineSnapshot {
    const ledger: StoredOperationSummary[] = [];
    for (const entry of operationsById.values()) {
      const opId = entry.result.operation?.identity.operation_id;
      const committedAt = entry.result.operation?.committed_at;
      if (opId && committedAt) {
        ledger.push({
          operation_id: opId,
          action_code: entry.action_code,
          idempotency_key: entry.idempotency_key,
          chapter_id: entry.chapter_id,
          outcome: entry.result.operation?.outcome ?? 'committed',
          committed_at: committedAt,
          document_number: entry.result.document_number,
        });
      }
    }

    return {
      chapter_id: activeChapterId,
      chapter_name: activeChapterName,
      record: { ...recordRef },
      parent_reference: policyRef
        ? {
            kind: 'CONFIG',
            document_number: policyRef.policy_id,
            label: `Policy ${policyRef.policy_id} v${policyRef.version_no}`,
          }
        : null,
      document_number: issuedDocumentNumber,
      server_row_version: serverRowVersion,
      server_material_version: serverMaterialVersion,
      policy_effective: policyEffective,
      policy_reference: policyRef,
      personas: activePersonas.map((p) => ({ ...p })),
      draft: {
        ...draft,
        reference: { ...draft.reference },
        draft_payload: { ...draft.draft_payload },
      },
      returned_draft_payload: returnedDraftPayload ? { ...returnedDraftPayload } : null,
      current_source: currentSource ? cloneSource(currentSource) : null,
      version_history: getVersionTimeline(),
      business_times: { ...businessTimes },
      operation_ledger: ledger,
    };
  }

  function getVersionTimeline(): ReadonlyArray<VersionedSource> {
    const timeline = archivedVersions.map(cloneSource);
    if (currentSource) {
      timeline.push(cloneSource(currentSource));
    }
    return timeline;
  }

  function setPolicyEffective(effective: boolean): P03EngineSnapshot {
    policyEffective = effective;
    return getSnapshot();
  }

  function simulateConcurrentUpdate(kind: 'row' | 'material'): P03EngineSnapshot {
    serverRowVersion += 1;
    if (currentSource) {
      currentSource.state.row_version = serverRowVersion;
      if (kind === 'material') {
        const nextMat = currentSource.target.material_version + 1;
        const nextPurpose = `${currentSource.material.purpose} [peer edit v${nextMat}]`;
        archivedVersions.push(cloneSource(currentSource));
        const nextMaterial: OpeningMaterial = {
          ...currentSource.material,
          purpose: nextPurpose,
        };
        const nextHash = computeOpeningMaterialHashV1(nextMaterial);
        const prevRef: MaterialReference = { ...currentSource.target };
        serverMaterialVersion = nextMat;
        currentSource = {
          ...currentSource,
          state: {
            reference: { ...recordRef },
            row_version: serverRowVersion,
            material_version: nextMat,
            states: {
              approval: 'requires_review',
              progress: currentSource.state.states.progress,
              exception: 'none',
            },
          },
          target: {
            chapter_id: activeChapterId,
            record: { ...recordRef },
            material_version: nextMat,
            material_hash: nextHash,
          },
          previous_version: prevRef,
          material: nextMaterial,
          decisions: [],
        };
      }
    }
    return getSnapshot();
  }

  function saveDraft(input: SaveDraftInput): ActionResult {
    const chapterId = input.chapter_id ?? activeChapterId;
    if (activeChapterId && chapterId !== activeChapterId) {
      return makeForbiddenResult('Cannot save draft outside the authorized chapter.');
    }

    serverRowVersion += 1;
    const savedAt = nowUtcSixDecimal();
    const cleanedPayload: DraftPayload = {
      purpose: input.payload.purpose,
      cutoff_at: input.payload.cutoff_at,
      counted_at: input.payload.counted_at,
      counted_quantity: input.payload.counted_quantity,
      unit_valuation: input.payload.unit_valuation,
      valuation_basis: input.payload.valuation_basis,
      ...(input.payload.external_reference !== undefined
        ? { external_reference: input.payload.external_reference }
        : draft.draft_payload.external_reference !== undefined
          ? { external_reference: draft.draft_payload.external_reference }
          : {}),
    };

    if (currentSource === null) {
      draft = {
        chapter_id: activeChapterId,
        reference: { ...recordRef },
        row_version: serverRowVersion,
        material_version: null,
        approval_state: 'draft',
        draft_payload: cleanedPayload,
      };
    } else {
      currentSource.state.row_version = serverRowVersion;
      draft = {
        ...draft,
        row_version: serverRowVersion,
        draft_payload: cleanedPayload,
      };
      returnedDraftPayload = cleanedPayload;
    }

    businessTimes.entered_at = savedAt;
    const opId = nextUlid();

    return {
      schema_version: '1.0',
      chapter_id: activeChapterId || null,
      action_result: 'success',
      operation: {
        identity: {
          operation_id: opId,
          action_code: 'ipc.save_draft',
          idempotency_key: null,
        },
        outcome: 'committed',
        committed_at: savedAt,
        replayed: false,
      },
      record: currentSource
        ? {
            reference: { ...recordRef },
            row_version: serverRowVersion,
            material_version: currentSource.target.material_version,
            states: { ...currentSource.state.states },
          }
        : {
            reference: { ...recordRef },
            row_version: serverRowVersion,
            material_version: 1,
            states: {
              approval: 'requires_review',
              progress: 'not_started',
              exception: 'none',
            },
          },
      field_feedback: [],
      blocking_reason: null,
      permitted_next_actions: [
        { code: 'review_record', label: 'Submit complete material snapshot when ready' },
      ],
      input_policy: 'may_clear',
      lookup_state: null,
    };
  }

  function submitMaterial(input: SubmitMaterialInput): ActionResult {
    const chapterId = input.chapter_id ?? activeChapterId;
    if (!activeChapterId) {
      return makeForbiddenResult('Authorized chapter context and active policy are required before submitting.');
    }
    if (chapterId !== activeChapterId) {
      return makeForbiddenResult('Access denied for requested chapter context.');
    }

    const actionCode = 'ipc.submit_material';
    const trimmedKey = input.idempotency_key.trim();
    const fieldFeedback: FieldFeedback[] = [];

    if (!VALID_IDEMPOTENCY_RE.test(trimmedKey)) {
      fieldFeedback.push({
        path: '/idempotency_key',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Provide an opaque key (1–128 chars: A–Z, 0–9, ., _, :, -).',
      });
    }
    if (!input.purpose.trim()) {
      fieldFeedback.push({
        path: '/purpose',
        code: 'REQUIRED_FIELD',
        message: 'Opening count purpose is required for an immutable material snapshot.',
      });
    }
    if (!VALID_DECIMAL_RE.test(input.counted_quantity.trim()) || Number(input.counted_quantity) <= 0) {
      fieldFeedback.push({
        path: '/counted_quantity',
        code: 'INVALID_QUANTITY',
        message: 'Counted quantity must be a positive decimal (up to 6 decimal places).',
      });
    }
    if (!VALID_DECIMAL_RE.test(input.unit_valuation.trim())) {
      fieldFeedback.push({
        path: '/unit_valuation',
        code: 'INVALID_VALUATION',
        message: 'Unit valuation must be a valid non-negative PHP decimal.',
      });
    }
    if (!input.valuation_basis.trim()) {
      fieldFeedback.push({
        path: '/valuation_basis',
        code: 'REQUIRED_FIELD',
        message: 'Valuation basis explanation is required.',
      });
    }

    if (fieldFeedback.length > 0) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: currentRecordState(),
        field_feedback: fieldFeedback,
        blocking_reason: {
          code: 'INPUT_VALIDATION_FAILED',
          message: 'Complete all required material fields before publishing an immutable snapshot.',
        },
        permitted_next_actions: [
          { code: 'correct_input', label: 'Fix highlighted fields and resubmit' },
        ],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    const normalizedQty = normalizeSixDecimalQuantity(input.counted_quantity);
    const normalizedVal = normalizeSixDecimalQuantity(input.unit_valuation);

    const payloadFingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      purpose: input.purpose.trim(),
      cutoff_at: input.cutoff_at.trim(),
      counted_at: input.counted_at.trim(),
      counted_quantity: normalizedQty,
      unit_valuation: normalizedVal,
      valuation_basis: input.valuation_basis.trim(),
      ...(input.external_reference !== undefined
        ? { external_reference: input.external_reference.trim() }
        : {}),
      expected_row_version: input.expected_row_version,
      expected_material_version: input.expected_material_version ?? null,
    });

    const scopedKey = buildScopedKey(chapterId, actionCode, trimmedKey);
    const existing = operationsByKey.get(scopedKey);
    if (existing) {
      if (existing.payload_fingerprint !== payloadFingerprint) {
        return {
          schema_version: '1.0',
          chapter_id: activeChapterId,
          action_result: 'blocked',
          operation: null,
          record: currentRecordState(),
          field_feedback: [
            {
              path: '/idempotency_key',
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message: `Key "${trimmedKey}" is already bound to a different payload.`,
            },
          ],
          blocking_reason: {
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message:
              'Changed payload cannot reuse the same Idempotency-Key. Generate a fresh key for new edits or inspect the prior operation.',
          },
          permitted_next_actions: [
            { code: 'lookup_operation', label: 'Inspect original operation for this key' },
            { code: 'correct_input', label: 'Generate a new idempotency key for revised input' },
          ],
          input_policy: 'preserve',
          lookup_state: null,
        };
      }
      return cloneActionResult(existing.result, true);
    }

    if (!policyEffective) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: currentRecordState(),
        field_feedback: [],
        blocking_reason: {
          code: 'POLICY_NOT_EFFECTIVE',
          message:
            'Approved chapter policy is missing or not effective. Draft saving remains allowed while submission is blocked.',
        },
        permitted_next_actions: [
          { code: 'review_record', label: 'Ensure approved chapter setup policy is effective' },
        ],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (
      currentSource !== null &&
      input.expected_material_version !== currentSource.target.material_version
    ) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'stale',
        operation: null,
        record: currentRecordState(),
        field_feedback: [],
        blocking_reason: {
          code: 'STALE_MATERIAL_VERSION',
          message: `Material changed on server (expected v${input.expected_material_version ?? 'null'}, current v${currentSource.target.material_version}). Compare your preserved draft before resubmitting.`,
        },
        permitted_next_actions: [
          { code: 'refresh_record', label: 'Preserve draft and compare current server state' },
        ],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (input.expected_row_version !== serverRowVersion) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'stale',
        operation: null,
        record: currentRecordState(),
        field_feedback: [],
        blocking_reason: {
          code: 'STALE_ROW_VERSION',
          message: `Record progress changed (expected row v${input.expected_row_version}, current row v${serverRowVersion}). Compare your preserved draft.`,
        },
        permitted_next_actions: [
          { code: 'refresh_record', label: 'Sync Expected Versions & Review' },
        ],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (issuedDocumentNumber === null) {
      sequenceCounter += 1;
      issuedDocumentNumber = `IPC-2026-${String(sequenceCounter).padStart(4, '0')}`;
    }

    if (currentSource !== null) {
      archivedVersions.push(cloneSource(currentSource));
    }

    const isRevision = currentSource !== null;
    const nextMaterialVersion = (currentSource?.target.material_version ?? 0) + 1;
    serverRowVersion += 1;
    serverMaterialVersion = nextMaterialVersion;

    const resolvedExternalRef =
      input.external_reference?.trim() ||
      draft.draft_payload.external_reference?.trim() ||
      '';

    const committedAt = nowUtcSixDecimal();
    const resolvedPolicy = resolvePolicySnapshot();
    const preparerPersona =
      activePersonas.find((p) => p.duty_code === 'RECEIVING') ?? activePersonas[0];
    const effectiveCountedAt = input.counted_at.trim() || committedAt;
    const effectiveCutoffAt = input.cutoff_at.trim() || committedAt;
    const material: OpeningMaterial = {
      chapter_id: activeChapterId,
      record: { ...recordRef },
      cutoff_at: effectiveCutoffAt,
      counted_at: effectiveCountedAt,
      purpose: input.purpose.trim(),
      external_reference: resolvedExternalRef,
      policy_version_id: resolvedPolicy.policy_version_id,
      counters: preparerPersona
        ? [{ user_id: preparerPersona.user_id, is_regular_custodian: true }]
        : [],
      lines: [
        {
          reference: {
            chapter_id: activeChapterId,
            record: { ...recordRef },
            line_id: '501',
            line_kind: 'IPC',
            variant_id: '71',
          },
          location_id: '81',
          custody_assignment_id: '82',
          condition_code: 'usable',
          counted_quantity: {
            value: normalizedQty,
            quantity_scale: 0,
          },
          unit_valuation: normalizedVal,
          valuation_basis: input.valuation_basis.trim(),
          restriction_version_id: '83',
        },
      ],
    };

    const materialHash = computeOpeningMaterialHashV1(material);
    const nextTarget: MaterialReference = {
      chapter_id: activeChapterId,
      record: { ...recordRef },
      material_version: nextMaterialVersion,
      material_hash: materialHash,
    };

    const nextState: RecordState = {
      reference: { ...recordRef },
      row_version: serverRowVersion,
      material_version: nextMaterialVersion,
      states: {
        approval: isRevision ? 'requires_review' : 'submitted',
        progress: currentSource?.state.states.progress ?? 'not_started',
        exception: 'none',
      },
    };

    currentSource = {
      state: nextState,
      target: nextTarget,
      previous_version: currentSource ? { ...currentSource.target } : null,
      material,
      prepared_by: {
        chapter_id: activeChapterId,
        user_id: preparerPersona?.user_id ?? '',
        membership_id: preparerPersona?.membership_id ?? '',
        duty_grant_id: preparerPersona?.duty_grant_id ?? '',
        duty_code: preparerPersona?.duty_code ?? 'RECEIVING',
        actor_name: preparerPersona?.actor_name ?? '',
        chapter_name: activeChapterName,
        captured_at: committedAt,
      },
      policy: resolvedPolicy,
      decisions: [],
    };

    const savedPayload: DraftPayload = {
      purpose: material.purpose,
      cutoff_at: input.cutoff_at.trim(),
      counted_at: input.counted_at.trim(),
      counted_quantity: normalizedQty,
      unit_valuation: normalizedVal,
      valuation_basis: input.valuation_basis.trim(),
      external_reference: resolvedExternalRef,
    };
    draft = {
      ...draft,
      row_version: serverRowVersion,
      draft_payload: savedPayload,
    };
    returnedDraftPayload = null;

    businessTimes.occurred_at = material.counted_at;
    businessTimes.entered_at = committedAt;
    businessTimes.verified_at = null;
    businessTimes.posted_at = null;

    const opId = nextUlid();
    const committedResult: ActionResult = {
      schema_version: '1.0',
      chapter_id: activeChapterId,
      action_result: 'success',
      operation: {
        identity: {
          operation_id: opId,
          action_code: actionCode,
          idempotency_key: trimmedKey,
        },
        outcome: 'committed',
        committed_at: committedAt,
        replayed: false,
      },
      record: {
        ...nextState,
        reference: { ...nextState.reference },
        states: { ...nextState.states },
      },
      field_feedback: [],
      blocking_reason: null,
      permitted_next_actions: [
        { code: 'review_record', label: 'Proceed to independent Chapter Head / Finance review' },
      ],
      input_policy: 'may_clear',
      lookup_state: null,
      document_number: issuedDocumentNumber,
    };

    const entry: StoredOperationEntry = {
      action_code: actionCode,
      idempotency_key: trimmedKey,
      chapter_id: chapterId,
      payload_fingerprint: payloadFingerprint,
      result: committedResult,
    };
    operationsByKey.set(scopedKey, entry);
    operationsById.set(opId, entry);

    if (input.simulate_lost_response) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'uncertain',
        operation: {
          identity: {
            operation_id: null,
            action_code: actionCode,
            idempotency_key: trimmedKey,
          },
          outcome: 'unknown',
          committed_at: null,
          replayed: false,
        },
        record: null,
        field_feedback: [],
        blocking_reason: {
          code: 'LOOKUP_UNAVAILABLE',
          message:
            'Commit-before-dispatch transport timeout. Preserve the attempt, payload, and key; run scoped lookup before any retry.',
        },
        permitted_next_actions: [
          { code: 'lookup_operation', label: 'Check this chapter and action using the original key' },
          { code: 'reconcile_activity', label: 'Preserve and reconcile any actual physical activity' },
        ],
        input_policy: 'preserve',
        lookup_state: 'unavailable',
      };
    }

    return cloneActionResult(committedResult);
  }

  function recordReviewDecision(input: RecordReviewDecisionInput): ActionResult {
    const chapterId = input.chapter_id ?? activeChapterId;
    if (!activeChapterId || chapterId !== activeChapterId) {
      return makeForbiddenResult('Access denied for requested chapter context.');
    }

    if (!input.actor_name.trim() || !input.actor_id.trim()) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: currentRecordState(),
        field_feedback: [
          {
            path: '/actor_id',
            code: 'REVIEWER_REQUIRED',
            message: 'Select an authorized reviewer identity before recording a decision.',
          },
        ],
        blocking_reason: {
          code: 'REVIEWER_REQUIRED',
          message: 'An authorized acting reviewer identity is required before recording a decision.',
        },
        permitted_next_actions: [{ code: 'correct_input', label: 'Select reviewer identity' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    const actionCode = 'ipc.record_review';
    const trimmedKey = input.idempotency_key.trim();

    if (!VALID_IDEMPOTENCY_RE.test(trimmedKey)) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: currentRecordState(),
        field_feedback: [
          {
            path: '/idempotency_key',
            code: 'INVALID_IDEMPOTENCY_KEY',
            message: 'Provide a valid opaque Idempotency-Key for this review decision.',
          },
        ],
        blocking_reason: {
          code: 'INPUT_VALIDATION_FAILED',
          message: 'Invalid idempotency key on review decision.',
        },
        permitted_next_actions: [{ code: 'correct_input', label: 'Fix idempotency key' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    const payloadFingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      decision: input.decision,
      actor_id: input.actor_id,
      duty_code: input.duty_code,
      reason: input.reason.trim(),
      expected_row_version: input.expected_row_version,
      expected_material_version: input.expected_material_version,
    });

    const scopedKey = buildScopedKey(chapterId, actionCode, trimmedKey);
    const existing = operationsByKey.get(scopedKey);
    if (existing) {
      if (existing.payload_fingerprint !== payloadFingerprint) {
        return {
          schema_version: '1.0',
          chapter_id: activeChapterId,
          action_result: 'blocked',
          operation: null,
          record: currentRecordState(),
          field_feedback: [],
          blocking_reason: {
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'Review Idempotency-Key was already used with a different decision payload.',
          },
          permitted_next_actions: [
            { code: 'lookup_operation', label: 'Inspect original review operation' },
          ],
          input_policy: 'preserve',
          lookup_state: null,
        };
      }
      return cloneActionResult(existing.result, true);
    }

    if (currentSource === null) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: null,
        field_feedback: [],
        blocking_reason: {
          code: 'NO_MATERIAL_SNAPSHOT',
          message: 'Submit an immutable material snapshot before recording review decisions.',
        },
        permitted_next_actions: [{ code: 'review_record', label: 'Submit material first' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (!input.reason.trim()) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'blocked',
        operation: null,
        record: currentRecordState(),
        field_feedback: [
          {
            path: '/reason',
            code: 'REASON_REQUIRED',
            message: 'Provide a clear reason for this review decision.',
          },
        ],
        blocking_reason: {
          code: 'REASON_REQUIRED',
          message: 'Every append-only review decision requires an explicit reason.',
        },
        permitted_next_actions: [{ code: 'correct_input', label: 'Enter review reason' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (input.expected_material_version !== currentSource.target.material_version) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'stale',
        operation: null,
        record: currentRecordState(),
        field_feedback: [],
        blocking_reason: {
          code: 'STALE_MATERIAL_VERSION',
          message: `Material changed to v${currentSource.target.material_version}. Review the latest material snapshot before deciding.`,
        },
        permitted_next_actions: [{ code: 'refresh_record', label: 'Refresh to current version' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (input.expected_row_version !== serverRowVersion) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'stale',
        operation: null,
        record: currentRecordState(),
        field_feedback: [],
        blocking_reason: {
          code: 'STALE_ROW_VERSION',
          message: `Row version advanced to v${serverRowVersion}. Sync versions before recording this decision.`,
        },
        permitted_next_actions: [{ code: 'refresh_record', label: 'Sync Expected Versions & Review' }],
        input_policy: 'preserve',
        lookup_state: null,
      };
    }

    if (input.decision === 'approve') {
      if (input.actor_id === currentSource.prepared_by.user_id) {
        return {
          schema_version: '1.0',
          chapter_id: activeChapterId,
          action_result: 'blocked',
          operation: null,
          record: currentRecordState(),
          field_feedback: [],
          blocking_reason: {
            code: 'SELF_APPROVAL_FORBIDDEN',
            message: 'Preparer cannot self-approve their own submission (DOC-04 / GOV-05).',
          },
          permitted_next_actions: [
            { code: 'request_access', label: 'Sign or assign an independent Chapter Head / Finance actor' },
          ],
          input_policy: 'preserve',
          lookup_state: null,
        };
      }

      const alreadyApprovedBySamePerson = currentSource.decisions.some(
        (d) => d.decision === 'approve' && d.actor.user_id === input.actor_id
      );
      if (alreadyApprovedBySamePerson) {
        return {
          schema_version: '1.0',
          chapter_id: activeChapterId,
          action_result: 'blocked',
          operation: null,
          record: currentRecordState(),
          field_feedback: [],
          blocking_reason: {
            code: 'DUPLICATE_APPROVER_IDENTITY',
            message:
              'One user identity cannot satisfy multiple required approval slots even when granted multiple duties.',
          },
          permitted_next_actions: [
            { code: 'request_access', label: 'Select a distinct second officer identity' },
          ],
          input_policy: 'preserve',
          lookup_state: null,
        };
      }
    }

    const decidedAt = nowUtcSixDecimal();
    decisionCounter += 1;
    const newDecision: ReviewDecision = {
      id: String(decisionCounter),
      target: { ...currentSource.target, record: { ...currentSource.target.record } },
      policy: resolvePolicySnapshot(),
      decision: input.decision,
      actor: {
        chapter_id: activeChapterId,
        user_id: input.actor_id,
        membership_id: `${input.actor_id}1`,
        duty_grant_id: `${input.actor_id}2`,
        duty_code: input.duty_code,
        actor_name: input.actor_name,
        chapter_name: activeChapterName,
        captured_at: decidedAt,
      },
      decided_at: decidedAt,
      reason: input.reason.trim(),
    };

    const nextDecisions = [...currentSource.decisions, newDecision];
    serverRowVersion += 1;
    draft = {
      ...draft,
      row_version: serverRowVersion,
    };

    let nextApprovalState = currentSource.state.states.approval;
    let nextExceptionState = currentSource.state.states.exception;

    if (input.decision === 'return') {
      nextApprovalState = 'returned';
      returnedDraftPayload = { ...draft.draft_payload };
    } else if (input.decision === 'hold') {
      nextApprovalState = 'requires_review';
      nextExceptionState = 'open';
    } else if (input.decision === 'reject' || input.decision === 'cancel') {
      nextApprovalState = 'returned';
      nextExceptionState = 'open';
    } else if (input.decision === 'approve') {
      const headApprover = nextDecisions.find(
        (d) => d.decision === 'approve' && d.actor.duty_code === 'CHAPTER_HEAD'
      );
      const financeApprover = nextDecisions.find(
        (d) => d.decision === 'approve' && d.actor.duty_code === 'FINANCE'
      );
      if (
        headApprover &&
        financeApprover &&
        headApprover.actor.user_id !== financeApprover.actor.user_id
      ) {
        nextApprovalState = 'approved';
        nextExceptionState = 'none';
        businessTimes.verified_at = decidedAt;
      }
    }

    currentSource = {
      ...currentSource,
      state: {
        reference: { ...recordRef },
        row_version: serverRowVersion,
        material_version: currentSource.target.material_version,
        states: {
          approval: nextApprovalState,
          progress: currentSource.state.states.progress,
          exception: nextExceptionState,
        },
      },
      decisions: nextDecisions,
    };

    const opId = nextUlid();
    const committedResult: ActionResult = {
      schema_version: '1.0',
      chapter_id: activeChapterId,
      action_result: 'success',
      operation: {
        identity: {
          operation_id: opId,
          action_code: actionCode,
          idempotency_key: trimmedKey,
        },
        outcome: 'committed',
        committed_at: decidedAt,
        replayed: false,
      },
      record: {
        ...currentSource.state,
        reference: { ...currentSource.state.reference },
        states: { ...currentSource.state.states },
      },
      field_feedback: [],
      blocking_reason: null,
      permitted_next_actions: [
        { code: 'review_record', label: 'Review updated state and linked decision history' },
      ],
      input_policy: 'may_clear',
      lookup_state: null,
      document_number: issuedDocumentNumber ?? undefined,
    };

    const entry: StoredOperationEntry = {
      action_code: actionCode,
      idempotency_key: trimmedKey,
      chapter_id: chapterId,
      payload_fingerprint: payloadFingerprint,
      result: committedResult,
    };
    operationsByKey.set(scopedKey, entry);
    operationsById.set(opId, entry);

    return cloneActionResult(committedResult);
  }

  function lookupOperation(query: OperationLookupQuery): ActionResult {
    if (!activeChapterId || query.chapter_id !== activeChapterId) {
      return makeForbiddenResult(
        'Cross-chapter or unauthorized operation lookup is strictly redacted.'
      );
    }

    let entry: StoredOperationEntry | undefined;
    if (query.kind === 'by_key') {
      entry = operationsByKey.get(
        buildScopedKey(query.chapter_id, query.action_code, query.idempotency_key.trim())
      );
    } else {
      entry = operationsById.get(query.operation_id.trim());
    }

    if (!entry) {
      return {
        schema_version: '1.0',
        chapter_id: activeChapterId,
        action_result: 'uncertain',
        operation: null,
        record: null,
        field_feedback: [],
        blocking_reason: {
          code: 'OPERATION_NOT_FOUND',
          message:
            'No committed or rejected durable operation matched that chapter-scoped selector.',
        },
        permitted_next_actions: [
          { code: 'lookup_operation', label: 'Verify original action code, key, or ULID' },
          { code: 'reconcile_activity', label: 'Confirm physical facts before submitting again' },
        ],
        input_policy: 'preserve',
        lookup_state: 'pending_or_not_visible',
      };
    }

    return cloneActionResult(entry.result, true);
  }

  function attemptGenericStockOrMoneyPost(chapterId = activeChapterId): ActionResult {
    if (!activeChapterId || chapterId !== activeChapterId) {
      return makeForbiddenResult('Access denied for requested chapter context.');
    }

    return {
      schema_version: '1.0',
      chapter_id: activeChapterId,
      action_result: 'blocked',
      operation: null,
      record: currentRecordState(),
      field_feedback: [],
      blocking_reason: {
        code: 'GENERIC_POSTING_FORBIDDEN',
        message: 'No generic registry operation can post stock or money (P03 invariant).',
      },
      permitted_next_actions: [
        {
          code: 'review_record',
          label: 'Use owning Inventory/Receiving or Finance participant after P06/P13',
        },
      ],
      input_policy: 'preserve',
      lookup_state: null,
    };
  }

  return {
    getSnapshot,
    getVersionTimeline,
    setPolicyEffective,
    simulateConcurrentUpdate,
    saveDraft,
    submitMaterial,
    recordReviewDecision,
    lookupOperation,
    attemptGenericStockOrMoneyPost,
  };
}
