<?php

namespace App\Http\Controllers;

use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueOperation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\CatalogueVersionHistory;
use App\Models\Chapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CatalogueController extends Controller
{
    private function resolveChapterId(string $param): string
    {
        $chapter = Chapter::where('id', $param)->orWhere('code', $param)->first();
        return $chapter ? $chapter->id : $param;
    }

    private function getActorId(Request $request): string
    {
        return $request->header('X-User-Id') ?? session('user_id') ?? (string) Str::uuid();
    }

    private function formatUnit(CatalogueUnit $unit): array
    {
        return [
            'id' => $unit->id,
            'chapter_id' => $unit->chapter_id,
            'code' => $unit->code,
            'state' => $unit->state ?? 'active',
            'material_version' => (int) $unit->material_version,
            'created_at' => $unit->created_at->toIso8601ZuluString(),
            'updated_at' => $unit->updated_at->toIso8601ZuluString(),
            'name' => $unit->name,
            'quantity_kind' => $unit->quantity_kind,
            'quantity_scale' => (int) $unit->quantity_scale,
            'quantity_identity_locked' => (bool) $unit->quantity_identity_locked,
        ];
    }

    private function formatItem(CatalogueItem $item): array
    {
        return [
            'id' => $item->id,
            'chapter_id' => $item->chapter_id,
            'code' => $item->code,
            'state' => $item->state ?? 'active',
            'material_version' => (int) $item->material_version,
            'created_at' => $item->created_at->toIso8601ZuluString(),
            'updated_at' => $item->updated_at->toIso8601ZuluString(),
            'description' => $item->description ?? '',
            'unit_id' => $item->unit_id ?? (string) Str::uuid(),
            'settings' => $item->settings ?? [
                'price' => null,
                'rop' => null,
                'target_level' => null,
                'quantity_policy' => null,
                'blockers' => [],
            ],
        ];
    }

    private function formatVariant(CatalogueVariant $variant): array
    {
        return [
            'id' => $variant->id,
            'chapter_id' => $variant->chapter_id,
            'code' => $variant->code ?? $variant->sku ?? 'VAR-'.$variant->id,
            'state' => $variant->state ?? 'active',
            'material_version' => (int) $variant->material_version,
            'created_at' => $variant->created_at->toIso8601ZuluString(),
            'updated_at' => $variant->updated_at->toIso8601ZuluString(),
            'item_id' => $variant->item_id,
            'label' => $variant->label ?? $variant->name ?? '',
            'unit_id' => $variant->unit_id ?? (string) Str::uuid(),
            'quantity_scale' => (int) ($variant->quantity_scale ?? 0),
            'settings' => $variant->settings ?? [
                'price' => null,
                'rop' => null,
                'target_level' => null,
                'quantity_policy' => null,
                'blockers' => [],
            ],
            'quantity_identity_locked' => (bool) $variant->quantity_identity_locked,
        ];
    }

    private function formatLocation(CatalogueLocation $loc): array
    {
        return [
            'id' => $loc->id,
            'chapter_id' => $loc->chapter_id,
            'code' => $loc->code,
            'state' => $loc->state ?? 'active',
            'material_version' => (int) $loc->material_version,
            'created_at' => $loc->created_at->toIso8601ZuluString(),
            'updated_at' => $loc->updated_at->toIso8601ZuluString(),
            'name' => $loc->name,
            'kind' => in_array($loc->kind, ['stockroom', 'quarantine', 'booth']) ? $loc->kind : 'stockroom',
            'custodian_id' => $loc->custodian_id,
        ];
    }

    private function recordOperation(
        string $chapterId,
        string $actorId,
        string $operationName,
        string $actionKey,
        string $resourceId,
        string $resourceKind,
        int $materialVersion,
        array $snapshot
    ): string {
        $operationId = (string) Str::uuid();

        CatalogueOperation::create([
            'id' => $operationId,
            'chapter_id' => $chapterId,
            'operation_key' => $actionKey,
            'status' => 'committed',
            'result' => [
                'operation_id' => $operationId,
                'chapter_id' => $chapterId,
                'actor_id' => $actorId,
                'operation_id_name' => $operationName,
                'action_key' => $actionKey,
                'resource_id' => $resourceId,
                'resource_kind' => $resourceKind,
                'committed_material_version' => $materialVersion,
                'committed_at' => now()->toIso8601ZuluString(),
                'outcome' => 'committed',
            ],
        ]);

        CatalogueVersionHistory::create([
            'id' => (string) Str::uuid(),
            'entity_type' => $resourceKind,
            'entity_id' => $resourceId,
            'version' => $materialVersion,
            'snapshot' => $snapshot,
            'changed_by' => $actorId,
        ]);

        return $operationId;
    }

    // ================= UNITS =================

    public function listUnits(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $units = CatalogueUnit::where('chapter_id', $chapterId)->get();

        return response()->json([
            'data' => $units->map(fn ($u) => $this->formatUnit($u))->all(),
            'page' => ['next_cursor' => null],
        ]);
    }

    public function createUnit(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $code = $request->input('code');
        $name = $request->input('name');
        $kind = $request->input('quantity_kind');
        $scale = (int) $request->input('quantity_scale', 0);
        $reason = $request->input('reason');

        if (! $code || ! $name || ! $kind) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'code, name, and quantity_kind are required.']], 422);
        }

        if (in_array($kind, ['piece', 'kit']) && $scale !== 0) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'quantity_scale must be 0 for piece and kit.']], 422);
        }

        $existing = CatalogueUnit::where('chapter_id', $chapterId)->where('code', $code)->first();
        if ($existing) {
            return response()->json(['error' => ['code' => 'code_conflict', 'message' => "Unit code {$code} already exists."]], 409);
        }

        $unitId = (string) Str::uuid();
        $unit = CatalogueUnit::create([
            'id' => $unitId,
            'chapter_id' => $chapterId,
            'code' => $code,
            'name' => $name,
            'quantity_kind' => $kind,
            'quantity_scale' => $scale,
            'reason' => $reason,
            'quantity_identity_locked' => false,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatUnit($unit);
        $operationId = $this->recordOperation($chapterId, $actorId, 'createCatalogueUnit', $actionKey, $unitId, 'unit', 1, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ], 201);
    }

    public function readUnit(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $unit = CatalogueUnit::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $unit) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Unit not found.']], 404);
        }

        return response()->json(['data' => $this->formatUnit($unit)]);
    }

    public function replaceUnit(Request $request, string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $unit = CatalogueUnit::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $unit) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Unit not found.']], 404);
        }

        $expectedVersion = $request->input('expected_material_version');
        if ($expectedVersion !== null && (int) $expectedVersion !== (int) $unit->material_version) {
            return response()->json(['error' => ['code' => 'version_conflict', 'message' => 'expected_material_version does not match current version.']], 409);
        }

        $newKind = $request->input('quantity_kind', $unit->quantity_kind);
        $newScale = (int) $request->input('quantity_scale', $unit->quantity_scale);

        // Strict Immutability Guard: Reject updating kind or scale if locked
        if ($unit->quantity_identity_locked) {
            if ($newKind !== $unit->quantity_kind || $newScale !== (int) $unit->quantity_scale) {
                return response()->json([
                    'error' => [
                        'code' => 'quantity_identity_locked',
                        'message' => 'quantity_kind and quantity_scale are strictly immutable when quantity_identity_locked is true.',
                    ],
                ], 422);
            }
        }

        $newVersion = $unit->material_version + 1;
        $unit->update([
            'name' => $request->input('name', $unit->name),
            'quantity_kind' => $newKind,
            'quantity_scale' => $newScale,
            'state' => $request->input('state', $unit->state),
            'reason' => $request->input('reason', $unit->reason),
            'material_version' => $newVersion,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatUnit($unit);
        $operationId = $this->recordOperation($chapterId, $actorId, 'replaceCatalogueUnit', $actionKey, $unit->id, 'unit', $newVersion, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ]);
    }

    public function listUnitHistory(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $unit = CatalogueUnit::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $unit) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Unit not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'unit')
            ->where('entity_id', $unit->id)
            ->orderBy('version', 'desc')
            ->get();

        return response()->json([
            'data' => $history->map(fn ($h) => [
                'version' => (int) $h->version,
                'committed_at' => $h->created_at->toIso8601ZuluString(),
                'changed_by' => $h->changed_by,
                'snapshot' => is_array($h->snapshot) ? $h->snapshot : json_decode($h->snapshot, true),
            ])->all(),
        ]);
    }

    public function readUnitVersion(string $chapter_id, string $resource_id, int $material_version): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $unit = CatalogueUnit::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $unit) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Unit not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'unit')
            ->where('entity_id', $unit->id)
            ->where('version', $material_version)
            ->first();

        if (! $history) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => "Version {$material_version} not found."]], 404);
        }

        $snapshot = is_array($history->snapshot) ? $history->snapshot : json_decode($history->snapshot, true);

        return response()->json(['data' => $snapshot]);
    }

    // ================= ITEMS =================

    public function listItems(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $items = CatalogueItem::where('chapter_id', $chapterId)->get();

        return response()->json([
            'data' => $items->map(fn ($i) => $this->formatItem($i))->all(),
            'page' => ['next_cursor' => null],
        ]);
    }

    public function createItem(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $code = $request->input('code');
        $description = $request->input('description');
        $unitId = $request->input('unit_id');

        if (! $code || ! $description) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'code and description are required.']], 422);
        }

        // Direct pricing/rop in createItem is unexpected in stage 1 schema
        if ($request->has('price') || $request->has('rop')) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'unexpected_field']], 422);
        }

        $existing = CatalogueItem::where('chapter_id', $chapterId)->where('code', $code)->first();
        if ($existing) {
            return response()->json(['error' => ['code' => 'code_conflict', 'message' => "Item code {$code} already exists."]], 409);
        }

        $itemId = (string) Str::uuid();
        $item = CatalogueItem::create([
            'id' => $itemId,
            'chapter_id' => $chapterId,
            'code' => $code,
            'name' => $code,
            'description' => $description,
            'unit_id' => $unitId,
            'category' => $request->input('category', 'general'),
            'material_version' => 1,
            'state' => 'active',
            'is_active' => true,
            'settings' => [
                'price' => null,
                'rop' => null,
                'target_level' => null,
                'quantity_policy' => null,
                'blockers' => [
                    ['setting' => 'rop', 'subject_id' => $itemId, 'reason' => 'missing'],
                    ['setting' => 'target_level', 'subject_id' => $itemId, 'reason' => 'missing'],
                ],
            ],
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatItem($item);
        $operationId = $this->recordOperation($chapterId, $actorId, 'createCatalogueItem', $actionKey, $itemId, 'item', 1, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ], 201);
    }

    public function readItem(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $item = CatalogueItem::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $item) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Item not found.']], 404);
        }

        return response()->json(['data' => $this->formatItem($item)]);
    }

    public function replaceItem(Request $request, string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $item = CatalogueItem::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $item) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Item not found.']], 404);
        }

        $expectedVersion = $request->input('expected_material_version');
        if ($expectedVersion !== null && (int) $expectedVersion !== (int) $item->material_version) {
            return response()->json(['error' => ['code' => 'version_conflict', 'message' => 'Version mismatch.']], 409);
        }

        $newVersion = $item->material_version + 1;
        $item->update([
            'description' => $request->input('description', $item->description),
            'unit_id' => $request->input('unit_id', $item->unit_id),
            'state' => $request->input('state', $item->state),
            'material_version' => $newVersion,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatItem($item);
        $operationId = $this->recordOperation($chapterId, $actorId, 'replaceCatalogueItem', $actionKey, $item->id, 'item', $newVersion, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ]);
    }

    public function listItemHistory(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $item = CatalogueItem::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $item) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Item not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'item')
            ->where('entity_id', $item->id)
            ->orderBy('version', 'desc')
            ->get();

        return response()->json([
            'data' => $history->map(fn ($h) => [
                'version' => (int) $h->version,
                'committed_at' => $h->created_at->toIso8601ZuluString(),
                'changed_by' => $h->changed_by,
                'snapshot' => is_array($h->snapshot) ? $h->snapshot : json_decode($h->snapshot, true),
            ])->all(),
        ]);
    }

    public function readItemVersion(string $chapter_id, string $resource_id, int $material_version): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $item = CatalogueItem::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $item) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Item not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'item')
            ->where('entity_id', $item->id)
            ->where('version', $material_version)
            ->first();

        if (! $history) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Version not found.']], 404);
        }

        return response()->json(['data' => is_array($history->snapshot) ? $history->snapshot : json_decode($history->snapshot, true)]);
    }

    // ================= VARIANTS =================

    public function listVariants(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $variants = CatalogueVariant::where('chapter_id', $chapterId)->get();

        return response()->json([
            'data' => $variants->map(fn ($v) => $this->formatVariant($v))->all(),
            'page' => ['next_cursor' => null],
        ]);
    }

    public function createVariant(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $code = $request->input('code');
        $itemId = $request->input('item_id');
        $label = $request->input('label');
        $unitId = $request->input('unit_id');
        $scale = (int) $request->input('quantity_scale', 0);

        if (! $code || ! $itemId || ! $label) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'code, item_id, and label are required.']], 422);
        }

        if ($request->has('price')) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'unexpected_field']], 422);
        }

        $variantId = (string) Str::uuid();
        $variant = CatalogueVariant::create([
            'id' => $variantId,
            'chapter_id' => $chapterId,
            'item_id' => $itemId,
            'code' => $code,
            'sku' => $code,
            'name' => $label,
            'label' => $label,
            'unit_id' => $unitId,
            'quantity_scale' => $scale,
            'quantity_identity_locked' => false,
            'material_version' => 1,
            'state' => 'active',
            'is_active' => true,
            'settings' => [
                'price' => null,
                'rop' => null,
                'target_level' => null,
                'quantity_policy' => null,
                'blockers' => [],
            ],
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatVariant($variant);
        $operationId = $this->recordOperation($chapterId, $actorId, 'createCatalogueVariant', $actionKey, $variantId, 'variant', 1, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ], 201);
    }

    public function readVariant(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $variant = CatalogueVariant::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id)->orWhere('sku', $resource_id))
            ->first();

        if (! $variant) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Variant not found.']], 404);
        }

        return response()->json(['data' => $this->formatVariant($variant)]);
    }

    public function replaceVariant(Request $request, string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $variant = CatalogueVariant::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id)->orWhere('sku', $resource_id))
            ->first();

        if (! $variant) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Variant not found.']], 404);
        }

        $expectedVersion = $request->input('expected_material_version');
        if ($expectedVersion !== null && (int) $expectedVersion !== (int) $variant->material_version) {
            return response()->json(['error' => ['code' => 'version_conflict', 'message' => 'Version mismatch.']], 409);
        }

        $newVersion = $variant->material_version + 1;
        $variant->update([
            'label' => $request->input('label', $variant->label),
            'unit_id' => $request->input('unit_id', $variant->unit_id),
            'quantity_scale' => (int) $request->input('quantity_scale', $variant->quantity_scale),
            'state' => $request->input('state', $variant->state),
            'material_version' => $newVersion,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatVariant($variant);
        $operationId = $this->recordOperation($chapterId, $actorId, 'replaceCatalogueVariant', $actionKey, $variant->id, 'variant', $newVersion, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ]);
    }

    public function listVariantHistory(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $variant = CatalogueVariant::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id)->orWhere('sku', $resource_id))
            ->first();

        if (! $variant) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Variant not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'variant')
            ->where('entity_id', $variant->id)
            ->orderBy('version', 'desc')
            ->get();

        return response()->json([
            'data' => $history->map(fn ($h) => [
                'version' => (int) $h->version,
                'committed_at' => $h->created_at->toIso8601ZuluString(),
                'changed_by' => $h->changed_by,
                'snapshot' => is_array($h->snapshot) ? $h->snapshot : json_decode($h->snapshot, true),
            ])->all(),
        ]);
    }

    public function readVariantVersion(string $chapter_id, string $resource_id, int $material_version): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $variant = CatalogueVariant::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id)->orWhere('sku', $resource_id))
            ->first();

        if (! $variant) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Variant not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'variant')
            ->where('entity_id', $variant->id)
            ->where('version', $material_version)
            ->first();

        if (! $history) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Version not found.']], 404);
        }

        return response()->json(['data' => is_array($history->snapshot) ? $history->snapshot : json_decode($history->snapshot, true)]);
    }

    // ================= LOCATIONS =================

    public function listLocations(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $locations = CatalogueLocation::where('chapter_id', $chapterId)->get();

        return response()->json([
            'data' => $locations->map(fn ($l) => $this->formatLocation($l))->all(),
            'page' => ['next_cursor' => null],
        ]);
    }

    public function createLocation(Request $request, string $chapter_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $code = $request->input('code');
        $name = $request->input('name');
        $kind = $request->input('kind', 'stockroom');
        $custodianId = $request->input('custodian_id');

        if (! $code || ! $name) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'code and name are required.']], 422);
        }

        $locationId = (string) Str::uuid();
        $location = CatalogueLocation::create([
            'id' => $locationId,
            'chapter_id' => $chapterId,
            'code' => $code,
            'name' => $name,
            'kind' => $kind,
            'custodian_id' => $custodianId,
            'material_version' => 1,
            'state' => 'active',
            'is_active' => true,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatLocation($location);
        $operationId = $this->recordOperation($chapterId, $actorId, 'createCatalogueLocation', $actionKey, $locationId, 'location', 1, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ], 201);
    }

    public function readLocation(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $location = CatalogueLocation::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $location) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Location not found.']], 404);
        }

        return response()->json(['data' => $this->formatLocation($location)]);
    }

    public function replaceLocation(Request $request, string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $location = CatalogueLocation::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $location) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Location not found.']], 404);
        }

        $expectedVersion = $request->input('expected_material_version');
        if ($expectedVersion !== null && (int) $expectedVersion !== (int) $location->material_version) {
            return response()->json(['error' => ['code' => 'version_conflict', 'message' => 'Version mismatch.']], 409);
        }

        $newVersion = $location->material_version + 1;
        $location->update([
            'name' => $request->input('name', $location->name),
            'kind' => $request->input('kind', $location->kind),
            'custodian_id' => $request->input('custodian_id', $location->custodian_id),
            'state' => $request->input('state', $location->state),
            'material_version' => $newVersion,
        ]);

        $actorId = $this->getActorId($request);
        $actionKey = $request->header('X-Action-Key') ?? (string) Str::uuid();
        $formatted = $this->formatLocation($location);
        $operationId = $this->recordOperation($chapterId, $actorId, 'replaceCatalogueLocation', $actionKey, $location->id, 'location', $newVersion, $formatted);

        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'resource' => $formatted,
            ],
        ]);
    }

    public function listLocationHistory(string $chapter_id, string $resource_id): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $location = CatalogueLocation::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $location) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Location not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'location')
            ->where('entity_id', $location->id)
            ->orderBy('version', 'desc')
            ->get();

        return response()->json([
            'data' => $history->map(fn ($h) => [
                'version' => (int) $h->version,
                'committed_at' => $h->created_at->toIso8601ZuluString(),
                'changed_by' => $h->changed_by,
                'snapshot' => is_array($h->snapshot) ? $h->snapshot : json_decode($h->snapshot, true),
            ])->all(),
        ]);
    }

    public function readLocationVersion(string $chapter_id, string $resource_id, int $material_version): JsonResponse
    {
        $chapterId = $this->resolveChapterId($chapter_id);
        $location = CatalogueLocation::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('id', $resource_id)->orWhere('code', $resource_id))
            ->first();

        if (! $location) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Location not found.']], 404);
        }

        $history = CatalogueVersionHistory::where('entity_type', 'location')
            ->where('entity_id', $location->id)
            ->where('version', $material_version)
            ->first();

        if (! $history) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Version not found.']], 404);
        }

        return response()->json(['data' => is_array($history->snapshot) ? $history->snapshot : json_decode($history->snapshot, true)]);
    }

    // ================= OPERATIONS =================

    public function findOperationByKey(Request $request, string $chapter_id): JsonResponse
    {
        $actionKey = $request->query('action_key') ?? $request->query('operation_key');
        if (! $actionKey) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'action_key parameter is required.']], 422);
        }

        $operation = CatalogueOperation::where('operation_key', $actionKey)->first();
        if (! $operation) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Operation not found.']], 404);
        }

        $result = is_array($operation->result) ? $operation->result : json_decode($operation->result, true);

        return response()->json(['data' => $result]);
    }

    public function readOperation(string $chapter_id, string $operation_id): JsonResponse
    {
        $operation = CatalogueOperation::where('id', $operation_id)->orWhere('operation_key', $operation_id)->first();
        if (! $operation) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Operation not found.']], 404);
        }

        $result = is_array($operation->result) ? $operation->result : json_decode($operation->result, true);

        return response()->json(['data' => $result]);
    }
}
