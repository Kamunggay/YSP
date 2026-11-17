<?php

namespace App\Services\Inventory\Participants;

use App\Models\InventoryPosting;
use App\Models\OpeningCountLine;
use App\Models\OpeningRm;
use App\Services\Inventory\PhysicalPostingService;

class PrepareOpeningInventoryParticipant
{
    public function __construct(
        protected PhysicalPostingService $postingService
    ) {}

    /**
     * Staging and committing opening baseline movements via PhysicalPostingService.
     * Enforces source_type = 'IPC' and caller's database transaction.
     */
    public function execute(
        string $chapterId,
        OpeningRm $openingRm,
        string $actorId,
        ?string $notes = null
    ): InventoryPosting {
        $movements = [];
        $linesData = $openingRm->lines_data;

        if (! empty($linesData)) {
            // Group inspected lines by ipc_line_id
            foreach ($linesData as $inspectedLine) {
                $ipcLineId = $inspectedLine['ipc_line_id'] ?? null;
                $ipcLine = $ipcLineId ? OpeningCountLine::find($ipcLineId) : null;

                $variantId = $ipcLine?->variant_id ?? $inspectedLine['variant_id'] ?? null;
                $unitId = $ipcLine?->unit_id ?? $inspectedLine['unit_id'] ?? null;
                $locationId = $ipcLine?->location_id ?? $inspectedLine['location_id'] ?? null;
                $lotCode = $ipcLine?->lot_code ?? $inspectedLine['lot_code'] ?? 'DEFAULT';

                if (! $variantId || ! $unitId || ! $locationId) {
                    continue;
                }

                $acceptedQty = (float) ($inspectedLine['accepted_quantity'] ?? 0);
                $damagedQty = (float) ($inspectedLine['damaged_quantity'] ?? 0);
                $rejectedQty = (float) ($inspectedLine['rejected_quantity'] ?? 0);

                if ($acceptedQty > 0) {
                    $movements[] = [
                        'variant_id' => $variantId,
                        'unit_id' => $unitId,
                        'location_id' => $locationId,
                        'condition' => 'USABLE',
                        'custody' => 'STOCKROOM',
                        'lot_code' => $lotCode,
                        'quantity' => $acceptedQty,
                    ];
                }

                if ($damagedQty > 0) {
                    $movements[] = [
                        'variant_id' => $variantId,
                        'unit_id' => $unitId,
                        'location_id' => $locationId,
                        'condition' => 'QUARANTINE',
                        'custody' => 'STOCKROOM',
                        'lot_code' => $lotCode,
                        'quantity' => $damagedQty,
                    ];
                }

                if ($rejectedQty > 0) {
                    $movements[] = [
                        'variant_id' => $variantId,
                        'unit_id' => $unitId,
                        'location_id' => $locationId,
                        'condition' => 'REJECTED',
                        'custody' => 'STOCKROOM',
                        'lot_code' => $lotCode,
                        'quantity' => $rejectedQty,
                    ];
                }
            }
        } else {
            // Fallback to lines on linked IPC
            $ipc = $openingRm->ipc()->with('lines')->first();
            if ($ipc) {
                // If independent counts exist from multiple counters, aggregate by coordinate
                // or take distinct lines
                $aggregated = [];
                foreach ($ipc->lines as $line) {
                    $key = "{$line->variant_id}_{$line->unit_id}_{$line->location_id}_{$line->condition}_{$line->lot_code}";
                    if (! isset($aggregated[$key])) {
                        $aggregated[$key] = [
                            'variant_id' => $line->variant_id,
                            'unit_id' => $line->unit_id,
                            'location_id' => $line->location_id,
                            'condition' => strtoupper($line->condition ?? 'USABLE'),
                            'custody' => 'STOCKROOM',
                            'lot_code' => $line->lot_code ?? 'DEFAULT',
                            'quantity' => (float) $line->counted_quantity,
                        ];
                    } else {
                        // In independent counting, both counters agree on the same counted quantity
                        $aggregated[$key]['quantity'] = (float) $line->counted_quantity;
                    }
                }

                foreach ($aggregated as $item) {
                    if ($item['quantity'] > 0) {
                        $movements[] = $item;
                    }
                }
            }
        }

        return $this->postingService->createPosting(
            chapterId: $chapterId,
            sourceType: 'IPC',
            sourceId: $openingRm->id,
            actorId: $actorId,
            movements: $movements,
            notes: $notes ?? 'Opening baseline physical movement commit'
        );
    }
}
