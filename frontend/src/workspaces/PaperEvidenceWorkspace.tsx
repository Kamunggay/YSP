import { useState } from 'react';
import { apiGet, apiGetBlob, apiMutate, formatManilaTime, newActionKey } from '../api/client.ts';
import type { EvidencePurpose } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';

interface EvidenceAttachment {
  attachment_id: string;
  media_type: string;
  byte_size: number;
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
  chapterId: string;
}

export function PaperEvidenceWorkspace({ chapterId }: PaperEvidenceWorkspaceProps) {
  const [purpose, setPurpose] = useState<EvidencePurpose>('opening_receipt');
  const [recordId, setRecordId] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const [evidenceIdInput, setEvidenceIdInput] = useState('');
  const [expectedVersion, setExpectedVersion] = useState('1');
  const [replaceReason, setReplaceReason] = useState('');

  const [readResult, setReadResult] = useState<{ current_version?: EvidenceVersion } | null>(null);
  const [versionsJson, setVersionsJson] = useState<unknown>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

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
      setEvidenceIdInput(result.data.evidence_id);
      setExpectedVersion(String(result.data.version));
      setReplayed(result.replayed);
      setStatusMessage(`Uploaded ready evidence ${result.data.evidence_id} (v${result.data.version}).`);
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
      setError(new Error('Provide evidence_id UUID and replacement file(s).'));
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
      setExpectedVersion(String(result.data.version));
      setReplayed(result.replayed);
      setStatusMessage(`Replaced evidence -> v${result.data.version}.`);
      await inspectEvidence(result.data.evidence_id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function inspectEvidence(targetEid = evidenceIdInput.trim()) {
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
  }

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
        <h2>Protected Paper Evidence (`Ticket 04` · Multipart Only)</h2>
        <p className="muted">
          Stage 1 enforces real JPEG/PNG/PDF file uploads validated on Laravel (`purpose` + `record_id` + `attachments`). No Canvas signature or browser storage is accepted.
        </p>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="grid-2">
          <form onSubmit={handleUpload}>
            <h3>Upload New Evidence</h3>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-purpose">Purpose</label>
              <select id="ev-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as EvidencePurpose)}>
                <option value="opening_receipt">opening_receipt</option>
                <option value="hold_clearance">hold_clearance</option>
                <option value="actual_issue">actual_issue</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-rec">Target Record UUID (`record_id`)</label>
              <input id="ev-rec" required value={recordId} onChange={(e) => setRecordId(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="ev-files">Signed Paper Files (JPEG/PNG/PDF, max 10 MiB each)</label>
              <input id="ev-files" type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFiles(e.target.files)} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Upload Multipart Evidence
            </button>
          </form>

          <form onSubmit={handleReplace}>
            <h3>Inspect / Supersede Existing Evidence</h3>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ev-id">evidence_id UUID</label>
              <input id="ev-id" required value={evidenceIdInput} onChange={(e) => setEvidenceIdInput(e.target.value)} />
            </div>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="ev-ver">expected_version</label>
                <input id="ev-ver" type="number" min={1} value={expectedVersion} onChange={(e) => setExpectedVersion(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ev-reason">Replacement Reason</label>
                <input id="ev-reason" value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <button className="btn secondary" type="button" onClick={() => void inspectEvidence()}>
                Inspect Current &amp; Versions
              </button>
              <button className="btn" type="submit" disabled={busy}>
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
                  <th>Media Type</th>
                  <th>Bytes</th>
                  <th>Server SHA-256</th>
                  <th>Retrieve</th>
                </tr>
              </thead>
              <tbody>
                {readResult.current_version.attachments.map((att) => (
                  <tr key={att.attachment_id}>
                    <td className="mono">{att.attachment_id}</td>
                    <td>{att.media_type}</td>
                    <td>{att.byte_size}</td>
                    <td className="mono">{att.sha256}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => void downloadAttachment(readResult.current_version!.version_id, att.attachment_id)}
                      >
                        Fetch Authorized Bytes
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
                Open Fetched Attachment Blob
              </a>
            </div>
          )}
        </div>
      )}

      {versionsJson !== null && (
        <div className="card">
          <h3>Evidence Version Lineage</h3>
          <pre className="json-box">{JSON.stringify(versionsJson, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
