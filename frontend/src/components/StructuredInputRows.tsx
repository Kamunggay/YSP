import {
  emptyStockRange,
  emptyStockTarget,
  type EvidenceAttachmentBindingInput,
  type EvidenceBindingValue,
  type StockRangeInput,
  type StockTargetInput,
} from './structuredInputHelpers.ts';

interface StockTargetRowsProps {
  label: string;
  rows: StockTargetInput[];
  onChange: (next: StockTargetInput[]) => void;
}

export function StockTargetRows({ label, rows, onChange }: StockTargetRowsProps) {
  function updateRow(idx: number, patch: Partial<StockTargetInput>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <strong>{label}</strong>
        <button type="button" className="btn secondary" onClick={() => onChange([...rows, emptyStockTarget()])}>
          + Add Target
        </button>
      </div>
      {rows.map((r, idx) => (
        <div key={idx} className="row nested-row-panel">
          <div className="field">
            <label>Stock Batch ID</label>
            <input required value={r.stock_lot_id} onChange={(e) => updateRow(idx, { stock_lot_id: e.target.value })} />
          </div>
          <div className="field">
            <label>Batch Section ID</label>
            <input required value={r.basis_segment_id} onChange={(e) => updateRow(idx, { basis_segment_id: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '7rem' }}>
            <label>Starting Point</label>
            <input required value={r.offset_quantity} onChange={(e) => updateRow(idx, { offset_quantity: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '7rem' }}>
            <label>Quantity</label>
            <input required value={r.quantity} onChange={(e) => updateRow(idx, { quantity: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '5.5rem' }}>
            <label>Lot Version</label>
            <input type="number" min={1} required value={r.expected_lot_material_version} onChange={(e) => updateRow(idx, { expected_lot_material_version: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '5.5rem' }}>
            <label>Stock Version</label>
            <input type="number" min={1} required value={r.expected_stock_version} onChange={(e) => updateRow(idx, { expected_stock_version: e.target.value })} />
          </div>
          {rows.length > 1 && (
            <button type="button" className="btn secondary" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface StockRangeRowsProps {
  label: string;
  rows: StockRangeInput[];
  onChange: (next: StockRangeInput[]) => void;
}

export function StockRangeRows({ label, rows, onChange }: StockRangeRowsProps) {
  function updateRow(idx: number, patch: Partial<StockRangeInput>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <strong>{label}</strong>
        <button type="button" className="btn secondary" onClick={() => onChange([...rows, emptyStockRange()])}>
          + Add Range
        </button>
      </div>
      {rows.map((r, idx) => (
        <div key={idx} className="row nested-row-panel">
          <div className="field">
            <label>Stock Batch ID</label>
            <input required value={r.stock_lot_id} onChange={(e) => updateRow(idx, { stock_lot_id: e.target.value })} />
          </div>
          <div className="field">
            <label>Batch Section ID</label>
            <input required value={r.basis_segment_id} onChange={(e) => updateRow(idx, { basis_segment_id: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '7rem' }}>
            <label>Starting Point</label>
            <input required value={r.offset_quantity} onChange={(e) => updateRow(idx, { offset_quantity: e.target.value })} />
          </div>
          <div className="field" style={{ maxWidth: '7rem' }}>
            <label>Quantity</label>
            <input required value={r.quantity} onChange={(e) => updateRow(idx, { quantity: e.target.value })} />
          </div>
          {rows.length > 1 && (
            <button type="button" className="btn secondary" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

interface EvidenceBindingFieldsProps {
  label: string;
  value: EvidenceBindingValue;
  onChange: (next: EvidenceBindingValue) => void;
}

export function EvidenceBindingFields({ label, value, onChange }: EvidenceBindingFieldsProps) {
  function updateAttachment(idx: number, patch: Partial<EvidenceAttachmentBindingInput>) {
    onChange({
      ...value,
      attachments: value.attachments.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    });
  }

  return (
    <div className="nested-row-panel" style={{ marginBottom: '0.75rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <strong>{label}</strong>
        <button
          type="button"
          className="btn secondary"
          onClick={() => onChange({ ...value, attachments: [...value.attachments, { attachment_id: '', sha256: '' }] })}
        >
          + Add File Reference
        </button>
      </div>
      <div className="row" style={{ marginBottom: '0.4rem' }}>
        <div className="field">
          <label>Document Record ID</label>
          <input required value={value.evidence_id} onChange={(e) => onChange({ ...value, evidence_id: e.target.value })} />
        </div>
        <div className="field">
          <label>Document Version ID</label>
          <input required value={value.version_id} onChange={(e) => onChange({ ...value, version_id: e.target.value })} />
        </div>
      </div>
      {value.attachments.map((a, idx) => (
        <div key={idx} className="row" style={{ marginBottom: '0.35rem' }}>
          <div className="field">
            <label>Attachment ID</label>
            <input required value={a.attachment_id} onChange={(e) => updateAttachment(idx, { attachment_id: e.target.value })} />
          </div>
          <div className="field">
            <label>File Verification Checksum</label>
            <input required value={a.sha256} onChange={(e) => updateAttachment(idx, { sha256: e.target.value })} />
          </div>
          {value.attachments.length > 1 && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => onChange({ ...value, attachments: value.attachments.filter((_, i) => i !== idx) })}
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
