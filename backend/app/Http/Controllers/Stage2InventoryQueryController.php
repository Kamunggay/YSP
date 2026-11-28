<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\CatalogueItem;
use App\Models\CatalogueVariant;
use App\Models\InternalRf;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\AllocationQueueQueryService;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Shared\BcMath;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Serves Stage 2A read-only Replenishment Needs (`listReplenishmentNeeds`)
 * and Allocation Queue (`listAllocationQueue`) endpoints strictly adhering
 * to contracts/stage2/openapi.yaml.
 */
final class Stage2InventoryQueryController extends Controller
{
    private const TRIGGER_FILTERS = ['all', 'rf_shortage', 'rop_breach', 'uncovered_only'];

    public function __construct(
        private readonly NetShortageSnapshotParticipant $netShortageParticipant,
        private readonly AllocationQueueQueryService $allocationQueueService,
    ) {}

    public function listReplenishmentNeeds(Request $request, string $chapterId): JsonResponse
    {
        $selectors = $this->parseSelectors($request, [
            'limit',
            'cursor',
            'item_id',
            'variant_id',
            'trigger_filter',
            'q',
        ]);

        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $triggerFilter = $selectors['trigger_filter'] ?? 'all';
        if (! in_array($triggerFilter, self::TRIGGER_FILTERS, true)) {
            throw new ContractException(400, 'invalid_selector', 'Unsupported trigger_filter selector.');
        }

        $qPrefix = isset($selectors['q']) ? $this->parsePrefixSearch($selectors['q']) : null;
        $itemId = isset($selectors['item_id']) ? $this->requireUuidSelector($selectors['item_id'], 'item_id') : null;
        $variantId = isset($selectors['variant_id']) ? $this->requireUuidSelector($selectors['variant_id'], 'variant_id') : null;

        /** @var ChapterAuthority $authority */
        $authority = $request->attributes->get(ChapterAuthority::class);
        $userId = (string) $request->user()->id;

        return DB::transaction(function () use (
            $authority,
            $chapterId,
            $userId,
            $selectors,
            $limit,
            $triggerFilter,
            $qPrefix,
            $itemId,
            $variantId
        ): JsonResponse {
            if ($itemId !== null) {
                $exists = CatalogueItem::where('chapter_id', $chapterId)
                    ->where('id', $itemId)
                    ->sharedLock()
                    ->exists();
                if (! $exists) {
                    throw new ContractException(404, 'resource_not_found', "Catalogue item {$itemId} was not found.");
                }
            }

            if ($variantId !== null) {
                $variantQuery = CatalogueVariant::where('chapter_id', $chapterId)
                    ->where('id', $variantId);
                if ($itemId !== null) {
                    $variantQuery->where('item_id', $itemId);
                }
                if (! $variantQuery->sharedLock()->exists()) {
                    throw new ContractException(404, 'resource_not_found', "Catalogue variant {$variantId} was not found.");
                }
            }

            $variantRows = CatalogueVariant::where('chapter_id', $chapterId)
                ->where('is_active', true)
                ->when($itemId !== null, fn ($q) => $q->where('item_id', $itemId))
                ->when($variantId !== null, fn ($q) => $q->where('id', $variantId))
                ->with('item')
                ->sharedLock()
                ->get()
                ->filter(function (CatalogueVariant $v) use ($qPrefix): bool {
                    if ($qPrefix === null) {
                        return true;
                    }
                    $prefix = mb_strtolower($qPrefix);
                    $itemCode = mb_strtolower((string) ($v->item?->code ?? ''));
                    $itemName = mb_strtolower((string) ($v->item?->name ?? ''));
                    $varCode = mb_strtolower((string) ($v->code ?? $v->sku ?? ''));
                    $varLabel = mb_strtolower((string) ($v->label ?: $v->name ?: ''));

                    return str_starts_with($itemCode, $prefix)
                        || str_starts_with($itemName, $prefix)
                        || str_starts_with($varCode, $prefix)
                        || str_starts_with($varLabel, $prefix);
                })
                ->sort(fn (CatalogueVariant $a, CatalogueVariant $b): int => [
                    (string) ($a->item?->code ?? ''),
                    (string) ($a->code ?? $a->sku ?? ''),
                    $a->id,
                ] <=> [
                    (string) ($b->item?->code ?? ''),
                    (string) ($b->code ?? $b->sku ?? ''),
                    $b->id,
                ])
                ->values();

            $allItems = [];
            $snapshotVersion = max(1, (int) $authority->chapter->version);
            $observedAt = now('UTC')->format('Y-m-d\TH:i:s.u\Z');

            if ($variantRows->isNotEmpty()) {
                // Evaluate candidate active variants in 100-variant chunks per computeNetShortageSnapshot bound
                $chunks = $variantRows->pluck('id')->chunk(100);
                foreach ($chunks as $chunk) {
                    $result = $this->netShortageParticipant->computeNetShortageSnapshot([
                        'chapter_id' => $chapterId,
                        'actor_id' => $userId,
                        'observed_at' => $observedAt,
                        'variant_ids' => $chunk->values()->all(),
                        'include_rf_line_breakdown' => true,
                        'require_rop_and_target_policies' => $triggerFilter === 'rop_breach',
                        'exclude_repf_id' => null,
                    ]);

                    if ($result['outcome'] === 'setup_blocked') {
                        return response()->json([
                            'request_id' => (string) Str::uuid(),
                            'error' => [
                                'code' => 'setup_blocked',
                                'message' => 'Required ROP and target stock level policies are not effective for the requested item.',
                                'blockers' => $result['blockers'],
                            ],
                        ], 409, ['Cache-Control' => 'no-store']);
                    }
                    if ($result['outcome'] === 'rejected') {
                        $status = match ($result['code']) {
                            'chapter_not_found', 'resource_not_found' => 404,
                            'unit_mismatch' => 409,
                            default => 503,
                        };
                        throw new ContractException($status, $result['code'], $result['message']);
                    }

                    $snapshotVersion = max($snapshotVersion, (int) $result['snapshot_version']);
                    foreach ($result['items'] as $item) {
                        if ($this->matchesTriggerFilter($item, $triggerFilter)) {
                            $allItems[] = $item;
                        }
                    }
                }
            }

            $normalizedFilters = [
                'item_id' => $itemId,
                'variant_id' => $variantId,
                'trigger_filter' => $triggerFilter,
                'q' => $qPrefix,
            ];

            $snapshotHash = hash('sha256', json_encode(
                array_map(fn ($i) => [
                    $i['variant_id'],
                    $i['usable_stockroom_on_hand'],
                    $i['proposed_uncovered_quantity'],
                ], $allItems),
                JSON_THROW_ON_ERROR
            ));

            [$offset, $expiresAt] = $this->resolveCursor(
                $selectors['cursor'] ?? null,
                'replenishment_needs',
                $userId,
                $chapterId,
                $limit,
                $normalizedFilters,
                $snapshotVersion,
                $snapshotHash
            );

            $slice = array_slice($allItems, $offset, $limit);
            $nextCursor = ($offset + $limit < count($allItems))
                ? $this->encodeCursor(
                    'replenishment_needs',
                    $userId,
                    $chapterId,
                    $limit,
                    $normalizedFilters,
                    $snapshotVersion,
                    $snapshotHash,
                    $offset + $limit,
                    $expiresAt
                )
                : null;

            return response()->json([
                'data' => $slice,
                'page' => [
                    'next_cursor' => $nextCursor,
                    'snapshot_version' => $snapshotVersion,
                ],
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    public function listAllocationQueue(Request $request, string $chapterId): JsonResponse
    {
        $selectors = $this->parseSelectors($request, [
            'limit',
            'cursor',
            'item_id',
            'variant_id',
            'rf_id',
            'requesting_unit_id',
            'eligible_only',
        ]);

        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $eligibleOnly = false;
        if (isset($selectors['eligible_only'])) {
            if (! in_array($selectors['eligible_only'], ['true', 'false'], true)) {
                throw new ContractException(400, 'invalid_selector', 'eligible_only must be true or false.');
            }
            $eligibleOnly = $selectors['eligible_only'] === 'true';
        }

        $itemId = isset($selectors['item_id']) ? $this->requireUuidSelector($selectors['item_id'], 'item_id') : null;
        $variantId = isset($selectors['variant_id']) ? $this->requireUuidSelector($selectors['variant_id'], 'variant_id') : null;
        $rfId = isset($selectors['rf_id']) ? $this->requireUuidSelector($selectors['rf_id'], 'rf_id') : null;
        $unitId = isset($selectors['requesting_unit_id'])
            ? $this->requireUuidSelector($selectors['requesting_unit_id'], 'requesting_unit_id')
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
            if ($rfId !== null && ! InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->sharedLock()->exists()) {
                throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} was not found.");
            }

            try {
                $queue = $this->allocationQueueService->buildQueue($authority, [
                    'item_id' => $itemId,
                    'variant_id' => $variantId,
                    'rf_id' => $rfId,
                    'requesting_unit_id' => $unitId,
                    'eligible_only' => $eligibleOnly,
                ]);
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

            $entries = $queue['entries'];
            $snapshotVersion = $queue['snapshot_version'];
            $normalizedFilters = [
                'item_id' => $itemId,
                'variant_id' => $variantId,
                'rf_id' => $rfId,
                'requesting_unit_id' => $unitId,
                'eligible_only' => $eligibleOnly,
            ];
            $snapshotHash = hash('sha256', json_encode(
                array_map(fn ($e) => [$e['rf_line_id'], $e['unreserved_outstanding_quantity'], $e['eligible_available_quantity']], $entries),
                JSON_THROW_ON_ERROR
            ));

            [$offset, $expiresAt] = $this->resolveCursor(
                $selectors['cursor'] ?? null,
                'allocation_queue',
                $userId,
                $chapterId,
                $limit,
                $normalizedFilters,
                $snapshotVersion,
                $snapshotHash
            );

            $slice = array_slice($entries, $offset, $limit);
            $nextCursor = ($offset + $limit < count($entries))
                ? $this->encodeCursor(
                    'allocation_queue',
                    $userId,
                    $chapterId,
                    $limit,
                    $normalizedFilters,
                    $snapshotVersion,
                    $snapshotHash,
                    $offset + $limit,
                    $expiresAt
                )
                : null;

            return response()->json([
                'data' => $slice,
                'allocation_policy' => $queue['allocation_policy'],
                'observed_at' => $queue['observed_at'],
                'is_commit_authorization' => false,
                'page' => [
                    'next_cursor' => $nextCursor,
                    'snapshot_version' => $snapshotVersion,
                ],
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /** @param array<string, mixed> $item */
    private function matchesTriggerFilter(array $item, string $triggerFilter): bool
    {
        return match ($triggerFilter) {
            'rf_shortage' => BcMath::isPositive((string) $item['unreserved_approved_rf_shortage']),
            'rop_breach' => (bool) $item['low_stock_breach'],
            'uncovered_only' => BcMath::isPositive((string) $item['proposed_uncovered_quantity']),
            default => true,
        };
    }

    /** @return array<string, string> */
    private function parseSelectors(Request $request, array $allowed): array
    {
        $content = $request->getContent();
        if ($content !== '' && $content !== '[]') {
            throw new ContractException(400, 'invalid_selector', 'GET requests must not include a request body.');
        }

        $query = (string) $request->server('QUERY_STRING', '');
        $selectors = [];
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($key);
            if (! in_array($key, $allowed, true) || isset($selectors[$key]) || $value === '') {
                throw new ContractException(400, 'invalid_selector', 'Unsupported or duplicate query selector.');
            }
            $decoded = urldecode($value);
            if ($key === 'cursor' && strlen($decoded) > 1024) {
                throw new ContractException(400, 'invalid_selector', 'Cursor selector exceeds maximum length.');
            }
            $selectors[$key] = $decoded;
        }

        return $selectors;
    }

    private function parseLimit(?string $raw): int
    {
        if ($raw === null) {
            return 25;
        }
        $limit = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        if ($limit === false) {
            throw new ContractException(400, 'invalid_selector', 'limit must be an integer between 1 and 100.');
        }

        return $limit;
    }

    private function parsePrefixSearch(string $raw): string
    {
        $trimmed = trim($raw, " \t\n\r\0\x0B");
        $len = mb_strlen($trimmed);
        if ($len < 1 || $len > 80) {
            throw new ContractException(400, 'invalid_selector', 'q must be 1 to 80 non-blank characters.');
        }

        return $trimmed;
    }

    private function requireUuidSelector(string $value, string $name): string
    {
        if (preg_match(AuthInput::UUID, $value) !== 1) {
            throw new ContractException(400, 'invalid_selector', "{$name} must be a valid UUID.");
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: int, 1: int}
     */
    private function resolveCursor(
        ?string $rawCursor,
        string $kind,
        string $userId,
        string $chapterId,
        int $limit,
        array $filters,
        int $snapshotVersion,
        string $snapshotHash
    ): array {
        if ($rawCursor === null) {
            return [0, now()->addMinutes(5)->timestamp];
        }

        try {
            $cursor = json_decode(Crypt::decryptString($rawCursor), true, flags: JSON_THROW_ON_ERROR);
        } catch (DecryptException|\JsonException) {
            throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
        }

        if (! is_array($cursor)
            || ($cursor['kind'] ?? null) !== $kind
            || ($cursor['user'] ?? null) !== $userId
            || ($cursor['chapter'] ?? null) !== $chapterId
            || ($cursor['limit'] ?? null) !== $limit
            || ($cursor['filters'] ?? null) !== $filters
            || ! is_int($cursor['offset'] ?? null)
            || ($cursor['offset'] ?? -1) < 0) {
            throw new ContractException(400, 'invalid_selector', 'Pagination cursor does not match request parameters.');
        }

        if (($cursor['expires'] ?? 0) <= now()->timestamp
            || ($cursor['snapshot_version'] ?? null) !== $snapshotVersion
            || ($cursor['snapshot_hash'] ?? null) !== $snapshotHash) {
            throw new ContractException(409, 'snapshot_stale', 'Live inventory snapshot has changed; restart pagination from page 1.');
        }

        return [(int) $cursor['offset'], (int) $cursor['expires']];
    }

    /** @param array<string, mixed> $filters */
    private function encodeCursor(
        string $kind,
        string $userId,
        string $chapterId,
        int $limit,
        array $filters,
        int $snapshotVersion,
        string $snapshotHash,
        int $nextOffset,
        int $expiresAt
    ): string {
        return Crypt::encryptString(json_encode([
            'kind' => $kind,
            'user' => $userId,
            'chapter' => $chapterId,
            'limit' => $limit,
            'filters' => $filters,
            'snapshot_version' => $snapshotVersion,
            'snapshot_hash' => $snapshotHash,
            'offset' => $nextOffset,
            'expires' => $expiresAt,
        ], JSON_THROW_ON_ERROR));
    }
}
