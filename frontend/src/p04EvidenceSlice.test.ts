import { describe, expect, it } from 'vitest';
import {
  buildQuadraticBezierSvgPath,
  createP04EvidenceEngine,
  validateCanvasStrokes,
  validatePaperEvidenceCandidate,
} from './p04EvidenceSlice';
import type {
  PaperUploadCandidate,
  SignaturePoint,
  SignatureStroke,
} from './p04EvidenceSlice';

const PAPER_UPLOAD_PRESETS: Record<string, PaperUploadCandidate> = {
  valid_pdf: {
    filename: 'signed-dr-CEB-2026-0004.pdf',
    mime_type: 'application/pdf',
    byte_length: 253_952,
    magic_header: 'PDF',
    content_seed: 'dr-scan-pdf-page-1-signed-by-recipient',
  },
  valid_png: {
    filename: 'signed-isar-photo-2026-0004.png',
    mime_type: 'image/png',
    byte_length: 421_888,
    magic_header: 'PNG',
    content_seed: 'isar-mobile-photo-png-verified',
  },
  empty_file: {
    filename: 'blank-scan-0bytes.pdf',
    mime_type: 'application/pdf',
    byte_length: 0,
    magic_header: 'EMPTY',
    content_seed: '',
  },
  disguised_exe: {
    filename: 'malicious-payload.exe.pdf',
    mime_type: 'application/pdf',
    byte_length: 18_432,
    magic_header: 'EXE_DISGUISED',
    content_seed: 'MZ-pe-header-disguised-as-pdf',
  },
  oversized_scan: {
    filename: 'uncompressed-4k-scan.png',
    mime_type: 'image/png',
    byte_length: 13_002_342,
    magic_header: 'PNG',
    content_seed: 'oversized-image-exceeding-10mb-limit',
  },
};

function createSampleSignatureStrokes(): SignatureStroke[] {
  const stroke1Points: SignaturePoint[] = [
    { x: 42, y: 88, timestamp: 10 },
    { x: 64, y: 54, timestamp: 28 },
    { x: 88, y: 92, timestamp: 46 },
    { x: 118, y: 48, timestamp: 65 },
    { x: 148, y: 82, timestamp: 82 },
    { x: 182, y: 60, timestamp: 101 },
  ];
  const stroke2Points: SignaturePoint[] = [
    { x: 196, y: 68, timestamp: 130 },
    { x: 224, y: 52, timestamp: 150 },
    { x: 256, y: 76, timestamp: 170 },
    { x: 292, y: 58, timestamp: 192 },
  ];
  return [
    {
      id: 'stroke-sample-1',
      points: stroke1Points,
      smoothedSvgPath: buildQuadraticBezierSvgPath(stroke1Points),
    },
    {
      id: 'stroke-sample-2',
      points: stroke2Points,
      smoothedSvgPath: buildQuadraticBezierSvgPath(stroke2Points),
    },
  ];
}

function createTestP04Engine() {
  return createP04EvidenceEngine({
    initial_batch: {
      chapter_id: 'ch-test-01',
      chapter_name: 'Chapter 1 Test',
      source_id: '01K8A6RF000000000000000004',
      record_number: 'RF-2026-0004',
      recipient_name: 'Marco Villanueva',
      recipient_duty: 'Receiving Officer',
      handover_at: '2026-11-18T05:30:00Z',
    },
    initial_lines: [
      {
        line_id: 'rf-line-01',
        variant_id: 'var-test-01',
        sku: 'TEST-SKU-01',
        item_name: 'Test Inventory Item 1',
        unit_id: 'unit-01',
        unit_label: 'unit',
        authorized_quantity: '15.000000',
        actual_quantity: '10.000000',
      },
      {
        line_id: 'rf-line-02',
        variant_id: 'var-test-02',
        sku: 'TEST-SKU-02',
        item_name: 'Test Inventory Item 2',
        unit_id: 'unit-02',
        unit_label: 'unit',
        authorized_quantity: '20.000000',
        actual_quantity: '12.000000',
      },
    ],
  });
}

describe('p04EvidenceSlice', () => {
  it('starts cleanly with zero generated default batch data when unseeded', () => {
    const emptyEngine = createP04EvidenceEngine();
    const emptySnap = emptyEngine.getSnapshot();
    expect(emptySnap.batch.recipient_name).toBe('');
    expect(emptySnap.batch.recipient_duty).toBe('');
    expect(emptySnap.batch.record_number).toBe('');
    expect(emptySnap.batch.handover_at).toBe('');
    expect(emptySnap.batch.lines).toEqual([]);
    expect(emptySnap.binding.current_batch_hash).toBe('');
  });

  it('generates smooth quadratic Bezier paths, stages valid canvas signatures, and rejects empty or dot canvas marks (DOC-08 / TR-15)', () => {
    const sampleStrokes = createSampleSignatureStrokes();
    expect(sampleStrokes.length).toBeGreaterThanOrEqual(2);
    expect(sampleStrokes[0]?.smoothedSvgPath).toContain('M ');
    expect(sampleStrokes[0]?.smoothedSvgPath).toContain('Q ');

    const dotPath = buildQuadraticBezierSvgPath([
      { x: 10, y: 10, timestamp: 1 },
      { x: 11, y: 11, timestamp: 2 },
    ]);
    expect(dotPath).toBe('M 10.0 10.0 L 11.0 11.0');

    expect(validateCanvasStrokes([])).toMatchObject({
      valid: false,
      code: 'SIGNATURE_CANVAS_EMPTY',
    });

    const engine = createTestP04Engine();
    const emptyRes = engine.stageCanvasSignature({
      strokes: [],
      uploaded_by: 'Marco Villanueva',
    });
    expect(emptyRes.ok).toBe(false);
    expect(emptyRes.http_status).toBe(422);
    expect(emptyRes.code).toBe('SIGNATURE_CANVAS_EMPTY');

    const dotOnlyRes = engine.stageCanvasSignature({
      strokes: [
        {
          id: 'dot-only',
          points: [{ x: 20, y: 20, timestamp: 1 }],
          smoothedSvgPath: 'M 20.0 20.0 L 20.0 20.0',
        },
      ],
      uploaded_by: 'Marco Villanueva',
    });
    expect(dotOnlyRes.ok).toBe(false);
    expect(dotOnlyRes.code).toBe('SIGNATURE_CANVAS_EMPTY');

    const okRes = engine.stageCanvasSignature({
      strokes: sampleStrokes,
      uploaded_by: 'Marco Villanueva',
    });
    expect(okRes.ok).toBe(true);
    expect(okRes.http_status).toBe(201);

    const snap = engine.getSnapshot();
    expect(snap.binding.outcome).toBe('ready');
    expect(snap.binding.capture_method).toBe('canvas_signature');
    expect(snap.versions).toHaveLength(1);
    expect(snap.versions[0]?.technical_state).toBe('ready');
    expect(snap.stock_movements_posted).toBe(0);
  });

  it('validates paper upload and maintains separate file content_hash and batch acknowledged_snapshot_hash (DOC-08 / RES-12)', () => {
    const engine = createTestP04Engine();
    const res = engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.valid_pdf ?? null,
      uploaded_by: 'Elena Santos',
    });

    expect(res.ok).toBe(true);
    expect(res.http_status).toBe(201);

    const snap = engine.getSnapshot();
    expect(snap.binding.outcome).toBe('ready');
    expect(snap.binding.capture_method).toBe('paper_upload');
    expect(snap.binding.content_hash).toHaveLength(64);
    expect(snap.binding.acknowledged_snapshot_hash).toHaveLength(64);
    expect(snap.binding.content_hash).not.toBe(
      snap.binding.acknowledged_snapshot_hash
    );
    expect(snap.versions[0]?.attachments[0]?.sha256).toBe(
      snap.binding.content_hash
    );
    expect(snap.stock_movements_posted).toBe(0);
  });

  it('invalidates on-device signature on quantity or recipient change and retains superseded v1 when re-signed as v2 (ADD-AC-05 / SEC-04)', () => {
    const engine = createTestP04Engine();
    const strokes = createSampleSignatureStrokes();

    engine.stageCanvasSignature({
      strokes,
      uploaded_by: 'Marco Villanueva',
    });
    expect(engine.getSnapshot().binding.outcome).toBe('ready');

    // Change actual line quantity after signing -> mismatched (snapshot_changed)
    const qtyChangeRes = engine.updateBatch({
      lines: [{ line_id: 'rf-line-01', actual_quantity: '8' }],
    });
    expect(qtyChangeRes.code).toBe('EVIDENCE_INVALIDATED_BATCH_CHANGED');
    expect(engine.getSnapshot().binding.outcome).toBe('mismatched');
    expect(engine.getSnapshot().binding.reason).toBe('snapshot_changed');

    // Change recipient name -> mismatched (target_mismatch)
    const recipientChangeRes = engine.updateBatch({
      recipient_name: 'Ana Reyes',
    });
    expect(recipientChangeRes.code).toBe(
      'EVIDENCE_INVALIDATED_RECIPIENT_CHANGED'
    );
    expect(engine.getSnapshot().binding.outcome).toBe('mismatched');
    expect(engine.getSnapshot().binding.reason).toBe('target_mismatch');

    // Re-sign for the revised batch & recipient -> version 2, version 1 retained and superseded
    const resignRes = engine.stageCanvasSignature({
      strokes,
      uploaded_by: 'Ana Reyes',
      replacement_reason: 'Updated recipient and issued quantity',
    });
    expect(resignRes.ok).toBe(true);

    const snap = engine.getSnapshot();
    expect(snap.binding.outcome).toBe('ready');
    expect(snap.binding.version).toBe(2);
    expect(snap.versions).toHaveLength(2);
    expect(snap.versions[0]?.version).toBe(1);
    expect(snap.versions[0]?.superseded_by_version_id).toBe(
      snap.versions[1]?.version_id
    );
    expect(snap.versions[1]?.supersedes_version_id).toBe(
      snap.versions[0]?.version_id
    );
    expect(snap.versions[1]?.replacement_reason).toBe(
      'Updated recipient and issued quantity'
    );
  });

  it('invalidates paper upload when quantity changes and supersedes v1 with replacement v2 while retaining history (ADD-AC-05)', () => {
    const engine = createTestP04Engine();
    engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.valid_png ?? null,
      uploaded_by: 'Elena Santos',
    });
    expect(engine.getSnapshot().binding.outcome).toBe('ready');

    engine.updateBatch({
      lines: [{ line_id: 'rf-line-02', actual_quantity: '9' }],
    });
    expect(engine.getSnapshot().binding.outcome).toBe('mismatched');
    expect(engine.getSnapshot().binding.reason).toBe('snapshot_changed');

    const replaceRes = engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.valid_pdf ?? null,
      uploaded_by: 'Elena Santos',
      replacement_reason: 'Re-signed paper DR for adjusted quantity',
    });
    expect(replaceRes.ok).toBe(true);

    const snap = engine.getSnapshot();
    expect(snap.binding.outcome).toBe('ready');
    expect(snap.binding.version).toBe(2);
    expect(snap.versions).toHaveLength(2);
    expect(snap.versions[0]?.superseded_by_version_id).toBe(
      snap.versions[1]?.version_id
    );
    expect(snap.versions[1]?.supersedes_version_id).toBe(
      snap.versions[0]?.version_id
    );
  });

  it('rejects empty, oversized, unsupported MIME, and disguised executable uploads with HTTP 422 while preserving entered batch inputs (ADD-AC-06 / ADD-08)', () => {
    expect(validatePaperEvidenceCandidate(null)).toMatchObject({
      valid: false,
      http_status: 422,
      code: 'invalid_file_upload',
    });

    const engine = createTestP04Engine();
    engine.updateBatch({
      recipient_name: 'Elena Santos',
      lines: [{ line_id: 'rf-line-01', actual_quantity: '11' }],
    });

    const emptyRes = engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.empty_file ?? null,
      uploaded_by: 'Elena Santos',
    });
    expect(emptyRes).toMatchObject({
      ok: false,
      http_status: 422,
      code: 'file_empty',
    });

    const oversizedRes = engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.oversized_scan ?? null,
      uploaded_by: 'Elena Santos',
    });
    expect(oversizedRes).toMatchObject({
      ok: false,
      http_status: 422,
      code: 'file_too_large',
    });

    const unsupportedRes = engine.stagePaperUpload({
      candidate: {
        filename: 'notes.txt',
        mime_type: 'text/plain',
        byte_length: 1200,
        magic_header: 'PDF',
        content_seed: 'plain-text-upload',
      },
      uploaded_by: 'Elena Santos',
    });
    expect(unsupportedRes).toMatchObject({
      ok: false,
      http_status: 422,
      code: 'unsupported_media_type',
    });

    const disguisedRes = engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.disguised_exe ?? null,
      uploaded_by: 'Elena Santos',
    });
    expect(disguisedRes).toMatchObject({
      ok: false,
      http_status: 422,
      code: 'disguised_file_rejected',
    });

    const snap = engine.getSnapshot();
    expect(snap.rejected_attempts).toHaveLength(4);
    expect(snap.rejected_attempts[0]?.technical_state).toBe('quarantined');
    expect(snap.versions).toHaveLength(0);
    // Entered form state must be preserved per ADD-08
    expect(snap.batch.recipient_name).toBe('Elena Santos');
    expect(snap.batch.lines[0]?.actual_quantity).toBe('11.000000');
  });

  it('maintains DOC-08 non-posting invariant across canvas staging, paper upload, and batch edits', () => {
    const engine = createTestP04Engine();
    expect(engine.getSnapshot().stock_movements_posted).toBe(0);

    engine.stageCanvasSignature({
      strokes: createSampleSignatureStrokes(),
      uploaded_by: 'Marco Villanueva',
    });
    expect(engine.getSnapshot().stock_movements_posted).toBe(0);

    engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.valid_pdf ?? null,
      uploaded_by: 'Marco Villanueva',
      replacement_reason: 'Paper backup attached',
    });
    expect(engine.getSnapshot().stock_movements_posted).toBe(0);
  });

  it('enforces SEC-03 and TR-18 private scoped attachment retrieval rules', () => {
    const engine = createTestP04Engine();
    engine.stagePaperUpload({
      candidate: PAPER_UPLOAD_PRESETS.valid_pdf ?? null,
      uploaded_by: 'Marco Villanueva',
    });

    const snap = engine.getSnapshot();
    const attachmentId = snap.versions[0]?.attachments[0]?.attachment_id ?? null;

    expect(
      engine.checkAttachmentDownloadAccess({
        is_authenticated: false,
        caller_chapter_id: snap.chapter_id,
        has_evidence_read_duty: true,
        is_provider_only: false,
        evidence_id: snap.evidence_id,
        attachment_id: attachmentId,
      })
    ).toMatchObject({
      allowed: false,
      http_status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    });

    expect(
      engine.checkAttachmentDownloadAccess({
        is_authenticated: true,
        caller_chapter_id: 'ch-davao-99',
        has_evidence_read_duty: true,
        is_provider_only: false,
        evidence_id: snap.evidence_id,
        attachment_id: attachmentId,
      })
    ).toMatchObject({
      allowed: false,
      http_status: 403,
      code: 'MEMBERSHIP_REQUIRED',
    });

    expect(
      engine.checkAttachmentDownloadAccess({
        is_authenticated: true,
        caller_chapter_id: snap.chapter_id,
        has_evidence_read_duty: true,
        is_provider_only: true,
        evidence_id: snap.evidence_id,
        attachment_id: attachmentId,
      })
    ).toMatchObject({
      allowed: false,
      http_status: 403,
      code: 'MEMBERSHIP_REQUIRED',
    });

    expect(
      engine.checkAttachmentDownloadAccess({
        is_authenticated: true,
        caller_chapter_id: snap.chapter_id,
        has_evidence_read_duty: false,
        is_provider_only: false,
        evidence_id: snap.evidence_id,
        attachment_id: attachmentId,
      })
    ).toMatchObject({
      allowed: false,
      http_status: 403,
      code: 'DUTY_SCOPE_FORBIDDEN',
    });

    expect(
      engine.checkAttachmentDownloadAccess({
        is_authenticated: true,
        caller_chapter_id: snap.chapter_id,
        has_evidence_read_duty: true,
        is_provider_only: false,
        evidence_id: snap.evidence_id,
        attachment_id: 'missing-att-999',
      })
    ).toMatchObject({
      allowed: false,
      http_status: 404,
      code: 'not_found',
    });

    const authorized = engine.checkAttachmentDownloadAccess({
      is_authenticated: true,
      caller_chapter_id: snap.chapter_id,
      has_evidence_read_duty: true,
      is_provider_only: false,
      evidence_id: snap.evidence_id,
      attachment_id: attachmentId,
    });
    expect(authorized.allowed).toBe(true);
    expect(authorized.http_status).toBe(200);
    expect(authorized.headers?.['Cache-Control']).toBe('no-store');
  });

  it('blocks handover when evidence is unready and enforces lookup-before-retry on uncertain handover timeout (ADD-AC-06)', () => {
    const engine = createTestP04Engine();

    // Unready evidence blocks handover attempt
    const blockedUnready = engine.triggerUncertainHandoverResponse('hnd-key-01');
    expect(blockedUnready.ok).toBe(false);
    expect(blockedUnready.http_status).toBe(422);
    expect(blockedUnready.code).toBe('EVIDENCE_NOT_READY');

    // Stage valid canvas signature first
    engine.stageCanvasSignature({
      strokes: createSampleSignatureStrokes(),
      uploaded_by: 'Marco Villanueva',
    });

    // Simulate network timeout during handover
    const timeoutRes = engine.triggerUncertainHandoverResponse('hnd-key-01');
    expect(timeoutRes.ok).toBe(false);
    expect(timeoutRes.http_status).toBe(504);
    expect(timeoutRes.code).toBe('OUTCOME_UNKNOWN_LOOKUP_REQUIRED');
    expect(engine.getSnapshot().uncertain_handover_state.status).toBe(
      'lookup_required'
    );

    // Repeat attempt must be blocked until lookup executes
    const repeatBlocked = engine.triggerUncertainHandoverResponse('hnd-key-01');
    expect(repeatBlocked.ok).toBe(false);
    expect(repeatBlocked.http_status).toBe(409);
    expect(repeatBlocked.code).toBe('HANDOVER_REPEAT_BLOCKED_UNTIL_LOOKUP');
    expect(
      engine.getSnapshot().uncertain_handover_state.committed_handover_count
    ).toBe(1);

    // Recover outcome via lookup
    const recovered = engine.lookupUncertainHandoverOutcome('hnd-key-01');
    expect(recovered.ok).toBe(true);
    expect(recovered.http_status).toBe(200);
    expect(recovered.code).toBe('OPERATION_RECOVERED_COMMITTED');

    const finalSnap = engine.getSnapshot();
    expect(finalSnap.uncertain_handover_state.status).toBe(
      'recovered_committed'
    );
    expect(finalSnap.uncertain_handover_state.replayed).toBe(true);
    expect(finalSnap.uncertain_handover_state.committed_handover_count).toBe(1);
    expect(finalSnap.stock_movements_posted).toBe(0);
  });

  it('commits signed handover once per idempotency key, replays exact payload, rejects conflicting reuse, and supports ULID/key lookup', () => {
    const engine = createTestP04Engine();

    const blocked = engine.recordSignedHandover('hnd-rf-0004-01');
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('EVIDENCE_NOT_READY');

    engine.stageCanvasSignature({
      strokes: createSampleSignatureStrokes(),
      uploaded_by: 'Marco Villanueva',
    });

    const committed = engine.recordSignedHandover('hnd-rf-0004-01');
    expect(committed.ok).toBe(true);
    expect(committed.http_status).toBe(201);
    expect(committed.code).toBe('HANDOVER_COMMITTED');

    const replayed = engine.recordSignedHandover('hnd-rf-0004-01');
    expect(replayed.ok).toBe(true);
    expect(replayed.http_status).toBe(200);
    expect(replayed.code).toBe('HANDOVER_REPLAYED');

    // Lookup by idempotency key and ULID
    const byKey = engine.lookupHandoverOperation({
      query_type: 'by_key',
      value: 'hnd-rf-0004-01',
    });
    expect(byKey.ok).toBe(true);
    expect(byKey.entry?.idempotency_key).toBe('hnd-rf-0004-01');

    const opUlid = byKey.entry?.operation_ulid ?? '';
    const byUlid = engine.lookupHandoverOperation({
      query_type: 'by_ulid',
      value: opUlid,
    });
    expect(byUlid.ok).toBe(true);
    expect(byUlid.entry?.handover_id).toBe(byKey.entry?.handover_id);

    // Reusing the same idempotency key after revising the batch & re-signing must fail (422)
    engine.updateBatch({ lines: [{ line_id: 'rf-line-01', actual_quantity: '9' }] });
    engine.stageCanvasSignature({
      strokes: createSampleSignatureStrokes(),
      uploaded_by: 'Marco Villanueva',
      replacement_reason: 'Quantity revised to 9',
    });
    const conflict = engine.recordSignedHandover('hnd-rf-0004-01');
    expect(conflict.ok).toBe(false);
    expect(conflict.http_status).toBe(422);
    expect(conflict.code).toBe('IDEMPOTENCY_KEY_REUSE_CONFLICT');
  });

  it('populates handover preview dynamically from chapter inventory lines and on-demand addBatchLine without default data', () => {
    const customEngine = createP04EvidenceEngine({
      initial_lines: [
        {
          line_id: 'inv-custom-1',
          variant_id: 'var-custom-1',
          sku: 'INV-CUSTOM-01',
          item_name: 'Chapter Added Supply Item',
          unit_id: 'unit-box',
          unit_label: 'box',
          authorized_quantity: '12.000000',
          actual_quantity: '6.000000',
        },
      ],
    });
    const customSnap = customEngine.getSnapshot();
    expect(customSnap.batch.lines).toHaveLength(1);
    expect(customSnap.batch.lines[0]?.sku).toBe('INV-CUSTOM-01');
    expect(customSnap.batch.lines[0]?.item_name).toBe('Chapter Added Supply Item');

    const unseededEngine = createP04EvidenceEngine();
    expect(unseededEngine.getSnapshot().batch.lines).toHaveLength(0);
    const added = unseededEngine.addBatchLine({
      sku: 'INV-LIVE-02',
      item_name: 'Live Requisition Item',
      unit_label: 'unit',
      authorized_quantity: '15',
      actual_quantity: '10',
    });
    expect(added.ok).toBe(true);
    expect(unseededEngine.getSnapshot().batch.lines).toHaveLength(1);
    expect(unseededEngine.getSnapshot().batch.lines[0]?.item_name).toBe('Live Requisition Item');
  });
});
