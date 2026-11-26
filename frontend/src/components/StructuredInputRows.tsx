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
    <div className="p04-lines-list">
      <div className="p03-card-header-row">
        <span className="form-label">{label}</span>
        <button
          type="button"
          className="btn-batcave-secondary p03-shrink-btn"
          onClick={() => onChange([...rows, emptyStockTarget()])}
        >
          + Add Target
        </button>
      </div>
      {rows.map((r, idx) => (
        <div key={idx} className="p04-line-card">
          <div className="p03-two-col">
            <div className="form-group">
              <label className="form-label">Stock Batch ID</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.stock_lot_id}
                onChange={(e) => updateRow(idx, { stock_lot_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Batch Section ID</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.basis_segment_id}
                onChange={(e) => updateRow(idx, { basis_segment_id: e.target.value })}
              />
            </div>
          </div>
          <div className="p03-two-col">
            <div className="form-group">
              <label className="form-label">Starting Point</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.offset_quantity}
                onChange={(e) => updateRow(idx, { offset_quantity: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.quantity}
                onChange={(e) => updateRow(idx, { quantity: e.target.value })}
              />
            </div>
          </div>
          <div className="p03-input-action-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Lot Version</label>
              <input
                className="form-control"
                type="number"
                min={1}
                required
                value={r.expected_lot_material_version}
                onChange={(e) => updateRow(idx, { expected_lot_material_version: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Stock Version</label>
              <input
                className="form-control"
                type="number"
                min={1}
                required
                value={r.expected_stock_version}
                onChange={(e) => updateRow(idx, { expected_stock_version: e.target.value })}
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            )}
          </div>
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
    <div className="p04-lines-list">
      <div className="p03-card-header-row">
        <span className="form-label">{label}</span>
        <button
          type="button"
          className="btn-batcave-secondary p03-shrink-btn"
          onClick={() => onChange([...rows, emptyStockRange()])}
        >
          + Add Range
        </button>
      </div>
      {rows.map((r, idx) => (
        <div key={idx} className="p04-line-card">
          <div className="p03-two-col">
            <div className="form-group">
              <label className="form-label">Stock Batch ID</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.stock_lot_id}
                onChange={(e) => updateRow(idx, { stock_lot_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Batch Section ID</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.basis_segment_id}
                onChange={(e) => updateRow(idx, { basis_segment_id: e.target.value })}
              />
            </div>
          </div>
          <div className="p03-input-action-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Starting Point</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.offset_quantity}
                onChange={(e) => updateRow(idx, { offset_quantity: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Quantity</label>
              <input
                className="form-control p03-mono-inline"
                required
                value={r.quantity}
                onChange={(e) => updateRow(idx, { quantity: e.target.value })}
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            )}
          </div>
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
    <div className="p04-line-card">
      <div className="p03-card-header-row">
        <span className="form-label">{label}</span>
        <button
          type="button"
          className="btn-batcave-secondary p03-shrink-btn"
          onClick={() => onChange({ ...value, attachments: [...value.attachments, { attachment_id: '', sha256: '' }] })}
        >
          + Add File Reference
        </button>
      </div>
      <div className="p03-two-col">
        <div className="form-group">
          <label className="form-label">Document Record ID</label>
          <input
            className="form-control p03-mono-inline"
            required
            value={value.evidence_id}
            onChange={(e) => onChange({ ...value, evidence_id: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Document Version ID</label>
          <input
            className="form-control p03-mono-inline"
            required
            value={value.version_id}
            onChange={(e) => onChange({ ...value, version_id: e.target.value })}
          />
        </div>
      </div>
      {value.attachments.map((a, idx) => (
        <div key={idx} className="p03-input-action-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Attachment ID</label>
            <input
              className="form-control p03-mono-inline"
              required
              value={a.attachment_id}
              onChange={(e) => updateAttachment(idx, { attachment_id: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ flex: 1.5 }}>
            <label className="form-label">File Verification Checksum</label>
            <input
              className="form-control p03-mono-inline"
              required
              value={a.sha256}
              onChange={(e) => updateAttachment(idx, { sha256: e.target.value })}
            />
          </div>
          {value.attachments.length > 1 && (
            <button
              type="button"
              className="btn-batcave-secondary p03-shrink-btn"
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
