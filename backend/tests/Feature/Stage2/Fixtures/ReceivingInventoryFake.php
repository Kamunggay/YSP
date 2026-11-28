<?php

namespace Tests\Feature\Stage2\Fixtures;

use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Services\Inventory\Participants\ReceivingInventoryParticipant;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Support\Str;

/**
 * Schema-conforming test fake for Efren's ReceivingInventoryParticipant until Ticket 08.
 */
final class ReceivingInventoryFake implements ReceivingInventoryParticipant
{
    public ?array $forcedRejection = null;

    /** @var list<array<string, mixed>> */
    public array $calls = [];

    public function prepareReceivingInventory(array $input): array
    {
        $this->calls[] = $input;

        if ($this->forcedRejection !== null) {
            return $this->forcedRejection;
        }

        $chapterId = $input['chapter_id'];
        $nextStockVersion = ((int) $input['current_stock_version']) + 1;
        $now = now('UTC')->toImmutable();
        $nowIso = $now->format('Y-m-d\TH:i:s.u\Z');

        $posting = InventoryPosting::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'posting_reference' => $input['rm_reference'],
            'source_type' => $input['source_kind'] === 'po_rm' ? 'PO_DR' : 'DA',
            'source_id' => $input['rm_id'],
            'actor_id' => $input['actor_id'],
            'notes' => "Stage 2 {$input['source_kind']} posting",
            'created_at' => $now,
        ]);

        $usableLots = [];
        $quarantinedOrRejectedLots = [];
        $movements = [];
        $createdDiscrepancies = [];
        $sourceLineUpdates = [];

        foreach ($input['lines'] as $line) {
            $scale = (int) $line['quantity_scale'];
            $restrictions = $line['restrictions'];
            $isUninterpreted = ($restrictions['state'] ?? 'unrestricted') === 'uninterpreted';
            $accepted = BigDecimal::of($line['accepted_quantity']);
            $damaged = BigDecimal::of($line['damaged_quantity']);
            $rejected = BigDecimal::of($line['rejected_quantity']);

            $quarantinedLotId = null;
            $rejectedLotId = null;

            foreach ([
                ['accepted_receipt', 'usable', $accepted, ! $isUninterpreted],
                ['quarantined_receipt', 'quarantined', $damaged, false],
                ['rejected_receipt', 'rejected', $rejected, false],
            ] as [$movementKind, $condition, $qty, $allocatable]) {
                if (! $qty->isPositive()) {
                    continue;
                }

                $lotId = (string) Str::uuid();
                $segmentId = (string) Str::uuid();
                $scaledQty = (string) $qty->toScale($scale);
                $totalValue = (string) $qty->multipliedBy($line['unit_valuation_php'])->toScale(2, RoundingMode::HalfUp);

                InventoryLot::create([
                    'id' => $lotId,
                    'chapter_id' => $chapterId,
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'location_id' => $input['location_id'],
                    'lot_code' => "{$input['rm_reference']}-".substr($lotId, 0, 8),
                    'basis_segment_id' => $segmentId,
                    'condition' => $condition,
                    'custody' => 'stockroom',
                    'quantity_on_hand' => $scaledQty,
                    'original_quantity' => $scaledQty,
                    'quantity_scale' => $scale,
                    'stock_version' => $nextStockVersion,
                    'historical_variant_label' => $line['historical_variant_label'],
                    'material_version' => 1,
                    'source_type' => $input['source_kind'],
                    'source_id' => $input['rm_id'],
                    'source_reference' => $input['rm_reference'],
                    'source_kind' => $input['source_kind'],
                    'rm_line_id' => $line['rm_line_id'],
                    'origin_source_id' => $input['source_id'],
                    'origin_source_line_id' => $line['source_line_id'],
                    'origin_source_reference' => $input['source_reference'],
                    'donor_name' => $input['donor_name'],
                    'restriction_state' => $restrictions['state'] ?? 'unrestricted',
                    'restrictions_json' => $restrictions,
                    'immediately_allocatable' => $allocatable,
                ]);

                $movementId = (string) Str::uuid();
                InventoryMovement::create([
                    'id' => $movementId,
                    'posting_id' => $posting->id,
                    'chapter_id' => $chapterId,
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'location_id' => $input['location_id'],
                    'condition' => $condition,
                    'quantity' => $scaledQty,
                    'balance_after' => $scaledQty,
                    'created_at' => $now,
                    'movement_kind' => $movementKind,
                    'source_rm_id' => $input['rm_id'],
                    'lot_id' => $lotId,
                    'rm_reference' => $input['rm_reference'],
                    'rm_material_version' => $input['rm_material_version'],
                    'quantity_scale' => $scale,
                    'accepted_value' => $condition === 'usable' ? $totalValue : '0.00',
                    'currency' => 'PHP',
                    'posted_by' => $input['actor_id'],
                    'source_kind' => $input['source_kind'],
                    'rm_line_id' => $line['rm_line_id'],
                    'origin_source_id' => $input['source_id'],
                    'origin_source_line_id' => $line['source_line_id'],
                    'origin_source_reference' => $input['source_reference'],
                    'origin_source_material_version' => $input['source_material_version'],
                    'unit_valuation_php' => $line['unit_valuation_php'],
                    'total_value_php' => $totalValue,
                    'restrictions_json' => $restrictions,
                    'immediately_allocatable' => $allocatable,
                ]);

                $postedLot = [
                    'lot_id' => $lotId,
                    'basis_segment_id' => $segmentId,
                    'rm_line_id' => $line['rm_line_id'],
                    'source_line_id' => $line['source_line_id'],
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'location_id' => $input['location_id'],
                    'condition' => $condition,
                    'custody' => 'stockroom',
                    'source_kind' => $input['source_kind'],
                    'quantity' => $scaledQty,
                    'restrictions' => $restrictions,
                    'immediately_allocatable' => $allocatable,
                ];
                if ($condition === 'usable') {
                    $usableLots[] = $postedLot;
                } else {
                    $quarantinedOrRejectedLots[] = $postedLot;
                    if ($condition === 'quarantined') {
                        $quarantinedLotId = $lotId;
                    } else {
                        $rejectedLotId = $lotId;
                    }
                }

                $movements[] = [
                    'id' => $movementId,
                    'chapter_id' => $chapterId,
                    'kind' => $movementKind,
                    'source_kind' => $input['source_kind'],
                    'rm_id' => $input['rm_id'],
                    'rm_reference' => $input['rm_reference'],
                    'rm_material_version' => $input['rm_material_version'],
                    'rm_line_id' => $line['rm_line_id'],
                    'source_id' => $input['source_id'],
                    'source_reference' => $input['source_reference'],
                    'source_material_version' => $input['source_material_version'],
                    'source_line_id' => $line['source_line_id'],
                    'lot_id' => $lotId,
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'location_id' => $input['location_id'],
                    'quantity' => $scaledQty,
                    'unit_valuation_php' => $line['unit_valuation_php'],
                    'total_value_php' => $totalValue,
                    'currency' => 'PHP',
                    'condition' => $condition,
                    'restrictions' => $restrictions,
                    'immediately_allocatable' => $allocatable,
                    'posted_by' => $input['actor_id'],
                    'posted_at' => $nowIso,
                ];
            }

            if ($damaged->isPositive() || $rejected->isPositive()) {
                $createdDiscrepancies[] = [
                    'discrepancy_id' => (string) Str::uuid(),
                    'rm_line_id' => $line['rm_line_id'],
                    'source_line_id' => $line['source_line_id'],
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'damaged_quantity' => (string) $damaged->toScale($scale),
                    'rejected_quantity' => (string) $rejected->toScale($scale),
                    'total_discrepant_quantity' => (string) $damaged->plus($rejected)->toScale($scale),
                    'quarantined_lot_id' => $quarantinedLotId,
                    'rejected_lot_id' => $rejectedLotId,
                ];
            }

            $sourceLineUpdates[] = [
                'source_line_id' => $line['source_line_id'],
                'accepted_delta' => (string) $accepted->toScale($scale),
                'rejected_or_disputed_delta' => (string) $damaged->plus($rejected)->toScale($scale),
                'new_accepted_quantity' => (string) $accepted->toScale($scale),
                'new_outstanding_quantity' => '0',
                'new_source_status' => $input['source_kind'] === 'po_rm' ? 'partially_received' : 'partially_received',
            ];
        }

        return [
            'outcome' => 'ready',
            'stock_version' => $nextStockVersion,
            'usable_lots' => $usableLots,
            'quarantined_or_rejected_lots' => $quarantinedOrRejectedLots,
            'movements' => $movements,
            'created_discrepancies' => $createdDiscrepancies,
            'source_line_updates' => $sourceLineUpdates,
            'emit_stock_lot_changed_event' => true,
        ];
    }
}
