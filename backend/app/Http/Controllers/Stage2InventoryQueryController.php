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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Serves the chapter-scoped Stage 2 allocation queue.
 */
final class Stage2InventoryQueryController extends Controller
{
    public function __construct(
        private readonly AllocationQueueQueryService $allocationQueueService,
        private readonly AllocationSnapshotPage $pagination,
    ) {}

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
