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
}

export function PaperEvidenceWorkspace({ userId, chapterId, refreshSignal, chapterAccess }: PaperEvidenceWorkspaceProps) {
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
    <div>
      <div className="card">
        <h2>Signed Documents</h2>
        <p className="muted">
          Upload photos or scans of your signed paper forms (JPEG, PNG, or PDF, up to 10 MiB each).
        </p>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />
        {prepareReason && <div className="alert info">{prepareReason}</div>}

        <div className="grid-2">
          <form onSubmit={handleUpload}>
            <h3>Upload Signed Document</h3>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-purpose">Document Type</label>
              <select id="ev-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as EvidencePurpose)}>
                <option value="opening_receipt">Opening Inventory Receipt</option>
                <option value="hold_clearance">Stock Hold Clearance</option>
                <option value="actual_issue">Issue Handover Form</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-rec">Linked Record ID</label>
              <input id="ev-rec" required value={recordId} onChange={(e) => setRecordId(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="ev-files">Signed Paper Files (JPEG/PNG/PDF, max 10 MiB each)</label>
              <input id="ev-files" type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFiles(e.target.files)} />
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={busy || prepareReason !== null} title={prepareReason ?? undefined}>
                Upload Document
              </button>
              <button className="btn secondary" type="button" onClick={parkDraftInMemory}>
                Save Temporary Draft
              </button>
            </div>
          </form>

          <form onSubmit={handleReplace}>
            <h3>View or Replace Uploaded Document</h3>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-id">Document Record ID</label>
              <input id="ev-id" required value={evidenceIdInput} onChange={(e) => setEvidenceIdInput(e.target.value)} />
            </div>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="ev-ver">Current Revision Number</label>
                <input id="ev-ver" type="number" min={1} value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ev-reason">Replacement Reason</label>
                <input id="ev-reason" value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <button
                className="btn secondary"
                type="button"
                disabled={readReason !== null}
                title={readReason ?? undefined}
                onClick={() => void inspectEvidence()}
              >
                Inspect Current &amp; Versions
              </button>
              <button className="btn" type="submit" disabled={busy || prepareReason !== null} title={prepareReason ?? undefined}>
                Upload Replacement Version
              </button>
            </div>
          </form>
        </div>
      </div>

      {readResult?.current_version && (
        <div className="card">
          <h3>
            Current Version v{readResult.current_version.version} ({readResult.current_version.technical_state})
          </h3>
          <p className="muted">Uploaded {formatManilaTime(readResult.current_version.uploaded_at)}</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Attachment ID</th>
                  <th>File Type</th>
                  <th>File Size</th>
                  <th>Checksum</th>
                  <th>File Preview</th>
                </tr>
              </thead>
              <tbody>
                {readResult.current_version.attachments.map((att) => (
                  <tr key={att.attachment_id}>
                    <td className="mono">{att.attachment_id}</td>
                    <td>{att.media_type}</td>
                    <td>{att.byte_length}</td>
                    <td className="mono">{att.sha256}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => void downloadAttachment(readResult.current_version!.version_id, att.attachment_id)}
                      >
                        Load File
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previewUrl && (
            <div style={{ marginTop: '0.75rem' }}>
              <a href={previewUrl} target="_blank" rel="noreferrer" className="btn secondary">
                Open Loaded File
              </a>
            </div>
          )}
        </div>
      )}

      {versionsJson !== null && (
        <div className="card">
          <h3>Document Revision History</h3>
          <pre className="json-box">{JSON.stringify(versionsJson, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
