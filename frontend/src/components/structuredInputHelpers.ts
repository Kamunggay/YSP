export interface StockRangeInput {
  stock_lot_id: string;
  basis_segment_id: string;
  offset_quantity: string;
  quantity: string;
}

export interface StockTargetInput extends StockRangeInput {
  expected_lot_material_version: string;
  expected_stock_version: string;
}

export interface EvidenceAttachmentBindingInput {
  attachment_id: string;
  sha256: string;
}

export interface EvidenceBindingValue {
  evidence_id: string;
  version_id: string;
  attachments: EvidenceAttachmentBindingInput[];
}

export function emptyStockRange(): StockRangeInput {
  return { stock_lot_id: '', basis_segment_id: '', offset_quantity: '0', quantity: '1' };
}

export function emptyStockTarget(): StockTargetInput {
  return {
    stock_lot_id: '',
    basis_segment_id: '',
    offset_quantity: '0',
    quantity: '1',
    expected_lot_material_version: '1',
    expected_stock_version: '1',
  };
}

export function emptyEvidenceBinding(): EvidenceBindingValue {
  return { evidence_id: '', version_id: '', attachments: [{ attachment_id: '', sha256: '' }] };
}

export function toWireRanges(rows: StockRangeInput[]) {
  return rows.map((r) => ({
    stock_lot_id: r.stock_lot_id.trim(),
    basis_segment_id: r.basis_segment_id.trim(),
    offset_quantity: r.offset_quantity.trim(),
    quantity: r.quantity.trim(),
  }));
}

export function toWireTargets(rows: StockTargetInput[]) {
  return rows.map((r) => ({
    stock_lot_id: r.stock_lot_id.trim(),
    basis_segment_id: r.basis_segment_id.trim(),
    offset_quantity: r.offset_quantity.trim(),
    quantity: r.quantity.trim(),
    expected_lot_material_version: Number.parseInt(r.expected_lot_material_version, 10) || 1,
    expected_stock_version: Number.parseInt(r.expected_stock_version, 10) || 1,
  }));
}

export function toWireEvidenceBinding(ev: EvidenceBindingValue) {
  return {
    evidence_id: ev.evidence_id.trim(),
    version_id: ev.version_id.trim(),
    attachments: ev.attachments.map((a) => ({
      attachment_id: a.attachment_id.trim(),
      sha256: a.sha256.trim(),
    })),
  };
}
