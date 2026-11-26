<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\InventoryCustody\CatalogService;
use App\Modules\InventoryCustody\ChapterInventoryAuthority;
use App\Modules\InventoryCustody\EligibilityQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Chapter-scoped InventoryCustody HTTP boundary for P05 (Catalog and Eligibility).
 * Stock-hold mutations execute strictly as internal InventoryLedgerParticipant operations.
 */
final class InventoryController
{
    public function __construct(
        private ChapterInventoryAuthority $auth,
        private CatalogService $catalog,
        private EligibilityQueryService $eligibility,
        private ChapterOutcomes $outcomes,
    ) {}

    public function lookupByKey(Request $r, string $chapterId): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapterId), fn (array $a): array => $this->outcomes->lookupByKey($r, $a['chapter_id']));
    }

    public function lookupById(Request $r, string $chapterId, string $operationId): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapterId), fn (array $a): array => $this->outcomes->lookupById($r, $a['chapter_id'], $operationId));
    }

    public function listCatalog(Request $r, string $chapterId): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapterId), fn (array $a): array => ['http_status' => 200, 'body' => $this->catalog->listCatalog($a['chapter_id'])]);
    }

    public function createUnit(Request $r, string $chapterId): JsonResponse
    {
        return $this->mut($r, $this->auth->authorizeInventoryWrite($r, $chapterId),
            fn (array $a, array $in, string $k): array => $this->catalog->createUnit($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function updateUnit(Request $r, string $chapterId, string $unitId): JsonResponse
    {
        return $this->idMut($r, $this->auth->authorizeInventoryWrite($r, $chapterId), $unitId, 'UNIT_NOT_FOUND',
            fn (array $a, int $id, array $in, string $k): array => $this->catalog->updateUnit($a['chapter_id'], $a['actor'], $id, $k, $in));
    }

    public function createItem(Request $r, string $chapterId): JsonResponse
    {
        return $this->mut($r, $this->auth->authorizeInventoryWrite($r, $chapterId),
            fn (array $a, array $in, string $k): array => $this->catalog->createItem($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function createVariant(Request $r, string $chapterId, string $itemId): JsonResponse
    {
        return $this->idMut($r, $this->auth->authorizeInventoryWrite($r, $chapterId), $itemId, 'ITEM_NOT_FOUND',
            fn (array $a, int $id, array $in, string $k): array => $this->catalog->createVariant($a['chapter_id'], $a['actor'], $id, $k, $in));
    }

    public function createLocation(Request $r, string $chapterId): JsonResponse
    {
        return $this->mut($r, $this->auth->authorizeInventoryWrite($r, $chapterId),
            fn (array $a, array $in, string $k): array => $this->catalog->createLocation($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function assignCustody(Request $r, string $chapterId): JsonResponse
    {
        return $this->mut($r, $this->auth->authorizeInventoryWrite($r, $chapterId),
            fn (array $a, array $in, string $k): array => $this->catalog->assignCustody($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function createItemPolicyDraft(Request $r, string $chapterId, string $itemId): JsonResponse
    {
        return $this->idMut($r, $this->auth->authorizeInventoryWrite($r, $chapterId), $itemId, 'ITEM_NOT_FOUND',
            fn (array $a, int $id, array $in, string $k): array => $this->catalog->createItemPolicyDraft($a['chapter_id'], $a['actor'], $id, $k, $in));
    }

    public function approveItemPolicyVersion(Request $r, string $chapterId, string $policyVersionId): JsonResponse
    {
        return $this->idMut($r, $this->auth->authorizePolicyApproval($r, $chapterId), $policyVersionId, 'POLICY_VERSION_NOT_FOUND',
            fn (array $a, int $id, array $in, string $k): array => $this->catalog->approveItemPolicyVersion($a['chapter_id'], $a['actor'], $id, $k, $in));
    }

    public function createRestriction(Request $r, string $chapterId): JsonResponse
    {
        return $this->mut($r, $this->auth->authorizeInventoryWrite($r, $chapterId),
            fn (array $a, array $in, string $k): array => $this->catalog->createRestriction($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function queryEligibility(Request $r, string $chapterId, string $itemVariantId): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapterId), fn (array $a): array => preg_match('/^[1-9][0-9]{0,18}$/', $itemVariantId) === 1
            ? $this->eligibility->query($a['chapter_id'], (int) $itemVariantId, [
                'stock_location_id' => $r->query('stock_location_id'), 'event_id' => $r->query('event_id'),
                'requesting_unit_id' => $r->query('requesting_unit_id'), 'priority_category_id' => $r->query('priority_category_id'),
                'requested_qty' => $r->query('requested_qty', '0'), 'as_of' => $r->query('as_of'),
            ])
            : $this->outcomes->blocked($a['chapter_id'], 404, 'VARIANT_NOT_FOUND', 'Item variant not found.'));
    }

    /** @param array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} $auth */
    private function run(array $auth, callable $fn): JsonResponse
    {
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $res = $fn($auth);

        return response()->json($res['body'], $res['http_status']);
    }

    /** @param array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} $auth */
    private function mut(Request $r, array $auth, callable $fn): JsonResponse
    {
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $d = $this->outcomes->decodeMutation($r, $auth['chapter_id']);

        return $d instanceof JsonResponse ? $d : $this->run($auth, fn (array $a): array => $fn($a, $d['input'], $d['key']));
    }

    /** @param array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} $auth */
    private function idMut(Request $r, array $auth, string $rawId, string $notFoundCode, callable $fn): JsonResponse
    {
        if (! $auth['ok']) {
            return $auth['response'];
        }
        if (preg_match('/^[1-9][0-9]{0,18}$/', $rawId) !== 1) {
            $err = $this->outcomes->blocked($auth['chapter_id'], 404, $notFoundCode, 'Requested catalog record not found.');

            return response()->json($err['body'], $err['http_status']);
        }

        return $this->mut($r, $auth, fn (array $a, array $in, string $k): array => $fn($a, (int) $rawId, $in, $k));
    }
}
