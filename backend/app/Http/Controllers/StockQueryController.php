<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\CatalogueVariant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\LotRestrictionAssignment;
use App\Models\StockHold;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockQueryController extends Controller
{
    public function __construct(
        protected StockViewQueryService $stockViewService
    ) {}

    /**
     * GET /api/v1/chapters/{chapter_id}/stock
     */
    public function listStockSummaries(Request $request, string $chapterId): JsonResponse
    {
        $variantId = $request->query('variant_id');
        $query = CatalogueVariant::where('chapter_id', $chapterId);

        if ($variantId) {
            $query->where('id', $variantId);
        }

        $variants = $query->with(['item', 'unit'])->get();

        $data = [];
        foreach ($variants as $variant) {
            $views = $this->stockViewService->getSevenViews(
                chapterId: $chapterId,
                variantId: $variant->id,
                scale: $variant->quantity_scale ?? 0
            );

            $cleanViews = [
                'usable_stockroom_on_hand' => $views['usable_stockroom_on_hand'],
                'available_to_allocate' => $views['available_to_allocate'],
                'rf_reserved' => $views['rf_reserved'],
                'so_reserved' => $views['so_reserved'],
                'booth_custody' => $views['booth_custody'],
                'quarantined_rejected' => $views['quarantined_rejected'],
                'inbound_open_po' => $views['inbound_open_po'],
            ];

            $data[] = [
                'variant_id' => $variant->id,
                'chapter_id' => $chapterId,
                'stock_version' => 1,
                'variant_material_version' => $variant->material_version ?? 1,
                'unit_id' => $variant->unit_id,
                'quantity_scale' => $variant->quantity_scale ?? 0,
                'intended_use' => [
                    'use' => $request->query('intended_use', 'internal_use'),
                    'requesting_unit_id' => null,
                    'event_id' => null,
                    'needed_at' => $request->query('needed_at', now()->toIso8601String()),
                ],
                'observed_at' => now()->toIso8601String(),
                'views' => $cleanViews,
                'views_are_additive' => false,
                'blocked_reserved' => $views['blocked_reserved']['quantity'],
                'item_usable_stockroom_on_hand' => $cleanViews['usable_stockroom_on_hand']['quantity'],
                'approved_rop' => null,
                'approved_target' => null,
                'low_stock' => 'above_rop',
                'setup_blockers' => [],
                'outstanding_need' => [],
                'procurement_commitment_created' => false,
            ];
        }

        return response()->json([
            'data' => $data,
            'page' => [
                'has_more' => false,
                'next_cursor' => null,
                'total_elements' => count($data),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/stock/variants/{variant_id}
     */
    public function readVariantStock(Request $request, string $chapterId, string $variantId): JsonResponse
    {
        $variant = CatalogueVariant::where('chapter_id', $chapterId)
            ->where('id', $variantId)
            ->with(['item', 'unit'])
            ->first();

        if (! $variant) {
            return response()->json([
                'error' => 'VARIANT_NOT_FOUND',
                'message' => "Variant {$variantId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $views = $this->stockViewService->getSevenViews(
            chapterId: $chapterId,
            variantId: $variant->id,
            scale: $variant->quantity_scale ?? 0
        );

        $cleanViews = [
            'usable_stockroom_on_hand' => $views['usable_stockroom_on_hand'],
            'available_to_allocate' => $views['available_to_allocate'],
            'rf_reserved' => $views['rf_reserved'],
            'so_reserved' => $views['so_reserved'],
            'booth_custody' => $views['booth_custody'],
            'quarantined_rejected' => $views['quarantined_rejected'],
            'inbound_open_po' => $views['inbound_open_po'],
        ];

        return response()->json([
            'data' => [
                'variant_id' => $variant->id,
                'chapter_id' => $chapterId,
                'stock_version' => 1,
                'variant_material_version' => $variant->material_version ?? 1,
                'unit_id' => $variant->unit_id,
                'quantity_scale' => $variant->quantity_scale ?? 0,
                'intended_use' => [
                    'use' => $request->query('intended_use', 'internal_use'),
                    'requesting_unit_id' => null,
                    'event_id' => null,
                    'needed_at' => $request->query('needed_at', now()->toIso8601String()),
                ],
                'observed_at' => now()->toIso8601String(),
                'views' => $cleanViews,
                'views_are_additive' => false,
                'blocked_reserved' => $views['blocked_reserved']['quantity'],
                'item_usable_stockroom_on_hand' => $cleanViews['usable_stockroom_on_hand']['quantity'],
                'approved_rop' => null,
                'approved_target' => null,
                'low_stock' => 'above_rop',
                'setup_blockers' => [],
                'outstanding_need' => [],
                'procurement_commitment_created' => false,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/stock/lots
     */
    public function listStockLots(Request $request, string $chapterId): JsonResponse
    {
        $query = InventoryLot::where('chapter_id', $chapterId)
            ->with(['variant', 'unit']);

        if ($request->has('variant_id')) {
            $query->where('variant_id', $request->query('variant_id'));
        }

        if ($request->has('location_id')) {
            $query->where('location_id', $request->query('location_id'));
        }

        $lots = $query->get();

        $data = $lots->map(fn (InventoryLot $lot) => $this->formatStockLot($lot))->values();

        return response()->json([
            'data' => $data,
            'page' => [
                'has_more' => false,
                'next_cursor' => null,
                'total_elements' => $data->count(),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/stock/lots/{stock_lot_id}
     */
    public function readStockLot(Request $request, string $chapterId, string $stockLotId): JsonResponse
    {
        $lot = InventoryLot::where('chapter_id', $chapterId)
            ->where('id', $stockLotId)
            ->with(['variant', 'unit'])
            ->first();

        if (! $lot) {
            return response()->json([
                'error' => 'STOCK_LOT_NOT_FOUND',
                'message' => "Stock lot {$stockLotId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $this->formatStockLot($lot),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/stock/lots/{stock_lot_id}/eligibility
     */
    public function readStockEligibility(Request $request, string $chapterId, string $stockLotId): JsonResponse
    {
        $selectors = ['intended_use', 'unit_id', 'requesting_unit_id', 'event_id', 'needed_at', 'quantity'];
        $seen = [];
        $query = (string) $request->server('QUERY_STRING', '');
        foreach ($query === '' ? [] : explode('&', $query) as $parameter) {
            $name = urldecode(explode('=', $parameter, 2)[0]);
            if (! in_array($name, $selectors, true) || isset($seen[$name])) {
                throw new ContractException(400, 'invalid_selector', 'Unsupported or duplicate stock eligibility selector.');
            }
            $seen[$name] = true;
        }
        $intendedUse = $request->query('intended_use');
        if ($intendedUse !== null && ! in_array($intendedUse, ['internal_use', 'sale', 'booth_custody'], true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid intended stock use.');
        }
        foreach (['unit_id', 'requesting_unit_id', 'event_id'] as $name) {
            $value = $request->query($name);
            if ($value !== null && (! is_string($value) || preg_match(AuthInput::UUID, $value) !== 1)) {
                throw new ContractException(400, 'invalid_selector', "Invalid {$name} selector.");
            }
        }
        $neededAt = $request->query('needed_at');
        if ($neededAt !== null && (! is_string($neededAt) || ! CarbonImmutable::canBeCreatedFromFormat($neededAt, 'Y-m-d\TH:i:s.u\Z')
            && ! CarbonImmutable::canBeCreatedFromFormat($neededAt, 'Y-m-d\TH:i:s\Z'))) {
            throw new ContractException(400, 'invalid_selector', 'Invalid needed_at selector.');
        }

        $lot = InventoryLot::where('chapter_id', $chapterId)
            ->where('id', $stockLotId)
            ->with(['variant', 'unit'])
            ->first();

        if (! $lot) {
            return response()->json([
                'error' => 'STOCK_LOT_NOT_FOUND',
                'message' => "Stock lot {$stockLotId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $isUsable = strtoupper($lot->condition) === 'USABLE' && strtoupper($lot->custody) === 'STOCKROOM';
        $blockers = [];
        if (! $isUsable) {
            $blockers[] = 'unsupported_condition';
        }

        $activeHolds = StockHold::where('chapter_id', $chapterId)
            ->where('status', 'active')
            ->whereHas('ranges', fn ($q) => $q->where('lot_id', $lot->id))
            ->with(['ranges' => fn ($q) => $q->where('lot_id', $lot->id)])
            ->get();

        $activeHoldIds = $activeHolds->pluck('id')->values()->all();
        $holdIntervals = [];
        foreach ($activeHolds as $hold) {
            foreach ($hold->ranges as $range) {
                $holdIntervals[] = [
                    'offset' => $range->offset_quantity,
                    'quantity' => $range->quantity,
                ];
            }
        }
        $blockedQty = BcMath::intervalUnionLength($holdIntervals);

        if (! empty($activeHoldIds)) {
            $blockers[] = 'active_stock_hold';
        }

        $restrictions = LotRestrictionAssignment::where('lot_id', $lot->id)
            ->get()
            ->map(fn ($r) => [
                'id' => $r->id,
                'policy_id' => $r->policy_id,
                'restriction_code' => $r->restriction_code,
                'assigned_at' => $r->assigned_at?->toIso8601ZuluString(),
            ])
            ->values()
            ->all();

        $scale = $lot->quantity_scale ?? 0;
        $quantity = $request->query('quantity');
        if ($quantity !== null && (! is_string($quantity) || ! preg_match('/^\d+(?:\.\d{1,6})?$/D', $quantity)
            || strlen(explode('.', $quantity, 2)[1] ?? '') > $scale || ! BcMath::isPositive($quantity))) {
            throw new ContractException(400, 'invalid_selector', 'Invalid stock quantity selector.');
        }
        $ranges = $this->stockViewService->loadLotRanges(collect([$lot]))[$lot->id];
        $at = CarbonImmutable::now('UTC');
        $availability = fn (?string $use) => $this->stockViewService->getLotAvailability(
            $lot, $at, $use,
            requestingUnitId: $request->query('requesting_unit_id'),
            eventId: $request->query('event_id'),
            neededAt: $neededAt === null ? null : CarbonImmutable::parse($neededAt, 'UTC'),
            ranges: $ranges,
        );
        $available = $availability($intendedUse);
        $canAllocate = fn (array $projection) => BcMath::isPositive($projection['eligible_free_quantity'])
            && ($quantity === null || BcMath::comp($projection['eligible_free_quantity'], $quantity) >= 0)
            && $request->query('unit_id', $lot->unit_id) === $lot->unit_id;
        if (BcMath::isPositive($available['ineligible_restricted_quantity']) || BcMath::isPositive($available['uninterpreted_restricted_quantity'])) {
            $blockers[] = 'lot_restricted';
        }

        return response()->json([
            'data' => [
                'stock_lot_id' => $lot->id,
                'chapter_id' => $chapterId,
                'stock_version' => $lot->stock_version,
                'lot_material_version' => $lot->material_version,
                'variant_material_version' => (int) ($lot->variant?->material_version ?? 1),
                'unit_material_version' => (int) ($lot->unit?->material_version ?? 1),
                'unit_id' => $lot->unit_id,
                'eligible' => $canAllocate($available),
                'intended_use' => $intendedUse,
                'internal_use_eligible' => $canAllocate($intendedUse === 'internal_use' ? $available : $availability('internal_use')),
                'sale_eligible' => $canAllocate($intendedUse === 'sale' ? $available : $availability('sale')),
                'restriction_state' => $available['restriction_state'],
                'eligible_free_quantity' => BcMath::format($available['eligible_free_quantity'], $scale),
                'ineligible_restricted_quantity' => BcMath::format($available['ineligible_restricted_quantity'], $scale),
                'uninterpreted_restricted_quantity' => BcMath::format($available['uninterpreted_restricted_quantity'], $scale),
                'free_intervals' => $available['free_intervals'],
                'active_hold_ids' => $activeHoldIds,
                'blocked_quantity' => BcMath::format($blockedQty, $lot->quantity_scale ?? 0),
                'restrictions' => $restrictions,
                'blockers' => array_values(array_unique($blockers)),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/stock/lots/{stock_lot_id}/history
     */
    public function listStockLotHistory(Request $request, string $chapterId, string $stockLotId): JsonResponse
    {
        $lot = InventoryLot::where('chapter_id', $chapterId)
            ->where('id', $stockLotId)
            ->first();

        if (! $lot) {
            return response()->json([
                'error' => 'STOCK_LOT_NOT_FOUND',
                'message' => "Stock lot {$stockLotId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $movements = InventoryMovement::where('chapter_id', $chapterId)
            ->where('variant_id', $lot->variant_id)
            ->where('unit_id', $lot->unit_id)
            ->where('location_id', $lot->location_id)
            ->where('condition', $lot->condition)
            ->orderBy('created_at', 'asc')
            ->get();

        return response()->json([
            'data' => $movements,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    protected function formatStockLot(InventoryLot $lot): array
    {
        $scale = $lot->quantity_scale ?? 0;
        $formattedQty = BcMath::format($lot->quantity_on_hand, $scale);

        return [
            'id' => $lot->id,
            'chapter_id' => $lot->chapter_id,
            'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
            'material_version' => $lot->material_version,
            'stock_version' => $lot->stock_version,
            'variant_id' => $lot->variant_id,
            'variant_material_version' => (int) ($lot->variant?->material_version ?? 1),
            'item_id' => $lot->variant?->item_id ?? $lot->variant_id,
            'unit_id' => $lot->unit_id,
            'unit_material_version' => (int) ($lot->unit?->material_version ?? 1),
            'quantity_scale' => $scale,
            'historical_variant_label' => $lot->historical_variant_label ?: ($lot->variant?->label ?? $lot->variant?->name ?? 'Variant Label'),
            'location_id' => $lot->location_id,
            'custodian_id' => $lot->custodian_user_id,
            'condition' => strtolower($lot->condition),
            'custody' => strtolower($lot->custody),
            'source' => [
                'type' => $lot->source_type ?? 'IPC',
                'id' => $lot->source_id,
                'reference' => $lot->source_reference ?? 'OPENING-BASELINE',
            ],
            'quantity' => $formattedQty,
            'original_quantity' => BcMath::format($lot->original_quantity ?? $lot->quantity_on_hand, $scale),
            'segments' => $lot->segments ?? [
                [
                    'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
                    'offset_quantity' => '0',
                    'quantity' => $formattedQty,
                ],
            ],
            'created_at' => $lot->created_at?->toIso8601String() ?? now()->toIso8601String(),
            'observed_at' => now()->toIso8601String(),
        ];
    }
}
