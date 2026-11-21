import {
  computeBatchSnapshotHashV1,
  computeDeterministicHash,
  normalizeSixDecimalQuantity,
} from './canonicalHash';
import { formatManilaTimestamp } from './p03RecordSlice';

export type EvidencePurpose =
  | 'actual_issue'
  | 'customer_release'
  | 'opening_count'
  | 'booth_checkout'
  | 'claim_replacement';

export type BatchSourceType =
  | 'requisition'
  | 'sales_order'
  | 'opening_ipc'
  | 'booth_checkout';

export type EvidenceCaptureMethod = 'canvas_signature' | 'paper_upload';

export type EvidenceTechnicalState =
  | 'staging'
  | 'validating'
  | 'ready'
  | 'rejected'
  | 'quarantined';

export interface HandoverBatchLine {
  line_id: string;
  variant_id: string;
  sku: string;
  item_name: string;
  unit_id: string;
  unit_label: string;
  authorized_quantity: string;
  actual_quantity: string;
}

export interface SignaturePoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SignatureStroke {
  id: string;
  points: SignaturePoint[];
  smoothedSvgPath: string;
}

export type MagicHeaderKind =
  | 'PNG'
  | 'JPEG'
  | 'PDF'
  | 'EXE_DISGUISED'
  | 'HTML_DISGUISED'
  | 'EMPTY';

export interface PaperUploadCandidate {
  filename: string;
  mime_type: string;
  byte_length: number;
  magic_header: MagicHeaderKind;
  content_seed: string;
}

export interface EvidenceAttachment {
  attachment_id: string;
  filename: string;
  position: number;
  media_type: string;
  byte_length: number;
  sha256: string;
}

export interface EvidenceVersionRecord {
  evidence_id: string;
  chapter_id: string;
  target: {
    purpose: EvidencePurpose;
    record_id: string;
  };
  version_id: string;
  version: number;
  capture_method: EvidenceCaptureMethod;
  supersedes_version_id: string | null;
  superseded_by_version_id: string | null;
  technical_state: EvidenceTechnicalState;
  invalid_reason: string | null;
  uploaded_by: string;
  uploaded_at: string;
  replacement_reason: string | null;
  attachments: ReadonlyArray<EvidenceAttachment>;
  acknowledged_snapshot_hash: string;
  recipient_snapshot: string;
  stroke_count?: number;
}

export type BindingOutcome = 'ready' | 'missing' | 'invalid' | 'mismatched';

export type BindingReason =
  | 'none'
  | 'evidence_missing'
  | 'acknowledgment_missing'
  | 'unsafe_content'
  | 'target_mismatch'
  | 'snapshot_changed';

export interface EvidenceBindingState {
  binding_id: string | null;
  evidence_id: string | null;
  version_id: string | null;
  version: number | null;
  capture_method: EvidenceCaptureMethod | null;
  content_hash: string | null;
  acknowledged_snapshot_hash: string | null;
  current_batch_hash: string;
  outcome: BindingOutcome;
  reason: BindingReason;
  bound_recipient_name: string | null;
  bound_at: string | null;
}

export interface HandoverBatchPreview {
  chapter_id: string;
  chapter_name: string;
  purpose: EvidencePurpose;
  source_type: BatchSourceType;
  source_id: string;
  record_number: string;
  recipient_name: string;
  recipient_duty: string;
  handover_at: string;
  lines: ReadonlyArray<HandoverBatchLine>;
}

export interface RejectedAttemptRecord {
  attempt_id: string;
  capture_method: EvidenceCaptureMethod;
  technical_state: 'rejected' | 'quarantined';
  error_code: string;
  http_status: number;
  message: string;
  filename?: string;
  attempted_by: string;
  attempted_at: string;
}

export type UncertainHandoverStatus =
  | 'idle'
  | 'lookup_required'
  | 'recovered_committed';

export interface UncertainHandoverState {
  status: UncertainHandoverStatus;
  idempotency_key: string | null;
  operation_ulid: string | null;
  handover_id: string | null;
  acknowledged_binding_id: string | null;
  committed_handover_count: number;
  replayed: boolean;
  recovered_at: string | null;
  message: string;
}

export interface P04ActionResult {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
}

export interface DownloadAccessInput {
  is_authenticated: boolean;
  caller_chapter_id: string;
  has_evidence_read_duty: boolean;
  is_provider_only: boolean;
  evidence_id: string | null;
  attachment_id: string | null;
}

export interface DownloadAccessResult {
  allowed: boolean;
  http_status: number;
  code: string;
  message: string;
  headers?: {
    'Cache-Control': 'no-store';
    'Content-Disposition': string;
  };
}

export interface HandoverOperationSummary {
  operation_ulid: string;
  action_code: 'STAGE_EVIDENCE' | 'RECORD_SIGNED_HANDOVER';
  action_label: string;
  idempotency_key: string;
  document_reference: string;
  handover_id: string | null;
  evidence_version: number;
  payload_fingerprint: string;
  replayed: boolean;
  committed_at: string;
}

export interface HandoverLookupResult extends P04ActionResult {
  entry: HandoverOperationSummary | null;
}

export interface P04EngineSnapshot {
  chapter_id: string;
  chapter_name: string;
  evidence_id: string;
  batch: HandoverBatchPreview;
  binding: EvidenceBindingState;
  versions: ReadonlyArray<EvidenceVersionRecord>;
  rejected_attempts: ReadonlyArray<RejectedAttemptRecord>;
  uncertain_handover_state: UncertainHandoverState;
  operation_ledger: ReadonlyArray<HandoverOperationSummary>;
  stock_movements_posted: 0;
  last_action: P04ActionResult | null;
}

const ALLOWED_PAPER_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Generates a smooth SVG path using quadratic Bezier midpoint interpolation
 * per TRD TR-15 and PRD ADD-04.
 */
export function buildQuadraticBezierSvgPath(
  points: ReadonlyArray<SignaturePoint>
): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0];
  if (!first) {
    return '';
  }
  if (points.length === 1) {
    return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} L ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  }
  if (points.length === 2) {
    const second = points[1];
    if (!second) {
      return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    }
    return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} L ${second.x.toFixed(1)} ${second.y.toFixed(1)}`;
  }

  const parts: string[] = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const curr = points[i];
    const next = points[i + 1];
    if (!curr || !next) {
      continue;
    }
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    parts.push(
      `Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
    );
  }
  const last = points[points.length - 1];
  if (last) {
    parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  }
  return parts.join(' ');
}

function batchSourceToRecordKind(sourceType: BatchSourceType): string {
  switch (sourceType) {
    case 'requisition':
      return 'RF';
    case 'sales_order':
      return 'SO';
    case 'opening_ipc':
      return 'IPC';
    case 'booth_checkout':
      return 'IS_AR';
  }
}

export interface BatchSnapshotHashOptions {
  chapter_id?: string;
  material_version?: number;
  batch_id?: string;
  recipient_user_id?: string | null;
  recipient_capacity?: string;
}

/**
 * Computes the canonical ysp-batch-v1 fixed-key-order SHA-256 fingerprint over the exact batch snapshot
 * per contracts/identity-record-evidence/v1/boundary.json.
 */
export function computeBatchSnapshotHash(
  sourceType: BatchSourceType,
  sourceId: string,
  recipientName: string,
  lines: ReadonlyArray<HandoverBatchLine>,
  options?: BatchSnapshotHashOptions
): string {
  const recordKind = batchSourceToRecordKind(sourceType);
  const chapterId = options?.chapter_id ?? '';
  const recordId = sourceId.trim();

  return computeBatchSnapshotHashV1({
    chapter_id: chapterId,
    record: {
      id: recordId,
      kind: recordKind,
    },
    material_version: options?.material_version ?? 1,
    batch_id: options?.batch_id ?? recordId,
    recipient: {
      name: recipientName.trim(),
      user_id: options?.recipient_user_id ?? null,
      capacity: options?.recipient_capacity ?? '',
    },
    lines: lines.map((line) => ({
      line: {
        chapter_id: chapterId,
        record: {
          id: recordId,
          kind: recordKind,
        },
        line_id: String(line.line_id),
        line_kind: recordKind,
        variant_id: String(line.variant_id || line.line_id),
      },
      quantity: line.actual_quantity,
    })),
  });
}

export interface CanvasValidationResult {
  valid: boolean;
  code: string;
  message: string;
}

export function validateCanvasStrokes(
  strokes: ReadonlyArray<SignatureStroke>
): CanvasValidationResult {
  if (strokes.length === 0) {
    return {
      valid: false,
      code: 'SIGNATURE_CANVAS_EMPTY',
      message:
        'Signature pad is empty. Draw at least one clear stroke before staging evidence.',
    };
  }

  let totalPoints = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    for (const pt of stroke.points) {
      totalPoints += 1;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  const boundingSpan = maxX - minX + (maxY - minY);
  if (totalPoints < 3 || boundingSpan < 12) {
    return {
      valid: false,
      code: 'SIGNATURE_CANVAS_EMPTY',
      message:
        'Captured signature mark is too small or incomplete. Sign clearly before staging.',
    };
  }

  return {
    valid: true,
    code: 'OK',
    message: 'On-device canvas strokes passed client geometry checks.',
  };
}

export interface PaperValidationResult {
  valid: boolean;
  http_status: number;
  code: string;
  technical_state: 'ready' | 'rejected' | 'quarantined';
  message: string;
}

/**
 * Mirrors PaperEvidenceController::validateFile error codes and HTTP 422 semantics.
 */
export function validatePaperEvidenceCandidate(
  candidate: PaperUploadCandidate | null
): PaperValidationResult {
  if (!candidate || !candidate.filename.trim()) {
    return {
      valid: false,
      http_status: 422,
      code: 'invalid_file_upload',
      technical_state: 'rejected',
      message: 'Uploaded file is invalid or missing.',
    };
  }

  if (candidate.byte_length <= 0 || candidate.magic_header === 'EMPTY') {
    return {
      valid: false,
      http_status: 422,
      code: 'file_empty',
      technical_state: 'rejected',
      message: 'Uploaded file is empty (0 bytes).',
    };
  }

  if (candidate.byte_length > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      http_status: 422,
      code: 'file_too_large',
      technical_state: 'rejected',
      message: 'Uploaded file exceeds the maximum allowed size of 10MB.',
    };
  }

  if (!ALLOWED_PAPER_MIME_TYPES.has(candidate.mime_type)) {
    return {
      valid: false,
      http_status: 422,
      code: 'unsupported_media_type',
      technical_state: 'rejected',
      message: `File media type '${candidate.mime_type}' is not allowed. Only JPEG, PNG, and PDF are accepted.`,
    };
  }

  if (
    candidate.magic_header === 'EXE_DISGUISED' ||
    candidate.magic_header === 'HTML_DISGUISED'
  ) {
    return {
      valid: false,
      http_status: 422,
      code: 'disguised_file_rejected',
      technical_state: 'quarantined',
      message:
        'File signature (magic bytes) does not match expected JPEG, PNG, or PDF format.',
    };
  }

  return {
    valid: true,
    http_status: 201,
    code: 'OK',
    technical_state: 'ready',
    message: 'Signed paper scan validated and hashed cleanly.',
  };
}

export const CHAPTER_INVENTORY_STORAGE_KEY = 'ysp_chapter_inventory_items';

export interface P04EngineOptions {
  initial_batch?: Partial<Omit<HandoverBatchPreview, 'lines'>>;
  initial_lines?: ReadonlyArray<HandoverBatchLine>;
}

function readStoredInventoryLines(): HandoverBatchLine[] | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CHAPTER_INVENTORY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const valid = parsed.filter(
      (item): item is HandoverBatchLine =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as HandoverBatchLine).line_id === 'string' &&
        typeof (item as HandoverBatchLine).item_name === 'string' &&
        typeof (item as HandoverBatchLine).unit_label === 'string'
    );
    return valid.length > 0 ? valid.map((l) => ({ ...l })) : null;
  } catch {
    return null;
  }
}

function createInitialBatch(options?: P04EngineOptions): HandoverBatchPreview {
  const inventoryLines: HandoverBatchLine[] =
    options?.initial_lines && options.initial_lines.length > 0
      ? options.initial_lines.map((line) => ({ ...line }))
      : readStoredInventoryLines() ?? [];

  return {
    chapter_id: options?.initial_batch?.chapter_id ?? '',
    chapter_name: options?.initial_batch?.chapter_name ?? '',
    purpose: options?.initial_batch?.purpose ?? 'actual_issue',
    source_type: options?.initial_batch?.source_type ?? 'requisition',
    source_id: options?.initial_batch?.source_id ?? '',
    record_number: options?.initial_batch?.record_number ?? '',
    recipient_name: options?.initial_batch?.recipient_name ?? '',
    recipient_duty: options?.initial_batch?.recipient_duty ?? '',
    handover_at: options?.initial_batch?.handover_at ?? '',
    lines: inventoryLines,
  };
}

function computeEffectiveBatchHash(batch: HandoverBatchPreview): string {
  const hasContent =
    batch.lines.length > 0 ||
    batch.recipient_name.trim().length > 0 ||
    batch.record_number.trim().length > 0;
  if (!hasContent) {
    return '';
  }
  return computeBatchSnapshotHash(
    batch.source_type,
    batch.source_id || batch.record_number || 'unassigned',
    batch.recipient_name,
    batch.lines,
    {
      chapter_id: batch.chapter_id,
      recipient_capacity: batch.recipient_duty,
    }
  );
}

function makeUlidLikeId(counter: number): string {
  const padded = String(counter).padStart(16, '0');
  return `01K8P04EV${padded}`;
}

export function createP04EvidenceEngine(options?: P04EngineOptions) {
  const evidenceId = 'ev-01K8A6RF000000000000000004';
  let seqCounter = 100;
  let batch: HandoverBatchPreview = createInitialBatch(options);
  let versions: EvidenceVersionRecord[] = [];
  let rejectedAttempts: RejectedAttemptRecord[] = [];
  let operationLedger: HandoverOperationSummary[] = [];
  let lastAction: P04ActionResult | null = null;

  let binding: EvidenceBindingState = {
    binding_id: null,
    evidence_id: null,
    version_id: null,
    version: null,
    capture_method: null,
    content_hash: null,
    acknowledged_snapshot_hash: null,
    current_batch_hash: computeEffectiveBatchHash(batch),
    outcome: 'missing',
    reason: 'evidence_missing',
    bound_recipient_name: null,
    bound_at: null,
  };

  let uncertainHandoverState: UncertainHandoverState = {
    status: 'idle',
    idempotency_key: null,
    operation_ulid: null,
    handover_id: null,
    acknowledged_binding_id: null,
    committed_handover_count: 0,
    replayed: false,
    recovered_at: null,
    message:
      'Stage ready evidence before attempting handover. No stock movement has been posted.',
  };

  function recomputeBindingAgainstBatch() {
    const currentHash = computeEffectiveBatchHash(batch);

    if (
      !binding.binding_id ||
      !binding.acknowledged_snapshot_hash ||
      !binding.bound_recipient_name
    ) {
      binding = {
        ...binding,
        current_batch_hash: currentHash,
        outcome: 'missing',
        reason: 'evidence_missing',
      };
      return;
    }

    if (batch.recipient_name.trim() !== binding.bound_recipient_name) {
      binding = {
        ...binding,
        current_batch_hash: currentHash,
        outcome: 'mismatched',
        reason: 'target_mismatch',
      };
      return;
    }

    if (currentHash !== binding.acknowledged_snapshot_hash) {
      binding = {
        ...binding,
        current_batch_hash: currentHash,
        outcome: 'mismatched',
        reason: 'snapshot_changed',
      };
      return;
    }

    binding = {
      ...binding,
      current_batch_hash: currentHash,
      outcome: 'ready',
      reason: 'none',
    };
  }

  function appendReadyVersion(params: {
    capture_method: EvidenceCaptureMethod;
    uploaded_by: string;
    replacement_reason?: string;
    filename: string;
    media_type: string;
    byte_length: number;
    content_hash: string;
    stroke_count?: number;
  }): EvidenceVersionRecord {
    seqCounter += 1;
    const versionNumber = versions.length + 1;
    const versionId = `ver-${makeUlidLikeId(seqCounter)}`;
    const attachmentId = `att-${makeUlidLikeId(seqCounter)}`;
    const bindingId = `bnd-${makeUlidLikeId(seqCounter)}`;
    const nowIso = new Date().toISOString();

    const prevLatest = versions[versions.length - 1] ?? null;
    if (prevLatest) {
      versions = versions.map((item) =>
        item.version_id === prevLatest.version_id
          ? { ...item, superseded_by_version_id: versionId }
          : item
      );
    }

    const snapshotHash = computeEffectiveBatchHash(batch);

    const record: EvidenceVersionRecord = {
      evidence_id: evidenceId,
      chapter_id: batch.chapter_id,
      target: {
        purpose: batch.purpose,
        record_id: batch.source_id || batch.record_number || 'unassigned',
      },
      version_id: versionId,
      version: versionNumber,
      capture_method: params.capture_method,
      supersedes_version_id: prevLatest ? prevLatest.version_id : null,
      superseded_by_version_id: null,
      technical_state: 'ready',
      invalid_reason: null,
      uploaded_by: params.uploaded_by,
      uploaded_at: nowIso,
      replacement_reason: prevLatest
        ? params.replacement_reason?.trim() || 'Batch or evidence updated'
        : null,
      attachments: [
        {
          attachment_id: attachmentId,
          filename: params.filename,
          position: 1,
          media_type: params.media_type,
          byte_length: params.byte_length,
          sha256: params.content_hash,
        },
      ],
      acknowledged_snapshot_hash: snapshotHash,
      recipient_snapshot: batch.recipient_name.trim(),
      ...(params.stroke_count !== undefined
        ? { stroke_count: params.stroke_count }
        : {}),
    };

    versions = [...versions, record];

    binding = {
      binding_id: bindingId,
      evidence_id: evidenceId,
      version_id: versionId,
      version: versionNumber,
      capture_method: params.capture_method,
      content_hash: params.content_hash,
      acknowledged_snapshot_hash: snapshotHash,
      current_batch_hash: snapshotHash,
      outcome: 'ready',
      reason: 'none',
      bound_recipient_name: batch.recipient_name.trim(),
      bound_at: nowIso,
    };

    operationLedger = [
      ...operationLedger,
      {
        operation_ulid: `01K8P04OP${String(seqCounter).padStart(16, '0')}`,
        action_code: 'STAGE_EVIDENCE',
        action_label: 'Stage Evidence',
        idempotency_key: `stage-evidence-v${versionNumber}`,
        document_reference: batch.record_number || 'UNASSIGNED',
        handover_id: null,
        evidence_version: versionNumber,
        payload_fingerprint: `${params.content_hash}:${snapshotHash}`,
        replayed: false,
        committed_at: nowIso,
      },
    ];

    return record;
  }

  function updateBatch(input: {
    record_number?: string;
    chapter_name?: string;
    handover_at?: string;
    recipient_name?: string;
    recipient_duty?: string;
    lines?: ReadonlyArray<{ line_id: string; actual_quantity: string }>;
  }): P04ActionResult {
    const nextRecordNumber =
      input.record_number !== undefined ? input.record_number : batch.record_number;
    const nextChapterName =
      input.chapter_name !== undefined ? input.chapter_name : batch.chapter_name;
    const nextHandoverAt =
      input.handover_at !== undefined ? input.handover_at : batch.handover_at;
    const nextRecipient =
      input.recipient_name !== undefined
        ? input.recipient_name
        : batch.recipient_name;
    const nextDuty =
      input.recipient_duty !== undefined
        ? input.recipient_duty
        : batch.recipient_duty;

    const lineUpdates = new Map(
      (input.lines ?? []).map((l) => [l.line_id, l.actual_quantity])
    );

    const nextLines = batch.lines.map((line) => {
      const updatedQty = lineUpdates.get(line.line_id);
      if (updatedQty === undefined) {
        return line;
      }
      return {
        ...line,
        actual_quantity: normalizeSixDecimalQuantity(updatedQty),
      };
    });

    batch = {
      ...batch,
      record_number: nextRecordNumber,
      chapter_name: nextChapterName,
      handover_at: nextHandoverAt,
      recipient_name: nextRecipient,
      recipient_duty: nextDuty,
      lines: nextLines,
    };

    recomputeBindingAgainstBatch();

    if (binding.outcome === 'mismatched') {
      lastAction = {
        ok: true,
        http_status: 200,
        code:
          binding.reason === 'target_mismatch'
            ? 'EVIDENCE_INVALIDATED_RECIPIENT_CHANGED'
            : 'EVIDENCE_INVALIDATED_BATCH_CHANGED',
        message:
          binding.reason === 'target_mismatch'
            ? 'Recipient changed after signing. Prior acknowledgment is invalidated; capture fresh evidence.'
            : 'Batch quantity changed after signing. Prior acknowledgment cannot authorize revised batch; capture fresh evidence.',
      };
      return lastAction;
    }

    lastAction = {
      ok: true,
      http_status: 200,
      code: 'BATCH_PREVIEW_UPDATED',
      message: 'Handover batch preview updated. No stock movement has been posted.',
    };
    return lastAction;
  }

  function addBatchLine(input: {
    sku: string;
    item_name: string;
    unit_label: string;
    authorized_quantity: string;
    actual_quantity: string;
    line_id?: string;
    variant_id?: string;
  }): P04ActionResult {
    const trimmedName = input.item_name.trim();
    const trimmedSku = input.sku.trim();
    if (!trimmedName || !trimmedSku) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'INVENTORY_LINE_INVALID',
        message: 'Enter both an inventory SKU and item name before adding a batch line.',
      };
      return lastAction;
    }
    seqCounter += 1;
    const newLine: HandoverBatchLine = {
      line_id: input.line_id ?? `inv-line-${seqCounter}`,
      variant_id: input.variant_id ?? `inv-var-${seqCounter}`,
      sku: trimmedSku.toUpperCase(),
      item_name: trimmedName,
      unit_id: `unit-${input.unit_label.trim().toLowerCase() || 'unit'}`,
      unit_label: input.unit_label.trim() || 'unit',
      authorized_quantity: normalizeSixDecimalQuantity(input.authorized_quantity),
      actual_quantity: normalizeSixDecimalQuantity(input.actual_quantity),
    };
    batch = {
      ...batch,
      lines: [...batch.lines, newLine],
    };
    recomputeBindingAgainstBatch();
    lastAction = {
      ok: true,
      http_status: 201,
      code: 'INVENTORY_LINE_ADDED',
      message: `Added "${newLine.item_name}" to handover batch preview. No stock movement posted.`,
    };
    return lastAction;
  }

  function stageCanvasSignature(input: {
    strokes: ReadonlyArray<SignatureStroke>;
    uploaded_by: string;
    replacement_reason?: string;
  }): P04ActionResult {
    if (!batch.recipient_name.trim()) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'RECIPIENT_REQUIRED',
        message: 'Authorized recipient name is required before signing.',
      };
      return lastAction;
    }

    const validation = validateCanvasStrokes(input.strokes);
    if (!validation.valid) {
      seqCounter += 1;
      const attempt: RejectedAttemptRecord = {
        attempt_id: `att-rej-${seqCounter}`,
        capture_method: 'canvas_signature',
        technical_state: 'rejected',
        error_code: validation.code,
        http_status: 422,
        message: validation.message,
        attempted_by: input.uploaded_by,
        attempted_at: new Date().toISOString(),
      };
      rejectedAttempts = [attempt, ...rejectedAttempts];
      lastAction = {
        ok: false,
        http_status: 422,
        code: validation.code,
        message: validation.message,
      };
      return lastAction;
    }

    const contentHash = computeDeterministicHash({
      kind: 'png-canvas-export',
      strokes: input.strokes.map((s) => s.smoothedSvgPath),
      point_count: input.strokes.reduce((acc, s) => acc + s.points.length, 0),
    });

    const approxPngBytes =
      4_200 + input.strokes.reduce((acc, s) => acc + s.points.length * 48, 0);

    const record = appendReadyVersion({
      capture_method: 'canvas_signature',
      uploaded_by: input.uploaded_by,
      ...(input.replacement_reason !== undefined
        ? { replacement_reason: input.replacement_reason }
        : {}),
      filename: batch.record_number
        ? `signature-${batch.record_number}-v${versions.length + 1}.png`
        : `signature-v${versions.length + 1}.png`,
      media_type: 'image/png',
      byte_length: approxPngBytes,
      content_hash: contentHash,
      stroke_count: input.strokes.length,
    });

    lastAction = {
      ok: true,
      http_status: 201,
      code: 'CANVAS_EVIDENCE_READY',
      message: `On-device signature v${record.version} staged, validated, and bound to exact batch (${record.acknowledged_snapshot_hash.slice(0, 10)}…). Zero stock movements posted.`,
    };
    return lastAction;
  }

  function stagePaperUpload(input: {
    candidate: PaperUploadCandidate | null;
    uploaded_by: string;
    replacement_reason?: string;
  }): P04ActionResult {
    if (!batch.recipient_name.trim()) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'RECIPIENT_REQUIRED',
        message:
          'Authorized recipient name is required before uploading signed paper evidence.',
      };
      return lastAction;
    }

    const validation = validatePaperEvidenceCandidate(input.candidate);
    if (!validation.valid || !input.candidate) {
      seqCounter += 1;
      const attempt: RejectedAttemptRecord = {
        attempt_id: `att-rej-${seqCounter}`,
        capture_method: 'paper_upload',
        technical_state:
          validation.technical_state === 'quarantined'
            ? 'quarantined'
            : 'rejected',
        error_code: validation.code,
        http_status: validation.http_status,
        message: validation.message,
        ...(input.candidate?.filename
          ? { filename: input.candidate.filename }
          : {}),
        attempted_by: input.uploaded_by,
        attempted_at: new Date().toISOString(),
      };
      rejectedAttempts = [attempt, ...rejectedAttempts];
      lastAction = {
        ok: false,
        http_status: validation.http_status,
        code: validation.code,
        message: validation.message,
      };
      return lastAction;
    }

    const contentHash = computeDeterministicHash({
      kind: 'signed-paper-bytes',
      filename: input.candidate.filename,
      mime_type: input.candidate.mime_type,
      byte_length: input.candidate.byte_length,
      magic_header: input.candidate.magic_header,
      content_seed: input.candidate.content_seed,
    });

    const record = appendReadyVersion({
      capture_method: 'paper_upload',
      uploaded_by: input.uploaded_by,
      ...(input.replacement_reason !== undefined
        ? { replacement_reason: input.replacement_reason }
        : {}),
      filename: input.candidate.filename,
      media_type: input.candidate.mime_type,
      byte_length: input.candidate.byte_length,
      content_hash: contentHash,
    });

    lastAction = {
      ok: true,
      http_status: 201,
      code: 'PAPER_EVIDENCE_READY',
      message: `Signed paper scan v${record.version} validated, stored privately, and bound to exact batch. Zero stock movements posted.`,
    };
    return lastAction;
  }

  function checkAttachmentDownloadAccess(
    input: DownloadAccessInput
  ): DownloadAccessResult {
    if (!input.is_authenticated) {
      return {
        allowed: false,
        http_status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        message:
          'Caller identity or active session is required to retrieve evidence attachments.',
      };
    }

    if (input.is_provider_only || input.caller_chapter_id !== batch.chapter_id) {
      return {
        allowed: false,
        http_status: 403,
        code: 'MEMBERSHIP_REQUIRED',
        message:
          'Access denied: provider authority or cross-chapter links cannot retrieve private evidence.',
      };
    }

    if (!input.has_evidence_read_duty) {
      return {
        allowed: false,
        http_status: 403,
        code: 'DUTY_SCOPE_FORBIDDEN',
        message:
          'Access denied: current duty scope lacks evidence.read permission for this record.',
      };
    }

    const matchingAttachment =
      input.evidence_id === evidenceId
        ? versions
            .flatMap((v) => v.attachments)
            .find((att) => att.attachment_id === input.attachment_id)
        : undefined;

    if (!matchingAttachment) {
      return {
        allowed: false,
        http_status: 404,
        code: 'not_found',
        message: 'Requested evidence record or attachment does not exist.',
      };
    }

    return {
      allowed: true,
      http_status: 200,
      code: 'OK',
      message: `Scoped inline stream authorized for ${matchingAttachment.filename} (${matchingAttachment.media_type}).`,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="attachment-${matchingAttachment.attachment_id}"`,
      },
    };
  }

  function triggerUncertainHandoverResponse(
    idempotencyKey: string
  ): P04ActionResult {
    recomputeBindingAgainstBatch();
    if (binding.outcome !== 'ready' || !binding.binding_id) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'EVIDENCE_NOT_READY',
        message:
          'Posting blocked: valid ready evidence bound to the exact batch is required before attempting handover.',
      };
      return lastAction;
    }

    if (uncertainHandoverState.status === 'lookup_required') {
      lastAction = {
        ok: false,
        http_status: 409,
        code: 'HANDOVER_REPEAT_BLOCKED_UNTIL_LOOKUP',
        message:
          'Repeat handover blocked: outcome of prior attempt is uncertain. Look up the original operation before retrying.',
      };
      return lastAction;
    }

    const key = idempotencyKey.trim() || `handover-${batch.record_number}-01`;
    seqCounter += 1;
    uncertainHandoverState = {
      status: 'lookup_required',
      idempotency_key: key,
      operation_ulid: `01K8P04OP${String(seqCounter).padStart(16, '0')}`,
      handover_id: `hnd-${batch.record_number}-01`,
      acknowledged_binding_id: binding.binding_id,
      committed_handover_count: 1,
      replayed: false,
      recovered_at: null,
      message:
        'Network timeout during handover confirmation. Physical goods may already be handed over — look up existing operation result before any retry.',
    };

    lastAction = {
      ok: false,
      http_status: 504,
      code: 'OUTCOME_UNKNOWN_LOOKUP_REQUIRED',
      message: uncertainHandoverState.message,
    };
    return lastAction;
  }

  function lookupUncertainHandoverOutcome(
    idempotencyKey: string
  ): P04ActionResult {
    const trimmed = idempotencyKey.trim();
    if (
      !uncertainHandoverState.idempotency_key ||
      (trimmed && trimmed !== uncertainHandoverState.idempotency_key)
    ) {
      lastAction = {
        ok: false,
        http_status: 404,
        code: 'OPERATION_NOT_FOUND',
        message:
          'No matching handover operation found for the supplied idempotency key in this chapter.',
      };
      return lastAction;
    }

    const recoveredAt = new Date().toISOString();
    uncertainHandoverState = {
      ...uncertainHandoverState,
      status: 'recovered_committed',
      replayed: true,
      recovered_at: recoveredAt,
      message: `Recovered existing committed handover ${uncertainHandoverState.handover_id} (ULID ${uncertainHandoverState.operation_ulid}). Handover count remains ${uncertainHandoverState.committed_handover_count} — no duplicate movement created.`,
    };

    lastAction = {
      ok: true,
      http_status: 200,
      code: 'OPERATION_RECOVERED_COMMITTED',
      message: uncertainHandoverState.message,
    };
    return lastAction;
  }

  function recordSignedHandover(idempotencyKey: string): P04ActionResult {
    recomputeBindingAgainstBatch();
    if (binding.outcome !== 'ready' || !binding.binding_id || !binding.version_id || binding.version === null) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'EVIDENCE_NOT_READY',
        message:
          'Handover blocked: stage valid ready evidence matching the exact current batch before recording.',
      };
      return lastAction;
    }

    const trimmedKey = idempotencyKey.trim();
    if (!trimmedKey) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Enter or generate a handover idempotency key before recording signed handover.',
      };
      return lastAction;
    }
    const fingerprint = `${binding.version_id}|${binding.acknowledged_snapshot_hash}|${batch.recipient_name.trim()}`;
    const existing = operationLedger.find(
      (entry) => entry.action_code === 'RECORD_SIGNED_HANDOVER' && entry.idempotency_key === trimmedKey
    );

    if (existing) {
      if (existing.payload_fingerprint !== fingerprint) {
        lastAction = {
          ok: false,
          http_status: 422,
          code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
          message:
            'Idempotency key already bound to a different batch snapshot. Issue a new idempotency key for revised quantities or recipient.',
        };
        return lastAction;
      }

      uncertainHandoverState = {
        status: 'recovered_committed',
        idempotency_key: existing.idempotency_key,
        operation_ulid: existing.operation_ulid,
        handover_id: existing.handover_id,
        acknowledged_binding_id: binding.binding_id,
        committed_handover_count: uncertainHandoverState.committed_handover_count || 1,
        replayed: true,
        recovered_at: existing.committed_at,
        message: `Replayed committed signed handover ${existing.handover_id} (ULID ${existing.operation_ulid}) with zero duplicate postings.`,
      };

      lastAction = {
        ok: true,
        http_status: 200,
        code: 'HANDOVER_REPLAYED',
        message: uncertainHandoverState.message,
      };
      return lastAction;
    }

    seqCounter += 1;
    const operationUlid = `01K8P04OP${String(seqCounter).padStart(16, '0')}`;
    const docRef = batch.record_number.trim() || 'UNASSIGNED';
    const handoverId = `hnd-${docRef.toLowerCase()}-${String(seqCounter).slice(-2)}`;
    const committedAt = new Date().toISOString();

    const newEntry: HandoverOperationSummary = {
      operation_ulid: operationUlid,
      action_code: 'RECORD_SIGNED_HANDOVER',
      action_label: 'Signed Handover',
      idempotency_key: trimmedKey,
      document_reference: docRef,
      handover_id: handoverId,
      evidence_version: binding.version,
      payload_fingerprint: fingerprint,
      replayed: false,
      committed_at: committedAt,
    };
    operationLedger = [...operationLedger, newEntry];

    uncertainHandoverState = {
      status: 'recovered_committed',
      idempotency_key: trimmedKey,
      operation_ulid: operationUlid,
      handover_id: handoverId,
      acknowledged_binding_id: binding.binding_id,
      committed_handover_count: uncertainHandoverState.committed_handover_count + 1,
      replayed: false,
      recovered_at: committedAt,
      message: `Recorded signed handover ${handoverId} (ULID ${operationUlid}) bound to Evidence v${binding.version}.`,
    };

    lastAction = {
      ok: true,
      http_status: 201,
      code: 'HANDOVER_COMMITTED',
      message: uncertainHandoverState.message,
    };
    return lastAction;
  }

  function lookupHandoverOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    value: string;
  }): HandoverLookupResult {
    const trimmed = input.value.trim();
    if (!trimmed) {
      lastAction = {
        ok: false,
        http_status: 422,
        code: 'LOOKUP_VALUE_REQUIRED',
        message: 'Enter an idempotency key or transaction reference (ULID) to look up.',
      };
      return { ...lastAction, entry: null };
    }

    const match =
      input.query_type === 'by_key'
        ? operationLedger.find((entry) => entry.idempotency_key === trimmed)
        : operationLedger.find((entry) => entry.operation_ulid === trimmed);

    if (!match) {
      lastAction = {
        ok: false,
        http_status: 404,
        code: 'OPERATION_NOT_FOUND',
        message: 'No matching operation found within the active chapter scope.',
      };
      return { ...lastAction, entry: null };
    }

    uncertainHandoverState = {
      status: 'recovered_committed',
      idempotency_key: match.idempotency_key,
      operation_ulid: match.operation_ulid,
      handover_id: match.handover_id,
      acknowledged_binding_id: binding.binding_id,
      committed_handover_count: uncertainHandoverState.committed_handover_count,
      replayed: true,
      recovered_at: match.committed_at,
      message: `Recovered committed ${match.action_label} for ${match.document_reference} · Evidence v${match.evidence_version} (ULID ${match.operation_ulid}).`,
    };

    lastAction = {
      ok: true,
      http_status: 200,
      code: 'OPERATION_RECOVERED_COMMITTED',
      message: uncertainHandoverState.message,
    };
    return { ...lastAction, entry: { ...match } };
  }

  function getSnapshot(): P04EngineSnapshot {
    return {
      chapter_id: batch.chapter_id,
      chapter_name: batch.chapter_name,
      evidence_id: evidenceId,
      batch: {
        ...batch,
        lines: batch.lines.map((line) => ({ ...line })),
      },
      binding: { ...binding },
      versions: versions.map((v) => ({
        ...v,
        target: { ...v.target },
        attachments: v.attachments.map((att) => ({ ...att })),
      })),
      rejected_attempts: rejectedAttempts.map((r) => ({ ...r })),
      uncertain_handover_state: { ...uncertainHandoverState },
      operation_ledger: operationLedger.map((entry) => ({ ...entry })),
      stock_movements_posted: 0,
      last_action: lastAction ? { ...lastAction } : null,
    };
  }

  return {
    getSnapshot,
    updateBatch,
    addBatchLine,
    stageCanvasSignature,
    stagePaperUpload,
    checkAttachmentDownloadAccess,
    triggerUncertainHandoverResponse,
    lookupUncertainHandoverOutcome,
    recordSignedHandover,
    lookupHandoverOperation,
  };
}

export { formatManilaTimestamp };
