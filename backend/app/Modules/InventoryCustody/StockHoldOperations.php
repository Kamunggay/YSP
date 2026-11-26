<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Internal InventoryCustody boundary: stock-hold placement/clearance, disjoint [start_qty, end_qty)
 * interval reservation cells, and locked warehouse summaries for sibling consumers.
 */
final class StockHoldOperations implements InventoryLedgerParticipant
{
    public const string ACTION_CREATE_HOLD = 'inventory.record_stock_hold';

    public const string ACTION_CLEAR_HOLD = 'inventory.clear_stock_hold';

    private const array HOLD_KINDS = ['quarantine', 'inspection', 'legal_hold', 'recount', 'governance'];

    private const array CLEARANCE_KINDS = ['released', 'expired', 'consumed'];

    public function __construct(private EligibilityQueryService $eligibility, private ChapterOutcomes $outcomes) {}

    /** @param array<string, mixed> $context
     * @return array<string, mixed> */
    public function queryEligibility(int $chapterId, int $itemVariantId, array $context = []): array
    {
        return $this->eligibility->query($chapterId, $itemVariantId, $context);
    }

    public function variantScale(int $chapterId, int $variantId): ?int
    {
        $s = DB::table('item_variants as iv')->join('items as i', 'i.id', '=', 'iv.item_id')
            ->join('units as u', 'u.id', '=', 'i.base_unit_id')
            ->where('iv.chapter_id', $chapterId)->where('iv.id', $variantId)->value('u.quantity_scale');

        return $s !== null ? (int) $s : null;
    }

    /** @return array<int, array{on_hand: string, rf: string}> */
    public function warehouseSummaries(int $chapterId): array
    {
        $rows = DB::table('stock_positions as sp')
            ->join('stock_conditions as sc', 'sc.id', '=', 'sp.stock_condition_id')
            ->join('stock_locations as sl', 'sl.id', '=', 'sp.stock_location_id')
            ->where('sp.chapter_id', $chapterId)->where('sc.is_usable_for_issue', true)->where('sl.location_kind', 'warehouse')
            ->select('sp.item_variant_id', 'sp.on_hand_qty', 'sp.reserved_qty')->get();
        $out = [];
        foreach ($rows as $r) {
            $vid = (int) $r->item_variant_id;
            $cur = $out[$vid] ?? ['on_hand' => '0', 'rf' => '0'];
            $cur['on_hand'] = QuantityMath::add($cur['on_hand'], QuantityMath::dbToMicroString((string) $r->on_hand_qty));
            $cur['rf'] = QuantityMath::add($cur['rf'], QuantityMath::dbToMicroString((string) $r->reserved_qty));
            $out[$vid] = $cur;
        }

        return $out;
    }

    /** @return array{scale: int, on_hand: string, rf: string, guard_version: int}|null */
    public function lockVariantAndReadWarehouse(int $chapterId, int $variantId): ?array
    {
        $scale = $this->variantScale($chapterId, $variantId);
        if ($scale === null) {
            return null;
        }
        $guard = DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', $variantId)->lockForUpdate()->first();
        DB::table('stock_positions')->where('chapter_id', $chapterId)->where('item_variant_id', $variantId)->lockForUpdate()->get();
        $w = $this->warehouseSummaries($chapterId)[$variantId] ?? ['on_hand' => '0', 'rf' => '0'];

        return ['scale' => $scale, 'on_hand' => $w['on_hand'], 'rf' => $w['rf'], 'guard_version' => $guard ? (int) $guard->guard_version : 1];
    }

    /** @return array{id: int, item_variant_id: int, stock_lot_id: int, unit_scale: int, position_version: int, guard_version: int, on_hand_qty: string, reserved_qty: string, held_qty: string, is_usable: bool, location_kind: string, lot_code: string|null, location_code: string, condition_code: string}|null */
    public function positionSnapshot(int $chapterId, int $positionId, bool $lock = false): ?array
    {
        $pq = DB::table('stock_positions')->where('chapter_id', $chapterId)->where('id', $positionId);
        $peek = $pq->first();
        if ($peek === null) {
            return null;
        }
        $gq = DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $peek->item_variant_id);
        $g = ($lock ? $gq->lockForUpdate() : $gq)->first();
        $p = ($lock ? DB::table('stock_positions')->where('chapter_id', $chapterId)->where('id', $positionId)->lockForUpdate() : $pq)->first();
        if ($p === null) {
            return null;
        }
        $sc = DB::table('stock_conditions')->where('id', (int) $p->stock_condition_id)->first();
        $sl = DB::table('stock_locations')->where('id', (int) $p->stock_location_id)->first();

        return [
            'id' => (int) $p->id, 'item_variant_id' => (int) $p->item_variant_id, 'stock_lot_id' => (int) $p->stock_lot_id, 'unit_scale' => (int) $p->unit_scale,
            'position_version' => (int) $p->position_version, 'guard_version' => $g ? (int) $g->guard_version : 1,
            'on_hand_qty' => (string) $p->on_hand_qty, 'reserved_qty' => (string) $p->reserved_qty, 'held_qty' => (string) $p->held_qty,
            'is_usable' => $sc ? (bool) $sc->is_usable_for_issue : false, 'location_kind' => $sl ? (string) $sl->location_kind : 'warehouse',
            'lot_code' => null, 'location_code' => $sl ? (string) $sl->code : '', 'condition_code' => $sc ? (string) $sc->code : '',
        ];
    }

    /** @return list<array{id: int, item_variant_id: int, stock_lot_id: int, unit_scale: int, position_version: int, on_hand_qty: string, reserved_qty: string, held_qty: string, blocked_qty: string, lot_code: string|null, location_code: string, condition_code: string, item_name: string, intervals: list<array<string, mixed>>}> */
    public function usableWarehousePositions(int $chapterId, ?int $variantId = null): array
    {
        $rows = DB::table('stock_positions as sp')
            ->join('item_variants as iv', 'iv.id', '=', 'sp.item_variant_id')->join('items as i', 'i.id', '=', 'iv.item_id')
            ->join('stock_conditions as sc', 'sc.id', '=', 'sp.stock_condition_id')
            ->join('stock_locations as sl', 'sl.id', '=', 'sp.stock_location_id')
            ->where('sp.chapter_id', $chapterId)->where('sc.is_usable_for_issue', true)->where('sl.location_kind', 'warehouse')
            ->when($variantId !== null, fn ($q) => $q->where('sp.item_variant_id', $variantId))
            ->orderBy('sp.id')
            ->select('sp.id', 'sp.item_variant_id', 'sp.stock_lot_id', 'sp.unit_scale', 'sp.position_version', 'sp.on_hand_qty', 'sp.reserved_qty', 'sp.held_qty', 'sp.blocked_qty', 'sl.code as location_code', 'sc.code as condition_code', 'i.name as item_name')
            ->get();

        $cellsByPos = DB::table('stock_coverage_live as scl')
            ->leftJoin('stock_coverage_reservation_links as scrl', 'scrl.stock_coverage_cell_id', '=', 'scl.id')
            ->where('scl.chapter_id', $chapterId)->orderBy('scl.start_qty')
            ->select('scl.stock_position_id', 'scl.start_qty', 'scl.end_qty', 'scl.reservation_count', 'scl.hold_count', 'scrl.reservation_ref')
            ->get()->groupBy('stock_position_id');

        return array_values($rows->map(function (object $r) use ($cellsByPos): array {
            $scale = (int) $r->unit_scale;
            $onHand = QuantityMath::dbToMicroString((string) $r->on_hand_qty);
            $cells = $cellsByPos->get((int) $r->id) ?? collect();
            $intervals = [];
            if ($cells->isEmpty() && QuantityMath::cmp($onHand, '0') > 0) {
                $intervals[] = ['start' => '0', 'end' => QuantityMath::microToWireString($onHand, $scale), 'state' => 'free', 'reservation_id' => null];
            } else {
                foreach ($cells as $c) {
                    $intervals[] = [
                        'start' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $c->start_qty), $scale),
                        'end' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $c->end_qty), $scale),
                        'state' => ((int) $c->reservation_count > 0 || (int) $c->hold_count > 0) ? 'reserved' : 'free',
                        'reservation_id' => $c->reservation_ref ? (string) $c->reservation_ref : null,
                    ];
                }
            }

            return [
                'id' => (int) $r->id, 'item_variant_id' => (int) $r->item_variant_id, 'stock_lot_id' => (int) $r->stock_lot_id, 'unit_scale' => $scale,
                'position_version' => (int) $r->position_version, 'on_hand_qty' => (string) $r->on_hand_qty,
                'reserved_qty' => (string) $r->reserved_qty, 'held_qty' => (string) $r->held_qty, 'blocked_qty' => (string) $r->blocked_qty,
                'lot_code' => null,
                'location_code' => (string) $r->location_code, 'condition_code' => (string) $r->condition_code,
                'item_name' => (string) $r->item_name, 'intervals' => $intervals,
            ];
        })->all());
    }

    /** @return list<array{variant_id: int, sku: string, item_name: string, variant_code: string, unit_scale: int, on_hand_qty: string, reserved_qty: string, is_usable_for_issue: bool, location_kind: string}> */
    public function allStockPositionSummaries(int $chapterId): array
    {
        return array_values(DB::table('stock_positions as sp')
            ->join('item_variants as iv', 'iv.id', '=', 'sp.item_variant_id')
            ->join('items as i', 'i.id', '=', 'iv.item_id')
            ->join('stock_conditions as sc', 'sc.id', '=', 'sp.stock_condition_id')
            ->join('stock_locations as sl', 'sl.id', '=', 'sp.stock_location_id')
            ->where('sp.chapter_id', $chapterId)
            ->select('sp.item_variant_id', 'sp.unit_scale', 'sp.on_hand_qty', 'sp.reserved_qty', 'sc.is_usable_for_issue', 'sl.location_kind', 'i.sku', 'i.name as item_name', 'iv.variant_code')
            ->get()
            ->map(fn (object $r): array => [
                'variant_id' => (int) $r->item_variant_id, 'sku' => (string) $r->sku, 'item_name' => (string) $r->item_name,
                'variant_code' => (string) $r->variant_code, 'unit_scale' => (int) $r->unit_scale,
                'on_hand_qty' => (string) $r->on_hand_qty, 'reserved_qty' => (string) $r->reserved_qty,
                'is_usable_for_issue' => (bool) $r->is_usable_for_issue, 'location_kind' => (string) $r->location_kind,
            ])->all());
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function recordStockHold(int $chapterId, array $actor, string $idempotencyKey, array $in): array
    {
        if (preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $idempotencyKey) !== 1) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key header is required (1..128 safe chars).');
        }
        [$vRaw, $pRaw, $kind, $reason, $qtyObj] = [(string) ($in['item_variant_id'] ?? ''), (string) ($in['stock_position_id'] ?? ''), (string) ($in['hold_kind'] ?? ''), trim((string) ($in['reason'] ?? '')), is_array($in['quantity'] ?? null) ? $in['quantity'] : null];
        if (preg_match('/^[1-9][0-9]{0,18}$/', $vRaw) !== 1 || preg_match('/^[1-9][0-9]{0,18}$/', $pRaw) !== 1 || ! in_array($kind, self::HOLD_KINDS, true)
            || $reason === '' || strlen($reason) > 255 || ! is_string($qtyObj['value'] ?? null) || ! is_int($qtyObj['quantity_scale'] ?? null)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check item_variant_id, stock_position_id, hold_kind, reason, and quantity.');
        }
        try {
            $scale = $qtyObj['quantity_scale'];
            QuantityMath::assertValidScale($scale);
            $qtyMicro = QuantityMath::toMicroString($qtyObj['value'], $scale);
            $startRaw = $in['coverage_start_qty'] ?? null;
            if ($startRaw !== null && ! is_string($startRaw)) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'coverage_start_qty must be a decimal string.');
            }
            $explicitStart = $startRaw !== null ? QuantityMath::toMicroString($startRaw, $scale) : null;
        } catch (InvalidArgumentException $e) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
        }
        if (QuantityMath::cmp($qtyMicro, '0') <= 0) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_QUANTITY', 'Hold quantity must be greater than zero.');
        }

        $canonical = [
            'chapter_id' => (string) $chapterId, 'item_variant_id' => $vRaw, 'stock_position_id' => $pRaw, 'hold_kind' => $kind, 'reason' => $reason,
            'quantity' => ['value' => QuantityMath::microToWireString($qtyMicro, $scale), 'quantity_scale' => $scale],
            'expires_at' => isset($in['expires_at']) ? (string) $in['expires_at'] : null,
            'coverage_start_qty' => $explicitStart !== null ? QuantityMath::microToWireString($explicitStart, $scale) : null,
            'expected_position_version' => isset($in['expected_position_version']) ? (int) $in['expected_position_version'] : null,
            'expected_variant_guard_version' => isset($in['expected_variant_guard_version']) ? (int) $in['expected_variant_guard_version'] : null,
        ];
        $hash = ChapterOutcomes::fingerprint($chapterId, self::ACTION_CREATE_HOLD, 'RecordHoldInput@urn:ysp:stock-holds:v1', $canonical);

        return DB::transaction(function () use ($chapterId, $actor, $idempotencyKey, $hash, $vRaw, $pRaw, $kind, $reason, $scale, $qtyMicro, $explicitStart, $canonical): array {
            if (($replay = $this->outcomes->replay($chapterId, self::ACTION_CREATE_HOLD, $idempotencyKey, $hash)) !== null) {
                return $replay;
            }
            [$vid, $pid] = [(int) $vRaw, (int) $pRaw];
            $guard = DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', $vid)->lockForUpdate()->first();
            $pos = DB::table('stock_positions')->where('chapter_id', $chapterId)->where('id', $pid)->where('item_variant_id', $vid)->lockForUpdate()->first();
            if ($guard === null || $pos === null) {
                return $this->outcomes->blocked($chapterId, 404, 'STOCK_POSITION_NOT_FOUND', 'Stock position or variant guard not found in this chapter.');
            }
            if ((int) $pos->unit_scale !== $scale) {
                return $this->outcomes->blocked($chapterId, 422, 'UNIT_SCALE_MISMATCH', 'Submitted quantity_scale does not match item base unit scale.');
            }
            if (($canonical['expected_variant_guard_version'] !== null && (int) $guard->guard_version !== $canonical['expected_variant_guard_version'])
                || ($canonical['expected_position_version'] !== null && (int) $pos->position_version !== $canonical['expected_position_version'])) {
                return $this->stalePin($chapterId, $guard, $pos);
            }

            $onHand = QuantityMath::dbToMicroString((string) $pos->on_hand_qty);
            $now = now()->format('Y-m-d H:i:s.u');
            $this->loadAndNormalizeCells($chapterId, $vid, $pid, $onHand, $now);

            $intervals = [];
            if ($explicitStart !== null) {
                $end = QuantityMath::add($explicitStart, $qtyMicro);
                if (QuantityMath::cmp($end, $onHand) > 0) {
                    return $this->outcomes->blocked($chapterId, 422, 'INSUFFICIENT_ON_HAND_FOR_HOLD', 'Requested interval exceeds position on-hand quantity.');
                }
                $intervals[] = ['start' => $explicitStart, 'end' => $end];
            } else {
                $rem = $qtyMicro;
                $cells = DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $pid)->orderBy('start_qty')->get()->all();
                $unheld = array_values(array_filter($cells, fn (object $c): bool => (int) $c->hold_count === 0));
                usort($unheld, fn (object $a, object $b): int => ((int) $a->reservation_count > 0 ? 1 : 0) <=> ((int) $b->reservation_count > 0 ? 1 : 0)
                    ?: QuantityMath::cmp(QuantityMath::dbToMicroString((string) $a->start_qty), QuantityMath::dbToMicroString((string) $b->start_qty)));
                foreach ($unheld as $c) {
                    if (QuantityMath::cmp($rem, '0') <= 0) {
                        break;
                    }
                    $cs = QuantityMath::dbToMicroString((string) $c->start_qty);
                    $take = QuantityMath::min($rem, QuantityMath::sub(QuantityMath::dbToMicroString((string) $c->end_qty), $cs));
                    $intervals[] = ['start' => $cs, 'end' => QuantityMath::add($cs, $take)];
                    $rem = QuantityMath::sub($rem, $take);
                }
                if (QuantityMath::cmp($rem, '0') > 0) {
                    return $this->outcomes->blocked($chapterId, 422, 'INSUFFICIENT_UNHELD_STOCK', 'Available un-held on-hand stock is smaller than the requested hold quantity.');
                }
            }

            $opPublicId = InventoryFingerprint::newPublicId();
            $attemptId = $this->outcomes->beginAttempt($chapterId, (int) $actor['user_id'], self::ACTION_CREATE_HOLD, $idempotencyKey, $hash, 'RecordHoldInput@urn:ysp:stock-holds:v1', $opPublicId, $now);
            $holdPublicId = InventoryFingerprint::newPublicId();
            $holdId = DB::table('stock_holds')->insertGetId([
                'public_id' => $holdPublicId, 'chapter_id' => $chapterId, 'item_variant_id' => $vid, 'stock_position_id' => $pid,
                'hold_kind' => $kind, 'reason' => $reason, 'quantity' => QuantityMath::microToDbString($qtyMicro), 'unit_scale' => $scale,
                'status' => 'active', 'row_version' => 1, 'expires_at' => $canonical['expires_at'], 'created_by_user_id' => (int) $actor['user_id'],
                'attempt_id' => $attemptId, 'created_at' => $now, 'updated_at' => $now,
            ]);

            $cellIds = $this->applyCoverageIntervals($chapterId, $vid, $pid, $intervals, 'hold_count', 'stock_hold_cells',
                fn (int $cellId): array => ['chapter_id' => $chapterId, 'stock_hold_id' => $holdId, 'stock_coverage_cell_id' => $cellId, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now], $now);
            $sum = $this->recomputePositionBalances($chapterId, $vid, $pid, $now);

            $rec = ChapterOutcomes::recordState((string) $holdId, 'STOCK_HOLD', 1, 1, ['state' => 'active', 'hold_kind' => $kind]);
            $data = [
                'hold_id' => (string) $holdId, 'hold_public_id' => $holdPublicId, 'hold_row_version' => 1, 'state' => 'active',
                'reason' => $reason, 'affected_cell_ids' => array_map('strval', $cellIds),
                'physical_quantity_changed' => false, 'condition_changed' => false, 'movement_ids' => [],
                'hold' => ['id' => (string) $holdId, 'public_id' => $holdPublicId, 'chapter_id' => (string) $chapterId, 'item_variant_id' => (string) $vid,
                    'stock_position_id' => (string) $pid, 'hold_kind' => $kind, 'reason' => $reason, 'status' => 'active', 'row_version' => 1,
                    'quantity' => QuantityMath::toUnitQuantity($qtyMicro, $scale), 'covered_cell_count' => count($cellIds)],
                'position_balances' => ['on_hand' => QuantityMath::toUnitQuantity($onHand, $scale), 'reserved' => QuantityMath::toUnitQuantity($sum['reserved'], $scale),
                    'held' => QuantityMath::toUnitQuantity($sum['held'], $scale), 'blocked' => QuantityMath::toUnitQuantity($sum['blocked'], $scale),
                    'available' => QuantityMath::toUnitQuantity(QuantityMath::sub($onHand, $sum['blocked']), $scale)],
                'guards' => ['variant_id' => (string) $vid, 'eligibility_version' => $sum['variant_guard_version'], 'position_versions' => [['position_id' => (string) $pid, 'row_version' => $sum['position_version']]]],
            ];
            $env = $this->outcomes->successEnvelope($chapterId, $opPublicId, self::ACTION_CREATE_HOLD, $idempotencyKey, $now, $rec, $data);

            return $this->outcomes->finishAttempt($chapterId, $attemptId, $actor, self::ACTION_CREATE_HOLD, $env, 201, $now);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function clearStockHold(int $chapterId, array $actor, string $idempotencyKey, array $in): array
    {
        if (preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $idempotencyKey) !== 1) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key header is required (1..128 safe chars).');
        }
        [$holdRef, $kind, $reason] = [trim((string) ($in['hold_id'] ?? '')), (string) ($in['clearance_kind'] ?? 'released'), isset($in['reason']) ? trim((string) $in['reason']) : null];
        if ($holdRef === '' || ! in_array($kind, self::CLEARANCE_KINDS, true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Check hold_id and clearance_kind (released|expired|consumed).');
        }

        $canonical = ['chapter_id' => (string) $chapterId, 'hold_id' => $holdRef, 'clearance_kind' => $kind, 'reason' => $reason,
            'expected_hold_row_version' => isset($in['expected_hold_row_version']) ? (int) $in['expected_hold_row_version'] : (isset($in['expected_row_version']) ? (int) $in['expected_row_version'] : null),
            'expected_position_version' => isset($in['expected_position_version']) ? (int) $in['expected_position_version'] : null,
            'expected_variant_guard_version' => isset($in['expected_variant_guard_version']) ? (int) $in['expected_variant_guard_version'] : null];
        $hash = ChapterOutcomes::fingerprint($chapterId, self::ACTION_CLEAR_HOLD, 'ClearHoldInput@urn:ysp:stock-holds:v1', $canonical);

        return DB::transaction(function () use ($chapterId, $actor, $idempotencyKey, $hash, $holdRef, $kind, $reason, $canonical): array {
            if (($replay = $this->outcomes->replay($chapterId, self::ACTION_CLEAR_HOLD, $idempotencyKey, $hash)) !== null) {
                return $replay;
            }
            $lookup = DB::table('stock_holds')->where('chapter_id', $chapterId)
                ->where(fn ($q) => ctype_digit($holdRef) ? $q->where('public_id', $holdRef)->orWhere('id', (int) $holdRef) : $q->where('public_id', $holdRef))->first();
            if ($lookup === null) {
                return $this->outcomes->blocked($chapterId, 404, 'HOLD_NOT_FOUND', 'Stock hold not found in this chapter.');
            }
            [$vid, $pid] = [(int) $lookup->item_variant_id, (int) $lookup->stock_position_id];
            $guard = DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', $vid)->lockForUpdate()->first();
            $pos = DB::table('stock_positions')->where('chapter_id', $chapterId)->where('id', $pid)->lockForUpdate()->first();
            DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $pid)->orderBy('start_qty')->lockForUpdate()->get();
            $hold = DB::table('stock_holds')->where('chapter_id', $chapterId)->where('id', (int) $lookup->id)->lockForUpdate()->first();
            if ($guard === null || $pos === null || $hold === null) {
                return $this->outcomes->blocked($chapterId, 404, 'HOLD_NOT_FOUND', 'Stock hold or backing position not found.');
            }
            if (($canonical['expected_hold_row_version'] !== null && (int) $hold->row_version !== $canonical['expected_hold_row_version'])
                || ($canonical['expected_variant_guard_version'] !== null && (int) $guard->guard_version !== $canonical['expected_variant_guard_version'])
                || ($canonical['expected_position_version'] !== null && (int) $pos->position_version !== $canonical['expected_position_version'])) {
                return $this->stalePin($chapterId, $guard, $pos, (int) $hold->id, (int) $hold->row_version);
            }
            if ((string) $hold->status !== 'active') {
                return $this->outcomes->blocked($chapterId, 409, 'HOLD_ALREADY_CLEARED', 'Stock hold has already reached a terminal clearance state.', [], 'review_record', 'Review cleared stock hold');
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $opPublicId = InventoryFingerprint::newPublicId();
            $attemptId = $this->outcomes->beginAttempt($chapterId, (int) $actor['user_id'], self::ACTION_CLEAR_HOLD, $idempotencyKey, $hash, 'ClearHoldInput@urn:ysp:stock-holds:v1', $opPublicId, $now);
            $activeCells = DB::table('stock_hold_cells')->where('chapter_id', $chapterId)->where('stock_hold_id', (int) $hold->id)->where('is_active', true)->pluck('stock_coverage_cell_id')->map(fn ($id): int => (int) $id)->all();
            if ($activeCells !== []) {
                DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->whereIn('id', $activeCells)
                    ->update(['hold_count' => DB::raw('CASE WHEN hold_count > 0 THEN hold_count - 1 ELSE 0 END'), 'row_version' => DB::raw('row_version + 1'), 'updated_at' => $now]);
                DB::table('stock_hold_cells')->where('chapter_id', $chapterId)->where('stock_hold_id', (int) $hold->id)->where('is_active', true)->update(['is_active' => false, 'updated_at' => $now]);
            }
            $newHoldVer = (int) $hold->row_version + 1;
            DB::table('stock_holds')->where('id', (int) $hold->id)->update(['status' => $kind, 'row_version' => $newHoldVer, 'updated_at' => $now]);
            DB::table('stock_hold_clearances')->insert([
                'chapter_id' => $chapterId, 'stock_hold_id' => (int) $hold->id, 'clearance_kind' => $kind, 'reason' => $reason,
                'cleared_by_user_id' => (int) $actor['user_id'], 'attempt_id' => $attemptId, 'cleared_at' => $now,
            ]);

            $sum = $this->recomputePositionBalances($chapterId, $vid, $pid, $now);
            $onHand = QuantityMath::dbToMicroString((string) $pos->on_hand_qty);
            $scale = (int) $pos->unit_scale;
            $rec = ChapterOutcomes::recordState((string) $hold->id, 'STOCK_HOLD', $newHoldVer, 1, ['state' => 'cleared', 'clearance_kind' => $kind]);
            $data = [
                'hold_id' => (string) $hold->id, 'hold_row_version' => $newHoldVer, 'state' => 'cleared',
                'reason' => $reason ?? $kind, 'affected_cell_ids' => array_map('strval', $activeCells),
                'physical_quantity_changed' => false, 'condition_changed' => false, 'movement_ids' => [],
                'hold' => ['id' => (string) $hold->id, 'public_id' => (string) $hold->public_id, 'chapter_id' => (string) $chapterId,
                    'item_variant_id' => (string) $vid, 'stock_position_id' => (string) $pid, 'status' => $kind, 'clearance_kind' => $kind, 'row_version' => $newHoldVer],
                'position_balances' => ['on_hand' => QuantityMath::toUnitQuantity($onHand, $scale), 'reserved' => QuantityMath::toUnitQuantity($sum['reserved'], $scale),
                    'held' => QuantityMath::toUnitQuantity($sum['held'], $scale), 'blocked' => QuantityMath::toUnitQuantity($sum['blocked'], $scale),
                    'available' => QuantityMath::toUnitQuantity(QuantityMath::sub($onHand, $sum['blocked']), $scale)],
                'guards' => ['variant_id' => (string) $vid, 'eligibility_version' => $sum['variant_guard_version'], 'position_versions' => [['position_id' => (string) $pid, 'row_version' => $sum['position_version']]]],
            ];
            $env = $this->outcomes->successEnvelope($chapterId, $opPublicId, self::ACTION_CLEAR_HOLD, $idempotencyKey, $now, $rec, $data);

            return $this->outcomes->finishAttempt($chapterId, $attemptId, $actor, self::ACTION_CLEAR_HOLD, $env, 200, $now);
        }, 3);
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    public function lookupUncertainAttempt(int $chapterId, string $actionCode, string $idempotencyKey): array
    {
        $attempt = DB::table('inventory_operation_attempts')->where('chapter_id', $chapterId)
            ->where('action_code', $actionCode)->where('idempotency_key', $idempotencyKey)->first();
        $op = $attempt !== null ? DB::table('inventory_operations')->where('attempt_id', (int) $attempt->id)->first() : null;
        if ($attempt === null || $op === null) {
            return ['http_status' => 200, 'body' => [
                'schema_version' => '1.0', 'chapter_id' => (string) $chapterId, 'action_result' => 'uncertain',
                'operation' => ['identity' => ['operation_id' => $attempt !== null ? (string) $attempt->public_id : null, 'action_code' => $actionCode, 'idempotency_key' => $idempotencyKey], 'outcome' => 'unknown', 'committed_at' => null, 'replayed' => false],
                'record' => null, 'field_feedback' => [],
                'blocking_reason' => ['code' => 'NO_VISIBLE_TERMINAL_RESULT', 'message' => 'No authorized terminal result is visible. The original request may still be in flight; failure is not established.'],
                'permitted_next_actions' => [['code' => 'lookup_operation', 'label' => 'Check this chapter and action using the original key'], ['code' => 'reconcile_activity', 'label' => 'Preserve and reconcile any actual physical activity']],
                'input_policy' => 'preserve', 'lookup_state' => 'pending_or_not_visible',
            ]];
        }

        /** @var array<string, mixed> $snap */
        $snap = json_decode((string) $op->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        if (is_array($snap['operation'] ?? null)) {
            $snap['operation']['replayed'] = true;
        }
        $snap['input_policy'] = 'may_clear';

        return ['http_status' => 200, 'body' => $snap];
    }

    /**
     * Reserves a free disjoint interval [start, start+qty) without modifying on_hand_qty.
     *
     * @return array{cell_ids: list<int>, summary: array{reserved: string, held: string, blocked: string, position_version: int, variant_guard_version: int}}|null
     */
    public function reserveInterval(int $chapterId, int $variantId, int $positionId, string $startMicro, string $qtyMicro, string $resRef, string $now): ?array
    {
        $pos = DB::table('stock_positions')->where('chapter_id', $chapterId)->where('id', $positionId)->lockForUpdate()->first();
        if ($pos === null) {
            return null;
        }
        $onHand = QuantityMath::dbToMicroString((string) $pos->on_hand_qty);
        $endMicro = QuantityMath::add($startMicro, $qtyMicro);
        if (QuantityMath::cmp($endMicro, $onHand) > 0) {
            return null;
        }

        $cells = $this->loadAndNormalizeCells($chapterId, $variantId, $positionId, $onHand, $now);
        foreach ($cells as $c) {
            $cs = QuantityMath::dbToMicroString((string) $c->start_qty);
            $ce = QuantityMath::dbToMicroString((string) $c->end_qty);
            if (QuantityMath::cmp($ce, $startMicro) > 0 && QuantityMath::cmp($cs, $endMicro) < 0 && ((int) $c->reservation_count > 0 || (int) $c->hold_count > 0)) {
                return null;
            }
        }

        $cellIds = $this->applyCoverageIntervals($chapterId, $variantId, $positionId, [['start' => $startMicro, 'end' => $endMicro]],
            'reservation_count', 'stock_coverage_reservation_links',
            fn (int $cellId): array => ['chapter_id' => $chapterId, 'stock_coverage_cell_id' => $cellId, 'reservation_ref' => $resRef, 'created_at' => $now], $now);

        return ['cell_ids' => $cellIds, 'summary' => $this->recomputePositionBalances($chapterId, $variantId, $positionId, $now)];
    }

    public function releaseReservationByRef(int $chapterId, int $variantId, int $positionId, string $resRef, string $now): void
    {
        $cellIds = DB::table('stock_coverage_reservation_links')->where('chapter_id', $chapterId)->where('reservation_ref', $resRef)
            ->pluck('stock_coverage_cell_id')->map(fn ($i): int => (int) $i)->all();
        if ($cellIds !== []) {
            DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->whereIn('id', $cellIds)
                ->update(['reservation_count' => DB::raw('CASE WHEN reservation_count > 0 THEN reservation_count - 1 ELSE 0 END'), 'row_version' => DB::raw('row_version + 1'), 'updated_at' => $now]);
            DB::table('stock_coverage_reservation_links')->where('chapter_id', $chapterId)->where('reservation_ref', $resRef)->delete();
        }
        $this->recomputePositionBalances($chapterId, $variantId, $positionId, $now);
    }

    public function blockedOverlapByRef(int $chapterId, string $resRef): string
    {
        $total = '0';
        $rows = DB::table('stock_coverage_reservation_links as scrl')
            ->join('stock_coverage_live as scl', 'scl.id', '=', 'scrl.stock_coverage_cell_id')
            ->where('scrl.chapter_id', $chapterId)->where('scrl.reservation_ref', $resRef)->where('scl.hold_count', '>', 0)
            ->select('scl.start_qty', 'scl.end_qty')->get();
        foreach ($rows as $c) {
            $total = QuantityMath::add($total, QuantityMath::sub(QuantityMath::dbToMicroString((string) $c->end_qty), QuantityMath::dbToMicroString((string) $c->start_qty)));
        }

        return $total;
    }

    /** @return list<object> */
    public function loadAndNormalizeCells(int $chapterId, int $variantId, int $positionId, string $onHand, string $now): array
    {
        $existing = DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $positionId)->orderBy('start_qty')->lockForUpdate()->get()->all();
        [$cursor, $inserted] = ['0', false];
        foreach ($existing as $cell) {
            $cs = QuantityMath::dbToMicroString((string) $cell->start_qty);
            if (QuantityMath::cmp($cs, $cursor) > 0) {
                DB::table('stock_coverage_live')->insert(['chapter_id' => $chapterId, 'item_variant_id' => $variantId, 'stock_position_id' => $positionId,
                    'start_qty' => QuantityMath::microToDbString($cursor), 'end_qty' => QuantityMath::microToDbString($cs), 'reservation_count' => 0, 'hold_count' => 0, 'row_version' => 1, 'updated_at' => $now]);
                $inserted = true;
            }
            $cursor = QuantityMath::max($cursor, QuantityMath::dbToMicroString((string) $cell->end_qty));
        }
        if (QuantityMath::cmp($cursor, $onHand) < 0) {
            DB::table('stock_coverage_live')->insert(['chapter_id' => $chapterId, 'item_variant_id' => $variantId, 'stock_position_id' => $positionId,
                'start_qty' => QuantityMath::microToDbString($cursor), 'end_qty' => QuantityMath::microToDbString($onHand), 'reservation_count' => 0, 'hold_count' => 0, 'row_version' => 1, 'updated_at' => $now]);
            $inserted = true;
        }

        return ! $inserted ? $existing : DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $positionId)->orderBy('start_qty')->lockForUpdate()->get()->all();
    }

    /**
     * @param  list<array{start: string, end: string}>  $intervals
     * @param  callable(int): array<string, mixed>  $linkRow
     * @return list<int>
     */
    private function applyCoverageIntervals(int $chapterId, int $variantId, int $positionId, array $intervals, string $col, string $linkTable, callable $linkRow, string $now): array
    {
        $covered = [];
        foreach ($intervals as $interval) {
            [$ts, $te] = [$interval['start'], $interval['end']];
            $cells = DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $positionId)->orderBy('start_qty')->lockForUpdate()->get();
            foreach ($cells as $c) {
                [$cs, $ce] = [QuantityMath::dbToMicroString((string) $c->start_qty), QuantityMath::dbToMicroString((string) $c->end_qty)];
                if (QuantityMath::cmp($ce, $ts) <= 0 || QuantityMath::cmp($cs, $te) >= 0) {
                    continue;
                }
                $pts = [$cs];
                foreach ([$ts, $te] as $p) {
                    if (QuantityMath::cmp($p, $cs) > 0 && QuantityMath::cmp($p, $ce) < 0) {
                        $pts[] = $p;
                    }
                }
                $pts[] = $ce;
                $pieces = [];
                if (count($pts) === 2) {
                    $pieces[] = ['id' => (int) $c->id, 'start' => $cs, 'end' => $ce];
                } else {
                    DB::table('stock_coverage_live')->where('id', (int) $c->id)->update(['end_qty' => QuantityMath::microToDbString($pts[1]), 'row_version' => DB::raw('row_version + 1'), 'updated_at' => $now]);
                    $pieces[] = ['id' => (int) $c->id, 'start' => $pts[0], 'end' => $pts[1]];
                    $holdLinks = DB::table('stock_hold_cells')->where('chapter_id', $chapterId)->where('stock_coverage_cell_id', (int) $c->id)->where('is_active', true)->pluck('stock_hold_id')->all();
                    $resLinks = DB::table('stock_coverage_reservation_links')->where('chapter_id', $chapterId)->where('stock_coverage_cell_id', (int) $c->id)->pluck('reservation_ref')->all();
                    for ($i = 1; $i < count($pts) - 1; $i++) {
                        $nid = DB::table('stock_coverage_live')->insertGetId([
                            'chapter_id' => $chapterId, 'item_variant_id' => $variantId, 'stock_position_id' => $positionId,
                            'start_qty' => QuantityMath::microToDbString($pts[$i]), 'end_qty' => QuantityMath::microToDbString($pts[$i + 1]),
                            'reservation_count' => (int) $c->reservation_count, 'hold_count' => (int) $c->hold_count, 'row_version' => 1, 'updated_at' => $now,
                        ]);
                        foreach ($holdLinks as $hid) {
                            DB::table('stock_hold_cells')->insert(['chapter_id' => $chapterId, 'stock_hold_id' => (int) $hid, 'stock_coverage_cell_id' => $nid, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
                        }
                        foreach ($resLinks as $rRef) {
                            DB::table('stock_coverage_reservation_links')->insert(['chapter_id' => $chapterId, 'stock_coverage_cell_id' => $nid, 'reservation_ref' => (string) $rRef, 'created_at' => $now]);
                        }
                        $pieces[] = ['id' => $nid, 'start' => $pts[$i], 'end' => $pts[$i + 1]];
                    }
                }
                foreach ($pieces as $piece) {
                    if (QuantityMath::cmp($piece['start'], $ts) >= 0 && QuantityMath::cmp($piece['end'], $te) <= 0) {
                        DB::table('stock_coverage_live')->where('id', $piece['id'])->update([$col => DB::raw("{$col} + 1"), 'row_version' => DB::raw('row_version + 1'), 'updated_at' => $now]);
                        DB::table($linkTable)->insert($linkRow($piece['id']));
                        $covered[] = $piece['id'];
                    }
                }
            }
        }

        return array_values(array_unique($covered));
    }

    /** @return array{reserved: string, held: string, blocked: string, position_version: int, variant_guard_version: int} */
    private function recomputePositionBalances(int $chapterId, int $variantId, int $positionId, string $now): array
    {
        [$reserved, $held, $blocked] = ['0', '0', '0'];
        foreach (DB::table('stock_coverage_live')->where('chapter_id', $chapterId)->where('stock_position_id', $positionId)->get() as $c) {
            $len = QuantityMath::sub(QuantityMath::dbToMicroString((string) $c->end_qty), QuantityMath::dbToMicroString((string) $c->start_qty));
            if ((int) $c->reservation_count > 0) {
                $reserved = QuantityMath::add($reserved, $len);
            }
            if ((int) $c->hold_count > 0) {
                $held = QuantityMath::add($held, $len);
            }
            if ((int) $c->reservation_count > 0 || (int) $c->hold_count > 0) {
                $blocked = QuantityMath::add($blocked, $len);
            }
        }
        DB::table('stock_positions')->where('id', $positionId)->update([
            'reserved_qty' => QuantityMath::microToDbString($reserved), 'held_qty' => QuantityMath::microToDbString($held),
            'blocked_qty' => QuantityMath::microToDbString($blocked), 'position_version' => DB::raw('position_version + 1'), 'updated_at' => $now,
        ]);
        DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', $variantId)
            ->update(['guard_version' => DB::raw('guard_version + 1'), 'updated_at' => $now]);

        return [
            'reserved' => $reserved, 'held' => $held, 'blocked' => $blocked,
            'position_version' => (int) DB::table('stock_positions')->where('id', $positionId)->value('position_version'),
            'variant_guard_version' => (int) DB::table('item_variant_guards')->where('chapter_id', $chapterId)->where('item_variant_id', $variantId)->value('guard_version'),
        ];
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    private function stalePin(int $chapterId, object $guard, object $pos, ?int $holdId = null, int $holdVer = 1): array
    {
        $rec = ChapterOutcomes::recordState((string) ($holdId ?? $pos->id), $holdId !== null ? 'STOCK_HOLD' : 'STOCK_POSITION', $holdVer, 1, [
            'variant_guard_version' => (string) $guard->guard_version,
            'position_version' => (string) $pos->position_version,
        ]);

        return $this->outcomes->stale($chapterId, $rec, 'STALE_GUARD_PIN', 'Stock position or variant policy changed since your last eligibility read. Re-query before retrying.');
    }
}
