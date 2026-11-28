<?php

namespace App\Services\Inventory;

use App\Models\ActualIssueLine;
use App\Models\CatalogueVariant;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\RfReservationAllocation;
use App\Models\StockHoldRange;
use App\Models\StockReservation;
use App\Services\Inventory\Participants\OpenProcurementSupplyProvider;
use App\Services\Shared\BcMath;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class StockViewQueryService
{
    public function __construct(
        private StockEligibilityEvaluator $eligibility,
        private OpenProcurementSupplyProvider $supply,
    ) {}

    public function getLotAvailability(
        InventoryLot $lot,
        CarbonInterface $at,
        ?string $use,
        ?InternalRf $rf = null,
        ?string $requestingUnitId = null,
        ?string $eventId = null,
        ?CarbonInterface $neededAt = null,
        ?array $ranges = null,
        ?array $potentialUses = null,
    ): array {
        return $this->eligibility->project(
            $lot,
            $ranges['consumed'] ?? $this->getConsumedIntervalsForLot($lot)['consumed_intervals'],
            $ranges['holds'] ?? $this->getActiveHoldRangesForLot($lot->chapter_id, $lot->id),
            [
                ...($ranges['reservations'] ?? $this->getActiveReservationRangesForLot($lot->chapter_id, $lot->id)),
                ...($ranges['sale_commitments'] ?? []),
            ],
            $lot->restrictions_exists ?? $lot->restrictions()->exists(),
            $at, $use, $rf, $requestingUnitId, $eventId, $neededAt, $potentialUses,
        );
    }

    /** @param Collection<int, InventoryLot> $lots Lots from one authorized chapter. */
    public function loadLotRanges(Collection $lots, bool $protectSales = false, bool $lock = false): array
    {
        if ($lots->isEmpty()) {
            return [];
        }

        $ids = $lots->pluck('id')->all();
        $chapterId = $lots->first()->chapter_id;
        $holds = StockHoldRange::where('chapter_id', $chapterId)->whereIn('lot_id', $ids)
            ->whereHas('hold', fn ($query) => $query->where('status', 'active'))
            ->orderBy('id')->when($lock, fn ($query) => $query->sharedLock())->get()->groupBy('lot_id');
        $reservations = RfReservationAllocation::where('chapter_id', $chapterId)->whereIn('lot_id', $ids)
            ->where('status', 'active')
            ->whereHas('reservation', fn ($query) => $query->where('status', 'ACTIVE'))
            ->orderBy('id')->when($lock, fn ($query) => $query->sharedLock())->get()->groupBy('lot_id');
        $issues = ActualIssueLine::whereIn('lot_id', $ids)
            ->whereHas('actualIssue', fn ($query) => $query->where('chapter_id', $chapterId)->where('status', 'posted'))
            ->orderBy('id')->when($lock, fn ($query) => $query->sharedLock())->get()->groupBy('lot_id');

        $ranges = [];
        foreach ($lots as $lot) {
            $ranges[$lot->id] = [
                'consumed' => $this->consumedIntervals($lot, $issues->get($lot->id, collect()))['consumed_intervals'],
                'holds' => $holds->get($lot->id, collect())->map(fn (StockHoldRange $range) => [
                    'hold_id' => $range->hold_id,
                    'offset' => BcMath::str($range->offset_quantity),
                    'quantity' => BcMath::str($range->quantity),
                ])->all(),
                'reservations' => $this->reservationIntervals($reservations->get($lot->id, collect())),
            ];
        }

        if ($protectSales) {
            foreach ($this->saleCommitmentRanges($lots, $ranges, $lock) as $id => $committed) {
                $ranges[$id]['sale_commitments'] = $committed;
            }
        }

        return $ranges;
    }

    /**
     * Sales reservations have no basis coordinates yet. Protect their quantity
     * from sale-eligible free stock in stable lot order.
     *
     * @param  Collection<int, InventoryLot>  $lots  All matching lots in one chapter
     */
    public function saleCommitmentRanges(Collection $lots, ?array $ranges = null, bool $lock = false): array
    {
        if ($lots->isEmpty()) {
            return [];
        }
        $sales = StockReservation::query()->join('sales_order_lines', 'sales_order_lines.id', '=', 'stock_reservations.source_line_id')
            ->where('stock_reservations.chapter_id', $lots->first()->chapter_id)
            ->where('stock_reservations.source_type', 'SO')
            ->where('stock_reservations.status', 'ACTIVE')
            ->whereNull('stock_reservations.lot_id')
            ->whereIn('sales_order_lines.variant_id', $lots->pluck('variant_id')->unique())
            ->orderBy('stock_reservations.id')
            ->when($lock, fn ($query) => $query->sharedLock())
            ->get(['sales_order_lines.variant_id', 'stock_reservations.active_quantity', 'stock_reservations.quantity'])
            ->groupBy('variant_id')
            ->map(fn ($rows) => $rows->reduce(fn (string $sum, StockReservation $sale) => BcMath::add($sum, $sale->active_quantity ?? $sale->quantity), '0'));
        if ($sales->isEmpty()) {
            return [];
        }

        $ranges ??= $this->loadLotRanges($lots, lock: $lock);
        $commitments = [];
        $observedAt = now('UTC');
        foreach ($lots->sortBy('id') as $lot) {
            $variantId = $lot->variant_id;
            $remaining = $sales->get($variantId, '0');
            if (! BcMath::isPositive($remaining)) {
                continue;
            }
            $available = $this->getLotAvailability($lot, $observedAt, 'sale', ranges: $ranges[$lot->id]);
            foreach ($available['free_intervals'] as $range) {
                if (! BcMath::isPositive($remaining)) {
                    break;
                }
                $quantity = BcMath::min($remaining, $range['quantity']);
                $commitments[$lot->id][] = ['offset' => $range['offset_quantity'], 'quantity' => $quantity];
                $remaining = BcMath::sub($remaining, $quantity);
            }
            $sales[$variantId] = $remaining;
        }

        return $commitments;
    }

    /**
     * Get raw numeric/decimal metrics for the seven non-additive stock views.
     * Uses bcmath scale-6 precision and half-open interval union arithmetic so
     * blocked_reserved is strictly a subset of rf_reserved and never double-subtracted.
     *
     * @return array<string, mixed>
     */
    public function getRawMetrics(string $chapterId, ?string $variantId = null, ?string $use = null): array
    {
        $lotQuery = InventoryLot::where('chapter_id', $chapterId);
        if ($variantId) {
            $lotQuery->where('variant_id', $variantId);
        }

        $lots = $lotQuery->withExists('restrictions')->get();

        $usableOnHand = BcMath::str('0');
        $boothCustody = BcMath::str('0');
        $quarantinedRejected = BcMath::str('0');
        $quarantineOnly = BcMath::str('0');
        $rejectedOnly = BcMath::str('0');

        $usableLots = [];

        foreach ($lots as $lot) {
            $qty = BcMath::str($lot->quantity_on_hand);
            $cond = strtoupper($lot->condition);
            $cust = strtoupper($lot->custody);

            if ($cust === 'BOOTH') {
                $boothCustody = BcMath::add($boothCustody, $qty);
            } elseif ($cond === 'USABLE' && $cust === 'STOCKROOM') {
                $usableOnHand = BcMath::add($usableOnHand, $qty);
                $usableLots[$lot->id] = $lot;
            } elseif ($cond === 'QUARANTINE') {
                $quarantinedRejected = BcMath::add($quarantinedRejected, $qty);
                $quarantineOnly = BcMath::add($quarantineOnly, $qty);
            } elseif ($cond === 'REJECTED') {
                $quarantinedRejected = BcMath::add($quarantinedRejected, $qty);
                $rejectedOnly = BcMath::add($rejectedOnly, $qty);
            }
        }

        // Active reservations
        $resQuery = StockReservation::where('chapter_id', $chapterId)
            ->where('status', 'ACTIVE');

        if ($variantId) {
            $resQuery->where(function ($q) use ($variantId) {
                $q->whereHas('salesOrderLine', function ($lineQ) use ($variantId) {
                    $lineQ->where('variant_id', $variantId);
                })->orWhereHas('rfLine', function ($lineQ) use ($variantId) {
                    $lineQ->where('variant_id', $variantId);
                })->orWhereIn('lot_id', function ($sub) use ($variantId) {
                    $sub->select('id')->from('inventory_lots')->where('variant_id', $variantId);
                });
            });
        }

        $reservations = $resQuery->with('allocations')->get();

        $rfReserved = BcMath::str('0');
        $soReserved = BcMath::str('0');
        $unallocatedRfReserved = BcMath::str('0');

        foreach ($reservations as $res) {
            $rQty = BcMath::str($res->active_quantity ?? $res->quantity);
            $type = strtoupper($res->source_type);
            if ($type === 'RF') {
                $rfReserved = BcMath::add($rfReserved, $rQty);
                $activeAllocs = $res->allocations->where('status', 'active');
                if ($activeAllocs->isEmpty()) {
                    $unallocatedRfReserved = BcMath::add($unallocatedRfReserved, $rQty);
                }
            } elseif ($type === 'SO') {
                $soReserved = BcMath::add($soReserved, $rQty);
            }
        }

        $blockedReserved = BcMath::str('0');
        $freeOnHand = BcMath::str('0');
        $observedAt = now('UTC');
        $lotRanges = $this->loadLotRanges(collect($usableLots));
        foreach ($usableLots as $lotId => $lot) {
            $ranges = $lotRanges[$lotId];
            $overlaps = BcMath::intersectIntervalLists($ranges['reservations'], $ranges['holds']);
            $blockedReserved = BcMath::add($blockedReserved, BcMath::intervalUnionLength($overlaps));
            $availability = $this->getLotAvailability($lot, $observedAt, $use, ranges: $ranges);
            $freeOnHand = BcMath::add($freeOnHand, $availability['eligible_free_quantity']);
        }

        $availableToAllocateStr = BcMath::max('0', BcMath::sub($freeOnHand, BcMath::add($unallocatedRfReserved, $soReserved)));

        $totalPhysicalStr = BcMath::add(
            BcMath::add($usableOnHand, $boothCustody),
            $quarantinedRejected
        );

        $inbound = BcMath::str('0');
        $variants = $variantId === null ? CatalogueVariant::where('chapter_id', $chapterId)->pluck('id')->all() : [$variantId];
        foreach ($this->supply->getInboundSourcesForVariants($chapterId, $variants) as $source) {
            if ($source['source_kind'] === 'po') {
                $inbound = BcMath::add($inbound, $source['open_quantity']);
            }
        }

        return [
            'usable_on_hand' => (float) $usableOnHand,
            'usable_stockroom_on_hand' => (float) $usableOnHand,
            'available_to_allocate' => (float) $availableToAllocateStr,
            'rf_reserved' => (float) $rfReserved,
            'so_reserved' => (float) $soReserved,
            'blocked_reserved' => (float) $blockedReserved,
            'booth_custody' => (float) $boothCustody,
            'quarantine_or_rejected' => (float) $quarantinedRejected,
            'quarantined_rejected' => (float) $quarantinedRejected,
            'quarantine' => (float) $quarantineOnly,
            'rejected' => (float) $rejectedOnly,
            'inbound_po' => (float) $inbound,
            'inbound_open_po' => (float) $inbound,
            'inbound_open_po_str' => $inbound,
            'total_physical_balance' => (float) $totalPhysicalStr,
            // Exact bcmath strings for callers needing arbitrary precision
            'usable_on_hand_str' => $usableOnHand,
            'available_to_allocate_str' => $availableToAllocateStr,
            'rf_reserved_str' => $rfReserved,
            'so_reserved_str' => $soReserved,
            'blocked_reserved_str' => $blockedReserved,
            'booth_custody_str' => $boothCustody,
            'quarantined_rejected_str' => $quarantinedRejected,
            'total_physical_balance_str' => $totalPhysicalStr,
        ];
    }

    /**
     * Compute the seven non-additive stock views according to OpenAPI schema.
     *
     * @return array<string, mixed>
     */
    public function getSevenViews(string $chapterId, ?string $variantId = null, int $scale = 0): array
    {
        $raw = $this->getRawMetrics($chapterId, $variantId);

        $format = fn (string $valStr): string => BcMath::format($valStr, $scale);

        return [
            'usable_stockroom_on_hand' => [
                'label' => 'Usable stockroom on-hand',
                'quantity' => $format($raw['usable_on_hand_str']),
                'value' => $raw['usable_stockroom_on_hand'],
            ],
            'available_to_allocate' => [
                'label' => 'Available-to-allocate',
                'quantity' => $format($raw['available_to_allocate_str']),
                'value' => $raw['available_to_allocate'],
            ],
            'rf_reserved' => [
                'label' => 'RF-reserved',
                'quantity' => $format($raw['rf_reserved_str']),
                'value' => $raw['rf_reserved'],
            ],
            'so_reserved' => [
                'label' => 'SO-reserved',
                'quantity' => $format($raw['so_reserved_str']),
                'value' => $raw['so_reserved'],
            ],
            'booth_custody' => [
                'label' => 'Booth custody',
                'quantity' => $format($raw['booth_custody_str']),
                'value' => $raw['booth_custody'],
            ],
            'quarantined_rejected' => [
                'label' => 'Quarantined/rejected',
                'quantity' => $format($raw['quarantined_rejected_str']),
                'value' => $raw['quarantined_rejected'],
            ],
            'inbound_open_po' => [
                'label' => 'Inbound open PO',
                'quantity' => $format($raw['inbound_open_po_str']),
                'value' => $raw['inbound_open_po'],
            ],
            'blocked_reserved' => [
                'label' => 'Blocked reserved (subset of RF-reserved)',
                'quantity' => $format($raw['blocked_reserved_str']),
                'value' => $raw['blocked_reserved'],
            ],
            // Direct numerical convenience properties
            'usable_on_hand' => $raw['usable_on_hand'],
            'quarantine_or_rejected' => $raw['quarantine_or_rejected'],
            'quarantine' => $raw['quarantine'],
            'rejected' => $raw['rejected'],
            'total_physical_balance' => $raw['total_physical_balance'],
        ];
    }

    /**
     * Compute active hold intervals on a specific lot.
     *
     * @return array<int, array{hold_id: string, offset: string, quantity: string}>
     */
    public function getActiveHoldRangesForLot(string $chapterId, string $lotId): array
    {
        return StockHoldRange::where('chapter_id', $chapterId)->where('lot_id', $lotId)
            ->whereHas('hold', fn ($query) => $query->where('status', 'active'))
            ->sharedLock()->get()->map(fn (StockHoldRange $range) => [
                'hold_id' => $range->hold_id,
                'offset' => BcMath::str($range->offset_quantity),
                'quantity' => BcMath::str($range->quantity),
            ])->all();
    }

    /**
     * Compute active RF allocation intervals on a specific lot.
     *
     * @return array<int, array{reservation_id: string, allocation_id: string, offset: string, quantity: string}>
     */
    public function getActiveReservationRangesForLot(string $chapterId, string $lotId): array
    {
        $allocs = RfReservationAllocation::where('chapter_id', $chapterId)
            ->where('lot_id', $lotId)
            ->where('status', 'active')
            ->whereHas('reservation', fn ($q) => $q->where('status', 'ACTIVE'))
            ->sharedLock()->get();

        return $this->reservationIntervals($allocs);
    }

    private function reservationIntervals(Collection $allocs): array
    {
        $result = [];
        foreach ($allocs as $alloc) {
            $rem = BcMath::sub(
                $alloc->quantity,
                BcMath::add($alloc->consumed_quantity, $alloc->released_quantity)
            );
            if (BcMath::comp($rem, '0') > 0) {
                $result[] = [
                    'reservation_id' => $alloc->reservation_id,
                    'allocation_id' => $alloc->id,
                    'offset' => BcMath::str($alloc->offset_quantity),
                    'quantity' => $rem,
                ];
            }
        }

        return $result;
    }

    /**
     * Return basis_total (= original_quantity ?? quantity_on_hand) and all consumed
     * half-open intervals [offset, offset + qty) on a lot from posted ActualIssueLines
     * (plus conservative [0, unindexed_consumed) fallback for legacy direct deductions).
     *
     * @return array{basis_total: string, consumed_intervals: array<int, array{offset: string, quantity: string}>}
     */
    public function getConsumedIntervalsForLot(InventoryLot $lot, ?string $excludeIssueId = null): array
    {
        $postedLinesQuery = ActualIssueLine::where('lot_id', $lot->id)
            ->whereHas('actualIssue', fn ($q) => $q->where('chapter_id', $lot->chapter_id)->where('status', 'posted'));

        if ($excludeIssueId !== null) {
            $postedLinesQuery->where('actual_issue_id', '!=', $excludeIssueId);
        }

        return $this->consumedIntervals($lot, $postedLinesQuery->sharedLock()->get());
    }

    private function consumedIntervals(InventoryLot $lot, Collection $postedLines): array
    {
        $basisTotal = BcMath::str($lot->original_quantity ?? $lot->quantity_on_hand);
        $onHand = BcMath::str($lot->quantity_on_hand);
        $totalConsumed = BcMath::sub($basisTotal, $onHand);
        if (BcMath::comp($totalConsumed, '0') < 0) {
            $totalConsumed = BcMath::str('0');
        }

        $intervals = [];
        $explicitSum = BcMath::str('0');

        foreach ($postedLines as $pl) {
            $qty = BcMath::str($pl->issued_quantity);
            if (BcMath::comp($qty, '0') > 0) {
                $intervals[] = [
                    'offset' => BcMath::str($pl->offset_quantity ?? '0'),
                    'quantity' => $qty,
                ];
                $explicitSum = BcMath::add($explicitSum, $qty);
            }
        }

        $unindexedConsumed = BcMath::sub($totalConsumed, $explicitSum);
        if (BcMath::comp($unindexedConsumed, '0') > 0) {
            $intervals[] = [
                'offset' => BcMath::str('0'),
                'quantity' => $unindexedConsumed,
            ];
        }

        return [
            'basis_total' => $basisTotal,
            'consumed_intervals' => $intervals,
        ];
    }
}
