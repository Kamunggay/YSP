<?php

namespace App\Services\Inventory;

use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Services\Shared\BcMath;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PhysicalPostingService
{
    /**
     * Create an immutable inventory posting and its associated signed movements.
     * Enforces deterministic coordinate lock ordering, bcmath scale-6 arithmetic,
     * zero negative stock, basis_segment_id initialization, and unit identity lock (INV-01).
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
        ?string $notes = null,
        ?string $sourceReference = null
    ): InventoryPosting {
        $execute = function () use ($chapterId, $sourceType, $sourceId, $actorId, $movements, $notes, $sourceReference) {
            $postingRef = $sourceReference ?? 'POST-'.strtoupper(Str::random(10));

            $posting = InventoryPosting::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'posting_reference' => $postingRef,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'actor_id' => $actorId,
                'notes' => $notes,
                'created_at' => now(),
            ]);

            // Deterministic sort order to prevent deadlocks across concurrent transactions
            $sortedMovements = $movements;
            usort($sortedMovements, function (array $a, array $b): int {
                $keys = ['variant_id', 'unit_id', 'location_id', 'condition', 'custody', 'lot_code'];
                foreach ($keys as $k) {
                    $va = strtoupper((string) ($a[$k] ?? ''));
                    $vb = strtoupper((string) ($b[$k] ?? ''));
                    $cmp = strcmp($va, $vb);
                    if ($cmp !== 0) {
                        return $cmp;
                    }
                }

                return 0;
            });

            foreach ($sortedMovements as $movData) {
                $variantId = (string) $movData['variant_id'];
                $unitId = (string) $movData['unit_id'];
                $locationId = (string) $movData['location_id'];
                $condition = strtoupper((string) ($movData['condition'] ?? 'USABLE'));
                $custody = strtoupper((string) ($movData['custody'] ?? 'STOCKROOM'));
                $lotCode = (string) ($movData['lot_code'] ?? 'DEFAULT');
                $quantity = BcMath::str($movData['quantity']);

                // Coordinate locking: SELECT ... FOR UPDATE
                $lotQuery = InventoryLot::where('chapter_id', $chapterId)
                    ->where('variant_id', $variantId)
                    ->where('unit_id', $unitId)
                    ->where('location_id', $locationId)
                    ->where('condition', $condition)
                    ->where('custody', $custody)
                    ->where('lot_code', $lotCode);

                if (! empty($movData['lot_id'])) {
                    $lot = InventoryLot::where('chapter_id', $chapterId)
                        ->where('id', $movData['lot_id'])
                        ->lockForUpdate()
                        ->first();
                } else {
                    $lot = $lotQuery->lockForUpdate()->first();
                }

                if ($lot) {
                    $newBalance = BcMath::add($lot->quantity_on_hand, $quantity);
                    if (BcMath::comp($newBalance, '0') < 0) {
                        throw new DomainException("Negative stock balance not permitted: coordinate [{$variantId}] would reach {$newBalance}.");
                    }

                    $lot->quantity_on_hand = $newBalance;
                    $lot->stock_version += 1;
                    $lot->save();

                    $balanceAfter = $newBalance;
                } else {
                    if (BcMath::comp($quantity, '0') < 0) {
                        throw new DomainException("Cannot decrement non-existent lot coordinate [{$variantId}].");
                    }

                    $lotId = (string) Str::uuid();
                    $basisSegmentId = (string) ($movData['basis_segment_id'] ?? $lotId);
                    $qtyScale = (int) ($movData['quantity_scale'] ?? 0);

                    $variant = CatalogueVariant::where('id', $variantId)->first();
                    $unit = CatalogueUnit::where('id', $unitId)->first();
                    if ($variant && ! isset($movData['quantity_scale'])) {
                        $qtyScale = (int) $variant->quantity_scale;
                    }

                    $segments = $movData['segments'] ?? [
                        [
                            'basis_segment_id' => $basisSegmentId,
                            'offset_quantity' => '0',
                            'quantity' => BcMath::format($quantity, $qtyScale),
                        ],
                    ];

                    $lot = InventoryLot::create([
                        'id' => $lotId,
                        'chapter_id' => $chapterId,
                        'variant_id' => $variantId,
                        'unit_id' => $unitId,
                        'location_id' => $locationId,
                        'lot_code' => $lotCode,
                        'basis_segment_id' => $basisSegmentId,
                        'condition' => $condition,
                        'custody' => $custody,
                        'custodian_user_id' => $movData['custodian_user_id'] ?? null,
                        'quantity_on_hand' => $quantity,
                        'original_quantity' => $quantity,
                        'quantity_scale' => $qtyScale,
                        'segments' => $segments,
                        'stock_version' => 1,
                        'historical_variant_label' => $movData['historical_variant_label'] ?? ($variant?->label ?? $variant?->name ?? ''),
                        'material_version' => (int) ($movData['material_version'] ?? 1),
                        'source_type' => $movData['source_type'] ?? $sourceType,
                        'source_id' => $movData['source_id'] ?? $sourceId,
                        'source_reference' => $movData['source_reference'] ?? $postingRef,
                    ]);

                    if ($unit && ! $unit->quantity_identity_locked) {
                        $unit->quantity_identity_locked = true;
                        $unit->save();
                    }

                    $balanceAfter = $quantity;
                }

                // Always ensure unit quantity_identity_locked is enforced after any stock movement (INV-01)
                CatalogueUnit::where('id', $unitId)
                    ->where('chapter_id', $chapterId)
                    ->where('quantity_identity_locked', false)
                    ->update(['quantity_identity_locked' => true]);

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
