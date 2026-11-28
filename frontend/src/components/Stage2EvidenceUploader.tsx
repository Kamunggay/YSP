import { useEffect, useId, useMemo, useState } from 'react';
import { apiMutate, formatManilaTime, newActionKey } from '../api/client.ts';
import { isStage2PreviewActive } from '../api/stage2Client.ts';
import type { AllEvidencePurpose, Stage2EvidenceByteBinding } from '../api/stage2Types.ts';
import { computeSha256Hex, stage2EvidenceStore } from '../state/stage2EvidenceStore.ts';
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
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<SessionEvidenceRecord[]>(() =>
    stage2EvidenceStore.list(chapterId, purpose),
  );

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
    if (!files || files.length === 0) {
      setError('Select at least one image or PDF scan first.');
      return;
    }
    const targetRecord = recordId.trim();
    if (!targetRecord) {
      setError('Save or select the parent record before binding supporting paper.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let binding: Stage2EvidenceByteBinding;
      let version = 1;
      if (isStage2PreviewActive()) {
        const attachmentRows = await Promise.all(
          Array.from(files).map(async (f) => ({
            attachment_id: newActionKey(),
            sha256: await computeSha256Hex(f),
          })),
        );
        binding = {
          evidence_id: newActionKey(),
          version_id: newActionKey(),
          attachments: attachmentRows,
        };
      } else {
        const fd = new FormData();
        fd.append('purpose', purpose);
        fd.append('record_id', targetRecord);
        for (const f of Array.from(files)) {
          fd.append('attachments', f, f.name);
        }
        const { result } = await apiMutate<EvidenceUploadApiResult>(
          'POST',
          `/api/v1/chapters/${chapterId}/evidence`,
          fd,
        );
        const data = result.data;
        version = data.version ?? 1;
        binding = {
          evidence_id: data.evidence_id,
          version_id: data.version_id,
          attachments: data.attachments,
        };
      }

      const fileNames = Array.from(files)
        .map((f) => f.name)
        .join(', ');
      stage2EvidenceStore.record({
        chapterId,
        purpose,
        recordId: targetRecord,
        label: `${recordLabel} — ${fileNames}`,
        version,
        uploadedAt: new Date().toISOString(),
        binding,
      });
      onSelectBinding(binding);
      setFiles(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload supporting document.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="s2-evidence-box">
      <div className="s2-evidence-grid">
        <SearchableRecordPicker<SessionEvidenceRecord>
          id={`s2-ev-picker-${purpose}`}
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
