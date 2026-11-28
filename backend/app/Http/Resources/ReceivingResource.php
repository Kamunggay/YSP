<?php

namespace App\Http\Resources;

use App\Models\InventoryMovement;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\ReceivingReport;
use App\Models\ReceivingReportLine;
use App\Services\Authority\ChapterAuthority;
use Brick\Math\BigDecimal;

final class ReceivingResource
{
    public const UNRESTRICTED = [
        'state' => 'unrestricted',
        'allowed_uses' => [],
        'event_ids' => [],
        'requesting_unit_ids' => [],
        'effective_from' => null,
        'effective_until' => null,
        'interpretation_id' => null,
        'source_condition_reference' => null,
    ];

    public static function report(ReceivingReport $rm): array
    {
        $cancel = $rm->cancellation_json ?? [];
        $snapshot = $rm->snapshot_sha256 === null ? null : [
            'target' => [
                'purpose' => $rm->source_kind === 'po' ? 'po_supplier_dr' : 'da_receipt',
                'record_id' => $rm->id,
            ],
            'material_version' => (int) $rm->material_version,
            'sha256' => $rm->snapshot_sha256,
        ];

        return [
            'id' => $rm->id,
            'chapter_id' => $rm->chapter_id,
            'rm_reference' => $rm->rm_reference,
            'source_kind' => $rm->source_kind,
            'source_id' => $rm->source_id,
            'source_reference' => $rm->source_reference,
            'source_material_version' => (int) $rm->source_material_version,
            'originating_hold_id' => $rm->originating_hold_id,
            'supplier_dr_reference' => $rm->supplier_dr_reference,
            'supplier_dr_date' => $rm->supplier_dr_date,
            'status' => $rm->status,
            'version' => (int) $rm->version,
            'material_version' => (int) $rm->material_version,
            'location_id' => $rm->location_id,
            'currency' => 'PHP',
            'accepted_total_value_php' => (string) ($rm->accepted_total_value_php ?? '0.00'),
            'preparer' => RepfResource::actor($rm->preparer),
            'inspection' => $rm->inspection,
            'snapshot' => $snapshot,
            'evidence_acknowledgment' => $rm->evidence_acknowledgment,
            'posted_by' => $rm->poster ? RepfResource::actor($rm->poster) : null,
            'posted_at' => RepfResource::instant($rm->posted_at),
            'posting_stock_version' => $rm->posting_stock_version !== null ? (int) $rm->posting_stock_version : null,
            'canceled_by' => $cancel['canceled_by'] ?? null,
            'canceled_at' => $cancel['canceled_at'] ?? null,
            'cancel_reason' => $cancel['cancel_reason'] ?? null,
            'lines' => $rm->lines->map(self::reportLine(...))->values()->all(),
            'created_at' => RepfResource::instant($rm->created_at),
            'updated_at' => RepfResource::instant($rm->updated_at),
        ];
    }

    public static function reportLine(ReceivingReportLine $line): array
    {
        $scale = (int) $line->quantity_scale;

        return [
            'id' => $line->id,
            'source_line_id' => $line->source_line_id,
            'variant_id' => $line->variant_id,
            'unit_id' => $line->unit_id,
            'quantity_scale' => $scale,
            'delivered_quantity' => self::scale($line->delivered_quantity, $scale),
            'accepted_quantity' => self::scale($line->accepted_quantity ?? '0', $scale),
            'damaged_quantity' => self::scale($line->damaged_quantity ?? '0', $scale),
            'rejected_quantity' => self::scale($line->rejected_quantity ?? '0', $scale),
            'unit_valuation_php' => (string) ($line->unit_valuation_php ?? '0.00'),
            'accepted_value_php' => (string) ($line->accepted_value_php ?? '0.00'),
            'restrictions' => $line->restrictions ?? self::UNRESTRICTED,
            'discrepancy_notes' => $line->discrepancy_notes,
            'resolves_discrepancy_id' => $line->resolves_discrepancy_id,
        ];
    }

    public static function reportEvidenceMaterial(ReceivingReport $rm): array
    {
        $inspection = $rm->inspection ?? [];

        return [
            'chapter_id' => $rm->chapter_id,
            'rm_id' => $rm->id,
            'material_version' => (int) $rm->material_version,
            'source_kind' => $rm->source_kind,
            'source_id' => $rm->source_id,
            'source_reference' => $rm->source_reference,
            'source_material_version' => (int) $rm->source_material_version,
            'supplier_dr_reference' => $rm->supplier_dr_reference,
            'supplier_dr_date' => $rm->supplier_dr_date,
            'location_id' => $rm->location_id,
            'accepted_total_value_php' => (string) ($rm->accepted_total_value_php ?? '0.00'),
            'inspector_id' => $inspection['inspector']['user_id'],
            'technical_or_requesting_representative_id' => $inspection['technical_or_requesting_representative']['user_id'] ?? null,
            'inspected_at' => $inspection['inspected_at'],
            'lines' => $rm->lines->map(self::reportLine(...))->values()->all(),
        ];
    }

    public static function movement(InventoryMovement $movement): array
    {
        $scale = (int) $movement->quantity_scale;

        return [
            'id' => $movement->id,
            'chapter_id' => $movement->chapter_id,
            'kind' => $movement->movement_kind,
            'source_kind' => $movement->source_kind,
            'rm_id' => $movement->source_rm_id,
            'rm_reference' => $movement->rm_reference,
            'rm_material_version' => (int) $movement->rm_material_version,
            'rm_line_id' => $movement->rm_line_id,
            'source_id' => $movement->origin_source_id,
            'source_reference' => $movement->origin_source_reference,
            'source_material_version' => (int) $movement->origin_source_material_version,
            'source_line_id' => $movement->origin_source_line_id,
            'lot_id' => $movement->lot_id,
            'variant_id' => $movement->variant_id,
            'unit_id' => $movement->unit_id,
            'location_id' => $movement->location_id,
            'quantity' => self::scale($movement->quantity, $scale),
            'unit_valuation_php' => (string) ($movement->unit_valuation_php ?? '0.00'),
            'total_value_php' => (string) ($movement->total_value_php ?? $movement->accepted_value ?? '0.00'),
            'currency' => 'PHP',
            'condition' => self::normalizeCondition($movement->condition),
            'restrictions' => $movement->restrictions_json ?? self::UNRESTRICTED,
            'immediately_allocatable' => (bool) $movement->immediately_allocatable,
            'posted_by' => $movement->posted_by,
            'posted_at' => RepfResource::instant($movement->created_at),
        ];
    }

    public static function discrepancy(ReceivingDiscrepancy $discrepancy): array
    {
        $scale = (int) $discrepancy->quantity_scale;
        $review = $discrepancy->review_json ?? [];
        $totalDiscrepant = BigDecimal::of($discrepancy->damaged_quantity)
            ->plus($discrepancy->rejected_quantity)
            ->toScale($scale);

        return [
            'id' => $discrepancy->id,
            'chapter_id' => $discrepancy->chapter_id,
            'status' => $discrepancy->status,
            'version' => (int) $discrepancy->version,
            'material_version' => (int) $discrepancy->material_version,
            'source_kind' => $discrepancy->source_kind,
            'source_id' => $discrepancy->source_id,
            'source_reference' => $discrepancy->receivingReport->source_reference,
            'source_line_id' => $discrepancy->source_line_id,
            'rm_id' => $discrepancy->rm_id,
            'rm_reference' => $discrepancy->receivingReport->rm_reference,
            'rm_line_id' => $discrepancy->rm_line_id,
            'variant_id' => $discrepancy->variant_id,
            'unit_id' => $discrepancy->unit_id,
            'quantity_scale' => $scale,
            'damaged_quantity' => self::scale($discrepancy->damaged_quantity, $scale),
            'rejected_quantity' => self::scale($discrepancy->rejected_quantity, $scale),
            'total_discrepant_quantity' => (string) $totalDiscrepant,
            'quarantined_lot_id' => $discrepancy->quarantined_lot_id,
            'rejected_lot_id' => $discrepancy->rejected_lot_id,
            'quarantined_lots_auto_cleared_on_source_close' => false,
            'discrepancy_notes' => $discrepancy->discrepancy_notes,
            'supplier_notification' => $discrepancy->supplier_notification,
            'review_started_by' => $review['review_started_by'] ?? null,
            'review_started_at' => $review['review_started_at'] ?? null,
            'review_notes' => $review['review_notes'] ?? null,
            'resolution' => $discrepancy->resolution,
            'created_at' => RepfResource::instant($discrepancy->created_at),
            'updated_at' => RepfResource::instant($discrepancy->updated_at),
        ];
    }

    public static function discrepancyEvidenceMaterial(ReceivingDiscrepancy $discrepancy, array $input): array
    {
        return [
            'chapter_id' => $discrepancy->chapter_id,
            'discrepancy_id' => $discrepancy->id,
            'material_version' => (int) $discrepancy->material_version,
            'resolution_kind' => $input['resolution_kind'],
            'reason' => $input['reason'],
            'replacement_rm_id' => $input['replacement_rm_id'],
            'quarantined_lot_disposition' => $input['quarantined_lot_disposition'],
        ];
    }

    public static function hold(ReceivingHold $hold, ?ChapterAuthority $authority = null, bool $enforceEvidenceRead = true): array
    {
        $data = [
            'id' => $hold->id,
            'chapter_id' => $hold->chapter_id,
            'status' => $hold->status,
            'version' => (int) $hold->version,
            'material_version' => (int) $hold->material_version,
            'arrived_at' => RepfResource::instant($hold->arrived_at),
            'holding_location_id' => $hold->holding_location_id,
            'carrier_or_sender_name' => $hold->carrier_or_sender_name,
            'sender_kind' => $hold->sender_kind,
            'delivery_document_reference' => $hold->delivery_document_reference,
            'hold_reason' => $hold->hold_reason,
            'usable_stock_posted' => false,
            'ipc_creation_prohibited' => true,
            'items' => $hold->items ?? [],
            'intake_evidence' => $hold->intake_evidence,
            'recorded_by' => RepfResource::actor($hold->recorder),
            'linked_source' => $hold->linked_source,
            'rejection_return' => $hold->rejection_return,
            'created_at' => RepfResource::instant($hold->created_at),
            'updated_at' => RepfResource::instant($hold->updated_at),
        ];

        return $enforceEvidenceRead ? self::redactHoldEvidence($data, $authority) : $data;
    }

    public static function holdRejectionEvidenceMaterial(ReceivingHold $hold, array $input): array
    {
        return [
            'chapter_id' => $hold->chapter_id,
            'hold_id' => $hold->id,
            'material_version' => (int) $hold->material_version,
            'reason' => $input['reason'],
            'recipient_or_carrier_name' => $input['recipient_or_carrier_name'],
        ];
    }

    public static function redactHoldEvidence(array $hold, ?ChapterAuthority $authority): array
    {
        if (! ($authority?->allows('evidence.read') ?? false)) {
            $hold['intake_evidence'] = null;
        }

        return $hold;
    }

    public static function normalizeCondition(mixed $condition): string
    {
        return match (strtolower((string) $condition)) {
            'quarantine', 'quarantined' => 'quarantined',
            'rejected' => 'rejected',
            default => 'usable',
        };
    }

    public static function scale(mixed $value, int $scale): string
    {
        return (string) BigDecimal::of((string) $value)->toScale($scale);
    }
}
