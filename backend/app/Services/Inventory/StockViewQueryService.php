<?php

namespace App\Services\Inventory;

use App\Models\InventoryLot;
use App\Models\StockReservation;

class StockViewQueryService
{
    /**
     * Get raw numeric metrics for the seven non-additive stock views.
     *
     * @return array<string, float>
     */
    public function getRawMetrics(string $chapterId, ?string $variantId = null): array
    {
        $lotQuery = InventoryLot::where('chapter_id', $chapterId);
        if ($variantId) {
            $lotQuery->where('variant_id', $variantId);
        }

        $lots = $lotQuery->get();

        $usableOnHand = 0.0;
        $boothCustody = 0.0;
        $quarantinedRejected = 0.0;
        $quarantineOnly = 0.0;
        $rejectedOnly = 0.0;

        foreach ($lots as $lot) {
            $qty = (float) $lot->quantity_on_hand;
            $cond = strtoupper($lot->condition);
            $cust = strtoupper($lot->custody);

            if ($cust === 'BOOTH') {
                $boothCustody += $qty;
            } elseif ($cond === 'USABLE' && $cust === 'STOCKROOM') {
                $usableOnHand += $qty;
            } elseif ($cond === 'QUARANTINE') {
                $quarantinedRejected += $qty;
                $quarantineOnly += $qty;
            } elseif ($cond === 'REJECTED') {
                $quarantinedRejected += $qty;
                $rejectedOnly += $qty;
            }
        }

        // Active reservations
        $resQuery = StockReservation::where('chapter_id', $chapterId)
            ->where('status', 'ACTIVE');

        if ($variantId) {
            // Check if reservation is linked to a lot of this variant
            $resQuery->where(function ($q) use ($variantId) {
                $q->whereHas('salesOrderLine', function ($lineQ) use ($variantId) {
                    $lineQ->where('variant_id', $variantId);
                })->orWhereIn('lot_id', function ($sub) use ($variantId) {
                    $sub->select('id')->from('inventory_lots')->where('variant_id', $variantId);
                });
            });
        }

        $reservations = $resQuery->get();

        $rfReserved = 0.0;
        $soReserved = 0.0;

        foreach ($reservations as $res) {
            $rQty = (float) $res->quantity;
            $type = strtoupper($res->source_type);
            if ($type === 'RF') {
                $rfReserved += $rQty;
            } elseif ($type === 'SO') {
                $soReserved += $rQty;
            }
        }

        $totalReserved = $rfReserved + $soReserved;
        $availableToAllocate = max(0.0, $usableOnHand - $totalReserved);
        $inboundOpenPo = 0.0; // Stage 2 Purchasing integration

        return [
            'usable_on_hand' => $usableOnHand,
            'usable_stockroom_on_hand' => $usableOnHand,
            'available_to_allocate' => $availableToAllocate,
            'rf_reserved' => $rfReserved,
            'so_reserved' => $soReserved,
            'booth_custody' => $boothCustody,
            'quarantine_or_rejected' => $quarantinedRejected,
            'quarantined_rejected' => $quarantinedRejected,
            'quarantine' => $quarantineOnly,
            'rejected' => $rejectedOnly,
            'inbound_po' => $inboundOpenPo,
            'inbound_open_po' => $inboundOpenPo,
            'total_physical_balance' => $usableOnHand + $boothCustody + $quarantinedRejected,
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

        $format = function (float $val) use ($scale): string {
            if ($scale === 0) {
                return (string) ((int) round($val));
            }

            return number_format($val, $scale, '.', '');
        };

        return [
            'usable_stockroom_on_hand' => [
                'label' => 'Usable stockroom on-hand',
                'quantity' => $format($raw['usable_stockroom_on_hand']),
                'value' => $raw['usable_stockroom_on_hand'],
            ],
            'available_to_allocate' => [
                'label' => 'Available-to-allocate',
                'quantity' => $format($raw['available_to_allocate']),
                'value' => $raw['available_to_allocate'],
            ],
            'rf_reserved' => [
                'label' => 'RF-reserved',
                'quantity' => $format($raw['rf_reserved']),
                'value' => $raw['rf_reserved'],
            ],
            'so_reserved' => [
                'label' => 'SO-reserved',
                'quantity' => $format($raw['so_reserved']),
                'value' => $raw['so_reserved'],
            ],
            'booth_custody' => [
                'label' => 'Booth custody',
                'quantity' => $format($raw['booth_custody']),
                'value' => $raw['booth_custody'],
            ],
            'quarantined_rejected' => [
                'label' => 'Quarantined/rejected',
                'quantity' => $format($raw['quarantined_rejected']),
                'value' => $raw['quarantined_rejected'],
            ],
            'inbound_open_po' => [
                'label' => 'Inbound open PO',
                'quantity' => $format($raw['inbound_open_po']),
                'value' => $raw['inbound_open_po'],
            ],
            // Direct numerical convenience properties
            'usable_on_hand' => $raw['usable_on_hand'],
            'quarantine_or_rejected' => $raw['quarantine_or_rejected'],
            'quarantine' => $raw['quarantine'],
            'rejected' => $raw['rejected'],
            'total_physical_balance' => $raw['total_physical_balance'],
        ];
    }
}
