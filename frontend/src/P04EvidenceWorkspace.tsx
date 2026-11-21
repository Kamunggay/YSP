import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import {
  buildQuadraticBezierSvgPath,
  createP04EvidenceEngine,
  formatManilaTimestamp,
} from './p04EvidenceSlice';
import type {
  EvidenceBindingState,
  EvidenceVersionRecord,
  HandoverLookupResult,
  MagicHeaderKind,
  P04ActionResult,
  P04EngineSnapshot,
  PaperUploadCandidate,
  SignaturePoint,
  SignatureStroke,
} from './p04EvidenceSlice';

type P04TabId = 'capture' | 'guard' | 'history';
type CaptureMode = 'canvas' | 'upload';

interface P04EvidenceWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard: () => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

function copyTextSafe(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => {
      fallbackCopyText(value);
    });
  } else {
    fallbackCopyText(value);
  }
}

function fallbackCopyText(value: string) {
  if (typeof document === 'undefined') return;
  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore restricted clipboard errors
  }
  document.body.removeChild(textArea);
}

function formatByteSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTwoDecimalUnits(rawSixDecimal: string, unitLabel: string): string {
  const num = Number(rawSixDecimal);
  if (!Number.isFinite(num)) return `${rawSixDecimal} ${unitLabel}`;
  const formatted = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted} ${unitLabel}(s)`;
}

function detectMagicHeaderFromBytes(bytes: Uint8Array, byteLength: number): MagicHeaderKind {
  if (byteLength === 0 || bytes.length === 0) {
    return 'EMPTY';
  }
  const asAscii = String.fromCharCode(...bytes.slice(0, 8));
  if (asAscii.startsWith('%PDF-')) {
    return 'PDF';
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'PNG';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG';
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return 'EXE_DISGUISED';
  }
  return 'HTML_DISGUISED';
}

function matchesEvidenceSearch(version: EvidenceVersionRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const verLabel = `evidence v${version.version}`;
  const formalVerLabel = `evidence version ${version.version}`;
  const shortVer = `v${version.version}`;
  const methodLabel =
    version.capture_method === 'canvas_signature' ? 'on-device canvas' : 'signed paper upload';
  const uploader = version.uploaded_by.toLowerCase();
  const recipient = version.recipient_snapshot.toLowerCase();
  const batchHash = version.acknowledged_snapshot_hash.toLowerCase();
  const reason = (version.replacement_reason ?? '').toLowerCase();

  return (
    verLabel.includes(normalizedQuery) ||
    formalVerLabel.includes(normalizedQuery) ||
    shortVer === normalizedQuery ||
    methodLabel.includes(normalizedQuery) ||
    uploader.includes(normalizedQuery) ||
    recipient.includes(normalizedQuery) ||
    batchHash.includes(normalizedQuery) ||
    reason.includes(normalizedQuery) ||
    version.attachments.some(
      (att) =>
        att.sha256.toLowerCase().includes(normalizedQuery) ||
        att.filename.toLowerCase().includes(normalizedQuery)
    )
  );
}

interface HashCopyIconButtonProps {
  copied: boolean;
  ariaLabel: string;
  title: string;
  testId: string;
  disabled?: boolean;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}

function HashCopyIconButton({
  copied,
  ariaLabel,
  title,
  testId,
  disabled = false,
  onClick,
}: HashCopyIconButtonProps) {
  return (
    <button
      type="button"
      className={`btn-copy-key p03-copy-btn ${copied ? 'copied' : ''}`}
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V16.5A1.5 1.5 0 0115.5 18h-7A1.5 1.5 0 017 16.5v-13z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-.5h-6A2.5 2.5 0 014.5 13.5V6z" />
        </svg>
      )}
    </button>
  );
}

interface HashCopyBadgeProps {
  hash: string | null;
  labelPrefix: string;
  copied: boolean;
  emptyText?: string;
  testId: string;
  buttonTestId: string;
  onCopy: (hash: string) => void;
}

function HashCopyBadge({
  hash,
  labelPrefix,
  copied,
  emptyText = 'Pending Capture',
  testId,
  buttonTestId,
  onCopy,
}: HashCopyBadgeProps) {
  if (!hash) {
    return (
      <span className="p03-version-pill p03-mono-inline" data-testid={testId}>
        {labelPrefix}: <strong>{emptyText}</strong>
      </span>
    );
  }

  return (
    <span
      className="p03-version-pill p03-hash-copy-pill p03-mono-inline"
      title={`SHA-256: ${hash}`}
      data-testid={testId}
      onClick={() => onCopy(hash)}
    >
      <span>
        {labelPrefix}: {hash.slice(0, 12)}&hellip;
      </span>
      <HashCopyIconButton
        copied={copied}
        ariaLabel={`Copy ${labelPrefix} SHA-256`}
        title={`Copy ${labelPrefix} SHA-256`}
        testId={buttonTestId}
        onClick={(e) => {
          e.stopPropagation();
          onCopy(hash);
        }}
      />
    </span>
  );
}

function EvidenceAttentionBadge({
  binding,
  uncertainStatus,
}: {
  binding: EvidenceBindingState;
  uncertainStatus: P04EngineSnapshot['uncertain_handover_state']['status'];
}) {
  if (
    uncertainStatus === 'lookup_required' ||
    binding.outcome === 'mismatched' ||
    binding.outcome === 'invalid'
  ) {
    return (
      <span className="p03-attention-badge is-red" data-testid="p04-attention-badge">
        <span className="toast-dot toast-dot-error" aria-hidden="true" />
        <span>Needs Serious Attention</span>
      </span>
    );
  }
  if (binding.outcome === 'missing') {
    return (
      <span className="p03-attention-badge is-yellow" data-testid="p04-attention-badge">
        <span className="toast-dot toast-dot-warning" aria-hidden="true" />
        <span>Needs Action</span>
      </span>
    );
  }
  return (
    <span className="p03-attention-badge is-ready" data-testid="p04-attention-badge">
      <span className="toast-dot toast-dot-success" aria-hidden="true" />
      <span>Ready for Handover</span>
    </span>
  );
}

export function P04EvidenceWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P04EvidenceWorkspaceProps) {
  const engine = useMemo(() => createP04EvidenceEngine(), []);
  const [snapshot, setSnapshot] = useState<P04EngineSnapshot>(() => engine.getSnapshot());
  const [activeTab, setActiveTab] = useState<P04TabId>('capture');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('canvas');
  const [searchQuery, setSearchQuery] = useState('');

  // Editable batch inputs (all empty by default — populated dynamically when requisition/inventory is loaded)
  const [recordNumberInput, setRecordNumberInput] = useState(snapshot.batch.record_number);
  const [recipientInput, setRecipientInput] = useState(snapshot.batch.recipient_name);
  const [recipientDutyInput, setRecipientDutyInput] = useState(snapshot.batch.recipient_duty);
  const [lineQtyInputs, setLineQtyInputs] = useState<string[]>(() =>
    snapshot.batch.lines.map((l) => String(Number(l.actual_quantity)))
  );
  const [showAddLineForm, setShowAddLineForm] = useState(false);
  const [newLineSku, setNewLineSku] = useState('');
  const [newLineName, setNewLineName] = useState('');
  const [newLineUnit, setNewLineUnit] = useState('');
  const [newLineAuthQty, setNewLineAuthQty] = useState('');
  const [newLineActualQty, setNewLineActualQty] = useState('');

  // Canvas state + undo/redo stack
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [redoStack, setRedoStack] = useState<SignatureStroke[]>([]);
  const [activePoints, setActivePoints] = useState<SignaturePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasReason, setCanvasReason] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Paper upload state
  const [customUploadCandidate, setCustomUploadCandidate] =
    useState<PaperUploadCandidate | null>(null);
  const [uploadReason, setUploadReason] = useState('');

  // Handover & Idempotency lookup state
  const [handoverKeyInput, setHandoverKeyInput] = useState('');
  const [lookupActionCategory, setLookupActionCategory] = useState<
    'STAGE_EVIDENCE' | 'RECORD_SIGNED_HANDOVER'
  >('RECORD_SIGNED_HANDOVER');
  const [lookupKeyInput, setLookupKeyInput] = useState('');
  const [lookupUlidInput, setLookupUlidInput] = useState('');
  const [lookupResult, setLookupResult] = useState<HandoverLookupResult | null>(null);

  // Feedback / theme-reactive canvas / clipboard state
  const [lastResult, setLastResult] = useState<P04ActionResult | null>(snapshot.last_action);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const syncTheme = () => {
      setIsDarkTheme(document.documentElement.classList.contains('dark'));
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  function handleCopyHash(hash: string, keyId: string) {
    copyTextSafe(hash);
    setCopiedId(keyId);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId(null);
    }, 2500);
    onNotify('info', 'Copied full 64-character SHA-256 hash');
  }

  function refreshSnapshot(actionRes?: P04ActionResult) {
    const next = engine.getSnapshot();
    setSnapshot(next);
    if (actionRes) {
      setLastResult(actionRes);
    } else if (next.last_action) {
      setLastResult(next.last_action);
    }
  }

  // Render smooth quadratic Bezier strokes on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const width = 560;
    const height = 180;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = isDarkTheme ? '#f8fafc' : '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawStrokePoints = (pts: ReadonlyArray<SignaturePoint>) => {
      if (pts.length === 0) return;
      const first = pts[0];
      if (!first) return;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      if (pts.length === 1) {
        ctx.lineTo(first.x + 0.1, first.y + 0.1);
      } else if (pts.length === 2) {
        const second = pts[1];
        if (second) ctx.lineTo(second.x, second.y);
      } else {
        for (let i = 1; i < pts.length - 1; i += 1) {
          const curr = pts[i];
          const next = pts[i + 1];
          if (!curr || !next) continue;
          const midX = (curr.x + next.x) / 2;
          const midY = (curr.y + next.y) / 2;
          ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }
        const last = pts[pts.length - 1];
        if (last) ctx.lineTo(last.x, last.y);
      }
      ctx.stroke();
    };

    for (const s of strokes) {
      drawStrokePoints(s.points);
    }
    if (activePoints.length > 0) {
      drawStrokePoints(activePoints);
    }
    ctx.restore();
  }, [strokes, activePoints, captureMode, activeTab, isDarkTheme]);

  function extractCanvasPoint(e: ReactPointerEvent<HTMLCanvasElement>): SignaturePoint {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0, timestamp: Date.now() };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = 560 / (rect.width || 560);
    const scaleY = 180 / (rect.height || 180);
    return {
      x: Math.max(0, Math.min(560, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(180, (e.clientY - rect.top) * scaleY)),
      timestamp: Date.now(),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = extractCanvasPoint(e);
    setIsDrawing(true);
    setActivePoints([pt]);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const pt = extractCanvasPoint(e);
    setActivePoints((prev) => [...prev, pt]);
  }

  function finishActiveStroke() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (activePoints.length >= 2) {
      const newStroke: SignatureStroke = {
        id: `stroke-${Date.now()}-${strokes.length + 1}`,
        points: activePoints,
        smoothedSvgPath: buildQuadraticBezierSvgPath(activePoints),
      };
      setStrokes((prev) => [...prev, newStroke]);
      setRedoStack([]);
    }
    setActivePoints([]);
  }

  function handleUndoStroke() {
    if (strokes.length === 0) return;
    playClickPen(soundEnabled);
    const removed = strokes[strokes.length - 1];
    setStrokes((prev) => prev.slice(0, -1));
    if (removed) {
      setRedoStack((prev) => [...prev, removed]);
    }
  }

  function handleRedoStroke() {
    if (redoStack.length === 0) return;
    playClickPen(soundEnabled);
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    if (restored) {
      setStrokes((prev) => [...prev, restored]);
    }
  }

  function handleClearCanvas() {
    playClickPen(soundEnabled);
    setStrokes([]);
    setRedoStack([]);
    setActivePoints([]);
  }

  function handleRecordNumberChange(nextRef: string) {
    setRecordNumberInput(nextRef);
    const res = engine.updateBatch({
      record_number: nextRef,
    });
    refreshSnapshot(res);
  }

  function handleRecipientChange(nextName: string) {
    setRecipientInput(nextName);
    const res = engine.updateBatch({
      recipient_name: nextName,
      recipient_duty: recipientDutyInput,
    });
    refreshSnapshot(res);
  }

  function handleRecipientDutyChange(nextDuty: string) {
    setRecipientDutyInput(nextDuty);
    const res = engine.updateBatch({
      recipient_name: recipientInput,
      recipient_duty: nextDuty,
    });
    refreshSnapshot(res);
  }

  function handleLineQtyChange(index: number, lineId: string, rawQty: string) {
    const nextArr = [...lineQtyInputs];
    nextArr[index] = rawQty;
    setLineQtyInputs(nextArr);
    const res = engine.updateBatch({
      lines: [{ line_id: lineId, actual_quantity: rawQty || '0' }],
    });
    refreshSnapshot(res);
  }

  function handleAddInventoryLine() {
    playClickPen(soundEnabled);
    const res = engine.addBatchLine({
      sku: newLineSku,
      item_name: newLineName,
      unit_label: newLineUnit,
      authorized_quantity: newLineAuthQty || '0',
      actual_quantity: newLineActualQty || '0',
    });
    refreshSnapshot(res);
    if (res.ok) {
      const nextSnap = engine.getSnapshot();
      setLineQtyInputs(nextSnap.batch.lines.map((l) => String(Number(l.actual_quantity))));
      setNewLineSku('');
      setNewLineName('');
      setNewLineUnit('');
      setNewLineAuthQty('');
      setNewLineActualQty('');
      setShowAddLineForm(false);
      onNotify('success', 'Added inventory item to batch preview');
    } else {
      onNotify('error', res.message);
    }
  }

  function handleStageCanvasSignature() {
    const res = engine.stageCanvasSignature({
      strokes,
      uploaded_by: recipientInput.trim(),
      replacement_reason: canvasReason,
    });
    refreshSnapshot(res);
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setCanvasReason('');
      onNotify('success', 'On-device signature validated and bound');
    } else {
      playClickPen(soundEnabled);
      onNotify('error', res.message);
    }
  }

  async function handleRealFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      setCustomUploadCandidate(null);
      return;
    }
    try {
      const headerBuffer = await file.slice(0, 16).arrayBuffer();
      const bytes = new Uint8Array(headerBuffer);
      const magicHeader = detectMagicHeaderFromBytes(bytes, file.size);
      setCustomUploadCandidate({
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        byte_length: file.size,
        magic_header: magicHeader,
        content_seed: `${file.name}-${file.size}-${file.lastModified}`,
      });
      onNotify('info', `Staged file "${file.name}" for integrity verification`);
    } catch {
      onNotify('error', 'Unable to inspect selected file header');
    }
  }

  const activeUploadCandidate: PaperUploadCandidate | null = customUploadCandidate;

  function handleStagePaperUpload() {
    const res = engine.stagePaperUpload({
      candidate: activeUploadCandidate,
      uploaded_by: recipientInput.trim(),
      replacement_reason: uploadReason,
    });
    refreshSnapshot(res);
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setUploadReason('');
      onNotify('success', 'Signed paper evidence validated and bound');
    } else {
      playClickPen(soundEnabled);
      onNotify('error', res.message);
    }
  }

  function handleRecordSignedHandover() {
    const res = engine.recordSignedHandover(handoverKeyInput);
    refreshSnapshot(res);
    if (res.ok) {
      playScribblenauts(soundEnabled);
      setLookupKeyInput(handoverKeyInput.trim());
      const nextSnap = engine.getSnapshot();
      const latestOp = nextSnap.operation_ledger[nextSnap.operation_ledger.length - 1];
      if (latestOp) {
        setLookupUlidInput(latestOp.operation_ulid);
      }
      onNotify('success', 'Signed handover recorded cleanly');
    } else {
      playClickPen(soundEnabled);
      onNotify('error', res.message);
    }
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = engine.lookupHandoverOperation({
      query_type: 'by_key',
      value: lookupKeyInput,
    });
    setLookupResult(res);
    refreshSnapshot(res);
    if (res.ok) {
      onNotify('success', 'Recovered committed operation result');
    } else {
      onNotify('error', res.message);
    }
  }

  function handleLookupByUlid() {
    playClickPen(soundEnabled);
    const res = engine.lookupHandoverOperation({
      query_type: 'by_ulid',
      value: lookupUlidInput,
    });
    setLookupResult(res);
    refreshSnapshot(res);
    if (res.ok) {
      onNotify('success', 'Recovered committed operation result');
    } else {
      onNotify('error', res.message);
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const orderedVersions = [...snapshot.versions].reverse();
  const filteredVersions = normalizedSearch
    ? orderedVersions.filter((v) => matchesEvidenceSearch(v, normalizedSearch))
    : orderedVersions;

  // Ready for Handover renders clean neutral card border (no yellow or red outline)
  const isSeriousAttention =
    snapshot.binding.outcome === 'mismatched' ||
    snapshot.binding.outcome === 'invalid' ||
    snapshot.uncertain_handover_state.status === 'lookup_required';
  const cardAttentionClass = isSeriousAttention
    ? 'is-serious-attention'
    : snapshot.binding.outcome === 'missing'
      ? 'is-needs-action'
      : '';

  const latestOperation =
    snapshot.operation_ledger[snapshot.operation_ledger.length - 1] ?? null;

  return (
    <main className="p03-workspace-shell" data-testid="p04-workspace">
      <div className="p03-workspace-inner">
        {/* Unified Top Header: Search Bar ABOVE Navbar */}
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
                id="p04-evidence-search-input"
                type="search"
                className="form-control p03-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search evidence versions, SHA-256 hash, capture method, or uploader"
                aria-label="Search evidence version history"
              />
            </div>

            {normalizedSearch && (
              <div className="p03-search-meta">
                <span className="p03-version-pill" data-testid="p04-search-match-count">
                  {filteredVersions.length} match{filteredVersions.length === 1 ? '' : 'es'}
                </span>
                {activeTab !== 'history' && (
                  <button
                    type="button"
                    id="p04-search-jump-btn"
                    className="p03-search-action-btn"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setActiveTab('history');
                    }}
                  >
                    View History
                  </button>
                )}
                <button
                  type="button"
                  id="p04-search-clear-btn"
                  className="p03-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Ready Evidence &amp; Signed Handover</h1>
            </div>

            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Evidence workspace views">
                <button
                  type="button"
                  role="tab"
                  id="p04-tab-capture"
                  aria-selected={activeTab === 'capture'}
                  className={`p03-filter-pill ${activeTab === 'capture' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('capture');
                  }}
                >
                  Handover &amp; Capture
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p04-tab-guard"
                  aria-selected={activeTab === 'guard'}
                  className={`p03-filter-pill ${activeTab === 'guard' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('guard');
                  }}
                >
                  Idempotency Lookup
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p04-tab-history"
                  aria-selected={activeTab === 'history'}
                  className={`p03-filter-pill ${activeTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setActiveTab('history');
                  }}
                >
                  Evidence History
                </button>
              </div>

              <button
                type="button"
                id="p04-back-dashboard-btn"
                className="btn-batcave-secondary p03-shrink-btn p04-back-btn"
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

        {/* P04 State Header Card */}
        <section
          className={`p03-card surface-card ${cardAttentionClass}`}
          aria-labelledby="p04-state-header-title"
          data-testid="p04-state-card"
        >
          <div className="p03-card-header-row">
            <div className="p03-state-title-group">
              <h2 id="p04-state-header-title" className="p03-section-title">
                Internal Requisition Handover
              </h2>
              <EvidenceAttentionBadge
                binding={snapshot.binding}
                uncertainStatus={snapshot.uncertain_handover_state.status}
              />
            </div>

            <div className="p03-version-badges">
              <span className="p03-version-pill" data-testid="p04-reference-pill">
                reference: <strong>{snapshot.batch.record_number || 'Unassigned'}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p04-evidence-version-pill">
                evidence version:{' '}
                <strong>
                  {snapshot.binding.version !== null ? `v${snapshot.binding.version}` : 'Not Staged'}
                </strong>
              </span>
              <span className="p03-version-pill" data-testid="p04-binding-status-pill">
                binding status: <strong>{snapshot.binding.outcome.toUpperCase()}</strong>
              </span>
              <span className="p03-version-pill" data-testid="p04-nonposting-pill">
                <strong data-testid="p04-stock-movements-count">
                  {snapshot.stock_movements_posted}
                </strong>{' '}
                STOCK MOVEMENTS POSTED
              </span>
            </div>
          </div>

          <div className="p03-axes-bar" aria-label="Evidence integrity summary">
            <div className="p03-axis-chip">
              <span className="p03-axis-key">CAPTURE METHOD</span>
              <span className="p03-axis-val" data-testid="p04-axis-method">
                {snapshot.binding.capture_method === 'canvas_signature'
                  ? 'ON-DEVICE CANVAS'
                  : snapshot.binding.capture_method === 'paper_upload'
                    ? 'SIGNED PAPER UPLOAD'
                    : 'NONE STAGED'}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">BINDING VERDICT</span>
              <span className="p03-axis-val" data-testid="p04-axis-reason">
                {snapshot.binding.reason === 'none'
                  ? 'EXACT BATCH VERIFIED'
                  : snapshot.binding.reason.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
            <div className="p03-axis-chip">
              <span className="p03-axis-key">HANDOVER TIMESTAMP (MANILA)</span>
              <span className="p03-axis-val" data-testid="p04-axis-time">
                {snapshot.batch.handover_at
                  ? formatManilaTimestamp(snapshot.batch.handover_at)
                  : 'NOT SET'}
              </span>
            </div>
          </div>

          <div className="p03-version-badges">
            <HashCopyBadge
              hash={snapshot.binding.content_hash}
              labelPrefix="FILE BYTES HASH (SHA-256)"
              copied={copiedId === 'header-content-hash'}
              testId="p04-header-content-hash"
              buttonTestId="p04-copy-content-hash-btn"
              onCopy={(h) => handleCopyHash(h, 'header-content-hash')}
            />
            <HashCopyBadge
              hash={
                snapshot.binding.acknowledged_snapshot_hash ??
                (snapshot.binding.current_batch_hash || null)
              }
              labelPrefix={
                snapshot.binding.acknowledged_snapshot_hash
                  ? 'BOUND BATCH SNAPSHOT HASH'
                  : 'CURRENT BATCH SNAPSHOT HASH'
              }
              emptyText="Awaiting Batch Data"
              copied={copiedId === 'header-batch-hash'}
              testId="p04-header-snapshot-hash"
              buttonTestId="p04-copy-snapshot-hash-btn"
              onCopy={(h) => handleCopyHash(h, 'header-batch-hash')}
            />
          </div>
        </section>

        {/* Blocker / Mismatch / Validation Alert Panel */}
        {(snapshot.binding.outcome === 'mismatched' ||
          (lastResult && !lastResult.ok) ||
          snapshot.uncertain_handover_state.status === 'lookup_required') && (
          <section
            className="p03-card surface-card p03-blocker-panel is-serious-attention is-blocked"
            aria-live="polite"
            data-testid="p04-blocker-panel"
          >
            <div className="p03-blocker-heading">
              <span className="callout-dot dot-error" aria-hidden="true" />
              <div>
                <div className="p03-blocker-title-row">
                  {lastResult && !lastResult.ok && lastResult.code === 'OPERATION_NOT_FOUND' ? null : (
                    <span className="p03-blocker-code" data-testid="p04-blocker-code">
                      {lastResult && !lastResult.ok
                        ? lastResult.code
                        : snapshot.binding.reason.toUpperCase()}
                    </span>
                  )}
                  <span className="p04-authorized-pill">Inputs Preserved</span>
                  {lastResult && !lastResult.ok && (
                    <span className="p04-authorized-pill">HTTP {lastResult.http_status}</span>
                  )}
                </div>
                <p className="p03-blocker-msg" data-testid="p04-blocker-message">
                  {lastResult && !lastResult.ok
                    ? lastResult.message
                    : snapshot.binding.reason === 'target_mismatch'
                      ? 'Recipient changed after signing. Prior acknowledgment is invalidated; capture fresh evidence for the current recipient.'
                      : 'Batch quantity changed after signing. Prior acknowledgment cannot authorize the revised batch; re-sign or upload updated paper evidence.'}
                </p>
              </div>
            </div>

            {snapshot.binding.outcome === 'mismatched' && (
              <div className="p03-comparison-box" data-testid="p04-mismatch-comparison">
                <div className="p03-comparison-title">
                  Bound Acknowledged Snapshot vs. Revised Current Batch
                </div>
                <div className="p03-comparison-grid">
                  <div className="p03-compare-col">
                    <span className="p03-formal-key">BOUND AT EVIDENCE V{snapshot.binding.version}</span>
                    <div className="p03-compare-row">
                      <span>Recipient</span>
                      <strong>{snapshot.binding.bound_recipient_name}</strong>
                    </div>
                    <div className="p03-compare-row">
                      <span>Snapshot Hash</span>
                      <strong className="p03-mono-inline">
                        {snapshot.binding.acknowledged_snapshot_hash?.slice(0, 14)}&hellip;
                      </strong>
                    </div>
                  </div>
                  <div className="p03-compare-col">
                    <span className="p03-formal-key">CURRENT REVISED BATCH</span>
                    <div className="p03-compare-row">
                      <span>Recipient</span>
                      <strong>{snapshot.batch.recipient_name.trim() || '(Blank)'}</strong>
                    </div>
                    <div className="p03-compare-row">
                      <span>Live Hash</span>
                      <strong className="p03-mono-inline">
                        {snapshot.binding.current_batch_hash.slice(0, 14)}&hellip;
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 1: Handover & Dual-Mode Capture */}
        {activeTab === 'capture' && (
          <div className="p03-grid">
            {/* Left Card: Exact-Batch Handover Preview & Record Handover */}
            <section
              className="p03-card surface-card"
              aria-labelledby="p04-preview-heading"
              data-testid="p04-batch-preview-card"
            >
              <div>
                <h2 id="p04-preview-heading" className="p03-section-title">
                  Exact-Batch Handover Preview
                </h2>
                <p className="p03-muted-copy">
                  Preview populates dynamically from items added in Chapter Inventory. Changing the recipient or any item quantity after signing invalidates prior acknowledgment and computes a new batch SHA-256 hash.
                </p>
              </div>

              <div className="p03-two-col">
                <div className="form-group">
                  <label htmlFor="p04-recipient-input" className="form-label">
                    Recipient Full Name
                  </label>
                  <input
                    id="p04-recipient-input"
                    type="text"
                    className="form-control"
                    value={recipientInput}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    placeholder="Enter authorized recipient name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="p04-recipient-duty-select" className="form-label">
                    Recipient Role / Duty
                  </label>
                  <select
                    id="p04-recipient-duty-select"
                    className="form-control"
                    value={recipientDutyInput}
                    onChange={(e) => handleRecipientDutyChange(e.target.value)}
                  >
                    <option value="">Select recipient role / duty</option>
                    <option value="Receiving Officer">Receiving Officer</option>
                    <option value="Booth Custodian">Booth Custodian</option>
                    <option value="Committee Requester">Committee Requester</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p04-record-number-input" className="form-label">
                  Requisition / Handover Reference
                </label>
                <input
                  id="p04-record-number-input"
                  type="text"
                  className="form-control is-mono"
                  value={recordNumberInput}
                  onChange={(e) => handleRecordNumberChange(e.target.value)}
                  placeholder="Enter requisition or document reference"
                />
              </div>

              <div className="p04-lines-list" aria-label="Handover batch lines">
                <div className="p02-compact-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="p03-formal-key">
                    BATCH ITEMS ({snapshot.batch.lines.length})
                  </span>
                  <button
                    type="button"
                    id="p04-add-line-toggle-btn"
                    className="p02-compact-btn"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setShowAddLineForm((prev) => !prev);
                    }}
                  >
                    {showAddLineForm ? 'Cancel' : '+ Add Inventory Line'}
                  </button>
                </div>

                {showAddLineForm && (
                  <div className="p04-line-card" data-testid="p04-add-line-form">
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label htmlFor="p04-add-sku-input" className="form-label">
                          Inventory SKU
                        </label>
                        <input
                          id="p04-add-sku-input"
                          type="text"
                          className="form-control is-mono"
                          value={newLineSku}
                          onChange={(e) => setNewLineSku(e.target.value)}
                          placeholder="SKU code"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="p04-add-name-input" className="form-label">
                          Item Name
                        </label>
                        <input
                          id="p04-add-name-input"
                          type="text"
                          className="form-control"
                          value={newLineName}
                          onChange={(e) => setNewLineName(e.target.value)}
                          placeholder="Item from Chapter Inventory"
                        />
                      </div>
                    </div>
                    <div className="p02-three-col-grid">
                      <div className="form-group">
                        <label htmlFor="p04-add-unit-input" className="form-label">
                          Unit
                        </label>
                        <input
                          id="p04-add-unit-input"
                          type="text"
                          className="form-control"
                          value={newLineUnit}
                          onChange={(e) => setNewLineUnit(e.target.value)}
                          placeholder="e.g. unit, box"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="p04-add-auth-qty-input" className="form-label">
                          Max Authorized
                        </label>
                        <input
                          id="p04-add-auth-qty-input"
                          type="number"
                          min="0"
                          className="form-control"
                          value={newLineAuthQty}
                          onChange={(e) => setNewLineAuthQty(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="p04-add-actual-qty-input" className="form-label">
                          Handover Qty
                        </label>
                        <input
                          id="p04-add-actual-qty-input"
                          type="number"
                          min="0"
                          className="form-control"
                          value={newLineActualQty}
                          onChange={(e) => setNewLineActualQty(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      id="p04-add-line-confirm-btn"
                      className="btn-batcave-secondary"
                      onClick={handleAddInventoryLine}
                    >
                      Add Item to Handover Preview
                    </button>
                  </div>
                )}

                {snapshot.batch.lines.length === 0 ? (
                  <div className="callout-banner" data-testid="p04-empty-batch-notice">
                    <span className="callout-dot dot-info" aria-hidden="true" />
                    <span>
                      No requisition items loaded yet. Items added in Chapter Inventory will populate here automatically.
                    </span>
                  </div>
                ) : (
                  snapshot.batch.lines.map((line, index) => (
                    <div
                      key={line.line_id}
                      className="p04-line-card"
                      data-testid={`p04-batch-line-${index}`}
                    >
                      <div className="p04-line-top">
                        <div>
                          <span className="p03-formal-key">{line.sku}</span>
                          <div className="p03-formal-val">{line.item_name}</div>
                        </div>
                        <span className="p04-authorized-pill">
                          Max Authorized: {formatTwoDecimalUnits(line.authorized_quantity, line.unit_label)}
                        </span>
                      </div>

                      <div className="p04-line-controls">
                        <div className="form-group" style={{ flex: 1 }}>
                          <label htmlFor={`p04-line-qty-${index}`} className="form-label">
                            Actual Handover Quantity ({line.unit_label})
                          </label>
                          <input
                            id={`p04-line-qty-${index}`}
                            type="number"
                            min="0"
                            step="1"
                            className="form-control"
                            value={lineQtyInputs[index] ?? ''}
                            onChange={(e) =>
                              handleLineQtyChange(index, line.line_id, e.target.value)
                            }
                          />
                        </div>
                        <div className="p04-precision-meta">
                          <span className="p03-formal-key">DISPLAY / LEDGER SCALE</span>
                          <span className="p03-formal-sub">
                            {formatTwoDecimalUnits(line.actual_quantity, line.unit_label)} &middot;{' '}
                            <span className="p03-mono-inline">{line.actual_quantity}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p03-formal-grid">
                <div className="p03-formal-cell is-span-2">
                  <span className="p03-formal-key">LIVE CURRENT BATCH HASH</span>
                  <div className="p04-hash-cell-row">
                    <span
                      className="p03-formal-val p03-mono-inline"
                      data-testid="p04-live-batch-hash"
                      title={snapshot.binding.current_batch_hash || 'Awaiting Batch Data'}
                    >
                      {snapshot.binding.current_batch_hash
                        ? `${snapshot.binding.current_batch_hash.slice(0, 20)}…`
                        : 'Awaiting Batch Data'}
                    </span>
                    <HashCopyIconButton
                      copied={copiedId === 'preview-live-hash'}
                      ariaLabel="Copy Live Current Batch SHA-256 Hash"
                      title={
                        snapshot.binding.current_batch_hash
                          ? 'Copy full SHA-256 hash'
                          : 'Hash computed after adding recipient or items'
                      }
                      testId="p04-copy-live-hash-btn"
                      disabled={!snapshot.binding.current_batch_hash}
                      onClick={() => {
                        if (snapshot.binding.current_batch_hash) {
                          handleCopyHash(snapshot.binding.current_batch_hash, 'preview-live-hash');
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="p03-formal-cell is-span-2">
                  <span className="p03-formal-key">BOUND ACKNOWLEDGED HASH</span>
                  <div className="p04-hash-cell-row">
                    <span
                      className="p03-formal-val p03-mono-inline"
                      data-testid="p04-bound-batch-hash"
                      title={snapshot.binding.acknowledged_snapshot_hash ?? 'Not Yet Bound'}
                    >
                      {snapshot.binding.acknowledged_snapshot_hash
                        ? `${snapshot.binding.acknowledged_snapshot_hash.slice(0, 20)}…`
                        : 'Not Yet Bound'}
                    </span>
                    <HashCopyIconButton
                      copied={copiedId === 'preview-bound-hash'}
                      ariaLabel="Copy Bound Acknowledged SHA-256 Hash"
                      title={
                        snapshot.binding.acknowledged_snapshot_hash
                          ? 'Copy full SHA-256 hash'
                          : 'Bound hash available after staging evidence'
                      }
                      testId="p04-copy-bound-hash-btn"
                      disabled={!snapshot.binding.acknowledged_snapshot_hash}
                      onClick={() => {
                        if (snapshot.binding.acknowledged_snapshot_hash) {
                          handleCopyHash(
                            snapshot.binding.acknowledged_snapshot_hash,
                            'preview-bound-hash'
                          );
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="p03-guard-strip">
                <div className="form-group">
                  <label htmlFor="p04-handover-key-input" className="form-label">
                    Handover Idempotency Key (Scoped by Chapter + Action)
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="p04-handover-key-input"
                      type="text"
                      className="form-control p03-mono-inline"
                      value={handoverKeyInput}
                      onChange={(e) => setHandoverKeyInput(e.target.value)}
                      placeholder="Enter or generate idempotency key"
                    />
                    <button
                      type="button"
                      id="p04-new-key-btn"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={() => {
                        const prefix = snapshot.batch.record_number.trim() || 'HND';
                        setHandoverKeyInput(
                          `HND-${prefix}-${String(snapshot.operation_ledger.length + 1).padStart(2, '0')}`
                        );
                      }}
                    >
                      New Key
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  id="p04-record-handover-btn"
                  className="btn-batcave-primary"
                  onClick={handleRecordSignedHandover}
                >
                  Record Signed Handover
                </button>
              </div>
            </section>

            {/* Right Card: Dual-Mode Evidence Capture */}
            <section
              className="p03-card surface-card"
              aria-labelledby="p04-capture-heading"
              data-testid="p04-capture-card"
            >
              <div>
                <h2 id="p04-capture-heading" className="p03-section-title">
                  Dual-Mode Signature &amp; Paper Upload
                </h2>
                <p className="p03-muted-copy">
                  Capture an interactive on-device signature or upload a validated physical paper scan. Staging evidence alone posts zero stock movement.
                </p>
              </div>

              <div className="p03-filter-pill-bar" role="tablist" aria-label="Capture method">
                <button
                  type="button"
                  role="tab"
                  id="p04-mode-canvas-btn"
                  aria-selected={captureMode === 'canvas'}
                  className={`p03-filter-pill ${captureMode === 'canvas' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setCaptureMode('canvas');
                  }}
                >
                  Method A: On-Device Canvas
                </button>
                <button
                  type="button"
                  role="tab"
                  id="p04-mode-upload-btn"
                  aria-selected={captureMode === 'upload'}
                  className={`p03-filter-pill ${captureMode === 'upload' ? 'is-active' : ''}`}
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setCaptureMode('upload');
                  }}
                >
                  Method B: Signed Paper Upload
                </button>
              </div>

              {captureMode === 'canvas' ? (
                <div className="p03-action-stack" data-testid="p04-canvas-panel">
                  <div className="p04-signature-pad-wrap">
                    <canvas
                      ref={canvasRef}
                      id="p04-signature-canvas"
                      className="p04-signature-canvas"
                      aria-label="On-device recipient signature canvas"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishActiveStroke}
                      onPointerCancel={finishActiveStroke}
                    />
                    {strokes.length === 0 && activePoints.length === 0 && (
                      <div className="p04-canvas-placeholder" aria-hidden="true">
                        Sign with your mouse or touch
                      </div>
                    )}
                  </div>

                  <div className="p03-next-actions-row">
                    <button
                      type="button"
                      id="p04-undo-stroke-btn"
                      className="btn-batcave-secondary p03-inline-action-btn"
                      disabled={strokes.length === 0}
                      onClick={handleUndoStroke}
                    >
                      Undo Stroke
                    </button>
                    <button
                      type="button"
                      id="p04-redo-stroke-btn"
                      className="btn-batcave-secondary p03-inline-action-btn"
                      disabled={redoStack.length === 0}
                      onClick={handleRedoStroke}
                    >
                      Redo Stroke
                    </button>
                    <button
                      type="button"
                      id="p04-clear-canvas-btn"
                      className="btn-batcave-secondary p03-inline-action-btn"
                      onClick={handleClearCanvas}
                    >
                      Clear Canvas
                    </button>
                  </div>

                  <div className="p03-version-badges">
                    <span className="p04-authorized-pill" data-testid="p04-stroke-count">
                      {strokes.length} stroke{strokes.length === 1 ? '' : 's'} captured
                    </span>
                    <span className="p04-authorized-pill">Export Format: PNG + Batch Snapshot</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p04-canvas-reason-input" className="form-label">
                      Replacement Reason (Optional for Initial Signature)
                    </label>
                    <input
                      id="p04-canvas-reason-input"
                      type="text"
                      className="form-control"
                      value={canvasReason}
                      onChange={(e) => setCanvasReason(e.target.value)}
                      placeholder="e.g. Updated recipient or quantity change"
                    />
                  </div>

                  <button
                    type="button"
                    id="p04-stage-canvas-btn"
                    className="btn-batcave-primary"
                    onClick={handleStageCanvasSignature}
                  >
                    Stage &amp; Validate Canvas Signature
                  </button>
                </div>
              ) : (
                <div className="p03-action-stack" data-testid="p04-upload-panel">
                  <div className="form-group">
                    <label htmlFor="p04-file-input" className="form-label">
                      Upload Local Signed Paper File (.pdf, .png, .jpg)
                    </label>
                    <input
                      id="p04-file-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      className="form-control p04-file-input"
                      onChange={(e) => void handleRealFileSelected(e.target.files)}
                    />
                  </div>

                  {activeUploadCandidate && (
                    <div className="p03-comparison-box" data-testid="p04-upload-preview">
                      <div className="p03-comparison-title">Client-Side Staging Preview</div>
                      <div className="p03-formal-grid">
                        <div className="p03-formal-cell is-span-2">
                          <span className="p03-formal-key">FILENAME</span>
                          <span className="p03-formal-val">{activeUploadCandidate.filename}</span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">MIME / MAGIC</span>
                          <span className="p03-formal-val">
                            {activeUploadCandidate.mime_type} ({activeUploadCandidate.magic_header})
                          </span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">SIZE</span>
                          <span className="p03-formal-val">
                            {formatByteSize(activeUploadCandidate.byte_length)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="p04-upload-reason-input" className="form-label">
                      Replacement Reason (Optional for Initial Upload)
                    </label>
                    <input
                      id="p04-upload-reason-input"
                      type="text"
                      className="form-control"
                      value={uploadReason}
                      onChange={(e) => setUploadReason(e.target.value)}
                      placeholder="e.g. Clearer scan or revised batch"
                    />
                  </div>

                  <button
                    type="button"
                    id="p04-stage-upload-btn"
                    className="btn-batcave-primary"
                    onClick={handleStagePaperUpload}
                  >
                    Stage &amp; Validate Paper Evidence
                  </button>
                </div>
              )}

              <div className="p03-guard-strip">
                <span className="p03-formal-key">STAGED HANDOVER BINDING SUMMARY</span>
                <div className="p03-formal-grid">
                  <div className="p03-formal-cell is-span-2">
                    <span className="p03-formal-key">STAGED EVIDENCE VERSION</span>
                    <span className="p03-formal-val">
                      {snapshot.binding.version !== null
                        ? `Evidence v${snapshot.binding.version}`
                        : 'Not Staged'}
                    </span>
                    <span className="p03-formal-sub">
                      {snapshot.binding.bound_recipient_name
                        ? `Bound to ${snapshot.binding.bound_recipient_name}`
                        : 'Awaiting signature or paper scan'}
                    </span>
                  </div>
                  <div className="p03-formal-cell is-span-2">
                    <span className="p03-formal-key">HANDOVER GATE</span>
                    <span className="p03-formal-val">
                      {snapshot.binding.outcome === 'ready'
                        ? 'Cleared to Record Handover'
                        : 'Valid Evidence Required'}
                    </span>
                    <span className="p03-formal-sub">
                      Staging evidence alone never posts stock movement
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Professional Officer Idempotency & Operation Outcome Lookup */}
        {activeTab === 'guard' && (
          <section
            className="p03-card surface-card"
            aria-labelledby="p04-lookup-heading"
            data-testid="p04-lookup-card"
          >
            <div>
              <h2 id="p04-lookup-heading" className="p03-section-title">
                Idempotency &amp; Operation Outcome Lookup
              </h2>
              <p className="p03-muted-copy">
                Verify committed signed handovers by idempotency key or transaction reference before retrying an interrupted request.
              </p>
            </div>

            <div className="p03-formal-grid">
              <div className="p03-formal-cell">
                <span className="p03-formal-key">LAST OPERATION STATUS</span>
                <span className="p03-formal-val" data-testid="p04-latest-status">
                  {lastResult
                    ? `${lastResult.ok ? 'Committed' : 'Attention'} · ${
                        lastResult.code === 'OPERATION_NOT_FOUND'
                          ? 'No Matching Operation'
                          : lastResult.code.replace(/_/g, ' ')
                      }`
                    : 'No Operation Recorded Yet'}
                </span>
              </div>
              <div className="p03-formal-cell">
                <span className="p03-formal-key">DOCUMENT REFERENCE</span>
                <span className="p03-formal-val">
                  {snapshot.batch.record_number || 'Unassigned'}
                </span>
              </div>
              <div className="p03-formal-cell is-span-2">
                <span className="p03-formal-key">TRANSACTION REFERENCE (ULID)</span>
                <span className="p03-formal-val p03-mono-inline" data-testid="p04-latest-ulid">
                  {latestOperation?.operation_ulid ?? 'Not Yet Assigned'}
                </span>
              </div>
            </div>

            <div className="p03-two-col">
              <div className="form-group">
                <label htmlFor="p04-lookup-chapter-input" className="form-label">
                  Authorized Chapter Scope
                </label>
                <input
                  id="p04-lookup-chapter-input"
                  type="text"
                  className="form-control"
                  value={snapshot.chapter_name || ''}
                  placeholder="Active chapter scope"
                  readOnly
                />
              </div>
              <div className="form-group">
                <label htmlFor="p04-lookup-category-select" className="form-label">
                  Operation Category
                </label>
                <select
                  id="p04-lookup-category-select"
                  className="form-control"
                  value={lookupActionCategory}
                  onChange={(e) =>
                    setLookupActionCategory(
                      e.target.value as 'STAGE_EVIDENCE' | 'RECORD_SIGNED_HANDOVER'
                    )
                  }
                >
                  <option value="RECORD_SIGNED_HANDOVER">Record Signed Handover</option>
                  <option value="STAGE_EVIDENCE">Stage Evidence Attachment</option>
                </select>
              </div>
            </div>

            <div className="p03-lookup-action-grid">
              <div className="form-group">
                <label htmlFor="p04-lookup-key-input" className="form-label">
                  Lookup by Idempotency Key
                </label>
                <div className="p03-input-action-row">
                  <input
                    id="p04-lookup-key-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupKeyInput}
                    onChange={(e) => setLookupKeyInput(e.target.value)}
                    placeholder="Enter idempotency key"
                  />
                  <button
                    type="button"
                    id="p04-lookup-by-key-btn"
                    className="btn-batcave-secondary p03-shrink-btn"
                    onClick={handleLookupByKey}
                  >
                    Lookup by Key
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="p04-lookup-ulid-input" className="form-label">
                  Lookup by Transaction Reference (ULID)
                </label>
                <div className="p03-input-action-row">
                  <input
                    id="p04-lookup-ulid-input"
                    type="text"
                    className="form-control p03-mono-inline"
                    value={lookupUlidInput}
                    onChange={(e) => setLookupUlidInput(e.target.value)}
                    placeholder="e.g. 01K8P04OP..."
                  />
                  <button
                    type="button"
                    id="p04-lookup-by-ulid-btn"
                    className="btn-batcave-secondary p03-shrink-btn"
                    onClick={handleLookupByUlid}
                  >
                    Lookup by Reference
                  </button>
                </div>
              </div>
            </div>

            {lookupResult && (
              <div
                className={`p03-comparison-box ${lookupResult.ok ? '' : 'is-denied'}`}
                data-testid="p04-lookup-result"
              >
                <div className="p03-comparison-title">
                  {lookupResult.ok
                    ? 'Recovered Committed Result'
                    : 'Lookup Result'}
                </div>
                <p className="p03-muted-copy">{lookupResult.message}</p>
                {lookupResult.entry && (
                  <div className="p03-formal-grid">
                    <div className="p03-formal-cell">
                      <span className="p03-formal-key">DOCUMENT</span>
                      <span className="p03-formal-val">
                        {lookupResult.entry.document_reference}
                      </span>
                    </div>
                    <div className="p03-formal-cell">
                      <span className="p03-formal-key">ACTION</span>
                      <span className="p03-formal-val">{lookupResult.entry.action_label}</span>
                    </div>
                    <div className="p03-formal-cell">
                      <span className="p03-formal-key">EVIDENCE VERSION</span>
                      <span className="p03-formal-val">v{lookupResult.entry.evidence_version}</span>
                    </div>
                    <div className="p03-formal-cell">
                      <span className="p03-formal-key">COMMITTED (MANILA)</span>
                      <span className="p03-formal-val">
                        {formatManilaTimestamp(lookupResult.entry.committed_at)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p03-ledger-chips" data-testid="p04-operation-chips">
              <span className="p03-formal-key">
                RECENT RECORDED OPERATIONS ({snapshot.operation_ledger.length})
              </span>
              {snapshot.operation_ledger.length === 0 ? (
                <p className="p03-muted-copy">
                  No operations recorded yet. Stage evidence or record a signed handover in the first tab.
                </p>
              ) : (
                <div className="p03-chip-wrap">
                  {[...snapshot.operation_ledger].reverse().map((op) => (
                    <button
                      key={op.operation_ulid}
                      type="button"
                      className="p03-ledger-chip-btn"
                      onClick={() => {
                        playClickPen(soundEnabled);
                        setLookupActionCategory(op.action_code);
                        setLookupKeyInput(op.idempotency_key);
                        setLookupUlidInput(op.operation_ulid);
                      }}
                    >
                      <strong>{op.action_label}</strong>
                      <span className="p03-mono-inline">{op.idempotency_key}</span>
                      <span className="p03-mono-inline">{op.operation_ulid.slice(-7)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: Evidence Version History */}
        {activeTab === 'history' && (
          <section
            className="p03-card surface-card"
            aria-labelledby="p04-history-heading"
            data-testid="p04-history-card"
          >
            <div className="p03-card-header-row">
              <div>
                <h2 id="p04-history-heading" className="p03-section-title">
                  Evidence Version History &amp; Retained Lineage
                </h2>
              </div>
              <span className="p03-version-pill">
                {filteredVersions.length} version{filteredVersions.length === 1 ? '' : 's'} shown
              </span>
            </div>

            {filteredVersions.length === 0 ? (
              <p className="p03-empty-decisions" data-testid="p04-empty-history">
                {normalizedSearch
                  ? 'No evidence versions match your current search filter.'
                  : 'No evidence versions have been staged yet. Capture an on-device signature or upload a signed paper scan first.'}
              </p>
            ) : (
              <div className="p03-history-list">
                {filteredVersions.map((ver) => {
                  const isSuperseded = Boolean(ver.superseded_by_version_id);
                  const att = ver.attachments[0];
                  return (
                    <article
                      key={ver.version_id}
                      className={`p03-history-card ${isSuperseded ? 'is-superseded' : ''}`}
                      data-testid={`p04-history-v${ver.version}`}
                    >
                      <div className="p03-history-head">
                        <div className="p03-history-title-group">
                          <span className="p03-version-badge">EVIDENCE VERSION {ver.version}</span>
                          <span className="p03-lineage-pill">
                            {ver.capture_method === 'canvas_signature'
                              ? 'ON-DEVICE CANVAS'
                              : 'SIGNED PAPER UPLOAD'}
                          </span>
                          <span
                            className={
                              isSuperseded ? 'p03-superseded-badge' : 'p03-current-badge'
                            }
                          >
                            <span
                              className={`toast-dot ${
                                isSuperseded ? 'toast-dot-warning' : 'toast-dot-success'
                              }`}
                              aria-hidden="true"
                            />
                            <span>
                              {isSuperseded
                                ? `SUPERSEDED BY VERSION ${ver.version + 1}`
                                : 'ACTIVE · READY'}
                            </span>
                          </span>
                        </div>

                        <div className="p03-version-badges">
                          <HashCopyBadge
                            hash={att?.sha256 ?? null}
                            labelPrefix="FILE HASH"
                            copied={copiedId === `hist-file-${ver.version}`}
                            testId={`p04-hist-file-hash-v${ver.version}`}
                            buttonTestId={`p04-hist-copy-file-v${ver.version}`}
                            onCopy={(h) => handleCopyHash(h, `hist-file-${ver.version}`)}
                          />
                          <HashCopyBadge
                            hash={ver.acknowledged_snapshot_hash}
                            labelPrefix="BATCH HASH"
                            copied={copiedId === `hist-batch-${ver.version}`}
                            testId={`p04-hist-batch-hash-v${ver.version}`}
                            buttonTestId={`p04-hist-copy-batch-v${ver.version}`}
                            onCopy={(h) => handleCopyHash(h, `hist-batch-${ver.version}`)}
                          />
                        </div>
                      </div>

                      <div className="p03-formal-grid">
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">ARTIFACT / ATTACHMENT</span>
                          <span className="p03-formal-val">{att?.filename ?? 'N/A'}</span>
                          <span className="p03-formal-sub">
                            {att ? `${att.media_type} · ${formatByteSize(att.byte_length)}` : ''}
                          </span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">BOUND RECIPIENT</span>
                          <span className="p03-formal-val">{ver.recipient_snapshot}</span>
                          <span className="p03-formal-sub">Uploaded by {ver.uploaded_by}</span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">CAPTURED AT (MANILA)</span>
                          <span className="p03-formal-val">
                            {formatManilaTimestamp(ver.uploaded_at)}
                          </span>
                        </div>
                        <div className="p03-formal-cell">
                          <span className="p03-formal-key">LINEAGE / REASON</span>
                          <span className="p03-formal-val">
                            {ver.replacement_reason ?? 'Initial Evidence Submission'}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
