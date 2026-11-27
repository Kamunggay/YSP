<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderAmendment;
use App\Models\PurchaseOrderLine;
use App\Services\Authority\ChapterAuthority;
use Brick\Math\BigDecimal;

final class PurchaseOrderResource
{
    public static function format(PurchaseOrder $po, ?ChapterAuthority $authority = null, bool $enforceEvidenceRead = true): array
    {
        $review = $po->review_json ?? [];
        $amendments = $po->amendments;
        $pending = $amendments->firstWhere('status', 'pending_approval');
        $approvedCount = $amendments->where('status', 'approved')->count();

        $data = [
            'id' => $po->id,
            'chapter_id' => $po->chapter_id,
            'po_reference' => $po->po_reference,
            'status' => $po->status,
            'version' => (int) $po->version,
            'material_version' => (int) $po->material_version,
            'repf_id' => $po->repf_id,
            'repf_reference' => $po->repf->repf_reference,
            'originating_repf_preparer' => RepfResource::actor($po->repf->preparer),
            'supplier_selection_id' => $po->supplier_selection_id,
            'selected_quotation_id' => $po->selected_quotation_id,
            'emergency_waiver_used' => (bool) $po->emergency_waiver_used,
            'supplier' => $po->supplier,
            'delivery_location' => $po->delivery_location,
            'expected_delivery_date' => $po->expected_delivery_date,
            'payment_and_delivery_terms' => $po->payment_and_delivery_terms,
            'currency' => 'PHP',
            'total_amount_php' => (string) $po->total_amount_php,
            'linked_demand_canceled' => (bool) $po->linked_demand_canceled,
            'preparer' => RepfResource::actor($po->preparer),
            'submitted_by' => $review['submitted_by'] ?? null,
            'submitted_at' => $review['submitted_at'] ?? null,
            'approved_by' => $review['approved_by'] ?? null,
            'approved_at' => $review['approved_at'] ?? null,
            'issued_at' => RepfResource::instant($po->issued_at),
            'review_decision_reason' => $review['review_decision_reason'] ?? null,
            'acknowledgment' => $po->acknowledgment,
            'pending_amendment' => $pending ? self::amendment($pending) : null,
            'approved_amendment_count' => $approvedCount,
            'closed_short_by' => $review['closed_short_by'] ?? null,
            'closed_short_at' => $review['closed_short_at'] ?? null,
            'close_short_reason' => $review['close_short_reason'] ?? null,
            'canceled_by' => $review['canceled_by'] ?? null,
            'canceled_at' => $review['canceled_at'] ?? null,
            'cancel_reason' => $review['cancel_reason'] ?? null,
            'lines' => $po->lines->map(self::line(...))->values()->all(),
            'created_at' => RepfResource::instant($po->created_at),
            'updated_at' => RepfResource::instant($po->updated_at),
        ];

        return $enforceEvidenceRead ? self::redactEvidence($data, $authority) : $data;
    }

    public static function line(PurchaseOrderLine $line): array
    {
        return [
            'id' => $line->id,
            'repf_line_id' => $line->repf_line_id,
            'quotation_line_id' => $line->quotation_line_id,
            'variant_id' => $line->variant_id,
            'unit_id' => $line->unit_id,
            'quantity_scale' => (int) $line->quantity_scale,
            'ordered_quantity' => self::qty($line, 'ordered_quantity'),
            'accepted_quantity' => self::qty($line, 'accepted_quantity'),
            'rejected_or_disputed_quantity' => self::qty($line, 'rejected_or_disputed_quantity'),
            'closed_short_quantity' => self::qty($line, 'closed_short_quantity'),
            'canceled_quantity' => self::qty($line, 'canceled_quantity'),
            'outstanding_quantity' => self::qty($line, 'outstanding_quantity'),
            'unit_price_php' => (string) $line->unit_price_php,
            'line_total_php' => (string) $line->line_total_php,
            'specifications' => $line->specifications,
            'linked_demand_canceled' => (bool) $line->linked_demand_canceled,
            'linked_demand_canceled_at' => RepfResource::instant($line->linked_demand_canceled_at),
            'notes' => $line->notes,
        ];
    }

    public static function amendment(PurchaseOrderAmendment $amendment): array
    {
        return [
            'id' => $amendment->id,
            'chapter_id' => $amendment->chapter_id,
            'po_id' => $amendment->po_id,
            'amendment_number' => (int) $amendment->amendment_number,
            'status' => $amendment->status,
            'base_material_version' => (int) $amendment->base_material_version,
            'applied_material_version' => $amendment->applied_material_version !== null ? (int) $amendment->applied_material_version : null,
            'delivery_location' => $amendment->delivery_location,
            'expected_delivery_date' => $amendment->expected_delivery_date,
            'payment_and_delivery_terms' => $amendment->payment_and_delivery_terms,
            'proposed_total_php' => (string) $amendment->proposed_total_php,
            'reason' => $amendment->reason,
            'lines' => $amendment->lines,
            'proposed_by' => RepfResource::actor($amendment->proposer),
            'proposed_at' => RepfResource::instant($amendment->proposed_at),
            'approved_by' => $amendment->approver ? RepfResource::actor($amendment->approver) : null,
            'approved_at' => RepfResource::instant($amendment->approved_at),
        ];
    }

    public static function redactEvidence(array $po, ?ChapterAuthority $authority): array
    {
        if (isset($po['acknowledgment']['evidence_binding']) && ! ($authority?->allows('evidence.read') ?? false)) {
            $po['acknowledgment']['evidence_binding'] = null;
        }

        return $po;
    }

    public static function qty(PurchaseOrderLine $line, string $field): string
    {
        return (string) BigDecimal::of($line->$field)->toScale((int) $line->quantity_scale);
    }
}
