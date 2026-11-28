<?php

namespace App\Services\Inventory;

use App\Models\ActualIssueLine;
use App\Models\InventoryLot;
use App\Models\RfReservationAllocation;
use App\Models\StockHold;
use App\Models\StockReservation;
use App\Services\Shared\BcMath;

class StockViewQueryService
{
    /**
     * Get raw numeric/decimal metrics for the seven non-additive stock views.
     * Uses bcmath scale-6 precision and half-open interval union arithmetic so
     * blocked_reserved is strictly a subset of rf_reserved and never double-subtracted.
     *
     * @return array<string, mixed>
     */
    public function getRawMetrics(string $chapterId, ?string $variantId = null): array
    {
        $lotQuery = InventoryLot::where('chapter_id', $chapterId);
        if ($variantId) {
            $lotQuery->where('variant_id', $variantId);
        }

        $lots = $lotQuery->get();

        $usableOnHand = BcMath::str('0');
        $boothCustody = BcMath::str('0');
        $quarantinedRejected = BcMath::str('0');
        $quarantineOnly = BcMath::str('0');
        $rejectedOnly = BcMath::str('0');

        $usableLotIds = [];
        $unallocatableUsableLotQtyById = [];

        foreach ($lots as $lot) {
            $qty = BcMath::str($lot->quantity_on_hand);
            $cond = strtoupper($lot->condition);
            $cust = strtoupper($lot->custody);

            if ($cust === 'BOOTH') {
                $boothCustody = BcMath::add($boothCustody, $qty);
            } elseif ($cond === 'USABLE' && $cust === 'STOCKROOM') {
                $usableOnHand = BcMath::add($usableOnHand, $qty);
                $usableLotIds[] = $lot->id;
                if (! ($lot->immediately_allocatable ?? true)) {
                    $unallocatableUsableLotQtyById[$lot->id] = $qty;
                }
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
        $rfAllocIntervalsByLot = [];
        $unallocatedRfReserved = BcMath::str('0');

        foreach ($reservations as $res) {
            $rQty = BcMath::str($res->active_quantity ?? $res->quantity);
            $type = strtoupper($res->source_type);
            if ($type === 'RF') {
                $rfReserved = BcMath::add($rfReserved, $rQty);
                $activeAllocs = $res->allocations->where('status', 'active');
                if ($activeAllocs->isEmpty()) {
                    $unallocatedRfReserved = BcMath::add($unallocatedRfReserved, $rQty);
                } else {
                    foreach ($activeAllocs as $alloc) {
                        $remainingAllocQty = BcMath::sub(
                            $alloc->quantity,
                            BcMath::add($alloc->consumed_quantity, $alloc->released_quantity)
                        );
                        if (BcMath::comp($remainingAllocQty, '0') > 0) {
                            $rfAllocIntervalsByLot[$alloc->lot_id][] = [
                                'offset' => BcMath::str($alloc->offset_quantity),
                                'quantity' => $remainingAllocQty,
                            ];
                        }
                    }
                }
            } elseif ($type === 'SO') {
                $soReserved = BcMath::add($soReserved, $rQty);
            }
        }

        // Active stock holds
        $holdIntervalsByLot = [];
        if (! empty($usableLotIds)) {
            $activeHolds = StockHold::where('chapter_id', $chapterId)
                ->where('status', 'active')
                ->with(['ranges' => fn ($q) => $q->whereIn('lot_id', $usableLotIds)])
                ->get();

            foreach ($activeHolds as $hold) {
                foreach ($hold->ranges as $range) {
                    $holdIntervalsByLot[$range->lot_id][] = [
                        'offset' => BcMath::str($range->offset_quantity),
                        'quantity' => BcMath::str($range->quantity),
                    ];
                }
            }
        }

        // Compute blocked_reserved = union(RF_alloc ∩ Holds) across lots
        // Compute unavailable_in_lots = union(RF_alloc ∪ Holds) across usable lots
        $blockedReserved = BcMath::str('0');
        $unavailableAllocatedOrHeld = $unallocatedRfReserved;

        $allAffectedLotIds = array_unique(array_merge(
            array_keys($rfAllocIntervalsByLot),
            array_keys($holdIntervalsByLot),
            $usableLotIds
        ));

        foreach ($allAffectedLotIds as $lotId) {
            $rfIntervals = $rfAllocIntervalsByLot[$lotId] ?? [];
            $holdIntervals = $holdIntervalsByLot[$lotId] ?? [];

            if (! empty($rfIntervals) && ! empty($holdIntervals)) {
                $intersections = BcMath::intersectIntervalLists($rfIntervals, $holdIntervals);
                $blockedReserved = BcMath::add($blockedReserved, BcMath::intervalUnionLength($intersections));
            }

            if (in_array($lotId, $usableLotIds, true)) {
                if (isset($unallocatableUsableLotQtyById[$lotId])) {
                    $unavailableAllocatedOrHeld = BcMath::add(
                        $unavailableAllocatedOrHeld,
                        $unallocatableUsableLotQtyById[$lotId]
                    );
                } else {
                    $combined = array_merge($rfIntervals, $holdIntervals);
                    if (! empty($combined)) {
                        $unavailableAllocatedOrHeld = BcMath::add(
                            $unavailableAllocatedOrHeld,
                            BcMath::intervalUnionLength($combined)
                        );
                    }
                }
            }
        }

        $totalUnavailable = BcMath::add($unavailableAllocatedOrHeld, $soReserved);
        $availableToAllocateStr = BcMath::sub($usableOnHand, $totalUnavailable);
        if (BcMath::comp($availableToAllocateStr, '0') < 0) {
            $availableToAllocateStr = BcMath::str('0');
        }

        $totalPhysicalStr = BcMath::add(
            BcMath::add($usableOnHand, $boothCustody),
            $quarantinedRejected
        );

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
            'inbound_po' => 0.0,
            'inbound_open_po' => 0.0,
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
                'quantity' => $format('0'),
                'value' => 0.0,
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
        $holds = StockHold::where('chapter_id', $chapterId)
            ->where('status', 'active')
            ->with(['ranges' => fn ($q) => $q->where('lot_id', $lotId)])
            ->get();

        $result = [];
        foreach ($holds as $hold) {
            foreach ($hold->ranges as $range) {
                $result[] = [
                    'hold_id' => $hold->id,
                    'offset' => BcMath::str($range->offset_quantity),
                    'quantity' => BcMath::str($range->quantity),
                ];
            }
        }

        return $result;
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
            ->get();

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
        $basisTotal = BcMath::str($lot->original_quantity ?? $lot->quantity_on_hand);
        $onHand = BcMath::str($lot->quantity_on_hand);
        $totalConsumed = BcMath::sub($basisTotal, $onHand);
        if (BcMath::comp($totalConsumed, '0') < 0) {
            $totalConsumed = BcMath::str('0');
        }

        $postedLinesQuery = ActualIssueLine::where('lot_id', $lot->id)
            ->whereHas('actualIssue', fn ($q) => $q->where('chapter_id', $lot->chapter_id)->where('status', 'posted'));

        if ($excludeIssueId !== null) {
            $postedLinesQuery->where('actual_issue_id', '!=', $excludeIssueId);
        }

        $postedLines = $postedLinesQuery->get();
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
