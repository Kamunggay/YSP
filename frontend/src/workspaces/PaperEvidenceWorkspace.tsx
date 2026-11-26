import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { apiGet, apiGetBlob, apiMutate, formatManilaTime, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot, EvidencePurpose } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface EvidenceAttachment {
  attachment_id: string;
  media_type: string;
  byte_length: number;
  sha256: string;
}

interface EvidenceVersion {
  evidence_id: string;
  version_id: string;
  version: number;
  technical_state: string;
  invalid_reason: string | null;
  uploaded_at: string;
  replacement_reason: string | null;
  attachments: EvidenceAttachment[];
}

interface PaperEvidenceWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

export function PaperEvidenceWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: PaperEvidenceWorkspaceProps) {
  const [viewTab, setViewTab] = useState<'manage' | 'history'>('manage');
  const formKey = 'paper_evidence_editor';

  function readSavedDraft(): {
    purpose?: EvidencePurpose;
    recordId?: string;
    evidenceIdInput?: string;
    expectedVersion?: string;
    replaceReason?: string;
  } {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as {
        purpose?: EvidencePurpose;
        recordId?: string;
        evidenceIdInput?: string;
        expectedVersion?: string;
        replaceReason?: string;
      };
    } catch {
      return {};
    }
  }

  const initialDraft = readSavedDraft();
  const [purpose, setPurpose] = useState<EvidencePurpose>(initialDraft.purpose ?? 'opening_receipt');
  const [recordId, setRecordId] = useState(initialDraft.recordId ?? '');
  const [files, setFiles] = useState<FileList | null>(null);

  const [evidenceIdInput, setEvidenceIdInput] = useState(initialDraft.evidenceIdInput ?? '');
  const [expectedVersion, setExpectedVersion] = useState(initialDraft.expectedVersion ?? '1');
  const [replaceReason, setReplaceReason] = useState(initialDraft.replaceReason ?? '');

  const [readResult, setReadResult] = useState<{ current_version?: EvidenceVersion } | null>(null);
  const [versionsJson, setVersionsJson] = useState<unknown>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const prepareReason = actionBlockReason(chapterAccess, 'evidence.prepare');
  const readReason = actionBlockReason(chapterAccess, 'evidence.read');

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: evidenceIdInput.trim() ? `Evidence ${evidenceIdInput.trim().slice(0, 8)}` : `Evidence (${purpose})`,
      baseVersion: Number.parseInt(expectedVersion, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({ purpose, recordId, evidenceIdInput, expectedVersion, replaceReason }),
    });
    setStatusMessage('Document details saved as a temporary draft for this session (reattach files if you switch chapters).');
  }

  function buildFormData(isReplace: boolean): FormData {
    const fd = new FormData();
    if (isReplace) {
      fd.append('expected_version', expectedVersion.trim());
      fd.append('reason', replaceReason.trim());
    } else {
      fd.append('purpose', purpose);
      fd.append('record_id', recordId.trim());
    }
    if (files) {
      for (const f of Array.from(files)) {
        fd.append('attachments', f, f.name);
      }
    }
    return fd;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setError(new Error('Select at least one JPEG, PNG, or PDF file (max 10 MiB each).'));
      return;
    }
    setBusy(true);
    setError(null);
    setReplayed(false);
    const key = newActionKey();
    try {
      const { result } = await apiMutate<EvidenceVersion>(
        'POST',
        `/api/v1/chapters/${chapterId}/evidence`,
        buildFormData(false),
        key,
      );
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setEvidenceIdInput(result.data.evidence_id);
      setExpectedVersion(String(result.data.version));
      setReplayed(result.replayed);
      setStatusMessage(`Signed document uploaded (Record ${result.data.evidence_id}, rev. ${result.data.version}).`);
      await inspectEvidence(result.data.evidence_id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleReplace(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceIdInput.trim() || !files || files.length === 0) {
      setError(new Error('Enter the Document Record ID and select replacement file(s).'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { result } = await apiMutate<EvidenceVersion>(
        'POST',
        `/api/v1/chapters/${chapterId}/evidence/${evidenceIdInput.trim()}/versions`,
        buildFormData(true),
      );
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setExpectedVersion(String(result.data.version));
      setReplayed(result.replayed);
      setStatusMessage(`Replacement document uploaded (rev. ${result.data.version}).`);
      await inspectEvidence(result.data.evidence_id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const inspectEvidence = useCallback(
    async (targetEid = evidenceIdInput.trim()) => {
      if (!targetEid) {
        return;
      }
      setError(null);
      try {
        const [detail, vers] = await Promise.all([
          apiGet<{ current_version?: EvidenceVersion }>(`/api/v1/chapters/${chapterId}/evidence/${targetEid}`),
          apiGet<unknown>(`/api/v1/chapters/${chapterId}/evidence/${targetEid}/versions?limit=25`),
        ]);
        setReadResult(detail.data);
        setVersionsJson(vers.data);
        if (detail.data.current_version) {
          setExpectedVersion(String(detail.data.current_version.version));
        }
      } catch (err) {
        setError(err);
      }
    },
    [chapterId, evidenceIdInput],
  );

  useEffect(() => {
    if (refreshSignal === 0 || !evidenceIdInput.trim() || readReason !== null) {
      return;
    }
    let active = true;
    const targetEid = evidenceIdInput.trim();
    void (async () => {
      try {
        const [detail, vers] = await Promise.all([
          apiGet<{ current_version?: EvidenceVersion }>(`/api/v1/chapters/${chapterId}/evidence/${targetEid}`),
          apiGet<unknown>(`/api/v1/chapters/${chapterId}/evidence/${targetEid}/versions?limit=25`),
        ]);
        if (!active) {
          return;
        }
        setReadResult(detail.data);
        setVersionsJson(vers.data);
        setError(null);
        if (detail.data.current_version) {
          setExpectedVersion(String(detail.data.current_version.version));
        }
      } catch (err) {
        if (active) {
          setError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterId, evidenceIdInput, readReason, refreshSignal]);

  async function downloadAttachment(versionId: string, attachmentId: string) {
    setError(null);
    try {
      const { blob } = await apiGetBlob(
        `/api/v1/chapters/${chapterId}/evidence/${evidenceIdInput.trim()}/versions/${versionId}/attachments/${attachmentId}/content`,
      );
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                id="ev-top-lookup"
                className="form-control p03-search-input"
                value={evidenceIdInput}
                onChange={(e) => setEvidenceIdInput(e.target.value)}
                placeholder="Enter document record reference to inspect..."
                aria-label="Enter document record reference to inspect"
              />
            </div>

            <div className="p03-search-meta">
              {readResult?.current_version && (
                <span className="p03-version-pill">rev. {readResult.current_version.version}</span>
              )}
              {evidenceIdInput.trim().length > 0 && (
                <button
                  type="button"
                  className="p03-search-clear-btn"
                  onClick={() => setEvidenceIdInput('')}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="p03-search-action-btn"
                disabled={readReason !== null}
                title={readReason ?? undefined}
                onClick={() => {
                  void inspectEvidence();
                  setViewTab('history');
                }}
              >
                Inspect Document
              </button>
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Signed Documents</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Document sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'manage'}
                  className={`p03-filter-pill ${viewTab === 'manage' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('manage')}
                >
                  Upload &amp; Replace
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'history'}
                  className={`p03-filter-pill ${viewTab === 'history' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('history')}
                >
                  Attachments &amp; History
                </button>
              </div>
              {onBackToDashboard && (
                <button
                  type="button"
                  className="btn-batcave-secondary p04-back-btn"
                  onClick={onBackToDashboard}
                >
                  ← Back to My Work
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="p03-card surface-card form-stack" aria-label="Signed document verification overview">
          <div className="p03-card-header-row">
            <div>
              <h2 className="p03-section-title">Signed Paper Verification</h2>
              <p className="form-card-subtitle">
                Upload verified scans or PDFs and bind them to chapter receipts, clearances, and issues.
              </p>
            </div>
            <div className="p03-chip-wrap">
              <span className="p03-version-pill">
                {readResult?.current_version
                  ? `${readResult.current_version.attachments.length} attachment${readResult.current_version.attachments.length === 1 ? '' : 's'}`
                  : 'Ready to Upload'}
              </span>
            </div>
          </div>
          <OperationBanner
            error={error}
            statusMessage={statusMessage}
            replayed={replayed}
            onDismiss={() => setStatusMessage(null)}
          />
          {prepareReason && (
            <div className="callout-banner is-warning">
              <span className="callout-dot dot-warning" aria-hidden="true" />
              <span>{prepareReason}</span>
            </div>
          )}
        </section>

        {viewTab === 'manage' ? (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Upload signed document">
              <div>
                <h2 className="p03-section-title">Upload Signed Document</h2>
                <p className="form-card-subtitle">
                  Attach photos or scans of your signed paper forms (JPEG, PNG, or PDF, up to 10 MiB each).
                </p>
              </div>

              <form onSubmit={handleUpload} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="ev-purpose">
                    Document Type
                  </label>
                  <select
                    id="ev-purpose"
                    className="form-control"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as EvidencePurpose)}
                  >
                    <option value="opening_receipt">Opening Inventory Receipt</option>
                    <option value="hold_clearance">Stock Hold Clearance</option>
                    <option value="actual_issue">Issue Handover Form</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ev-rec">
                    Linked Record Reference
                  </label>
                  <input
                    id="ev-rec"
                    className="form-control"
                    required
                    value={recordId}
                    onChange={(e) => setRecordId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ev-files">
                    Signed Paper Files (JPEG, PNG, or PDF)
                  </label>
                  <input
                    id="ev-files"
                    className="form-control p04-file-input"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => setFiles(e.target.files)}
                  />
                </div>

                <div className="p03-guard-buttons">
                  <button
                    className="btn-batcave-primary"
                    type="submit"
                    disabled={busy || prepareReason !== null}
                    title={prepareReason ?? undefined}
                  >
                    Upload Document
                  </button>
                  <button
                    className="btn-batcave-secondary"
                    type="button"
                    onClick={parkDraftInMemory}
                  >
                    Save Temporary Draft
                  </button>
                </div>
              </form>
            </section>

            <section className="p03-card surface-card form-stack" aria-label="View or replace uploaded document">
              <h2 className="p03-section-title">
                Replace Uploaded Document
              </h2>
              <form onSubmit={handleReplace} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="ev-id">
                    Document Record Reference
                  </label>
                  <input
                    id="ev-id"
                    className="form-control"
                    required
                    value={evidenceIdInput}
                    onChange={(e) => setEvidenceIdInput(e.target.value)}
                  />
                </div>

                <div className="p03-two-col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-ver">
                      Current Revision Number
                    </label>
                    <input
                      id="ev-ver"
                      className="form-control"
                      type="number"
                      min={1}
                      value={expectedVersion}
                      onChange={(e) => setExpectedVersion(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ev-reason">
                      Replacement Reason
                    </label>
                    <input
                      id="ev-reason"
                      className="form-control"
                      value={replaceReason}
                      onChange={(e) => setReplaceReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p03-guard-buttons">
                  <button
                    className="btn-batcave-secondary"
                    type="button"
                    disabled={readReason !== null}
                    title={readReason ?? undefined}
                    onClick={() => {
                      void inspectEvidence();
                      setViewTab('history');
                    }}
                  >
                    Inspect Revisions
                  </button>
                  <button
                    className="btn-batcave-primary"
                    type="submit"
                    disabled={busy || prepareReason !== null}
                    title={prepareReason ?? undefined}
                  >
                    Upload Replacement
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : (
          <div className="p02-column-stack">
            <section className="p03-card surface-card form-stack" aria-label="Document attachments">
              <div className="p03-card-header-row">
                <div>
                  <h2 className="p03-section-title">
                    {readResult?.current_version
                      ? `Revision v${readResult.current_version.version} · ${readResult.current_version.technical_state}`
                      : 'Document Attachments'}
                  </h2>
                  {readResult?.current_version && (
                    <p className="form-card-subtitle">
                      Uploaded {formatManilaTime(readResult.current_version.uploaded_at)}
                    </p>
                  )}
                </div>
              </div>

              {!readResult?.current_version ? (
                <p className="p03-muted-copy">
                  No document loaded. Enter a document record reference in the search bar above and click “Inspect Document”.
                </p>
              ) : (
                <div className="p03-history-list">
                  {readResult.current_version.attachments.map((att, idx) => (
                    <article key={att.attachment_id} className="p03-history-card">
                      <div className="p03-history-head">
                        <div className="p03-history-title-group">
                          <span className="p03-version-pill p03-id-pill p03-mono-inline">File {idx + 1}</span>
                          <strong>{att.media_type}</strong>
                          <span className="p03-version-pill">{att.byte_length} bytes</span>
                        </div>
                        <button
                          type="button"
                          className="p02-compact-btn"
                          onClick={() => void downloadAttachment(readResult.current_version!.version_id, att.attachment_id)}
                        >
                          Load File
                        </button>
                      </div>
                      <div className="p03-history-meta">
                        <span className="p03-muted-inline">Verification tag: {att.sha256.slice(0, 16)}...</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {previewUrl && (
                <div className="p03-next-actions-row">
                  <a href={previewUrl} target="_blank" rel="noreferrer" className="btn-batcave-primary">
                    Open Loaded File
                  </a>
                </div>
              )}
            </section>

            {versionsJson !== null && (
              <section className="p03-card surface-card form-stack" aria-label="Document revision history">
                <h2 className="p03-section-title">
                  Document Revision History
                </h2>
                <pre className="json-box">{JSON.stringify(versionsJson, null, 2)}</pre>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
