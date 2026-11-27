<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

/**
 * ComputeNetShortageSnapshotInput and ComputeNetShortageSnapshotResult in contracts/stage2/openapi.yaml.
 *
 * @phpstan-type PolicyBindingRef array{policy_id: string, version: positive-int}
 * @phpstan-type ReplenishmentRfShortageLine array{
 *     rf_id: string,
 *     rf_reference: string,
 *     rf_line_id: string,
 *     rf_material_version: positive-int,
 *     requesting_unit_id: string,
 *     needed_at: string,
 *     approved_quantity: string,
 *     issued_quantity: string,
 *     canceled_quantity: string,
 *     active_reserved_quantity: string,
 *     unreserved_outstanding_quantity: string,
 * }
 * @phpstan-type ReplenishmentInboundSource array{
 *     source_kind: 'repf'|'po',
 *     source_id: string,
 *     source_reference: string,
 *     status: 'pending_budget_review'|'held'|'approved'|'partially_ordered'|'issued'|'partially_received',
 *     open_quantity: string,
 *     coverage_state: 'counted'|'late'|'disputed'|'ineligible',
 *     exclusion_reason: string|null,
 * }
 * @phpstan-type SetupBlocker array{
 *     setting_key: 'quantity_scale'|'valuation_rounding'|'ipc_authorization'|'rf_approval_route'|'reference_series'|'rop'|'target_level'|'price'|'allocation_priority'|'purchasing_quotation_policy'|'da_authorization',
 *     subject_id: string|null,
 *     state: 'missing'|'unapproved'|'not_effective'|'expired',
 *     approval_owner: 'CHAPTER_HEAD'|'FINANCE',
 *     message: string,
 * }
 * @phpstan-type ReplenishmentNeedItem array{
 *     chapter_id: string,
 *     item_id: string,
 *     item_code: string,
 *     variant_id: string,
 *     variant_code: string,
 *     display_name: string,
 *     unit_id: string,
 *     unit_code: string,
 *     quantity_scale: int,
 *     approved_rop: string|null,
 *     rop_policy: PolicyBindingRef|null,
 *     approved_target_level: string|null,
 *     target_level_policy: PolicyBindingRef|null,
 *     usable_stockroom_on_hand: string,
 *     eligible_usable_stockroom_on_hand: string,
 *     active_rf_reservations: string,
 *     eligible_available_to_allocate: string,
 *     total_unreserved_approved_rf_demand: string,
 *     unreserved_approved_rf_shortage: string,
 *     open_repf_quantity: string,
 *     open_po_inbound_quantity: string,
 *     total_open_inbound_coverage: string,
 *     excluded_inbound_quantity: string,
 *     low_stock_breach: bool,
 *     gross_rf_shortage_need: string,
 *     gross_rop_replenishment_need: string,
 *     gross_combined_need: string,
 *     uncovered_rf_shortage_quantity: string,
 *     uncovered_rop_replenishment_quantity: string,
 *     proposed_uncovered_quantity: string,
 *     contributing_rf_lines: list<ReplenishmentRfShortageLine>,
 *     inbound_sources: list<ReplenishmentInboundSource>,
 *     setup_blockers: list<SetupBlocker>,
 *     observed_at: string,
 * }
 * @phpstan-type ParticipantInput array{
 *     chapter_id: string,
 *     actor_id: string,
 *     observed_at: string,
 *     variant_ids: non-empty-list<string>,
 *     include_rf_line_breakdown: bool,
 *     require_rop_and_target_policies: bool,
 *     exclude_repf_id: string|null,
 * }
 * @phpstan-type ReadyResult array{outcome: 'ready', snapshot_version: positive-int, observed_at: string, items: list<ReplenishmentNeedItem>}
 * @phpstan-type SetupBlockedResult array{outcome: 'setup_blocked', blockers: non-empty-list<SetupBlocker>}
 * @phpstan-type RejectedResult array{outcome: 'rejected', code: 'chapter_not_found'|'resource_not_found'|'unit_mismatch'|'unavailable', message: string}
 */
interface NetShortageSnapshotParticipant
{
    /**
     * @param  ParticipantInput  $input
     * @return ReadyResult|SetupBlockedResult|RejectedResult
     */
    public function computeNetShortageSnapshot(array $input): array;
}
