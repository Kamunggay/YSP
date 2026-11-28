import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiMutate, formatManilaTime } from '../api/client.ts';
import type { AllEvidencePurpose, Stage2EvidenceByteBinding } from '../api/stage2Types.ts';
import { stage2EvidenceStore } from '../state/stage2EvidenceStore.ts';
import type { SessionEvidenceRecord } from '../state/stage2EvidenceStore.ts';
import { SearchableRecordPicker } from './SearchableRecordPicker.tsx';
import type { SearchablePickerOption } from './SearchableRecordPicker.tsx';

interface Stage2EvidenceUploaderProps {
  chapterId: string;
  purpose: AllEvidencePurpose;
  recordId: string;
  recordLabel: string;
  selectedBinding: Stage2EvidenceByteBinding | null;
  onSelectBinding: (binding: Stage2EvidenceByteBinding | null) => void;
  disabled?: boolean;
  helperText?: string;
}

interface EvidenceUploadApiResult {
  evidence_id: string;
  version_id: string;
  version?: number;
  attachments: Array<{ attachment_id: string; sha256: string }>;
}

export function Stage2EvidenceUploader({
  chapterId,
  purpose,
  recordId,
  recordLabel,
  selectedBinding,
  onSelectBinding,
  disabled = false,
  helperText,
}: Stage2EvidenceUploaderProps) {
  const fileInputId = useId();
  const pickerUid = useId();
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<SessionEvidenceRecord[]>(() =>
    stage2EvidenceStore.list(chapterId, purpose),
  );
  const uploadGenRef = useRef(0);
  const contextRef = useRef({ chapterId, purpose, recordId });

  useEffect(() => {
    contextRef.current = { chapterId, purpose, recordId };
    uploadGenRef.current += 1;
    setFiles(null);
    setFileInputKey((k) => k + 1);
    setError(null);
    setBusy(false);
    setRecords(stage2EvidenceStore.list(chapterId, purpose));
  }, [chapterId, purpose, recordId]);

  useEffect(() => {
    return stage2EvidenceStore.subscribe(() => {
      setRecords(stage2EvidenceStore.list(chapterId, purpose));
    });
  }, [chapterId, purpose]);

  const activeRecords = useMemo(
    () =>
      records.filter((r) => r.chapterId === chapterId && r.purpose === purpose),
    [chapterId, purpose, records],
  );

  const pickerOptions: Array<SearchablePickerOption<SessionEvidenceRecord>> = useMemo(
    () =>
      activeRecords.map((entry) => ({
        id: entry.binding.evidence_id,
        primaryLabel: entry.label,
        secondaryLabel: `${formatManilaTime(entry.uploadedAt)} · v${entry.version} · ${entry.binding.attachments.length} attachment(s)`,
        badge: entry.recordId === recordId ? 'This record' : `Rev v${entry.version}`,
        badgeTone: entry.recordId === recordId ? 'ready' : 'neutral',
        searchText: `${entry.binding.evidence_id} ${entry.recordId} ${entry.label}`,
        meta: entry,
      })),
    [activeRecords, recordId],
  );

  async function handleUpload() {
    if (disabled) {
      return;
    }
    if (!files || files.length === 0) {
      setError('Select at least one image or PDF scan first.');
      return;
    }
    const targetChapter = chapterId;
    const targetPurpose = purpose;
    const targetRecord = recordId.trim();
    const targetLabel = recordLabel;
    if (!targetRecord) {
      setError('Save or select the parent record before binding supporting paper.');
      return;
    }

    const gen = ++uploadGenRef.current;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('purpose', targetPurpose);
      fd.append('record_id', targetRecord);
      for (const f of Array.from(files)) {
        fd.append('attachments', f, f.name);
      }
      const fileNames = Array.from(files)
        .map((f) => f.name)
        .join(', ');
      const { result } = await apiMutate<EvidenceUploadApiResult>(
        'POST',
        `/api/v1/chapters/${targetChapter}/evidence`,
        fd,
      );
      const data = result.data;
      const version = data.version ?? 1;
      const binding: Stage2EvidenceByteBinding = {
        evidence_id: data.evidence_id,
        version_id: data.version_id,
        attachments: data.attachments,
      };

      const isCurrentContext =
        contextRef.current.chapterId === targetChapter &&
        contextRef.current.purpose === targetPurpose &&
        contextRef.current.recordId.trim() === targetRecord &&
        uploadGenRef.current === gen;

      if (contextRef.current.chapterId === targetChapter) {
        stage2EvidenceStore.record({
          chapterId: targetChapter,
          purpose: targetPurpose,
          recordId: targetRecord,
          label: `${targetLabel} — ${fileNames}`,
          version,
          uploadedAt: new Date().toISOString(),
          binding,
        });
      }
      if (!isCurrentContext) {
        return;
      }
      onSelectBinding(binding);
      setFiles(null);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      if (
        contextRef.current.chapterId === targetChapter &&
        contextRef.current.purpose === targetPurpose &&
        contextRef.current.recordId.trim() === targetRecord &&
        uploadGenRef.current === gen
      ) {
        setError(err instanceof Error ? err.message : 'Unable to upload supporting document.');
      }
    } finally {
      if (uploadGenRef.current === gen) {
        setBusy(false);
      }
    }
  }

  return (
    <div className="s2-evidence-box">
      <div className="s2-evidence-grid">
        <SearchableRecordPicker<SessionEvidenceRecord>
          id={`s2-ev-picker-${purpose}-${pickerUid}`}
          label={`Bound Evidence (${purpose.replaceAll('_', ' ')})`}
          valueId={selectedBinding?.evidence_id ?? ''}
          options={pickerOptions}
          onSelect={(opt) => onSelectBinding(opt ? opt.meta.binding : null)}
          disabled={disabled}
          placeholder="Select uploaded paper in this session..."
          emptyMessage="Upload paper below to bind an authoritative scan."
        />

        <div className="form-group">
          <label className="form-label" htmlFor={fileInputId}>
            Upload Signed Scan (PDF / Image)
          </label>
          <div className="s2-file-row">
            <input
              key={fileInputKey}
              id={fileInputId}
              type="file"
              multiple
              disabled={disabled || busy}
              className="form-control"
              onChange={(e) => setFiles(e.target.files)}
            />
            <button
              type="button"
              className="btn-batcave-secondary p02-compact-btn"
              disabled={disabled || busy || !files || files.length === 0}
              onClick={() => void handleUpload()}
            >
              {busy ? 'Uploading...' : 'Upload & Bind'}
            </button>
          </div>
          {helperText && <div className="s2-muted-sm">{helperText}</div>}
        </div>
      </div>

      {selectedBinding && (
        <div className="s2-binding-chip">
          <span className="s2-badge is-ready">Bound Scan</span>
          <span className="s2-mono-pill">
            {selectedBinding.evidence_id.slice(0, 8)}… · ver {selectedBinding.version_id.slice(0, 8)}…
          </span>
          <span className="s2-muted-sm">
            {selectedBinding.attachments.length} attachment(s), SHA-256:{' '}
            {selectedBinding.attachments[0]?.sha256.slice(0, 12) ?? '—'}…
          </span>
        </div>
      )}

      {error && (
        <div className="s2-inline-alert is-danger" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
