import { useMemo, useRef, useState } from 'react';
import { playClickPen, playScribblenauts } from './batcaveAudio';
import {
  createP03RecordEngine,
  formatManilaTimestamp,
} from './p03RecordSlice';
import type {
  ActionResult,
  DraftPayload,
  DutyCode,
  P03EngineSnapshot,
  ReviewDecisionType,
  VersionedSource,
} from './p03RecordSlice';

type FilterTabId = 'submission_approval' | 'version_history' | 'idempotency_lookup';
type AttentionTone = 'normal' | 'needs-action' | 'serious-attention';

function formatReadableState(raw: string): string {
  return raw.replace(/_/g, ' ');
}

const DUTY_LABELS: Partial<Record<DutyCode, string>> = {
  CHAPTER_HEAD: 'Chapter Head',
  FINANCE: 'Finance Officer',
  RECEIVING: 'Receiving Officer',
  INVENTORY: 'Inventory Custodian',
  BOOTH_CUSTODIAN: 'Booth Custodian',
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending Review',
  requires_review: 'Pending Review',
  approved: 'Approved',
  returned: 'Returned for Revision',
  rejected: 'Rejected',
  hold: 'On Hold',
};

const DECISION_LABELS: Record<ReviewDecisionType, string> = {
  approve: 'APPROVED',
  return: 'RETURNED FOR REVISION',
  hold: 'ON HOLD',
  reject: 'REJECTED',
  cancel: 'CANCELLED',
};

function formatFormalDuty(dutyCode: DutyCode): string {
  return (
    DUTY_LABELS[dutyCode] ??
    dutyCode
      .toLowerCase()
      .split('_')
      .map((part) => (part ? `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}` : ''))
      .join(' ')
  );
}

function formatFormalApprovalStatus(raw: string): string {
  return APPROVAL_STATUS_LABELS[raw] ?? formatReadableState(raw);
}

function formatCurrencyPhp(amount: number): string {
  if (!Number.isFinite(amount)) return 'PHP 0.00';
  const formatted = new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `PHP ${formatted}`;
}

function formatFormalQuantity(raw: string): string {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return `${raw} units`;
  const [wholePart = '0', fracPart = ''] = raw.split('.');
  const trimmedFrac = fracPart.replace(/0+$/, '');
  const displayFrac = trimmedFrac.length <= 2 ? trimmedFrac.padEnd(2, '0') : trimmedFrac;
  const formattedWhole = new Intl.NumberFormat('en-PH').format(Number(wholePart) || 0);
  return `${formattedWhole}.${displayFrac} units`;
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
    // ignore clipboard fallback failures in restricted browsers
  }
  document.body.removeChild(textArea);
}

function copyHashToClipboard(hash: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(hash).catch(() => fallbackCopyText(hash));
  } else {
    fallbackCopyText(hash);
  }
}

function matchesVersionSearch(version: VersionedSource, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const matVer = version.target.material_version;
  const versionLabel = `material v${matVer}`;
  const formalVersionLabel = `material version ${matVer}`;
  const shortVersionLabel = `v${matVer}`;
  const hash = version.target.material_hash.toLowerCase();
  const purpose = version.material.purpose.toLowerCase();
  const preparer = version.prepared_by.actor_name.toLowerCase();
  const externalRef = (version.material.external_reference ?? '').toLowerCase();

  return (
    hash.includes(normalizedQuery) ||
    versionLabel.includes(normalizedQuery) ||
    formalVersionLabel.includes(normalizedQuery) ||
    shortVersionLabel === normalizedQuery ||
    purpose.includes(normalizedQuery) ||
    preparer.includes(normalizedQuery) ||
    externalRef.includes(normalizedQuery) ||
    version.decisions.some(
      (d) =>
        d.actor.actor_name.toLowerCase().includes(normalizedQuery) ||
        d.reason.toLowerCase().includes(normalizedQuery) ||
        d.decision.toLowerCase().includes(normalizedQuery)
    )
  );
}

interface HashCopyPillProps {
  hash: string;
  materialVersion: number;
  copied: boolean;
  prefix?: string;
  previewLength?: number;
  pillTestId: string;
  buttonTestId: string;
  onCopy: () => void;
}

function HashCopyPill({
  hash,
  materialVersion,
  copied,
  prefix = '',
  previewLength = 12,
  pillTestId,
  buttonTestId,
  onCopy,
}: HashCopyPillProps) {
  return (
    <span
      className="p03-version-pill p03-hash-copy-pill p03-mono-inline"
      title={`Material v${materialVersion} SHA-256 hash: ${hash}`}
      data-testid={pillTestId}
      onClick={onCopy}
    >
      <span>
        {prefix}
        {hash.slice(0, previewLength)}&hellip;
      </span>
      <button
        type="button"
        className={`btn-copy-key p03-copy-btn ${copied ? 'copied' : ''}`}
        title={`Copy Material v${materialVersion} hash`}
        aria-label={`Copy Material v${materialVersion} hash`}
        data-testid={buttonTestId}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
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
    </span>
  );
}

function AttentionBadge({ tone }: { tone: AttentionTone }) {
  if (tone === 'serious-attention') {
    return (
      <span className="p03-attention-badge is-red" data-testid="p03-attention-badge">
        <span className="toast-dot toast-dot-error" aria-hidden="true" />
        <span>Needs Serious Attention</span>
      </span>
    );
  }
  if (tone === 'needs-action') {
    return (
      <span className="p03-attention-badge is-yellow" data-testid="p03-attention-badge">
        <span className="toast-dot toast-dot-warning" aria-hidden="true" />
        <span>Needs Action</span>
      </span>
    );
  }
  return null;
}

interface RecordStateHeaderProps {
  snapshot: P03EngineSnapshot;
  attentionTone: AttentionTone;
}

export function RecordStateHeader({ snapshot, attentionTone }: RecordStateHeaderProps) {
  const approvalRaw = snapshot.current_source
    ? snapshot.current_source.state.states.approval
    : snapshot.draft.approval_state;
  const progressRaw = snapshot.current_source?.state.states.progress ?? 'not_started';
  const exceptionRaw = snapshot.current_source?.state.states.exception ?? 'none';
  return (
    <section
      className={`p03-card surface-card ${
        attentionTone !== 'normal' ? `is-${attentionTone}` : ''
      }`}
      aria-labelledby="p03-state-header-title"
      data-testid="p03-state-card"
    >
      <div className="p03-card-header-row">
        <div className="p03-state-title-group">
          <h2 id="p03-state-header-title" className="p03-section-title">
            {snapshot.document_number ? 'Initial Physical Count' : '(Draft)'}
          </h2>
          <AttentionBadge tone={attentionTone} />
        </div>

        <div className="p03-version-badges">
          <span className="p03-version-pill" data-testid="p03-row-version-pill">
            row version: <strong>v{snapshot.server_row_version}</strong>
          </span>
          <span className="p03-version-pill" data-testid="p03-material-version-pill">
            material version:{' '}
            <strong>
              {snapshot.server_material_version !== null
                ? `v${snapshot.server_material_version}`
                : 'Draft'}
            </strong>
          </span>
        </div>
      </div>

      <div className="p03-axes-bar" aria-label="Record status overview">
        <div className="p03-axis-chip">
          <span className="p03-axis-key">APPROVAL</span>
          <span className="p03-axis-val" data-testid="p03-axis-approval">
            {formatReadableState(approvalRaw)}
          </span>
        </div>
        <div className="p03-axis-chip">
          <span className="p03-axis-key">PROGRESS</span>
          <span className="p03-axis-val" data-testid="p03-axis-progress">
            {formatReadableState(progressRaw)}
          </span>
        </div>
        <div className="p03-axis-chip">
          <span className="p03-axis-key">EXCEPTION</span>
          <span className="p03-axis-val" data-testid="p03-axis-exception">
            {formatReadableState(exceptionRaw)}
          </span>
        </div>
      </div>

      <div className="p03-times-grid" aria-label="Record timestamps">
        <div className="p03-time-cell">
          <span className="session-ledger-key">OCCURRED</span>
          <span className="session-ledger-val">
            {formatManilaTimestamp(snapshot.business_times.occurred_at)}
          </span>
        </div>
        <div className="p03-time-cell">
          <span className="session-ledger-key">ENTERED</span>
          <span className="session-ledger-val">
            {formatManilaTimestamp(snapshot.business_times.entered_at)}
          </span>
        </div>
        <div className="p03-time-cell">
          <span className="session-ledger-key">VERIFIED</span>
          <span className="session-ledger-val">
            {formatManilaTimestamp(snapshot.business_times.verified_at)}
          </span>
        </div>
        <div className="p03-time-cell">
          <span className="session-ledger-key">POSTED</span>
          <span className="session-ledger-val">
            {formatManilaTimestamp(snapshot.business_times.posted_at)}
          </span>
        </div>
      </div>
    </section>
  );
}

interface BlockerAndStaleComparisonPanelProps {
  lastResult: ActionResult | null;
  localDraft: DraftPayload;
  localExpectedRowVersion: number;
  localExpectedMaterialVersion: number | null;
  serverSnapshot: P03EngineSnapshot;
  onSyncExpectedVersions: () => void;
  onFocusLookup: (actionCode?: string, idempotencyKey?: string) => void;
}

export function BlockerAndStaleComparisonPanel({
  lastResult,
  localDraft,
  localExpectedRowVersion,
  localExpectedMaterialVersion,
  serverSnapshot,
  onSyncExpectedVersions,
  onFocusLookup,
}: BlockerAndStaleComparisonPanelProps) {
  if (!lastResult || lastResult.action_result === 'success') {
    return null;
  }

  const isStale = lastResult.action_result === 'stale';
  const serverPurpose =
    serverSnapshot.current_source?.material.purpose ??
    serverSnapshot.draft.draft_payload.purpose;
  const serverQty =
    serverSnapshot.current_source?.material.lines[0]?.counted_quantity.value ??
    serverSnapshot.draft.draft_payload.counted_quantity;

  return (
    <section
      className={`p03-card surface-card p03-blocker-panel is-serious-attention is-${lastResult.action_result}`}
      aria-live="polite"
      data-testid="p03-blocker-panel"
    >
      <div className="p03-blocker-top">
        <div className="p03-blocker-heading">
          <span className="callout-dot dot-error" aria-hidden="true" />
          <div>
            <div className="p03-blocker-title-row">
              <span className="p03-blocker-code">
                {lastResult.blocking_reason?.code ?? lastResult.action_result.toUpperCase()}
              </span>
              <span className="p03-policy-chip">
                {lastResult.input_policy === 'preserve' ? 'Input Preserved' : 'May Clear'}
              </span>
            </div>
            <p className="p03-blocker-msg">
              {lastResult.blocking_reason?.message ?? 'Action did not complete.'}
            </p>
          </div>
        </div>
      </div>

      {lastResult.field_feedback.length > 0 ? (
        <ul className="p03-feedback-list" aria-label="Field validation feedback">
          {lastResult.field_feedback.map((item) => (
            <li key={`${item.path}-${item.code}`} className="p03-feedback-item">
              <span className="p03-mono-inline">{item.path || '/'}</span> &mdash;{' '}
              <strong>{item.code}:</strong> {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      {isStale ? (
        <div className="p03-comparison-box" data-testid="p03-stale-comparison">
          <p className="p03-comparison-title">
            Preserved Local Draft vs. Current Authorized Server State
          </p>
          <div className="p03-comparison-grid">
            <div className="p03-compare-col">
              <span className="session-ledger-key">Preserved Local Draft</span>
              <div className="p03-compare-row">
                <span>Expected Row Version:</span>
                <strong>v{localExpectedRowVersion}</strong>
              </div>
              <div className="p03-compare-row">
                <span>Expected Material Version:</span>
                <strong>
                  {localExpectedMaterialVersion !== null
                    ? `v${localExpectedMaterialVersion}`
                    : 'Draft'}
                </strong>
              </div>
              <div className="p03-compare-row">
                <span>Draft Purpose:</span>
                <strong>{localDraft.purpose}</strong>
              </div>
              <div className="p03-compare-row">
                <span>Draft Qty:</span>
                <strong>{localDraft.counted_quantity}</strong>
              </div>
            </div>

            <div className="p03-compare-col">
              <span className="session-ledger-key">Current Server State</span>
              <div className="p03-compare-row">
                <span>Server Row Version:</span>
                <strong>v{serverSnapshot.server_row_version}</strong>
              </div>
              <div className="p03-compare-row">
                <span>Server Material Version:</span>
                <strong>
                  {serverSnapshot.server_material_version !== null
                    ? `v${serverSnapshot.server_material_version}`
                    : 'Draft'}
                </strong>
              </div>
              <div className="p03-compare-row">
                <span>Server Purpose:</span>
                <strong>{serverPurpose}</strong>
              </div>
              <div className="p03-compare-row">
                <span>Server Qty:</span>
                <strong>{serverQty}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="p03-next-actions-row">
        {lastResult.permitted_next_actions.map((action) => (
          <button
            key={`${action.code}-${action.label}`}
            type="button"
            className="btn-batcave-secondary p03-inline-action-btn"
            onClick={() => {
              if (action.code === 'refresh_record') {
                onSyncExpectedVersions();
              } else if (action.code === 'lookup_operation') {
                onFocusLookup(
                  lastResult.operation?.identity.action_code ?? undefined,
                  lastResult.operation?.identity.idempotency_key ?? undefined
                );
              }
            }}
          >
            {action.code === 'refresh_record'
              ? 'Sync Expected Versions & Review'
              : action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

interface UncertainOutcomeLookupPanelProps {
  snapshot: P03EngineSnapshot;
  activeResult: ActionResult | null;
  attentionTone: AttentionTone;
  lookupChapterId: string;
  lookupActionCode: string;
  lookupKey: string;
  lookupOpId: string;
  lookupResult: ActionResult | null;
  onChangeChapterId: (value: string) => void;
  onChangeActionCode: (value: string) => void;
  onChangeKey: (value: string) => void;
  onChangeOpId: (value: string) => void;
  onLookupByKey: () => void;
  onLookupById: () => void;
}

const ACTION_RESULT_LABELS: Record<ActionResult['action_result'], string> = {
  success: 'Committed',
  blocked: 'Blocked',
  stale: 'Version Conflict',
  forbidden: 'Permission Denied',
  uncertain: 'Outcome Uncertain',
};

export function UncertainOutcomeLookupPanel({
  snapshot,
  activeResult,
  attentionTone,
  lookupChapterId,
  lookupActionCode,
  lookupKey,
  lookupOpId,
  lookupResult,
  onChangeChapterId,
  onChangeActionCode,
  onChangeKey,
  onChangeOpId,
  onLookupByKey,
  onLookupById,
}: UncertainOutcomeLookupPanelProps) {
  const statusHeading = activeResult
    ? ACTION_RESULT_LABELS[activeResult.action_result]
    : 'No Operation Executed Yet';
  const statusDetail = activeResult
    ? activeResult.operation?.replayed
      ? 'Duplicate retry prevented (replayed: true)'
      : 'Recorded once (replayed: false)'
    : 'Submit an action or query an existing transaction below';

  return (
    <section
      className={`p03-card surface-card ${
        attentionTone !== 'normal' ? `is-${attentionTone}` : ''
      }`}
      id="p03-lookup-panel"
      aria-labelledby="p03-lookup-heading"
      data-testid="p03-lookup-card"
    >
      <div className="p03-title-badge-row">
        <h2 id="p03-lookup-heading" className="p03-section-title">
          Uncertain-Outcome &amp; Idempotency Lookup
        </h2>
        <AttentionBadge tone={attentionTone} />
      </div>
      <p className="p03-muted-copy">
        Recover the committed result using the scoped action and Idempotency Key or public ULID
        without re-issuing numbers.
      </p>

      <dl className="p03-formal-grid">
        <div className="p03-formal-cell">
          <dt className="p03-formal-key">LAST OPERATION STATUS</dt>
          <dd className="p03-formal-val">{statusHeading}</dd>
          <dd className="p03-formal-sub" data-testid="p03-latest-outcome">
            {statusDetail}
          </dd>
        </div>

        <div className="p03-formal-cell">
          <dt className="p03-formal-key">DOCUMENT REFERENCE</dt>
          <dd className="p03-formal-val">
            {snapshot.document_number
              ? `Initial Physical Count (${snapshot.document_number})`
              : 'Draft — Not Yet Issued'}
          </dd>
          <dd className="p03-formal-sub">
            {snapshot.server_material_version !== null
              ? `Active Snapshot: Material Version ${snapshot.server_material_version}`
              : 'No immutable snapshot submitted'}
          </dd>
        </div>

        <div className="p03-formal-cell is-span-2">
          <dt className="p03-formal-key">TRANSACTION REFERENCE (ULID)</dt>
          <dd className="p03-formal-val p03-mono-inline">
            {activeResult?.operation?.identity.operation_id ?? 'Not Assigned'}
          </dd>
          <dd className="p03-formal-sub">Server-assigned durable operation reference</dd>
        </div>
      </dl>

      <div className="p03-lookup-form">
        <div className="p03-lookup-row">
          <div className="form-group">
            <label htmlFor="p03-lookup-chapter" className="form-label">
              Authorized Chapter Scope
            </label>
            <select
              id="p03-lookup-chapter"
              className="form-control"
              value={lookupChapterId}
              onChange={(e) => onChangeChapterId(e.target.value)}
            >
              <option value="1">Chapter 1 — Authorized (YSP Cebu)</option>
              <option value="999">Chapter 999 — Unauthorized Chapter</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="p03-lookup-action" className="form-label">
              Operation Category
            </label>
            <select
              id="p03-lookup-action"
              className="form-control"
              value={lookupActionCode}
              onChange={(e) => onChangeActionCode(e.target.value)}
            >
              <option value="ipc.submit_material">Material Snapshot Submission</option>
              <option value="ipc.record_review">Independent Review Decision</option>
            </select>
          </div>
        </div>

        <div className="p03-lookup-action-grid">
          <div className="form-group">
            <label htmlFor="p03-lookup-key-input" className="form-label">
              Lookup by Idempotency Key
            </label>
            <div className="p03-input-action-row">
              <input
                id="p03-lookup-key-input"
                type="text"
                className="form-control"
                value={lookupKey}
                onChange={(e) => onChangeKey(e.target.value)}
                placeholder="e.g. submit-ipc-v1-01"
              />
              <button
                type="button"
                id="p03-lookup-by-key-btn"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={onLookupByKey}
              >
                Lookup by Key
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="p03-lookup-ulid-input" className="form-label">
              Lookup by Operation ULID
            </label>
            <div className="p03-input-action-row">
              <input
                id="p03-lookup-ulid-input"
                type="text"
                className="form-control is-mono"
                value={lookupOpId}
                onChange={(e) => onChangeOpId(e.target.value)}
                placeholder="01K8A6J0A..."
              />
              <button
                type="button"
                id="p03-lookup-by-ulid-btn"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={onLookupById}
              >
                Lookup by ULID
              </button>
            </div>
          </div>
        </div>
      </div>

      {lookupResult ? (
        <div
          className={`callout-banner ${
            lookupResult.action_result === 'success' ? '' : 'is-error'
          }`}
          data-testid="p03-lookup-result"
        >
          <span
            className={`callout-dot ${
              lookupResult.action_result === 'success' ? 'dot-success' : 'dot-error'
            }`}
            aria-hidden="true"
          />
          <div>
            <strong>
              {lookupResult.action_result === 'success'
                ? 'Recovered Committed Result'
                : lookupResult.blocking_reason?.code ?? lookupResult.action_result.toUpperCase()}
            </strong>
            <div>
              {lookupResult.action_result === 'success'
                ? `${
                    lookupResult.document_number
                      ? `Initial Physical Count (${lookupResult.document_number})`
                      : 'Draft'
                  } · Material Version ${
                    lookupResult.record?.material_version ?? 'N/A'
                  } · Transaction ULID: ${
                    lookupResult.operation?.identity.operation_id ?? 'N/A'
                  } · Verified without duplicate execution`
                : lookupResult.blocking_reason?.message}
            </div>
          </div>
        </div>
      ) : null}

      {snapshot.operation_ledger.length > 0 ? (
        <div className="p03-ledger-chips">
          <span className="session-ledger-key">
            Recent Recorded Operations ({snapshot.operation_ledger.length})
          </span>
          <div className="p03-chip-wrap">
            {snapshot.operation_ledger.map((op) => (
              <button
                key={op.operation_id}
                type="button"
                className="p03-ledger-chip-btn"
                onClick={() => {
                  onChangeActionCode(op.action_code);
                  onChangeKey(op.idempotency_key);
                  onChangeOpId(op.operation_id);
                }}
              >
                <span>
                  {op.action_code === 'ipc.submit_material'
                    ? 'Material Submission'
                    : 'Review Decision'}
                </span>
                <span className="p03-mono-inline">Key: {op.idempotency_key}</span>
                <span className="p03-mono-inline">ULID: &hellip;{op.operation_id.slice(-8)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface LinkedHistoryTimelinePanelProps {
  versions: ReadonlyArray<VersionedSource>;
  attentionTone: AttentionTone;
  searchQuery: string;
  copiedHashId: string | null;
  onCopyHash: (id: string, materialVersion: number, hash: string) => void;
}

export function LinkedHistoryTimelinePanel({
  versions,
  attentionTone,
  searchQuery,
  copiedHashId,
  onCopyHash,
}: LinkedHistoryTimelinePanelProps) {
  const latestVersion =
    versions.length > 0 ? (versions[versions.length - 1]?.target.material_version ?? 0) : 0;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const orderedVersions = [...versions].reverse();
  const visibleVersions = normalizedQuery
    ? orderedVersions.filter((version) => matchesVersionSearch(version, normalizedQuery))
    : orderedVersions;

  return (
    <section
      className={`p03-card surface-card ${
        attentionTone !== 'normal' ? `is-${attentionTone}` : ''
      }`}
      aria-labelledby="p03-history-heading"
      data-testid="p03-history-card"
    >
      <div className="p03-title-badge-row">
        <h2 id="p03-history-heading" className="p03-section-title">
          Immutable Material Version &amp; Review Decision History
        </h2>
        <AttentionBadge tone={attentionTone} />
      </div>
      <p className="p03-muted-copy">
        Prior submitted material snapshots and return reasons remain permanently linked. Revising
        content creates a new immutable version and never copies old approvals forward.
      </p>

      {versions.length === 0 ? (
        <div className="callout-banner">
          <span className="callout-dot dot-info" aria-hidden="true" />
          <span>No immutable material snapshots submitted yet. Current state is an incomplete draft.</span>
        </div>
      ) : visibleVersions.length === 0 ? (
        <div className="callout-banner" data-testid="p03-history-no-match">
          <span className="callout-dot dot-warning" aria-hidden="true" />
          <span>No material versions match &ldquo;{searchQuery.trim()}&rdquo;.</span>
        </div>
      ) : (
        <div className="p03-history-list" data-testid="p03-history-list">
          {visibleVersions.map((version) => {
            const matVer = version.target.material_version;
            const isSuperseded = matVer < latestVersion;
            const line = version.material.lines[0];
            const approvalStatus = version.state.states.approval;
            const statusDotClass =
              approvalStatus === 'approved'
                ? 'toast-dot-success'
                : approvalStatus === 'returned'
                  ? 'toast-dot-error'
                  : 'toast-dot-warning';
            const rawQty = line?.counted_quantity.value ?? '0.000000';
            const unitValuationNum = Number(line?.unit_valuation ?? '0');
            const totalValuationNum = (Number(rawQty) || 0) * (Number.isFinite(unitValuationNum) ? unitValuationNum : 0);

            return (
              <article
                key={matVer}
                className={`p03-history-card ${isSuperseded ? 'is-superseded' : 'is-active'} ${
                  normalizedQuery ? 'is-search-match' : ''
                }`}
                data-testid={`p03-history-v${matVer}`}
              >
                <div className="p03-history-head">
                  <div className="p03-history-title-group">
                    <span className="p03-version-badge">Material Version {matVer}</span>
                    <span className="p03-lineage-pill">
                      {version.previous_version
                        ? `Revises Version ${version.previous_version.material_version}`
                        : 'Initial Submission'}
                    </span>
                    {isSuperseded ? (
                      <span className="p03-superseded-badge">
                        <span className="toast-dot toast-dot-warning" aria-hidden="true" />
                        <span>
                          Superseded by Version {latestVersion} &middot; Prior Approvals Invalidated
                        </span>
                      </span>
                    ) : (
                      <span className="p03-current-badge">
                        <span className={`toast-dot ${statusDotClass}`} aria-hidden="true" />
                        <span>Active &middot; {formatFormalApprovalStatus(approvalStatus)}</span>
                      </span>
                    )}
                  </div>
                  <HashCopyPill
                    hash={version.target.material_hash}
                    materialVersion={matVer}
                    copied={copiedHashId === `history-v${matVer}`}
                    prefix="SHA-256: "
                    previewLength={16}
                    pillTestId={`p03-hash-chip-v${matVer}`}
                    buttonTestId={`p03-copy-hash-v${matVer}`}
                    onCopy={() =>
                      onCopyHash(`history-v${matVer}`, matVer, version.target.material_hash)
                    }
                  />
                </div>

                <dl className="p03-formal-grid">
                  <div className="p03-formal-cell is-span-2">
                    <dt className="p03-formal-key">STATEMENT PURPOSE</dt>
                    <dd className="p03-formal-val">{version.material.purpose}</dd>
                  </div>

                  <div className="p03-formal-cell is-span-2">
                    <dt className="p03-formal-key">VALUATION BASIS</dt>
                    <dd className="p03-formal-val">
                      {line?.valuation_basis || 'Standard Chapter Valuation'}
                    </dd>
                    <dd className="p03-formal-sub">
                      Ext Ref: {version.material.external_reference || 'N/A'} &middot; Parent:
                      CFG-2026-0001 v1
                    </dd>
                  </div>

                  <div className="p03-formal-cell">
                    <dt className="p03-formal-key">COUNTED QUANTITY</dt>
                    <dd className="p03-formal-val">{formatFormalQuantity(rawQty)}</dd>
                    <dd className="p03-formal-sub">Ledger precision: {rawQty}</dd>
                  </div>

                  <div className="p03-formal-cell">
                    <dt className="p03-formal-key">UNIT &amp; TOTAL VALUATION</dt>
                    <dd className="p03-formal-val">{formatCurrencyPhp(unitValuationNum)} / unit</dd>
                    <dd className="p03-formal-sub">Total: {formatCurrencyPhp(totalValuationNum)}</dd>
                  </div>

                  <div className="p03-formal-cell">
                    <dt className="p03-formal-key">PREPARED BY</dt>
                    <dd className="p03-formal-val">{version.prepared_by.actor_name}</dd>
                    <dd className="p03-formal-sub">
                      {formatFormalDuty(version.prepared_by.duty_code)}
                    </dd>
                  </div>

                  <div className="p03-formal-cell">
                    <dt className="p03-formal-key">SUBMITTED TIMESTAMP</dt>
                    <dd className="p03-formal-val">
                      {formatManilaTimestamp(version.prepared_by.captured_at)}
                    </dd>
                  </div>
                </dl>

                <div className="p03-decisions-wrap">
                  <span className="session-ledger-key">
                    REVIEW &amp; APPROVAL LOG ({version.decisions.length})
                  </span>
                  {version.decisions.length === 0 ? (
                    <div className="p03-decision-item is-empty">
                      <p className="p03-empty-decisions">
                        Awaiting independent review from Chapter Head and Finance.
                      </p>
                    </div>
                  ) : (
                    <ul className="p03-decision-items">
                      {version.decisions.map((decision) => (
                        <li key={decision.id} className="p03-decision-item">
                          <span className={`p03-decision-tag is-${decision.decision}`}>
                            {DECISION_LABELS[decision.decision]}
                          </span>
                          <div className="p03-decision-body">
                            <div className="p03-decision-meta">
                              <strong>{decision.actor.actor_name}</strong> &middot;{' '}
                              <span>{formatFormalDuty(decision.actor.duty_code)}</span> &middot;{' '}
                              <span className="p03-muted-inline">
                                {formatManilaTimestamp(decision.decided_at)}
                              </span>
                            </div>
                            <div className="p03-decision-reason">
                              <span className="p03-remarks-label">Official Remarks:</span> &ldquo;
                              {decision.reason}&rdquo;
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface P03RecordWorkspaceProps {
  soundEnabled: boolean;
  onBackToDashboard?: (() => void) | undefined;
  onNotify?: ((tone: 'success' | 'warning' | 'error' | 'info', text: string) => void) | undefined;
}

const PERSONA_OPTIONS: ReadonlyArray<{
  key: string;
  actor_id: string;
  actor_name: string;
  duty_code: DutyCode;
  label: string;
}> = [
  {
    key: 'head_21',
    actor_id: '21',
    actor_name: 'Laurence Parojinog',
    duty_code: 'CHAPTER_HEAD',
    label: 'Laurence Parojinog — Chapter Head (Approver 1)',
  },
  {
    key: 'finance_22',
    actor_id: '22',
    actor_name: 'Maria Clara Santos',
    duty_code: 'FINANCE',
    label: 'Maria Clara Santos — Finance (Approver 2)',
  },
  {
    key: 'preparer_11',
    actor_id: '11',
    actor_name: 'Ana Maria Reyes',
    duty_code: 'RECEIVING',
    label: 'Ana Maria Reyes — Receiving (Preparer)',
  },
  {
    key: 'head_as_finance_21',
    actor_id: '21',
    actor_name: 'Laurence Parojinog',
    duty_code: 'FINANCE',
    label: 'Laurence Parojinog — Finance Role',
  },
];

export function P03RecordWorkspace({
  soundEnabled,
  onBackToDashboard,
  onNotify,
}: P03RecordWorkspaceProps) {
  const [engine] = useState(() => createP03RecordEngine());

  const [snapshot, setSnapshot] = useState<P03EngineSnapshot>(() => engine.getSnapshot());
  const [draftForm, setDraftForm] = useState<DraftPayload>(() => ({
    ...snapshot.draft.draft_payload,
  }));
  const [expectedRowVersion, setExpectedRowVersion] = useState<number>(
    () => snapshot.server_row_version
  );
  const [expectedMaterialVersion, setExpectedMaterialVersion] = useState<number | null>(
    () => snapshot.server_material_version
  );
  const [submitKey, setSubmitKey] = useState<string>('submit-ipc-v1-01');

  const [reviewPersonaKey, setReviewPersonaKey] = useState<string>('head_21');
  const [reviewDecision, setReviewDecision] = useState<ReviewDecisionType>('approve');
  const [reviewReason, setReviewReason] = useState<string>(
    'Verified independent opening count purpose and unit valuations.'
  );
  const [reviewKey, setReviewKey] = useState<string>('review-ipc-01');

  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [lastSubmitFailed, setLastSubmitFailed] = useState<boolean>(false);
  const [lastReviewFailed, setLastReviewFailed] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterTabId>('submission_approval');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  const [lookupChapterId, setLookupChapterId] = useState<string>('1');
  const [lookupActionCode, setLookupActionCode] = useState<string>('ipc.submit_material');
  const [lookupKey, setLookupKey] = useState<string>('submit-ipc-v1-01');
  const [lookupOpId, setLookupOpId] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<ActionResult | null>(null);

  const nextSubmitSeqRef = useRef(1);
  const nextReviewSeqRef = useRef(1);
  const copyTimerRef = useRef<number | null>(null);

  const activePersona = useMemo(
    () => PERSONA_OPTIONS.find((p) => p.key === reviewPersonaKey) ?? PERSONA_OPTIONS[0],
    [reviewPersonaKey]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchedVersions = useMemo(
    () =>
      normalizedSearch
        ? snapshot.version_history.filter((version) =>
            matchesVersionSearch(version, normalizedSearch)
          )
        : snapshot.version_history,
    [normalizedSearch, snapshot.version_history]
  );

  function handleCopyMaterialHash(id: string, materialVersion: number, hash: string) {
    playScribblenauts(soundEnabled);
    copyHashToClipboard(hash);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    setCopiedHashId(id);
    onNotify?.('info', `Copied Material v${materialVersion} hash: ${hash.slice(0, 16)}…`);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedHashId(null);
      copyTimerRef.current = null;
    }, 2500);
  }

  function refreshFromServer(syncClientVersions: boolean) {
    const nextSnap = engine.getSnapshot();
    setSnapshot(nextSnap);
    if (syncClientVersions) {
      setExpectedRowVersion(nextSnap.server_row_version);
      setExpectedMaterialVersion(nextSnap.server_material_version);
    }
  }

  function handleSaveDraft() {
    playClickPen(soundEnabled);
    const res = engine.saveDraft({ payload: draftForm });
    setLastResult(res);
    setLastSubmitFailed(res.action_result !== 'success');
    refreshFromServer(true);
    if (res.action_result === 'success') {
      onNotify?.('success', `Draft saved (row version v${res.record?.row_version ?? '?'})`);
    }
  }

  function handleSubmitMaterial() {
    playClickPen(soundEnabled);
    const res = engine.submitMaterial({
      idempotency_key: submitKey,
      expected_row_version: expectedRowVersion,
      expected_material_version: expectedMaterialVersion,
      purpose: draftForm.purpose,
      cutoff_at: draftForm.cutoff_at,
      counted_at: draftForm.counted_at,
      counted_quantity: draftForm.counted_quantity,
      unit_valuation: draftForm.unit_valuation,
      valuation_basis: draftForm.valuation_basis,
      external_reference: draftForm.external_reference,
    });

    setLastResult(res);
    setLookupActionCode('ipc.submit_material');
    setLookupKey(submitKey);

    if (res.action_result === 'success') {
      setLastSubmitFailed(false);
      refreshFromServer(true);
      if (res.operation?.identity.operation_id) {
        setLookupOpId(res.operation.identity.operation_id);
      }
      onNotify?.(
        'success',
        res.operation?.replayed
          ? `Replayed idempotent submission (${res.document_number ?? 'IPC'})`
          : `Committed ${res.document_number ?? 'IPC'} · Material v${
              res.record?.material_version ?? '?'
            }`
      );
    } else {
      setLastSubmitFailed(true);
      setSnapshot(engine.getSnapshot());
      onNotify?.('error', res.blocking_reason?.code ?? 'Submission blocked');
    }
  }

  function handleRecordDecision() {
    playClickPen(soundEnabled);
    if (!activePersona) return;

    const snapBefore = engine.getSnapshot();
    const targetMat = expectedMaterialVersion ?? snapBefore.server_material_version ?? 1;

    const res = engine.recordReviewDecision({
      idempotency_key: reviewKey,
      expected_row_version: expectedRowVersion,
      expected_material_version: targetMat,
      decision: reviewDecision,
      actor_id: activePersona.actor_id,
      actor_name: activePersona.actor_name,
      duty_code: activePersona.duty_code,
      reason: reviewReason,
    });

    setLastResult(res);
    if (res.action_result === 'success') {
      setLastReviewFailed(false);
      refreshFromServer(true);
      nextReviewSeqRef.current += 1;
      setReviewKey(`review-ipc-${String(nextReviewSeqRef.current).padStart(2, '0')}`);
      onNotify?.('success', `Recorded ${reviewDecision.toUpperCase()} decision`);
    } else {
      setLastReviewFailed(true);
      setSnapshot(engine.getSnapshot());
      onNotify?.('error', res.blocking_reason?.code ?? 'Review decision blocked');
    }
  }

  function handleGenerateSubmitKey() {
    playClickPen(soundEnabled);
    nextSubmitSeqRef.current += 1;
    setSubmitKey(`submit-ipc-v1-${String(nextSubmitSeqRef.current).padStart(2, '0')}`);
  }

  function handleLookupByKey() {
    playClickPen(soundEnabled);
    const res = engine.lookupOperation({
      kind: 'by_key',
      chapter_id: lookupChapterId,
      action_code: lookupActionCode,
      idempotency_key: lookupKey,
    });
    setLookupResult(res);
    if (res.action_result === 'success') {
      refreshFromServer(true);
      onNotify?.('success', 'Recovered committed result via scoped key lookup');
    } else {
      onNotify?.('warning', res.blocking_reason?.code ?? 'Lookup did not match');
    }
  }

  function handleLookupById() {
    playClickPen(soundEnabled);
    const res = engine.lookupOperation({
      kind: 'by_id',
      chapter_id: lookupChapterId,
      operation_id: lookupOpId,
    });
    setLookupResult(res);
    if (res.action_result === 'success') {
      refreshFromServer(true);
      onNotify?.('success', 'Recovered committed result via ULID lookup');
    } else {
      onNotify?.('warning', res.blocking_reason?.code ?? 'ULID lookup did not match');
    }
  }

  const currentApproval = snapshot.current_source?.state.states.approval ?? 'draft';
  const currentException = snapshot.current_source?.state.states.exception ?? 'none';
  const isReturned = currentApproval === 'returned';
  const isApproved = currentApproval === 'approved';
  const isSubmitted = currentApproval === 'submitted' || currentApproval === 'requires_review';

  // Visual attention tones per container:
  // Yellow ('needs-action') = requires user step; Red ('serious-attention') = error/returned/blocked
  const stateTone: AttentionTone =
    isReturned || currentException === 'open' || (lastResult !== null && lastResult.action_result !== 'success')
      ? 'serious-attention'
      : snapshot.current_source === null || isSubmitted
        ? 'needs-action'
        : 'normal';

  const submitTone: AttentionTone =
    lastSubmitFailed || isReturned
      ? 'serious-attention'
      : snapshot.current_source === null
        ? 'needs-action'
        : 'normal';

  const reviewTone: AttentionTone =
    lastReviewFailed || isReturned || currentException === 'open'
      ? 'serious-attention'
      : snapshot.current_source !== null && !isApproved
        ? 'needs-action'
        : 'normal';

  const lookupTone: AttentionTone =
    (lookupResult !== null && lookupResult.action_result !== 'success') ||
    lastResult?.action_result === 'uncertain'
      ? 'serious-attention'
      : snapshot.operation_ledger.length > 0 && lastSubmitFailed && lookupResult === null
        ? 'needs-action'
        : 'normal';

  const historyTone: AttentionTone = isReturned
    ? 'serious-attention'
    : snapshot.version_history.length === 0 || isSubmitted
      ? 'needs-action'
      : 'normal';

  const showSubmitAndApproval = activeFilter === 'submission_approval';
  const showVersionHistory = activeFilter === 'version_history';
  const showIdempotencyLookup = activeFilter === 'idempotency_lookup';

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row" role="search" aria-label="Search material versions">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="p03-version-search-input"
                data-testid="p03-version-search-input"
                type="search"
                className="form-control p03-search-input"
                placeholder="Search Material Version by hash, version (e.g. v1, v2), purpose, or reviewer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && normalizedSearch && !showVersionHistory) {
                    playClickPen(soundEnabled);
                    setActiveFilter('version_history');
                  }
                }}
              />
            </div>

            {normalizedSearch ? (
              <div className="p03-search-meta">
                <span className="p03-attention-badge" data-testid="p03-search-match-pill">
                  <span
                    className={`toast-dot ${
                      matchedVersions.length > 0 ? 'toast-dot-info' : 'toast-dot-warning'
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {matchedVersions.length === 1
                      ? `1 match · Material v${matchedVersions[0]?.target.material_version ?? '?'}`
                      : matchedVersions.length > 1
                        ? `${matchedVersions.length} matching versions`
                        : 'No matching version'}
                  </span>
                </span>

                {!showVersionHistory && matchedVersions.length > 0 ? (
                  <button
                    type="button"
                    className="p03-search-action-btn"
                    data-testid="p03-search-view-history-btn"
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setActiveFilter('version_history');
                    }}
                  >
                    View History
                  </button>
                ) : null}

                <button
                  type="button"
                  className="p03-search-clear-btn"
                  data-testid="p03-search-clear-btn"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    setSearchQuery('');
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              {onBackToDashboard ? (
                <button
                  type="button"
                  className="nav-back-btn"
                  aria-label="Return"
                  title="Return"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    onBackToDashboard();
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              ) : null}
              <h1 id="p03-workspace-title" className="p03-main-title">
                Record, Version &amp; Durable Operation
              </h1>
            </div>

            <div className="p03-header-controls">
              <div
                className="p03-filter-pill-bar"
                role="tablist"
                aria-label="Record workspace views"
              >
                {(
                  [
                    {
                      id: 'submission_approval',
                      label: 'Submission & Approval',
                      testId: 'p03-filter-submission-approval',
                    },
                    {
                      id: 'idempotency_lookup',
                      label: 'Idempotency Lookup',
                      testId: 'p03-filter-idempotency-lookup',
                    },
                    {
                      id: 'version_history',
                      label: 'Version History',
                      testId: 'p03-filter-version-history',
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === tab.id}
                    data-testid={tab.testId}
                    className={`p03-filter-pill ${activeFilter === tab.id ? 'is-active' : ''}`}
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setActiveFilter(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {onBackToDashboard ? (
                <button
                  type="button"
                  id="p03-back-dashboard-btn"
                  className="btn-batcave-secondary p03-shrink-btn"
                  onClick={() => {
                    playClickPen(soundEnabled);
                    onBackToDashboard();
                  }}
                >
                  Back to Chapter Workspace
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <RecordStateHeader snapshot={snapshot} attentionTone={stateTone} />

        <BlockerAndStaleComparisonPanel
          lastResult={lastResult}
          localDraft={draftForm}
          localExpectedRowVersion={expectedRowVersion}
          localExpectedMaterialVersion={expectedMaterialVersion}
          serverSnapshot={snapshot}
          onSyncExpectedVersions={() => {
            playClickPen(soundEnabled);
            refreshFromServer(true);
            setLastResult(null);
            setLastSubmitFailed(false);
            setLastReviewFailed(false);
            onNotify?.('info', 'Synchronized expected versions to current server state');
          }}
          onFocusLookup={(actionCode, idempotencyKey) => {
            if (actionCode) setLookupActionCode(actionCode);
            if (idempotencyKey) setLookupKey(idempotencyKey);
            setActiveFilter('idempotency_lookup');
          }}
        />

        <div className="p03-birdseye-grid">
          {showVersionHistory ? (
            <LinkedHistoryTimelinePanel
              versions={snapshot.version_history}
              attentionTone={historyTone}
              searchQuery={searchQuery}
              copiedHashId={copiedHashId}
              onCopyHash={handleCopyMaterialHash}
            />
          ) : null}

          {showSubmitAndApproval ? (
            <section
              className={`p03-card surface-card ${
                submitTone !== 'normal' ? `is-${submitTone}` : ''
              }`}
                aria-labelledby="p03-draft-form-heading"
                data-testid="p03-submit-card"
              >
                <div className="p03-title-badge-row">
                  <h2 id="p03-draft-form-heading" className="p03-section-title">
                    Draft &amp; Immutable Material Submission
                  </h2>
                  <AttentionBadge tone={submitTone} />
                </div>
                <p className="p03-muted-copy">
                  Incomplete drafts advance row version without creating a material snapshot.
                  Submission publishes an immutable hash-pinned snapshot and issues a once-only
                  document reference.
                </p>

                <div className="form-stack">
                  <div className="form-group">
                    <label htmlFor="p03-purpose-input" className="form-label">
                      Opening Count Purpose <span className="required-star">*</span>
                    </label>
                    <input
                      id="p03-purpose-input"
                      type="text"
                      className="form-control"
                      value={draftForm.purpose}
                      onChange={(e) =>
                        setDraftForm((prev) => ({ ...prev, purpose: e.target.value }))
                      }
                    />
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p03-qty-input" className="form-label">
                        Line 501 Counted Quantity <span className="required-star">*</span>
                      </label>
                      <input
                        id="p03-qty-input"
                        type="text"
                        className="form-control is-mono"
                        value={draftForm.counted_quantity}
                        onChange={(e) =>
                          setDraftForm((prev) => ({ ...prev, counted_quantity: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p03-valuation-input" className="form-label">
                        Unit Valuation (PHP) <span className="required-star">*</span>
                      </label>
                      <input
                        id="p03-valuation-input"
                        type="text"
                        className="form-control is-mono"
                        value={draftForm.unit_valuation}
                        onChange={(e) =>
                          setDraftForm((prev) => ({ ...prev, unit_valuation: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p03-basis-input" className="form-label">
                        Valuation Basis <span className="required-star">*</span>
                      </label>
                      <input
                        id="p03-basis-input"
                        type="text"
                        className="form-control"
                        value={draftForm.valuation_basis}
                        onChange={(e) =>
                          setDraftForm((prev) => ({ ...prev, valuation_basis: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p03-external-ref-input" className="form-label">
                        External Document Reference
                      </label>
                      <input
                        id="p03-external-ref-input"
                        data-testid="p03-external-ref-input"
                        type="text"
                        className="form-control is-mono"
                        value={draftForm.external_reference ?? ''}
                        placeholder="e.g. COUNT-SHEET-CEB-2026-01"
                        onChange={(e) =>
                          setDraftForm((prev) => ({ ...prev, external_reference: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="p03-two-col">
                    <div className="form-group">
                      <label htmlFor="p03-expected-row" className="form-label">
                        Expected Row Version
                      </label>
                      <input
                        id="p03-expected-row"
                        type="number"
                        min={1}
                        className="form-control is-mono"
                        value={expectedRowVersion}
                        onChange={(e) =>
                          setExpectedRowVersion(Math.max(1, Number(e.target.value) || 1))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="p03-expected-material" className="form-label">
                        Expected Material Version
                      </label>
                      <input
                        id="p03-expected-material"
                        type="text"
                        className="form-control is-mono"
                        value={expectedMaterialVersion ?? ''}
                        placeholder="Draft"
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          setExpectedMaterialVersion(
                            raw === '' ? null : Math.max(1, Number(raw) || 1)
                          );
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p03-submit-key-input" className="form-label">
                      Idempotency Key (Scoped by Chapter + Action)
                    </label>
                    <div className="p03-input-action-row">
                      <input
                        id="p03-submit-key-input"
                        type="text"
                        className="form-control is-mono"
                        value={submitKey}
                        onChange={(e) => setSubmitKey(e.target.value)}
                      />
                      <button
                        type="button"
                        id="p03-new-key-btn"
                        className="btn-batcave-secondary p03-shrink-btn"
                        onClick={handleGenerateSubmitKey}
                      >
                        New Key
                      </button>
                    </div>
                  </div>

                  <div className="p03-action-stack">
                    <button
                      type="button"
                      id="p03-save-draft-btn"
                      className="btn-batcave-secondary"
                      onClick={handleSaveDraft}
                    >
                      Save Incomplete Draft
                    </button>
                    <button
                      type="button"
                      id="p03-submit-material-btn"
                      className="btn-batcave-primary"
                      onClick={handleSubmitMaterial}
                    >
                      Submit Immutable Material Snapshot
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {showSubmitAndApproval ? (
              <section
                className={`p03-card surface-card ${
                  reviewTone !== 'normal' ? `is-${reviewTone}` : ''
                }`}
                aria-labelledby="p03-review-heading"
                data-testid="p03-review-card"
              >
                <div className="p03-title-badge-row">
                  <h2 id="p03-review-heading" className="p03-section-title">
                    Independent Review &amp; Approval
                  </h2>
                  <AttentionBadge tone={reviewTone} />
                </div>
                <p className="p03-muted-copy">
                  Requires two distinct individual approvers (Chapter Head and Finance) on the active
                  material version. Self-approval and same-person dual-role approvals are rejected.
                </p>

                <div className="form-stack">
                  <div className="form-group">
                    <label htmlFor="p03-review-persona" className="form-label">
                      Acting Officer Identity &amp; Duty
                    </label>
                    <select
                      id="p03-review-persona"
                      className="form-control"
                      value={reviewPersonaKey}
                      onChange={(e) => setReviewPersonaKey(e.target.value)}
                    >
                      {PERSONA_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p03-review-decision" className="form-label">
                      Review Decision
                    </label>
                    <select
                      id="p03-review-decision"
                      className="form-control"
                      value={reviewDecision}
                      onChange={(e) => setReviewDecision(e.target.value as ReviewDecisionType)}
                    >
                      <option value="approve">Approve Current Material Version</option>
                      <option value="return">Return for Clarification / Revision</option>
                      <option value="hold">Hold (Open Exception)</option>
                      <option value="reject">Reject</option>
                      <option value="cancel">Cancel Record (Retain Reason in History)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="p03-review-reason" className="form-label">
                      Decision Reason <span className="required-star">*</span>
                    </label>
                    <textarea
                      id="p03-review-reason"
                      rows={3}
                      className="form-control"
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="Enter specific review rationale preserved in append-only history..."
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="p03-review-key" className="form-label">
                      Review Idempotency Key
                    </label>
                    <input
                      id="p03-review-key"
                      type="text"
                      className="form-control is-mono"
                      value={reviewKey}
                      onChange={(e) => setReviewKey(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    id="p03-record-decision-btn"
                    className="btn-batcave-primary"
                    onClick={handleRecordDecision}
                  >
                    Record Review Decision
                  </button>
                </div>
              </section>
            ) : null}

            {showIdempotencyLookup ? (
              <UncertainOutcomeLookupPanel
                snapshot={snapshot}
                activeResult={lastResult}
                attentionTone={lookupTone}
                lookupChapterId={lookupChapterId}
                lookupActionCode={lookupActionCode}
                lookupKey={lookupKey}
                lookupOpId={lookupOpId}
                lookupResult={lookupResult}
                onChangeChapterId={setLookupChapterId}
                onChangeActionCode={setLookupActionCode}
                onChangeKey={setLookupKey}
                onChangeOpId={setLookupOpId}
                onLookupByKey={handleLookupByKey}
                onLookupById={handleLookupById}
              />
            ) : null}
        </div>
      </div>
    </main>
  );
}
