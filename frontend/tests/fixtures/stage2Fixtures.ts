import {
  registerStage2PreviewAdapter,
  type Stage2PreviewRequest,
} from '../../src/api/stage2Client.ts';
import type {
  AllocationQueueListResponse,
  ControlReportResponse,
  Donation,
  DonationHistoryEntry,
  DonationOperationReceipt,
  DonationRelatedEntry,
  InventoryReportResponse,
  OfficerAlertListResponse,
  ProcurementOperationReceipt,
  ProcurementReportResponse,
  PurchaseOrder,
  PurchaseOrderHistoryEntry,
  PurchaseOrderRelatedRecord,
  ReceivingDiscrepancy,
  ReceivingHold,
  ReceivingHoldHistoryEntry,
  ReceivingMovement,
  ReceivingOperationReceipt,
  ReceivingReport,
  ReceivingReportHistoryEntry,
  ReceivingReportRelatedRecord,
  Repf,
  RepfHistoryEntry,
  RepfQuotation,
  RepfRelatedRecord,
  ReplenishmentNeedItem,
  SupplierSelection,
} from '../../src/api/stage2Types.ts';
import type { Stage1EventNotice } from '../../src/api/types.ts';
import { ContractApiError, newActionKey } from '../../src/api/client.ts';
import { stage2EvidenceStore } from '../../src/state/stage2EvidenceStore.ts';

interface ChapterPreviewState {
  chapterId: string;
  needs: ReplenishmentNeedItem[];
  repfs: Repf[];
  repfHistory: Record<string, RepfHistoryEntry[]>;
  repfVersions: Record<string, Record<number, Repf>>;
  quotations: Record<string, RepfQuotation[]>;
  selections: Record<string, SupplierSelection>;
  purchaseOrders: PurchaseOrder[];
  poHistory: Record<string, PurchaseOrderHistoryEntry[]>;
  poVersions: Record<string, Record<number, PurchaseOrder>>;
  donations: Donation[];
  daHistory: Record<string, DonationHistoryEntry[]>;
  daVersions: Record<string, Record<number, Donation>>;
  receivingReports: ReceivingReport[];
  rmHistory: Record<string, ReceivingReportHistoryEntry[]>;
  rmVersions: Record<string, Record<number, ReceivingReport>>;
  movements: Record<string, ReceivingMovement[]>;
  discrepancies: ReceivingDiscrepancy[];
  holds: ReceivingHold[];
  holdHistory: Record<string, ReceivingHoldHistoryEntry[]>;
  procOps: ProcurementOperationReceipt[];
  donationOps: DonationOperationReceipt[];
  receivingOps: ReceivingOperationReceipt[];
  counters: { repf: number; po: number; da: number; rm: number; lot: number; disc: number; hold: number };
}

const previewChapters = new Map<string, ChapterPreviewState>();
let previewActiveChapterId: string | null = null;
let previewEnabled = false;
let noticeEmitter: ((notice: Stage1EventNotice) => void) | null = null;
const previewListeners = new Set<() => void>();

const PREVIEW_ACTOR = {
  user_id: '10000000-0000-4000-8000-000000000002',
  display_name: 'Chapter Officer (Preview)',
};

const PREVIEW_REVIEWER = {
  user_id: '10000000-0000-4000-8000-000000000009',
  display_name: 'Independent Reviewer (Preview)',
};

const POLICY_REF = {
  policy_id: '71000000-0000-4000-8000-000000000005',
  version: 2,
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapPrintDoc(heading: string, rows: Array<[string, string]>, footnote: string): string {
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #d4d4d8;color:#3f3f46;font-size:12px;">${escapeHtml(k)}</th><td style="padding:6px 10px;border-bottom:1px solid #d4d4d8;font-size:13px;">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head><body style="font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#111827;background:#ffffff;"><div style="border-bottom:2px solid #18181b;padding-bottom:10px;margin-bottom:16px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#52525b;">Youth Service Philippines — Contract Preview Printout</div><h1 style="margin:6px 0 0;font-size:20px;">${escapeHtml(heading)}</h1></div><table style="width:100%;border-collapse:collapse;">${trs}</table><p style="margin-top:18px;font-size:12px;color:#52525b;">${escapeHtml(footnote)}</p></body></html>`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toFixedMoney(val: number): string {
  return val.toFixed(2);
}

function num(s: string | null | undefined): number {
  const parsed = Number.parseFloat(s ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function createSeedState(chapterId: string): ChapterPreviewState {
  const ts = '2026-11-26T04:00:00.000000Z';
  const repf1Id = '90000000-0000-4000-8000-000000000010';
  const repf1Line1 = '90100000-0000-4000-8000-000000000011';
  const repf1Line2 = '90100000-0000-4000-8000-000000000012';
  const repf2Id = '90000000-0000-4000-8000-000000000020';
  const repf3Id = '90000000-0000-4000-8000-000000000030';

  const q1Id = '93000000-0000-4000-8000-000000000001';
  const q1LineId = '93100000-0000-4000-8000-000000000001';
  const q2Id = '93000000-0000-4000-8000-000000000002';
  const q2LineId = '93100000-0000-4000-8000-000000000002';
  const sel1Id = '93500000-0000-4000-8000-000000000001';

  const po1Id = '96000000-0000-4000-8000-000000000101';
  const po1Line1 = '96000000-0000-4000-8000-000000000102';
  const po2Id = '94000000-0000-4000-8000-000000000002';
  const po3Id = '94000000-0000-4000-8000-000000000003';

  const da1Id = '92000000-0000-4000-8000-000000000001';
  const da2Id = '92000000-0000-4000-8000-000000000002';

  const rm1Id = '97000000-0000-4000-8000-000000000001';
  const rm1Line1 = '97000000-0000-4000-8000-000000000011';
  const rm2Id = '97000000-0000-4000-8000-000000000002';
  const disc1Id = '97100000-0000-4000-8000-000000000001';
  const hold1Id = '97200000-0000-4000-8000-000000000001';

  const shirtVariant = '95000000-0000-4000-8000-000000000051';
  const bottleVariant = '95000000-0000-4000-8000-000000000061';
  const kitVariant = '95000000-0000-4000-8000-000000000071';
  const unitPcs = '95000000-0000-4000-8000-000000000052';
  const unitKit = '95000000-0000-4000-8000-000000000053';
  const mainLoc = '61000000-0000-4000-8000-000000000001';
  const holdLoc = '61000000-0000-4000-8000-000000000002';

  const sampleEvidence = {
    evidence_id: '81000000-0000-4000-8000-000000000301',
    version_id: '82000000-0000-4000-8000-000000000301',
    attachments: [
      {
        attachment_id: '83000000-0000-4000-8000-000000000301',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
  };

  stage2EvidenceStore.record({
    chapterId,
    purpose: 'po_supplier_dr',
    recordId: rm1Id,
    label: 'PO-2026-0001 Supplier DR-SUP-2026-881',
    version: 1,
    uploadedAt: ts,
    binding: sampleEvidence,
  });

  stage2EvidenceStore.record({
    chapterId,
    purpose: 'da_acknowledgment',
    recordId: da1Id,
    label: 'DA-2026-0001 Signed Donor Slip',
    version: 1,
    uploadedAt: ts,
    binding: {
      evidence_id: '81000000-0000-4000-8000-000000000401',
      version_id: '82000000-0000-4000-8000-000000000401',
      attachments: [
        {
          attachment_id: '83000000-0000-4000-8000-000000000401',
          sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      ],
    },
  });

  const repf1: Repf = {
    id: repf1Id,
    chapter_id: chapterId,
    repf_reference: 'REPF-2026-0001',
    status: 'partially_ordered',
    version: 3,
    material_version: 1,
    funding_source: 'chapter_funds',
    urgency: 'urgent',
    trigger_kinds: ['rf_shortage', 'rop_replenishment'],
    justification: 'Cover unreserved RF-2026-0001 shortage and restore SHIRT-M to target stock level.',
    estimated_total_php: '13750.00',
    approved_budget_php: '13750.00',
    has_additional_purchase_override: false,
    linked_demand_canceled: false,
    preparer: PREVIEW_ACTOR,
    submitted_by: PREVIEW_ACTOR,
    submitted_at: ts,
    budget_reviewer: PREVIEW_REVIEWER,
    budget_reviewed_at: ts,
    budget_decision: 'approve',
    budget_decision_reason: 'Verified combined shortage + ROP top-up.',
    canceled_by: null,
    canceled_at: null,
    cancel_reason: null,
    lines: [
      {
        id: repf1Line1,
        line_number: 1,
        trigger_kind: 'rf_shortage',
        item_id: '95000000-0000-4000-8000-000000000050',
        item_code: 'SHIRT',
        variant_id: shirtVariant,
        variant_code: 'SHIRT-M',
        display_name: 'Chapter Shirt / Medium',
        unit_id: unitPcs,
        unit_code: 'PCS',
        quantity_scale: 0,
        rf_id: '91000000-0000-4000-8000-000000000001',
        rf_reference: 'RF-2026-0001',
        rf_line_id: '91000000-0000-4000-8000-000000000011',
        rf_material_version: 2,
        linked_demand_canceled: false,
        linked_demand_canceled_at: null,
        requested_quantity: '50',
        ordered_quantity: '40',
        canceled_quantity: '0',
        remaining_to_order_quantity: '10',
        estimated_unit_cost_php: '250.00',
        estimated_line_total_php: '12500.00',
        needed_by: '2026-12-01T01:00:00.000000Z',
        net_need_breakdown: {
          snapshot_version: 14,
          observed_at: ts,
          approved_rop: '20',
          approved_target_level: '50',
          usable_stockroom_on_hand: '18',
          eligible_usable_stockroom_on_hand: '18',
          active_rf_reservations: '8',
          eligible_available_to_allocate: '10',
          unreserved_approved_rf_shortage: '15',
          open_repf_quantity: '0',
          open_po_inbound_quantity: '10',
          total_open_inbound_coverage: '10',
          excluded_inbound_quantity: '5',
          gross_rf_shortage_need: '15',
          gross_rop_replenishment_need: '50',
          gross_combined_need: '65',
          uncovered_rf_shortage_quantity: '5',
          uncovered_rop_replenishment_quantity: '50',
          variant_proposed_uncovered_quantity: '55',
          uncovered_need: '5',
          exceeds_uncovered_need: false,
        },
        additional_purchase_reason: null,
        notes: 'RF shortage line.',
      },
      {
        id: repf1Line2,
        line_number: 2,
        trigger_kind: 'rop_replenishment',
        item_id: '95000000-0000-4000-8000-000000000050',
        item_code: 'SHIRT',
        variant_id: shirtVariant,
        variant_code: 'SHIRT-M',
        display_name: 'Chapter Shirt / Medium',
        unit_id: unitPcs,
        unit_code: 'PCS',
        quantity_scale: 0,
        rf_id: null,
        rf_reference: null,
        rf_line_id: null,
        rf_material_version: null,
        linked_demand_canceled: false,
        linked_demand_canceled_at: null,
        requested_quantity: '5',
        ordered_quantity: '0',
        canceled_quantity: '0',
        remaining_to_order_quantity: '5',
        estimated_unit_cost_php: '250.00',
        estimated_line_total_php: '1250.00',
        needed_by: '2026-12-05T01:00:00.000000Z',
        net_need_breakdown: {
          snapshot_version: 14,
          observed_at: ts,
          approved_rop: '20',
          approved_target_level: '50',
          usable_stockroom_on_hand: '18',
          eligible_usable_stockroom_on_hand: '18',
          active_rf_reservations: '8',
          eligible_available_to_allocate: '10',
          unreserved_approved_rf_shortage: '15',
          open_repf_quantity: '0',
          open_po_inbound_quantity: '10',
          total_open_inbound_coverage: '10',
          excluded_inbound_quantity: '5',
          gross_rf_shortage_need: '15',
          gross_rop_replenishment_need: '50',
          gross_combined_need: '65',
          uncovered_rf_shortage_quantity: '5',
          uncovered_rop_replenishment_quantity: '50',
          variant_proposed_uncovered_quantity: '55',
          uncovered_need: '50',
          exceeds_uncovered_need: false,
        },
        additional_purchase_reason: null,
        notes: 'Non-overlapping ROP buffer to target.',
      },
    ],
    created_at: ts,
    updated_at: ts,
  };

  const repf2: Repf = {
    ...repf1,
    id: repf2Id,
    repf_reference: 'REPF-2026-0002',
    status: 'pending_budget_review',
    version: 2,
    urgency: 'normal',
    trigger_kinds: ['rop_replenishment'],
    justification: 'Replenish Reusable Bottle 500ml back to target stock level.',
    estimated_total_php: '6300.00',
    approved_budget_php: null,
    budget_reviewer: null,
    budget_reviewed_at: null,
    budget_decision: null,
    budget_decision_reason: null,
    lines: [
      {
        ...repf1.lines[1]!,
        id: '90100000-0000-4000-8000-000000000021',
        item_id: '95000000-0000-4000-8000-000000000060',
        item_code: 'BOTTLE',
        variant_id: bottleVariant,
        variant_code: 'BOTTLE-500',
        display_name: 'Reusable Bottle / 500ml',
        requested_quantity: '35',
        remaining_to_order_quantity: '35',
        estimated_unit_cost_php: '180.00',
        estimated_line_total_php: '6300.00',
        notes: 'Pure ROP breach replenishment.',
      },
    ],
  };

  const repf3: Repf = {
    ...repf1,
    id: repf3Id,
    repf_reference: 'REPF-2026-0003',
    status: 'held',
    version: 2,
    trigger_kinds: ['rf_shortage'],
    justification: 'Replacement stock after event request change.',
    estimated_total_php: '2200.00',
    approved_budget_php: null,
    linked_demand_canceled: true,
    budget_decision: 'hold',
    budget_decision_reason: 'Awaiting event coordinator confirmation after RF cancelation.',
    lines: [
      {
        ...repf1.lines[0]!,
        id: '90100000-0000-4000-8000-000000000031',
        item_id: '95000000-0000-4000-8000-000000000070',
        item_code: 'KIT',
        variant_id: kitVariant,
        variant_code: 'KIT-AID',
        display_name: 'First Aid Field Kit / Standard',
        unit_id: unitKit,
        unit_code: 'KIT',
        requested_quantity: '4',
        ordered_quantity: '0',
        remaining_to_order_quantity: '4',
        estimated_unit_cost_php: '550.00',
        estimated_line_total_php: '2200.00',
        linked_demand_canceled: true,
        linked_demand_canceled_at: ts,
      },
    ],
  };

  const q1: RepfQuotation = {
    id: q1Id,
    chapter_id: chapterId,
    repf_id: repf1Id,
    version: 1,
    material_version: 1,
    supplier: {
      supplier_name: 'Visayas Apparel Wholesalers',
      supplier_subtype: 'wholesaler',
      contact_reference: 'sales@visayasapparel.example.invalid / +63-32-555-0101',
      supplier_reference: 'VAW-Q-2026-114',
    },
    quoted_at: ts,
    valid_until: '2026-12-10',
    lead_time_days: 5,
    availability_summary: '100 units ready for dispatch from Cebu warehouse.',
    quality_warranty_terms: '220gsm combed cotton; 30-day stitching replacement warranty.',
    payment_and_delivery_terms: '50% upon delivery acceptance, 50% net 15 days; free delivery.',
    reliability_notes: 'Prior chapter print supplier; zero late deliveries in 2025.',
    currency: 'PHP',
    total_amount_php: '24000.00',
    is_selected: true,
    selected_at: ts,
    evidence_binding: sampleEvidence,
    recorded_by: PREVIEW_ACTOR,
    lines: [
      {
        id: q1LineId,
        repf_line_id: repf1Line1,
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        quoted_quantity: '100',
        unit_price_php: '240.00',
        line_total_php: '24000.00',
        notes: 'Includes chapter crest print.',
      },
    ],
    created_at: ts,
    updated_at: ts,
  };

  const q2: RepfQuotation = {
    ...q1,
    id: q2Id,
    supplier: {
      supplier_name: 'Cebu Textile Cooperative',
      supplier_subtype: 'cooperative',
      contact_reference: 'orders@cebutextile.example.invalid / +63-32-555-0199',
      supplier_reference: 'CTC-2026-088',
    },
    lead_time_days: 7,
    total_amount_php: '26500.00',
    is_selected: false,
    selected_at: null,
    lines: [
      {
        id: q2LineId,
        repf_line_id: repf1Line1,
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        quoted_quantity: '100',
        unit_price_php: '265.00',
        line_total_php: '26500.00',
        notes: 'Standard 7-day lead time.',
      },
    ],
  };

  const sel1: SupplierSelection = {
    id: sel1Id,
    chapter_id: chapterId,
    repf_id: repf1Id,
    version: 1,
    material_version: 1,
    selected_quotation_id: q1Id,
    comparable_quotation_ids: [q1Id, q2Id],
    comparable_quote_count: 2,
    policy_evaluation: {
      policy_id: POLICY_REF.policy_id,
      policy_version: 2,
      evaluated_amount_php: '24000.00',
      applicable_tier_min_php: '5000.01',
      applicable_tier_max_php: '50000.00',
      required_minimum_quotes: 2,
      comparable_quote_count: 2,
      waiver_permitted: true,
      minimum_quotes_when_waived: 1,
      emergency_waiver_used: false,
      approving_duties_for_waiver: ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
    },
    emergency_waiver_used: false,
    emergency_waiver_reason: null,
    selection_rationale: 'Lowest unit cost (PHP 240/ea) with faster 5-day Cebu delivery.',
    selected_by: PREVIEW_ACTOR,
    selected_at: ts,
  };

  const po1: PurchaseOrder = {
    id: po1Id,
    chapter_id: chapterId,
    po_reference: 'PO-2026-0001',
    status: 'partially_received',
    version: 7,
    material_version: 2,
    repf_id: repf1Id,
    repf_reference: 'REPF-2026-0001',
    originating_repf_preparer: PREVIEW_ACTOR,
    supplier_selection_id: sel1Id,
    selected_quotation_id: q1Id,
    emergency_waiver_used: false,
    supplier: q1.supplier,
    delivery_location: 'Main Chapter Stockroom, Gate 2, Cebu City',
    expected_delivery_date: '2026-12-02',
    payment_and_delivery_terms: q1.payment_and_delivery_terms,
    currency: 'PHP',
    total_amount_php: '24000.00',
    linked_demand_canceled: false,
    preparer: PREVIEW_ACTOR,
    submitted_by: PREVIEW_ACTOR,
    submitted_at: ts,
    approved_by: PREVIEW_REVIEWER,
    approved_at: ts,
    issued_at: ts,
    review_decision_reason: null,
    acknowledgment: null,
    pending_amendment: null,
    approved_amendment_count: 0,
    closed_short_by: null,
    closed_short_at: null,
    close_short_reason: null,
    canceled_by: null,
    canceled_at: null,
    cancel_reason: null,
    lines: [
      {
        id: po1Line1,
        repf_line_id: repf1Line1,
        quotation_line_id: q1LineId,
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        ordered_quantity: '100',
        accepted_quantity: '40',
        rejected_or_disputed_quantity: '10',
        closed_short_quantity: '0',
        canceled_quantity: '0',
        outstanding_quantity: '60',
        unit_price_php: '240.00',
        line_total_php: '24000.00',
        specifications: '220gsm combed cotton Chapter Shirt Medium with crest print.',
        linked_demand_canceled: false,
        linked_demand_canceled_at: null,
        notes: 'Partial delivery 40 accepted + 10 rejected; 60 remaining open.',
      },
    ],
    created_at: ts,
    updated_at: ts,
  };

  const po2: PurchaseOrder = {
    ...po1,
    id: po2Id,
    po_reference: null,
    status: 'pending_approval',
    version: 2,
    material_version: 1,
    total_amount_php: '9600.00',
    approved_by: null,
    approved_at: null,
    issued_at: null,
    lines: [
      {
        ...po1.lines[0]!,
        id: '94100000-0000-4000-8000-000000000021',
        ordered_quantity: '40',
        accepted_quantity: '0',
        rejected_or_disputed_quantity: '0',
        outstanding_quantity: '40',
        line_total_php: '9600.00',
        notes: 'Awaiting independent budget approval.',
      },
    ],
  };

  const po3: PurchaseOrder = {
    ...po1,
    id: po3Id,
    po_reference: 'PO-2026-0002',
    status: 'issued',
    version: 4,
    linked_demand_canceled: true,
    total_amount_php: '12000.00',
    lines: [
      {
        ...po1.lines[0]!,
        id: '94100000-0000-4000-8000-000000000031',
        ordered_quantity: '50',
        accepted_quantity: '0',
        rejected_or_disputed_quantity: '0',
        outstanding_quantity: '50',
        line_total_php: '12000.00',
        linked_demand_canceled: true,
        linked_demand_canceled_at: ts,
        notes: 'Linked RF canceled unissued remainder — review for amendment or cancelation.',
      },
    ],
  };

  const da1: Donation = {
    da_id: da1Id,
    chapter_id: chapterId,
    version: 3,
    material_version: 1,
    status: 'acknowledged',
    reference: 'DA-2026-0001',
    prepared_by: PREVIEW_ACTOR.user_id,
    donor_name: 'Example Community Foundation',
    lines: [
      {
        line_id: '92100000-0000-4000-8000-000000000001',
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        pledged_quantity: '10',
        received_quantity: '10',
        outstanding_quantity: '0',
        condition_notes: 'New, individually packed',
        valuation_kind: 'declared',
        unit_value_php: '200.00',
        pledged_value_php: '2000.00',
        valuation_basis: '2026 chapter-approved comparative unit valuation',
        restrictions: {
          state: 'unrestricted',
          allowed_uses: [],
          event_ids: [],
          requesting_unit_ids: [],
          effective_from: null,
          effective_until: null,
          interpretation_id: null,
          source_condition_reference: null,
        },
      },
      {
        line_id: '92100000-0000-4000-8000-000000000002',
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        pledged_quantity: '10',
        received_quantity: '10',
        outstanding_quantity: '0',
        condition_notes: 'Restricted for distribution use',
        valuation_kind: 'estimated',
        unit_value_php: '200.00',
        pledged_value_php: '2000.00',
        valuation_basis: '2026 chapter-approved comparative unit valuation',
        restrictions: {
          state: 'bounded',
          allowed_uses: ['internal_use'],
          event_ids: ['63000000-0000-4000-8000-000000000001'],
          requesting_unit_ids: ['62000000-0000-4000-8000-000000000001'],
          effective_from: null,
          effective_until: '2026-12-31T23:59:59Z',
          interpretation_id: null,
          source_condition_reference: 'Donor Memo §2 — Relief Caravan only',
        },
      },
      {
        line_id: '92100000-0000-4000-8000-000000000003',
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        pledged_quantity: '10',
        received_quantity: '10',
        outstanding_quantity: '0',
        condition_notes: 'Donor handwritten clause needs signed ADR 0004 interpretation',
        valuation_kind: 'estimated',
        unit_value_php: '200.00',
        pledged_value_php: '2000.00',
        valuation_basis: '2026 chapter-approved comparative unit valuation',
        restrictions: {
          state: 'uninterpreted',
          allowed_uses: [],
          event_ids: [],
          requesting_unit_ids: [],
          effective_from: null,
          effective_until: null,
          interpretation_id: null,
          source_condition_reference: 'Donor handwritten note: hold until chapter coordinator confirms barangay beneficiary list',
        },
      },
    ],
    valuation_policy: POLICY_REF,
    pledged_total_value_php: '6000.00',
    acknowledgment: {
      actor_id: PREVIEW_REVIEWER.user_id,
      signed_at: ts,
      committed_at: ts,
      binding: sampleEvidence,
      snapshot: {
        target: { purpose: 'da_acknowledgment', record_id: da1Id },
        material_version: 1,
        sha256: sampleEvidence.attachments[0]!.sha256,
      },
    },
    updated_at: ts,
  };

  const da2: Donation = {
    ...da1,
    da_id: da2Id,
    version: 2,
    status: 'pending_acknowledgment',
    reference: null,
    donor_name: 'Cebu Civic Partners',
    acknowledgment: null,
    pledged_total_value_php: '11000.00',
    lines: [
      {
        line_id: '92100000-0000-4000-8000-000000000004',
        variant_id: kitVariant,
        unit_id: unitKit,
        quantity_scale: 0,
        pledged_quantity: '20',
        received_quantity: '0',
        outstanding_quantity: '20',
        condition_notes: 'Sealed medical pouches',
        valuation_kind: 'declared',
        unit_value_php: '550.00',
        pledged_value_php: '11000.00',
        valuation_basis: 'Supplier invoice attached by donor',
        restrictions: {
          state: 'unrestricted',
          allowed_uses: [],
          event_ids: [],
          requesting_unit_ids: [],
          effective_from: null,
          effective_until: null,
          interpretation_id: null,
          source_condition_reference: null,
        },
      },
    ],
  };

  const rm1: ReceivingReport = {
    id: rm1Id,
    chapter_id: chapterId,
    rm_reference: 'RM-2026-0002',
    source_kind: 'po',
    source_id: po1Id,
    source_reference: 'PO-2026-0001',
    source_material_version: 2,
    originating_hold_id: null,
    supplier_dr_reference: 'DR-SUP-2026-881',
    supplier_dr_date: '2026-11-26',
    status: 'posted',
    version: 4,
    material_version: 1,
    location_id: mainLoc,
    currency: 'PHP',
    accepted_total_value_php: '9600.00',
    preparer: PREVIEW_ACTOR,
    inspection: {
      inspector: PREVIEW_ACTOR,
      technical_or_requesting_representative: {
        user_id: '10000000-0000-4000-8000-000000000008',
        display_name: 'Marco Technical',
      },
      inspected_at: '2026-11-26T08:15:00.000000Z',
      inspection_notes: 'Counted 50 shirts against PO-2026-0001 (ordered 100); 40 pass QA, 10 rejected for print defect.',
    },
    snapshot: {
      target: { purpose: 'po_supplier_dr', record_id: rm1Id },
      material_version: 1,
      sha256: sampleEvidence.attachments[0]!.sha256,
    },
    evidence_acknowledgment: {
      acknowledgment_id: '97500000-0000-4000-8000-000000000001',
      matched_by: PREVIEW_ACTOR.user_id,
      matched_at: '2026-11-26T08:30:00.000000Z',
      recipient_id: null,
      acknowledged_at: '2026-11-26T08:30:00.000000Z',
      snapshot: {
        target: { purpose: 'po_supplier_dr', record_id: rm1Id },
        material_version: 1,
        sha256: sampleEvidence.attachments[0]!.sha256,
      },
      bytes: sampleEvidence,
    },
    posted_by: PREVIEW_ACTOR,
    posted_at: '2026-11-26T08:40:00.000000Z',
    posting_stock_version: 15,
    canceled_by: null,
    canceled_at: null,
    cancel_reason: null,
    lines: [
      {
        id: rm1Line1,
        source_line_id: po1Line1,
        variant_id: shirtVariant,
        unit_id: unitPcs,
        quantity_scale: 0,
        delivered_quantity: '50',
        accepted_quantity: '40',
        damaged_quantity: '0',
        rejected_quantity: '10',
        unit_valuation_php: '240.00',
        accepted_value_php: '9600.00',
        restrictions: da1.lines[0]!.restrictions,
        discrepancy_notes: '10 shirts rejected for misaligned chapter emblem print.',
        resolves_discrepancy_id: null,
      },
    ],
    created_at: ts,
    updated_at: ts,
  };

  const rm2: ReceivingReport = {
    ...rm1,
    id: rm2Id,
    rm_reference: null,
    status: 'draft',
    version: 1,
    supplier_dr_reference: 'DR-SUP-2026-904',
    supplier_dr_date: '2026-11-27',
    accepted_total_value_php: '14400.00',
    inspection: null,
    snapshot: null,
    evidence_acknowledgment: null,
    posted_by: null,
    posted_at: null,
    posting_stock_version: null,
    lines: [
      {
        ...rm1.lines[0]!,
        id: '97000000-0000-4000-8000-000000000021',
        delivered_quantity: '60',
        accepted_quantity: '60',
        damaged_quantity: '0',
        rejected_quantity: '0',
        accepted_value_php: '14400.00',
        discrepancy_notes: null,
        resolves_discrepancy_id: disc1Id,
      },
    ],
  };

  const disc1: ReceivingDiscrepancy = {
    id: disc1Id,
    chapter_id: chapterId,
    status: 'open',
    version: 1,
    material_version: 1,
    source_kind: 'po',
    source_id: po1Id,
    source_reference: 'PO-2026-0001',
    source_line_id: po1Line1,
    rm_id: rm1Id,
    rm_reference: 'RM-2026-0002',
    rm_line_id: rm1Line1,
    variant_id: shirtVariant,
    unit_id: unitPcs,
    quantity_scale: 0,
    damaged_quantity: '0',
    rejected_quantity: '10',
    total_discrepant_quantity: '10',
    quarantined_lot_id: null,
    rejected_lot_id: '97600000-0000-4000-8000-000000000099',
    quarantined_lots_auto_cleared_on_source_close: false,
    discrepancy_notes: '10 shirts rejected for misaligned chapter emblem print.',
    supplier_notification: null,
    review_started_by: null,
    review_started_at: null,
    review_notes: null,
    resolution: null,
    created_at: ts,
    updated_at: ts,
  };

  const hold1: ReceivingHold = {
    id: hold1Id,
    chapter_id: chapterId,
    status: 'held',
    version: 1,
    material_version: 1,
    arrived_at: '2026-11-26T09:10:00.000000Z',
    holding_location_id: holdLoc,
    carrier_or_sender_name: 'FastBox Logistics',
    sender_kind: 'carrier',
    delivery_document_reference: 'WAYBILL-44901',
    hold_reason: 'Boxes arrived at Gate 2 without attached PO or Donor reference.',
    usable_stock_posted: false,
    ipc_creation_prohibited: true,
    items: [
      {
        id: '97200000-0000-4000-8000-000000000011',
        variant_id: shirtVariant,
        unit_id: unitPcs,
        item_description: '1 sealed carton labeled Medium Shirts',
        arrived_quantity: '25',
        condition_notes: 'Exterior carton intact, awaiting PO/DA verification.',
      },
    ],
    intake_evidence: sampleEvidence,
    recorded_by: PREVIEW_ACTOR,
    linked_source: null,
    rejection_return: null,
    created_at: ts,
    updated_at: ts,
  };

  return {
    chapterId,
    needs: [
      {
        chapter_id: chapterId,
        item_id: '95000000-0000-4000-8000-000000000050',
        item_code: 'SHIRT',
        variant_id: shirtVariant,
        variant_code: 'SHIRT-M',
        display_name: 'Chapter Shirt / Medium',
        unit_id: unitPcs,
        unit_code: 'PCS',
        quantity_scale: 0,
        approved_rop: '20',
        rop_policy: POLICY_REF,
        approved_target_level: '50',
        target_level_policy: POLICY_REF,
        usable_stockroom_on_hand: '18',
        eligible_usable_stockroom_on_hand: '18',
        active_rf_reservations: '8',
        eligible_available_to_allocate: '10',
        total_unreserved_approved_rf_demand: '25',
        unreserved_approved_rf_shortage: '15',
        open_repf_quantity: '0',
        open_po_inbound_quantity: '10',
        total_open_inbound_coverage: '10',
        excluded_inbound_quantity: '5',
        low_stock_breach: true,
        gross_rf_shortage_need: '15',
        gross_rop_replenishment_need: '50',
        gross_combined_need: '65',
        uncovered_rf_shortage_quantity: '5',
        uncovered_rop_replenishment_quantity: '50',
        proposed_uncovered_quantity: '55',
        contributing_rf_lines: [
          {
            rf_id: '91000000-0000-4000-8000-000000000001',
            rf_reference: 'RF-2026-0001',
            rf_line_id: '91000000-0000-4000-8000-000000000011',
            rf_material_version: 2,
            requesting_unit_id: '62000000-0000-4000-8000-000000000001',
            needed_at: '2026-12-03T08:00:00.000000Z',
            approved_quantity: '45',
            issued_quantity: '20',
            canceled_quantity: '0',
            active_reserved_quantity: '8',
            unreserved_outstanding_quantity: '17',
          },
        ],
        inbound_sources: [
          {
            source_kind: 'po',
            source_id: po1Id,
            source_reference: 'PO-2026-0001',
            status: 'partially_received',
            open_quantity: '10',
            coverage_state: 'counted',
            exclusion_reason: null,
          },
          {
            source_kind: 'po',
            source_id: po3Id,
            source_reference: 'PO-2026-0002',
            status: 'issued',
            open_quantity: '5',
            coverage_state: 'disputed',
            exclusion_reason: 'Linked RF canceled or disputed receipt excluded under INV-12.',
          },
        ],
        setup_blockers: [],
        observed_at: ts,
      },
      {
        chapter_id: chapterId,
        item_id: '95000000-0000-4000-8000-000000000060',
        item_code: 'BOTTLE',
        variant_id: bottleVariant,
        variant_code: 'BOTTLE-500',
        display_name: 'Reusable Bottle / 500ml',
        unit_id: unitPcs,
        unit_code: 'PCS',
        quantity_scale: 0,
        approved_rop: '20',
        rop_policy: POLICY_REF,
        approved_target_level: '50',
        target_level_policy: POLICY_REF,
        usable_stockroom_on_hand: '15',
        eligible_usable_stockroom_on_hand: '15',
        active_rf_reservations: '0',
        eligible_available_to_allocate: '15',
        total_unreserved_approved_rf_demand: '0',
        unreserved_approved_rf_shortage: '0',
        open_repf_quantity: '0',
        open_po_inbound_quantity: '0',
        total_open_inbound_coverage: '0',
        excluded_inbound_quantity: '0',
        low_stock_breach: true,
        gross_rf_shortage_need: '0',
        gross_rop_replenishment_need: '35',
        gross_combined_need: '35',
        uncovered_rf_shortage_quantity: '0',
        uncovered_rop_replenishment_quantity: '35',
        proposed_uncovered_quantity: '35',
        contributing_rf_lines: [],
        inbound_sources: [],
        setup_blockers: [],
        observed_at: ts,
      },
    ],
    repfs: [repf1, repf2, repf3],
    repfHistory: {
      [repf1Id]: [
        {
          id: newActionKey(),
          version: 1,
          material_version: 1,
          action: 'created',
          from_status: null,
          to_status: 'draft',
          actor: PREVIEW_ACTOR,
          reason: null,
          repf_reference: null,
          occurred_at: ts,
        },
        {
          id: newActionKey(),
          version: 2,
          material_version: 1,
          action: 'submitted',
          from_status: 'draft',
          to_status: 'pending_budget_review',
          actor: PREVIEW_ACTOR,
          reason: null,
          repf_reference: 'REPF-2026-0001',
          occurred_at: ts,
        },
        {
          id: newActionKey(),
          version: 3,
          material_version: 1,
          action: 'budget_approved',
          from_status: 'pending_budget_review',
          to_status: 'approved',
          actor: PREVIEW_REVIEWER,
          reason: 'Verified combined shortage + ROP top-up.',
          repf_reference: 'REPF-2026-0001',
          occurred_at: ts,
        },
      ],
    },
    repfVersions: { [repf1Id]: { 3: repf1 } },
    quotations: { [repf1Id]: [q1, q2] },
    selections: { [repf1Id]: sel1 },
    purchaseOrders: [po1, po2, po3],
    poHistory: {
      [po1Id]: [
        {
          id: newActionKey(),
          version: 1,
          material_version: 1,
          action: 'created',
          from_status: null,
          to_status: 'draft',
          actor: PREVIEW_ACTOR,
          reason: null,
          po_reference: null,
          amendment_id: null,
          occurred_at: ts,
        },
        {
          id: newActionKey(),
          version: 6,
          material_version: 2,
          action: 'approved',
          from_status: 'pending_approval',
          to_status: 'issued',
          actor: PREVIEW_REVIEWER,
          reason: 'Approved under two-quote tier.',
          po_reference: 'PO-2026-0001',
          amendment_id: null,
          occurred_at: ts,
        },
      ],
    },
    poVersions: { [po1Id]: { 7: po1 } },
    donations: [da1, da2],
    daHistory: {
      [da1Id]: [
        {
          version: 1,
          material_version: 1,
          status: 'draft',
          action: 'created',
          actor_id: PREVIEW_ACTOR.user_id,
          committed_at: ts,
          reason: null,
          restriction_resolution: null,
        },
        {
          version: 3,
          material_version: 1,
          status: 'acknowledged',
          action: 'acknowledged',
          actor_id: PREVIEW_REVIEWER.user_id,
          committed_at: ts,
          reason: null,
          restriction_resolution: null,
        },
      ],
    },
    daVersions: { [da1Id]: { 3: da1 } },
    receivingReports: [rm1, rm2],
    rmHistory: {
      [rm1Id]: [
        {
          id: newActionKey(),
          version: 4,
          material_version: 1,
          action: 'posted',
          from_status: 'evidence_matched',
          to_status: 'posted',
          actor: PREVIEW_ACTOR,
          reason: null,
          rm_reference: 'RM-2026-0002',
          evidence_binding_invalidated: false,
          occurred_at: ts,
        },
      ],
    },
    rmVersions: { [rm1Id]: { 4: rm1 } },
    movements: {
      [rm1Id]: [
        {
          id: '97800000-0000-4000-8000-000000000001',
          chapter_id: chapterId,
          kind: 'accepted_receipt',
          source_kind: 'po_rm',
          rm_id: rm1Id,
          rm_reference: 'RM-2026-0002',
          rm_material_version: 1,
          rm_line_id: rm1Line1,
          source_id: po1Id,
          source_reference: 'PO-2026-0001',
          source_material_version: 2,
          source_line_id: po1Line1,
          lot_id: '97600000-0000-4000-8000-000000000001',
          variant_id: shirtVariant,
          unit_id: unitPcs,
          location_id: mainLoc,
          quantity: '40',
          unit_valuation_php: '240.00',
          total_value_php: '9600.00',
          currency: 'PHP',
          condition: 'usable',
          restrictions: da1.lines[0]!.restrictions,
          immediately_allocatable: true,
          posted_by: PREVIEW_ACTOR.user_id,
          posted_at: ts,
        },
        {
          id: '97800000-0000-4000-8000-000000000002',
          chapter_id: chapterId,
          kind: 'rejected_receipt',
          source_kind: 'po_rm',
          rm_id: rm1Id,
          rm_reference: 'RM-2026-0002',
          rm_material_version: 1,
          rm_line_id: rm1Line1,
          source_id: po1Id,
          source_reference: 'PO-2026-0001',
          source_material_version: 2,
          source_line_id: po1Line1,
          lot_id: '97600000-0000-4000-8000-000000000099',
          variant_id: shirtVariant,
          unit_id: unitPcs,
          location_id: mainLoc,
          quantity: '10',
          unit_valuation_php: '240.00',
          total_value_php: '2400.00',
          currency: 'PHP',
          condition: 'rejected',
          restrictions: da1.lines[0]!.restrictions,
          immediately_allocatable: false,
          posted_by: PREVIEW_ACTOR.user_id,
          posted_at: ts,
        },
      ],
    },
    discrepancies: [disc1],
    holds: [hold1],
    holdHistory: {
      [hold1Id]: [
        {
          id: newActionKey(),
          version: 1,
          material_version: 1,
          action: 'held',
          from_status: null,
          to_status: 'held',
          actor: PREVIEW_ACTOR,
          reason: hold1.hold_reason,
          linked_source_reference: null,
          occurred_at: ts,
        },
      ],
    },
    procOps: [],
    donationOps: [],
    receivingOps: [],
    counters: { repf: 4, po: 3, da: 3, rm: 3, lot: 100, disc: 2, hold: 2 },
  };
}

function getState(chapterId: string): ChapterPreviewState {
  let state = previewChapters.get(chapterId);
  if (!state) {
    state = createSeedState(chapterId);
    previewChapters.set(chapterId, state);
  }
  return state;
}

function conflictError(code: string, message: string, details?: Record<string, unknown>): never {
  throw new ContractApiError(409, code, message, {
    extra: details as never,
  });
}

function validationError(code: string, message: string): never {
  throw new ContractApiError(422, code, message);
}

function emitPreviewNotice(
  chapterId: string,
  eventName: Stage1EventNotice['event_name'],
  resourceKind: string,
  resourceId: string,
  resourceVersion: number,
  materialVersion: number,
): void {
  if (!noticeEmitter) {
    return;
  }
  noticeEmitter({
    event_name: eventName,
    event_id: newActionKey(),
    committed_at: nowIso(),
    chapter_id: chapterId,
    resource_kind: resourceKind,
    resource_id: resourceId,
    resource_version: resourceVersion,
    material_version: materialVersion,
  });
}

function emptyPage() {
  return { next_cursor: null, snapshot_version: 1 };
}

function filterByQuery<T>(items: T[], matcher: (item: T) => boolean): T[] {
  return items.filter(matcher);
}

async function handlePreviewJson<T>(request: Stage2PreviewRequest): Promise<T | null> {
  if (!previewEnabled) {
    return null;
  }
  const url = new URL(request.path, 'http://localhost');
  const match = url.pathname.match(/^\/api\/v1\/chapters\/([^/]+)(\/.*)$/);
  if (!match) {
    return null;
  }
  const chapterId = decodeURIComponent(match[1]!);
  const subPath = match[2]!;
  const state = getState(chapterId);
  const method = request.method;
  const body = (request.body ?? {}) as Record<string, unknown>;
  const actionKey = request.actionKey ?? newActionKey();

  /* --- 1. Replenishment Needs --- */
  if (method === 'GET' && subPath === '/replenishment/needs') {
    const triggerFilter = url.searchParams.get('trigger_filter');
    const variantFilter = url.searchParams.get('variant_id');
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const filtered = filterByQuery(state.needs, (n) => {
      if (variantFilter && n.variant_id !== variantFilter) return false;
      if (triggerFilter === 'rf_shortage' && num(n.uncovered_rf_shortage_quantity) <= 0) return false;
      if (triggerFilter === 'rop_breach' && !n.low_stock_breach) return false;
      if (triggerFilter === 'uncovered_only' && num(n.proposed_uncovered_quantity) <= 0) return false;
      if (q && !`${n.item_code} ${n.variant_code} ${n.display_name}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return { data: filtered, page: { next_cursor: null, snapshot_version: 14 } } as T;
  }

  /* --- 2. RepFs --- */
  if (subPath === '/repfs' && method === 'GET') {
    const st = url.searchParams.get('status');
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const list = state.repfs.filter((r) => {
      if (st && r.status !== st) return false;
      if (
        q &&
        !`${r.repf_reference ?? ''} ${r.justification} ${r.lines.map((l) => l.variant_code).join(' ')}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
    return { data: list, page: emptyPage() } as T;
  }

  if (subPath === '/repfs' && method === 'POST') {
    const id = newActionKey();
    const inputLines = (body.lines as Array<Record<string, unknown>>) ?? [];
    const lines = inputLines.map((l, idx) => {
      const variantId = String(l.variant_id ?? '');
      const need = state.needs.find((n) => n.variant_id === variantId) ?? state.needs[0]!;
      const qty = String(l.requested_quantity ?? '1');
      const cost = String(l.estimated_unit_cost_php ?? '100.00');
      return {
        id: newActionKey(),
        line_number: idx + 1,
        trigger_kind: (l.trigger_kind as Repf['lines'][0]['trigger_kind']) ?? 'rop_replenishment',
        item_id: need.item_id,
        item_code: need.item_code,
        variant_id: variantId || need.variant_id,
        variant_code: need.variant_code,
        display_name: need.display_name,
        unit_id: String(l.unit_id ?? need.unit_id),
        unit_code: need.unit_code,
        quantity_scale: need.quantity_scale,
        rf_id: (l.rf_id as string | null) ?? null,
        rf_reference: l.rf_id ? 'RF-2026-0001' : null,
        rf_line_id: (l.rf_line_id as string | null) ?? null,
        rf_material_version: l.rf_id ? 2 : null,
        linked_demand_canceled: false,
        linked_demand_canceled_at: null,
        requested_quantity: qty,
        ordered_quantity: '0',
        canceled_quantity: '0',
        remaining_to_order_quantity: qty,
        estimated_unit_cost_php: toFixedMoney(num(cost)),
        estimated_line_total_php: toFixedMoney(num(qty) * num(cost)),
        needed_by: (l.needed_by as string | null) ?? null,
        net_need_breakdown: {
          snapshot_version: 14,
          observed_at: nowIso(),
          approved_rop: need.approved_rop,
          approved_target_level: need.approved_target_level,
          usable_stockroom_on_hand: need.usable_stockroom_on_hand,
          eligible_usable_stockroom_on_hand: need.eligible_usable_stockroom_on_hand,
          active_rf_reservations: need.active_rf_reservations,
          eligible_available_to_allocate: need.eligible_available_to_allocate,
          unreserved_approved_rf_shortage: need.unreserved_approved_rf_shortage,
          open_repf_quantity: need.open_repf_quantity,
          open_po_inbound_quantity: need.open_po_inbound_quantity,
          total_open_inbound_coverage: need.total_open_inbound_coverage,
          excluded_inbound_quantity: need.excluded_inbound_quantity,
          gross_rf_shortage_need: need.gross_rf_shortage_need,
          gross_rop_replenishment_need: need.gross_rop_replenishment_need,
          gross_combined_need: need.gross_combined_need,
          uncovered_rf_shortage_quantity: need.uncovered_rf_shortage_quantity,
          uncovered_rop_replenishment_quantity: need.uncovered_rop_replenishment_quantity,
          variant_proposed_uncovered_quantity: need.proposed_uncovered_quantity,
          uncovered_need: need.proposed_uncovered_quantity,
          exceeds_uncovered_need: num(qty) > num(need.proposed_uncovered_quantity),
        },
        additional_purchase_reason: (l.additional_purchase_reason as Repf['lines'][0]['additional_purchase_reason']) ?? null,
        notes: (l.notes as string | null) ?? null,
      };
    });
    const total = lines.reduce((acc, l) => acc + num(l.estimated_line_total_php), 0);
    const created: Repf = {
      id,
      chapter_id: chapterId,
      repf_reference: null,
      status: 'draft',
      version: 1,
      material_version: 1,
      funding_source: 'chapter_funds',
      urgency: (body.urgency as Repf['urgency']) ?? 'normal',
      trigger_kinds: Array.from(new Set(lines.map((l) => l.trigger_kind))),
      justification: String(body.justification ?? 'Replenishment request'),
      estimated_total_php: toFixedMoney(total),
      approved_budget_php: null,
      has_additional_purchase_override: lines.some((l) => l.additional_purchase_reason !== null),
      linked_demand_canceled: false,
      preparer: PREVIEW_ACTOR,
      submitted_by: null,
      submitted_at: null,
      budget_reviewer: null,
      budget_reviewed_at: null,
      budget_decision: null,
      budget_decision_reason: null,
      canceled_by: null,
      canceled_at: null,
      cancel_reason: null,
      lines,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.repfs = [created, ...state.repfs];
    state.repfHistory[id] = [
      {
        id: newActionKey(),
        version: 1,
        material_version: 1,
        action: 'created',
        from_status: null,
        to_status: 'draft',
        actor: PREVIEW_ACTOR,
        reason: null,
        repf_reference: null,
        occurred_at: created.created_at,
      },
    ];
    state.repfVersions[id] = { 1: created };
    state.quotations[id] = [];
    const receipt: ProcurementOperationReceipt<Repf> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'createRepf',
      action_key: actionKey,
      resource_kind: 'repf',
      resource_id: id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: nowIso(),
      outcome: 'committed',
      result: created,
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.repf.changed.v1', 'repf', id, 1, 1);
    return { data: receipt } as T;
  }

  let m = subPath.match(/^\/repfs\/([^/]+)$/);
  if (m && method === 'GET') {
    const found = state.repfs.find((r) => r.id === m![1]);
    if (!found) conflictError('not_found', 'RepF not found.');
    return { data: found } as T;
  }
  if (m && method === 'PUT') {
    const idx = state.repfs.findIndex((r) => r.id === m![1]);
    if (idx < 0) conflictError('not_found', 'RepF not found.');
    const cur = state.repfs[idx]!;
    if (cur.version !== body.expected_version) {
      conflictError('version_conflict', 'RepF version is stale; refresh before saving.');
    }
    const inputLines = (body.lines as Array<Record<string, unknown>>) ?? [];
    const lines = inputLines.map((l, i) => {
      const qty = String(l.requested_quantity ?? '1');
      const cost = String(l.estimated_unit_cost_php ?? '100.00');
      const existingLine = cur.lines[i] ?? cur.lines[0]!;
      return {
        ...existingLine,
        id: newActionKey(),
        line_number: i + 1,
        trigger_kind: (l.trigger_kind as Repf['lines'][0]['trigger_kind']) ?? existingLine.trigger_kind,
        variant_id: String(l.variant_id ?? existingLine.variant_id),
        unit_id: String(l.unit_id ?? existingLine.unit_id),
        requested_quantity: qty,
        remaining_to_order_quantity: qty,
        estimated_unit_cost_php: toFixedMoney(num(cost)),
        estimated_line_total_php: toFixedMoney(num(qty) * num(cost)),
        additional_purchase_reason:
          (l.additional_purchase_reason as Repf['lines'][0]['additional_purchase_reason']) ?? null,
        notes: (l.notes as string | null) ?? null,
      };
    });
    const updated: Repf = {
      ...cur,
      version: cur.version + 1,
      material_version: cur.material_version + 1,
      urgency: (body.urgency as Repf['urgency']) ?? cur.urgency,
      justification: String(body.justification ?? cur.justification),
      estimated_total_php: toFixedMoney(
        lines.reduce((s, l) => s + num(l.estimated_line_total_php), 0),
      ),
      has_additional_purchase_override: lines.some((l) => l.additional_purchase_reason !== null),
      lines,
      updated_at: nowIso(),
    };
    state.repfs[idx] = updated;
    state.repfVersions[cur.id] = { ...(state.repfVersions[cur.id] ?? {}), [updated.version]: updated };
    state.repfHistory[cur.id] = [
      ...(state.repfHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: 'replaced',
        from_status: cur.status,
        to_status: updated.status,
        actor: PREVIEW_ACTOR,
        reason: null,
        repf_reference: updated.repf_reference,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ProcurementOperationReceipt<Repf> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'replaceRepf',
      action_key: actionKey,
      resource_kind: 'repf',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.repf.changed.v1', 'repf', updated.id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/repfs\/([^/]+)\/(submit|budget-review|resume-review|revise|cancel)$/);
  if (m && method === 'POST') {
    const [, id, op] = m;
    const idx = state.repfs.findIndex((r) => r.id === id);
    if (idx < 0) conflictError('not_found', 'RepF not found.');
    const cur = state.repfs[idx]!;
    if (cur.version !== body.expected_version) {
      conflictError('version_conflict', 'RepF version changed; reload before continuing.');
    }
    let nextStatus = cur.status;
    let repfRef = cur.repf_reference;
    let opName: ProcurementOperationReceipt['operation_name'] = 'submitRepf';
    let budgetDecision = cur.budget_decision;
    let budgetReason = cur.budget_decision_reason;
    let approvedBudget = cur.approved_budget_php;
    if (op === 'submit') {
      opName = 'submitRepf';
      const blockingLine = cur.lines.find(
        (l) => l.net_need_breakdown.exceeds_uncovered_need && !l.additional_purchase_reason,
      );
      if (blockingLine) {
        conflictError(
          'duplicate_supply_coverage',
          'Requested quantity exceeds net uncovered need; provide an additional purchase reason on the exceeding line.',
          { line_id: blockingLine.id, variant_id: blockingLine.variant_id },
        );
      }
      nextStatus = 'pending_budget_review';
      if (!repfRef) {
        repfRef = `REPF-2026-${String(state.counters.repf++).padStart(4, '0')}`;
      }
    } else if (op === 'budget-review') {
      opName = 'reviewRepfBudget';
      const dec = body.decision as Repf['budget_decision'];
      budgetDecision = dec;
      budgetReason = (body.reason as string | null) ?? null;
      if (dec === 'approve') {
        nextStatus = 'approved';
        approvedBudget = cur.estimated_total_php;
      } else if (dec === 'hold') nextStatus = 'held';
      else if (dec === 'return') nextStatus = 'returned_for_revision';
      else nextStatus = 'rejected';
    } else if (op === 'resume-review') {
      opName = 'resumeRepfReview';
      nextStatus = 'pending_budget_review';
    } else if (op === 'revise') {
      opName = 'reviseRepf';
      nextStatus = 'draft';
    } else if (op === 'cancel') {
      opName = 'cancelRepf';
      nextStatus = 'canceled';
    }
    const updated: Repf = {
      ...cur,
      repf_reference: repfRef,
      status: nextStatus,
      version: cur.version + 1,
      material_version: op === 'revise' ? cur.material_version + 1 : cur.material_version,
      submitted_by: op === 'submit' ? PREVIEW_ACTOR : cur.submitted_by,
      submitted_at: op === 'submit' ? nowIso() : cur.submitted_at,
      budget_reviewer: op === 'budget-review' ? PREVIEW_REVIEWER : cur.budget_reviewer,
      budget_reviewed_at: op === 'budget-review' ? nowIso() : cur.budget_reviewed_at,
      budget_decision: budgetDecision,
      budget_decision_reason: budgetReason,
      approved_budget_php: approvedBudget,
      canceled_by: op === 'cancel' ? PREVIEW_ACTOR : cur.canceled_by,
      canceled_at: op === 'cancel' ? nowIso() : cur.canceled_at,
      cancel_reason: op === 'cancel' ? String(body.reason ?? '') : cur.cancel_reason,
      updated_at: nowIso(),
    };
    state.repfs[idx] = updated;
    state.repfVersions[cur.id] = { ...(state.repfVersions[cur.id] ?? {}), [updated.version]: updated };
    state.repfHistory[cur.id] = [
      ...(state.repfHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: op ?? 'updated',
        from_status: cur.status,
        to_status: updated.status,
        actor: PREVIEW_ACTOR,
        reason: (body.reason as string | null) ?? null,
        repf_reference: updated.repf_reference,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ProcurementOperationReceipt<Repf> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: opName,
      action_key: actionKey,
      resource_kind: 'repf',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.repf.changed.v1', 'repf', updated.id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/repfs\/([^/]+)\/history$/);
  if (m && method === 'GET') {
    return { data: state.repfHistory[m[1]!] ?? [], page: emptyPage() } as T;
  }
  m = subPath.match(/^\/repfs\/([^/]+)\/versions\/(\d+)$/);
  if (m && method === 'GET') {
    const snap = state.repfVersions[m[1]!]?.[Number(m[2])] ?? state.repfs.find((r) => r.id === m![1]);
    return { data: snap } as T;
  }
  m = subPath.match(/^\/repfs\/([^/]+)\/related$/);
  if (m && method === 'GET') {
    const repfId = m[1]!;
    const rel: RepfRelatedRecord[] = [];
    for (const q of state.quotations[repfId] ?? []) {
      rel.push({
        kind: 'quotation',
        id: q.id,
        repf_line_id: q.lines[0]?.repf_line_id ?? null,
        reference: q.supplier.supplier_reference ?? q.supplier.supplier_name,
        material_version: q.material_version,
        state: q.is_selected ? 'selected' : 'recorded',
        linked_demand_canceled: false,
      });
    }
    for (const po of state.purchaseOrders.filter((p) => p.repf_id === repfId)) {
      rel.push({
        kind: 'purchase_order',
        id: po.id,
        repf_line_id: po.lines[0]?.repf_line_id ?? null,
        reference: po.po_reference,
        material_version: po.material_version,
        state: po.status,
        linked_demand_canceled: po.linked_demand_canceled,
      });
    }
    return { data: rel, page: emptyPage() } as T;
  }

  /* --- 3. Quotations & Supplier Selection --- */
  m = subPath.match(/^\/repfs\/([^/]+)\/quotations$/);
  if (m && method === 'GET') {
    const quotes = state.quotations[m[1]!] ?? [];
    const sel = state.selections[m[1]!] ?? null;
    return {
      data: quotes,
      page: emptyPage(),
      selection: sel,
    } as T;
  }
  if (m && method === 'POST') {
    const repfId = m[1]!;
    const qLines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l) => {
      const qty = String(l.quoted_quantity ?? '1');
      const price = String(l.unit_price_php ?? '100.00');
      return {
        id: newActionKey(),
        repf_line_id: String(l.repf_line_id ?? ''),
        variant_id: String(l.variant_id ?? ''),
        unit_id: String(l.unit_id ?? ''),
        quantity_scale: 0,
        quoted_quantity: qty,
        unit_price_php: toFixedMoney(num(price)),
        line_total_php: toFixedMoney(num(qty) * num(price)),
        notes: (l.notes as string | null) ?? null,
      };
    });
    const total = qLines.reduce((s, l) => s + num(l.line_total_php), 0);
    const created: RepfQuotation = {
      id: newActionKey(),
      chapter_id: chapterId,
      repf_id: repfId,
      version: 1,
      material_version: 1,
      supplier: body.supplier as RepfQuotation['supplier'],
      quoted_at: String(body.quoted_at ?? nowIso()),
      valid_until: (body.valid_until as string | null) ?? null,
      lead_time_days: Number(body.lead_time_days ?? 3),
      availability_summary: String(body.availability_summary ?? ''),
      quality_warranty_terms: String(body.quality_warranty_terms ?? ''),
      payment_and_delivery_terms: String(body.payment_and_delivery_terms ?? ''),
      reliability_notes: (body.reliability_notes as string | null) ?? null,
      currency: 'PHP',
      total_amount_php: toFixedMoney(total),
      is_selected: false,
      selected_at: null,
      evidence_binding: (body.evidence as RepfQuotation['evidence_binding']) ?? null,
      recorded_by: PREVIEW_ACTOR,
      lines: qLines,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.quotations[repfId] = [created, ...(state.quotations[repfId] ?? [])];
    const receipt: ProcurementOperationReceipt<RepfQuotation> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'createRepfQuotation',
      action_key: actionKey,
      resource_kind: 'quotation',
      resource_id: created.id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: created.created_at,
      outcome: 'committed',
      result: created,
    };
    state.procOps.unshift(receipt);
    const parentRepf = state.repfs.find((r) => r.id === repfId);
    if (parentRepf) {
      emitPreviewNotice(
        chapterId,
        'stage2.repf.changed.v1',
        'repf',
        repfId,
        parentRepf.version,
        parentRepf.material_version,
      );
    }
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/repfs\/([^/]+)\/quotations\/([^/]+)$/);
  if (m && method === 'PUT') {
    const [, repfId, qId] = m;
    const list = state.quotations[repfId!] ?? [];
    const idx = list.findIndex((q) => q.id === qId);
    if (idx < 0) conflictError('not_found', 'Quotation not found.');
    const cur = list[idx]!;
    if (cur.is_selected) {
      conflictError('quotation_already_selected', 'Selected quotation cannot be replaced.');
    }
    if (cur.version !== body.expected_version) {
      conflictError('version_conflict', 'Quotation version is stale.');
    }
    const qLines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l, i) => {
      const base = cur.lines[i] ?? cur.lines[0]!;
      const qty = String(l.quoted_quantity ?? base.quoted_quantity);
      const price = String(l.unit_price_php ?? base.unit_price_php);
      return {
        ...base,
        repf_line_id: String(l.repf_line_id ?? base.repf_line_id),
        variant_id: String(l.variant_id ?? base.variant_id),
        unit_id: String(l.unit_id ?? base.unit_id),
        quoted_quantity: qty,
        unit_price_php: toFixedMoney(num(price)),
        line_total_php: toFixedMoney(num(qty) * num(price)),
        notes: (l.notes as string | null) ?? null,
      };
    });
    const updated: RepfQuotation = {
      ...cur,
      version: cur.version + 1,
      material_version: cur.material_version + 1,
      supplier: (body.supplier as RepfQuotation['supplier']) ?? cur.supplier,
      quoted_at: String(body.quoted_at ?? cur.quoted_at),
      valid_until: (body.valid_until as string | null) ?? null,
      lead_time_days: Number(body.lead_time_days ?? cur.lead_time_days),
      availability_summary: String(body.availability_summary ?? cur.availability_summary),
      quality_warranty_terms: String(body.quality_warranty_terms ?? cur.quality_warranty_terms),
      payment_and_delivery_terms: String(body.payment_and_delivery_terms ?? cur.payment_and_delivery_terms),
      reliability_notes: (body.reliability_notes as string | null) ?? null,
      evidence_binding: (body.evidence as RepfQuotation['evidence_binding']) ?? cur.evidence_binding,
      total_amount_php: toFixedMoney(qLines.reduce((s, l) => s + num(l.line_total_php), 0)),
      lines: qLines,
      updated_at: nowIso(),
    };
    list[idx] = updated;
    state.quotations[repfId!] = [...list];
    const receipt: ProcurementOperationReceipt<RepfQuotation> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'replaceRepfQuotation',
      action_key: actionKey,
      resource_kind: 'quotation',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    state.procOps.unshift(receipt);
    const parentRepf = state.repfs.find((r) => r.id === repfId);
    if (parentRepf) {
      emitPreviewNotice(
        chapterId,
        'stage2.repf.changed.v1',
        'repf',
        repfId!,
        parentRepf.version,
        parentRepf.material_version,
      );
    }
    return { data: receipt } as T;
  }
  if (m && method === 'DELETE') {
    const [, repfId, qId] = m;
    const list = state.quotations[repfId!] ?? [];
    const target = list.find((q) => q.id === qId);
    if (!target) conflictError('not_found', 'Quotation not found.');
    if (target.is_selected) {
      conflictError('quotation_already_selected', 'Selected quotation cannot be deleted.');
    }
    state.quotations[repfId!] = list.filter((q) => q.id !== qId);
    const receipt: ProcurementOperationReceipt = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'deleteRepfQuotation',
      action_key: actionKey,
      resource_kind: 'quotation',
      resource_id: qId!,
      committed_version: target.version,
      committed_material_version: target.material_version,
      status_code: 200,
      committed_at: nowIso(),
      outcome: 'committed',
      result: {
        id: qId!,
        chapter_id: chapterId,
        repf_id: repfId!,
        deleted: true,
        deleted_by: PREVIEW_ACTOR,
        deleted_at: nowIso(),
        previous_version: target.version,
        previous_material_version: target.material_version,
      },
    };
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/repfs\/([^/]+)\/supplier-selection$/);
  if (m && method === 'POST') {
    const repfId = m[1]!;
    const quotes = state.quotations[repfId] ?? [];
    const selectedId = String(body.selected_quotation_id ?? '');
    const selected = quotes.find((q) => q.id === selectedId);
    if (!selected) validationError('not_found', 'Selected quotation not found.');
    const comparableIds = (body.comparable_quotation_ids as string[]) ?? [selectedId];
    const waiver = body.emergency_waiver as { reason: string } | null;
    const minRequired = num(selected.total_amount_php) > 5000 ? 2 : 1;
    if (comparableIds.length < minRequired && !waiver?.reason) {
      conflictError(
        'quotation_policy_unmet',
        `Selected total (PHP ${selected.total_amount_php}) requires at least ${minRequired} comparable quotes unless an emergency waiver reason is provided.`,
      );
    }
    state.quotations[repfId] = quotes.map((q) => ({
      ...q,
      is_selected: q.id === selectedId,
      selected_at: q.id === selectedId ? nowIso() : null,
    }));
    const selection: SupplierSelection = {
      id: newActionKey(),
      chapter_id: chapterId,
      repf_id: repfId,
      version: 1,
      material_version: 1,
      selected_quotation_id: selectedId,
      comparable_quotation_ids: comparableIds,
      comparable_quote_count: comparableIds.length,
      policy_evaluation: {
        policy_id: POLICY_REF.policy_id,
        policy_version: 2,
        evaluated_amount_php: selected.total_amount_php,
        applicable_tier_min_php: '5000.01',
        applicable_tier_max_php: '50000.00',
        required_minimum_quotes: minRequired,
        comparable_quote_count: comparableIds.length,
        waiver_permitted: true,
        minimum_quotes_when_waived: 1,
        emergency_waiver_used: Boolean(waiver),
        approving_duties_for_waiver: ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
      },
      emergency_waiver_used: Boolean(waiver),
      emergency_waiver_reason: waiver?.reason ?? null,
      selection_rationale: String(body.selection_rationale ?? ''),
      selected_by: PREVIEW_ACTOR,
      selected_at: nowIso(),
    };
    state.selections[repfId] = selection;
    const receipt: ProcurementOperationReceipt<SupplierSelection> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'recordSupplierSelection',
      action_key: actionKey,
      resource_kind: 'supplier_selection',
      resource_id: selection.id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: selection.selected_at,
      outcome: 'committed',
      result: selection,
    };
    return { data: receipt } as T;
  }

  /* --- 4. Purchase Orders --- */
  if (subPath === '/purchase-orders' && method === 'GET') {
    const st = url.searchParams.get('status');
    const repfFilter = url.searchParams.get('repf_id');
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const list = state.purchaseOrders.filter((p) => {
      if (st && p.status !== st) return false;
      if (repfFilter && p.repf_id !== repfFilter) return false;
      if (q && !`${p.po_reference ?? ''} ${p.supplier.supplier_name}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return { data: list, page: emptyPage() } as T;
  }

  if (subPath === '/purchase-orders' && method === 'POST') {
    const repfId = String(body.repf_id ?? '');
    const repf = state.repfs.find((r) => r.id === repfId);
    const sel = state.selections[repfId];
    const quotes = state.quotations[repfId] ?? [];
    const selectedQuote = quotes.find((q) => q.id === sel?.selected_quotation_id) ?? quotes[0];
    if (!repf || !sel || !selectedQuote) {
      validationError('selection_required', 'Record a supplier selection on an approved RepF first.');
    }
    const id = newActionKey();
    const lines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l) => {
      const qty = String(l.ordered_quantity ?? '1');
      const price = String(l.unit_price_php ?? '100.00');
      return {
        id: newActionKey(),
        repf_line_id: String(l.repf_line_id ?? ''),
        quotation_line_id: String(l.quotation_line_id ?? ''),
        variant_id: String(l.variant_id ?? ''),
        unit_id: String(l.unit_id ?? ''),
        quantity_scale: 0,
        ordered_quantity: qty,
        accepted_quantity: '0',
        rejected_or_disputed_quantity: '0',
        closed_short_quantity: '0',
        canceled_quantity: '0',
        outstanding_quantity: qty,
        unit_price_php: toFixedMoney(num(price)),
        line_total_php: toFixedMoney(num(qty) * num(price)),
        specifications: String(l.specifications ?? ''),
        linked_demand_canceled: false,
        linked_demand_canceled_at: null,
        notes: (l.notes as string | null) ?? null,
      };
    });
    const created: PurchaseOrder = {
      id,
      chapter_id: chapterId,
      po_reference: null,
      status: 'draft',
      version: 1,
      material_version: 1,
      repf_id: repfId,
      repf_reference: repf.repf_reference ?? 'DRAFT-REPF',
      originating_repf_preparer: repf.preparer,
      supplier_selection_id: sel.id,
      selected_quotation_id: selectedQuote.id,
      emergency_waiver_used: sel.emergency_waiver_used,
      supplier: selectedQuote.supplier,
      delivery_location: String(body.delivery_location ?? ''),
      expected_delivery_date: String(body.expected_delivery_date ?? '2026-12-10'),
      payment_and_delivery_terms: String(body.payment_and_delivery_terms ?? ''),
      currency: 'PHP',
      total_amount_php: toFixedMoney(lines.reduce((s, l) => s + num(l.line_total_php), 0)),
      linked_demand_canceled: false,
      preparer: PREVIEW_ACTOR,
      submitted_by: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
      issued_at: null,
      review_decision_reason: null,
      acknowledgment: null,
      pending_amendment: null,
      approved_amendment_count: 0,
      closed_short_by: null,
      closed_short_at: null,
      close_short_reason: null,
      canceled_by: null,
      canceled_at: null,
      cancel_reason: null,
      lines,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.purchaseOrders = [created, ...state.purchaseOrders];
    state.poHistory[id] = [
      {
        id: newActionKey(),
        version: 1,
        material_version: 1,
        action: 'created',
        from_status: null,
        to_status: 'draft',
        actor: PREVIEW_ACTOR,
        reason: null,
        po_reference: null,
        amendment_id: null,
        occurred_at: created.created_at,
      },
    ];
    state.poVersions[id] = { 1: created };
    const receipt: ProcurementOperationReceipt<PurchaseOrder> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'createPurchaseOrder',
      action_key: actionKey,
      resource_kind: 'purchase_order',
      resource_id: id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: created.created_at,
      outcome: 'committed',
      result: created,
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.purchase-order.changed.v1', 'purchase_order', id, 1, 1);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/purchase-orders\/([^/]+)$/);
  if (m && method === 'GET') {
    return { data: state.purchaseOrders.find((p) => p.id === m![1]) } as T;
  }
  if (m && method === 'PUT') {
    const idx = state.purchaseOrders.findIndex((p) => p.id === m![1]);
    if (idx < 0) conflictError('not_found', 'Purchase Order not found.');
    const cur = state.purchaseOrders[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'PO version conflict.');
    const lines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l, i) => {
      const base = cur.lines[i] ?? cur.lines[0]!;
      const qty = String(l.ordered_quantity ?? base.ordered_quantity);
      const price = String(l.unit_price_php ?? base.unit_price_php);
      return {
        ...base,
        ordered_quantity: qty,
        outstanding_quantity: qty,
        unit_price_php: toFixedMoney(num(price)),
        line_total_php: toFixedMoney(num(qty) * num(price)),
        specifications: String(l.specifications ?? base.specifications),
        notes: (l.notes as string | null) ?? null,
      };
    });
    const updated: PurchaseOrder = {
      ...cur,
      version: cur.version + 1,
      material_version: cur.material_version + 1,
      delivery_location: String(body.delivery_location ?? cur.delivery_location),
      expected_delivery_date: String(body.expected_delivery_date ?? cur.expected_delivery_date),
      payment_and_delivery_terms: String(body.payment_and_delivery_terms ?? cur.payment_and_delivery_terms),
      total_amount_php: toFixedMoney(lines.reduce((s, l) => s + num(l.line_total_php), 0)),
      lines,
      updated_at: nowIso(),
    };
    state.purchaseOrders[idx] = updated;
    const receipt: ProcurementOperationReceipt<PurchaseOrder> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'replacePurchaseOrder',
      action_key: actionKey,
      resource_kind: 'purchase_order',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/purchase-orders\/([^/]+)\/(submit|approve|return|reject|acknowledgment|close-short|cancel)$/);
  if (m && method === 'POST') {
    const [, poId, op] = m;
    const idx = state.purchaseOrders.findIndex((p) => p.id === poId);
    if (idx < 0) conflictError('not_found', 'PO not found.');
    const cur = state.purchaseOrders[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'PO version is stale.');
    let status = cur.status;
    let poRef = cur.po_reference;
    let ack = cur.acknowledgment;
    if (op === 'submit') status = 'pending_approval';
    else if (op === 'approve') {
      status = 'issued';
      if (!poRef) poRef = `PO-2026-${String(state.counters.po++).padStart(4, '0')}`;
    } else if (op === 'return') status = 'returned_for_revision';
    else if (op === 'reject') status = 'rejected';
    else if (op === 'acknowledgment') {
      ack = {
        supplier_confirmation_reference: (body.supplier_confirmation_reference as string | null) ?? null,
        acknowledged_at: String(body.acknowledged_at ?? nowIso()),
        revised_expected_delivery_date: (body.revised_expected_delivery_date as string | null) ?? null,
        notes: (body.notes as string | null) ?? null,
        evidence_binding: (body.evidence as PurchaseOrder['acknowledgment'] extends infer A
          ? A extends { evidence_binding: infer E }
            ? E
            : never
          : never) ?? null,
        recorded_by: PREVIEW_ACTOR,
        recorded_at: nowIso(),
      };
    } else if (op === 'close-short') {
      status = 'closed_short';
    } else if (op === 'cancel') {
      const acceptedTotal = cur.lines.reduce((s, l) => s + num(l.accepted_quantity), 0);
      if (acceptedTotal > 0) {
        conflictError('po_has_accepted_receipts', 'Use Close Short because accepted receipts already exist on this PO.');
      }
      status = 'canceled';
    }
    const updated: PurchaseOrder = {
      ...cur,
      status,
      po_reference: poRef,
      version: cur.version + 1,
      acknowledgment: ack,
      approved_by: op === 'approve' ? PREVIEW_REVIEWER : cur.approved_by,
      approved_at: op === 'approve' ? nowIso() : cur.approved_at,
      issued_at: op === 'approve' ? nowIso() : cur.issued_at,
      close_short_reason: op === 'close-short' ? String(body.reason ?? '') : cur.close_short_reason,
      cancel_reason: op === 'cancel' ? String(body.reason ?? '') : cur.cancel_reason,
      updated_at: nowIso(),
    };
    state.purchaseOrders[idx] = updated;
    state.poVersions[cur.id] = { ...(state.poVersions[cur.id] ?? {}), [updated.version]: updated };
    state.poHistory[cur.id] = [
      ...(state.poHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: op ?? 'updated',
        from_status: cur.status,
        to_status: updated.status,
        actor: PREVIEW_ACTOR,
        reason: (body.reason as string | null) ?? null,
        po_reference: updated.po_reference,
        amendment_id: null,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ProcurementOperationReceipt<PurchaseOrder> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'approvePurchaseOrder',
      action_key: actionKey,
      resource_kind: 'purchase_order',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    emitPreviewNotice(chapterId, 'stage2.purchase-order.changed.v1', 'purchase_order', updated.id, updated.version, updated.material_version);
    state.procOps.unshift(receipt);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/purchase-orders\/([^/]+)\/amendments$/);
  if (m && method === 'POST') {
    const idx = state.purchaseOrders.findIndex((p) => p.id === m![1]);
    if (idx < 0) conflictError('not_found', 'PO not found.');
    const cur = state.purchaseOrders[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'PO version is stale.');
    const inputLines = (body.lines as Array<Record<string, unknown>>) ?? [];
    for (const l of inputLines) {
      const existing = cur.lines.find((pl) => pl.id === l.po_line_id);
      if (existing && num(String(l.ordered_quantity ?? '0')) < num(existing.accepted_quantity)) {
        conflictError(
          'po_has_accepted_receipts',
          `Amended quantity cannot be below accepted quantity (${existing.accepted_quantity}).`,
        );
      }
    }
    const proposedTotal = toFixedMoney(
      inputLines.reduce(
        (s, l) => s + num(String(l.ordered_quantity ?? '0')) * num(String(l.unit_price_php ?? '0')),
        0,
      ),
    );
    const amendment = {
      id: newActionKey(),
      chapter_id: chapterId,
      po_id: cur.id,
      amendment_number: cur.approved_amendment_count + 1,
      status: 'pending_approval' as const,
      base_material_version: cur.material_version,
      applied_material_version: null,
      delivery_location: String(body.delivery_location ?? cur.delivery_location),
      expected_delivery_date: String(body.expected_delivery_date ?? cur.expected_delivery_date),
      payment_and_delivery_terms: String(
        body.payment_and_delivery_terms ?? cur.payment_and_delivery_terms,
      ),
      proposed_total_php: proposedTotal,
      reason: String(body.reason ?? ''),
      lines: inputLines as unknown as NonNullable<PurchaseOrder['pending_amendment']>['lines'],
      proposed_by: PREVIEW_ACTOR,
      proposed_at: nowIso(),
      approved_by: null,
      approved_at: null,
    };
    const updated: PurchaseOrder = {
      ...cur,
      version: cur.version + 1,
      pending_amendment: amendment,
      updated_at: nowIso(),
    };
    state.purchaseOrders[idx] = updated;
    const receipt: ProcurementOperationReceipt = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'proposePurchaseOrderAmendment',
      action_key: actionKey,
      resource_kind: 'purchase_order',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: { purchase_order: updated, amendment },
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.purchase-order.changed.v1', 'purchase_order', updated.id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/purchase-orders\/([^/]+)\/amendments\/([^/]+)\/approve$/);
  if (m && method === 'POST') {
    const [, poId, amendmentId] = m;
    const idx = state.purchaseOrders.findIndex((p) => p.id === poId);
    if (idx < 0) conflictError('not_found', 'PO not found.');
    const cur = state.purchaseOrders[idx]!;
    if (!cur.pending_amendment || cur.pending_amendment.id !== amendmentId) {
      conflictError('not_found', 'Pending amendment not found.');
    }
    const amend = cur.pending_amendment;
    const nextMaterial = cur.material_version + 1;
    const nextLines = amend.lines.map((l, i) => {
      const existing = cur.lines.find((pl) => pl.id === l.po_line_id) ?? cur.lines[i] ?? cur.lines[0]!;
      const ordered = String(l.ordered_quantity);
      const outstanding = Math.max(0, num(ordered) - num(existing.accepted_quantity) - num(existing.closed_short_quantity));
      return {
        ...existing,
        ordered_quantity: ordered,
        outstanding_quantity: String(outstanding),
        unit_price_php: toFixedMoney(num(l.unit_price_php)),
        line_total_php: toFixedMoney(num(ordered) * num(l.unit_price_php)),
        specifications: l.specifications,
        notes: l.notes,
      };
    });
    const approvedAmendment = {
      ...amend,
      status: 'approved' as const,
      applied_material_version: nextMaterial,
      approved_by: PREVIEW_REVIEWER,
      approved_at: nowIso(),
    };
    const updated: PurchaseOrder = {
      ...cur,
      version: cur.version + 1,
      material_version: nextMaterial,
      delivery_location: amend.delivery_location,
      expected_delivery_date: amend.expected_delivery_date,
      payment_and_delivery_terms: amend.payment_and_delivery_terms,
      total_amount_php: amend.proposed_total_php,
      pending_amendment: null,
      approved_amendment_count: cur.approved_amendment_count + 1,
      lines: nextLines,
      updated_at: nowIso(),
    };
    state.purchaseOrders[idx] = updated;
    const receipt: ProcurementOperationReceipt = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_REVIEWER.user_id,
      operation_name: 'approvePurchaseOrderAmendment',
      action_key: actionKey,
      resource_kind: 'purchase_order',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: { purchase_order: updated, amendment: approvedAmendment },
    };
    state.procOps.unshift(receipt);
    emitPreviewNotice(chapterId, 'stage2.purchase-order.changed.v1', 'purchase_order', updated.id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/purchase-orders\/([^/]+)\/history$/);
  if (m && method === 'GET') return { data: state.poHistory[m[1]!] ?? [], page: emptyPage() } as T;
  m = subPath.match(/^\/purchase-orders\/([^/]+)\/versions\/(\d+)$/);
  if (m && method === 'GET') {
    return { data: state.poVersions[m[1]!]?.[Number(m[2])] ?? state.purchaseOrders.find((p) => p.id === m![1]) } as T;
  }
  m = subPath.match(/^\/purchase-orders\/([^/]+)\/related$/);
  if (m && method === 'GET') {
    const po = state.purchaseOrders.find((p) => p.id === m![1]);
    const rel: PurchaseOrderRelatedRecord[] = [];
    if (po) {
      rel.push({
        kind: 'repf',
        id: po.repf_id,
        po_line_id: null,
        reference: po.repf_reference,
        material_version: 1,
        state: 'approved',
        linked_demand_canceled: po.linked_demand_canceled,
      });
      for (const rm of state.receivingReports.filter((r) => r.source_kind === 'po' && r.source_id === po.id)) {
        rel.push({
          kind: 'receiving_report',
          id: rm.id,
          po_line_id: rm.lines[0]?.source_line_id ?? null,
          reference: rm.rm_reference,
          material_version: rm.material_version,
          state: rm.status,
          linked_demand_canceled: false,
        });
      }
    }
    return { data: rel, page: emptyPage() } as T;
  }

  /* --- 5. Donations & Restriction Resolutions --- */
  if (subPath === '/donations' && method === 'GET') {
    const st = url.searchParams.get('status');
    const list = state.donations.filter((d) => (!st ? true : d.status === st));
    return { data: list, page: emptyPage() } as T;
  }
  if (subPath === '/donations' && method === 'POST') {
    const id = newActionKey();
    const lines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l) => {
      const qty = String(l.pledged_quantity ?? '1');
      const val = String(l.unit_value_php ?? '0.00');
      return {
        line_id: newActionKey(),
        variant_id: String(l.variant_id ?? ''),
        unit_id: String(l.unit_id ?? ''),
        quantity_scale: 0,
        pledged_quantity: qty,
        received_quantity: '0',
        outstanding_quantity: qty,
        condition_notes: String(l.condition_notes ?? ''),
        valuation_kind: (l.valuation_kind as 'declared' | 'estimated') ?? 'declared',
        unit_value_php: toFixedMoney(num(val)),
        pledged_value_php: toFixedMoney(num(qty) * num(val)),
        valuation_basis: String(l.valuation_basis ?? ''),
        restrictions: l.restrictions as Donation['lines'][0]['restrictions'],
      };
    });
    const created: Donation = {
      da_id: id,
      chapter_id: chapterId,
      version: 1,
      material_version: 1,
      status: 'draft',
      reference: null,
      prepared_by: PREVIEW_ACTOR.user_id,
      donor_name: String(body.donor_name ?? ''),
      lines,
      valuation_policy: POLICY_REF,
      pledged_total_value_php: toFixedMoney(lines.reduce((s, l) => s + num(l.pledged_value_php), 0)),
      acknowledgment: null,
      updated_at: nowIso(),
    };
    state.donations = [created, ...state.donations];
    state.daHistory[id] = [
      {
        version: 1,
        material_version: 1,
        status: 'draft',
        action: 'created',
        actor_id: PREVIEW_ACTOR.user_id,
        committed_at: created.updated_at,
        reason: null,
        restriction_resolution: null,
      },
    ];
    state.daVersions[id] = { 1: created };
    const receipt: DonationOperationReceipt = {
      operation_id: newActionKey(),
      operation_name: 'createDonation',
      action_key: actionKey,
      actor_id: PREVIEW_ACTOR.user_id,
      chapter_id: chapterId,
      committed_at: created.updated_at,
      http_status: 201,
      result: created,
      restriction_resolution: null,
    };
    state.donationOps.unshift(receipt);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/donations\/([^/]+)$/);
  if (m && method === 'GET') return { data: state.donations.find((d) => d.da_id === m![1]) } as T;
  if (m && method === 'PUT') {
    const idx = state.donations.findIndex((d) => d.da_id === m![1]);
    if (idx < 0) conflictError('not_found', 'DA not found.');
    const cur = state.donations[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'DA version is stale.');
    const lines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l, i) => {
      const base = cur.lines[i] ?? cur.lines[0]!;
      const qty = String(l.pledged_quantity ?? base.pledged_quantity);
      const val = String(l.unit_value_php ?? base.unit_value_php);
      return {
        ...base,
        pledged_quantity: qty,
        outstanding_quantity: qty,
        unit_value_php: toFixedMoney(num(val)),
        pledged_value_php: toFixedMoney(num(qty) * num(val)),
        condition_notes: String(l.condition_notes ?? base.condition_notes),
        valuation_basis: String(l.valuation_basis ?? base.valuation_basis),
        restrictions: (l.restrictions as Donation['lines'][0]['restrictions']) ?? base.restrictions,
      };
    });
    const updated: Donation = {
      ...cur,
      version: cur.version + 1,
      material_version: cur.material_version + 1,
      donor_name: String(body.donor_name ?? cur.donor_name),
      lines,
      pledged_total_value_php: toFixedMoney(lines.reduce((s, l) => s + num(l.pledged_value_php), 0)),
      updated_at: nowIso(),
    };
    state.donations[idx] = updated;
    const receipt: DonationOperationReceipt = {
      operation_id: newActionKey(),
      operation_name: 'replaceDonation',
      action_key: actionKey,
      actor_id: PREVIEW_ACTOR.user_id,
      chapter_id: chapterId,
      committed_at: updated.updated_at,
      http_status: 200,
      result: updated,
      restriction_resolution: null,
    };
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/donations\/([^/]+)\/(submit|acknowledge|return|decline|revise|close-short|cancel|restriction-resolutions)$/);
  if (m && method === 'POST') {
    const [, daId, op] = m;
    const idx = state.donations.findIndex((d) => d.da_id === daId);
    if (idx < 0) conflictError('not_found', 'DA not found.');
    const cur = state.donations[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'DA version is stale.');
    let status = cur.status;
    let ref = cur.reference;
    let ack = cur.acknowledgment;
    let resObj: DonationOperationReceipt['restriction_resolution'] = null;
    let lines = cur.lines;
    if (op === 'submit') status = 'pending_acknowledgment';
    else if (op === 'acknowledge') {
      status = 'acknowledged';
      if (!ref) ref = `DA-2026-${String(state.counters.da++).padStart(4, '0')}`;
      const ev = body.evidence as Donation['acknowledgment'] extends infer A
        ? A extends { binding: infer B }
          ? B
          : never
        : never;
      ack = {
        actor_id: PREVIEW_REVIEWER.user_id,
        signed_at: String(body.signed_at ?? nowIso()),
        committed_at: nowIso(),
        binding: ev,
        snapshot: {
          target: { purpose: 'da_acknowledgment', record_id: cur.da_id },
          material_version: cur.material_version,
          sha256: ev.attachments[0]?.sha256 ?? 'a'.repeat(64),
        },
      };
    } else if (op === 'return') status = 'returned_for_revision';
    else if (op === 'decline') status = 'declined';
    else if (op === 'revise') status = 'draft';
    else if (op === 'close-short') status = 'closed_short';
    else if (op === 'cancel') status = 'canceled';
    else if (op === 'restriction-resolutions') {
      const targetLineId = String(body.da_line_id ?? '');
      const kind = body.resolution_kind as 'apply' | 'audit_review';
      const newRestrictions = body.restrictions as Donation['lines'][0]['restrictions'];
      if (kind === 'audit_review' && newRestrictions.state !== 'uninterpreted') {
        validationError('audit_unblock_forbidden', 'Audit-only review must keep restriction state as uninterpreted.');
      }
      const ev = body.evidence as NonNullable<DonationOperationReceipt['restriction_resolution']>['binding'];
      const resolutionId = newActionKey();
      const targetLine = cur.lines.find((l) => l.line_id === targetLineId) ?? cur.lines[0]!;
      resObj = {
        resolution_id: resolutionId,
        da_line_id: targetLine.line_id,
        reason: String(body.reason ?? ''),
        resolution_kind: kind,
        restrictions: {
          ...newRestrictions,
          interpretation_id: kind === 'apply' ? resolutionId : null,
        },
        previous_restrictions: targetLine.restrictions,
        actor_id: PREVIEW_REVIEWER.user_id,
        signed_at: String(body.signed_at ?? nowIso()),
        committed_at: nowIso(),
        binding: ev,
        snapshot: {
          target: { purpose: 'donor_restriction_resolution', record_id: cur.da_id },
          material_version: cur.material_version,
          sha256: ev.attachments[0]?.sha256 ?? 'a'.repeat(64),
        },
      };
      lines = cur.lines.map((l) =>
        l.line_id === targetLine.line_id
          ? { ...l, restrictions: resObj!.restrictions }
          : l,
      );
    }
    const updated: Donation = {
      ...cur,
      version: cur.version + 1,
      status,
      reference: ref,
      acknowledgment: ack,
      lines,
      updated_at: nowIso(),
    };
    state.donations[idx] = updated;
    state.daVersions[cur.da_id] = { ...(state.daVersions[cur.da_id] ?? {}), [updated.version]: updated };
    state.daHistory[cur.da_id] = [
      ...(state.daHistory[cur.da_id] ?? []),
      {
        version: updated.version,
        material_version: updated.material_version,
        status: updated.status,
        action: op ?? 'updated',
        actor_id: PREVIEW_ACTOR.user_id,
        committed_at: updated.updated_at,
        reason: (body.reason as string | null) ?? null,
        restriction_resolution: resObj,
      },
    ];
    const receipt: DonationOperationReceipt = {
      operation_id: newActionKey(),
      operation_name: op === 'restriction-resolutions' ? 'resolveDonationRestriction' : 'submitDonation',
      action_key: actionKey,
      actor_id: PREVIEW_ACTOR.user_id,
      chapter_id: chapterId,
      committed_at: updated.updated_at,
      http_status: op === 'restriction-resolutions' ? 201 : 200,
      result: updated,
      restriction_resolution: resObj,
    };
    emitPreviewNotice(chapterId, 'stage2.donation.changed.v1', 'donation', updated.da_id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/donations\/([^/]+)\/history$/);
  if (m && method === 'GET') return { data: state.daHistory[m[1]!] ?? [], page: emptyPage() } as T;
  m = subPath.match(/^\/donations\/([^/]+)\/versions\/(\d+)$/);
  if (m && method === 'GET') {
    return { data: state.daVersions[m[1]!]?.[Number(m[2])] ?? state.donations.find((d) => d.da_id === m![1]) } as T;
  }
  m = subPath.match(/^\/donations\/([^/]+)\/related$/);
  if (m && method === 'GET') {
    const rel: DonationRelatedEntry[] = state.receivingReports
      .filter((r) => r.source_kind === 'da' && r.source_id === m![1])
      .map((r) => ({ resource_kind: 'receiving_report', resource_id: r.id, da_line_id: r.lines[0]?.source_line_id ?? null }));
    return { data: rel, page: emptyPage() } as T;
  }

  /* --- 6. Receiving Reports, Discrepancies, Holds --- */
  if (subPath === '/receiving-reports' && method === 'GET') {
    const st = url.searchParams.get('status');
    const kind = url.searchParams.get('source_kind');
    const list = state.receivingReports.filter((r) => {
      if (st && r.status !== st) return false;
      if (kind && r.source_kind !== kind) return false;
      return true;
    });
    return { data: list, page: emptyPage() } as T;
  }
  if (subPath === '/receiving-reports' && method === 'POST') {
    const srcKind = body.source_kind as 'po' | 'da';
    const srcId = String(body.source_id ?? '');
    if (srcKind === 'po' && !String(body.supplier_dr_reference ?? '').trim()) {
      validationError('missing_dr', 'Supplier DR reference is required when receiving against a Purchase Order.');
    }
    const id = newActionKey();
    const lines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l) => {
      const acc = String(l.accepted_quantity ?? '0');
      const val = String(l.unit_valuation_php ?? '0.00');
      return {
        id: newActionKey(),
        source_line_id: String(l.source_line_id ?? ''),
        variant_id: String(l.variant_id ?? ''),
        unit_id: String(l.unit_id ?? ''),
        quantity_scale: 0,
        delivered_quantity: String(l.delivered_quantity ?? '0'),
        accepted_quantity: acc,
        damaged_quantity: String(l.damaged_quantity ?? '0'),
        rejected_quantity: String(l.rejected_quantity ?? '0'),
        unit_valuation_php: toFixedMoney(num(val)),
        accepted_value_php: toFixedMoney(num(acc) * num(val)),
        restrictions: state.donations[0]!.lines[0]!.restrictions,
        discrepancy_notes: (l.discrepancy_notes as string | null) ?? null,
        resolves_discrepancy_id: (l.resolves_discrepancy_id as string | null) ?? null,
      };
    });
    const srcRef =
      srcKind === 'po'
        ? state.purchaseOrders.find((p) => p.id === srcId)?.po_reference ?? 'PO-2026-0001'
        : state.donations.find((d) => d.da_id === srcId)?.reference ?? 'DA-2026-0001';
    const created: ReceivingReport = {
      id,
      chapter_id: chapterId,
      rm_reference: null,
      source_kind: srcKind,
      source_id: srcId,
      source_reference: srcRef,
      source_material_version: Number(body.source_material_version ?? 1),
      originating_hold_id: (body.originating_hold_id as string | null) ?? null,
      supplier_dr_reference: (body.supplier_dr_reference as string | null) ?? null,
      supplier_dr_date: (body.supplier_dr_date as string | null) ?? null,
      status: 'draft',
      version: 1,
      material_version: 1,
      location_id: String(body.location_id ?? ''),
      currency: 'PHP',
      accepted_total_value_php: toFixedMoney(lines.reduce((s, l) => s + num(l.accepted_value_php), 0)),
      preparer: PREVIEW_ACTOR,
      inspection: null,
      snapshot: null,
      evidence_acknowledgment: null,
      posted_by: null,
      posted_at: null,
      posting_stock_version: null,
      canceled_by: null,
      canceled_at: null,
      cancel_reason: null,
      lines,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.receivingReports = [created, ...state.receivingReports];
    state.rmVersions[id] = { 1: created };
    state.rmHistory[id] = [
      {
        id: newActionKey(),
        version: 1,
        material_version: 1,
        action: 'created',
        from_status: null,
        to_status: 'draft',
        actor: PREVIEW_ACTOR,
        reason: null,
        rm_reference: null,
        evidence_binding_invalidated: false,
        occurred_at: created.created_at,
      },
    ];
    const receipt: ReceivingOperationReceipt<ReceivingReport> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'createReceivingReport',
      action_key: actionKey,
      resource_kind: 'receiving_report',
      resource_id: id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: created.created_at,
      outcome: 'committed',
      result: created,
    };
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/receiving-reports\/([^/]+)$/);
  if (m && method === 'GET') return { data: state.receivingReports.find((r) => r.id === m![1]) } as T;
  if (m && method === 'PUT') {
    const idx = state.receivingReports.findIndex((r) => r.id === m![1]);
    if (idx < 0) conflictError('not_found', 'Receiving Report not found.');
    const cur = state.receivingReports[idx]!;
    if (cur.status === 'posted') {
      conflictError('immutable_posted_rm', 'Posted Receiving Reports are immutable.');
    }
    const invalidated = cur.status === 'evidence_matched' || cur.status === 'inspected';
    const updated: ReceivingReport = {
      ...cur,
      version: cur.version + 1,
      material_version: cur.material_version + 1,
      status: 'draft',
      snapshot: null,
      evidence_acknowledgment: null,
      supplier_dr_reference: (body.supplier_dr_reference as string | null) ?? cur.supplier_dr_reference,
      supplier_dr_date: (body.supplier_dr_date as string | null) ?? cur.supplier_dr_date,
      location_id: String(body.location_id ?? cur.location_id),
      updated_at: nowIso(),
    };
    state.receivingReports[idx] = updated;
    state.rmHistory[cur.id] = [
      ...(state.rmHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: 'replaced',
        from_status: cur.status,
        to_status: 'draft',
        actor: PREVIEW_ACTOR,
        reason: null,
        rm_reference: updated.rm_reference,
        evidence_binding_invalidated: invalidated,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ReceivingOperationReceipt<ReceivingReport> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'replaceReceivingReport',
      action_key: actionKey,
      resource_kind: 'receiving_report',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/receiving-reports\/([^/]+)\/(inspection|evidence-match|post|cancel)$/);
  if (m && method === 'POST') {
    const [, rmId, op] = m;
    const idx = state.receivingReports.findIndex((r) => r.id === rmId);
    if (idx < 0) conflictError('not_found', 'Receiving Report not found.');
    const cur = state.receivingReports[idx]!;
    if (cur.version !== body.expected_version) conflictError('version_conflict', 'RM version changed.');
    let updated: ReceivingReport = { ...cur };
    if (op === 'inspection') {
      const nextLines = ((body.lines as Array<Record<string, unknown>>) ?? []).map((l, i) => {
        const base = cur.lines[i] ?? cur.lines[0]!;
        const d = num(String(l.delivered_quantity ?? base.delivered_quantity));
        const a = num(String(l.accepted_quantity ?? base.accepted_quantity));
        const dm = num(String(l.damaged_quantity ?? base.damaged_quantity));
        const r = num(String(l.rejected_quantity ?? base.rejected_quantity));
        if (Math.abs(d - (a + dm + r)) > 0.0001) {
          validationError('qty_mismatch', 'Delivered quantity must equal Accepted + Damaged + Rejected.');
        }
        return {
          ...base,
          delivered_quantity: String(d),
          accepted_quantity: String(a),
          damaged_quantity: String(dm),
          rejected_quantity: String(r),
          accepted_value_php: toFixedMoney(a * num(base.unit_valuation_php)),
          discrepancy_notes: (l.discrepancy_notes as string | null) ?? null,
        };
      });
      updated = {
        ...cur,
        status: 'inspected',
        version: cur.version + 1,
        lines: nextLines,
        accepted_total_value_php: toFixedMoney(nextLines.reduce((s, l) => s + num(l.accepted_value_php), 0)),
        inspection: {
          inspector: PREVIEW_ACTOR,
          technical_or_requesting_representative: body.technical_or_requesting_representative_id
            ? {
                user_id: String(body.technical_or_requesting_representative_id),
                display_name: 'Selected Representative',
              }
            : null,
          inspected_at: String(body.inspected_at ?? nowIso()),
          inspection_notes: String(body.inspection_notes ?? ''),
        },
        snapshot: {
          target: {
            purpose: cur.source_kind === 'po' ? 'po_supplier_dr' : 'da_receipt',
            record_id: cur.id,
          },
          material_version: cur.material_version,
          sha256: 'c'.repeat(64),
        },
        updated_at: nowIso(),
      };
    } else if (op === 'evidence-match') {
      const ev = body.evidence as ReceivingReport['evidence_acknowledgment'] extends infer A
        ? A extends { bytes: infer B }
          ? B
          : never
        : never;
      updated = {
        ...cur,
        status: 'evidence_matched',
        version: cur.version + 1,
        evidence_acknowledgment: {
          acknowledgment_id: newActionKey(),
          matched_by: PREVIEW_ACTOR.user_id,
          matched_at: nowIso(),
          recipient_id: null,
          acknowledged_at: String(body.acknowledged_at ?? nowIso()),
          snapshot: cur.snapshot ?? {
            target: { purpose: cur.source_kind === 'po' ? 'po_supplier_dr' : 'da_receipt', record_id: cur.id },
            material_version: cur.material_version,
            sha256: String(body.snapshot_sha256 ?? 'c'.repeat(64)),
          },
          bytes: ev,
        },
        updated_at: nowIso(),
      };
    } else if (op === 'post') {
      const rmRef = cur.rm_reference ?? `RM-2026-${String(state.counters.rm++).padStart(4, '0')}`;
      updated = {
        ...cur,
        status: 'posted',
        rm_reference: rmRef,
        version: cur.version + 1,
        posted_by: PREVIEW_ACTOR,
        posted_at: nowIso(),
        posting_stock_version: 16,
        updated_at: nowIso(),
      };
      if (cur.source_kind === 'po') {
        const pIdx = state.purchaseOrders.findIndex((p) => p.id === cur.source_id);
        if (pIdx >= 0) {
          const po = state.purchaseOrders[pIdx]!;
          const nextPoLines = po.lines.map((pl) => {
            const rmLine = cur.lines.find((rl) => rl.source_line_id === pl.id);
            if (!rmLine) return pl;
            const nextAccepted = num(pl.accepted_quantity) + num(rmLine.accepted_quantity);
            const nextRej =
              num(pl.rejected_or_disputed_quantity) +
              num(rmLine.damaged_quantity) +
              num(rmLine.rejected_quantity);
            const nextOutstanding = Math.max(0, num(pl.ordered_quantity) - nextAccepted);
            return {
              ...pl,
              accepted_quantity: String(nextAccepted),
              rejected_or_disputed_quantity: String(nextRej),
              outstanding_quantity: String(nextOutstanding),
            };
          });
          const allDone = nextPoLines.every((l) => num(l.outstanding_quantity) === 0);
          state.purchaseOrders[pIdx] = {
            ...po,
            version: po.version + 1,
            status: allDone ? 'receiving_complete' : 'partially_received',
            lines: nextPoLines,
            updated_at: nowIso(),
          };
        }
      }
      for (const rl of cur.lines) {
        const discQty = num(rl.damaged_quantity) + num(rl.rejected_quantity);
        if (discQty > 0) {
          state.discrepancies.unshift({
            id: newActionKey(),
            chapter_id: chapterId,
            status: 'open',
            version: 1,
            material_version: 1,
            source_kind: cur.source_kind,
            source_id: cur.source_id,
            source_reference: cur.source_reference,
            source_line_id: rl.source_line_id,
            rm_id: cur.id,
            rm_reference: rmRef,
            rm_line_id: rl.id,
            variant_id: rl.variant_id,
            unit_id: rl.unit_id,
            quantity_scale: 0,
            damaged_quantity: rl.damaged_quantity,
            rejected_quantity: rl.rejected_quantity,
            total_discrepant_quantity: String(discQty),
            quarantined_lot_id: num(rl.damaged_quantity) > 0 ? newActionKey() : null,
            rejected_lot_id: num(rl.rejected_quantity) > 0 ? newActionKey() : null,
            quarantined_lots_auto_cleared_on_source_close: false,
            discrepancy_notes: rl.discrepancy_notes ?? 'Damaged or rejected upon inspection.',
            supplier_notification: null,
            review_started_by: null,
            review_started_at: null,
            review_notes: null,
            resolution: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        }
      }
    } else if (op === 'cancel') {
      updated = {
        ...cur,
        status: 'canceled',
        version: cur.version + 1,
        canceled_by: PREVIEW_ACTOR,
        canceled_at: nowIso(),
        cancel_reason: String(body.reason ?? ''),
        updated_at: nowIso(),
      };
    }
    state.receivingReports[idx] = updated;
    state.rmVersions[cur.id] = { ...(state.rmVersions[cur.id] ?? {}), [updated.version]: updated };
    state.rmHistory[cur.id] = [
      ...(state.rmHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: op ?? 'updated',
        from_status: cur.status,
        to_status: updated.status,
        actor: PREVIEW_ACTOR,
        reason: (body.reason as string | null) ?? null,
        rm_reference: updated.rm_reference,
        evidence_binding_invalidated: false,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ReceivingOperationReceipt<ReceivingReport> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'postReceivingReport',
      action_key: actionKey,
      resource_kind: 'receiving_report',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    emitPreviewNotice(chapterId, 'stage2.receiving-report.changed.v1', 'receiving_report', updated.id, updated.version, updated.material_version);
    return { data: receipt } as T;
  }

  m = subPath.match(/^\/receiving-reports\/([^/]+)\/movements$/);
  if (m && method === 'GET') return { data: state.movements[m[1]!] ?? [], page: emptyPage() } as T;
  m = subPath.match(/^\/receiving-reports\/([^/]+)\/discrepancies$/);
  if (m && method === 'GET') {
    return { data: state.discrepancies.filter((d) => d.rm_id === m![1]), page: emptyPage() } as T;
  }
  m = subPath.match(/^\/receiving-reports\/([^/]+)\/history$/);
  if (m && method === 'GET') return { data: state.rmHistory[m[1]!] ?? [], page: emptyPage() } as T;
  m = subPath.match(/^\/receiving-reports\/([^/]+)\/versions\/(\d+)$/);
  if (m && method === 'GET') {
    return { data: state.rmVersions[m[1]!]?.[Number(m[2])] ?? state.receivingReports.find((r) => r.id === m![1]) } as T;
  }
  m = subPath.match(/^\/receiving-reports\/([^/]+)\/related$/);
  if (m && method === 'GET') {
    const rm = state.receivingReports.find((r) => r.id === m![1]);
    const rel: ReceivingReportRelatedRecord[] = [];
    if (rm) {
      rel.push({
        kind: rm.source_kind === 'po' ? 'purchase_order' : 'donation',
        id: rm.source_id,
        rm_line_id: null,
        reference: rm.source_reference,
        material_version: rm.source_material_version,
        state: 'linked',
      });
    }
    return { data: rel, page: emptyPage() } as T;
  }

  /* --- 7. Discrepancies --- */
  if (subPath === '/receiving-discrepancies' && method === 'GET') {
    const st = url.searchParams.get('status');
    return { data: state.discrepancies.filter((d) => (!st ? true : d.status === st)), page: emptyPage() } as T;
  }
  m = subPath.match(/^\/receiving-discrepancies\/([^/]+)$/);
  if (m && method === 'GET') return { data: state.discrepancies.find((d) => d.id === m![1]) } as T;
  m = subPath.match(/^\/receiving-discrepancies\/([^/]+)\/notify-supplier$/);
  if (m && method === 'POST') {
    const idx = state.discrepancies.findIndex((d) => d.id === m![1]);
    if (idx < 0) conflictError('not_found', 'Discrepancy not found.');
    const cur = state.discrepancies[idx]!;
    if (cur.source_kind === 'da') {
      conflictError('da_supplier_notify_blocked', 'Supplier notification is only valid for Purchase Order discrepancies.');
    }
    const updated: ReceivingDiscrepancy = {
      ...cur,
      status: 'supplier_notified',
      version: cur.version + 1,
      supplier_notification: {
        notified_by: PREVIEW_ACTOR,
        notified_at: nowIso(),
        supplier_contact_reference: String(body.supplier_contact_reference ?? ''),
        notification_notes: String(body.notification_notes ?? ''),
        expected_resolution_date: (body.expected_resolution_date as string | null) ?? null,
      },
      updated_at: nowIso(),
    };
    state.discrepancies[idx] = updated;
    const receipt: ReceivingOperationReceipt<ReceivingDiscrepancy> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'notifySupplierOfReceivingDiscrepancy',
      action_key: actionKey,
      resource_kind: 'receiving_discrepancy',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    return { data: receipt } as T;
  }
  m = subPath.match(/^\/receiving-discrepancies\/([^/]+)\/resolutions$/);
  if (m && method === 'POST') {
    const idx = state.discrepancies.findIndex((d) => d.id === m![1]);
    if (idx < 0) conflictError('not_found', 'Discrepancy not found.');
    const cur = state.discrepancies[idx]!;
    if (cur.status === 'resolved') conflictError('already_resolved', 'Discrepancy is already resolved.');
    const isStart = body.action === 'start_review';
    const ev = body.evidence as ReceivingDiscrepancy['resolution'] extends infer R
      ? R extends { evidence_acknowledgment: infer E }
        ? E extends { bytes: infer B }
          ? B
          : never
        : never
      : never;
    const updated: ReceivingDiscrepancy = isStart
      ? {
          ...cur,
          status: 'under_review',
          version: cur.version + 1,
          review_started_by: PREVIEW_ACTOR,
          review_started_at: nowIso(),
          review_notes: String(body.review_notes ?? ''),
          updated_at: nowIso(),
        }
      : {
          ...cur,
          status: 'resolved',
          version: cur.version + 1,
          resolution: {
            resolution_kind: body.resolution_kind as NonNullable<ReceivingDiscrepancy['resolution']>['resolution_kind'],
            resolved_by: PREVIEW_ACTOR,
            resolved_at: nowIso(),
            reason: String(body.reason ?? ''),
            replacement_rm_id: (body.replacement_rm_id as string | null) ?? null,
            replacement_rm_reference: body.replacement_rm_id ? 'RM-REPLACEMENT' : null,
            quarantined_lot_disposition: body.quarantined_lot_disposition as NonNullable<
              ReceivingDiscrepancy['resolution']
            >['quarantined_lot_disposition'],
            evidence_acknowledgment: {
              acknowledgment_id: newActionKey(),
              matched_by: PREVIEW_ACTOR.user_id,
              matched_at: nowIso(),
              recipient_id: null,
              acknowledged_at: String(body.signed_at ?? nowIso()),
              snapshot: {
                target: { purpose: 'receiving_discrepancy', record_id: cur.id },
                material_version: cur.material_version,
                sha256: ev?.attachments[0]?.sha256 ?? 'd'.repeat(64),
              },
              bytes: ev,
            },
          },
          updated_at: nowIso(),
        };
    state.discrepancies[idx] = updated;
    const receipt: ReceivingOperationReceipt<ReceivingDiscrepancy> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'resolveReceivingDiscrepancy',
      action_key: actionKey,
      resource_kind: 'receiving_discrepancy',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    return { data: receipt } as T;
  }

  /* --- 8. Holds --- */
  if (subPath === '/receiving-holds' && method === 'GET') {
    const st = url.searchParams.get('status');
    return { data: state.holds.filter((h) => (!st ? true : h.status === st)), page: emptyPage() } as T;
  }
  if (subPath === '/receiving-holds' && method === 'POST') {
    const id = newActionKey();
    const created: ReceivingHold = {
      id,
      chapter_id: chapterId,
      status: 'held',
      version: 1,
      material_version: 1,
      arrived_at: String(body.arrived_at ?? nowIso()),
      holding_location_id: String(body.holding_location_id ?? ''),
      carrier_or_sender_name: String(body.carrier_or_sender_name ?? ''),
      sender_kind: (body.sender_kind as ReceivingHold['sender_kind']) ?? 'carrier',
      delivery_document_reference: (body.delivery_document_reference as string | null) ?? null,
      hold_reason: String(body.hold_reason ?? ''),
      usable_stock_posted: false,
      ipc_creation_prohibited: true,
      items: ((body.items as Array<Record<string, unknown>>) ?? []).map((it) => ({
        id: newActionKey(),
        variant_id: (it.variant_id as string | null) ?? null,
        unit_id: (it.unit_id as string | null) ?? null,
        item_description: String(it.item_description ?? ''),
        arrived_quantity: String(it.arrived_quantity ?? '0'),
        condition_notes: String(it.condition_notes ?? ''),
      })),
      intake_evidence: (body.intake_evidence as ReceivingHold['intake_evidence']) ?? null,
      recorded_by: PREVIEW_ACTOR,
      linked_source: null,
      rejection_return: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.holds.unshift(created);
    state.holdHistory[id] = [
      {
        id: newActionKey(),
        version: 1,
        material_version: 1,
        action: 'held',
        from_status: null,
        to_status: 'held',
        actor: PREVIEW_ACTOR,
        reason: created.hold_reason,
        linked_source_reference: null,
        occurred_at: created.created_at,
      },
    ];
    const receipt: ReceivingOperationReceipt<ReceivingHold> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: 'createReceivingHold',
      action_key: actionKey,
      resource_kind: 'receiving_hold',
      resource_id: id,
      committed_version: 1,
      committed_material_version: 1,
      status_code: 201,
      committed_at: created.created_at,
      outcome: 'committed',
      result: created,
    };
    return { data: receipt } as T;
  }
  m = subPath.match(/^\/receiving-holds\/([^/]+)\/(link-source|reject-return)$/);
  if (m && method === 'POST') {
    const [, holdId, op] = m;
    const idx = state.holds.findIndex((h) => h.id === holdId);
    if (idx < 0) conflictError('not_found', 'Receiving hold not found.');
    const cur = state.holds[idx]!;
    if (cur.status !== 'held') conflictError('hold_already_resolved', 'Hold was already linked or returned.');
    let updated: ReceivingHold;
    if (op === 'link-source') {
      const srcRef = String(body.source_kind) === 'po' ? 'PO-2026-0001' : 'DA-2026-0001';
      updated = {
        ...cur,
        status: 'linked_to_source',
        version: cur.version + 1,
        linked_source: {
          source_kind: body.source_kind as 'po' | 'da',
          source_id: String(body.source_id ?? ''),
          source_reference: srcRef,
          supplier_dr_reference: (body.supplier_dr_reference as string | null) ?? null,
          supplier_dr_date: (body.supplier_dr_date as string | null) ?? null,
          linked_by: PREVIEW_ACTOR,
          linked_at: nowIso(),
          link_notes: String(body.link_notes ?? ''),
        },
        updated_at: nowIso(),
      };
    } else {
      const ev = body.evidence as NonNullable<ReceivingHold['intake_evidence']>;
      updated = {
        ...cur,
        status: 'rejected_returned',
        version: cur.version + 1,
        rejection_return: {
          rejected_by: PREVIEW_ACTOR,
          rejected_at: nowIso(),
          reason: String(body.reason ?? ''),
          recipient_or_carrier_name: String(body.recipient_or_carrier_name ?? ''),
          evidence_acknowledgment: {
            acknowledgment_id: newActionKey(),
            matched_by: PREVIEW_ACTOR.user_id,
            matched_at: nowIso(),
            recipient_id: null,
            acknowledged_at: String(body.signed_at ?? nowIso()),
            snapshot: {
              target: { purpose: 'missing_source_hold', record_id: cur.id },
              material_version: cur.material_version,
              sha256: ev.attachments[0]?.sha256 ?? 'e'.repeat(64),
            },
            bytes: ev,
          },
        },
        updated_at: nowIso(),
      };
    }
    state.holds[idx] = updated;
    state.holdHistory[cur.id] = [
      ...(state.holdHistory[cur.id] ?? []),
      {
        id: newActionKey(),
        version: updated.version,
        material_version: updated.material_version,
        action: op === 'link-source' ? 'linked_to_source' : 'rejected_returned',
        from_status: cur.status,
        to_status: updated.status,
        actor: PREVIEW_ACTOR,
        reason: updated.linked_source?.link_notes ?? updated.rejection_return?.reason ?? '',
        linked_source_reference: updated.linked_source?.source_reference ?? null,
        occurred_at: updated.updated_at,
      },
    ];
    const receipt: ReceivingOperationReceipt<ReceivingHold> = {
      operation_id: newActionKey(),
      chapter_id: chapterId,
      actor_id: PREVIEW_ACTOR.user_id,
      operation_name: op === 'link-source' ? 'linkReceivingHoldSource' : 'rejectReturnReceivingHold',
      action_key: actionKey,
      resource_kind: 'receiving_hold',
      resource_id: updated.id,
      committed_version: updated.version,
      committed_material_version: updated.material_version,
      status_code: 200,
      committed_at: updated.updated_at,
      outcome: 'committed',
      result: updated,
    };
    return { data: receipt } as T;
  }
  m = subPath.match(/^\/receiving-holds\/([^/]+)\/history$/);
  if (m && method === 'GET') return { data: state.holdHistory[m[1]!] ?? [], page: emptyPage() } as T;

  /* --- 9. Recovery Operations --- */
  if (subPath === '/procurement-operations/by-key' && method === 'GET') {
    const k = url.searchParams.get('action_key');
    return { data: state.procOps.find((o) => o.action_key === k) ?? null } as T;
  }
  m = subPath.match(/^\/procurement-operations\/([^/]+)$/);
  if (m && method === 'GET') {
    const op = state.procOps.find((o) => o.operation_id === m![1]);
    if (!op) conflictError('not_found', 'Operation not found.');
    return { data: op } as T;
  }
  if (subPath === '/donation-operations/by-key' && method === 'GET') {
    const k = url.searchParams.get('action_key');
    return { data: state.donationOps.find((o) => o.action_key === k) ?? null } as T;
  }
  m = subPath.match(/^\/donation-operations\/([^/]+)$/);
  if (m && method === 'GET') {
    const op = state.donationOps.find((o) => o.operation_id === m![1]);
    if (!op) conflictError('not_found', 'Operation not found.');
    return { data: op } as T;
  }
  if (subPath === '/receiving-operations/by-key' && method === 'GET') {
    const k = url.searchParams.get('action_key');
    return { data: state.receivingOps.find((o) => o.action_key === k) ?? null } as T;
  }
  m = subPath.match(/^\/receiving-operations\/([^/]+)$/);
  if (m && method === 'GET') {
    const op = state.receivingOps.find((o) => o.operation_id === m![1]);
    if (!op) conflictError('not_found', 'Operation not found.');
    return { data: op } as T;
  }

  /* --- 10. Allocation Queue, Alerts & Reports --- */
  if (subPath === '/allocation-queue' && method === 'GET') {
    const eligibleOnly = url.searchParams.get('eligible_only') === 'true';
    const queue: AllocationQueueListResponse = {
      allocation_policy: POLICY_REF,
      observed_at: nowIso(),
      is_commit_authorization: false,
      data: [
        {
          queue_position: 1,
          allocation_tier: 'active_commitment',
          priority_rank: 3,
          override_policy_id: null,
          needed_at: '2026-12-03T08:00:00.000000Z',
          approved_at: '2026-11-25T10:00:00.000000Z',
          rf_id: '91000000-0000-4000-8000-000000000001',
          rf_reference: 'RF-2026-0001',
          rf_line_id: '91000000-0000-4000-8000-000000000011',
          rf_version: 3,
          rf_material_version: 2,
          rf_progress_version: 2,
          rf_fulfillment: 'partially_issued',
          requesting_unit_id: '62000000-0000-4000-8000-000000000001',
          event_id: '63000000-0000-4000-8000-000000000001',
          item_id: '95000000-0000-4000-8000-000000000050',
          item_code: 'SHIRT',
          item_name: 'Chapter Shirt',
          variant_id: '95000000-0000-4000-8000-000000000051',
          variant_code: 'SHIRT-M',
          variant_label: 'Chapter Shirt / Medium',
          unit_id: '95000000-0000-4000-8000-000000000052',
          unit_code: 'PCS',
          quantity_scale: 0,
          approved_quantity: '45',
          issued_quantity: '20',
          canceled_quantity: '0',
          active_reserved_quantity: '10',
          unreserved_outstanding_quantity: '15',
          usable_stockroom_on_hand: '65',
          active_stock_hold_quantity: '5',
          ineligible_restricted_quantity: '10',
          uninterpreted_restricted_quantity: '10',
          eligible_available_quantity: '40',
          eligible_sources: [
            {
              stock_lot_id: '97600000-0000-4000-8000-000000000001',
              source_kind: 'po_rm',
              source_reference: 'RM-2026-0002',
              location_id: '61000000-0000-4000-8000-000000000001',
              free_quantity: '30',
              restriction_state: 'unrestricted',
            },
            {
              stock_lot_id: '97600000-0000-4000-8000-000000000002',
              source_kind: 'da_rm',
              source_reference: 'RM-2026-0003',
              location_id: '61000000-0000-4000-8000-000000000001',
              free_quantity: '10',
              restriction_state: 'bounded',
            },
          ],
          stage1_next_routes: {
            allocation_review_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000001/allocation-review`,
            reservation_prepare_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000001/reservation-preparations`,
            actual_issue_prepare_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000001/actual-issues`,
          },
        },
        ...(eligibleOnly
          ? []
          : [
              {
                queue_position: 2,
                allocation_tier: 'approved_override' as const,
                priority_rank: 4,
                override_policy_id: POLICY_REF.policy_id,
                needed_at: '2026-12-05T08:00:00.000000Z',
                approved_at: '2026-11-26T05:00:00.000000Z',
                rf_id: '91000000-0000-4000-8000-000000000002',
                rf_reference: 'RF-2026-0002',
                rf_line_id: '91000000-0000-4000-8000-000000000021',
                rf_version: 2,
                rf_material_version: 1,
                rf_progress_version: 1,
                rf_fulfillment: 'outstanding' as const,
                requesting_unit_id: '62000000-0000-4000-8000-000000000002',
                event_id: null,
                item_id: '95000000-0000-4000-8000-000000000050',
                item_code: 'SHIRT',
                item_name: 'Chapter Shirt',
                variant_id: '95000000-0000-4000-8000-000000000051',
                variant_code: 'SHIRT-M',
                variant_label: 'Chapter Shirt / Medium',
                unit_id: '95000000-0000-4000-8000-000000000052',
                unit_code: 'PCS',
                quantity_scale: 0,
                approved_quantity: '10',
                issued_quantity: '0',
                canceled_quantity: '0',
                active_reserved_quantity: '0',
                unreserved_outstanding_quantity: '10',
                usable_stockroom_on_hand: '10',
                active_stock_hold_quantity: '0',
                ineligible_restricted_quantity: '0',
                uninterpreted_restricted_quantity: '10',
                eligible_available_quantity: '0',
                eligible_sources: [],
                stage1_next_routes: {
                  allocation_review_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000002/allocation-review`,
                  reservation_prepare_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000002/reservation-preparations`,
                  actual_issue_prepare_route: `/api/v1/chapters/${chapterId}/internal-rfs/91000000-0000-4000-8000-000000000002/actual-issues`,
                },
              },
            ]),
      ],
      page: emptyPage(),
    };
    return queue as T;
  }

  if (subPath === '/alerts' && method === 'GET') {
    const typeF = url.searchParams.get('alert_type');
    const sevF = url.searchParams.get('severity');
    const dutyF = url.searchParams.get('responsible_duty');
    const rawAlerts: OfficerAlertListResponse['data'] = [
      ...state.needs
        .filter((n) => n.low_stock_breach)
        .map((n) => ({
          alert_key: `low_stock_rop:variant:${n.variant_id}`,
          alert_type: 'low_stock_rop' as const,
          severity: 'warning' as const,
          record_kind: 'variant' as const,
          record_id: n.variant_id,
          record_reference: n.variant_code,
          responsible_duty: 'INVENTORY' as const,
          summary: `Usable stockroom (${n.usable_stockroom_on_hand} ${n.unit_code}) is at or below ROP (${n.approved_rop ?? '—'}).`,
          target_route_hint: 'replenishment_repf',
          detected_at: nowIso(),
        })),
      ...state.repfs
        .filter((r) => r.status === 'pending_budget_review')
        .map((r) => ({
          alert_key: `repf_pending_approval:repf:${r.id}`,
          alert_type: 'repf_pending_approval' as const,
          severity: 'warning' as const,
          record_kind: 'repf' as const,
          record_id: r.id,
          record_reference: r.repf_reference,
          responsible_duty: 'BUDGET_APPROVER' as const,
          summary: `RepF ${r.repf_reference ?? r.id.slice(0, 8)} (PHP ${r.estimated_total_php}) is awaiting budget review.`,
          target_route_hint: 'replenishment_repf',
          detected_at: r.updated_at,
        })),
      ...state.purchaseOrders
        .filter((p) => p.status === 'pending_approval')
        .map((p) => ({
          alert_key: `po_pending_approval:purchase_order:${p.id}`,
          alert_type: 'po_pending_approval' as const,
          severity: 'warning' as const,
          record_kind: 'purchase_order' as const,
          record_id: p.id,
          record_reference: p.po_reference,
          responsible_duty: 'BUDGET_APPROVER' as const,
          summary: `PO draft for PHP ${p.total_amount_php} is awaiting independent approval.`,
          target_route_hint: 'quotations_po',
          detected_at: p.updated_at,
        })),
      ...state.donations
        .filter((d) => d.status === 'pending_acknowledgment')
        .map((d) => ({
          alert_key: `da_pending_acknowledgment:donation:${d.da_id}`,
          alert_type: 'da_pending_acknowledgment' as const,
          severity: 'info' as const,
          record_kind: 'donation' as const,
          record_id: d.da_id,
          record_reference: d.reference,
          responsible_duty: 'CHAPTER_HEAD' as const,
          summary: `In-kind donation from ${d.donor_name} is awaiting signed acknowledgment.`,
          target_route_hint: 'donations_restrictions',
          detected_at: d.updated_at,
        })),
      ...state.purchaseOrders
        .filter((p) => p.linked_demand_canceled)
        .map((p) => ({
          alert_key: `demand_changed:purchase_order:${p.id}`,
          alert_type: 'demand_changed' as const,
          severity: 'critical' as const,
          record_kind: 'purchase_order' as const,
          record_id: p.id,
          record_reference: p.po_reference,
          responsible_duty: 'PURCHASING' as const,
          summary: `Linked demand canceled on ${p.po_reference ?? p.id.slice(0, 8)} — review amendment or cancellation.`,
          target_route_hint: 'quotations_po',
          detected_at: p.updated_at,
        })),
      ...state.discrepancies
        .filter((d) => d.status !== 'resolved')
        .map((d) => ({
          alert_key: `open_receiving_discrepancy:receiving_discrepancy:${d.id}`,
          alert_type: 'open_receiving_discrepancy' as const,
          severity: 'critical' as const,
          record_kind: 'receiving_discrepancy' as const,
          record_id: d.id,
          record_reference: d.rm_reference,
          responsible_duty: 'RECEIVING' as const,
          summary: `${d.total_discrepant_quantity} damaged/rejected units on ${d.rm_reference} await resolution.`,
          target_route_hint: 'receiving_discrepancies',
          detected_at: d.updated_at,
        })),
      ...state.holds
        .filter((h) => h.status === 'held')
        .map((h) => ({
          alert_key: `active_missing_source_hold:receiving_hold:${h.id}`,
          alert_type: 'active_missing_source_hold' as const,
          severity: 'warning' as const,
          record_kind: 'receiving_hold' as const,
          record_id: h.id,
          record_reference: h.delivery_document_reference,
          responsible_duty: 'RECEIVING' as const,
          summary: `Undocumented arrival from ${h.carrier_or_sender_name} held outside usable stock.`,
          target_route_hint: 'receiving_discrepancies',
          detected_at: h.updated_at,
        })),
      {
        alert_key: 'open_rf_shortage:internal_rf:91000000-0000-4000-8000-000000000001',
        alert_type: 'open_rf_shortage' as const,
        severity: 'warning' as const,
        record_kind: 'internal_rf' as const,
        record_id: '91000000-0000-4000-8000-000000000001',
        record_reference: 'RF-2026-0001',
        responsible_duty: 'INVENTORY' as const,
        summary: 'RF-2026-0001 has 15 PCS unreserved shortage.',
        target_route_hint: 'replenishment_repf',
        detected_at: nowIso(),
      },
    ].filter((a) => {
      if (typeF && a.alert_type !== typeF) return false;
      if (sevF && a.severity !== sevF) return false;
      if (dutyF && a.responsible_duty !== dutyF) return false;
      return true;
    });
    const resp: OfficerAlertListResponse = {
      data: rawAlerts,
      caller_matched_duties: ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING', 'CHAPTER_HEAD'],
      persisted_ack_supported: false,
      observed_at: nowIso(),
      page: emptyPage(),
    };
    return resp as T;
  }

  if (subPath === '/reports/inventory' && method === 'GET') {
    const resp: InventoryReportResponse = {
      metadata: {
        report_kind: 'inventory',
        chapter_id: chapterId,
        chapter_name: 'Chapter Preview Workspace',
        currency_code: 'PHP',
        currency_label: 'Philippine Peso (PHP)',
        generated_at: nowIso(),
        filters: {
          date_from: url.searchParams.get('date_from') ?? '2026-11-01',
          date_to: url.searchParams.get('date_to') ?? '2026-11-28',
          item_id: url.searchParams.get('item_id'),
          variant_id: url.searchParams.get('variant_id'),
          location_id: url.searchParams.get('location_id'),
          status: url.searchParams.get('status') ?? 'all',
        },
      },
      stock_category_labels: {
        usable_stockroom_on_hand: 'Usable stockroom on-hand',
        available_to_allocate: 'Available-to-allocate',
        rf_reserved: 'RF-reserved',
        so_reserved: 'SO-reserved',
        booth_custody: 'Booth custody',
        quarantined_rejected: 'Quarantined/rejected',
        inbound_open_po: 'Inbound open PO',
        views_are_additive: false,
      },
      data: [
        {
          item_id: '95000000-0000-4000-8000-000000000050',
          item_code: 'SHIRT',
          item_name: 'Chapter Shirt',
          variant_id: '95000000-0000-4000-8000-000000000051',
          variant_code: 'SHIRT-M',
          variant_label: 'Chapter Shirt / Medium',
          unit_id: '95000000-0000-4000-8000-000000000052',
          unit_code: 'PCS',
          unit_label: 'Pieces',
          quantity_scale: 0,
          location_id: '61000000-0000-4000-8000-000000000001',
          location_name: 'Main Chapter Stockroom',
          custodian_id: PREVIEW_ACTOR.user_id,
          custodian_name: 'Inventory Custodian',
          condition: 'usable',
          custody: 'stockroom',
          restriction_state: 'unrestricted',
          eligibility_status: 'eligible',
          usable_stockroom_on_hand: '40',
          available_to_allocate: '30',
          rf_reserved: '10',
          quarantined_rejected: '10',
          active_stock_hold: '0',
          inbound_open_po: '60',
          period_receipts_quantity: '40',
          period_issues_quantity: '20',
          unreserved_rf_shortage: '15',
          approved_rop: '20',
          approved_target: '80',
          low_stock_breach: false,
          usable_valuation_php: '9600.00',
        },
        {
          item_id: '95000000-0000-4000-8000-000000000050',
          item_code: 'SHIRT',
          item_name: 'Chapter Shirt',
          variant_id: '95000000-0000-4000-8000-000000000051',
          variant_code: 'SHIRT-M',
          variant_label: 'Chapter Shirt / Medium',
          unit_id: '95000000-0000-4000-8000-000000000052',
          unit_code: 'PCS',
          unit_label: 'Pieces',
          quantity_scale: 0,
          location_id: '61000000-0000-4000-8000-000000000001',
          location_name: 'Main Chapter Stockroom',
          custodian_id: PREVIEW_ACTOR.user_id,
          custodian_name: 'Inventory Custodian',
          condition: 'usable',
          custody: 'stockroom',
          restriction_state: 'uninterpreted',
          eligibility_status: 'blocked_uninterpreted',
          usable_stockroom_on_hand: '10',
          available_to_allocate: '0',
          rf_reserved: '0',
          quarantined_rejected: '0',
          active_stock_hold: '0',
          inbound_open_po: '0',
          period_receipts_quantity: '10',
          period_issues_quantity: '0',
          unreserved_rf_shortage: '0',
          approved_rop: '20',
          approved_target: '80',
          low_stock_breach: false,
          usable_valuation_php: '2000.00',
        },
      ],
      totals: {
        row_count: 2,
        total_usable_valuation_php: '11600.00',
        low_stock_row_count: 0,
        uninterpreted_row_count: 1,
        shortage_row_count: 1,
      },
      page: emptyPage(),
    };
    return resp as T;
  }

  if (subPath === '/reports/procurement' && method === 'GET') {
    const resp: ProcurementReportResponse = {
      metadata: {
        report_kind: 'procurement',
        chapter_id: chapterId,
        chapter_name: 'Chapter Preview Workspace',
        currency_code: 'PHP',
        currency_label: 'Philippine Peso (PHP)',
        generated_at: nowIso(),
        filters: {
          date_from: url.searchParams.get('date_from') ?? '2026-11-01',
          date_to: url.searchParams.get('date_to') ?? '2026-11-28',
          item_id: url.searchParams.get('item_id'),
          variant_id: url.searchParams.get('variant_id'),
          location_id: url.searchParams.get('location_id'),
          status: url.searchParams.get('status') ?? 'all',
        },
      },
      rf_demand_summary: [
        {
          rf_id: '91000000-0000-4000-8000-000000000001',
          rf_reference: 'RF-2026-0001',
          rf_line_id: '91000000-0000-4000-8000-000000000011',
          requesting_unit_id: '62000000-0000-4000-8000-000000000001',
          priority_rank: 3,
          needed_at: '2026-12-03T08:00:00.000000Z',
          approved_at: '2026-11-25T10:00:00.000000Z',
          rf_fulfillment: 'partially_issued',
          item_id: '95000000-0000-4000-8000-000000000050',
          variant_id: '95000000-0000-4000-8000-000000000051',
          variant_code: 'SHIRT-M',
          unit_id: '95000000-0000-4000-8000-000000000052',
          unit_code: 'PCS',
          quantity_scale: 0,
          approved_quantity: '45',
          issued_quantity: '20',
          outstanding_quantity: '25',
          canceled_quantity: '0',
          active_reserved_quantity: '10',
        },
      ],
      repf_summary: state.repfs.map((r) => ({
        repf_id: r.id,
        repf_reference: r.repf_reference,
        status: r.status,
        trigger_kinds: r.trigger_kinds,
        urgency: r.urgency,
        linked_demand_canceled: r.linked_demand_canceled,
        requested_total_php: r.estimated_total_php,
        budget_decision: r.budget_decision,
        budget_reviewed_at: r.budget_reviewed_at,
        quotation_count: (state.quotations[r.id] ?? []).length,
        supplier_selected: Boolean(state.selections[r.id]),
      })),
      purchase_order_summary: state.purchaseOrders.flatMap((p) =>
        p.lines.map((l) => ({
          po_id: p.id,
          po_line_id: l.id,
          po_reference: p.po_reference,
          repf_id: p.repf_id,
          status: p.status,
          supplier_name: p.supplier.supplier_name,
          linked_demand_canceled: p.linked_demand_canceled,
          variant_id: l.variant_id,
          variant_code: 'SHIRT-M',
          unit_id: l.unit_id,
          unit_code: 'PCS',
          quantity_scale: 0,
          location_id: '61000000-0000-4000-8000-000000000001',
          ordered_quantity: l.ordered_quantity,
          accepted_quantity: l.accepted_quantity,
          rejected_or_disputed_quantity: l.rejected_or_disputed_quantity,
          outstanding_quantity: l.outstanding_quantity,
          ordered_total_php: l.line_total_php,
          accepted_value_php: toFixedMoney(num(l.accepted_quantity) * num(l.unit_price_php)),
          open_discrepancy_count: state.discrepancies.filter((d) => d.source_id === p.id && d.status !== 'resolved').length,
          resolved_discrepancy_count: state.discrepancies.filter((d) => d.source_id === p.id && d.status === 'resolved').length,
        })),
      ),
      totals: {
        open_rf_lines_count: 1,
        repf_count: state.repfs.length,
        po_count: state.purchaseOrders.length,
        total_ordered_php: toFixedMoney(state.purchaseOrders.reduce((s, p) => s + num(p.total_amount_php), 0)),
        total_accepted_value_php: '9600.00',
        open_discrepancy_count: state.discrepancies.filter((d) => d.status !== 'resolved').length,
      },
      page: emptyPage(),
    };
    return resp as T;
  }

  if (subPath === '/reports/control' && method === 'GET') {
    const resp: ControlReportResponse = {
      metadata: {
        report_kind: 'control',
        chapter_id: chapterId,
        chapter_name: 'Chapter Preview Workspace',
        currency_code: 'PHP',
        currency_label: 'Philippine Peso (PHP)',
        generated_at: nowIso(),
        filters: {
          date_from: url.searchParams.get('date_from') ?? '2026-11-01',
          date_to: url.searchParams.get('date_to') ?? '2026-11-28',
          item_id: url.searchParams.get('item_id'),
          variant_id: url.searchParams.get('variant_id'),
          location_id: url.searchParams.get('location_id'),
          status: url.searchParams.get('status') ?? 'all',
        },
      },
      donation_restrictions: state.donations.flatMap((d) =>
        d.lines.map((l) => ({
          da_id: d.da_id,
          da_reference: d.reference,
          da_status: d.status,
          donor_name: d.donor_name,
          location_id: '61000000-0000-4000-8000-000000000001',
          item_id: '95000000-0000-4000-8000-000000000050',
          variant_id: l.variant_id,
          variant_code: 'SHIRT-M',
          unit_id: l.unit_id,
          unit_code: 'PCS',
          quantity_scale: 0,
          declared_quantity: l.pledged_quantity,
          received_quantity: l.received_quantity,
          declared_value_php: l.pledged_value_php,
          restriction: l.restrictions,
          allocatable_now: l.restrictions.state !== 'uninterpreted',
        })),
      ),
      restriction_resolutions: [],
      overdue_exceptions: [
        {
          exception_kind: 'open_receiving_discrepancy',
          record_id: state.discrepancies[0]?.id ?? '97100000-0000-4000-8000-000000000001',
          record_reference: 'RM-2026-0002',
          location_id: '61000000-0000-4000-8000-000000000001',
          responsible_duty: 'RECEIVING',
          status: 'open',
          due_or_since_at: '2026-11-26T08:40:00.000000Z',
          overdue_hours: 48,
          summary: '10 rejected shirts require replacement or return resolution.',
        },
      ],
      audit_history: [
        {
          event_id: newActionKey(),
          record_kind: 'receiving_report',
          record_id: '97000000-0000-4000-8000-000000000001',
          record_reference: 'RM-2026-0002',
          action: 'posted',
          actor: PREVIEW_ACTOR,
          occurred_at: '2026-11-26T08:40:00.000000Z',
          reason: 'Posted 40 accepted usable + 10 rejected discrepancy.',
        },
      ],
      totals: {
        donation_row_count: state.donations.reduce((s, d) => s + d.lines.length, 0),
        uninterpreted_donation_count: state.donations.reduce(
          (s, d) => s + d.lines.filter((l) => l.restrictions.state === 'uninterpreted').length,
          0,
        ),
        resolution_count: 0,
        overdue_exception_count: 1,
        audit_entry_count: 1,
        total_declared_donation_value_php: toFixedMoney(
          state.donations.reduce((s, d) => s + num(d.pledged_total_value_php), 0),
        ),
      },
      page: emptyPage(),
    };
    return resp as T;
  }

  return null;
}

async function handlePreviewText(path: string): Promise<string | null> {
  if (!previewEnabled) {
    return null;
  }
  const url = new URL(path, 'http://localhost');
  const m = url.pathname.match(/^\/api\/v1\/chapters\/([^/]+)(\/.*)$/);
  if (!m) return null;
  const chapterId = decodeURIComponent(m[1]!);
  const subPath = m[2]!;
  const state = getState(chapterId);

  let pm = subPath.match(/^\/repfs\/([^/]+)\/print$/);
  if (pm) {
    const r = state.repfs.find((item) => item.id === pm![1]);
    return wrapPrintDoc(
      `Replenishment Requisition Form — ${r?.repf_reference ?? 'Draft'}`,
      [
        ['Status', r?.status ?? 'unknown'],
        ['Urgency', r?.urgency ?? '—'],
        ['Estimated Total', `PHP ${r?.estimated_total_php ?? '0.00'}`],
        ['Justification', r?.justification ?? '—'],
        ['Lines', String(r?.lines.length ?? 0)],
      ],
      'Non-executable escaped print document per PrintCsp contract.',
    );
  }
  pm = subPath.match(/^\/purchase-orders\/([^/]+)\/print$/);
  if (pm) {
    const p = state.purchaseOrders.find((item) => item.id === pm![1]);
    return wrapPrintDoc(
      `Purchase Order — ${p?.po_reference ?? 'Draft'}`,
      [
        ['Status', p?.status ?? 'unknown'],
        ['Supplier', p?.supplier.supplier_name ?? '—'],
        ['Delivery Location', p?.delivery_location ?? '—'],
        ['Expected Delivery', p?.expected_delivery_date ?? '—'],
        ['Total', `PHP ${p?.total_amount_php ?? '0.00'}`],
      ],
      'Non-executable escaped PO print view.',
    );
  }
  pm = subPath.match(/^\/donations\/([^/]+)\/print$/);
  if (pm) {
    const d = state.donations.find((item) => item.da_id === pm![1]);
    return wrapPrintDoc(
      `Donation Acknowledgment — ${d?.reference ?? 'Draft'}`,
      [
        ['Status', d?.status ?? 'unknown'],
        ['Donor', d?.donor_name ?? '—'],
        ['Pledged Total Value (In-Kind PHP)', `PHP ${d?.pledged_total_value_php ?? '0.00'}`],
        ['Lines', String(d?.lines.length ?? 0)],
      ],
      'In-kind donation record only; non-cash custody notice.',
    );
  }
  pm = subPath.match(/^\/receiving-reports\/([^/]+)\/print$/);
  if (pm) {
    const r = state.receivingReports.find((item) => item.id === pm![1]);
    return wrapPrintDoc(
      `Receiving Report — ${r?.rm_reference ?? 'Draft'}`,
      [
        ['Source', `${r?.source_kind.toUpperCase() ?? ''} ${r?.source_reference ?? ''}`],
        ['Status', r?.status ?? 'unknown'],
        ['Supplier DR', r?.supplier_dr_reference ?? '—'],
        ['Accepted Total Value', `PHP ${r?.accepted_total_value_php ?? '0.00'}`],
      ],
      'Unified Stage 2 Receiving Report printout.',
    );
  }
  if (/^\/reports\/(inventory|procurement|control)\/print$/.test(subPath)) {
    const kind = subPath.split('/')[2] ?? 'report';
    return wrapPrintDoc(
      `Stage 2 ${kind.toUpperCase()} Report`,
      [
        ['Period', `${url.searchParams.get('date_from') ?? '—'} to ${url.searchParams.get('date_to') ?? '—'}`],
        ['Status Filter', url.searchParams.get('status') ?? 'all'],
        ['Currency', 'Philippine Peso (PHP)'],
      ],
      'Report totals preserve separate non-additive stock categories and ADR 0004 restriction boundaries.',
    );
  }
  return null;
}

registerStage2PreviewAdapter({
  isEnabled: () => previewEnabled && previewActiveChapterId !== null,
  handleJson: handlePreviewJson,
  handleText: handlePreviewText,
});

export function setStage2PreviewEnabled(
  enabled: boolean,
  chapterId: string | null,
  onNotice?: ((notice: Stage1EventNotice) => void) | null,
): void {
  previewEnabled = enabled;
  previewActiveChapterId = chapterId;
  noticeEmitter = onNotice ?? null;
  if (enabled && chapterId) {
    getState(chapterId);
  }
  for (const listener of previewListeners) {
    listener();
  }
}

export function resetStage2Preview(chapterId?: string): void {
  if (chapterId) {
    previewChapters.delete(chapterId);
  } else {
    previewChapters.clear();
    previewEnabled = false;
    previewActiveChapterId = null;
  }
  for (const listener of previewListeners) {
    listener();
  }
}

export function getStage2PreviewState(): { enabled: boolean; chapterId: string | null } {
  return { enabled: previewEnabled, chapterId: previewActiveChapterId };
}

export function subscribeStage2Preview(listener: () => void): () => void {
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
  };
}
