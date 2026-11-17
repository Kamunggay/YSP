<?php

namespace App\Services\Inventory;

use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PhysicalPostingService
{
    /**
     * Create an immutable inventory posting and its associated signed movements.
     * Enforces coordinate locking and zero negative stock.
     *
     * @param  array<int, array<string, mixed>>  $movements
     *
     * @throws DomainException
     */
    public function createPosting(
        string $chapterId,
        string $sourceType,
        string $sourceId,
        string $actorId,
        array $movements,
        ?string $notes = null
    ): InventoryPosting {
        $execute = function () use ($chapterId, $sourceType, $sourceId, $actorId, $movements, $notes) {
            $posting = InventoryPosting::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'posting_reference' => 'POST-'.strtoupper(Str::random(10)),
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'actor_id' => $actorId,
                'notes' => $notes,
                'created_at' => now(),
            ]);

            foreach ($movements as $movData) {
                $variantId = $movData['variant_id'];
                $unitId = $movData['unit_id'];
                $locationId = $movData['location_id'];
                $condition = strtoupper($movData['condition'] ?? 'USABLE');
                $custody = strtoupper($movData['custody'] ?? 'STOCKROOM');
                $lotCode = $movData['lot_code'] ?? 'DEFAULT';
                $quantity = (float) $movData['quantity'];

                // Coordinate locking: SELECT ... FOR UPDATE
                $lot = InventoryLot::where('chapter_id', $chapterId)
                    ->where('variant_id', $variantId)
                    ->where('unit_id', $unitId)
                    ->where('location_id', $locationId)
                    ->where('condition', $condition)
                    ->where('custody', $custody)
                    ->where('lot_code', $lotCode)
                    ->lockForUpdate()
                    ->first();

                if ($lot) {
                    $newBalance = (float) $lot->quantity_on_hand + $quantity;
                    if ($newBalance < 0.0) {
                        throw new DomainException("Negative stock balance not permitted: coordinate [{$variantId}] would reach {$newBalance}.");
                    }

                    $lot->quantity_on_hand = $newBalance;
                    $lot->stock_version += 1;
                    $lot->save();

                    $balanceAfter = $newBalance;
                } else {
                    if ($quantity < 0.0) {
                        throw new DomainException("Cannot decrement non-existent lot coordinate [{$variantId}].");
                    }

                    $lot = InventoryLot::create([
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'variant_id' => $variantId,
                        'unit_id' => $unitId,
                        'location_id' => $locationId,
                        'lot_code' => $lotCode,
                        'condition' => $condition,
                        'custody' => $custody,
                        'custodian_user_id' => $movData['custodian_user_id'] ?? null,
                        'quantity_on_hand' => $quantity,
                        'quantity_scale' => $movData['quantity_scale'] ?? 0,
                        'segments' => $movData['segments'] ?? null,
                        'stock_version' => 1,
                        'historical_variant_label' => $movData['historical_variant_label'] ?? '',
                        'material_version' => $movData['material_version'] ?? 1,
                    ]);

                    $balanceAfter = $quantity;
                }

                InventoryMovement::create([
                    'id' => (string) Str::uuid(),
                    'posting_id' => $posting->id,
                    'chapter_id' => $chapterId,
                    'variant_id' => $variantId,
                    'unit_id' => $unitId,
                    'location_id' => $locationId,
                    'condition' => $condition,
                    'quantity' => $quantity,
                    'balance_after' => $balanceAfter,
                    'created_at' => now(),
                ]);
            }

            return $posting->load('movements');
        };

        if (DB::transactionLevel() > 0) {
            return $execute();
        }

        return DB::transaction($execute);
    }
}
