<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Chapter-scoped inventory catalog, units, locations, custody assignments, GOV-05 item policies, and restrictions.
 */
final class CatalogService
{
    private const array ITEM_KINDS = ['consumable', 'returnable', 'kit', 'saleable'];

    private const array LOCATION_KINDS = ['warehouse', 'booth', 'field_kit', 'quarantine', 'transit'];

    public function __construct(private ChapterOutcomes $outcomes) {}

    /** @return array<string, mixed> */
    public function listCatalog(int $chapterId): array
    {
        $units = DB::table('units')->where('chapter_id', $chapterId)->orderBy('id')->get()
            ->map(fn ($r) => ['id' => (string) $r->id, 'code' => (string) $r->code, 'name' => (string) $r->name, 'quantity_scale' => (int) $r->quantity_scale, 'row_version' => (int) $r->row_version, 'active' => (bool) $r->active])
            ->values()->all();
        $scales = array_column($units, 'quantity_scale', 'id');
        $policies = DB::table('item_policy_versions')->where('chapter_id', $chapterId)->where('status', 'approved')->orderByDesc('version_number')->get()->keyBy('item_id');
        $guards = DB::table('item_variant_guards')->where('chapter_id', $chapterId)->pluck('guard_version', 'item_variant_id');

        $items = DB::table('items')->where('chapter_id', $chapterId)->orderBy('id')->get()->map(function ($r) use ($scales, $policies): array {
            $pol = $policies->get($r->id);

            return [
                'id' => (string) $r->id, 'sku' => (string) $r->sku, 'name' => (string) $r->name,
                'description' => $r->description !== null ? (string) $r->description : null,
                'item_kind' => (string) $r->item_kind, 'base_unit_id' => (string) $r->base_unit_id,
                'reorder_point' => QuantityMath::toUnitQuantity(QuantityMath::dbToMicroString((string) $r->reorder_point), (int) ($scales[(string) $r->base_unit_id] ?? 0)),
                'row_version' => (int) $r->row_version, 'active' => (bool) $r->active,
                'approved_policy' => $pol ? ['id' => (string) $pol->id, 'version_number' => (int) $pol->version_number,
                    'is_eligibility_approved' => (bool) $pol->is_eligibility_approved, 'requires_condition_check' => (bool) $pol->requires_condition_check,
                    'max_hold_hours' => $pol->max_hold_hours !== null ? (int) $pol->max_hold_hours : null] : null,
            ];
        })->values()->all();

        $variants = DB::table('item_variants')->where('chapter_id', $chapterId)->orderBy('id')->get()->map(fn ($r) => [
            'id' => (string) $r->id, 'item_id' => (string) $r->item_id, 'variant_code' => (string) $r->variant_code, 'name' => (string) $r->name,
            'attributes' => $r->attributes_json !== null ? json_decode((string) $r->attributes_json, true, flags: JSON_THROW_ON_ERROR) : null,
            'row_version' => (int) $r->row_version, 'active' => (bool) $r->active, 'guard_version' => (int) ($guards->get($r->id) ?? 1),
        ])->values()->all();

        $locations = DB::table('stock_locations')->where('chapter_id', $chapterId)->orderBy('id')->get()->map(fn ($r) => [
            'id' => (string) $r->id, 'code' => (string) $r->code, 'name' => (string) $r->name,
            'location_kind' => (string) $r->location_kind, 'row_version' => (int) $r->row_version, 'active' => (bool) $r->active,
        ])->values()->all();

        $conditions = DB::table('stock_conditions')->orderBy('sort_order')->get()->map(fn ($r) => [
            'id' => (string) $r->id, 'code' => (string) $r->code, 'name' => (string) $r->name,
            'is_usable_for_issue' => (bool) $r->is_usable_for_issue, 'is_restricted_condition' => (bool) $r->is_restricted_condition,
        ])->values()->all();

        return ['chapter_id' => (string) $chapterId, 'units' => $units, 'items' => $items, 'variants' => $variants, 'locations' => $locations, 'conditions' => $conditions];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createUnit(int $chapterId, array $actor, string $key, array $in): array
    {
        [$code, $name, $scale] = [trim((string) ($in['code'] ?? '')), trim((string) ($in['name'] ?? '')), $in['quantity_scale'] ?? null];
        if ($code === '' || strlen($code) > 32 || $name === '' || strlen($name) > 120 || ! is_int($scale) || $scale < 0 || $scale > 6) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check unit code, name, and integer quantity_scale (0..6).');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.units.create', 'CreateUnit@v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $code, $name, $scale, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.units.create', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $active = (bool) ($in['active'] ?? true);
            try {
                $id = DB::table('units')->insertGetId(['chapter_id' => $chapterId, 'code' => $code, 'name' => $name, 'quantity_scale' => $scale, 'row_version' => 1, 'active' => $active, 'created_at' => $now, 'updated_at' => $now]);
            } catch (QueryException) {
                return $this->outcomes->blocked($chapterId, 409, 'DUPLICATE_UNIT_CODE', 'A unit with this code already exists in the chapter.');
            }
            $rec = ChapterOutcomes::recordState((string) $id, 'UNIT', 1, 1, ['active' => $active ? 'active' : 'inactive']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.units.create', $key, $hash, 'CreateUnit@v1', $rec,
                ['unit' => ['id' => (string) $id, 'chapter_id' => (string) $chapterId, 'code' => $code, 'name' => $name, 'quantity_scale' => $scale, 'row_version' => 1, 'active' => $active]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function updateUnit(int $chapterId, array $actor, int $unitId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.units.update', 'UpdateUnit@v1', ['unit_id' => $unitId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $unitId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.units.update', $key, $hash)) !== null) {
                return $r;
            }
            $cur = DB::table('units')->where('chapter_id', $chapterId)->where('id', $unitId)->lockForUpdate()->first();
            if ($cur === null) {
                return $this->outcomes->blocked($chapterId, 404, 'UNIT_NOT_FOUND', 'Unit not found.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $cur->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $unitId, 'UNIT', (int) $cur->row_version, 1, ['active' => (bool) $cur->active ? 'active' : 'inactive']));
            }
            $updates = ['row_version' => (int) $cur->row_version + 1, 'updated_at' => now()->format('Y-m-d H:i:s.u')];
            if (array_key_exists('name', $in)) {
                $name = trim((string) $in['name']);
                if ($name === '' || strlen($name) > 120) {
                    return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Invalid unit name.');
                }
                $updates['name'] = $name;
            }
            if (array_key_exists('active', $in)) {
                $updates['active'] = (bool) $in['active'];
            }
            if (array_key_exists('quantity_scale', $in)) {
                if (! is_int($in['quantity_scale']) || $in['quantity_scale'] < 0 || $in['quantity_scale'] > 6) {
                    return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'quantity_scale must be between 0 and 6.');
                }
                $updates['quantity_scale'] = $in['quantity_scale'];
            }
            try {
                DB::table('units')->where('chapter_id', $chapterId)->where('id', $unitId)->update($updates);
            } catch (QueryException $e) {
                return str_contains($e->getMessage(), 'UNIT_SCALE_FROZEN')
                    ? $this->outcomes->blocked($chapterId, 409, 'UNIT_SCALE_FROZEN', 'Unit quantity_scale is frozen because catalog items already reference it.')
                    : throw $e;
            }
            /** @var object $fresh */
            $fresh = DB::table('units')->where('id', $unitId)->first();
            $rec = ChapterOutcomes::recordState((string) $unitId, 'UNIT', (int) $fresh->row_version, 1, ['active' => (bool) $fresh->active ? 'active' : 'inactive']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.units.update', $key, $hash, 'UpdateUnit@v1', $rec,
                ['unit' => ['id' => (string) $fresh->id, 'chapter_id' => (string) $chapterId, 'code' => (string) $fresh->code,
                    'name' => (string) $fresh->name, 'quantity_scale' => (int) $fresh->quantity_scale, 'row_version' => (int) $fresh->row_version, 'active' => (bool) $fresh->active]], 200);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createItem(int $chapterId, array $actor, string $key, array $in): array
    {
        [$sku, $name, $kind, $unitRaw] = [trim((string) ($in['sku'] ?? '')), trim((string) ($in['name'] ?? '')), (string) ($in['item_kind'] ?? ''), (string) ($in['base_unit_id'] ?? '')];
        if ($sku === '' || strlen($sku) > 64 || $name === '' || strlen($name) > 160 || ! in_array($kind, self::ITEM_KINDS, true) || preg_match('/^[1-9][0-9]{0,18}$/', $unitRaw) !== 1) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check item sku, name, item_kind, and base_unit_id.');
        }
        $unit = DB::table('units')->where('chapter_id', $chapterId)->where('id', (int) $unitRaw)->first();
        if ($unit === null) {
            return $this->outcomes->blocked($chapterId, 404, 'UNIT_NOT_FOUND', 'Base unit not found in this chapter.');
        }
        try {
            $ropMicro = QuantityMath::toMicroString((string) ($in['reorder_point'] ?? '0'), (int) $unit->quantity_scale);
        } catch (InvalidArgumentException $e) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.items.create', 'CreateItem@v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $sku, $name, $kind, $unit, $ropMicro, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.items.create', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $active = (bool) ($in['active'] ?? true);
            try {
                $id = DB::table('items')->insertGetId([
                    'chapter_id' => $chapterId, 'sku' => $sku, 'name' => $name,
                    'description' => isset($in['description']) ? (string) $in['description'] : null,
                    'item_kind' => $kind, 'base_unit_id' => (int) $unit->id, 'reorder_point' => QuantityMath::microToDbString($ropMicro),
                    'row_version' => 1, 'active' => $active, 'created_at' => $now, 'updated_at' => $now,
                ]);
            } catch (QueryException) {
                return $this->outcomes->blocked($chapterId, 409, 'DUPLICATE_ITEM_SKU', 'An item with this SKU already exists in the chapter.');
            }
            $rec = ChapterOutcomes::recordState((string) $id, 'ITEM', 1, 1, ['active' => $active ? 'active' : 'inactive']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.items.create', $key, $hash, 'CreateItem@v1', $rec, ['item' => [
                'id' => (string) $id, 'chapter_id' => (string) $chapterId, 'sku' => $sku, 'name' => $name, 'item_kind' => $kind,
                'base_unit_id' => (string) $unit->id, 'reorder_point' => QuantityMath::toUnitQuantity($ropMicro, (int) $unit->quantity_scale), 'row_version' => 1, 'active' => $active,
            ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createVariant(int $chapterId, array $actor, int $itemId, string $key, array $in): array
    {
        [$code, $name] = [trim((string) ($in['variant_code'] ?? '')), trim((string) ($in['name'] ?? ''))];
        if ($code === '' || strlen($code) > 64 || $name === '' || strlen($name) > 160) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check variant_code and name.');
        }
        $attrs = $in['attributes'] ?? null;
        $attrsJson = $attrs !== null ? InventoryFingerprint::canonicalJson($attrs) : null;
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.variants.create', 'CreateVariant@v1', ['item_id' => $itemId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $itemId, $key, $hash, $code, $name, $attrs, $attrsJson, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.variants.create', $key, $hash)) !== null) {
                return $r;
            }
            if (! DB::table('items')->where('chapter_id', $chapterId)->where('id', $itemId)->exists()) {
                return $this->outcomes->blocked($chapterId, 404, 'ITEM_NOT_FOUND', 'Item not found in chapter.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $active = (bool) ($in['active'] ?? true);
            try {
                $vid = DB::table('item_variants')->insertGetId(['chapter_id' => $chapterId, 'item_id' => $itemId, 'variant_code' => $code,
                    'name' => $name, 'attributes_json' => $attrsJson, 'row_version' => 1, 'active' => $active, 'created_at' => $now, 'updated_at' => $now]);
                DB::table('item_variant_guards')->insert(['chapter_id' => $chapterId, 'item_variant_id' => $vid, 'guard_version' => 1, 'updated_at' => $now]);
            } catch (QueryException) {
                return $this->outcomes->blocked($chapterId, 409, 'DUPLICATE_VARIANT_CODE', 'This item already has a variant with that code.');
            }
            $rec = ChapterOutcomes::recordState((string) $vid, 'ITEM_VARIANT', 1, 1, ['active' => $active ? 'active' : 'inactive']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.variants.create', $key, $hash, 'CreateVariant@v1', $rec, ['variant' => [
                'id' => (string) $vid, 'chapter_id' => (string) $chapterId, 'item_id' => (string) $itemId,
                'variant_code' => $code, 'name' => $name, 'attributes' => $attrs, 'row_version' => 1, 'active' => $active, 'guard_version' => 1,
            ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createLocation(int $chapterId, array $actor, string $key, array $in): array
    {
        [$code, $name, $kind] = [trim((string) ($in['code'] ?? '')), trim((string) ($in['name'] ?? '')), (string) ($in['location_kind'] ?? 'warehouse')];
        if ($code === '' || strlen($code) > 64 || $name === '' || strlen($name) > 160 || ! in_array($kind, self::LOCATION_KINDS, true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check location code, name, and location_kind.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.locations.create', 'CreateLocation@v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $code, $name, $kind, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.locations.create', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $active = (bool) ($in['active'] ?? true);
            try {
                $id = DB::table('stock_locations')->insertGetId(['chapter_id' => $chapterId, 'code' => $code, 'name' => $name,
                    'location_kind' => $kind, 'row_version' => 1, 'active' => $active, 'created_at' => $now, 'updated_at' => $now]);
            } catch (QueryException) {
                return $this->outcomes->blocked($chapterId, 409, 'DUPLICATE_LOCATION_CODE', 'A stock location with this code already exists in the chapter.');
            }
            $rec = ChapterOutcomes::recordState((string) $id, 'STOCK_LOCATION', 1, 1, ['kind' => $kind]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.locations.create', $key, $hash, 'CreateLocation@v1', $rec,
                ['location' => ['id' => (string) $id, 'chapter_id' => (string) $chapterId, 'code' => $code, 'name' => $name, 'location_kind' => $kind, 'row_version' => 1, 'active' => $active]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function assignCustody(int $chapterId, array $actor, string $key, array $in): array
    {
        [$locRaw, $memRaw, $role] = [(string) ($in['stock_location_id'] ?? ''), (string) ($in['membership_id'] ?? ''), (string) ($in['custody_role'] ?? 'primary')];
        if (preg_match('/^[1-9][0-9]{0,18}$/', $locRaw) !== 1 || preg_match('/^[1-9][0-9]{0,18}$/', $memRaw) !== 1 || ! in_array($role, ['primary', 'deputy'], true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check stock_location_id, membership_id, and custody_role.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.custody.assign', 'AssignCustody@v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $locRaw, $memRaw, $role): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.custody.assign', $key, $hash)) !== null) {
                return $r;
            }
            $loc = DB::table('stock_locations')->where('chapter_id', $chapterId)->where('id', (int) $locRaw)->first();
            $mem = DB::table('memberships')->where('chapter_id', $chapterId)->where('id', (int) $memRaw)->where('status', 'active')->first();
            if ($loc === null || $mem === null) {
                return $this->outcomes->blocked($chapterId, 404, 'CUSTODY_TARGET_NOT_FOUND', 'Location or active chapter membership not found.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $id = DB::table('custody_assignments')->insertGetId([
                'chapter_id' => $chapterId, 'stock_location_id' => (int) $loc->id, 'membership_id' => (int) $mem->id, 'custody_role' => $role,
                'status' => 'active', 'row_version' => 1, 'assigned_by_user_id' => (int) $actor['user_id'], 'assigned_at' => $now, 'revoked_at' => null, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $rec = ChapterOutcomes::recordState((string) $id, 'CUSTODY_ASSIGNMENT', 1, 1, ['status' => 'active']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.custody.assign', $key, $hash, 'AssignCustody@v1', $rec, ['custody_assignment' => [
                'id' => (string) $id, 'chapter_id' => (string) $chapterId, 'stock_location_id' => (string) $loc->id, 'membership_id' => (string) $mem->id, 'custody_role' => $role, 'row_version' => 1, 'status' => 'active',
            ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createItemPolicyDraft(int $chapterId, array $actor, int $itemId, string $key, array $in): array
    {
        $maxHold = $in['max_hold_hours'] ?? null;
        if ($maxHold !== null && (! is_int($maxHold) || $maxHold < 1)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'max_hold_hours must be null or a positive integer.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.item_policies.draft', 'DraftItemPolicy@v1', ['item_id' => $itemId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $itemId, $key, $hash, $maxHold, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.item_policies.draft', $key, $hash)) !== null) {
                return $r;
            }
            if (! DB::table('items')->where('chapter_id', $chapterId)->where('id', $itemId)->exists()) {
                return $this->outcomes->blocked($chapterId, 404, 'ITEM_NOT_FOUND', 'Item not found in chapter.');
            }
            [$elig, $cond] = [(bool) ($in['is_eligibility_approved'] ?? true), (bool) ($in['requires_condition_check'] ?? true)];
            $settings = ['is_eligibility_approved' => $elig, 'requires_condition_check' => $cond, 'max_hold_hours' => $maxHold, 'notes' => isset($in['notes']) ? (string) $in['notes'] : null];
            $now = now()->format('Y-m-d H:i:s.u');
            $ver = ((int) DB::table('item_policy_versions')->where('chapter_id', $chapterId)->where('item_id', $itemId)->max('version_number')) + 1;
            $id = DB::table('item_policy_versions')->insertGetId([
                'chapter_id' => $chapterId, 'item_id' => $itemId, 'policy_version_id' => null, 'version_number' => $ver, 'status' => 'draft',
                'is_eligibility_approved' => $elig, 'requires_condition_check' => $cond, 'max_hold_hours' => $maxHold,
                'settings_json' => InventoryFingerprint::canonicalJson($settings), 'settings_hash' => InventoryFingerprint::sha256Binary($settings),
                'authored_by_user_id' => (int) $actor['user_id'], 'approved_by_user_id' => null, 'approved_at' => null, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $rec = ChapterOutcomes::recordState((string) $id, 'ITEM_POLICY', 1, $ver, ['approval' => 'draft']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.item_policies.draft', $key, $hash, 'DraftItemPolicy@v1', $rec, ['item_policy_version' => [
                'id' => (string) $id, 'item_id' => (string) $itemId, 'version_number' => $ver, 'status' => 'draft',
                'is_eligibility_approved' => $elig, 'requires_condition_check' => $cond, 'max_hold_hours' => $maxHold, 'authored_by_user_id' => (string) $actor['user_id'],
            ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function approveItemPolicyVersion(int $chapterId, array $actor, int $policyVersionId, string $key, array $in = []): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.item_policies.approve', 'ApproveItemPolicy@v1', ['policy_version_id' => $policyVersionId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $policyVersionId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.item_policies.approve', $key, $hash)) !== null) {
                return $r;
            }
            $row = DB::table('item_policy_versions')->where('chapter_id', $chapterId)->where('id', $policyVersionId)->lockForUpdate()->first();
            if ($row === null) {
                return $this->outcomes->blocked($chapterId, 404, 'POLICY_VERSION_NOT_FOUND', 'Item policy version not found.');
            }
            if ((int) $row->authored_by_user_id === (int) $actor['user_id']) {
                return $this->outcomes->forbidden('SELF_APPROVAL_FORBIDDEN', 'Author cannot approve their own item policy version (GOV-05).');
            }
            if ((string) $row->status !== 'draft') {
                return $this->outcomes->blocked($chapterId, 409, 'POLICY_VERSION_NOT_DRAFT', 'Only draft item policy versions can be approved.');
            }
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $row->version_number) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $policyVersionId, 'ITEM_POLICY', (int) $row->version_number, (int) $row->version_number, ['approval' => (string) $row->status]));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            DB::table('item_policy_versions')->where('chapter_id', $chapterId)->where('item_id', (int) $row->item_id)->where('status', 'approved')->update(['status' => 'retired', 'updated_at' => $now]);
            DB::table('item_policy_versions')->where('id', (int) $row->id)->update(['status' => 'approved', 'approved_by_user_id' => (int) $actor['user_id'], 'approved_at' => $now, 'updated_at' => $now]);
            DB::table('item_variant_guards as ivg')->join('item_variants as iv', 'iv.id', '=', 'ivg.item_variant_id')
                ->where('ivg.chapter_id', $chapterId)->where('iv.item_id', (int) $row->item_id)
                ->update(['ivg.guard_version' => DB::raw('ivg.guard_version + 1'), 'ivg.updated_at' => $now]);
            $rec = ChapterOutcomes::recordState((string) $row->id, 'ITEM_POLICY', (int) $row->version_number, (int) $row->version_number, ['approval' => 'approved']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.item_policies.approve', $key, $hash, 'ApproveItemPolicy@v1', $rec, ['item_policy_version' => [
                'id' => (string) $row->id, 'item_id' => (string) $row->item_id, 'version_number' => (int) $row->version_number,
                'status' => 'approved', 'is_eligibility_approved' => (bool) $row->is_eligibility_approved, 'approved_by_user_id' => (string) $actor['user_id'],
            ]], 200);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createRestriction(int $chapterId, array $actor, string $key, array $in): array
    {
        [$code, $title] = [trim((string) ($in['code'] ?? '')), trim((string) ($in['title'] ?? ''))];
        if ($code === '' || strlen($code) > 64 || $title === '' || strlen($title) > 160) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check restriction code and title.');
        }
        $rules = is_array($in['rules'] ?? null) ? $in['rules'] : [];
        $hash = ChapterOutcomes::fingerprint($chapterId, 'inventory.restrictions.create', 'CreateRestriction@v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $code, $title, $rules, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'inventory.restrictions.create', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            try {
                $rid = DB::table('restrictions')->insertGetId([
                    'chapter_id' => $chapterId, 'code' => $code, 'title' => $title,
                    'donor_reference' => isset($in['donor_reference']) ? (string) $in['donor_reference'] : null,
                    'row_version' => 1, 'created_by_user_id' => (int) $actor['user_id'], 'created_at' => $now,
                ]);
                $vid = DB::table('restriction_versions')->insertGetId([
                    'chapter_id' => $chapterId, 'restriction_id' => $rid, 'version_number' => 1, 'status' => 'active',
                    'effective_from' => isset($in['effective_from']) ? (string) $in['effective_from'] : null,
                    'effective_until' => isset($in['effective_until']) ? (string) $in['effective_until'] : null,
                    'rules_json' => InventoryFingerprint::canonicalJson($rules), 'terms_hash' => InventoryFingerprint::sha256Binary($rules),
                    'created_by_user_id' => (int) $actor['user_id'], 'created_at' => $now,
                ]);
                $map = [
                    'item_scopes' => ['restriction_item_scopes', 'item_variant_id'],
                    'event_scopes' => ['restriction_event_scopes', 'event_id'],
                    'unit_scopes' => ['restriction_unit_scopes', 'requesting_unit_id'],
                    'category_scopes' => ['restriction_category_scopes', 'priority_category_id'],
                ];
                foreach ($map as $k => [$table, $col]) {
                    foreach ((array) ($in[$k] ?? []) as $entry) {
                        $mode = is_array($entry) ? (string) ($entry['scope_mode'] ?? 'allow') : '';
                        if (is_array($entry) && in_array($mode, ['allow', 'deny'], true)) {
                            DB::table($table)->insert(['chapter_id' => $chapterId, 'restriction_version_id' => $vid, $col => (int) $entry[$col], 'scope_mode' => $mode, 'created_at' => $now]);
                        }
                    }
                }
            } catch (QueryException) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_RESTRICTION_SCOPE', 'Failed to create restriction or scope references.');
            }
            $rec = ChapterOutcomes::recordState((string) $rid, 'RESTRICTION', 1, 1, ['status' => 'active']);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'inventory.restrictions.create', $key, $hash, 'CreateRestriction@v1', $rec, ['restriction' => [
                'id' => (string) $rid, 'restriction_version_id' => (string) $vid, 'chapter_id' => (string) $chapterId, 'code' => $code, 'title' => $title, 'row_version' => 1, 'status' => 'active',
            ]], 201);
        }, 3);
    }
}
