<?php

namespace App\Services\Sales;

use App\Models\SalesOrder;
use App\Models\StockReservation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DemandSplitterService
{
    /**
     * Check available stock and split order demand into reserved and backordered quantities.
     *
     * @param  array<string, float|int>  $availableStockByVariant
     * @return array<string, mixed>
     */
    public function checkAndSplitDemand(SalesOrder $so, array $availableStockByVariant = []): array
    {
        return DB::transaction(function () use ($so, $availableStockByVariant) {
            $stockMap = $this->resolveAvailableStock($so, $availableStockByVariant);

            $lines = $so->lines()->get();
            $allocations = [];
            $totalOrdered = 0.0;
            $totalReserved = 0.0;
            $totalBackordered = 0.0;

            foreach ($lines as $line) {
                $variantId = $line->variant_id;
                $ordered = (float) $line->ordered_quantity;
                $available = isset($stockMap[$variantId]) ? (float) $stockMap[$variantId] : 0.0;

                if ($available >= $ordered) {
                    $reserved = $ordered;
                    $backordered = 0.0;
                    $stockMap[$variantId] = $available - $ordered;
                } else {
                    $reserved = max(0.0, $available);
                    $backordered = $ordered - $reserved;
                    $stockMap[$variantId] = 0.0;
                }

                // Release previous active reservations for this line to prevent double counting
                StockReservation::where('chapter_id', $so->chapter_id)
                    ->where('source_type', 'SO')
                    ->where('source_id', $so->id)
                    ->where('source_line_id', $line->id)
                    ->where('status', 'ACTIVE')
                    ->update(['status' => 'RELEASED']);

                $line->update([
                    'reserved_quantity' => $reserved,
                    'backordered_quantity' => $backordered,
                ]);

                $reservation = null;
                if ($reserved > 0) {
                    $reservation = StockReservation::create([
                        'chapter_id' => $so->chapter_id,
                        'source_type' => 'SO',
                        'source_id' => $so->id,
                        'source_line_id' => $line->id,
                        'lot_id' => null,
                        'quantity' => $reserved,
                        'status' => 'ACTIVE',
                        'expires_at' => now()->addHours(48),
                    ]);
                }

                $totalOrdered += $ordered;
                $totalReserved += $reserved;
                $totalBackordered += $backordered;

                $allocations[] = [
                    'line_id' => $line->id,
                    'variant_id' => $variantId,
                    'ordered_quantity' => $ordered,
                    'reserved_quantity' => $reserved,
                    'backordered_quantity' => $backordered,
                    'reservation_id' => $reservation?->id,
                    'expires_at' => $reservation?->expires_at?->toIso8601String(),
                ];
            }

            return [
                'so_id' => $so->id,
                'chapter_id' => $so->chapter_id,
                'total_ordered' => $totalOrdered,
                'total_reserved' => $totalReserved,
                'total_backordered' => $totalBackordered,
                'allocations' => $allocations,
            ];
        });
    }

    /**
     * Resolve available stock per variant either from provided array or inventory tables.
     *
     * @param  array<string, float|int>  $providedStock
     * @return array<string, float>
     */
    protected function resolveAvailableStock(SalesOrder $so, array $providedStock = []): array
    {
        if (! empty($providedStock)) {
            $normalized = [];
            foreach ($providedStock as $k => $v) {
                $normalized[(string) $k] = (float) $v;
            }

            return $normalized;
        }

        if (Schema::hasTable('inventory_lots')) {
            return DB::table('inventory_lots')
                ->where('chapter_id', $so->chapter_id)
                ->where('status', 'AVAILABLE')
                ->groupBy('variant_id')
                ->selectRaw('variant_id, SUM(quantity - reserved_quantity) as available_qty')
                ->pluck('available_qty', 'variant_id')
                ->map(fn ($qty) => (float) $qty)
                ->toArray();
        }

        return [];
    }
}
