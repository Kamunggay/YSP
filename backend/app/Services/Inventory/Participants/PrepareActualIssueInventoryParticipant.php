<?php

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\ActualIssueLine;
use App\Models\InventoryLot;
use App\Models\InventoryPosting;
use App\Models\LotRestrictionAssignment;
use App\Models\StockHoldRange;
use App\Services\Inventory\PhysicalPostingService;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\BcMath;

class PrepareActualIssueInventoryParticipant
{
    public function __construct(
        protected PhysicalPostingService $postingService,
        protected ?StockViewQueryService $stockViewQuery = null
    ) {
        $this->stockViewQuery = $stockViewQuery ?? app(StockViewQueryService::class);
    }

    /**
     * Synchronous transaction-local actual-issue inventory participant.
     * MUST be called inside the caller's outer database transaction.
     *
     * @param  array<string, mixed>  $context
     * @return array{outcome: string, posting: InventoryPosting}
     *
     * @throws ContractException
     */
    public function execute(ActualIssue $issue, string $actorId, array $context = []): array
    {
        $chapterId = $issue->chapter_id;
        $lines = ActualIssueLine::where('actual_issue_id', $issue->id)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        if ($lines->isEmpty()) {
            throw new ContractException(422, 'invalid_source', 'Actual issue has no lines to post.');
        }

        $lotIds = $lines->pluck('lot_id')->filter()->unique()->sort()->values()->all();
        $lots = empty($lotIds)
            ? collect()
            : InventoryLot::where('chapter_id', $chapterId)
                ->whereIn('id', $lotIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

        $expectedVersionsByLot = [];
        foreach (($context['current_sources'] ?? []) as $src) {
            foreach (($src['targets'] ?? []) as $t) {
                if (! empty($t['stock_lot_id'])) {
                    $expectedVersionsByLot[$t['stock_lot_id']] = $t;
                }
            }
        }

        $movements = [];
        $lineTargets = [];

        foreach ($lines as $line) {
            $qty = BcMath::str($line->issued_quantity);
            if (BcMath::comp($qty, '0') <= 0) {
                throw new ContractException(422, 'invalid_source', 'Actual issue line quantity must be positive.');
            }

            if (! $line->lot_id) {
                throw new ContractException(409, 'invalid_source', "Actual issue line {$line->id} is missing stock_lot_id.");
            }

            /** @var InventoryLot|null $lot */
            $lot = $lots->get($line->lot_id);
            if (! $lot) {
                throw new ContractException(404, 'invalid_source', "Stock lot {$line->lot_id} not found in chapter {$chapterId}.");
            }

            if (strtoupper($lot->condition) !== 'USABLE' || strtoupper($lot->custody) !== 'STOCKROOM') {
                throw new ContractException(409, 'stock_ineligible', "Stock lot {$lot->id} is not usable stockroom stock.", [
                    'failed_intent_committed' => false,
                ]);
            }

            if (LotRestrictionAssignment::where('lot_id', $lot->id)->exists()) {
                throw new ContractException(409, 'stock_ineligible', "Stock lot {$lot->id} carries a lot restriction.", [
                    'failed_intent_committed' => false,
                ]);
            }

            if (isset($expectedVersionsByLot[$lot->id])) {
                $exp = $expectedVersionsByLot[$lot->id];
                if (isset($exp['expected_lot_material_version']) && (int) $exp['expected_lot_material_version'] !== (int) $lot->material_version) {
                    throw new ContractException(409, 'version_conflict', "Lot {$lot->id} material_version conflict.", [
                        'failed_intent_committed' => false,
                    ]);
                }
                if (isset($exp['expected_stock_version']) && (int) $exp['expected_stock_version'] !== (int) $lot->stock_version) {
                    throw new ContractException(409, 'version_conflict', "Lot {$lot->id} stock_version conflict.", [
                        'failed_intent_committed' => false,
                    ]);
                }
            }

            // Hold-first check: ZERO overlapping active holds on this lot interval
            $activeHoldRanges = StockHoldRange::where('chapter_id', $chapterId)
                ->where('lot_id', $lot->id)
                ->whereHas('hold', fn ($q) => $q->where('status', 'active'))
                ->get();

            $offset = BcMath::str($line->offset_quantity ?? '0');
            $end = BcMath::add($offset, $qty);
            $consumedData = $this->stockViewQuery->getConsumedIntervalsForLot($lot, $issue->id);
            if (BcMath::comp($end, $consumedData['basis_total']) > 0) {
                throw new ContractException(409, 'demand_exceeded', "Requested issue range exceeds lot {$lot->id} basis bounds.", [
                    'failed_intent_committed' => false,
                ]);
            }
            foreach ($consumedData['consumed_intervals'] as $ci) {
                if (BcMath::intervalsOverlap($offset, $qty, $ci['offset'], $ci['quantity'])) {
                    throw new ContractException(409, 'reservation_conflict', "Requested issue range overlaps already-consumed coordinates on lot {$lot->id}.", [
                        'failed_intent_committed' => false,
                    ]);
                }
            }

            foreach ($activeHoldRanges as $hr) {
                if (BcMath::intervalsOverlap($offset, $qty, $hr->offset_quantity, $hr->quantity)) {
                    throw new ContractException(409, 'stock_held', 'Review current authorized batch and reconcile before another action.', [
                        'failed_intent_committed' => false,
                    ]);
                }
            }

            if (BcMath::comp($lot->quantity_on_hand, $qty) < 0) {
                throw new ContractException(409, 'demand_exceeded', "Insufficient physical quantity on hand in lot {$lot->id}.", [
                    'failed_intent_committed' => false,
                ]);
            }

            $movements[] = [
                'lot_id' => $lot->id,
                'variant_id' => $lot->variant_id,
                'unit_id' => $lot->unit_id,
                'location_id' => $lot->location_id,
                'condition' => $lot->condition,
                'custody' => $lot->custody,
                'lot_code' => $lot->lot_code,
                'quantity' => '-'.$qty,
                'quantity_scale' => $lot->quantity_scale,
            ];

            $lineTargets[] = [
                'line' => $line,
                'lot' => $lot,
            ];
        }

        $posting = $this->postingService->createPosting(
            chapterId: $chapterId,
            sourceType: 'RF_ISSUE',
            sourceId: $issue->id,
            actorId: $actorId,
            movements: $movements,
            notes: "Actual issue batch {$issue->issue_number}",
            sourceReference: $issue->issue_number
        );

        // Link created InventoryMovement IDs back to ActualIssueLine rows
        $remainingMovements = $posting->movements->values()->all();
        foreach ($lineTargets as $pair) {
            /** @var ActualIssueLine $line */
            $line = $pair['line'];
            /** @var InventoryLot $lot */
            $lot = $pair['lot'];

            foreach ($remainingMovements as $idx => $mov) {
                if (
                    $mov->variant_id === $lot->variant_id
                    && $mov->unit_id === $lot->unit_id
                    && $mov->location_id === $lot->location_id
                ) {
                    $line->inventory_movement_id = $mov->id;
                    $line->save();
                    unset($remainingMovements[$idx]);
                    break;
                }
            }
        }

        return [
            'outcome' => 'ready',
            'posting' => $posting,
        ];
    }
}
