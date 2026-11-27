<?php

namespace Tests\Feature\Stage2\Fixtures;

use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use Illuminate\Support\Facades\DB;

final class RepfShortageSnapshot implements NetShortageSnapshotParticipant
{
    public array $calls = [];

    public array $rfLines = [];

    public ?array $failure = null;

    public function computeNetShortageSnapshot(array $input): array
    {
        $this->calls[] = $input;
        if ($this->failure !== null) {
            return $this->failure;
        }

        $items = [];
        foreach ($input['variant_ids'] as $id) {
            $variant = DB::table('catalogue_variants as v')
                ->join('catalogue_items as i', 'v.item_id', '=', 'i.id')
                ->join('catalogue_units as u', 'v.unit_id', '=', 'u.id')
                ->where('v.id', $id)
                ->first(['v.id', 'i.id as item_id', 'i.code as item_code', 'v.code', 'v.name', 'u.id as unit_id', 'u.code as unit_code']);
            $policy = ['policy_id' => $variant->item_id, 'version' => 1];
            $rf = $this->rfLines === [] ? '0.00' : '3.00';
            $gross = $this->rfLines === [] ? '5.00' : '8.00';
            $items[] = [
                'chapter_id' => $input['chapter_id'], 'item_id' => $variant->item_id, 'item_code' => $variant->item_code,
                'variant_id' => $id, 'variant_code' => $variant->code, 'display_name' => $variant->name,
                'unit_id' => $variant->unit_id, 'unit_code' => $variant->unit_code, 'quantity_scale' => 2,
                'approved_rop' => '2.00', 'rop_policy' => $policy, 'approved_target_level' => '5.00', 'target_level_policy' => $policy,
                'usable_stockroom_on_hand' => '0.00', 'eligible_usable_stockroom_on_hand' => '0.00',
                'active_rf_reservations' => '0.00', 'eligible_available_to_allocate' => '0.00',
                'total_unreserved_approved_rf_demand' => $rf, 'unreserved_approved_rf_shortage' => $rf,
                'open_repf_quantity' => '0.00', 'open_po_inbound_quantity' => '1.00',
                'total_open_inbound_coverage' => '1.00', 'excluded_inbound_quantity' => '0.00', 'low_stock_breach' => true,
                'gross_rf_shortage_need' => $rf, 'gross_rop_replenishment_need' => '5.00', 'gross_combined_need' => $gross,
                'uncovered_rf_shortage_quantity' => $rf === '0.00' ? '0.00' : '2.00',
                'uncovered_rop_replenishment_quantity' => $rf === '0.00' ? '4.00' : '5.00',
                'proposed_uncovered_quantity' => $rf === '0.00' ? '4.00' : '7.00',
                'contributing_rf_lines' => $input['include_rf_line_breakdown'] ? $this->rfLines : [],
                'inbound_sources' => [[
                    'source_kind' => 'po', 'source_id' => $variant->item_id, 'source_reference' => 'PO-2026-000001',
                    'status' => 'issued', 'open_quantity' => '1.00', 'coverage_state' => 'counted', 'exclusion_reason' => null,
                ]],
                'setup_blockers' => [], 'observed_at' => $input['observed_at'],
            ];
        }

        return ['outcome' => 'ready', 'snapshot_version' => 7, 'observed_at' => $input['observed_at'], 'items' => $items];
    }
}
