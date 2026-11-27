<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

/**
 * PrepareReceivingInventoryInput and PrepareReceivingInventoryResult in contracts/stage2/openapi.yaml.
 *
 * @phpstan-type EvidenceTarget array{
 *     purpose: 'opening_receipt'|'hold_clearance'|'actual_issue'|'quotation_attachment'|'po_supplier_dr'|'da_acknowledgment'|'da_receipt'|'donor_restriction_resolution'|'receiving_discrepancy'|'missing_source_hold',
 *     record_id: string,
 * }
 * @phpstan-type EvidenceSnapshot array{target: EvidenceTarget, material_version: positive-int, sha256: string}
 * @phpstan-type EvidenceByteBinding array{evidence_id: string, version_id: string, attachments: non-empty-list<array{attachment_id: string, sha256: string}>}
 * @phpstan-type EvidenceMatchAcknowledgment array{
 *     acknowledgment_id: string,
 *     matched_by: string,
 *     matched_at: string,
 *     recipient_id: string|null,
 *     acknowledged_at: string,
 *     snapshot: EvidenceSnapshot,
 *     bytes: EvidenceByteBinding,
 * }
 * @phpstan-type BoundedRestriction array{
 *     state: 'unrestricted'|'bounded'|'uninterpreted',
 *     allowed_uses: list<'internal_use'|'sale'|'booth_custody'>,
 *     event_ids: list<string>,
 *     requesting_unit_ids: list<string>,
 *     effective_from: string|null,
 *     effective_until: string|null,
 *     interpretation_id: string|null,
 *     source_condition_reference: string|null,
 * }
 * @phpstan-type PrepareReceivingInventoryLine array{
 *     rm_line_id: string,
 *     source_line_id: string,
 *     variant_id: string,
 *     variant_material_version: positive-int,
 *     item_id: string,
 *     unit_id: string,
 *     unit_material_version: positive-int,
 *     quantity_scale: int,
 *     historical_variant_label: string,
 *     delivered_quantity: string,
 *     accepted_quantity: string,
 *     damaged_quantity: string,
 *     rejected_quantity: string,
 *     unit_valuation_php: string,
 *     restrictions: BoundedRestriction,
 *     discrepancy_notes: string|null,
 *     resolves_discrepancy_id: string|null,
 * }
 * @phpstan-type ParticipantInput array{
 *     actor_id: string,
 *     chapter_id: string,
 *     operation_id: string,
 *     source_kind: 'po_rm'|'da_rm',
 *     rm_id: string,
 *     rm_reference: string,
 *     rm_material_version: positive-int,
 *     source_id: string,
 *     source_reference: string,
 *     source_material_version: positive-int,
 *     donor_id: string|null,
 *     donor_name: string|null,
 *     location_id: string,
 *     current_stock_version: positive-int,
 *     acknowledgment: EvidenceMatchAcknowledgment,
 *     lines: non-empty-list<PrepareReceivingInventoryLine>,
 * }
 * @phpstan-type ReceivingPostedLot array{
 *     lot_id: string,
 *     basis_segment_id: string,
 *     rm_line_id: string,
 *     source_line_id: string,
 *     variant_id: string,
 *     unit_id: string,
 *     location_id: string,
 *     condition: 'usable'|'quarantined'|'rejected',
 *     custody: 'stockroom',
 *     source_kind: 'po_rm'|'da_rm',
 *     quantity: string,
 *     restrictions: BoundedRestriction,
 *     immediately_allocatable: bool,
 * }
 * @phpstan-type ReceivingMovement array{
 *     id: string,
 *     chapter_id: string,
 *     kind: 'accepted_receipt'|'quarantined_receipt'|'rejected_receipt',
 *     source_kind: 'po_rm'|'da_rm',
 *     rm_id: string,
 *     rm_reference: string,
 *     rm_material_version: positive-int,
 *     rm_line_id: string,
 *     source_id: string,
 *     source_reference: string,
 *     source_material_version: positive-int,
 *     source_line_id: string,
 *     lot_id: string,
 *     variant_id: string,
 *     unit_id: string,
 *     location_id: string,
 *     quantity: string,
 *     unit_valuation_php: string,
 *     total_value_php: string,
 *     currency: 'PHP',
 *     condition: 'usable'|'quarantined'|'rejected',
 *     restrictions: BoundedRestriction,
 *     immediately_allocatable: bool,
 *     posted_by: string,
 *     posted_at: string,
 * }
 * @phpstan-type ReceivingDiscrepancySeed array{
 *     discrepancy_id: string,
 *     rm_line_id: string,
 *     source_line_id: string,
 *     variant_id: string,
 *     unit_id: string,
 *     damaged_quantity: string,
 *     rejected_quantity: string,
 *     total_discrepant_quantity: string,
 *     quarantined_lot_id: string|null,
 *     rejected_lot_id: string|null,
 * }
 * @phpstan-type ReceivingSourceLineUpdate array{
 *     source_line_id: string,
 *     accepted_delta: string,
 *     rejected_or_disputed_delta: string,
 *     new_accepted_quantity: string,
 *     new_outstanding_quantity: string,
 *     new_source_status: 'issued'|'partially_received'|'receiving_complete'|'acknowledged'|'received',
 * }
 * @phpstan-type ReadyResult array{
 *     outcome: 'ready',
 *     stock_version: positive-int,
 *     usable_lots: list<ReceivingPostedLot>,
 *     quarantined_or_rejected_lots: list<ReceivingPostedLot>,
 *     movements: non-empty-list<ReceivingMovement>,
 *     created_discrepancies: list<ReceivingDiscrepancySeed>,
 *     source_line_updates: non-empty-list<ReceivingSourceLineUpdate>,
 *     emit_stock_lot_changed_event: true,
 * }
 * @phpstan-type RejectedResult array{
 *     outcome: 'rejected',
 *     reason: 'source_not_eligible'|'substitution_or_overdelivery_blocked'|'stale_version'|'evidence_missing'|'evidence_invalid'|'evidence_mismatch'|'setup_blocked'|'target_locked'|'authority_changed',
 * }
 */
interface ReceivingInventoryParticipant
{
    /**
     * @param  ParticipantInput  $input
     * @return ReadyResult|RejectedResult
     */
    public function prepareReceivingInventory(array $input): array;
}
