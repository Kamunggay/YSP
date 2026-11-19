<?php

namespace App\Services\Sales;

use App\Models\InventoryLot;
use App\Models\SalesOrder;
use App\Models\StockReservation;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\BcMath;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DemandSplitterService
{
    public function __construct(
        protected ?StockViewQueryService $stockViewQueryService = null
    ) {
        $this->stockViewQueryService = $stockViewQueryService ?? app(StockViewQueryService::class);
    }

    /**
     * Check available stock and split order demand into reserved and backordered quantities.
     *
     * @param  array<string, float|int|string>  $availableStockByVariant
     * @return array<string, mixed>
     */
    public function checkAndSplitDemand(SalesOrder $so, array $availableStockByVariant = []): array
    {
        return DB::transaction(function () use ($so, $availableStockByVariant) {
            $lines = $so->lines()->get();
            $stockMap = $this->resolveAvailableStock($so, $lines, $availableStockByVariant);

            $allocations = [];
            $totalOrdered = BcMath::str('0');
            $totalReserved = BcMath::str('0');
            $totalBackordered = BcMath::str('0');

            foreach ($lines as $line) {
                $variantId = (string) $line->variant_id;
                $ordered = BcMath::str($line->ordered_quantity);
                $available = isset($stockMap[$variantId]) ? BcMath::str($stockMap[$variantId]) : BcMath::str('0');

                if (BcMath::comp($available, $ordered) >= 0) {
                    $reserved = $ordered;
                    $backordered = BcMath::str('0');
                    $stockMap[$variantId] = BcMath::sub($available, $ordered);
                } else {
                    $reserved = BcMath::comp($available, '0') > 0 ? $available : BcMath::str('0');
                    $backordered = BcMath::sub($ordered, $reserved);
                    $stockMap[$variantId] = BcMath::str('0');
                }

                // Release previous active reservations for this line to prevent double counting
                $prevActive = StockReservation::where('chapter_id', $so->chapter_id)
                    ->where('source_type', 'SO')
                    ->where('source_id', $so->id)
                    ->where('source_line_id', $line->id)
                    ->where('status', 'ACTIVE')
                    ->lockForUpdate()
                    ->get();

                foreach ($prevActive as $prev) {
                    $prev->status = 'RELEASED';
                    $prev->state = 'released';
                    $prev->released_quantity = BcMath::add($prev->released_quantity ?? '0', $prev->active_quantity ?? $prev->quantity);
                    $prev->active_quantity = BcMath::str('0');
                    $prev->quantity = BcMath::str('0');
                    $prev->save();
                }

                $line->update([
                    'reserved_quantity' => (float) $reserved,
                    'backordered_quantity' => (float) $backordered,
                ]);

                $reservation = null;
                if (BcMath::isPositive($reserved)) {
                    $reservation = StockReservation::create([
                        'chapter_id' => $so->chapter_id,
                        'source_type' => 'SO',
                        'source_id' => $so->id,
                        'source_line_id' => $line->id,
                        'lot_id' => null,
                        'quantity' => $reserved,
                        'committed_quantity' => $reserved,
                        'active_quantity' => $reserved,
                        'fulfilled_quantity' => BcMath::str('0'),
                        'released_quantity' => BcMath::str('0'),
                        'blocked_quantity' => BcMath::str('0'),
                        'status' => 'ACTIVE',
                        'state' => 'active',
                        'expires_at' => now()->addHours(48),
                    ]);
                }

                $totalOrdered = BcMath::add($totalOrdered, $ordered);
                $totalReserved = BcMath::add($totalReserved, $reserved);
                $totalBackordered = BcMath::add($totalBackordered, $backordered);

                $allocations[] = [
                    'line_id' => $line->id,
                    'variant_id' => $variantId,
                    'ordered_quantity' => (float) $ordered,
                    'reserved_quantity' => (float) $reserved,
                    'backordered_quantity' => (float) $backordered,
                    'reservation_id' => $reservation?->id,
                    'expires_at' => $reservation?->expires_at?->toIso8601String(),
                ];
            }

            return [
                'so_id' => $so->id,
                'chapter_id' => $so->chapter_id,
                'total_ordered' => (float) $totalOrdered,
                'total_reserved' => (float) $totalReserved,
                'total_backordered' => (float) $totalBackordered,
                'allocations' => $allocations,
            ];
        });
    }

    /**
     * Resolve available stock per variant either from provided override array or
     * live StockViewQueryService::getRawMetrics() with locked InventoryLot rows.
     *
     * @param  array<string, float|int|string>  $providedStock
     * @return array<string, string>
     */
    protected function resolveAvailableStock(SalesOrder $so, $lines, array $providedStock = []): array
    {
        if (! empty($providedStock)) {
            $normalized = [];
            foreach ($providedStock as $k => $v) {
                $normalized[(string) $k] = BcMath::str($v);
            }

            return $normalized;
        }

        if (! Schema::hasTable('inventory_lots')) {
            return [];
        }

        $variantIds = $lines->pluck('variant_id')->filter()->unique()->sort()->values()->all();
        if (empty($variantIds)) {
            return [];
        }

        // Lock matching inventory lots deterministically inside transaction
        InventoryLot::where('chapter_id', $so->chapter_id)
            ->whereIn('variant_id', $variantIds)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $stockMap = [];
        foreach ($variantIds as $variantId) {
            $metrics = $this->stockViewQueryService->getRawMetrics($so->chapter_id, (string) $variantId);
            $stockMap[(string) $variantId] = BcMath::str($metrics['available_to_allocate_str'] ?? $metrics['available_to_allocate'] ?? '0');
        }

        return $stockMap;
    }
}
