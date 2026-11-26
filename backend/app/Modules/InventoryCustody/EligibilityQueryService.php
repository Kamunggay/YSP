<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Computes 7-view stock balances, approved item policy gates, donor restriction predicates,
 * ROP shortages, and GuardPins for chapter-scoped eligibility queries.
 */
final class EligibilityQueryService
{
    /** @param array<string, mixed> $context
     * @return array{http_status: int, body: array<string, mixed>} */
    public function query(int $chapterId, int $itemVariantId, array $context = []): array
    {
        $variant = DB::table('item_variants as iv')
            ->join('items as i', 'i.id', '=', 'iv.item_id')->join('units as u', 'u.id', '=', 'i.base_unit_id')
            ->leftJoin('item_variant_guards as ivg', fn ($j) => $j->on('ivg.item_variant_id', '=', 'iv.id')->on('ivg.chapter_id', '=', 'iv.chapter_id'))
            ->where('iv.chapter_id', $chapterId)->where('iv.id', $itemVariantId)
            ->select('iv.id as variant_id', 'iv.variant_code', 'iv.name as variant_name', 'iv.active as variant_active',
                'i.id as item_id', 'i.sku', 'i.name as item_name', 'i.item_kind', 'i.reorder_point', 'i.active as item_active',
                'u.id as unit_id', 'u.code as unit_code', 'u.quantity_scale', 'ivg.guard_version')
            ->first();
        if ($variant === null) {
            return ['http_status' => 404, 'body' => ['code' => 'variant_not_found', 'message' => 'Item variant not found in this chapter.']];
        }

        $scale = (int) $variant->quantity_scale;
        try {
            $reqMicro = QuantityMath::toMicroString((string) ($context['requested_qty'] ?? '0'), $scale);
        } catch (InvalidArgumentException $e) {
            return ['http_status' => 422, 'body' => ['code' => 'invalid_unit_precision', 'message' => $e->getMessage()]];
        }

        $policy = DB::table('item_policy_versions')->where('chapter_id', $chapterId)
            ->where('item_id', (int) $variant->item_id)->where('status', 'approved')->orderByDesc('version_number')->first();
        $polReasons = array_values(array_filter([
            ! (bool) $variant->item_active ? 'item_inactive' : null,
            ! (bool) $variant->variant_active ? 'variant_inactive' : null,
            ($policy === null || ! (bool) $policy->is_eligibility_approved) ? 'item_policy_not_approved' : null,
        ]));
        $polOk = $polReasons === [];

        $posInt = fn (string $k): ?int => preg_match('/^[1-9][0-9]{0,18}$/', (string) ($context[$k] ?? '')) === 1 ? (int) $context[$k] : null;
        [$locId, $eventId, $unitId, $catId] = [$posInt('stock_location_id'), $posInt('event_id'), $posInt('requesting_unit_id'), $posInt('priority_category_id')];
        $asOf = is_string($context['as_of'] ?? null) && $context['as_of'] !== '' ? $context['as_of'] : now()->format('Y-m-d H:i:s.u');

        $positions = DB::table('stock_positions as sp')
            ->join('stock_locations as sl', 'sl.id', '=', 'sp.stock_location_id')
            ->join('stock_conditions as sc', 'sc.id', '=', 'sp.stock_condition_id')
            ->join('stock_lots as lot', 'lot.id', '=', 'sp.stock_lot_id')
            ->where('sp.chapter_id', $chapterId)->where('sp.item_variant_id', $itemVariantId)
            ->when($locId !== null, fn ($q) => $q->where('sp.stock_location_id', $locId))
            ->orderBy('sp.id')
            ->select('sp.*', 'sl.code as location_code', 'sl.location_kind', 'sl.active as location_active',
                'sc.code as condition_code', 'sc.is_usable_for_issue', 'lot.source_kind', 'lot.restriction_version_id', 'lot.expires_at')
            ->get();

        $rMap = $this->loadRestrictions($chapterId, $positions->pluck('restriction_version_id')->filter()->map(fn ($id): int => (int) $id)->unique()->values()->all());
        $totals = array_fill_keys(['on_hand', 'reserved', 'held', 'blocked', 'available', 'eligible_available', 'dispatched', 'in_booth', 'inbound_pending'], '0');
        [$breakdown, $posVers, $blockers] = [[], [], $polReasons];

        foreach ($positions as $pos) {
            $m = [];
            foreach (['on_hand', 'reserved', 'held', 'blocked', 'dispatched', 'in_booth', 'inbound_pending'] as $k) {
                $m[$k] = QuantityMath::dbToMicroString((string) $pos->{$k.'_qty'});
                $totals[$k] = QuantityMath::add($totals[$k], $m[$k]);
            }
            $rawAvail = QuantityMath::sub($m['on_hand'], $m['blocked']);
            $totals['available'] = QuantityMath::add($totals['available'], $rawAvail);

            $pReasons = array_values(array_filter([
                ! (bool) $pos->location_active ? 'location_inactive' : null,
                ! (bool) $pos->is_usable_for_issue ? 'condition_not_usable:'.$pos->condition_code : null,
                ($pos->expires_at !== null && (string) $pos->expires_at <= $asOf) ? 'lot_expired' : null,
                $pos->restriction_version_id !== null ? $this->evalRestriction($rMap[(int) $pos->restriction_version_id] ?? null, $itemVariantId, $eventId, $unitId, $catId, $asOf) : null,
            ]));
            $eligAvail = ($polOk && $pReasons === []) ? $rawAvail : '0';
            $totals['eligible_available'] = QuantityMath::add($totals['eligible_available'], $eligAvail);
            array_push($blockers, ...$pReasons);

            $posVers[(string) $pos->id] = (int) $pos->position_version;
            $breakdown[] = [
                'stock_position_id' => (string) $pos->id, 'stock_location_id' => (string) $pos->stock_location_id,
                'location_code' => (string) $pos->location_code, 'stock_condition_id' => (string) $pos->stock_condition_id,
                'condition_code' => (string) $pos->condition_code, 'stock_lot_id' => (string) $pos->stock_lot_id,
                'position_version' => (int) $pos->position_version, 'eligible' => $polOk && $pReasons === [],
                'blocking_reasons' => array_values(array_unique($pReasons)),
                'available' => QuantityMath::toUnitQuantity($eligAvail, $scale), 'raw_available' => QuantityMath::toUnitQuantity($rawAvail, $scale),
                'held' => QuantityMath::toUnitQuantity($m['held'], $scale), 'reserved' => QuantityMath::toUnitQuantity($m['reserved'], $scale),
                'blocked' => QuantityMath::toUnitQuantity($m['blocked'], $scale),
            ];
        }

        $ropMicro = QuantityMath::dbToMicroString((string) $variant->reorder_point);
        $net = QuantityMath::add($totals['eligible_available'], $totals['inbound_pending']);
        $belowRop = QuantityMath::cmp($net, $ropMicro) < 0;
        $ropShort = $belowRop ? QuantityMath::sub($ropMicro, $net) : '0';
        $reqShort = QuantityMath::cmp($totals['eligible_available'], $reqMicro) < 0 ? QuantityMath::sub($reqMicro, $totals['eligible_available']) : '0';
        $eligReq = $polOk && QuantityMath::cmp($totals['eligible_available'], $reqMicro) >= 0 && (QuantityMath::cmp($reqMicro, '0') === 0 || QuantityMath::cmp($totals['eligible_available'], '0') > 0);
        if (QuantityMath::cmp($reqMicro, '0') > 0 && QuantityMath::cmp($totals['eligible_available'], $reqMicro) < 0) {
            $blockers[] = 'insufficient_eligible_stock';
        }

        $guardVer = (int) ($variant->guard_version ?? 1);
        $guardPin = ['variant_guard_version' => $guardVer, 'position_versions' => $posVers,
            'pin_hash' => InventoryFingerprint::sha256Hex(['variant_guard_version' => $guardVer, 'position_versions' => $posVers])];

        return ['http_status' => 200, 'body' => [
            'chapter_id' => (string) $chapterId, 'item_variant_id' => (string) $itemVariantId,
            'sku' => (string) $variant->sku, 'variant_code' => (string) $variant->variant_code,
            'unit' => ['id' => (string) $variant->unit_id, 'code' => (string) $variant->unit_code, 'quantity_scale' => $scale],
            'policy_gate' => ['approved' => $polOk, 'approved_policy_version_id' => $policy ? (string) $policy->id : null,
                'version_number' => $policy ? (int) $policy->version_number : null, 'reasons' => array_values(array_unique($polReasons))],
            'eligible' => $eligReq, 'blocking_reasons' => array_values(array_unique($blockers)),
            'views' => array_map(fn (string $v) => QuantityMath::toUnitQuantity($v, $scale), $totals),
            'reorder' => ['reorder_point' => QuantityMath::toUnitQuantity($ropMicro, $scale), 'below_reorder_point' => $belowRop,
                'reorder_shortage' => QuantityMath::toUnitQuantity($ropShort, $scale), 'requested_qty' => QuantityMath::toUnitQuantity($reqMicro, $scale),
                'request_shortage' => QuantityMath::toUnitQuantity($reqShort, $scale)],
            'guard_pin' => $guardPin, 'positions' => $breakdown,
        ]];
    }

    /** @param list<int> $ids
     * @return array<int, array<string, mixed>> */
    private function loadRestrictions(int $chapterId, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $map = [];
        foreach (DB::table('restriction_versions')->where('chapter_id', $chapterId)->whereIn('id', $ids)->get() as $ver) {
            $map[(int) $ver->id] = ['version' => $ver, 'items' => [], 'events' => [], 'units' => [], 'categories' => []];
        }
        foreach (['items' => ['restriction_item_scopes', 'item_variant_id'], 'events' => ['restriction_event_scopes', 'event_id'],
            'units' => ['restriction_unit_scopes', 'requesting_unit_id'], 'categories' => ['restriction_category_scopes', 'priority_category_id']] as $k => [$tbl, $col]) {
            foreach (DB::table($tbl)->whereIn('restriction_version_id', $ids)->get() as $row) {
                $map[(int) $row->restriction_version_id][$k][(int) $row->{$col}] = (string) $row->scope_mode;
            }
        }

        return $map;
    }

    /** @param array<string, mixed>|null $restr */
    private function evalRestriction(?array $restr, int $variantId, ?int $eventId, ?int $unitId, ?int $catId, string $asOf): ?string
    {
        if ($restr === null) {
            return 'restriction_missing';
        }
        $v = $restr['version'];
        if ((string) $v->status !== 'active') {
            return 'restriction_superseded';
        }
        if ($v->effective_from !== null && (string) $v->effective_from > $asOf) {
            return 'restriction_not_yet_effective';
        }
        if ($v->effective_until !== null && (string) $v->effective_until < $asOf) {
            return 'restriction_expired';
        }
        foreach ([['items', $variantId, 'item'], ['events', $eventId, 'event'], ['units', $unitId, 'unit'], ['categories', $catId, 'category']] as [$k, $val, $code]) {
            /** @var array<int, string> $m */
            $m = $restr[$k];
            if ($m === []) {
                continue;
            }
            if ($val !== null && ($m[$val] ?? null) === 'deny') {
                return "restriction_denied_{$code}";
            }
            if (in_array('allow', $m, true) && ($val === null || ($m[$val] ?? null) !== 'allow')) {
                return "restriction_allowlist_mismatch_{$code}";
            }
        }

        return null;
    }
}
