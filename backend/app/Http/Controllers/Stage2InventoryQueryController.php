<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Models\CatalogueItem;
use App\Models\CatalogueVariant;
use App\Models\InternalRf;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\AllocationQueueQueryService;
use App\Services\Inventory\AllocationSnapshotPage;
use App\Services\Inventory\Participants\ComputeNetShortageSnapshotParticipant;
use App\Services\Shared\BcMath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Stage2InventoryQueryController extends Controller
{
    public function __construct(
        private readonly AllocationQueueQueryService $allocationQueueService,
        private readonly AllocationSnapshotPage $pagination,
        private readonly ComputeNetShortageSnapshotParticipant $netShortage,
    ) {}

    public function listReplenishmentNeeds(Request $request, string $chapterId): JsonResponse
    {
        $selectors = $this->pagination->parseSelectors($request, [
            'limit', 'cursor', 'item_id', 'variant_id', 'trigger_filter', 'q',
        ]);
        $limit = $this->pagination->parseLimit($selectors['limit'] ?? null);
        $trigger = $selectors['trigger_filter'] ?? 'all';
        if (! in_array($trigger, ['all', 'rf_shortage', 'rop_breach', 'uncovered_only'], true)) {
            throw new ContractException(400, 'invalid_selector', 'Unsupported trigger_filter selector.');
        }
        $prefix = isset($selectors['q']) ? strtolower(trim($selectors['q'], ' ')) : null;
        if ($prefix !== null && (preg_match('/\S/u', $prefix) !== 1 || mb_strlen($prefix) > 80)) {
            throw new ContractException(400, 'invalid_selector', 'q must be 1 to 80 non-blank characters.');
        }

        $itemId = isset($selectors['item_id']) ? $this->pagination->requireUuidSelector($selectors['item_id'], 'item_id') : null;
        $variantId = isset($selectors['variant_id']) ? $this->pagination->requireUuidSelector($selectors['variant_id'], 'variant_id') : null;
        $variants = CatalogueVariant::where('chapter_id', $chapterId)
            ->when($itemId !== null, fn ($query) => $query->where('item_id', $itemId))
            ->when($variantId !== null, fn ($query) => $query->whereKey($variantId));
        if (($itemId !== null && ! CatalogueItem::where('chapter_id', $chapterId)->whereKey($itemId)->exists())
            || ($variantId !== null && ! (clone $variants)->exists())) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        $candidateIds = $variants->where('is_active', true)->with('item')->get()
            ->filter(fn (CatalogueVariant $variant) => $prefix === null
                || collect([$variant->item->code, $variant->item->name, $variant->code ?? $variant->sku, $variant->label ?: $variant->name])
                    ->contains(fn ($value) => str_starts_with(strtolower((string) $value), $prefix)))
            ->sort(fn (CatalogueVariant $a, CatalogueVariant $b) => [$a->item->code, $a->code ?? $a->sku, $a->id]
                <=> [$b->item->code, $b->code ?? $b->sku, $b->id])
            ->pluck('id');

        /** @var ChapterAuthority $authority */
        $authority = $request->attributes->get(ChapterAuthority::class);
        $actorId = (string) $request->user()->id;
        $observedAt = now('UTC')->format('Y-m-d\TH:i:s.u\Z');
        $snapshotVersion = max(1, (int) $authority->chapter->version);
        $items = [];
        if ($candidateIds->isNotEmpty()) {
            // Trigger filters and stale cursors depend on the whole candidate scope.
            $result = $this->netShortage->forVariants($authority, [
                'observed_at' => $observedAt,
                'variant_ids' => $candidateIds->all(),
                'include_rf_line_breakdown' => true,
                'require_rop_and_target_policies' => $trigger === 'rop_breach',
                'exclude_repf_id' => null,
            ]);

            if ($result['outcome'] === 'setup_blocked') {
                return response()->json([
                    'request_id' => (string) Str::uuid(),
                    'error' => [
                        'code' => 'setup_blocked',
                        'message' => 'Required replenishment policies are not effective.',
                        'blockers' => $result['blockers'],
                    ],
                ], 409, ['Cache-Control' => 'no-store']);
            }
            if ($result['outcome'] === 'rejected') {
                if ($result['code'] === 'resource_not_found') {
                    throw new ContractException(404, 'resource_not_found', $result['message']);
                }
                throw new ContractException(503, 'unavailable', 'Replenishment snapshot is unavailable.');
            }

            $snapshotVersion = $result['snapshot_version'];
            $items = array_values(array_filter($result['items'], fn (array $item) => match ($trigger) {
                'rf_shortage' => BcMath::isPositive($item['unreserved_approved_rf_shortage']),
                'rop_breach' => $item['low_stock_breach'],
                'uncovered_only' => BcMath::isPositive($item['proposed_uncovered_quantity']),
                default => true,
            }));
        }

        $page = $this->pagination->paginate(
            $items, $selectors['cursor'] ?? null, $limit, 'replenishment_needs', $actorId, $chapterId,
            $authority->version, $snapshotVersion, [$itemId, $variantId, $trigger, $prefix],
            array_map(fn (array $item) => array_diff_key($item, ['observed_at' => true]), $items),
        );

        return response()->json([
            'data' => $page['entries'],
            'page' => ['next_cursor' => $page['next_cursor'], 'snapshot_version' => $snapshotVersion],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function listAllocationQueue(Request $request, string $chapterId): JsonResponse
    {
        $selectors = $this->pagination->parseSelectors($request, [
            'limit',
            'cursor',
            'item_id',
            'variant_id',
            'rf_id',
            'requesting_unit_id',
            'eligible_only',
        ]);

        $limit = $this->pagination->parseLimit($selectors['limit'] ?? null);
        $eligibleOnly = false;
        if (isset($selectors['eligible_only'])) {
            if (! in_array($selectors['eligible_only'], ['true', 'false'], true)) {
                throw new ContractException(400, 'invalid_selector', 'eligible_only must be true or false.');
            }
            $eligibleOnly = $selectors['eligible_only'] === 'true';
        }

        $itemId = isset($selectors['item_id']) ? $this->pagination->requireUuidSelector($selectors['item_id'], 'item_id') : null;
        $variantId = isset($selectors['variant_id']) ? $this->pagination->requireUuidSelector($selectors['variant_id'], 'variant_id') : null;
        $rfId = isset($selectors['rf_id']) ? $this->pagination->requireUuidSelector($selectors['rf_id'], 'rf_id') : null;
        $unitId = isset($selectors['requesting_unit_id'])
            ? $this->pagination->requireUuidSelector($selectors['requesting_unit_id'], 'requesting_unit_id')
            : null;

        /** @var ChapterAuthority $authority */
        $authority = $request->attributes->get(ChapterAuthority::class);
        $userId = (string) $request->user()->id;

        return DB::transaction(function () use (
            $authority,
            $chapterId,
            $userId,
            $selectors,
            $limit,
            $eligibleOnly,
            $itemId,
            $variantId,
            $rfId,
            $unitId
        ): JsonResponse {
            if ($itemId !== null && ! CatalogueItem::where('chapter_id', $chapterId)->where('id', $itemId)->sharedLock()->exists()) {
                throw new ContractException(404, 'resource_not_found', "Catalogue item {$itemId} was not found.");
            }
            if ($variantId !== null && ! CatalogueVariant::where('chapter_id', $chapterId)->where('id', $variantId)->sharedLock()->exists()) {
                throw new ContractException(404, 'resource_not_found', "Catalogue variant {$variantId} was not found.");
            }
            if ($rfId !== null) {
                $filterRf = InternalRf::where('chapter_id', $chapterId)
                    ->where('id', $rfId)
                    ->sharedLock()
                    ->first();
                if (! $filterRf || ! $this->allocationQueueService->canCallerViewRf($authority, $filterRf)) {
                    throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} was not found.");
                }
            }

            if ($unitId !== null && ! $this->hasRequestingUnit($authority, $unitId)) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }

            try {
                $filters = [
                    'item_id' => $itemId,
                    'variant_id' => $variantId,
                    'rf_id' => $rfId,
                    'requesting_unit_id' => $unitId,
                    'eligible_only' => $eligibleOnly,
                ];
                $queue = $this->allocationQueueService->buildQueue($authority, $filters);
            } catch (ContractException $e) {
                if ($e->errorCode === 'setup_blocked') {
                    return response()->json([
                        'request_id' => (string) Str::uuid(),
                        'error' => [
                            'code' => 'setup_blocked',
                            'message' => $e->getMessage(),
                            'blockers' => $e->extra['blockers'] ?? [],
                        ],
                    ], 409, ['Cache-Control' => 'no-store']);
                }

                throw $e;
            }

            $page = $this->pagination->paginate(
                $queue['entries'], $selectors['cursor'] ?? null, $limit, 'allocation_queue', $userId,
                $chapterId, $authority->version, $queue['snapshot_version'], $filters, array_diff_key($queue, ['observed_at' => true]),
            );

            return response()->json([
                'data' => $page['entries'],
                'allocation_policy' => $queue['allocation_policy'],
                'observed_at' => $queue['observed_at'],
                'is_commit_authorization' => false,
                'page' => [
                    'next_cursor' => $page['next_cursor'],
                    'snapshot_version' => $queue['snapshot_version'],
                ],
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    private function hasRequestingUnit(ChapterAuthority $authority, string $unitId): bool
    {
        $chapter = $authority->chapter;

        return InternalRf::where('chapter_id', $chapter->id)->where('requesting_unit_id', $unitId)->exists()
            || $chapter->policyRecords()->where('policy_code', 'rf_approval_route')->get()
                ->contains(fn ($policy) => collect($policy->rules_json['routes'] ?? [])->contains('requesting_unit_id', $unitId));
    }
}
