import type {
  BoundedRestriction,
  CursorPage,
  SettingBlocker,
} from './types.ts';

export type { BoundedRestriction };

export type Stage2Duty =
  | 'COMMITTEE_REQUESTER'
  | 'RF_APPROVER'
  | 'SALES_OFFICER'
  | 'SALES_REVIEWER'
  | 'FINANCE'
  | 'INVENTORY'
  | 'PURCHASING'
  | 'BUDGET_APPROVER'
  | 'RECEIVING'
  | 'DISPATCH'
  | 'BOOTH_CUSTODIAN'
  | 'BOOTH_CASHIER'
  | 'INDEPENDENT_REVIEWER'
  | 'CHAPTER_HEAD';

export type Stage2EvidencePurpose =
  | 'quotation_attachment'
  | 'po_supplier_dr'
  | 'da_acknowledgment'
  | 'da_receipt'
  | 'donor_restriction_resolution'
  | 'receiving_discrepancy'
  | 'missing_source_hold';

export type AllEvidencePurpose =
  | 'opening_receipt'
  | 'hold_clearance'
  | 'actual_issue'
  | Stage2EvidencePurpose;

export interface Stage2EvidenceTarget {
  purpose: AllEvidencePurpose;
  record_id: string;
}

export interface Stage2EvidenceSnapshot {
  target: Stage2EvidenceTarget;
  material_version: number;
  sha256: string;
}

export interface Stage2EvidenceAttachmentBinding {
  attachment_id: string;
  sha256: string;
}

export interface Stage2EvidenceByteBinding {
  evidence_id: string;
  version_id: string;
  attachments: Stage2EvidenceAttachmentBinding[];
}

export interface Stage2EvidenceMatchAcknowledgment {
  acknowledgment_id: string;
  matched_by: string;
  matched_at: string;
  recipient_id: string | null;
  acknowledged_at: string;
  snapshot: Stage2EvidenceSnapshot;
  bytes: Stage2EvidenceByteBinding;
}

export interface PolicyBindingRef {
  policy_id: string;
  version: number;
}

export interface ProcurementActor {
  user_id: string;
  display_name: string;
}

/* ==================== 1. Net Shortage & Replenishment ==================== */

export type ReplenishmentTriggerFilter = 'all' | 'rf_shortage' | 'rop_breach' | 'uncovered_only';

export interface ReplenishmentRfShortageLine {
  rf_id: string;
  rf_reference: string;
  rf_line_id: string;
  rf_material_version: number;
  requesting_unit_id: string;
  needed_at: string;
  approved_quantity: string;
  issued_quantity: string;
  canceled_quantity: string;
  active_reserved_quantity: string;
  unreserved_outstanding_quantity: string;
}

export interface ReplenishmentInboundSource {
  source_kind: 'repf' | 'po';
  source_id: string;
  source_reference: string;
  status:
    | 'pending_budget_review'
    | 'held'
    | 'approved'
    | 'partially_ordered'
    | 'issued'
    | 'partially_received';
  open_quantity: string;
  coverage_state: 'counted' | 'late' | 'disputed' | 'ineligible';
  exclusion_reason: string | null;
}

export interface ReplenishmentNeedItem {
  chapter_id: string;
  item_id: string;
  item_code: string;
  variant_id: string;
  variant_code: string;
  display_name: string;
  unit_id: string;
  unit_code: string;
  quantity_scale: number;
  approved_rop: string | null;
  rop_policy: PolicyBindingRef | null;
  approved_target_level: string | null;
  target_level_policy: PolicyBindingRef | null;
  usable_stockroom_on_hand: string;
  eligible_usable_stockroom_on_hand: string;
  active_rf_reservations: string;
  eligible_available_to_allocate: string;
  total_unreserved_approved_rf_demand: string;
  unreserved_approved_rf_shortage: string;
  open_repf_quantity: string;
  open_po_inbound_quantity: string;
  total_open_inbound_coverage: string;
  excluded_inbound_quantity: string;
  low_stock_breach: boolean;
  gross_rf_shortage_need: string;
  gross_rop_replenishment_need: string;
  gross_combined_need: string;
  uncovered_rf_shortage_quantity: string;
  uncovered_rop_replenishment_quantity: string;
  proposed_uncovered_quantity: string;
  contributing_rf_lines: ReplenishmentRfShortageLine[];
  inbound_sources: ReplenishmentInboundSource[];
  setup_blockers: SettingBlocker[];
  observed_at: string;
}

/* ==================== 2. RepF & Budget Review ==================== */

export type RepfStatus =
  | 'draft'
  | 'pending_budget_review'
  | 'approved'
  | 'held'
  | 'returned_for_revision'
  | 'rejected'
  | 'partially_ordered'
  | 'ordered'
  | 'canceled';

export type RepfTriggerKind = 'rf_shortage' | 'rop_replenishment';
export type RepfUrgency = 'normal' | 'urgent' | 'critical';
export type RepfBudgetDecision = 'approve' | 'hold' | 'return' | 'reject';

export interface AdditionalPurchaseReason {
  category: 'late_supply' | 'disputed_supply' | 'ineligible_supply';
  referenced_source_ids: string[];
  explanation: string;
}

export interface RepfLineInput {
  trigger_kind: RepfTriggerKind;
  variant_id: string;
  unit_id: string;
  rf_id: string | null;
  rf_line_id: string | null;
  requested_quantity: string;
  estimated_unit_cost_php: string;
  needed_by: string | null;
  additional_purchase_reason: AdditionalPurchaseReason | null;
  notes: string | null;
}

export interface RepfLineNeedBreakdown {
  snapshot_version: number;
  observed_at: string;
  approved_rop: string | null;
  approved_target_level: string | null;
  usable_stockroom_on_hand: string;
  eligible_usable_stockroom_on_hand: string;
  active_rf_reservations: string;
  eligible_available_to_allocate: string;
  unreserved_approved_rf_shortage: string;
  open_repf_quantity: string;
  open_po_inbound_quantity: string;
  total_open_inbound_coverage: string;
  excluded_inbound_quantity: string;
  gross_rf_shortage_need: string;
  gross_rop_replenishment_need: string;
  gross_combined_need: string;
  uncovered_rf_shortage_quantity: string;
  uncovered_rop_replenishment_quantity: string;
  variant_proposed_uncovered_quantity: string;
  uncovered_need: string;
  exceeds_uncovered_need: boolean;
}

export interface RepfLine {
  id: string;
  line_number: number;
  trigger_kind: RepfTriggerKind;
  item_id: string;
  item_code: string;
  variant_id: string;
  variant_code: string;
  display_name: string;
  unit_id: string;
  unit_code: string;
  quantity_scale: number;
  rf_id: string | null;
  rf_reference: string | null;
  rf_line_id: string | null;
  rf_material_version: number | null;
  linked_demand_canceled: boolean;
  linked_demand_canceled_at: string | null;
  requested_quantity: string;
  ordered_quantity: string;
  canceled_quantity: string;
  remaining_to_order_quantity: string;
  estimated_unit_cost_php: string;
  estimated_line_total_php: string;
  needed_by: string | null;
  net_need_breakdown: RepfLineNeedBreakdown;
  additional_purchase_reason: AdditionalPurchaseReason | null;
  notes: string | null;
}

export interface Repf {
  id: string;
  chapter_id: string;
  repf_reference: string | null;
  status: RepfStatus;
  version: number;
  material_version: number;
  funding_source: 'chapter_funds';
  urgency: RepfUrgency;
  trigger_kinds: RepfTriggerKind[];
  justification: string;
  estimated_total_php: string;
  approved_budget_php: string | null;
  has_additional_purchase_override: boolean;
  linked_demand_canceled: boolean;
  preparer: ProcurementActor;
  submitted_by: ProcurementActor | null;
  submitted_at: string | null;
  budget_reviewer: ProcurementActor | null;
  budget_reviewed_at: string | null;
  budget_decision: RepfBudgetDecision | null;
  budget_decision_reason: string | null;
  canceled_by: ProcurementActor | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  lines: RepfLine[];
  created_at: string;
  updated_at: string;
}

export interface RepfHistoryEntry {
  id: string;
  version: number;
  material_version: number;
  action: string;
  from_status: RepfStatus | null;
  to_status: RepfStatus;
  actor: ProcurementActor;
  reason: string | null;
  repf_reference: string | null;
  occurred_at: string;
}

export interface RepfRelatedRecord {
  kind: 'internal_rf' | 'quotation' | 'purchase_order';
  id: string;
  repf_line_id: string | null;
  reference: string | null;
  material_version: number;
  state: string;
  linked_demand_canceled: boolean;
}

export interface DuplicateSupplyCoverageDetail {
  line_index: number;
  trigger_kind: RepfTriggerKind;
  variant_id: string;
  requested_quantity: string;
  live_uncovered_need: string;
  variant_proposed_uncovered_quantity: string;
  blocking_inbound_sources: ReplenishmentInboundSource[];
}

/* ==================== 3. Quotations & Purchase Orders ==================== */

export type SupplierSubtype =
  | 'local_retailer'
  | 'wholesaler'
  | 'manufacturer'
  | 'distributor'
  | 'cooperative'
  | 'service_provider'
  | 'other';

export interface InlineSupplierMetadata {
  supplier_name: string;
  supplier_subtype: SupplierSubtype;
  contact_reference: string;
  supplier_reference: string | null;
}

export interface RepfQuotationLineInput {
  repf_line_id: string;
  variant_id: string;
  unit_id: string;
  quoted_quantity: string;
  unit_price_php: string;
  notes: string | null;
}

export interface RepfQuotationLine extends RepfQuotationLineInput {
  id: string;
  quantity_scale: number;
  line_total_php: string;
}

export interface RepfQuotation {
  id: string;
  chapter_id: string;
  repf_id: string;
  version: number;
  material_version: number;
  supplier: InlineSupplierMetadata;
  quoted_at: string;
  valid_until: string | null;
  lead_time_days: number;
  availability_summary: string;
  quality_warranty_terms: string;
  payment_and_delivery_terms: string;
  reliability_notes: string | null;
  currency: 'PHP';
  total_amount_php: string;
  is_selected: boolean;
  selected_at: string | null;
  evidence_binding: Stage2EvidenceByteBinding | null;
  recorded_by: ProcurementActor;
  lines: RepfQuotationLine[];
  created_at: string;
  updated_at: string;
}

export interface QuotationPolicyEvaluation {
  policy_id: string;
  policy_version: number;
  evaluated_amount_php: string;
  applicable_tier_min_php: string;
  applicable_tier_max_php: string | null;
  required_minimum_quotes: number;
  comparable_quote_count: number;
  waiver_permitted: boolean;
  minimum_quotes_when_waived: number | null;
  emergency_waiver_used: boolean;
  approving_duties_for_waiver: Array<'BUDGET_APPROVER' | 'CHAPTER_HEAD'>;
}

export interface SupplierSelection {
  id: string;
  chapter_id: string;
  repf_id: string;
  version: number;
  material_version: number;
  selected_quotation_id: string;
  comparable_quotation_ids: string[];
  comparable_quote_count: number;
  policy_evaluation: QuotationPolicyEvaluation;
  emergency_waiver_used: boolean;
  emergency_waiver_reason: string | null;
  selection_rationale: string;
  selected_by: ProcurementActor;
  selected_at: string;
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'returned_for_revision'
  | 'rejected'
  | 'issued'
  | 'partially_received'
  | 'receiving_complete'
  | 'closed_short'
  | 'canceled';

export interface PurchaseOrderLineInput {
  repf_line_id: string;
  quotation_line_id: string;
  variant_id: string;
  unit_id: string;
  ordered_quantity: string;
  unit_price_php: string;
  specifications: string;
  notes: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  repf_line_id: string;
  quotation_line_id: string | null;
  variant_id: string;
  unit_id: string;
  quantity_scale: number;
  ordered_quantity: string;
  accepted_quantity: string;
  rejected_or_disputed_quantity: string;
  closed_short_quantity: string;
  canceled_quantity: string;
  outstanding_quantity: string;
  unit_price_php: string;
  line_total_php: string;
  specifications: string;
  linked_demand_canceled: boolean;
  linked_demand_canceled_at: string | null;
  notes: string | null;
}

export interface PurchaseOrderAcknowledgment {
  supplier_confirmation_reference: string | null;
  acknowledged_at: string;
  revised_expected_delivery_date: string | null;
  notes: string | null;
  evidence_binding: Stage2EvidenceByteBinding | null;
  recorded_by: ProcurementActor;
  recorded_at: string;
}

export interface PurchaseOrderAmendmentLineInput {
  po_line_id: string | null;
  repf_line_id: string;
  variant_id: string;
  unit_id: string;
  ordered_quantity: string;
  unit_price_php: string;
  specifications: string;
  notes: string | null;
}

export interface PurchaseOrderAmendment {
  id: string;
  chapter_id: string;
  po_id: string;
  amendment_number: number;
  status: 'pending_approval' | 'approved';
  base_material_version: number;
  applied_material_version: number | null;
  delivery_location: string;
  expected_delivery_date: string;
  payment_and_delivery_terms: string;
  proposed_total_php: string;
  reason: string;
  lines: PurchaseOrderAmendmentLineInput[];
  proposed_by: ProcurementActor;
  proposed_at: string;
  approved_by: ProcurementActor | null;
  approved_at: string | null;
}

export interface PurchaseOrder {
  id: string;
  chapter_id: string;
  po_reference: string | null;
  status: PurchaseOrderStatus;
  version: number;
  material_version: number;
  repf_id: string;
  repf_reference: string;
  originating_repf_preparer: ProcurementActor;
  supplier_selection_id: string;
  selected_quotation_id: string;
  emergency_waiver_used: boolean;
  supplier: InlineSupplierMetadata;
  delivery_location: string;
  expected_delivery_date: string;
  payment_and_delivery_terms: string;
  currency: 'PHP';
  total_amount_php: string;
  linked_demand_canceled: boolean;
  preparer: ProcurementActor;
  submitted_by: ProcurementActor | null;
  submitted_at: string | null;
  approved_by: ProcurementActor | null;
  approved_at: string | null;
  issued_at: string | null;
  review_decision_reason: string | null;
  acknowledgment: PurchaseOrderAcknowledgment | null;
  pending_amendment: PurchaseOrderAmendment | null;
  approved_amendment_count: number;
  closed_short_by: ProcurementActor | null;
  closed_short_at: string | null;
  close_short_reason: string | null;
  canceled_by: ProcurementActor | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  lines: PurchaseOrderLine[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderHistoryEntry {
  id: string;
  version: number;
  material_version: number;
  action: string;
  from_status: PurchaseOrderStatus | null;
  to_status: PurchaseOrderStatus;
  actor: ProcurementActor;
  reason: string | null;
  po_reference: string | null;
  amendment_id: string | null;
  occurred_at: string;
}

export interface PurchaseOrderRelatedRecord {
  kind: 'repf' | 'quotation' | 'supplier_selection' | 'internal_rf' | 'receiving_report' | 'receiving_discrepancy';
  id: string;
  po_line_id: string | null;
  reference: string | null;
  material_version: number;
  state: string;
  linked_demand_canceled: boolean;
}

export type ProcurementOperationName =
  | 'createRepf'
  | 'replaceRepf'
  | 'submitRepf'
  | 'reviewRepfBudget'
  | 'resumeRepfReview'
  | 'reviseRepf'
  | 'cancelRepf'
  | 'createRepfQuotation'
  | 'replaceRepfQuotation'
  | 'deleteRepfQuotation'
  | 'recordSupplierSelection'
  | 'createPurchaseOrder'
  | 'replacePurchaseOrder'
  | 'submitPurchaseOrder'
  | 'approvePurchaseOrder'
  | 'returnPurchaseOrder'
  | 'rejectPurchaseOrder'
  | 'recordPurchaseOrderAcknowledgment'
  | 'proposePurchaseOrderAmendment'
  | 'approvePurchaseOrderAmendment'
  | 'closeShortPurchaseOrder'
  | 'cancelPurchaseOrder';

export interface ProcurementOperationReceipt<T = unknown> {
  operation_id: string;
  chapter_id: string;
  actor_id: string;
  operation_name: ProcurementOperationName;
  action_key: string;
  resource_kind: string;
  resource_id: string;
  committed_version: number;
  committed_material_version: number;
  status_code: 200 | 201;
  committed_at: string;
  outcome: 'committed';
  result: T;
}

/* ==================== 4. Unified Receiving, Discrepancies & Holds ==================== */

export type ReceivingSourceKind = 'po' | 'da';
export type ReceivingReportStatus = 'draft' | 'inspected' | 'evidence_matched' | 'posted' | 'canceled';
export type ReceivingDiscrepancyStatus = 'open' | 'supplier_notified' | 'under_review' | 'resolved';
export type ReceivingDiscrepancyResolutionKind =
  | 'supplier_replacement_received'
  | 'returned_to_supplier'
  | 'credit_or_short_closed'
  | 'donated_declined_or_disposed';
export type QuarantinedLotDisposition =
  | 'retained_in_quarantine'
  | 'returned_to_supplier_physically'
  | 'disposed_per_policy';
export type ReceivingHoldStatus = 'held' | 'linked_to_source' | 'rejected_returned';

export interface ReceivingReportLineInput {
  source_line_id: string;
  variant_id: string;
  unit_id: string;
  delivered_quantity: string;
  accepted_quantity: string;
  damaged_quantity: string;
  rejected_quantity: string;
  unit_valuation_php: string;
  discrepancy_notes: string | null;
  resolves_discrepancy_id: string | null;
}

export interface ReceivingReportLine extends ReceivingReportLineInput {
  id: string;
  quantity_scale: number;
  accepted_value_php: string;
  restrictions: BoundedRestriction;
}

export interface ReceivingInspection {
  inspector: ProcurementActor;
  technical_or_requesting_representative: ProcurementActor | null;
  inspected_at: string;
  inspection_notes: string;
}

export interface ReceivingReport {
  id: string;
  chapter_id: string;
  rm_reference: string | null;
  source_kind: ReceivingSourceKind;
  source_id: string;
  source_reference: string;
  source_material_version: number;
  originating_hold_id: string | null;
  supplier_dr_reference: string | null;
  supplier_dr_date: string | null;
  status: ReceivingReportStatus;
  version: number;
  material_version: number;
  location_id: string;
  currency: 'PHP';
  accepted_total_value_php: string;
  preparer: ProcurementActor;
  inspection: ReceivingInspection | null;
  snapshot: Stage2EvidenceSnapshot | null;
  evidence_acknowledgment: Stage2EvidenceMatchAcknowledgment | null;
  posted_by: ProcurementActor | null;
  posted_at: string | null;
  posting_stock_version: number | null;
  canceled_by: ProcurementActor | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  lines: ReceivingReportLine[];
  created_at: string;
  updated_at: string;
}

export interface ReceivingPostingSummary {
  stock_version: number;
  usable_lot_ids: string[];
  quarantined_or_rejected_lot_ids: string[];
  created_discrepancy_ids: string[];
  source_status_after: string;
}

export interface ReceivingMovement {
  id: string;
  chapter_id: string;
  kind: 'accepted_receipt' | 'quarantined_receipt' | 'rejected_receipt';
  source_kind: 'po_rm' | 'da_rm';
  rm_id: string;
  rm_reference: string;
  rm_material_version: number;
  rm_line_id: string;
  source_id: string;
  source_reference: string;
  source_material_version: number;
  source_line_id: string;
  lot_id: string;
  variant_id: string;
  unit_id: string;
  location_id: string;
  quantity: string;
  unit_valuation_php: string;
  total_value_php: string;
  currency: 'PHP';
  condition: 'usable' | 'quarantined' | 'rejected';
  restrictions: BoundedRestriction;
  immediately_allocatable: boolean;
  posted_by: string;
  posted_at: string;
}

export interface ReceivingReportHistoryEntry {
  id: string;
  version: number;
  material_version: number;
  action: string;
  from_status: ReceivingReportStatus | null;
  to_status: ReceivingReportStatus;
  actor: ProcurementActor;
  reason: string | null;
  rm_reference: string | null;
  evidence_binding_invalidated: boolean;
  occurred_at: string;
}

export interface ReceivingReportRelatedRecord {
  kind: 'purchase_order' | 'donation' | 'stock_lot' | 'receiving_discrepancy' | 'receiving_hold';
  id: string;
  rm_line_id: string | null;
  reference: string | null;
  material_version: number;
  state: string;
}

export interface DiscrepancySupplierNotification {
  notified_by: ProcurementActor;
  notified_at: string;
  supplier_contact_reference: string;
  notification_notes: string;
  expected_resolution_date: string | null;
}

export interface ReceivingDiscrepancyResolution {
  resolution_kind: ReceivingDiscrepancyResolutionKind;
  resolved_by: ProcurementActor;
  resolved_at: string;
  reason: string;
  replacement_rm_id: string | null;
  replacement_rm_reference: string | null;
  quarantined_lot_disposition: QuarantinedLotDisposition;
  evidence_acknowledgment: Stage2EvidenceMatchAcknowledgment;
}

export interface ReceivingDiscrepancy {
  id: string;
  chapter_id: string;
  status: ReceivingDiscrepancyStatus;
  version: number;
  material_version: number;
  source_kind: ReceivingSourceKind;
  source_id: string;
  source_reference: string;
  source_line_id: string;
  rm_id: string;
  rm_reference: string;
  rm_line_id: string;
  variant_id: string;
  unit_id: string;
  quantity_scale: number;
  damaged_quantity: string;
  rejected_quantity: string;
  total_discrepant_quantity: string;
  quarantined_lot_id: string | null;
  rejected_lot_id: string | null;
  quarantined_lots_auto_cleared_on_source_close: false;
  discrepancy_notes: string;
  supplier_notification: DiscrepancySupplierNotification | null;
  review_started_by: ProcurementActor | null;
  review_started_at: string | null;
  review_notes: string | null;
  resolution: ReceivingDiscrepancyResolution | null;
  created_at: string;
  updated_at: string;
}

export interface ReceivingHoldItemInput {
  variant_id: string | null;
  unit_id: string | null;
  item_description: string;
  arrived_quantity: string;
  condition_notes: string;
}

export interface ReceivingHoldItem extends ReceivingHoldItemInput {
  id: string;
}

export interface ReceivingHoldLinkedSource {
  source_kind: ReceivingSourceKind;
  source_id: string;
  source_reference: string;
  supplier_dr_reference: string | null;
  supplier_dr_date: string | null;
  linked_by: ProcurementActor;
  linked_at: string;
  link_notes: string;
}

export interface ReceivingHoldRejectionReturn {
  rejected_by: ProcurementActor;
  rejected_at: string;
  reason: string;
  recipient_or_carrier_name: string;
  evidence_acknowledgment: Stage2EvidenceMatchAcknowledgment;
}

export interface ReceivingHold {
  id: string;
  chapter_id: string;
  status: ReceivingHoldStatus;
  version: number;
  material_version: number;
  arrived_at: string;
  holding_location_id: string;
  carrier_or_sender_name: string;
  sender_kind: 'supplier' | 'donor' | 'carrier' | 'unknown';
  delivery_document_reference: string | null;
  hold_reason: string;
  usable_stock_posted: false;
  ipc_creation_prohibited: true;
  items: ReceivingHoldItem[];
  intake_evidence: Stage2EvidenceByteBinding | null;
  recorded_by: ProcurementActor;
  linked_source: ReceivingHoldLinkedSource | null;
  rejection_return: ReceivingHoldRejectionReturn | null;
  created_at: string;
  updated_at: string;
}

export interface ReceivingHoldHistoryEntry {
  id: string;
  version: number;
  material_version: number;
  action: 'held' | 'linked_to_source' | 'rejected_returned';
  from_status: ReceivingHoldStatus | null;
  to_status: ReceivingHoldStatus;
  actor: ProcurementActor;
  reason: string;
  linked_source_reference: string | null;
  occurred_at: string;
}

export type ReceivingOperationName =
  | 'createReceivingReport'
  | 'replaceReceivingReport'
  | 'inspectReceivingReport'
  | 'matchReceivingReportEvidence'
  | 'postReceivingReport'
  | 'cancelReceivingReport'
  | 'notifySupplierOfReceivingDiscrepancy'
  | 'resolveReceivingDiscrepancy'
  | 'createReceivingHold'
  | 'linkReceivingHoldSource'
  | 'rejectReturnReceivingHold';

export interface ReceivingOperationReceipt<T = unknown> {
  operation_id: string;
  chapter_id: string;
  actor_id: string;
  operation_name: ReceivingOperationName;
  action_key: string;
  resource_kind: 'receiving_report' | 'receiving_discrepancy' | 'receiving_hold';
  resource_id: string;
  committed_version: number;
  committed_material_version: number;
  status_code: 200 | 201;
  committed_at: string;
  outcome: 'committed';
  result: T;
  posting?: ReceivingPostingSummary | null;
}

/* ==================== 5. Donations & ADR 0004 Restriction Resolution ==================== */

export type DonationStatus =
  | 'draft'
  | 'pending_acknowledgment'
  | 'returned_for_revision'
  | 'declined'
  | 'acknowledged'
  | 'partially_received'
  | 'received'
  | 'closed_short'
  | 'canceled';

export type DonationMutationName =
  | 'createDonation'
  | 'replaceDonation'
  | 'submitDonation'
  | 'acknowledgeDonation'
  | 'returnDonation'
  | 'declineDonation'
  | 'reviseDonation'
  | 'closeShortDonation'
  | 'cancelDonation'
  | 'resolveDonationRestriction';

export interface DonationLineInput {
  variant_id: string;
  unit_id: string;
  pledged_quantity: string;
  condition_notes: string;
  valuation_kind: 'declared' | 'estimated';
  unit_value_php: string;
  valuation_basis: string;
  restrictions: BoundedRestriction;
}

export interface DonationLine extends DonationLineInput {
  line_id: string;
  quantity_scale: number;
  received_quantity: string;
  outstanding_quantity: string;
  pledged_value_php: string;
}

export interface DonationAcknowledgment {
  actor_id: string;
  signed_at: string;
  committed_at: string;
  binding: Stage2EvidenceByteBinding;
  snapshot: Stage2EvidenceSnapshot;
}

export interface Donation {
  da_id: string;
  chapter_id: string;
  version: number;
  material_version: number;
  status: DonationStatus;
  reference: string | null;
  prepared_by: string;
  donor_name: string;
  lines: DonationLine[];
  valuation_policy: PolicyBindingRef;
  pledged_total_value_php: string;
  acknowledgment: DonationAcknowledgment | null;
  updated_at: string;
}

export interface DonationRestrictionResolution {
  resolution_id: string;
  da_line_id: string;
  reason: string;
  resolution_kind: 'apply' | 'audit_review';
  restrictions: BoundedRestriction;
  previous_restrictions: BoundedRestriction;
  actor_id: string;
  signed_at: string;
  committed_at: string;
  binding: Stage2EvidenceByteBinding;
  snapshot: Stage2EvidenceSnapshot;
}

export interface DonationOperationReceipt {
  operation_id: string;
  operation_name: DonationMutationName;
  action_key: string;
  actor_id: string;
  chapter_id: string;
  committed_at: string;
  http_status: 200 | 201;
  result: Donation;
  restriction_resolution: DonationRestrictionResolution | null;
}

export interface DonationHistoryEntry {
  version: number;
  material_version: number;
  status: DonationStatus;
  action: string;
  actor_id: string;
  committed_at: string;
  reason: string | null;
  restriction_resolution: DonationRestrictionResolution | null;
}

export interface DonationRelatedEntry {
  resource_kind: 'receiving_report' | 'receiving_discrepancy' | 'stock_lot';
  resource_id: string;
  da_line_id: string | null;
}

/* ==================== 6. Allocation Queue, Alerts & Stage 2 Reports ==================== */

export interface AllocationEligibleSourceLot {
  stock_lot_id: string;
  source_kind: 'opening_rm' | 'po_rm' | 'da_rm';
  source_reference: string;
  location_id: string;
  free_quantity: string;
  restriction_state: 'unrestricted' | 'bounded';
}

export interface AllocationQueueEntry {
  queue_position: number;
  allocation_tier: 'active_commitment' | 'approved_override' | 'standard_priority';
  priority_rank: number;
  override_policy_id: string | null;
  needed_at: string;
  approved_at: string;
  rf_id: string;
  rf_reference: string;
  rf_line_id: string;
  rf_version: number;
  rf_material_version: number;
  rf_progress_version: number;
  rf_fulfillment: 'outstanding' | 'partially_issued';
  requesting_unit_id: string;
  event_id: string | null;
  item_id: string;
  item_code: string;
  item_name: string;
  variant_id: string;
  variant_code: string;
  variant_label: string;
  unit_id: string;
  unit_code: string;
  quantity_scale: number;
  approved_quantity: string;
  issued_quantity: string;
  canceled_quantity: string;
  active_reserved_quantity: string;
  unreserved_outstanding_quantity: string;
  usable_stockroom_on_hand: string;
  active_stock_hold_quantity: string;
  ineligible_restricted_quantity: string;
  uninterpreted_restricted_quantity: string;
  eligible_available_quantity: string;
  eligible_sources: AllocationEligibleSourceLot[];
  stage1_next_routes: {
    allocation_review_route: string;
    reservation_prepare_route: string;
    actual_issue_prepare_route: string;
  };
}

export interface AllocationQueueListResponse {
  data: AllocationQueueEntry[];
  allocation_policy: PolicyBindingRef;
  observed_at: string;
  is_commit_authorization: false;
  page: CursorPage;
}

export type OfficerAlertType =
  | 'low_stock_rop'
  | 'repf_pending_approval'
  | 'po_pending_approval'
  | 'da_pending_acknowledgment'
  | 'demand_changed'
  | 'open_receiving_discrepancy'
  | 'active_missing_source_hold'
  | 'open_rf_shortage';

export type OfficerAlertSeverity = 'critical' | 'warning' | 'info';

export interface OfficerAlert {
  alert_key: string;
  alert_type: OfficerAlertType;
  severity: OfficerAlertSeverity;
  record_kind: 'variant' | 'repf' | 'purchase_order' | 'donation' | 'receiving_discrepancy' | 'receiving_hold' | 'internal_rf';
  record_id: string;
  record_reference: string | null;
  responsible_duty: Stage2Duty;
  summary: string;
  target_route_hint: string;
  detected_at: string;
}

export interface OfficerAlertListResponse {
  data: OfficerAlert[];
  caller_matched_duties: string[];
  persisted_ack_supported: false;
  observed_at: string;
  page: CursorPage;
}

export type InventoryReportStatus =
  | 'all'
  | 'low_stock'
  | 'with_shortage'
  | 'with_quarantine'
  | 'with_uninterpreted_restriction'
  | 'normal';

export type ProcurementReportStatus =
  | 'all'
  | 'open_demand'
  | 'awaiting_approval'
  | 'in_procurement'
  | 'partially_received'
  | 'with_discrepancy'
  | 'demand_changed'
  | 'closed';

export type ControlReportStatus =
  | 'all'
  | 'uninterpreted_restriction'
  | 'bounded_restriction'
  | 'overdue_exception'
  | 'discrepancy_open'
  | 'hold_open'
  | 'resolved';

export interface ReportMetadata {
  report_kind: 'inventory' | 'procurement' | 'control';
  chapter_id: string;
  chapter_name: string;
  currency_code: 'PHP';
  currency_label: 'Philippine Peso (PHP)';
  generated_at: string;
  filters: {
    date_from: string;
    date_to: string;
    item_id: string | null;
    variant_id: string | null;
    location_id: string | null;
    status: string;
  };
}

export interface InventoryReportRow {
  item_id: string;
  item_code: string;
  item_name: string;
  variant_id: string;
  variant_code: string;
  variant_label: string;
  unit_id: string;
  unit_code: string;
  unit_label: string;
  quantity_scale: number;
  location_id: string;
  location_name: string;
  custodian_id: string | null;
  custodian_name: string | null;
  condition: 'usable' | 'quarantined' | 'rejected';
  custody: 'stockroom' | 'booth' | 'inbound';
  restriction_state: 'unrestricted' | 'bounded' | 'uninterpreted';
  eligibility_status: 'eligible' | 'restricted_bounded' | 'blocked_uninterpreted' | 'held' | 'quarantined_or_rejected';
  usable_stockroom_on_hand: string;
  available_to_allocate: string;
  rf_reserved: string;
  quarantined_rejected: string;
  active_stock_hold: string;
  inbound_open_po: string;
  period_receipts_quantity: string;
  period_issues_quantity: string;
  unreserved_rf_shortage: string;
  approved_rop: string | null;
  approved_target: string | null;
  low_stock_breach: boolean;
  usable_valuation_php: string;
}

export interface InventoryReportResponse {
  metadata: ReportMetadata;
  stock_category_labels: {
    usable_stockroom_on_hand: string;
    available_to_allocate: string;
    rf_reserved: string;
    so_reserved: string;
    booth_custody: string;
    quarantined_rejected: string;
    inbound_open_po: string;
    views_are_additive: false;
  };
  data: InventoryReportRow[];
  totals: {
    row_count: number;
    total_usable_valuation_php: string;
    low_stock_row_count: number;
    uninterpreted_row_count: number;
    shortage_row_count: number;
  };
  page: CursorPage;
}

export interface ProcurementReportResponse {
  metadata: ReportMetadata;
  rf_demand_summary: Array<{
    rf_id: string;
    rf_reference: string;
    rf_line_id: string;
    requesting_unit_id: string;
    priority_rank: number;
    needed_at: string;
    approved_at: string;
    rf_fulfillment: string;
    item_id: string;
    variant_id: string;
    variant_code: string;
    unit_id: string;
    unit_code: string;
    quantity_scale: number;
    approved_quantity: string;
    issued_quantity: string;
    outstanding_quantity: string;
    canceled_quantity: string;
    active_reserved_quantity: string;
  }>;
  repf_summary: Array<{
    repf_id: string;
    repf_reference: string | null;
    status: RepfStatus;
    trigger_kinds: RepfTriggerKind[];
    urgency: RepfUrgency;
    linked_demand_canceled: boolean;
    requested_total_php: string;
    budget_decision: RepfBudgetDecision | null;
    budget_reviewed_at: string | null;
    quotation_count: number;
    supplier_selected: boolean;
  }>;
  purchase_order_summary: Array<{
    po_id: string;
    po_line_id: string;
    po_reference: string | null;
    repf_id: string;
    status: PurchaseOrderStatus;
    supplier_name: string;
    linked_demand_canceled: boolean;
    variant_id: string;
    variant_code: string;
    unit_id: string;
    unit_code: string;
    quantity_scale: number;
    location_id: string | null;
    ordered_quantity: string;
    accepted_quantity: string;
    rejected_or_disputed_quantity: string;
    outstanding_quantity: string;
    ordered_total_php: string;
    accepted_value_php: string;
    open_discrepancy_count: number;
    resolved_discrepancy_count: number;
  }>;
  totals: {
    open_rf_lines_count: number;
    repf_count: number;
    po_count: number;
    total_ordered_php: string;
    total_accepted_value_php: string;
    open_discrepancy_count: number;
  };
  page: CursorPage;
}

export interface ControlReportResponse {
  metadata: ReportMetadata;
  donation_restrictions: Array<{
    da_id: string;
    da_reference: string | null;
    da_status: DonationStatus;
    donor_name: string;
    location_id: string | null;
    item_id: string;
    variant_id: string;
    variant_code: string;
    unit_id: string;
    unit_code: string;
    quantity_scale: number;
    declared_quantity: string;
    received_quantity: string;
    declared_value_php: string;
    restriction: BoundedRestriction;
    allocatable_now: boolean;
  }>;
  restriction_resolutions: Array<{
    resolution_id: string;
    da_id: string;
    da_reference: string;
    da_line_id: string;
    previous_state: 'uninterpreted' | 'bounded' | 'unrestricted';
    resolved_state: 'unrestricted' | 'bounded' | 'uninterpreted';
    affected_lot_count: number;
    evidence_id: string;
    actor: ProcurementActor;
    resolved_at: string;
    reason: string;
  }>;
  overdue_exceptions: Array<{
    exception_kind: string;
    record_id: string;
    record_reference: string | null;
    location_id: string | null;
    responsible_duty: Stage2Duty;
    status: string;
    due_or_since_at: string;
    overdue_hours: number;
    summary: string;
  }>;
  audit_history: Array<{
    event_id: string;
    record_kind: string;
    record_id: string;
    record_reference: string | null;
    action: string;
    actor: ProcurementActor;
    occurred_at: string;
    reason: string | null;
  }>;
  totals: {
    donation_row_count: number;
    uninterpreted_donation_count: number;
    resolution_count: number;
    overdue_exception_count: number;
    audit_entry_count: number;
    total_declared_donation_value_php: string;
  };
  page: CursorPage;
}
